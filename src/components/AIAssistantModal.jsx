import React, { useEffect, useMemo, useState, useRef, useCallback } from 'react'
import './AIAssistantModal.css'

function maskKey(key) {
  if (!key) return ''
  const trimmed = key.trim()
  if (trimmed.length <= 8) return '********'
  return `${trimmed.slice(0, 3)}…${trimmed.slice(-3)}`
}

const PHASE_LABELS = {
  reusing: 'Found match in library, reusing…',
  adapting: 'Adapting similar animation from library…',
  assembling: 'Assembling from library components…',
  classifying: 'Analyzing prompt…',
  enriching: 'Breaking down concept…',
  clarifying: 'Clarifying requirements…',
  searching: 'Searching library and examples…',
  generating: 'Generating animation…',
  extracting: 'Extracting canvas objects…',
  reviewing: 'Reviewing quality…',
  rendering: 'Rendering preview…',
  fixing: 'Fixing render error…',
}

/** Extract a thumbnail frame from a base64 MP4 video using a hidden <video>+<canvas>. */
function extractVideoThumbnail(videoBase64) {
  return new Promise((resolve) => {
    try {
      const video = document.createElement('video')
      video.muted = true
      video.preload = 'auto'
      video.src = `data:video/mp4;base64,${videoBase64}`

      video.addEventListener('loadeddata', () => {
        // Seek to 0.5s or halfway through, whichever is shorter
        video.currentTime = Math.min(0.5, video.duration / 2)
      })

      video.addEventListener('seeked', () => {
        try {
          const canvas = document.createElement('canvas')
          const scale = 200 / Math.max(video.videoWidth, 1) // ~200px wide
          canvas.width = Math.round(video.videoWidth * scale)
          canvas.height = Math.round(video.videoHeight * scale)
          const ctx = canvas.getContext('2d')
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
          const dataUrl = canvas.toDataURL('image/jpeg', 0.7)
          // Strip the data:image/jpeg;base64, prefix
          resolve(dataUrl.split(',')[1] || '')
        } catch {
          resolve('')
        }
      })

      video.addEventListener('error', () => resolve(''))
      // Timeout safety
      setTimeout(() => resolve(''), 5000)
    } catch {
      resolve('')
    }
  })
}

export default function AIAssistantModal({
  isOpen,
  onClose,
  project,
  activeSceneId,
  onApplyOps,
  onApplyPythonCode,
  prefillPrompt,
}) {
  const [prompt, setPrompt] = useState('')
  const [status, setStatus] = useState('idle') // idle | running | done | error
  const [phase, setPhase] = useState('')
  const [error, setError] = useState('')
  const [result, setResult] = useState(null)
  // result shape: { mode, summary, corrections, videoBase64, renderError, _ops, _pythonCode, _sceneName }

  // Clarifying questions (multiple-choice)
  const [clarifyQuestions, setClarifyQuestions] = useState([])
  const [clarifySelections, setClarifySelections] = useState({}) // { [questionId]: Set(optionId) }
  const [clarifyPromptBase, setClarifyPromptBase] = useState(null)
  const [clarifyPreviousResult, setClarifyPreviousResult] = useState(null)

  // Edit mode: follow-up prompts
  const [editPrompt, setEditPrompt] = useState('')
  const [isEditing, setIsEditing] = useState(false)

  // Keywords
  const [selectedKeywords, setSelectedKeywords] = useState([])

  // Settings
  const [showSettings, setShowSettings] = useState(false)
  const [settings, setSettings] = useState(null)
  const [providerInput, setProviderInput] = useState('openai')
  const [openaiApiKeyInput, setOpenaiApiKeyInput] = useState('')
  const [anthropicApiKeyInput, setAnthropicApiKeyInput] = useState('')
  const [modelInput, setModelInput] = useState('')
  const [baseUrlInput, setBaseUrlInput] = useState('')
  const [manimPathInput, setManimPathInput] = useState('')

  const videoRef = useRef(null)
  const canUseElectron = !!window.electronAPI

  // Keyword definitions: these guide the AI on how to interpret the prompt
  const KEYWORD_DEFINITIONS = [
    {
      id: 'visualize',
      label: 'visualize',
      tooltip: 'Depict with diagrams, geometry, and graphs combined with text explanations',
    },
    {
      id: 'intuition',
      label: 'intuitive',
      tooltip: 'Emphasize conceptual understanding over mathematical rigor; fewer equations, more visual explanations',
    },
    {
      id: 'prove',
      label: 'prove',
      tooltip: 'State the theorem + assumptions + step-by-step logical argument with clear conclusion',
    },
  ]

  const toggleKeyword = (keywordId) => {
    setSelectedKeywords(prev => 
      prev.includes(keywordId) 
        ? prev.filter(k => k !== keywordId)
        : [...prev, keywordId]
    )
  }

  // Listen for progress events
  useEffect(() => {
    if (!canUseElectron) return
    const handler = (data) => {
      if (data?.phase) setPhase(data.phase)
    }
    window.electronAPI.onAgentProgress?.(handler)
    return () => window.electronAPI.removeAgentProgressListener?.()
  }, [canUseElectron])

  useEffect(() => {
    if (!isOpen) return
    setStatus('idle')
    setError('')
    setResult(null)
    setPhase('')
    setPrompt(prefillPrompt || '')
    setEditPrompt('')
    setIsEditing(false)
    setClarifyQuestions([])
    setClarifySelections({})
    setClarifyPromptBase(null)
    setClarifyPreviousResult(null)

    if (!canUseElectron) return
    ;(async () => {
      const s = await window.electronAPI.getAppSettings?.()
      setSettings(s || null)
      setProviderInput(s?.aiProvider || 'openai')
      setOpenaiApiKeyInput('')
      setAnthropicApiKeyInput('')
      setModelInput(
        s?.aiProvider === 'anthropic'
          ? (s?.anthropicModel || '')
          : (s?.openaiModel || '')
      )
      setBaseUrlInput(s?.openaiBaseUrl || '')
      setManimPathInput(s?.manimPath || '')
    })()
  }, [isOpen, canUseElectron, prefillPrompt])

  const openaiKeyStatus = useMemo(() => {
    if (!settings) return 'Unknown'
    return settings.openaiApiKeyPresent ? `Set (${maskKey(settings.openaiApiKeyMasked)})` : 'Not set'
  }, [settings])

  const anthropicKeyStatus = useMemo(() => {
    if (!settings) return 'Unknown'
    return settings.anthropicApiKeyPresent ? `Set (${maskKey(settings.anthropicApiKeyMasked)})` : 'Not set'
  }, [settings])

  const saveSettings = async () => {
    if (!canUseElectron) return
    const payload = { aiProvider: providerInput, manimPath: manimPathInput }
    if (providerInput === 'openai') {
      if (openaiApiKeyInput) payload.openaiApiKey = openaiApiKeyInput
      payload.openaiModel = modelInput
      payload.openaiBaseUrl = baseUrlInput
    } else if (providerInput === 'anthropic') {
      if (anthropicApiKeyInput) payload.anthropicApiKey = anthropicApiKeyInput
      payload.anthropicModel = modelInput
    }
    const updated = await window.electronAPI.updateAppSettings?.(payload)
    setSettings(updated || null)
    setOpenaiApiKeyInput('')
    setAnthropicApiKeyInput('')
  }

  const runPipeline = useCallback(async (userPrompt, previousResult = null, clarificationAnswers = null) => {
    if (!canUseElectron) {
      setError('AI assistant requires Electron.')
      setStatus('error')
      return
    }
    const trimmed = userPrompt.trim()
    if (!trimmed) return

    setStatus('running')
    setPhase('classifying')
    setError('')
    setResult(null)
    setIsEditing(false)
    setClarifyQuestions([])
    setClarifySelections({})

    try {
      const res = await window.electronAPI.agentGenerate?.({
        prompt: trimmed,
        project,
        activeSceneId,
        previousResult,
        clarificationAnswers,
        keywords: selectedKeywords, // Pass selected keywords
      })
      if (!res?.success) {
        setError(res?.error || 'Pipeline failed')
        setStatus('error')
        return
      }
      if (res?.needsClarification && Array.isArray(res.questions) && res.questions.length > 0) {
        // Switch to clarification UI
        setPhase('clarifying')
        setStatus('idle')
        setResult(null)
        setError('')
        setClarifyQuestions(res.questions)
        setClarifySelections({})
        setClarifyPromptBase(trimmed)
        setClarifyPreviousResult(previousResult)
        return
      }
      setResult(res)
      setStatus('done')
    } catch (e) {
      setError(e?.message || String(e))
      setStatus('error')
    }
  }, [canUseElectron, project, activeSceneId])

  const handleGenerate = () => runPipeline(prompt)

  const handleEdit = () => {
    if (!editPrompt.trim()) return
    runPipeline(editPrompt, result)
  }

  const toggleClarifyOption = (q, opt) => {
    setClarifySelections(prev => {
      const next = { ...prev }
      const existing = next[q.id] ? new Set(next[q.id]) : new Set()
      const has = existing.has(opt.id)
      if (q.allowMultiple) {
        if (has) existing.delete(opt.id)
        else existing.add(opt.id)
      } else {
        existing.clear()
        if (!has) existing.add(opt.id)
      }
      next[q.id] = existing
      return next
    })
  }

  const handleClarifyContinue = () => {
    if (!clarifyQuestions.length || !clarifyPromptBase) return
    const answers = clarifyQuestions.map(q => {
      const selected = Array.from(clarifySelections[q.id] || [])
      const selectedLabels = selected
        .map(id => q.options?.find(o => o.id === id)?.label)
        .filter(Boolean)
      return {
        questionId: q.id,
        question: q.prompt,
        allowMultiple: !!q.allowMultiple,
        selectedOptionIds: selected,
        selectedLabels,
      }
    }).filter(a => a.selectedOptionIds.length > 0)

    runPipeline(clarifyPromptBase, clarifyPreviousResult, answers)
  }

  const handleRetry = () => {
    setResult(null)
    setError('')
    setStatus('idle')
    setPrompt('')
    setEditPrompt('')
    setIsEditing(false)
    setPhase('')
    setClarifyQuestions([])
    setClarifySelections({})
    setClarifyPromptBase(null)
    setClarifyPreviousResult(null)
    setSelectedKeywords([]) // Reset keywords on retry
  }

  const handleApply = async () => {
    if (!result) return

    // Always apply ops if available (both modes now have _ops)
    if (result._ops?.length) {
      onApplyOps?.(result._ops)
    }
    // Always set the code panel with the exact Python code that produced the preview
    if (result._pythonCode) {
      onApplyPythonCode?.(result._pythonCode, result._sceneName)
    }

    // Extract video thumbnail for library
    let videoThumbnail = ''
    if (result.videoBase64) {
      try {
        videoThumbnail = await extractVideoThumbnail(result.videoBase64)
      } catch { /* best-effort */ }
    }

    // Save to library with component decomposition
    try {
      if (window.electronAPI?.libraryAddComponents) {
        const saveResult = await window.electronAPI.libraryAddComponents({
          prompt,
          description: result.summary || '',
          tags: prompt.toLowerCase().split(/\s+/).filter(w => w.length > 2),
          pythonCode: result._pythonCode || '',
          sceneName: result._sceneName || '',
          mode: result.mode || 'ops',
          ops: result._ops || null,
          videoThumbnail,
        })
        if (saveResult?.componentCount > 0) {
          console.log(`Saved animation + ${saveResult.componentCount} components to library`)
        }
      } else {
        // Fallback to old API if new one not available
        await window.electronAPI.libraryAdd?.({
          prompt,
          description: result.summary || '',
          tags: prompt.toLowerCase().split(/\s+/).filter(w => w.length > 2),
          pythonCode: result._pythonCode || '',
          sceneName: result._sceneName || '',
          mode: result.mode || 'ops',
          ops: result._ops || null,
          videoThumbnail,
        })
      }
    } catch (e) {
      console.error('Library save failed:', e)
    }
    onClose?.()
  }

  if (!isOpen) return null

  const hasVideo = result?.videoBase64
  const hasRenderError = result && !result.videoBase64 && result.renderError

  return (
    <div className="ai-modal-overlay" onClick={onClose}>
      <div className="ai-modal" onClick={(e) => e.stopPropagation()}>

        {/* ── Header ── */}
        <div className="ai-modal-header">
          <div>
            <div className="ai-title">AI Assistant</div>
            <div className="ai-subtitle">Describe your animation and see a rendered preview</div>
          </div>
          <div className="ai-header-actions">
            <button
              className="ai-settings-toggle"
              onClick={() => setShowSettings(!showSettings)}
              title="Settings"
            >
              {showSettings ? 'Hide Settings' : 'Settings'}
            </button>
            <button className="ai-close-btn" onClick={onClose} title="Close">×</button>
          </div>
        </div>

        <div className="ai-modal-body">

          {/* ── Left: Prompt + Actions ── */}
          <div className="ai-left">
            {/* Prompt input */}
            {!isEditing && (
              <div className="ai-section">
                <div className="ai-section-title">What do you want to create?</div>
                <textarea
                  className="ai-prompt"
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder={'Describe your animation.\n\nSimple: "Make a blue circle"\nComplex: "Animate the derivative of y=x² with a moving tangent line and slope label"'}
                  spellCheck={false}
                  disabled={status === 'running'}
                />

                {/* Keyword selector */}
                <div className="ai-keywords">
                  <div className="ai-keywords-label">Focus keywords (optional):</div>
                  <div className="ai-keywords-list">
                    {KEYWORD_DEFINITIONS.map(kw => (
                      <button
                        key={kw.id}
                        className={`ai-keyword-btn ${selectedKeywords.includes(kw.id) ? 'selected' : ''}`}
                        onClick={() => toggleKeyword(kw.id)}
                        title={kw.tooltip}
                        disabled={status === 'running'}
                      >
                        {kw.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="ai-row">
                  <button
                    className="ai-btn primary"
                    onClick={handleGenerate}
                    disabled={status === 'running' || !prompt.trim()}
                  >
                    {status === 'running' ? 'Working…' : 'Generate'}
                  </button>
                </div>
              </div>
            )}

            {/* Edit follow-up input */}
            {isEditing && (
              <div className="ai-section">
                <div className="ai-section-title">Refine your animation</div>
                <div className="ai-muted" style={{ marginBottom: 8 }}>
                  Original: "{prompt}"
                </div>
                <textarea
                  className="ai-prompt"
                  value={editPrompt}
                  onChange={(e) => setEditPrompt(e.target.value)}
                  placeholder="Describe what to change, e.g. 'Make it larger' or 'Add a label above it'"
                  spellCheck={false}
                  disabled={status === 'running'}
                  autoFocus
                />
                <div className="ai-row">
                  <button
                    className="ai-btn primary"
                    onClick={handleEdit}
                    disabled={status === 'running' || !editPrompt.trim()}
                  >
                    {status === 'running' ? 'Working…' : 'Update'}
                  </button>
                  <button className="ai-btn" onClick={() => setIsEditing(false)}>
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {/* Progress indicator */}
            {status === 'running' && (
              <div className="ai-progress">
                <div className="ai-progress-spinner" />
                <div className="ai-progress-text">
                  {PHASE_LABELS[phase] || 'Working…'}
                </div>
              </div>
            )}

            {/* Clarifying questions (multiple choice) */}
            {status !== 'running' && clarifyQuestions.length > 0 && (
              <div className="ai-section">
                <div className="ai-section-title">A few quick questions</div>
                <div className="ai-muted" style={{ marginBottom: 8 }}>
                  Answering these helps the AI generate the right animation.
                </div>
                <div className="ai-clarify-list">
                  {clarifyQuestions.map(q => (
                    <div key={q.id} className="ai-clarify-question">
                      <div className="ai-clarify-prompt">{q.prompt}</div>
                      <div className="ai-clarify-options">
                        {(q.options || []).map(opt => {
                          const selected = !!clarifySelections[q.id]?.has(opt.id)
                          return (
                            <button
                              key={opt.id}
                              className={`ai-clarify-option ${selected ? 'selected' : ''}`}
                              onClick={() => toggleClarifyOption(q, opt)}
                              type="button"
                            >
                              {opt.label}
                            </button>
                          )
                        })}
                      </div>
                      {q.allowMultiple && (
                        <div className="ai-muted" style={{ marginTop: 6, fontSize: 11 }}>
                          You can select multiple.
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                <div className="ai-row">
                  <button className="ai-btn primary" onClick={handleClarifyContinue}>
                    Continue
                  </button>
                  <button className="ai-btn" onClick={handleRetry}>
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {/* Error display */}
            {status === 'error' && error && (
              <div className="ai-section">
                <div className="ai-error">{error}</div>
                <div className="ai-row">
                  <button className="ai-btn" onClick={handleRetry}>Try Again</button>
                </div>
              </div>
            )}

            {/* Settings panel (collapsible) */}
            {showSettings && (
              <div className="ai-section ai-settings-section">
                <div className="ai-section-title">Settings</div>
                <div className="ai-settings-grid">
                  <label className="ai-label">
                    <div className="ai-label-title">AI Provider</div>
                    <select
                      className="ai-input"
                      value={providerInput}
                      onChange={(e) => {
                        const p = e.target.value
                        setProviderInput(p)
                        setModelInput(
                          p === 'anthropic'
                            ? (settings?.anthropicModel || 'claude-sonnet-4-5')
                            : (settings?.openaiModel || 'gpt-4o-mini')
                        )
                      }}
                    >
                      <option value="openai">OpenAI</option>
                      <option value="anthropic">Anthropic (Claude)</option>
                    </select>
                  </label>

                  {providerInput === 'openai' && (
                    <>
                      <label className="ai-label">
                        <div className="ai-label-title">API Key</div>
                        <div className="ai-muted">Current: {openaiKeyStatus}</div>
                        <input className="ai-input" type="password" value={openaiApiKeyInput}
                          onChange={(e) => setOpenaiApiKeyInput(e.target.value)}
                          placeholder="sk-… (leave blank to keep)" />
                      </label>
                      <label className="ai-label">
                        <div className="ai-label-title">Model</div>
                        <input className="ai-input" value={modelInput}
                          onChange={(e) => setModelInput(e.target.value)}
                          placeholder="gpt-4o-mini" />
                      </label>
                      <label className="ai-label">
                        <div className="ai-label-title">Base URL</div>
                        <input className="ai-input" value={baseUrlInput}
                          onChange={(e) => setBaseUrlInput(e.target.value)}
                          placeholder="https://api.openai.com" />
                      </label>
                    </>
                  )}

                  {providerInput === 'anthropic' && (
                    <>
                      <label className="ai-label">
                        <div className="ai-label-title">API Key</div>
                        <div className="ai-muted">Current: {anthropicKeyStatus}</div>
                        <input className="ai-input" type="password" value={anthropicApiKeyInput}
                          onChange={(e) => setAnthropicApiKeyInput(e.target.value)}
                          placeholder="sk-ant-… (leave blank to keep)" />
                      </label>
                      <label className="ai-label">
                        <div className="ai-label-title">Model</div>
                        <input className="ai-input" value={modelInput}
                          onChange={(e) => setModelInput(e.target.value)}
                          placeholder="claude-sonnet-4-5" />
                      </label>
                    </>
                  )}

                  <label className="ai-label">
                    <div className="ai-label-title">Manim path</div>
                    <input className="ai-input" value={manimPathInput}
                      onChange={(e) => setManimPathInput(e.target.value)}
                      placeholder="/path/to/manim (optional)" />
                  </label>
                </div>
                <div className="ai-row">
                  <button className="ai-btn" onClick={saveSettings} disabled={!canUseElectron}>
                    Save settings
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* ── Right: Preview ── */}
          <div className="ai-right">
            {/* Video preview */}
            {hasVideo && (
              <div className="ai-preview-section">
                <div className="ai-section-title">Preview</div>
                {result.summary && (
                  <div className="ai-summary">{result.summary}</div>
                )}
                {result.corrections && (
                  <div className="ai-corrections">
                    Reviewer: {result.corrections}
                  </div>
                )}
                <div className="ai-video-container">
                  <video
                    ref={videoRef}
                    className="ai-video"
                    controls
                    autoPlay
                    loop
                    src={`data:video/mp4;base64,${result.videoBase64}`}
                  />
                </div>
                <div className="ai-action-bar">
                  <button className="ai-btn success" onClick={handleApply}>
                    Apply
                  </button>
                  <button className="ai-btn" onClick={() => { setIsEditing(true); setEditPrompt('') }}>
                    Edit
                  </button>
                  <button className="ai-btn danger" onClick={handleRetry}>
                    Retry
                  </button>
                </div>
              </div>
            )}

            {/* Render error (video failed) */}
            {hasRenderError && (
              <div className="ai-preview-section">
                <div className="ai-section-title">Preview</div>
                {result.summary && (
                  <div className="ai-summary">{result.summary}</div>
                )}
                <div className="ai-error">
                  Render failed: {result.renderError}
                </div>
                <div className="ai-action-bar">
                  <button className="ai-btn" onClick={() => { setIsEditing(true); setEditPrompt('') }}>
                    Edit Prompt
                  </button>
                  <button className="ai-btn danger" onClick={handleRetry}>
                    Retry
                  </button>
                </div>
              </div>
            )}

            {/* Empty state */}
            {!result && status !== 'running' && (
              <div className="ai-preview-empty">
                <div className="ai-preview-empty-icon">▶</div>
                <div className="ai-muted">
                  Your rendered animation preview will appear here
                </div>
              </div>
            )}

            {/* Loading state */}
            {status === 'running' && !result && (
              <div className="ai-preview-empty">
                <div className="ai-progress-spinner large" />
                <div className="ai-muted" style={{ marginTop: 12 }}>
                  {PHASE_LABELS[phase] || 'Working…'}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
