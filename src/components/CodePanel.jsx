import React, { useState, useRef, useEffect, useCallback } from 'react'
import './CodePanel.css'
import { EditorView, basicSetup } from 'codemirror'
import { EditorState } from '@codemirror/state'
import { python } from '@codemirror/lang-python'
import { oneDark } from '@codemirror/theme-one-dark'

function CodeMirrorEditor({ value, onChange }) {
  const containerRef = useRef(null)
  const viewRef = useRef(null)
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  useEffect(() => {
    if (!containerRef.current) return

    const updateListener = EditorView.updateListener.of((update) => {
      if (update.docChanged) {
        onChangeRef.current?.(update.state.doc.toString())
      }
    })

    const state = EditorState.create({
      doc: value || '',
      extensions: [
        basicSetup,
        python(),
        oneDark,
        updateListener,
        EditorView.theme({
          '&': { height: '100%', fontSize: '13px' },
          '.cm-scroller': { overflow: 'auto', fontFamily: '"SF Mono", "Menlo", "Consolas", monospace' },
          '.cm-content': { minHeight: '200px' },
        }),
      ],
    })

    const view = new EditorView({
      state,
      parent: containerRef.current,
    })

    viewRef.current = view

    return () => {
      view.destroy()
      viewRef.current = null
    }
  }, [])

  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    const currentDoc = view.state.doc.toString()
    if (currentDoc !== value) {
      view.dispatch({
        changes: { from: 0, to: currentDoc.length, insert: value || '' },
      })
    }
  }, [value])

  return <div ref={containerRef} style={{ height: '100%', overflow: 'hidden' }} />
}

function CodePanel({ code, logs, onCodeChange, onSyncToCanvas, validationIssues = [] }) {
  const [activeTab, setActiveTab] = useState('code')
  const [copied, setCopied] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [editedCode, setEditedCode] = useState(code)
  
  const errors = validationIssues.filter(i => i.level === 'error')
  const warnings = validationIssues.filter(i => i.level === 'warning')

  useEffect(() => {
    if (!isEditing) {
      setEditedCode(code)
    }
  }, [code, isEditing])

  const copyToClipboard = async (text = null) => {
    try {
      const textToCopy = text || (isEditing ? editedCode : code)
      await navigator.clipboard.writeText(textToCopy)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('Failed to copy:', err)
    }
  }

  const handleEdit = () => {
    setIsEditing(true)
  }

  const handleSave = () => {
    onCodeChange?.(editedCode)
    setIsEditing(false)
  }

  const handleCancel = () => {
    setEditedCode(code)
    setIsEditing(false)
  }

  return (
    <div className="code-panel">
      {errors.length > 0 && (
        <div className="validation-banner error" style={{ background: '#fee2e2', color: '#991b1b', padding: '12px', borderRadius: '4px', marginBottom: '12px' }}>
          <strong>Export Errors ({errors.length}):</strong>
          <ul style={{ margin: '8px 0 0 0', paddingLeft: '20px' }}>
            {errors.map((err, i) => (
              <li key={i}>{err.message}</li>
            ))}
          </ul>
        </div>
      )}
      {warnings.length > 0 && errors.length === 0 && (
        <div className="validation-banner warning" style={{ background: '#fef3c7', color: '#92400e', padding: '12px', borderRadius: '4px', marginBottom: '12px' }}>
          <strong>Warnings ({warnings.length}):</strong>
          <ul style={{ margin: '8px 0 0 0', paddingLeft: '20px' }}>
            {warnings.map((warn, i) => (
              <li key={i}>{warn.message}</li>
            ))}
          </ul>
        </div>
      )}
      
      <div className="code-tabs">
        <button
          className={`code-tab ${activeTab === 'code' ? 'active' : ''}`}
          onClick={() => setActiveTab('code')}
        >
          Python Code
        </button>
        <button
          className={`code-tab ${activeTab === 'logs' ? 'active' : ''}`}
          onClick={() => setActiveTab('logs')}
        >
          Render Logs
        </button>
        
        {activeTab === 'code' && (
          <div className="code-actions">
            {isEditing ? (
              <>
                <button className="action-btn save-btn" onClick={handleSave}>
                  ✓ Save
                </button>
                {onSyncToCanvas && (
                  <button className="action-btn sync-btn" onClick={() => onSyncToCanvas(editedCode)} title="Parse Python code and sync objects to the canvas">
                    Sync to Canvas
                  </button>
                )}
                <button className="action-btn cancel-btn" onClick={handleCancel}>
                  ✕ Cancel
                </button>
              </>
            ) : (
              <>
                <button className="action-btn edit-btn" onClick={handleEdit}>
                  Edit
                </button>
                {onSyncToCanvas && (
                  <button className="action-btn sync-btn" onClick={() => onSyncToCanvas(code)} title="Parse Python code and sync objects to the canvas">
                    Sync to Canvas
                  </button>
                )}
                <button className="copy-btn" onClick={() => copyToClipboard()}>
                  {copied ? 'Copied' : 'Copy'}
                </button>
              </>
            )}
          </div>
        )}
      </div>
      
      <div className="code-content">
        {activeTab === 'code' ? (
          isEditing ? (
            <CodeMirrorEditor
              value={editedCode}
              onChange={setEditedCode}
            />
          ) : (
            <pre className="code-block">
              <code>{code || '# No code generated yet'}</code>
            </pre>
          )
        ) : (
          <>
            {logs && (
              <div style={{ marginBottom: '8px', textAlign: 'right' }}>
                <button
                  className="action-btn"
                  onClick={() => copyToClipboard(logs)}
                  style={{ fontSize: '12px', padding: '4px 8px' }}
                >
                  {copied ? 'Copied' : 'Copy Logs'}
                </button>
              </div>
            )}
            <pre className="logs-block">
              {logs || 'No render logs yet. Click "Preview" to render.'}
            </pre>
          </>
        )}
      </div>
    </div>
  )
}

export default CodePanel
