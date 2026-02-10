const { app, BrowserWindow, ipcMain, dialog } = require('electron')
const path = require('path')
const fs = require('fs')
const { spawn } = require('child_process')

let mainWindow

function getSettingsPath() {
  return path.join(app.getPath('userData'), 'settings.json')
}

function readAppSettings() {
  const defaults = {
    manimPath: '',
    aiProvider: 'openai', // 'openai' or 'anthropic'
    openaiBaseUrl: 'https://api.openai.com',
    openaiModel: 'gpt-4o-mini',
    openaiApiKey: '',
    anthropicApiKey: '',
    anthropicModel: 'claude-sonnet-4-5',
  }
  try {
    const p = getSettingsPath()
    if (!fs.existsSync(p)) return defaults
    const raw = fs.readFileSync(p, 'utf-8')
    const parsed = JSON.parse(raw)
    return { ...defaults, ...parsed }
  } catch {
    return defaults
  }
}

function maskKey(key) {
  if (!key) return ''
  const k = String(key).trim()
  if (k.length <= 8) return '********'
  return `${k.slice(0, 3)}…${k.slice(-3)}`
}

function publicSettings(settings) {
  return {
    manimPath: settings.manimPath || '',
    aiProvider: settings.aiProvider || 'openai',
    openaiBaseUrl: settings.openaiBaseUrl || 'https://api.openai.com',
    openaiModel: settings.openaiModel || 'gpt-4o-mini',
    openaiApiKeyPresent: !!(settings.openaiApiKey && String(settings.openaiApiKey).trim()),
    openaiApiKeyMasked: settings.openaiApiKey ? maskKey(settings.openaiApiKey) : '',
    anthropicApiKey: '',
    anthropicApiKeyPresent: !!(settings.anthropicApiKey && String(settings.anthropicApiKey).trim()),
    anthropicApiKeyMasked: settings.anthropicApiKey ? maskKey(settings.anthropicApiKey) : '',
    anthropicModel: settings.anthropicModel || 'claude-sonnet-4-5',
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  // In development, load from Vite dev server
  if (process.env.NODE_ENV !== 'production') {
    mainWindow.loadURL('http://localhost:5173')
    mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }
}

app.whenReady().then(createWindow)

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})

ipcMain.handle('get-app-settings', async () => {
  return publicSettings(readAppSettings())
})

ipcMain.handle('update-app-settings', async (event, partial) => {
  const cur = readAppSettings()
  const next = { ...cur }

  if (partial && typeof partial === 'object') {
    if (typeof partial.manimPath === 'string') next.manimPath = partial.manimPath.trim()
    if (typeof partial.aiProvider === 'string' && ['openai', 'anthropic'].includes(partial.aiProvider)) {
      next.aiProvider = partial.aiProvider
    }
    if (typeof partial.openaiBaseUrl === 'string') next.openaiBaseUrl = partial.openaiBaseUrl.trim() || 'https://api.openai.com'
    if (typeof partial.openaiModel === 'string') next.openaiModel = partial.openaiModel.trim() || 'gpt-4o-mini'
    if (typeof partial.anthropicModel === 'string') next.anthropicModel = partial.anthropicModel.trim() || 'claude-sonnet-4-5'

    // Only update keys when user provides a value (including explicit empty string to clear)
    if (Object.prototype.hasOwnProperty.call(partial, 'openaiApiKey')) {
      next.openaiApiKey = typeof partial.openaiApiKey === 'string' ? partial.openaiApiKey.trim() : ''
    }
    if (Object.prototype.hasOwnProperty.call(partial, 'anthropicApiKey')) {
      next.anthropicApiKey = typeof partial.anthropicApiKey === 'string' ? partial.anthropicApiKey.trim() : ''
    }
  }

  try {
    const p = getSettingsPath()
    fs.writeFileSync(p, JSON.stringify(next, null, 2))
  } catch {
    // ignore
  }

  return publicSettings(next)
})

// IPC Handlers for file operations
ipcMain.handle('save-project', async (event, projectData) => {
  const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
    title: 'Save Project',
    defaultPath: 'project.json',
    filters: [{ name: 'JSON Files', extensions: ['json'] }]
  })
  
  if (!canceled && filePath) {
    fs.writeFileSync(filePath, JSON.stringify(projectData, null, 2))
    return { success: true, path: filePath }
  }
  return { success: false }
})

ipcMain.handle('load-project', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
    title: 'Open Project',
    filters: [{ name: 'JSON Files', extensions: ['json'] }],
    properties: ['openFile']
  })
  
  if (!canceled && filePaths.length > 0) {
    const content = fs.readFileSync(filePaths[0], 'utf-8')
    return { success: true, data: JSON.parse(content), path: filePaths[0] }
  }
  return { success: false }
})

ipcMain.handle('export-mp4', async (event, outputPath) => {
  const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
    title: 'Export MP4',
    defaultPath: 'animation.mp4',
    filters: [{ name: 'MP4 Video', extensions: ['mp4'] }]
  })
  
  if (!canceled && filePath) {
    // Copy the rendered video to the chosen location
    if (fs.existsSync(outputPath)) {
      fs.copyFileSync(outputPath, filePath)
      return { success: true, path: filePath }
    }
  }
  return { success: false }
})

// Render Manim scene
ipcMain.handle('render-manim', async (event, { pythonCode, sceneName, quality }) => {
  const tempDir = path.join(app.getPath('temp'), 'manim-interactive')
  const sceneFile = path.join(tempDir, 'scene.py')
  const mediaDir = path.join(tempDir, 'media')
  
  // Ensure temp directory exists
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true })
  }
  
  // Write the Python code to a temp file
  fs.writeFileSync(sceneFile, pythonCode)
  
  // Determine quality flag
  const qualityFlag = quality === 'low' ? '-ql' : quality === 'medium' ? '-qm' : '-qh'

  const settings = readAppSettings()
  const envManim = process.env.MANIM_PATH && String(process.env.MANIM_PATH).trim()

  // Legacy default (your local dev env) as final fallback
  const legacyManimEnvPath = path.join(
    process.env.HOME || '/Users/yigeyuan',
    'Documents/Cursor Code/Manim/manim-ce-env/bin/manim'
  )

  const configured = settings.manimPath && String(settings.manimPath).trim()
  const candidate = configured || envManim || (fs.existsSync(legacyManimEnvPath) ? legacyManimEnvPath : 'manim')
  const manimCmd = candidate
  
  mainWindow.webContents.send('render-log', `Using Manim at: ${manimCmd}\n`)
  mainWindow.webContents.send('render-log', `Scene file: ${sceneFile}\n`)
  mainWindow.webContents.send('render-log', `Scene name: ${sceneName}\n`)
  mainWindow.webContents.send('render-log', `Running: ${manimCmd} ${qualityFlag} ${sceneFile} ${sceneName}\n\n`)
  
  return new Promise((resolve) => {
    const manimProcess = spawn(manimCmd, [qualityFlag, sceneFile, sceneName, '--media_dir', mediaDir], {
      cwd: tempDir,
      env: { ...process.env }
    })
    
    let logs = ''
    let errorLogs = ''
    
    manimProcess.stdout.on('data', (data) => {
      const text = data.toString()
      logs += text
      mainWindow.webContents.send('render-log', text)
    })
    
    manimProcess.stderr.on('data', (data) => {
      const text = data.toString()
      errorLogs += text
      mainWindow.webContents.send('render-log', text)
    })
    
    manimProcess.on('close', (code) => {
      mainWindow.webContents.send('render-log', `\nManim exited with code: ${code}\n`)
      
      if (code === 0) {
        // Find the output video file - Manim puts it in videos/<filename>/<quality>/
        const qualityDir = quality === 'low' ? '480p15' : quality === 'medium' ? '720p30' : '1080p60'
        const videoPath = path.join(mediaDir, 'videos', 'scene', qualityDir, `${sceneName}.mp4`)
        
        mainWindow.webContents.send('render-log', `Looking for video at: ${videoPath}\n`)
        
        if (fs.existsSync(videoPath)) {
          mainWindow.webContents.send('render-log', `Video found! Opening preview...\n`)
          resolve({ success: true, videoPath, logs })
        } else {
          // Try to find the video in other locations
          const possiblePaths = [
            path.join(mediaDir, 'videos', 'scene', qualityDir, `${sceneName}.mp4`),
            path.join(tempDir, 'media', 'videos', 'scene', qualityDir, `${sceneName}.mp4`),
          ]
          
          // Also search recursively for any mp4 file
          const findMp4 = (dir) => {
            if (!fs.existsSync(dir)) return null
            const files = fs.readdirSync(dir, { withFileTypes: true })
            for (const file of files) {
              const fullPath = path.join(dir, file.name)
              if (file.isDirectory()) {
                const found = findMp4(fullPath)
                if (found) return found
              } else if (file.name.endsWith('.mp4')) {
                return fullPath
              }
            }
            return null
          }
          
          const foundVideo = findMp4(mediaDir)
          if (foundVideo) {
            mainWindow.webContents.send('render-log', `Found video at: ${foundVideo}\n`)
            resolve({ success: true, videoPath: foundVideo, logs })
          } else {
            mainWindow.webContents.send('render-log', `Video not found. Checked: ${videoPath}\n`)
            resolve({ success: false, error: 'Video file not found after render', logs })
          }
        }
      } else {
        resolve({ success: false, error: errorLogs || 'Render failed with code ' + code, logs })
      }
    })
    
    manimProcess.on('error', (err) => {
      mainWindow.webContents.send('render-log', `Error spawning Manim: ${err.message}\n`)
      resolve({ success: false, error: err.message, logs })
    })
  })
})

function extractFirstJsonObject(text) {
  if (!text || typeof text !== 'string') return null
  const s = text.trim()
  if (!s) return null
  // Fast path: entire response is JSON
  if (s.startsWith('{') || s.startsWith('[')) {
    try { return JSON.parse(s) } catch { /* continue */ }
  }
  // Try to find a JSON object/array substring
  const firstBrace = s.indexOf('{')
  const firstBracket = s.indexOf('[')
  let start = -1
  if (firstBrace >= 0 && firstBracket >= 0) start = Math.min(firstBrace, firstBracket)
  else start = Math.max(firstBrace, firstBracket)
  if (start < 0) return null

  const sub = s.slice(start)
  // Heuristic: try progressively shorter suffixes by scanning for matching end
  for (let end = sub.length; end > 1; end--) {
    const candidate = sub.slice(0, end).trim()
    const last = candidate[candidate.length - 1]
    if (last !== '}' && last !== ']') continue
    try { return JSON.parse(candidate) } catch { /* keep trying */ }
  }
  return null
}

async function callOpenAIChat({ apiKey, baseUrl, model, messages }) {
  const root = (baseUrl || 'https://api.openai.com').replace(/\/+$/, '')
  const url = `${root}/v1/chat/completions`
  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.2,
    }),
  })
  if (!resp.ok) {
    const t = await resp.text().catch(() => '')
    throw new Error(`OpenAI request failed (${resp.status}): ${t || resp.statusText}`)
  }
  const data = await resp.json()
  const content = data?.choices?.[0]?.message?.content
  if (!content) throw new Error('OpenAI returned empty content')
  return content
}

async function callAnthropicChat({ apiKey, model, messages }) {
  const url = 'https://api.anthropic.com/v1/messages'
  
  // Convert OpenAI-style messages to Anthropic format
  // Anthropic requires system message separate from conversation
  let systemText = ''
  const conversationMessages = []
  
  for (const msg of messages) {
    if (msg.role === 'system') {
      systemText = msg.content
    } else {
      conversationMessages.push({
        role: msg.role === 'assistant' ? 'assistant' : 'user',
        content: msg.content,
      })
    }
  }
  
  const body = {
    model,
    max_tokens: 4096,
    temperature: 0.2,
    messages: conversationMessages,
  }
  // System prompt can be a string or array; use string for simplicity
  if (systemText) body.system = systemText
  
  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(body),
  })
  
  if (!resp.ok) {
    const t = await resp.text().catch(() => '')
    throw new Error(`Anthropic request failed (${resp.status}): ${t || resp.statusText}`)
  }
  
  const data = await resp.json()
  // Anthropic returns content as array of blocks
  const textBlock = (data?.content || []).find(b => b.type === 'text')
  const content = textBlock?.text
  if (!content) throw new Error('Anthropic returned empty content')
  return content
}

// ═══════════════════════════════════════════════════════════════════
// AI Multi-Agent Pipeline
// ═══════════════════════════════════════════════════════════════════

// ── Shared helpers ──────────────────────────────────────────────

function getAICredentials() {
  const settings = readAppSettings()
  const provider = settings.aiProvider || 'openai'
  if (provider === 'anthropic') {
    const apiKey = (process.env.ANTHROPIC_API_KEY && String(process.env.ANTHROPIC_API_KEY).trim())
      || (settings.anthropicApiKey && String(settings.anthropicApiKey).trim())
    return { provider, apiKey, model: settings.anthropicModel || 'claude-sonnet-4-5' }
  }
  const apiKey = (process.env.OPENAI_API_KEY && String(process.env.OPENAI_API_KEY).trim())
    || (settings.openaiApiKey && String(settings.openaiApiKey).trim())
  return {
    provider, apiKey,
    model: settings.openaiModel || 'gpt-4o-mini',
    baseUrl: settings.openaiBaseUrl || 'https://api.openai.com',
  }
}

async function llmChat(messages) {
  const creds = getAICredentials()
  if (!creds.apiKey) throw new Error(`No API key set for ${creds.provider}. Set it in AI settings.`)
  if (creds.provider === 'anthropic') {
    return callAnthropicChat({ apiKey: creds.apiKey, model: creds.model, messages })
  }
  return callOpenAIChat({ apiKey: creds.apiKey, baseUrl: creds.baseUrl, model: creds.model, messages })
}

function sendProgress(phase, message) {
  try { mainWindow?.webContents?.send('agent-progress', { phase, message }) } catch { /* noop */ }
}

// ── Code library ────────────────────────────────────────────────

function getLibraryPath() {
  return path.join(app.getPath('userData'), 'code-library.json')
}

function readLibrary() {
  try {
    const p = getLibraryPath()
    if (!fs.existsSync(p)) return { snippets: [] }
    return JSON.parse(fs.readFileSync(p, 'utf-8'))
  } catch { return { snippets: [] } }
}

function writeLibrary(lib) {
  try { fs.writeFileSync(getLibraryPath(), JSON.stringify(lib, null, 2)) } catch { /* noop */ }
}

function searchLibrary(prompt) {
  const lib = readLibrary()
  if (!lib.snippets?.length) return []
  const words = prompt.toLowerCase().split(/\s+/).filter(w => w.length > 2)
  return lib.snippets
    .map(s => {
      const haystack = `${s.prompt} ${s.description} ${(s.tags || []).join(' ')}`.toLowerCase()
      const score = words.reduce((acc, w) => acc + (haystack.includes(w) ? 1 : 0), 0)
      return { ...s, _score: score }
    })
    .filter(s => s._score > 0)
    .sort((a, b) => b._score - a._score)
    .slice(0, 3)
}

function addToLibrary(entry) {
  const lib = readLibrary()
  lib.snippets.push({
    id: require('crypto').randomUUID(),
    prompt: entry.prompt || '',
    description: entry.description || '',
    tags: entry.tags || [],
    pythonCode: entry.pythonCode || '',
    sceneName: entry.sceneName || '',
    mode: entry.mode || 'python',
    ops: entry.ops || null,
    createdAt: new Date().toISOString(),
  })
  // Keep library manageable
  if (lib.snippets.length > 200) lib.snippets = lib.snippets.slice(-200)
  writeLibrary(lib)
}

// ── GitHub Manim search ─────────────────────────────────────────

const _searchCache = new Map()

async function searchManimExamples(searchTerms) {
  if (!searchTerms?.length) return []
  const cacheKey = searchTerms.sort().join('|')
  if (_searchCache.has(cacheKey)) return _searchCache.get(cacheKey)

  const results = []
  try {
    const q = encodeURIComponent(searchTerms.join(' ') + ' language:python')
    const url = `https://api.github.com/search/code?q=${q}+repo:ManimCommunity/manim+repo:3b1b/manim&per_page=5`
    const resp = await fetch(url, {
      headers: { 'Accept': 'application/vnd.github.v3+json', 'User-Agent': 'ManimInteractive/0.1' },
    })
    if (!resp.ok) {
      // Rate limited or error; return empty
      _searchCache.set(cacheKey, [])
      return []
    }
    const data = await resp.json()
    for (const item of (data.items || []).slice(0, 3)) {
      try {
        const rawUrl = item.html_url
          ?.replace('github.com', 'raw.githubusercontent.com')
          ?.replace('/blob/', '/')
        if (!rawUrl) continue
        const fileResp = await fetch(rawUrl, {
          headers: { 'User-Agent': 'ManimInteractive/0.1' },
        })
        if (fileResp.ok) {
          const code = await fileResp.text()
          // Only keep reasonably sized files
          if (code.length < 15000) {
            results.push({ name: item.name, path: item.path, code: code.slice(0, 8000) })
          }
        }
      } catch { /* skip individual file errors */ }
    }
  } catch { /* search failed, continue without examples */ }

  _searchCache.set(cacheKey, results)
  return results
}

// ── Internal Manim renderer ─────────────────────────────────────

function renderManimInternal({ pythonCode, sceneName, quality = 'low' }) {
  const tempDir = path.join(app.getPath('temp'), 'manim-interactive-agent')
  const sceneFile = path.join(tempDir, 'scene.py')
  const mediaDir = path.join(tempDir, 'media')
  if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true })
  fs.writeFileSync(sceneFile, pythonCode)

  const qualityFlag = quality === 'low' ? '-ql' : quality === 'medium' ? '-qm' : '-qh'
  const settings = readAppSettings()
  const envManim = process.env.MANIM_PATH && String(process.env.MANIM_PATH).trim()
  const legacyManimEnvPath = path.join(
    process.env.HOME || '/Users/yigeyuan',
    'Documents/Cursor Code/Manim/manim-ce-env/bin/manim'
  )
  const configured = settings.manimPath && String(settings.manimPath).trim()
  const manimCmd = configured || envManim || (fs.existsSync(legacyManimEnvPath) ? legacyManimEnvPath : 'manim')

  sendProgress('rendering', `Rendering with Manim...`)

  return new Promise((resolve) => {
    const proc = spawn(manimCmd, [qualityFlag, sceneFile, sceneName, '--media_dir', mediaDir], {
      cwd: tempDir, env: { ...process.env },
    })
    let logs = '', errorLogs = ''
    proc.stdout.on('data', d => { logs += d.toString() })
    proc.stderr.on('data', d => { errorLogs += d.toString() })

    proc.on('close', (code) => {
      if (code === 0) {
        const qualityDir = quality === 'low' ? '480p15' : quality === 'medium' ? '720p30' : '1080p60'
        const videoPath = path.join(mediaDir, 'videos', 'scene', qualityDir, `${sceneName}.mp4`)
        const findMp4 = (dir) => {
          if (!fs.existsSync(dir)) return null
          for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
            const fp = path.join(dir, f.name)
            if (f.isDirectory()) { const r = findMp4(fp); if (r) return r }
            else if (f.name.endsWith('.mp4')) return fp
          }
          return null
        }
        const found = fs.existsSync(videoPath) ? videoPath : findMp4(mediaDir)
        if (found) {
          const buffer = fs.readFileSync(found)
          resolve({ success: true, videoBase64: buffer.toString('base64'), videoPath: found, logs })
        } else {
          resolve({ success: false, error: 'Video file not found after render', logs })
        }
      } else {
        resolve({ success: false, error: errorLogs || `Render failed (exit ${code})`, logs })
      }
    })
    proc.on('error', (err) => resolve({ success: false, error: err.message, logs }))
  })
}

// ── Pipeline stages ─────────────────────────────────────────────

const OPS_PROPERTY_SCHEMA = `
IMPORTANT - Object property names the canvas renderer expects:
- Shapes (rectangle, circle, triangle, polygon): fill (hex color e.g. "#3b82f6"), stroke (hex), strokeWidth (number), opacity (0-1), x, y, rotation
- circle: also radius (number)
- rectangle: also width, height
- line, arrow: x, y, x2, y2, stroke (hex), strokeWidth
- arc: x, y, x2, y2, cx, cy, stroke (hex), strokeWidth
- dot: radius, fill (hex)
- text: text (string), fontSize (number), fill (hex)
- latex: latex (string), fill (hex)
- axes: xRange {min,max,step}, yRange {min,max,step}
- graph: formula (string using x, e.g. "x^2"), axesId (id of axes object)

CRITICAL: Use "fill" for fill color, "stroke" for stroke/border color. Do NOT use "fillColor", "strokeColor", "color". Colors must be hex strings like "#3b82f6".

Example circle: {"type":"circle","x":0,"y":0,"radius":1.5,"fill":"#3b82f6","stroke":"#ffffff","strokeWidth":2,"opacity":1}
Example text:   {"type":"text","x":0,"y":2,"text":"Hello","fontSize":48,"fill":"#ffffff"}
`.trim()

async function classifyPrompt(prompt) {
  sendProgress('classifying', 'Analyzing prompt...')
  const sys = `You classify user prompts for a Manim animation editor.
Return ONLY a JSON object: {"mode":"ops"|"python","searchTerms":["term1","term2"]}
- "ops" mode: simple requests like adding/moving/coloring single objects, changing text, basic property changes.
- "python" mode: complex animations, math visualizations, multi-step animations, transforms, anything requiring custom Manim code (derivatives, integrals, 3D, morphing, etc.).
searchTerms: 2-4 short search queries useful for finding Manim code examples on GitHub (only for python mode, empty array for ops mode).
No markdown, no explanation.`

  const content = await llmChat([
    { role: 'system', content: sys },
    { role: 'user', content: prompt },
  ])
  const parsed = extractFirstJsonObject(content)
  if (parsed?.mode === 'python' || parsed?.mode === 'ops') return parsed
  // Default to ops for safety
  return { mode: 'ops', searchTerms: [] }
}

async function generateOps({ prompt, project, activeSceneId }) {
  sendProgress('generating', 'Generating animation...')

  const allowedObjectTypes = [
    'rectangle','triangle','circle','line','arc','arrow','dot','polygon','text','latex',
    'axes','graph','graphCursor','tangentLine','limitProbe','valueLabel',
  ]

  const system = [
    'You are an in-app agent for a Manim animation editor.',
    'You must output ONLY a single JSON object with keys: summary (string) and ops (array). No markdown, no code fences.',
    'Your ops must be small patches to an existing project JSON. Do NOT output Python.',
    'Prefer editing/adding objects inside the active scene.',
    'Allowed op types: addObject, updateObject, deleteObject, addKeyframe, setSceneDuration, renameScene, addScene, deleteScene.',
    `Allowed object types: ${allowedObjectTypes.join(', ')}.`,
    '',
    OPS_PROPERTY_SCHEMA,
    '',
    'Safety constraints:',
    '- Never introduce arbitrary code strings in formulas. Formulas must be standard math using x and basic functions: sin, cos, tan, exp, log/ln, sqrt, abs, pi, e.',
    '- Keep changes minimal and deterministic.',
  ].join('\n')

  const user = [
    'USER PROMPT:', prompt.trim(), '',
    'CONTEXT (project JSON):', JSON.stringify({ activeSceneId, project }, null, 2),
  ].join('\n')

  const content = await llmChat([
    { role: 'system', content: system },
    { role: 'user', content: user },
  ])

  const parsed = extractFirstJsonObject(content)
  if (!parsed || typeof parsed !== 'object') throw new Error('Agent did not return valid JSON.')
  return {
    summary: typeof parsed.summary === 'string' ? parsed.summary : '',
    ops: Array.isArray(parsed.ops) ? parsed.ops : [],
  }
}

async function generatePython({ prompt, project, activeSceneId, libraryMatches, onlineExamples }) {
  sendProgress('generating', 'Generating Manim Python code...')

  let contextSection = ''
  if (libraryMatches?.length) {
    contextSection += '\n\nPREVIOUSLY SUCCESSFUL CODE FROM LOCAL LIBRARY (use as reference):\n'
    for (const m of libraryMatches.slice(0, 2)) {
      contextSection += `\n--- "${m.prompt}" ---\n${m.pythonCode}\n`
    }
  }
  if (onlineExamples?.length) {
    contextSection += '\n\nREFERENCE EXAMPLES FROM MANIM REPOSITORIES:\n'
    for (const ex of onlineExamples.slice(0, 2)) {
      contextSection += `\n--- ${ex.name} (${ex.path}) ---\n${ex.code.slice(0, 3000)}\n`
    }
  }

  const system = [
    'You are an expert Manim Community Edition (CE) Python developer.',
    'Generate a COMPLETE, self-contained Manim CE Python script that implements the user\'s request.',
    'Rules:',
    '- Import from manim: `from manim import *`',
    '- Define exactly ONE Scene class.',
    '- Use only standard Manim CE APIs (Community Edition, NOT 3b1b original).',
    '- The animation should be visually polished with appropriate colors, positioning, and timing.',
    '- Include self.play() calls with appropriate animations (Create, FadeIn, Transform, etc.).',
    '- Include self.wait() calls for pacing.',
    '',
    'Output ONLY a JSON object: {"summary":"what this does","sceneName":"MyScene","pythonCode":"from manim import *\\n..."}',
    'The pythonCode must be a complete, runnable Python string. No markdown, no code fences around the JSON.',
    contextSection,
  ].join('\n')

  const user = [
    'USER PROMPT:', prompt.trim(), '',
    'Current project context (for reference):', JSON.stringify({ activeSceneId, project }, null, 2),
  ].join('\n')

  const content = await llmChat([
    { role: 'system', content: system },
    { role: 'user', content: user },
  ])

  const parsed = extractFirstJsonObject(content)
  if (!parsed || !parsed.pythonCode) throw new Error('Agent did not return valid Python code.')
  return {
    summary: parsed.summary || '',
    sceneName: parsed.sceneName || 'GeneratedScene',
    pythonCode: parsed.pythonCode,
  }
}

async function reviewOutput({ prompt, mode, result }) {
  sendProgress('reviewing', 'Reviewing quality...')

  const reviewSystem = [
    'You are a quality reviewer for a Manim animation editor.',
    'You receive the user\'s original prompt and the generated output.',
    'Check that the output CORRECTLY implements the user\'s request.',
    '',
    mode === 'ops' ? [
      'The output is JSON ops for the editor.',
      OPS_PROPERTY_SCHEMA,
      'Verify: correct object types, colors match description (as hex), positions make sense, property names are correct.',
      'Return a JSON object: {"approved":true/false,"corrections":"explanation of changes if any","summary":"...","ops":[corrected ops array]}',
    ].join('\n') : [
      'The output is Manim CE Python code.',
      'Verify: code is syntactically valid, uses correct Manim CE API, colors/shapes/animations match the user\'s description.',
      'Return a JSON object: {"approved":true/false,"corrections":"explanation of changes if any","summary":"...","sceneName":"...","pythonCode":"corrected code if needed"}',
    ].join('\n'),
    '',
    'If the output is correct, return it unchanged with approved:true.',
    'If you make corrections, set approved:false and explain in corrections field.',
    'No markdown, no code fences around the JSON.',
  ].join('\n')

  const reviewUser = [
    'ORIGINAL USER PROMPT:', prompt, '',
    'GENERATED OUTPUT:', JSON.stringify(result, null, 2),
  ].join('\n')

  const content = await llmChat([
    { role: 'system', content: reviewSystem },
    { role: 'user', content: reviewUser },
  ])

  const parsed = extractFirstJsonObject(content)
  if (!parsed) return result // If reviewer fails to parse, use original
  return {
    summary: parsed.summary || result.summary || '',
    ...(mode === 'ops'
      ? { ops: Array.isArray(parsed.ops) ? parsed.ops : result.ops }
      : { sceneName: parsed.sceneName || result.sceneName, pythonCode: parsed.pythonCode || result.pythonCode }),
    corrections: parsed.corrections || null,
    approved: parsed.approved !== false,
  }
}

// ── Main pipeline IPC handler ───────────────────────────────────

ipcMain.handle('agent-generate', async (event, payload) => {
  try {
    const prompt = payload?.prompt
    const project = payload?.project
    const activeSceneId = payload?.activeSceneId
    const previousResult = payload?.previousResult || null // For "Edit" follow-ups

    if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
      return { success: false, error: 'Missing prompt' }
    }
    if (!project || typeof project !== 'object') {
      return { success: false, error: 'Missing project' }
    }

    // Validate credentials early
    const creds = getAICredentials()
    if (!creds.apiKey) {
      return { success: false, error: `No API key set for ${creds.provider}. Set it in AI settings.` }
    }

    // ── Stage 1: Classify ──
    const classification = await classifyPrompt(prompt)
    const mode = classification.mode

    let generatorResult

    if (mode === 'python') {
      // ── Stage 2a: Search library + online ──
      sendProgress('searching', 'Searching for examples...')
      const libraryMatches = searchLibrary(prompt)
      let onlineExamples = []
      if (classification.searchTerms?.length) {
        try {
          onlineExamples = await searchManimExamples(classification.searchTerms)
        } catch { /* continue without online examples */ }
      }

      // ── Stage 3a: Generate Python ──
      const effectivePrompt = previousResult
        ? `Previous result context:\n${JSON.stringify(previousResult, null, 2)}\n\nUser follow-up: ${prompt}`
        : prompt

      generatorResult = await generatePython({
        prompt: effectivePrompt, project, activeSceneId, libraryMatches, onlineExamples,
      })
    } else {
      // ── Stage 3b: Generate Ops ──
      const effectivePrompt = previousResult
        ? `Previous result context:\n${JSON.stringify(previousResult, null, 2)}\n\nUser follow-up: ${prompt}`
        : prompt

      generatorResult = await generateOps({ prompt: effectivePrompt, project, activeSceneId })
    }

    // ── Stage 4: Review ──
    const reviewed = await reviewOutput({ prompt, mode, result: generatorResult })

    // ── Stage 5: Auto-render ──
    sendProgress('rendering', 'Rendering preview...')
    let renderResult

    if (mode === 'python') {
      renderResult = await renderManimInternal({
        pythonCode: reviewed.pythonCode,
        sceneName: reviewed.sceneName,
      })

      // One auto-fix attempt if render fails
      if (!renderResult.success) {
        sendProgress('fixing', 'Fixing render error...')
        const fixContent = await llmChat([
          { role: 'system', content: 'The following Manim CE Python code failed to render. Fix the error and return ONLY a JSON object: {"sceneName":"...","pythonCode":"corrected code"}. No markdown.' },
          { role: 'user', content: `CODE:\n${reviewed.pythonCode}\n\nERROR:\n${renderResult.error}` },
        ])
        const fixed = extractFirstJsonObject(fixContent)
        if (fixed?.pythonCode) {
          reviewed.pythonCode = fixed.pythonCode
          if (fixed.sceneName) reviewed.sceneName = fixed.sceneName
          sendProgress('rendering', 'Re-rendering after fix...')
          renderResult = await renderManimInternal({
            pythonCode: reviewed.pythonCode,
            sceneName: reviewed.sceneName,
          })
        }
      }
    } else {
      // For ops mode: we need to generate Manim code from the ops to render a preview.
      // Apply ops to a temp copy of the project, then use codegen.
      // We import the codegen module dynamically since it's an ES module in the renderer.
      // Instead, we build minimal Manim code from the ops directly.
      renderResult = await renderOpsPreview({ ops: reviewed.ops, project, activeSceneId })
    }

    return {
      success: true,
      mode,
      summary: reviewed.summary || '',
      corrections: reviewed.corrections || null,
      videoBase64: renderResult?.success ? renderResult.videoBase64 : null,
      renderError: renderResult?.success ? null : renderResult?.error,
      // Internal data (not shown to user, used when Apply is clicked)
      _ops: mode === 'ops' ? reviewed.ops : null,
      _pythonCode: mode === 'python' ? reviewed.pythonCode : null,
      _sceneName: mode === 'python' ? reviewed.sceneName : null,
    }
  } catch (e) {
    return { success: false, error: e?.message || String(e) }
  }
})

// Render a preview from ops by building minimal Manim code
async function renderOpsPreview({ ops, project, activeSceneId }) {
  // Build a simple Manim scene from the ops
  // Apply ops conceptually: collect addObject ops and build a scene
  const objects = []
  for (const op of (ops || [])) {
    if (op.type === 'addObject' && op.object) {
      objects.push(op.object)
    }
  }
  // Also include existing objects from the project scene
  const scene = project?.scenes?.find(s => s.id === activeSceneId) || project?.scenes?.[0]
  if (scene?.objects) {
    for (const obj of scene.objects) objects.push(obj)
  }

  if (!objects.length) {
    return { success: false, error: 'No objects to render' }
  }

  // Ask the LLM to generate a quick Manim script that renders these objects
  const sys = `Convert this list of objects into a minimal Manim CE Python script that shows them all.
Return ONLY JSON: {"sceneName":"Preview","pythonCode":"from manim import *\\n..."}
Use Create/FadeIn animations. Keep it simple. No markdown.`

  const content = await llmChat([
    { role: 'system', content: sys },
    { role: 'user', content: JSON.stringify(objects, null, 2) },
  ])

  const parsed = extractFirstJsonObject(content)
  if (!parsed?.pythonCode) {
    return { success: false, error: 'Failed to generate preview code from ops' }
  }

  return renderManimInternal({
    pythonCode: parsed.pythonCode,
    sceneName: parsed.sceneName || 'Preview',
  })
}

// ── Library save (called after user clicks Apply) ───────────────

ipcMain.handle('library-add', async (event, entry) => {
  try {
    addToLibrary(entry)
    return { success: true }
  } catch (e) {
    return { success: false, error: e?.message || String(e) }
  }
})

ipcMain.handle('library-search', async (event, prompt) => {
  try {
    return { success: true, results: searchLibrary(prompt || '') }
  } catch (e) {
    return { success: false, results: [] }
  }
})

// Keep the old handler as a fallback
ipcMain.handle('agent-generate-ops', async (event, payload) => {
  // Redirect to new pipeline
  return ipcMain.emit('agent-generate', event, payload)
})

// Get video file as base64 for playback in renderer
ipcMain.handle('get-video-data', async (event, videoPath) => {
  if (fs.existsSync(videoPath)) {
    const buffer = fs.readFileSync(videoPath)
    return { success: true, data: buffer.toString('base64') }
  }
  return { success: false }
})

