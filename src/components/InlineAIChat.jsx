import React, { useState, useRef, useEffect, useCallback } from 'react'
import './InlineAIChat.css'

const PHASE_LABELS = {
  reusing: 'Found match in library, reusing…',
  adapting: 'Adapting similar animation…',
  assembling: 'Assembling from components…',
  classifying: 'Analyzing prompt…',
  enriching: 'Breaking down concept…',
  clarifying: 'Clarifying requirements…',
  searching: 'Searching library…',
  generating: 'Generating animation…',
  extracting: 'Extracting canvas objects…',
  reviewing: 'Reviewing quality…',
  rendering: 'Rendering preview…',
  fixing: 'Fixing render error…',
}

/**
 * Collapsible inline AI chat panel that sits below the canvas.
 * Provides a quick-access prompt + conversation thread without
 * opening the full-screen AIAssistantModal.
 */
export default function InlineAIChat({
  project,
  activeSceneId,
  onApplyOps,
  onApplyPythonCode,
  onOpenFullModal,
}) {
  const [expanded, setExpanded] = useState(false)
  const [input, setInput] = useState('')
  const [messages, setMessages] = useState([])
  const [status, setStatus] = useState('idle') // idle | running | done | error
  const [phase, setPhase] = useState('')
  const [latestResult, setLatestResult] = useState(null)
  const messagesEndRef = useRef(null)
  const canUseElectron = !!window.electronAPI

  // Listen for progress events
  useEffect(() => {
    if (!canUseElectron) return
    const handler = (data) => { if (data?.phase) setPhase(data.phase) }
    window.electronAPI.onAgentProgress?.(handler)
    return () => window.electronAPI.removeAgentProgressListener?.()
  }, [canUseElectron])

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, phase, status])

  const runPipeline = useCallback(async (userPrompt, previousResult = null) => {
    if (!canUseElectron) return
    const trimmed = userPrompt.trim()
    if (!trimmed) return

    setMessages(prev => [...prev, { role: 'user', text: trimmed }])
    setStatus('running')
    setPhase('classifying')
    setLatestResult(null)

    try {
      const res = await window.electronAPI.agentGenerate?.({
        prompt: trimmed,
        project,
        activeSceneId,
        previousResult,
      })
      if (!res?.success) {
        setMessages(prev => [...prev, { role: 'error', text: res?.error || 'Pipeline failed' }])
        setStatus('error')
        return
      }

      const assistantMsg = {
        role: 'assistant',
        text: res.summary || 'Animation generated.',
        hasVideo: !!res.videoBase64,
        renderError: res.renderError || null,
      }
      setMessages(prev => [...prev, assistantMsg])
      setLatestResult(res)
      setStatus('done')
    } catch (e) {
      setMessages(prev => [...prev, { role: 'error', text: e?.message || String(e) }])
      setStatus('error')
    }
    setPhase('')
  }, [canUseElectron, project, activeSceneId])

  const handleSend = () => {
    if (status === 'running' || !input.trim()) return
    const prompt = input
    setInput('')
    runPipeline(prompt, latestResult)
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleApply = useCallback(() => {
    if (!latestResult) return
    if (latestResult._ops?.length) onApplyOps?.(latestResult._ops)
    if (latestResult._pythonCode) onApplyPythonCode?.(latestResult._pythonCode, latestResult._sceneName)
  }, [latestResult, onApplyOps, onApplyPythonCode])

  const handleClear = () => {
    setMessages([])
    setLatestResult(null)
    setStatus('idle')
    setPhase('')
    setInput('')
  }

  return (
    <div className={`inline-ai-chat ${expanded ? 'expanded' : 'collapsed'}`}>
      {/* Toggle bar */}
      <div className="inline-ai-toggle" onClick={() => setExpanded(prev => !prev)}>
        <div className="inline-ai-toggle-left">
          <span className="inline-ai-toggle-icon">&#9650;</span>
          <span>AI Chat</span>
          {status === 'running' && <span className="inline-ai-toggle-badge">Working…</span>}
          {status === 'done' && latestResult && <span className="inline-ai-toggle-badge">Result ready</span>}
        </div>
        <button
          className="inline-ai-open-modal"
          onClick={(e) => { e.stopPropagation(); onOpenFullModal?.() }}
          title="Open full AI modal"
        >
          Expand
        </button>
      </div>

      {/* Body (only rendered when expanded) */}
      {expanded && (
        <div className="inline-ai-body">
          {/* Messages */}
          <div className="inline-ai-messages">
            {messages.length === 0 && status === 'idle' && (
              <div className="inline-ai-message phase" style={{ justifyContent: 'center', opacity: 0.5 }}>
                Describe an animation and the AI will generate it
              </div>
            )}

            {messages.map((msg, i) => (
              <div key={i} className={`inline-ai-message ${msg.role}`}>
                {msg.role === 'user' && <span>{msg.text}</span>}
                {msg.role === 'assistant' && (
                  <div>
                    <span>{msg.text}</span>
                    {msg.hasVideo && (
                      <div style={{ marginTop: 4, fontSize: 11, color: '#86efac' }}>
                        Video preview ready
                      </div>
                    )}
                    {msg.renderError && (
                      <div style={{ marginTop: 4, fontSize: 11, color: '#fca5a5' }}>
                        Render error: {msg.renderError}
                      </div>
                    )}
                  </div>
                )}
                {msg.role === 'error' && <span>{msg.text}</span>}
              </div>
            ))}

            {status === 'running' && (
              <div className="inline-ai-message phase">
                <span className="inline-ai-phase-spinner" />
                <span>{PHASE_LABELS[phase] || 'Working…'}</span>
              </div>
            )}

            {status === 'done' && latestResult && (
              <div className="inline-ai-actions">
                <button className="inline-ai-action-btn apply" onClick={handleApply}>
                  Apply to Canvas
                </button>
                <button className="inline-ai-action-btn" onClick={handleClear}>
                  Clear
                </button>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Input bar */}
          <div className="inline-ai-input-bar">
            <textarea
              className="inline-ai-input"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={status === 'done' ? 'Type to refine, or Apply…' : 'Describe an animation…'}
              rows={1}
              disabled={status === 'running'}
            />
            <button
              className="inline-ai-send-btn"
              onClick={handleSend}
              disabled={status === 'running' || !input.trim()}
            >
              {status === 'running' ? '…' : 'Send'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
