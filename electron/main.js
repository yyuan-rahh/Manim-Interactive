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

// ── Library search with Jaccard similarity + coverage scoring ──

const SEARCH_STOPWORDS = new Set([
  'the', 'and', 'how', 'for', 'with', 'into', 'that', 'this', 'from',
  'are', 'was', 'were', 'been', 'has', 'have', 'had', 'does', 'did',
  'will', 'would', 'could', 'should', 'may', 'might', 'can', 'shall',
  'animate', 'animation', 'show', 'create', 'make', 'get', 'set',
  'using', 'use', 'like', 'also', 'about', 'just', 'more', 'when',
  'what', 'which', 'where', 'who', 'whom', 'why', 'not', 'all',
  'each', 'every', 'both', 'few', 'some', 'any', 'most', 'other',
  'than', 'then', 'very', 'its', 'let', 'say', 'see', 'way',
  'want', 'need', 'try', 'please', 'add', 'put', 'give',
])

function extractKeywords(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2 && !SEARCH_STOPWORDS.has(w))
}

function searchLibrary(prompt) {
  const lib = readLibrary()
  if (!lib.snippets?.length) return []

  const promptKeywords = extractKeywords(prompt)
  const promptSet = new Set(promptKeywords)
  if (promptSet.size === 0) return []

  // Extract math expressions from prompt (e.g. "x^2+3", "sin(x)")
  const mathExprs = (prompt.match(/[a-z0-9^+\-*/()]+/gi) || [])
    .filter(e => /[a-z].*[\d^]|[\d].*[a-z]/i.test(e))

  return lib.snippets
    .map(s => {
      const entryText = `${s.prompt} ${s.description} ${(s.tags || []).join(' ')} ${s.componentName || ''}`
      const entryKeywords = extractKeywords(entryText)
      const entrySet = new Set(entryKeywords)

      // Jaccard similarity: |intersection| / |union|
      const intersection = [...promptSet].filter(w => entrySet.has(w))
      const union = new Set([...promptSet, ...entrySet])
      const jaccard = union.size > 0 ? intersection.length / union.size : 0

      // Coverage: what fraction of the user's prompt keywords appear in the entry
      const coverage = promptSet.size > 0 ? intersection.length / promptSet.size : 0

      // Combined score: weighted blend
      let score = (jaccard * 3) + (coverage * 5)

      // Formula similarity bonus
      const haystack = entryText.toLowerCase()
      for (const expr of mathExprs) {
        const base = expr.replace(/[+\-]\s*\d+$/, '').toLowerCase()
        if (base.length > 1 && haystack.includes(base)) score += 2
      }

      // Bonus for entries with ops (more reusable on canvas)
      if (s.ops?.length) score += 0.3

      // Bonus for components (more reusable building blocks)
      if (s.isComponent) score += 0.5

      return { ...s, _score: score, _jaccard: jaccard, _coverage: coverage }
    })
    .filter(s => s._score > 0)
    .sort((a, b) => b._score - a._score)
    .slice(0, 10)
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
    videoThumbnail: entry.videoThumbnail || '',
    // Component metadata (new)
    isComponent: entry.isComponent || false,
    componentName: entry.componentName || '',
    parentAnimationId: entry.parentAnimationId || null,
    codeSnippet: entry.codeSnippet || '',
    opsSubset: entry.opsSubset || null,
    createdAt: new Date().toISOString(),
  })
  // Keep library manageable
  if (lib.snippets.length > 50) lib.snippets = lib.snippets.slice(-50)
  writeLibrary(lib)
  return lib.snippets[lib.snippets.length - 1].id // return the new entry's ID
}

function deleteFromLibrary(id) {
  if (!id) return false
  const lib = readLibrary()
  const before = lib.snippets.length
  lib.snippets = lib.snippets.filter(s => s.id !== id)
  if (lib.snippets.length < before) {
    writeLibrary(lib)
    return true
  }
  return false
}

function getAllLibraryEntries() {
  const lib = readLibrary()
  return lib.snippets || []
}

// ── Library Assembly (tiered reuse) ─────────────────────────────

function computeCombinedCoverage(prompt, entries) {
  const promptSet = new Set(extractKeywords(prompt))
  if (promptSet.size === 0) return 0
  const coveredWords = new Set()
  for (const entry of entries) {
    const entryText = `${entry.prompt} ${entry.description} ${(entry.tags || []).join(' ')} ${entry.componentName || ''}`
    const entrySet = new Set(extractKeywords(entryText))
    for (const w of promptSet) {
      if (entrySet.has(w)) coveredWords.add(w)
    }
  }
  return coveredWords.size / promptSet.size
}

function mergeComponentCode(components) {
  // Extract construct() bodies from each component and merge into one Scene
  const bodies = []
  for (const comp of components) {
    const code = comp.codeSnippet || comp.pythonCode || ''
    if (!code) continue
    // Try to extract the construct() body
    const match = code.match(/def\s+construct\s*\(\s*self\s*\)\s*:\s*\n([\s\S]+?)(?=\nclass\s|\n\S|\s*$)/)
    if (match) {
      bodies.push(`        # --- ${comp.componentName || comp.prompt} ---\n${match[1]}`)
    } else {
      // Fallback: include the whole code as a comment reference
      bodies.push(`        # --- ${comp.componentName || comp.prompt} ---\n        # (full code reference)\n`)
    }
  }
  if (bodies.length === 0) return null
  return `from manim import *\n\nclass AssembledScene(Scene):\n    def construct(self):\n${bodies.join('\n\n')}`
}

function assembleFromLibrary({ prompt, libraryMatches }) {
  if (!libraryMatches?.length) return { tier: 'full', baseCode: null, components: [] }

  // Tier 2: Single strong match — adapt it
  const best = libraryMatches[0]
  if (best._coverage >= 0.5 && best.pythonCode) {
    console.log(`[assembleFromLibrary] Tier 2 (adapt): best match "${best.prompt}" coverage=${best._coverage.toFixed(2)}`)
    return {
      tier: 'adapt',
      baseCode: best.pythonCode,
      baseEntry: best,
      components: [best],
    }
  }

  // Tier 3: Multiple components collectively cover the prompt
  const relevantComponents = libraryMatches.filter(m => m._coverage >= 0.15 && (m.codeSnippet || m.pythonCode))
  if (relevantComponents.length >= 2) {
    const combinedCoverage = computeCombinedCoverage(prompt, relevantComponents)
    if (combinedCoverage >= 0.5) {
      const merged = mergeComponentCode(relevantComponents.slice(0, 4)) // max 4 components
      if (merged) {
        console.log(`[assembleFromLibrary] Tier 3 (assemble): ${relevantComponents.length} components, combinedCoverage=${combinedCoverage.toFixed(2)}`)
        return {
          tier: 'assemble',
          baseCode: merged,
          components: relevantComponents.slice(0, 4),
        }
      }
    }
  }

  // Tier 4: Fall back to full generation
  console.log('[assembleFromLibrary] Tier 4 (full): no sufficient library coverage')
  return { tier: 'full', baseCode: null, components: [] }
}

async function generateFromAssembly({ tier, baseCode, prompt, keywords = [] }) {
  // Lightweight LLM call for Tier 2 (adapt) and Tier 3 (assemble)

  const keywordHints = keywords.length > 0
    ? `\nFocus keywords: ${keywords.join(', ')}.`
    : ''

  let system, user

  if (tier === 'adapt') {
    sendProgress('adapting', 'Adapting similar animation from library...')
    system = [
      'You are an expert Manim CE Python developer.',
      'You are given EXISTING working Manim code and a user request.',
      'Your job is to ADAPT the existing code with MINIMAL changes to match the new request.',
      'Do NOT rewrite from scratch. Modify only what is necessary.',
      keywordHints,
      '',
      'Output ONLY a JSON object: {"summary":"what changed","sceneName":"MyScene","pythonCode":"from manim import *\\n..."}',
      'No markdown, no code fences around the JSON.',
    ].join('\n')

    user = [
      'EXISTING CODE (adapt this):\n', baseCode, '',
      '\nUSER REQUEST:', prompt.trim(),
    ].join('\n')
  } else {
    // tier === 'assemble'
    sendProgress('assembling', 'Assembling from library components...')
    system = [
      'You are an expert Manim CE Python developer.',
      'You are given MULTIPLE code components from a library.',
      'Your job is to COMBINE them into ONE complete Scene class that fulfills the user request.',
      'Reuse the component code as much as possible. Fill any gaps or add transitions between parts.',
      'Ensure the final code is a complete, runnable Manim CE script.',
      keywordHints,
      '',
      'Output ONLY a JSON object: {"summary":"what this does","sceneName":"MyScene","pythonCode":"from manim import *\\n..."}',
      'No markdown, no code fences around the JSON.',
    ].join('\n')

    user = [
      'LIBRARY COMPONENTS (combine these):\n', baseCode, '',
      '\nUSER REQUEST:', prompt.trim(),
    ].join('\n')
  }

  const content = await llmChat([
    { role: 'system', content: system },
    { role: 'user', content: user },
  ])

  const parsed = extractFirstJsonObject(content)
  if (!parsed || !parsed.pythonCode) {
    console.error(`[generateFromAssembly] Failed to parse ${tier} response`)
    throw new Error('Assembly generation failed.')
  }
  return {
    summary: parsed.summary || '',
    sceneName: parsed.sceneName || 'AssembledScene',
    pythonCode: parsed.pythonCode,
  }
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
COMPLETE object property reference for the canvas renderer.
ALL objects share: x, y, rotation, opacity (0-1), fill (hex), stroke (hex), strokeWidth (number).

BASIC SHAPES:
- circle: radius (number)
- rectangle: width, height
- triangle: vertices (array of 3 {x,y})
- polygon: vertices (array of {x,y}), sides, radius
- line: x, y, x2, y2, stroke, strokeWidth
- arrow: x, y, x2, y2, stroke, strokeWidth
- arc: x, y, x2, y2, cx, cy, stroke, strokeWidth
- dot: radius (default 0.1), fill

TEXT:
- text: text (string), fontSize (number, default 48), fill
- latex: latex (string, e.g. "\\\\frac{a}{b}"), fill

GRAPH FAMILY (link via IDs):
- axes: xRange {min,max,step}, yRange {min,max,step}, xLength (default 8), yLength (default 4), stroke, strokeWidth, showTicks (bool), xLabel ("x"), yLabel ("y")
- graph: formula (string, e.g. "x^2"), axesId (ID of axes object), xRange {min,max}, yRange {min,max}, stroke, strokeWidth
- graphCursor: graphId (ID of graph), axesId, x0 (number, position on graph), fill, radius (default 0.08), showCrosshair, showDot, showLabel
- tangentLine: graphId, cursorId (optional, ID of graphCursor), axesId, x0, derivativeStep (default 0.001), visibleSpan (default 2), stroke, strokeWidth
- limitProbe: graphId, cursorId, axesId, x0, direction ("left"/"right"/"both"), deltaSchedule (array e.g. [1,0.5,0.1,0.01]), fill, radius
- valueLabel: graphId, cursorId, valueType ("slope"/"x"/"y"/"custom"), labelPrefix, labelSuffix, customExpression, fontSize, fill, showBackground, backgroundFill, backgroundOpacity

TIMING & ANIMATION (on every object):
- delay (number, seconds) - when the object enters (default 0)
- runTime (number, seconds) - how long the object is visible. For persistent objects use the scene duration. For transient effects use a short value.
- animationType: "auto", "Create", "FadeIn", "GrowFromCenter", "Write", "DrawBorderThenFill"
- exitAnimationType: "FadeOut", "Uncreate", "ShrinkToCenter"
- transformFromId (string, optional) - ID of object this morphs from
- transformType (string, optional) - "Transform", "ReplacementTransform", "FadeTransform"

LINKING RULES:
When adding graph-family objects, add axes FIRST then reference its ID. Use deterministic IDs like "axes-1", "graph-1", "cursor-1".
Example: axes id="axes-1", then graph with axesId="axes-1" id="graph-1", then graphCursor with graphId="graph-1" axesId="axes-1".

CRITICAL: Use "fill" for fill color, "stroke" for stroke/border color. Do NOT use "fillColor", "strokeColor", "color". Colors must be hex strings like "#3b82f6".
Formulas must use x and basic functions: sin, cos, tan, exp, log/ln, sqrt, abs, pi, e.
`.trim()

async function classifyPrompt(prompt) {
  sendProgress('classifying', 'Analyzing prompt...')

  // Check if a strong library match exists — bias toward its mode
  const libraryMatches = searchLibrary(prompt)
  const topMatch = libraryMatches[0]
  let libraryHint = ''
  if (topMatch && topMatch._coverage >= 0.4) {
    libraryHint = `\n\nHINT: A very similar request ("${topMatch.prompt}") was previously handled in "${topMatch.mode}" mode. Prefer using "${topMatch.mode}" mode unless the new request is fundamentally different.`
  }

  const sys = `You classify user prompts for a Manim animation editor.
Return ONLY a JSON object: {"mode":"ops"|"python","searchTerms":["term1","term2"]}

"ops" mode is ONLY for the simplest requests:
- Adding a SINGLE static shape (circle, rectangle, text, dot)
- Changing a color or position of one object
- Renaming a scene, changing duration
- Basic property edits

"python" mode is for EVERYTHING ELSE, including:
- ANY animation (moving, transforming, fading, morphing)
- Multiple objects interacting
- Math visualizations (derivatives, integrals, graphs, tangent lines, limits)
- Anything involving timing, sequences, or motion
- 3D scenes, camera movements
- Educational content with labels and annotations
- Any request mentioning "animate", "show", "explain", "visualize", "demonstrate"

searchTerms: 2-4 Manim-specific search queries for GitHub (only for python mode, empty for ops).
No markdown, no code fences, no explanation. Just the JSON.${libraryHint}`

  const content = await llmChat([
    { role: 'system', content: sys },
    { role: 'user', content: prompt },
  ])
  const parsed = extractFirstJsonObject(content)
  if (parsed?.mode === 'python' || parsed?.mode === 'ops') return parsed
  // Default to ops for safety
  return { mode: 'ops', searchTerms: [] }
}

async function generateOps({ prompt, project, activeSceneId, libraryOps, keywords = [] }) {
  sendProgress('generating', 'Generating animation...')

    const allowedObjectTypes = [
      'rectangle','triangle','circle','line','arc','arrow','dot','polygon','text','latex',
      'axes','graph','graphCursor','tangentLine','limitProbe','valueLabel',
    ]

  const scene = project?.scenes?.find(s => s.id === activeSceneId) || project?.scenes?.[0]
  const sceneDuration = scene?.duration || 5

  let librarySection = ''
  if (libraryOps?.length) {
    librarySection = '\n\nRELATED OPS FROM LIBRARY:\n'
    // Only show 1 match, truncate to first 5 ops
    for (const m of libraryOps.slice(0, 1)) {
      const truncatedOps = (m.ops || []).slice(0, 5)
      librarySection += `\n--- "${m.prompt}" ---\n${JSON.stringify(truncatedOps, null, 2)}\n`
    }
  }

  // Build keyword-specific guidance
  const keywordGuidanceMap = {
    'visualize': [
      '- VISUALIZE MODE: Use shapes (circle, rectangle, polygon, arc) and graphs extensively',
      '- Add text labels to all major elements',
      '- Use color (fill) to distinguish different parts',
    ],
    'intuition': [
      '- INTUITIVE MODE: Focus on simple visual metaphors',
      '- Use fewer latex/mathText objects, more text objects with plain language',
      '- Animate concepts step-by-step with clear visual transitions',
    ],
    'prove': [
      '- PROOF MODE: Use latex/mathText for all formal statements',
      '- Show assumptions clearly with text objects',
      '- Build logical steps sequentially using delay to show progression',
    ],
  }

  const keywordInstructions = keywords
    .filter(k => keywordGuidanceMap[k])
    .flatMap(k => keywordGuidanceMap[k])

  const keywordSection = keywordInstructions.length > 0
    ? '\n' + keywordInstructions.join('\n') + '\n'
    : ''

    const system = [
    'You are an in-app agent for a Manim animation editor and mathematics educator.',
    '',
    keywordSection,
    'MATHEMATICAL DETAIL REQUIREMENTS:',
    '- For math concepts, include ALL relevant equations as mathText objects (e.g., "a^2 + b^2 = c^2")',
    '- Label ALL geometric elements with text objects (sides, angles, areas)',
    '- Break complex concepts into multiple objects shown step-by-step using delay',
    '- Use clear, descriptive names for all objects',
    '',
    'TECHNICAL RULES:',
      'You must output ONLY a single JSON object with keys: summary (string) and ops (array). No markdown, no code fences.',
      'Your ops must be small patches to an existing project JSON. Do NOT output Python.',
      'Prefer editing/adding objects inside the active scene.',
    'Allowed op types (MUST use exact camelCase): addObject, updateObject, deleteObject, addKeyframe, setSceneDuration, renameScene, addScene, deleteScene.',
    'IMPORTANT: op type must be camelCase like "addObject" NOT "add_object".',
      `Allowed object types: ${allowedObjectTypes.join(', ')}.`,
    '',
    OPS_PROPERTY_SCHEMA,
    '',
    `The current scene duration is ${sceneDuration}s. For persistent objects (user says "add", "create", "make"), set runTime to ${sceneDuration}. For transient effects, use a shorter runTime.`,
    '',
    'Full addObject example:',
    `{"summary":"Added a blue circle","ops":[{"type":"addObject","sceneId":"scene-1","object":{"type":"circle","x":0,"y":0,"radius":1.5,"fill":"#3b82f6","stroke":"#ffffff","strokeWidth":2,"opacity":1,"delay":0,"runTime":${sceneDuration},"animationType":"auto"}}]}`,
    '',
      'Safety constraints:',
    '- Never introduce arbitrary code strings in formulas.',
      '- Keep changes minimal and deterministic.',
    '- No markdown wrapping. Output raw JSON only.',
    librarySection,
    ].join('\n')

  // Only send minimal context to avoid token overflow
  const objectCount = scene?.objects?.length || 0
  const minimalContext = {
    activeSceneId,
    sceneDuration,
    existingObjectCount: objectCount,
  }

    const user = [
    'USER PROMPT:', prompt.trim(), '',
    'CONTEXT:', JSON.stringify(minimalContext, null, 2),
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

async function generatePython({ prompt, project, activeSceneId, libraryMatches, onlineExamples, keywords = [] }) {
  sendProgress('generating', 'Generating Manim Python code...')

  let contextSection = ''
  if (libraryMatches?.length) {
    const components = libraryMatches.filter(m => m.isComponent)
    const fullAnimations = libraryMatches.filter(m => !m.isComponent)
    
    // Limit total library context to prevent token overflow
    const maxComponents = 1
    const maxFull = 1
    
    if (components.length > 0) {
      contextSection += '\n\nREUSABLE COMPONENT FROM LIBRARY:\n'
      contextSection += 'This component was previously generated. You can ADAPT or COMBINE it.\n'
      for (const c of components.slice(0, maxComponents)) {
        const code = (c.codeSnippet || c.pythonCode || '').slice(0, 1200) // max 1200 chars
        if (code) {
          contextSection += `\n--- "${c.componentName || c.prompt}" ---\n`
          contextSection += `Description: ${c.description}\n`
          contextSection += `${code}\n`
        }
      }
    }
    
    if (fullAnimations.length > 0) {
      contextSection += '\n\nRELATED ANIMATION FROM LIBRARY:\n'
      contextSection += 'This complete animation is similar. ADAPT it if relevant.\n'
      for (const m of fullAnimations.slice(0, maxFull)) {
        const truncated = (m.pythonCode || '').slice(0, 1500) // max 1500 chars
        contextSection += `\n--- "${m.prompt}" ---\n${truncated}\n`
      }
    }
  }
  if (onlineExamples?.length) {
    contextSection += '\n\nREFERENCE FROM MANIM REPO:\n'
    // Only show 1 example, max 1000 chars
    for (const ex of onlineExamples.slice(0, 1)) {
      contextSection += `\n--- ${ex.name} ---\n${ex.code.slice(0, 1000)}\n`
    }
  }

  // Build keyword-specific guidance
  const keywordGuidanceMap = {
    'visualize': [
      '- VISUALIZE MODE: Use diagrams, geometric shapes, graphs, and charts extensively',
      '- Combine visual elements with text labels and annotations',
      '- Prioritize showing concepts through shapes and spatial relationships',
      '- Use color coding to distinguish different parts',
    ],
    'intuition': [
      '- INTUITIVE MODE: Focus on conceptual understanding over formal rigor',
      '- Use fewer equations, more visual analogies and examples',
      '- Explain "why" things work, not just "what" the formulas are',
      '- Use everyday language in text annotations',
    ],
    'prove': [
      '- PROOF MODE: State the theorem clearly with all assumptions',
      '- Show each logical step with mathematical rigor',
      '- Use MathTex for all formal statements and equations',
      '- Build to a clear conclusion statement',
    ],
  }

  const keywordInstructions = keywords
    .filter(k => keywordGuidanceMap[k])
    .flatMap(k => keywordGuidanceMap[k])

  const keywordSection = keywordInstructions.length > 0
    ? '\n' + keywordInstructions.join('\n') + '\n'
    : ''

  const system = [
    'You are an expert Manim Community Edition (CE) Python developer and mathematics educator.',
    'Generate a COMPLETE, self-contained Manim CE Python script that implements the user\'s request.',
    '',
    keywordSection,
    'MATHEMATICAL DETAIL REQUIREMENTS:',
    '- Show ALL relevant equations using MathTex (e.g., a² + b² = c²)',
    '- Label ALL geometric elements (sides, angles, areas)',
    '- Display numerical values when demonstrating calculations',
    '- Break complex concepts into clear step-by-step visual sequences',
    '- Use text annotations to explain what\'s happening at each step',
    '- For proofs/theorems: show the logical progression visually',
    '',
    'TECHNICAL RULES:',
    '- Import from manim: `from manim import *`',
    '- Define exactly ONE Scene class',
    '- Use only standard Manim CE APIs (Community Edition)',
    '- Include self.play() calls with appropriate animations (Create, FadeIn, Transform, Write, etc.)',
    '- Include self.wait() calls for pacing between steps',
    '- Use proper colors to distinguish different elements',
    '',
    'ANIMATION PACING:',
    '- Build the animation step-by-step, showing one concept at a time',
    '- Use self.wait(0.5-1) between major steps so viewers can absorb information',
    '- Highlight or emphasize key moments (e.g., final equation, completed proof)',
    '',
    'Output ONLY a JSON object: {"summary":"what this does","sceneName":"MyScene","pythonCode":"from manim import *\\n..."}',
    'The pythonCode must be a complete, runnable Python string. No markdown, no code fences around the JSON.',
    contextSection,
  ].join('\n')

  // Only send minimal context to avoid token overflow
  const scene = project?.scenes?.find(s => s.id === activeSceneId) || project?.scenes?.[0]
  const minimalContext = {
    activeSceneId,
    existingObjectCount: scene?.objects?.length || 0,
  }
  
  const user = [
    'USER PROMPT:', prompt.trim(), '',
    'Current project context:', JSON.stringify(minimalContext, null, 2),
  ].join('\n')

  const content = await llmChat([
    { role: 'system', content: system },
    { role: 'user', content: user },
  ])

    const parsed = extractFirstJsonObject(content)
  if (!parsed || !parsed.pythonCode) {
    console.error('[generatePython] Failed to parse response. Raw content:', content?.substring(0, 500))
    console.error('[generatePython] Parsed result:', parsed)
    throw new Error('Agent did not return valid Python code.')
  }
  return {
    summary: parsed.summary || '',
    sceneName: parsed.sceneName || 'GeneratedScene',
    pythonCode: parsed.pythonCode,
  }
}

async function enrichAbstractPrompt(prompt, keywords = []) {
  // For abstract/conceptual prompts, expand them into detailed animation steps
  sendProgress('enriching', 'Breaking down concept...')

  // Map keywords to guidance
  const keywordGuidance = {
    'visualize': 'Focus on diagrams, geometric shapes, and graphs combined with text labels. Emphasize visual depiction over abstract notation.',
    'intuition': 'Prioritize conceptual understanding and intuitive explanations. Use fewer equations and more visual analogies. Avoid formal rigor.',
    'prove': 'State the theorem clearly with all assumptions. Provide a step-by-step logical argument with mathematical rigor. Include a clear conclusion.',
  }

  const activeGuidance = keywords
    .filter(k => keywordGuidance[k])
    .map(k => `- ${k.toUpperCase()}: ${keywordGuidance[k]}`)
    .join('\n')

  const guidanceSection = activeGuidance
    ? `\nUSER FOCUS KEYWORDS (apply these requirements to your output):\n${activeGuidance}\n`
    : ''

  const system = [
    'You are an expert mathematics educator and animator.',
    '',
    'Given a user\'s animation request, determine if it\'s ABSTRACT/CONCEPTUAL or CONCRETE:',
    '- ABSTRACT: References a proof, theorem, concept without specifics (e.g., "Euclid\'s proof", "Fourier transform", "chain rule")',
    '- CONCRETE: Has specific details (e.g., "graph y=x^2", "draw a blue circle", "show derivative at x=2")',
    '',
    guidanceSection,
    'For ABSTRACT prompts, expand into DETAILED STEP-BY-STEP visual explanation:',
    '1. What IS this concept/proof/theorem? (brief explanation)',
    '2. What are the KEY VISUAL ELEMENTS to show? (diagrams, equations, shapes)',
    '3. What is the SEQUENCE of steps to animate? (first show X, then demonstrate Y, finally conclude Z)',
    '4. What MATHEMATICAL DETAILS must be visible? (specific equations, labels, numerical values)',
    '',
    'EXAMPLE - Input: "Animate Euclid\'s proof of the Pythagorean theorem"',
    'Output:',
    '```',
    'CONCEPT: Euclid\'s proof uses area relationships - squares on each side of a right triangle.',
    '',
    'VISUAL ELEMENTS:',
    '- Right triangle with sides a, b, hypotenuse c',
    '- Square built on side a (area a²)',
    '- Square built on side b (area b²)',
    '- Square built on hypotenuse c (area c²)',
    '- Labels showing a, b, c',
    '- Area labels: a², b², c²',
    '',
    'ANIMATION SEQUENCE:',
    '1. Draw right triangle with sides a, b, c labeled',
    '2. Construct square on side a, label area a²',
    '3. Construct square on side b, label area b²',
    '4. Construct square on hypotenuse c, label area c²',
    '5. Highlight/shade the two smaller squares',
    '6. Show they equal the large square: a² + b² = c²',
    '7. Display final theorem equation prominently',
    '',
    'MATHEMATICAL DETAILS:',
    '- All sides must be labeled with variables a, b, c',
    '- Each square must show its area formula (a², b², c²)',
    '- Final equation must be prominently displayed: a² + b² = c²',
    '- Use colors to distinguish the three squares',
    '```',
    '',
    'For CONCRETE prompts that already have details, return {"isAbstract":false,"enrichedPrompt":null}',
    '',
    'Return ONLY a JSON object: {"isAbstract":true/false,"enrichedPrompt":"detailed explanation above"}',
    'No markdown, no code fences around the JSON.',
  ].join('\n')

  try {
    const content = await llmChat([
      { role: 'system', content: system },
      { role: 'user', content: prompt },
    ])
    const parsed = extractFirstJsonObject(content)
    if (parsed?.isAbstract && parsed.enrichedPrompt) {
      console.log('[enrichAbstractPrompt] Enriched:', parsed.enrichedPrompt.substring(0, 200) + '...')
      return parsed.enrichedPrompt
    }
    console.log('[enrichAbstractPrompt] Not abstract or no enrichment needed')
  } catch (err) {
    console.error('[enrichAbstractPrompt] Error:', err.message)
  }
  return null // Not abstract or enrichment failed
}

async function clarifyPrompt({ prompt, mode, enrichedPrompt, keywords = [] }) {
  // Ask clarifying multiple-choice questions when the prompt is underspecified.
  // Returns [] when no clarification is needed.
  sendProgress('clarifying', 'Asking clarifying questions...')

  const keywordContext = keywords.length > 0
    ? `\nUSER KEYWORDS: ${keywords.join(', ')} (these are already specified, do not ask about them)`
    : ''

  const system = [
    'You are a product designer for a math animation tool.',
    'Given a user prompt, decide whether we need clarifying questions BEFORE generating any animation.',
    '',
    'Only ask questions when the prompt is ambiguous or underspecified.',
    'Ask 0-3 questions maximum.',
    keywordContext,
    '',
    'Each question MUST be multiple-choice. Some questions may allow multiple selections.',
    '',
    'Good reasons to ask:',
    '- The user asked for a concept/proof but did not specify which example or approach (e.g., chain rule: symbolic vs numeric vs geometric).',
    '- The user did not specify pacing/detail level (quick intuition vs step-by-step proof).',
    '- The user did not specify visual style constraints (2D diagram vs graph-based vs geometric).',
    '',
    'Bad reasons to ask:',
    '- Asking for information already provided in the prompt.',
    '- Asking about aspects covered by the user keywords.',
    '- Asking too many questions.',
    '',
    'Return ONLY JSON with this schema:',
    '{',
    '  "needsClarification": true/false,',
    '  "questions": [',
    '    {',
    '      "id": "q1",',
    '      "prompt": "Question text",',
    '      "allowMultiple": true/false,',
    '      "options": [ { "id": "a", "label": "Option label" }, ... ]',
    '    }',
    '  ]',
    '}',
    '',
    'If no clarification is needed, return {"needsClarification":false,"questions":[]} exactly.',
    'No markdown, no code fences.',
  ].join('\n')

  const user = [
    'MODE:', mode || 'unknown', '',
    'USER PROMPT:', prompt || '', '',
    enrichedPrompt ? `ENRICHED CONTEXT:\n${String(enrichedPrompt).slice(0, 2000)}` : '',
  ].filter(Boolean).join('\n')

  try {
    const content = await llmChat([
      { role: 'system', content: system },
      { role: 'user', content: user },
    ])
    const parsed = extractFirstJsonObject(content)
    if (parsed?.needsClarification && Array.isArray(parsed.questions) && parsed.questions.length > 0) {
      return parsed.questions.slice(0, 3)
    }
  } catch { /* best-effort */ }
  return []
}

async function extractOpsFromPython({ pythonCode, project, activeSceneId }) {
  sendProgress('extracting', 'Extracting canvas objects from Python code...')

  const scene = project?.scenes?.find(s => s.id === activeSceneId) || project?.scenes?.[0]
  const sceneDuration = scene?.duration || 5

  const system = [
    'You are a Manim CE code analyzer. Given Manim Python code, extract the KEY STRUCTURAL visual objects into a JSON ops array for a 2D canvas editor.',
    '',
    'IMPORTANT PRINCIPLES:',
    '1. ACCURACY over completeness — only extract objects you can PRECISELY position and describe.',
    '2. Skip objects created in loops (e.g., multiple rectangles in a for-loop). Instead, represent the overall structure (e.g., one axes + one graph).',
    '3. The canvas uses Manim coordinates: x ranges roughly -7 to 7, y ranges -4 to 4. Origin (0,0) is center.',
    '4. Read .move_to(), .shift(), .to_edge(), .next_to() etc. carefully to determine final x,y positions.',
    '5. For grouped objects (VGroup, etc.), estimate the position of the group center.',
    '',
    'WHAT TO EXTRACT (priority order):',
    '- Axes objects → type:"axes" with exact x_range, y_range',
    '- Plotted functions (axes.plot) → type:"graph" with formula and axesId',
    '- Title text (Text/MathTex at top) → type:"text" or "latex"',
    '- Key labels/formulas (MathTex) → type:"latex"',
    '- Individual named shapes (Circle, Rectangle, Arrow, Line, Dot) with explicit parameters',
    '- Tangent lines → type:"tangentLine"',
    '- Moving dots on graphs → type:"graphCursor"',
    '',
    'WHAT TO SKIP:',
    '- Objects created inside for-loops or list comprehensions (e.g., Riemann sum rectangles)',
    '- Purely decorative elements that are hard to position precisely',
    '- Temporary animation intermediaries that get transformed away',
    '- VGroup children when the group itself represents the concept better',
    '',
    OPS_PROPERTY_SCHEMA,
    '',
    'POSITION MAPPING (critical for accuracy):',
    '- Axes position: default (0,0), but check .shift() or .move_to(). Axes(..).shift(LEFT) means x=-1',
    '- .to_edge(UP) → y≈3.5, .to_edge(DOWN) → y≈-3.5, .to_edge(LEFT) → x≈-6, .to_edge(RIGHT) → x≈6',
    '- .to_corner(UL) → x≈-6, y≈3.5. .to_corner(UR) → x≈6, y≈3.5',
    '- .next_to(obj, RIGHT) → x = obj.x + obj.width/2 + 0.5 (approx)',
    '- UP = [0,1,0], DOWN = [0,-1,0], LEFT = [-1,0,0], RIGHT = [1,0,0]',
    '- .shift(LEFT*2) → subtract 2 from x. .shift(UP*1.5) → add 1.5 to y',
    '',
    'COLOR MAPPING:',
    '- BLUE/BLUE_C → "#3b82f6", RED → "#ef4444", GREEN → "#22c55e", YELLOW → "#eab308"',
    '- ORANGE → "#f97316", PURPLE → "#a855f7", PINK → "#ec4899", WHITE → "#ffffff"',
    '- TEAL/TEAL_C → "#14b8a6", GRAY → "#6b7280", GOLD → "#ca8a04"',
    '- fill_opacity → opacity (default 1 for shapes with fill_color)',
    '',
    'FORMULA EXTRACTION:',
    '- lambda x: x**2 → formula:"x^2"',
    '- lambda x: np.exp(x) → formula:"exp(x)"',
    '- lambda x: np.sin(x) → formula:"sin(x)"',
    '- lambda x: x**2 + 3 → formula:"x^2+3"',
    '',
    'TIMING:',
    '- Walk through self.play() and self.wait() calls sequentially to compute delay for each object.',
    '- Each self.play(..., run_time=T) advances time by T (default 1). Each self.wait(T) advances by T.',
    `- For persistent objects, set runTime = ${sceneDuration} - delay.`,
    '',
    'TRANSFORMS: If Transform(a, b) or ReplacementTransform(a, b), set transformFromId on b pointing to a\'s ID.',
    '',
    'USE DETERMINISTIC IDs: "axes-1", "graph-1", "text-1", "latex-1", etc.',
    '',
    'Return ONLY a JSON object: {"ops":[{"type":"addObject","sceneId":"SCENE_ID","object":{...}}, ...]}',
    'No markdown, no code fences.',
  ].join('\n')

  const user = [
    'PYTHON CODE:', pythonCode, '',
    `Active scene ID: ${activeSceneId || scene?.id || 'scene-1'}`,
    `Scene duration: ${sceneDuration}s`,
  ].join('\n')

  try {
    const content = await llmChat([
      { role: 'system', content: system },
      { role: 'user', content: user },
    ])
    const parsed = extractFirstJsonObject(content)
    if (parsed?.ops && Array.isArray(parsed.ops)) return parsed.ops
  } catch { /* extraction is best-effort */ }
  return []
}

async function decomposeAnimation({ prompt, pythonCode, ops, mode }) {
  // Decompose a complete animation into reusable conceptual components
  // Returns an array of component objects

  const system = [
    'You are an expert at analyzing Manim animations and breaking them into reusable conceptual components.',
    '',
    'Given an animation (described by user prompt + Python code or ops), identify DISTINCT CONCEPTUAL PARTS that could be reused separately.',
    '',
    'EXAMPLES:',
    '- "Riemann sums → Integral" animation contains:',
    '  1. "Riemann sum visualization" (the core concept)',
    '  2. "Limit visualization" (sum → integral transition)',
    '',
    '- "Derivative with tangent line" animation contains:',
    '  1. "Tangent line on curve" (the main concept)',
    '  2. "Slope calculation display" (numeric visualization)',
    '',
    'RULES:',
    '- Each component must be a SELF-CONTAINED concept that makes sense on its own',
    '- Return BETWEEN 2 AND 3 components. NEVER more than 3. If the animation only has one concept, return empty array.',
    '- DO NOT create components for generic scaffolding like "axes setup", "title text", "labels", "coordinate system", or "formatting"',
    '- DO NOT split one concept into sub-steps. Each component must be a DIFFERENT mathematical concept.',
    '- Only extract the CORE MATHEMATICAL CONCEPTS',
    '- For each component, provide:',
    '  * name: short descriptive name (e.g., "Riemann Sum Rectangles")',
    '  * description: 1-sentence explanation',
    '  * keywords: 3-5 search keywords',
    '  * codeSnippet: relevant COMPLETE Python code that can run on its own (from manim import * ... class ... Scene). If mode=ops, empty string.',
    '  * opsSubset: array indices of relevant ops (e.g., [0,1,2] means first 3 ops), empty array if mode=python',
    '',
    'Return ONLY a JSON object:',
    '{"components":[',
    '  {"name":"...","description":"...","keywords":["..."],"codeSnippet":"...","opsSubset":[...]},',
    '  ...',
    ']}',
    '',
    'If the animation is too simple to decompose (e.g., just "draw a circle"), return {"components":[]} (empty array).',
    'No markdown, no code fences.',
  ].join('\n')

  const user = [
    'USER PROMPT:', prompt, '',
    'MODE:', mode, '',
  ]
  if (mode === 'python' && pythonCode) {
    user.push('PYTHON CODE:', pythonCode.slice(0, 3000), '') // truncate to 3000 chars
  }
  if (ops?.length) {
    user.push('OPS (for reference):', JSON.stringify(ops.slice(0, 10), null, 2), '') // show first 10 ops only
  }

  try {
    const content = await llmChat([
      { role: 'system', content: system },
      { role: 'user', content: user.join('\n') },
    ])
    const parsed = extractFirstJsonObject(content)
    if (parsed?.components && Array.isArray(parsed.components)) {
      // Hard cap at 3 — the LLM sometimes ignores the prompt limit
      return parsed.components.slice(0, 3)
    }
  } catch { /* decomposition is best-effort */ }
  return []
}

async function reviewOutput({ prompt, mode, result, manimCode }) {
  sendProgress('reviewing', 'Reviewing quality...')

  const MANIM_COLOR_RULES = `
CRITICAL Manim color rules — check the ACTUAL PYTHON CODE for ALL of these:
1. fill_color= must be set to match the user's requested color.  If the user says "blue circle", the Python must have fill_color=BLUE (or a hex).
2. fill_opacity= must be > 0 (typically 1) for the fill to be visible.  A Circle(fill_color=BLUE) with NO fill_opacity will appear as an empty outline!
3. stroke_color= sets the border/outline color.
4. Do NOT confuse fill vs stroke: "a blue circle" means fill_color=BLUE fill_opacity=1, NOT stroke_color=BLUE.
5. Check for common mistakes: missing fill_opacity, wrong color name, fill_color set but fill_opacity=0 or missing.
`.trim()

  const reviewSystem = mode === 'ops' ? [
    'You are a STRICT quality reviewer for a Manim animation editor.',
    'You receive: (1) the user\'s original prompt, (2) the JSON ops for the canvas editor, (3) the ACTUAL Manim Python code that will render the preview.',
    '',
    'YOUR JOB: Check the Manim Python code line-by-line to ensure it correctly renders what the user asked for.',
    '',
    OPS_PROPERTY_SCHEMA,
    '',
    MANIM_COLOR_RULES,
    '',
    'REVIEW CHECKLIST:',
    '- Does every object from the user\'s prompt appear in the Python code?',
    '- For each object, is fill_color set correctly? Is fill_opacity > 0 if the user wants a filled shape?',
    '- Are positions, sizes, and animations reasonable?',
    '- Does the ops JSON match the Python code?',
    '',
    'If the ops need corrections, fix both the ops AND provide corrected Python code.',
    'Return ONLY a JSON object:',
    '{"approved":true/false,"corrections":"explanation","summary":"user-friendly description","ops":[corrected ops],"pythonCode":"corrected python if needed"}',
    'If everything is correct, return ops unchanged and pythonCode unchanged with approved:true.',
    'No markdown, no code fences.',
  ].join('\n') : [
    'You are a STRICT quality reviewer for Manim CE Python code.',
    'You receive: (1) the user\'s original prompt, (2) the generated Manim Python code.',
    '',
    MANIM_COLOR_RULES,
    '',
    'REVIEW CHECKLIST:',
    '- Is the code syntactically valid Python?',
    '- Does it use correct Manim CE API? (e.g., Circle, Rectangle, MathTex, not LaTeX)',
    '- Colors: For EVERY shape the user mentioned with a color, verify fill_color= AND fill_opacity= are set correctly.',
    '- Animations: Are they appropriate (Create, FadeIn, Write, etc.)?',
    '- Does the output match what the user actually asked for?',
    '',
    'Return ONLY a JSON object:',
    '{"approved":true/false,"corrections":"explanation","summary":"user-friendly description","sceneName":"...","pythonCode":"corrected code"}',
    'No markdown, no code fences.',
  ].join('\n')

  const userParts = ['ORIGINAL USER PROMPT:', prompt, '']
  if (mode === 'ops') {
    userParts.push('OPS JSON:', JSON.stringify(result, null, 2), '')
    userParts.push('MANIM PYTHON CODE THAT WILL BE RENDERED:', manimCode || '(none)', '')
    userParts.push('CHECK THE PYTHON CODE ABOVE. If fill_opacity is missing for colored shapes, that is a BUG you must fix.')
  } else {
    userParts.push('GENERATED PYTHON CODE:', result.pythonCode || '(none)')
  }

  const content = await llmChat([
    { role: 'system', content: reviewSystem },
    { role: 'user', content: userParts.join('\n') },
  ])

  const parsed = extractFirstJsonObject(content)
  if (!parsed) return { ...result, manimCode } // If reviewer fails to parse, use original

  const reviewResult = {
    summary: parsed.summary || result.summary || '',
    corrections: parsed.corrections || null,
    approved: parsed.approved !== false,
  }

  if (mode === 'ops') {
    reviewResult.ops = Array.isArray(parsed.ops) ? parsed.ops : result.ops
    // If reviewer provided corrected python, use it; otherwise keep original
    reviewResult.manimCode = parsed.pythonCode || manimCode
  } else {
    reviewResult.sceneName = parsed.sceneName || result.sceneName
    reviewResult.pythonCode = parsed.pythonCode || result.pythonCode
  }

  return reviewResult
}

// ── Main pipeline IPC handler ───────────────────────────────────

ipcMain.handle('agent-generate', async (event, payload) => {
  try {
    const prompt = payload?.prompt
    const project = payload?.project
    const activeSceneId = payload?.activeSceneId
    const previousResult = payload?.previousResult || null // For "Edit" follow-ups
    const clarificationAnswers = payload?.clarificationAnswers || null
    const keywords = payload?.keywords || [] // User-selected focus keywords

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

    // ── Stage 0: Quick library check (Tier 1 — Direct Reuse) ──
    // Before any LLM calls, check if library already has a near-exact match
    const quickMatches = searchLibrary(prompt)
    const bestMatch = quickMatches[0]

    if (bestMatch && bestMatch._coverage >= 0.85 && bestMatch.pythonCode && !previousResult) {
      console.log(`[agent-generate] Tier 1 DIRECT REUSE: "${bestMatch.prompt}" coverage=${bestMatch._coverage.toFixed(2)}`)
      sendProgress('reusing', 'Found matching animation in library, rendering...')

      // Extract scene name from the stored code
      const sceneNameMatch = bestMatch.pythonCode.match(/class\s+(\w+)\s*\(\s*\w*Scene\s*\)/)
      const sceneName = sceneNameMatch?.[1] || bestMatch.sceneName || 'ReusedScene'

      // Render directly — zero LLM calls
      sendProgress('rendering', 'Rendering preview...')
      let renderResult = await renderManimInternal({
        pythonCode: bestMatch.pythonCode,
        sceneName,
      })

      // Extract ops for canvas
      let extractedOps = bestMatch.ops || null
      if (!extractedOps && renderResult.success) {
        try {
          extractedOps = await extractOpsFromPython({
            pythonCode: bestMatch.pythonCode, project, activeSceneId,
          })
        } catch { /* best effort */ }
      }

      return {
        success: true,
        mode: 'python',
        tier: 'reuse',
        summary: `Reused from library: "${bestMatch.prompt}"`,
        corrections: null,
        videoBase64: renderResult?.success ? renderResult.videoBase64 : null,
        renderError: renderResult?.success ? null : renderResult?.error,
        _ops: extractedOps,
        _pythonCode: bestMatch.pythonCode,
        _sceneName: sceneName,
      }
    }

    // ── Stage 1: Clarify (multiple-choice) ──
    // If the agent needs clarification and the user hasn't answered yet, return questions immediately.
    if (!clarificationAnswers) {
      const questions = await clarifyPrompt({ prompt, mode: null, enrichedPrompt: null, keywords })
      if (questions?.length) {
        return { success: true, needsClarification: true, questions }
      }
    }

    const clarificationBlock = clarificationAnswers
      ? `\n\nUSER CLARIFICATIONS (multiple-choice answers):\n${JSON.stringify(clarificationAnswers, null, 2)}\n`
      : ''

    // ── Stage 2: Enrich abstract prompts ──
    // Enrichment benefits from clarification answers, so include them as extra context.
    const enrichmentInput = clarificationBlock ? `${prompt}${clarificationBlock}` : prompt
    const enrichedPrompt = await enrichAbstractPrompt(enrichmentInput, keywords)

    // ── Stage 3: Classify ──
    const classification = await classifyPrompt(prompt)
    const mode = classification.mode

    let generatorResult

    if (mode === 'python') {
      // ── Stage 4: Search library + online ──
      sendProgress('searching', 'Searching library and examples...')
      const libraryMatches = searchLibrary(prompt)
      let onlineExamples = []

      // ── Stage 4.5: Library Assembly — determine tier ──
      const assembly = assembleFromLibrary({ prompt, libraryMatches })

      if (assembly.tier === 'adapt' || assembly.tier === 'assemble') {
        // ── Tier 2 or 3: Lightweight generation ──
        let effectivePrompt = prompt
        if (enrichedPrompt) {
          effectivePrompt = `Conceptual breakdown:\n${enrichedPrompt}\n${clarificationBlock}\nUser request: ${prompt}`
        } else if (clarificationBlock) {
          effectivePrompt = `${prompt}${clarificationBlock}`
        }

        generatorResult = await generateFromAssembly({
          tier: assembly.tier,
          baseCode: assembly.baseCode,
          prompt: effectivePrompt,
          keywords,
        })

        // Extract canvas ops
        generatorResult._extractedOps = await extractOpsFromPython({
          pythonCode: generatorResult.pythonCode, project, activeSceneId,
        })

        console.log(`[agent-generate] Used ${assembly.tier} path (${assembly.components.length} components)`)
      } else {
        // ── Tier 4: Full generation (current behavior) ──
        if (classification.searchTerms?.length) {
          try {
            onlineExamples = await searchManimExamples(classification.searchTerms)
          } catch { /* continue without online examples */ }
        }

        let effectivePrompt
        if (enrichedPrompt) {
          effectivePrompt = previousResult
            ? `Conceptual breakdown:\n${enrichedPrompt}\n${clarificationBlock}\nPrevious result:\n${JSON.stringify(previousResult, null, 2)}\n\nUser request: ${prompt}`
            : `Conceptual breakdown:\n${enrichedPrompt}\n${clarificationBlock}\nUser request: ${prompt}`
        } else {
          effectivePrompt = previousResult
            ? `Previous result context:\n${JSON.stringify(previousResult, null, 2)}\n${clarificationBlock}\nUser follow-up: ${prompt}`
            : `${prompt}${clarificationBlock}`
        }

        generatorResult = await generatePython({
          prompt: effectivePrompt, project, activeSceneId, libraryMatches, onlineExamples, keywords,
        })

        generatorResult._extractedOps = await extractOpsFromPython({
          pythonCode: generatorResult.pythonCode, project, activeSceneId,
        })
      }
    } else {
      // ── Ops mode: Search library for ops matches ──
      const libraryOps = searchLibrary(prompt).filter(m => m.ops?.length)

      let effectivePrompt
      if (enrichedPrompt) {
        effectivePrompt = previousResult
          ? `Conceptual breakdown:\n${enrichedPrompt}\n${clarificationBlock}\nPrevious result:\n${JSON.stringify(previousResult, null, 2)}\n\nUser request: ${prompt}`
          : `Conceptual breakdown:\n${enrichedPrompt}\n${clarificationBlock}\nUser request: ${prompt}`
      } else {
        effectivePrompt = previousResult
          ? `Previous result context:\n${JSON.stringify(previousResult, null, 2)}\n${clarificationBlock}\nUser follow-up: ${prompt}`
          : `${prompt}${clarificationBlock}`
      }

      generatorResult = await generateOps({ prompt: effectivePrompt, project, activeSceneId, libraryOps, keywords })
    }

    // ── Stage 6: Review ──
    let preManimCode = null
    if (mode === 'ops') {
      const preObjects = []
      for (const op of (generatorResult.ops || [])) {
        if (op.type === 'addObject' && op.object) preObjects.push(op.object)
      }
      const scene = project?.scenes?.find(s => s.id === activeSceneId) || project?.scenes?.[0]
      if (scene?.objects) {
        for (const obj of scene.objects) preObjects.push(obj)
      }
      preManimCode = opsToManimCode(preObjects)
    }

    const reviewed = await reviewOutput({ prompt, mode, result: generatorResult, manimCode: preManimCode })

    // ── Stage 7: Auto-render ──
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
      const finalManimCode = reviewed.manimCode || preManimCode
      if (!finalManimCode) {
        renderResult = { success: false, error: 'No Manim code to render' }
      } else {
        renderResult = await renderManimInternal({ pythonCode: finalManimCode, sceneName: 'Preview' })

        if (!renderResult.success && reviewed.ops) {
          const retryObjects = []
          for (const op of reviewed.ops) {
            if (op.type === 'addObject' && op.object) retryObjects.push(op.object)
          }
          const scene = project?.scenes?.find(s => s.id === activeSceneId) || project?.scenes?.[0]
          if (scene?.objects) {
            for (const obj of scene.objects) retryObjects.push(obj)
          }
          const retryCode = opsToManimCode(retryObjects)
          sendProgress('rendering', 'Re-rendering with corrected ops...')
          renderResult = await renderManimInternal({ pythonCode: retryCode, sceneName: 'Preview' })
        }
      }
    }

    const finalPythonCode = mode === 'python'
      ? reviewed.pythonCode
      : (reviewed.manimCode || preManimCode || null)
    const finalSceneName = mode === 'python'
      ? reviewed.sceneName
      : 'Preview'

    return {
      success: true,
      mode,
      summary: reviewed.summary || '',
      corrections: reviewed.corrections || null,
      videoBase64: renderResult?.success ? renderResult.videoBase64 : null,
      renderError: renderResult?.success ? null : renderResult?.error,
      _ops: reviewed.ops || generatorResult._extractedOps || null,
      _pythonCode: finalPythonCode,
      _sceneName: finalSceneName,
    }
  } catch (e) {
    return { success: false, error: e?.message || String(e) }
  }
})

// ── Deterministic ops-to-Manim code generator ──────────────────
// No LLM involved -- directly maps object properties to Manim CE Python code.

function hexToManimColor(hex) {
  if (!hex || typeof hex !== 'string') return null
  const map = {
    '#ffffff': 'WHITE', '#000000': 'BLACK', '#ff0000': 'RED', '#ef4444': 'RED',
    '#00ff00': 'GREEN', '#22c55e': 'GREEN', '#4ade80': 'GREEN',
    '#0000ff': 'BLUE', '#3b82f6': 'BLUE', '#2563eb': 'BLUE', '#1d4ed8': 'BLUE',
    '#ffff00': 'YELLOW', '#eab308': 'YELLOW', '#fbbf24': 'YELLOW',
    '#ff00ff': 'PURPLE', '#a855f7': 'PURPLE', '#8b5cf6': 'PURPLE',
    '#ffa500': 'ORANGE', '#f97316': 'ORANGE',
    '#00ffff': 'TEAL', '#06b6d4': 'TEAL', '#14b8a6': 'TEAL',
    '#ffc0cb': 'PINK', '#ec4899': 'PINK',
    '#808080': 'GRAY', '#6b7280': 'GRAY',
    '#e94560': 'RED',
  }
  const lower = hex.toLowerCase()
  return map[lower] || `ManimColor("${hex}")`
}

function objectToManimLine(obj, varName) {
  if (!obj || !obj.type) return null
  const pos = `np.array([${obj.x || 0}, ${obj.y || 0}, 0])`
  const fillColor = obj.fill ? hexToManimColor(obj.fill) : null
  const strokeColor = obj.stroke ? hexToManimColor(obj.stroke) : null
  const opacity = obj.opacity !== undefined ? obj.opacity : 1

  switch (obj.type) {
    case 'circle': {
      const r = obj.radius || 1
      let args = [`radius=${r}`]
      if (fillColor) args.push(`fill_color=${fillColor}`, `fill_opacity=${opacity}`)
      if (strokeColor) args.push(`stroke_color=${strokeColor}`)
      if (obj.strokeWidth) args.push(`stroke_width=${obj.strokeWidth}`)
      return `${varName} = Circle(${args.join(', ')}).move_to(${pos})`
    }
    case 'rectangle': {
      const w = obj.width || 2, h = obj.height || 1
      let args = [`width=${w}`, `height=${h}`]
      if (fillColor) args.push(`fill_color=${fillColor}`, `fill_opacity=${opacity}`)
      if (strokeColor) args.push(`stroke_color=${strokeColor}`)
      if (obj.strokeWidth) args.push(`stroke_width=${obj.strokeWidth}`)
      return `${varName} = Rectangle(${args.join(', ')}).move_to(${pos})`
    }
    case 'triangle': {
      let args = []
      if (fillColor) args.push(`fill_color=${fillColor}`, `fill_opacity=${opacity}`)
      if (strokeColor) args.push(`stroke_color=${strokeColor}`)
      return `${varName} = Triangle(${args.join(', ')}).move_to(${pos})`
    }
    case 'line': {
      const start = `np.array([${obj.x || 0}, ${obj.y || 0}, 0])`
      const end = `np.array([${obj.x2 || 2}, ${obj.y2 || 0}, 0])`
      let color = strokeColor || 'WHITE'
      return `${varName} = Line(${start}, ${end}, color=${color}, stroke_width=${obj.strokeWidth || 3})`
    }
    case 'arrow': {
      const start = `np.array([${obj.x || 0}, ${obj.y || 0}, 0])`
      const end = `np.array([${obj.x2 || 2}, ${obj.y2 || 0}, 0])`
      let color = strokeColor || 'YELLOW'
      return `${varName} = Arrow(${start}, ${end}, color=${color}, stroke_width=${obj.strokeWidth || 3})`
    }
    case 'dot': {
      let color = fillColor || 'WHITE'
      return `${varName} = Dot(point=${pos}, color=${color}, radius=${obj.radius || 0.08})`
    }
    case 'text': {
      let color = fillColor || 'WHITE'
      const text = (obj.text || 'Text').replace(/"/g, '\\"')
      return `${varName} = Text("${text}", color=${color}, font_size=${obj.fontSize || 48}).move_to(${pos})`
    }
    case 'latex': {
      let color = fillColor || 'WHITE'
      const tex = (obj.latex || 'x').replace(/\\/g, '\\\\')
      return `${varName} = MathTex(r"${tex}", color=${color}).move_to(${pos})`
    }
    default:
      return null
  }
}

function opsToManimCode(objects) {
  const lines = ['from manim import *', 'import numpy as np', '', 'class Preview(Scene):', '    def construct(self):']
  const validObjects = objects.filter(o => o && o.type)

  if (!validObjects.length) {
    lines.push('        self.add(Text("Empty scene"))')
    lines.push('        self.wait(1)')
    return lines.join('\n')
  }

  for (let i = 0; i < validObjects.length; i++) {
    const code = objectToManimLine(validObjects[i], `obj_${i}`)
    if (code) {
      lines.push(`        ${code}`)
    }
  }

  // Play Create animations for all objects
  const varNames = validObjects.map((_, i) => `obj_${i}`)
    .filter((_, i) => objectToManimLine(validObjects[i], `obj_${i}`) !== null)
  if (varNames.length) {
    lines.push(`        self.play(${varNames.map(v => `Create(${v})`).join(', ')})`)
  }
  lines.push('        self.wait(1)')

  return lines.join('\n')
}

function renderOpsPreview({ ops, project, activeSceneId }) {
  // Collect objects: new ones from ops + existing ones from scene
  const objects = []
  for (const op of (ops || [])) {
    if (op.type === 'addObject' && op.object) objects.push(op.object)
  }
  const scene = project?.scenes?.find(s => s.id === activeSceneId) || project?.scenes?.[0]
  if (scene?.objects) {
    for (const obj of scene.objects) objects.push(obj)
  }

  if (!objects.length) {
    return Promise.resolve({ success: false, error: 'No objects to render' })
  }

  const pythonCode = opsToManimCode(objects)
  return renderManimInternal({ pythonCode, sceneName: 'Preview' })
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

ipcMain.handle('library-get-all', async () => {
  try {
    return { success: true, entries: getAllLibraryEntries() }
  } catch (e) {
    return { success: false, entries: [] }
  }
})

ipcMain.handle('library-delete', async (event, id) => {
  try {
    const deleted = deleteFromLibrary(id)
    return { success: deleted }
  } catch (e) {
    return { success: false, error: e?.message || String(e) }
  }
})

ipcMain.handle('library-clear', async () => {
  try {
    writeLibrary({ snippets: [] })
    return { success: true }
  } catch (e) {
    return { success: false, error: e?.message || String(e) }
  }
})

ipcMain.handle('library-add-components', async (event, payload) => {
  // Decompose an animation into components and save each to library
  try {
    const { prompt, pythonCode, ops, mode, videoThumbnail } = payload
    
    // Call decomposition LLM
    const components = await decomposeAnimation({ prompt, pythonCode, ops, mode })
    
    if (!components || components.length === 0) {
      // No decomposition possible, save as single entry (fallback to old behavior)
      addToLibrary({
        prompt,
        description: payload.description || '',
        tags: payload.tags || [],
        pythonCode: pythonCode || '',
        sceneName: payload.sceneName || '',
        mode: mode || 'python',
        ops: ops || null,
        videoThumbnail: videoThumbnail || '',
        isComponent: false,
      })
      return { success: true, componentCount: 0 }
    }
    
    // Save the parent animation first
    const parentId = addToLibrary({
      prompt,
      description: `Full animation: ${prompt}`,
      tags: payload.tags || [],
      pythonCode: pythonCode || '',
      sceneName: payload.sceneName || '',
      mode: mode || 'python',
      ops: ops || null,
      videoThumbnail: videoThumbnail || '',
      isComponent: false,
    })
    
    // Save each component
    for (const comp of components) {
      const compTags = [...new Set([...(payload.tags || []), ...(comp.keywords || [])])]
      addToLibrary({
        prompt: comp.name,
        description: comp.description || '',
        tags: compTags,
        pythonCode: comp.codeSnippet || '',
        sceneName: payload.sceneName || '',
        mode,
        ops: comp.opsSubset?.length ? (ops || []).filter((_, idx) => comp.opsSubset.includes(idx)) : null,
        videoThumbnail: videoThumbnail || '', // share parent thumbnail for now
        isComponent: true,
        componentName: comp.name,
        parentAnimationId: parentId,
        codeSnippet: comp.codeSnippet || '',
        opsSubset: comp.opsSubset || null,
      })
    }
    
    return { success: true, componentCount: components.length }
  } catch (e) {
    return { success: false, error: e?.message || String(e) }
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

