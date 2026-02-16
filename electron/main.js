const { app, BrowserWindow, ipcMain, dialog } = require('electron')
const path = require('path')
const fs = require('fs')
const { spawn } = require('child_process')
const crypto = require('crypto')

// ── Module imports ──
const llmModule = require('./llm')
const libraryModule = require('./library')
const pipelineModule = require('./agent-pipeline')
const rendererModule = require('./renderer')

let mainWindow

// ── Settings helpers ──

function getSettingsPath() {
  return path.join(app.getPath('userData'), 'settings.json')
}

function readAppSettings() {
  const defaults = {
    manimPath: '',
    aiProvider: 'openai',
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

function sendProgress(phase, message) {
  try { mainWindow?.webContents?.send('agent-progress', { phase, message }) } catch { /* noop */ }
}

function getManimCmd() {
  const settings = readAppSettings()
  const envManim = process.env.MANIM_PATH && String(process.env.MANIM_PATH).trim()
  const legacyManimEnvPath = path.join(
    process.env.HOME || '/Users/yigeyuan',
    'Documents/Cursor Code/Manim/manim-ce-env/bin/manim'
  )
  const configured = settings.manimPath && String(settings.manimPath).trim()
  return configured || envManim || (fs.existsSync(legacyManimEnvPath) ? legacyManimEnvPath : 'manim')
}

// ── Window creation ──

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

  if (process.env.NODE_ENV !== 'production') {
    mainWindow.loadURL('http://localhost:5173')
    mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }
}

app.whenReady().then(() => {
  createWindow()

  // Initialize all modules with shared dependencies
  llmModule.init({ readAppSettings, getMainWindow: () => mainWindow })
  libraryModule.init({
    getLibraryPath: () => path.join(app.getPath('userData'), 'code-library.json'),
    fs,
  })
  pipelineModule.init({
    llmChat: llmModule.llmChat,
    llmChatStream: llmModule.llmChatStream,
    extractFirstJsonObject: llmModule.extractFirstJsonObject,
    extractJsonWithContinuation: llmModule.extractJsonWithContinuation,
    isAnthropicProvider: llmModule.isAnthropicProvider,
    sendProgress,
    getMainWindow: () => mainWindow,
    searchLibrary: libraryModule.searchLibrary,
    assembleFromLibrary: libraryModule.assembleFromLibrary,
  })
  rendererModule.init({
    fs,
    spawn,
    getTempDir: () => path.join(app.getPath('temp'), 'manim-interactive-agent'),
    getManimCmd,
    sendProgress,
  })
})

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

// ── IPC Handlers: Settings ──

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

    if (Object.prototype.hasOwnProperty.call(partial, 'openaiApiKey')) {
      next.openaiApiKey = typeof partial.openaiApiKey === 'string' ? partial.openaiApiKey.trim() : ''
    }
    if (Object.prototype.hasOwnProperty.call(partial, 'anthropicApiKey')) {
      next.anthropicApiKey = typeof partial.anthropicApiKey === 'string' ? partial.anthropicApiKey.trim() : ''
    }
  }

  try {
    fs.writeFileSync(getSettingsPath(), JSON.stringify(next, null, 2))
  } catch { /* ignore */ }

  return publicSettings(next)
})

// ── IPC Handlers: File operations ──

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
    if (fs.existsSync(outputPath)) {
      fs.copyFileSync(outputPath, filePath)
      return { success: true, path: filePath }
    }
  }
  return { success: false }
})

// ── IPC Handler: Render Manim scene (user-facing) ──

ipcMain.handle('render-manim', async (event, { pythonCode, sceneName, quality }) => {
  const tempDir = path.join(app.getPath('temp'), 'manim-interactive')
  const sceneFile = path.join(tempDir, 'scene.py')
  const mediaDir = path.join(tempDir, 'media')

  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true })
  }
  fs.writeFileSync(sceneFile, pythonCode)

  const qualityFlagMap = { low: '-ql', medium: '-qm', high: '-qh' }
  const qualityFlag = qualityFlagMap[quality] || '-ql'
  const extraArgs = quality === 'draft' ? ['--fps', '10', '-r', '426,240'] : []
  const manimCmd = getManimCmd()

  mainWindow.webContents.send('render-log', `Using Manim at: ${manimCmd}\n`)
  mainWindow.webContents.send('render-log', `Running: ${manimCmd} ${qualityFlag} ${sceneFile} ${sceneName}\n\n`)

  return new Promise((resolve) => {
    const manimProcess = spawn(manimCmd, [qualityFlag, ...extraArgs, sceneFile, sceneName, '--media_dir', mediaDir], {
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
        const qualityDirMap = { draft: '240p10', low: '480p15', medium: '720p30', high: '1080p60' }
        const qualityDir = qualityDirMap[quality] || '480p15'
        const videoPath = path.join(mediaDir, 'videos', 'scene', qualityDir, `${sceneName}.mp4`)

        if (fs.existsSync(videoPath)) {
          resolve({ success: true, videoPath, logs })
        } else {
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
            resolve({ success: true, videoPath: foundVideo, logs })
          } else {
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

// ── GitHub Manim search ──

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
          if (code.length < 15000) {
            results.push({ name: item.name, path: item.path, code: code.slice(0, 8000) })
          }
        }
      } catch { /* skip individual file errors */ }
    }
  } catch { /* search failed */ }

  _searchCache.set(cacheKey, results)
  return results
}

// ── Embedding-based semantic search ──

async function computeEmbedding(text) {
  try {
    const creds = llmModule.getAICredentials()
    if (creds.provider !== 'openai' || !creds.apiKey) return null
    const root = (creds.baseUrl || 'https://api.openai.com').replace(/\/+$/, '')
    const resp = await fetch(`${root}/v1/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${creds.apiKey}` },
      body: JSON.stringify({ model: 'text-embedding-3-small', input: text.slice(0, 8000) }),
    })
    if (!resp.ok) return null
    const data = await resp.json()
    return data?.data?.[0]?.embedding || null
  } catch { return null }
}

function cosineSimilarity(a, b) {
  if (!a || !b || a.length !== b.length) return 0
  let dot = 0, magA = 0, magB = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    magA += a[i] * a[i]
    magB += b[i] * b[i]
  }
  const denom = Math.sqrt(magA) * Math.sqrt(magB)
  return denom > 0 ? dot / denom : 0
}

async function semanticSearchLibrary(prompt) {
  const keywordResults = libraryModule.searchLibrary(prompt)

  const queryEmbedding = await computeEmbedding(prompt)
  if (!queryEmbedding) return keywordResults

  const lib = libraryModule.readLibrary()
  const entriesWithEmbeddings = (lib.snippets || []).filter(s => s.embedding?.length > 0)
  if (entriesWithEmbeddings.length === 0) return keywordResults

  const semanticScores = entriesWithEmbeddings.map(s => ({
    ...s,
    _semanticScore: cosineSimilarity(queryEmbedding, s.embedding),
  }))

  const keywordMap = new Map(keywordResults.map(r => [r.id, r]))

  for (const entry of semanticScores) {
    if (keywordMap.has(entry.id)) {
      keywordMap.get(entry.id)._score += entry._semanticScore * 4
    } else if (entry._semanticScore > 0.3) {
      keywordResults.push({
        ...entry,
        _score: entry._semanticScore * 4,
        _jaccard: 0,
        _coverage: 0,
      })
    }
  }

  return keywordResults.sort((a, b) => b._score - a._score).slice(0, 10)
}

// ── Incremental rendering cache ──

const _renderCache = new Map()

function contentHash(code) {
  return crypto.createHash('md5').update(code).digest('hex')
}

async function renderWithCache({ pythonCode, sceneName, quality = 'low' }) {
  const hash = contentHash(pythonCode + sceneName + quality)
  if (_renderCache.has(hash)) {
    console.log('[render-cache] Cache hit for', hash.slice(0, 8))
    return _renderCache.get(hash)
  }
  const result = await rendererModule.renderManimInternal({ pythonCode, sceneName, quality })
  if (result.success) {
    _renderCache.set(hash, result)
    if (_renderCache.size > 20) {
      const oldest = _renderCache.keys().next().value
      _renderCache.delete(oldest)
    }
  }
  return result
}

// ── Main pipeline IPC handler ──

ipcMain.handle('agent-generate', async (event, payload) => {
  try {
    const prompt = payload?.prompt
    const project = payload?.project
    const activeSceneId = payload?.activeSceneId
    const previousResult = payload?.previousResult || null
    const clarificationAnswers = payload?.clarificationAnswers || null
    const keywords = payload?.keywords || []

    if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
      return { success: false, error: 'Missing prompt' }
    }
    if (!project || typeof project !== 'object') {
      return { success: false, error: 'Missing project' }
    }

    const creds = llmModule.getAICredentials()
    if (!creds.apiKey) {
      return { success: false, error: `No API key set for ${creds.provider}. Set it in AI settings.` }
    }

    // Fast-path heuristic
    const wordCount = prompt.trim().split(/\s+/).length
    const ABSTRACT_CONCEPTS = [
      'intuition', 'intuitive', 'visualize', 'explain', 'understand', 'prove',
      'proof', 'derive', 'derivation', 'why', 'how does', 'relationship',
      'compare', 'contrast', 'theorem', 'concept', 'meaning',
    ]
    const promptLower = prompt.toLowerCase()
    const hasAbstractConcept = ABSTRACT_CONCEPTS.some(w => promptLower.includes(w))
    const isSimplePrompt = wordCount <= 15 && !hasAbstractConcept && !previousResult
    if (isSimplePrompt) {
      console.log(`[agent-generate] Fast-path: simple prompt (${wordCount} words)`)
    }

    // Stage 0: Library direct reuse
    const quickMatches = libraryModule.searchLibrary(prompt)
    const bestMatch = quickMatches[0]

    if (bestMatch && bestMatch._coverage >= 0.85 && bestMatch.pythonCode && !previousResult) {
      console.log(`[agent-generate] Tier 1 DIRECT REUSE: "${bestMatch.prompt}"`)
      sendProgress('reusing', 'Found matching animation in library, rendering...')
      const sceneNameMatch = bestMatch.pythonCode.match(/class\s+(\w+)\s*\(\s*\w*Scene\s*\)/)
      const sceneName = sceneNameMatch?.[1] || bestMatch.sceneName || 'ReusedScene'

      sendProgress('rendering', 'Rendering preview...')
      let renderResult = await renderWithCache({ pythonCode: bestMatch.pythonCode, sceneName })

      let extractedOps = bestMatch.ops || null
      if (!extractedOps && renderResult.success) {
        try {
          extractedOps = await pipelineModule.extractOpsFromPython({ pythonCode: bestMatch.pythonCode, project, activeSceneId })
        } catch { /* best effort */ }
      }

      return {
        success: true, mode: 'python', tier: 'reuse',
        summary: `Reused from library: "${bestMatch.prompt}"`,
        corrections: null,
        videoBase64: renderResult?.success ? renderResult.videoBase64 : null,
        renderError: renderResult?.success ? null : renderResult?.error,
        _ops: extractedOps, _pythonCode: bestMatch.pythonCode, _sceneName: sceneName,
      }
    }

    // Stage 1: Clarify
    let clarificationBlock = ''
    if (!isSimplePrompt) {
      if (!clarificationAnswers) {
        const questions = await pipelineModule.clarifyPrompt({ prompt, mode: null, enrichedPrompt: null, keywords })
        if (questions?.length) {
          return { success: true, needsClarification: true, questions }
        }
      }
      clarificationBlock = clarificationAnswers
        ? `\n\nUSER CLARIFICATIONS:\n${JSON.stringify(clarificationAnswers, null, 2)}\n`
        : ''
    }

    // Stage 2: Enrich
    let enrichedPrompt = null
    if (!isSimplePrompt) {
      const enrichmentInput = clarificationBlock ? `${prompt}${clarificationBlock}` : prompt
      enrichedPrompt = await pipelineModule.enrichAbstractPrompt(enrichmentInput, keywords)
    } else {
      sendProgress('generating', 'Generating (fast path)...')
    }

    // Stage 3: Classify
    const classification = await pipelineModule.classifyPrompt(prompt)
    const mode = classification.mode

    let generatorResult

    if (mode === 'python') {
      sendProgress('searching', 'Searching library and examples...')
      const libraryMatches = libraryModule.searchLibrary(prompt)
      let onlineExamples = []
      const assembly = libraryModule.assembleFromLibrary({ prompt, libraryMatches })

      if (assembly.tier === 'adapt' || assembly.tier === 'assemble') {
        let effectivePrompt = prompt
        if (enrichedPrompt) {
          effectivePrompt = `Conceptual breakdown:\n${enrichedPrompt}\n${clarificationBlock}\nUser request: ${prompt}`
        } else if (clarificationBlock) {
          effectivePrompt = `${prompt}${clarificationBlock}`
        }

        generatorResult = await pipelineModule.generateFromAssembly({
          tier: assembly.tier, baseCode: assembly.baseCode, prompt: effectivePrompt, keywords,
        })
        generatorResult._extractedOps = await pipelineModule.extractOpsFromPython({
          pythonCode: generatorResult.pythonCode, project, activeSceneId,
        })
      } else {
        if (classification.searchTerms?.length) {
          try { onlineExamples = await searchManimExamples(classification.searchTerms) } catch {}
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

        generatorResult = await pipelineModule.generatePython({
          prompt: effectivePrompt, project, activeSceneId, libraryMatches, onlineExamples, keywords,
        })
        generatorResult._extractedOps = await pipelineModule.extractOpsFromPython({
          pythonCode: generatorResult.pythonCode, project, activeSceneId,
        })
      }
    } else {
      const libraryOps = libraryModule.searchLibrary(prompt).filter(m => m.ops?.length)
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
      generatorResult = await pipelineModule.generateOps({ prompt: effectivePrompt, project, activeSceneId, libraryOps, keywords })
    }

    // Stage 6: Review
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
      preManimCode = rendererModule.opsToManimCode(preObjects)
    }

    const codeText = generatorResult?.pythonCode || ''
    const codeLineCount = codeText.split('\n').length
    const needsReview = !isSimplePrompt || codeLineCount > 80 || hasAbstractConcept
    const reviewed = needsReview
      ? await pipelineModule.reviewOutput({ prompt, mode, result: generatorResult, manimCode: preManimCode })
      : { ...generatorResult }

    // Stage 7: Auto-render
    sendProgress('rendering', 'Rendering preview...')
    let renderResult

    if (mode === 'python') {
      renderResult = await renderWithCache({
        pythonCode: reviewed.pythonCode, sceneName: reviewed.sceneName,
      })

      if (!renderResult.success) {
        sendProgress('fixing', 'Fixing render error...')
        const fixMessages = [
          { role: 'system', content: 'The following Manim CE Python code failed to render. Fix the error and return ONLY a JSON object: {"sceneName":"...","pythonCode":"corrected code"}. No markdown.' },
          { role: 'user', content: `CODE:\n${reviewed.pythonCode}\n\nERROR:\n${renderResult.error}` },
        ]
        const fixContent = await llmModule.llmChat(fixMessages, { maxTokens: 8192 })
        const fixed = await llmModule.extractJsonWithContinuation(fixContent, fixMessages, { maxTokens: 4096 })
        if (fixed?.pythonCode) {
          reviewed.pythonCode = fixed.pythonCode
          if (fixed.sceneName) reviewed.sceneName = fixed.sceneName
          sendProgress('rendering', 'Re-rendering after fix...')
          renderResult = await renderWithCache({
            pythonCode: reviewed.pythonCode, sceneName: reviewed.sceneName,
          })
        }
      }
    } else {
      const finalManimCode = reviewed.manimCode || preManimCode
      if (!finalManimCode) {
        renderResult = { success: false, error: 'No Manim code to render' }
      } else {
        renderResult = await renderWithCache({ pythonCode: finalManimCode, sceneName: 'Preview' })

        if (!renderResult.success && reviewed.ops) {
          const retryObjects = []
          for (const op of reviewed.ops) {
            if (op.type === 'addObject' && op.object) retryObjects.push(op.object)
          }
          const scene = project?.scenes?.find(s => s.id === activeSceneId) || project?.scenes?.[0]
          if (scene?.objects) {
            for (const obj of scene.objects) retryObjects.push(obj)
          }
          const retryCode = rendererModule.opsToManimCode(retryObjects)
          sendProgress('rendering', 'Re-rendering with corrected ops...')
          renderResult = await renderWithCache({ pythonCode: retryCode, sceneName: 'Preview' })
        }
      }
    }

    const finalPythonCode = mode === 'python' ? reviewed.pythonCode : (reviewed.manimCode || preManimCode || null)
    const finalSceneName = mode === 'python' ? reviewed.sceneName : 'Preview'

    return {
      success: true, mode,
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

// ── Library IPC handlers ──

ipcMain.handle('library-add', async (event, entry) => {
  try {
    libraryModule.addToLibrary(entry)

    const embeddingText = `${entry.prompt || ''} ${entry.description || ''} ${(entry.tags || []).join(' ')}`
    computeEmbedding(embeddingText).then(embedding => {
      if (embedding) {
        const lib = libraryModule.readLibrary()
        const last = lib.snippets[lib.snippets.length - 1]
        if (last) {
          last.embedding = embedding
          libraryModule.writeLibrary(lib)
        }
      }
    }).catch(() => {})

    return { success: true }
  } catch (e) {
    return { success: false, error: e?.message || String(e) }
  }
})

ipcMain.handle('library-search', async (event, prompt) => {
  try {
    const results = await semanticSearchLibrary(prompt || '')
    return { success: true, results }
  } catch (e) {
    return { success: false, results: libraryModule.searchLibrary(prompt || '') }
  }
})

ipcMain.handle('library-get-all', async () => {
  try {
    return { success: true, entries: libraryModule.getAllLibraryEntries() }
  } catch {
    return { success: false, entries: [] }
  }
})

ipcMain.handle('library-delete', async (event, id) => {
  try {
    return { success: libraryModule.deleteFromLibrary(id) }
  } catch (e) {
    return { success: false, error: e?.message || String(e) }
  }
})

ipcMain.handle('library-clear', async () => {
  try {
    libraryModule.writeLibrary({ snippets: [] })
    return { success: true }
  } catch (e) {
    return { success: false, error: e?.message || String(e) }
  }
})

ipcMain.handle('library-add-components', async (event, payload) => {
  try {
    const { prompt, pythonCode, ops, mode, videoThumbnail } = payload

    const components = await pipelineModule.decomposeAnimation({ prompt, pythonCode, ops, mode })

    if (!components || components.length === 0) {
      libraryModule.addToLibrary({
        prompt, description: payload.description || '', tags: payload.tags || [],
        pythonCode: pythonCode || '', sceneName: payload.sceneName || '',
        mode: mode || 'python', ops: ops || null, videoThumbnail: videoThumbnail || '',
        isComponent: false,
      })
      return { success: true, componentCount: 0 }
    }

    const parentId = libraryModule.addToLibrary({
      prompt, description: `Full animation: ${prompt}`, tags: payload.tags || [],
      pythonCode: pythonCode || '', sceneName: payload.sceneName || '',
      mode: mode || 'python', ops: ops || null, videoThumbnail: videoThumbnail || '',
      isComponent: false,
    })

    for (const comp of components) {
      const compTags = [...new Set([...(payload.tags || []), ...(comp.keywords || [])])]
      libraryModule.addToLibrary({
        prompt: comp.name, description: comp.description || '', tags: compTags,
        pythonCode: comp.codeSnippet || '', sceneName: payload.sceneName || '',
        mode, ops: comp.opsSubset?.length ? (ops || []).filter((_, idx) => comp.opsSubset.includes(idx)) : null,
        videoThumbnail: videoThumbnail || '',
        isComponent: true, componentName: comp.name,
        parentAnimationId: parentId, codeSnippet: comp.codeSnippet || '',
        opsSubset: comp.opsSubset || null,
      })
    }

    return { success: true, componentCount: components.length }
  } catch (e) {
    return { success: false, error: e?.message || String(e) }
  }
})

// Library import/export (C4)
ipcMain.handle('library-export', async () => {
  try {
    const lib = libraryModule.readLibrary()
    const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
      title: 'Export Library',
      defaultPath: 'code-library.json',
      filters: [{ name: 'JSON Files', extensions: ['json'] }],
    })
    if (!canceled && filePath) {
      fs.writeFileSync(filePath, JSON.stringify(lib, null, 2))
      return { success: true, path: filePath }
    }
    return { success: false }
  } catch (e) {
    return { success: false, error: e?.message || String(e) }
  }
})

ipcMain.handle('library-import', async () => {
  try {
    const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
      title: 'Import Library',
      filters: [{ name: 'JSON Files', extensions: ['json'] }],
      properties: ['openFile'],
    })
    if (canceled || !filePaths.length) return { success: false }
    const raw = fs.readFileSync(filePaths[0], 'utf-8')
    const imported = JSON.parse(raw)
    if (!imported?.snippets || !Array.isArray(imported.snippets)) {
      return { success: false, error: 'Invalid library file format' }
    }
    const existing = libraryModule.readLibrary()
    const existingIds = new Set(existing.snippets.map(s => s.id))
    let added = 0
    for (const snippet of imported.snippets) {
      if (!existingIds.has(snippet.id)) {
        existing.snippets.push(snippet)
        added++
      }
    }
    if (existing.snippets.length > 100) existing.snippets = existing.snippets.slice(-100)
    libraryModule.writeLibrary(existing)
    return { success: true, added }
  } catch (e) {
    return { success: false, error: e?.message || String(e) }
  }
})

// Legacy handler redirect
ipcMain.handle('agent-generate-ops', async (event, payload) => {
  return ipcMain.emit('agent-generate', event, payload)
})

// Get video file as base64
ipcMain.handle('get-video-data', async (event, videoPath) => {
  if (fs.existsSync(videoPath)) {
    const buffer = fs.readFileSync(videoPath)
    return { success: true, data: buffer.toString('base64') }
  }
  return { success: false }
})
