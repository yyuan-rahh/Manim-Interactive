import React, { useEffect, useMemo, useState, useRef, useCallback } from 'react'
import './AIAssistantModal.css'

function maskKey(key) {
  if (!key) return ''
  const trimmed = key.trim()
  if (trimmed.length <= 8) return '********'
  return `${trimmed.slice(0, 3)}…${trimmed.slice(-3)}`
}

const PHASE_LABELS = {
  classifying: 'Analyzing prompt…',
  searching: 'Searching for examples…',
  generating: 'Generating animation…',
  reviewing: 'Reviewing quality…',
  rendering: 'Rendering preview…',
  fixing: 'Fixing render error…',
}

export default function AIAssistantModal({
  isOpen,
  onClose,
  project,
  activeSceneId,
  onApplyOps,
}) {
  const [prompt, setPrompt] = useState('')
  const [status, setStatus] = useState('idle') // idle | running | done | error
  const [phase, setPhase] = useState('')
  const [error, setError] = useState('')
  const [result, setResult] = useState(null)
  // result shape: { mode, summary, corrections, videoBase64, renderError, _ops, _pythonCode, _sceneName }

  // Edit mode: follow-up prompts
  const [editPrompt, setEditPrompt] = useState('')
  const [isEditing, setIsEditing] = useState(false)

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
    setPrompt('')
    setEditPrompt('')
    setIsEditing(false)

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
  }, [isOpen, canUseElectron])

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

  const runPipeline = useCallback(async (userPrompt, previousResult = null) => {
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

    try {
      const res = await window.electronAPI.agentGenerate?.({
        prompt: trimmed,
        project,
        activeSceneId,
        previousResult,
      })
      if (!res?.success) {
        setError(res?.error || 'Pipeline failed')
        setStatus('error')
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

  const handleRetry = () => {
    setResult(null)
    setError('')
    setStatus('idle')
    setPrompt('')
    setEditPrompt('')
    setIsEditing(false)
    setPhase('')
  }

  const handleApply = async () => {
    if (!result) return
    if (result.mode === 'ops' && result._ops?.length) {
      onApplyOps?.(result._ops)
    }
    // Save to library
    try {
      await window.electronAPI.libraryAdd?.({
        prompt,
        description: result.summary || '',
        tags: prompt.toLowerCase().split(/\s+/).filter(w => w.length > 2),
        pythonCode: result._pythonCode || '',
        sceneName: result._sceneName || '',
        mode: result.mode || 'ops',
        ops: result._ops || null,
      })
    } catch { /* library save is best-effort */ }
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
