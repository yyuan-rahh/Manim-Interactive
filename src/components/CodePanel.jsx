import React, { useState, useRef, useEffect } from 'react'
import './CodePanel.css'

function CodePanel({ code, logs, onCodeChange, validationIssues = [] }) {
  const [activeTab, setActiveTab] = useState('code')
  const [copied, setCopied] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [editedCode, setEditedCode] = useState(code)
  const textareaRef = useRef(null)
  
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
    setTimeout(() => textareaRef.current?.focus(), 0)
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
                <button className="action-btn cancel-btn" onClick={handleCancel}>
                  ✕ Cancel
                </button>
              </>
            ) : (
              <>
                <button className="action-btn edit-btn" onClick={handleEdit}>
                  Edit
                </button>
          <button className="copy-btn" onClick={copyToClipboard}>
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
            <textarea
              ref={textareaRef}
              className="code-editor"
              value={editedCode}
              onChange={(e) => setEditedCode(e.target.value)}
              spellCheck={false}
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

