import React, { useState, useRef, useEffect } from 'react'
import './CodePanel.css'

function CodePanel({ code, logs, onCodeChange }) {
  const [activeTab, setActiveTab] = useState('code')
  const [copied, setCopied] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [editedCode, setEditedCode] = useState(code)
  const textareaRef = useRef(null)

  useEffect(() => {
    if (!isEditing) {
      setEditedCode(code)
    }
  }, [code, isEditing])

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(isEditing ? editedCode : code)
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
                  ✎ Edit
                </button>
                <button className="copy-btn" onClick={copyToClipboard}>
                  {copied ? '✓ Copied' : '📋 Copy'}
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
          <pre className="logs-block">
            {logs || 'No render logs yet. Click "Preview" to render.'}
          </pre>
        )}
      </div>
    </div>
  )
}

export default CodePanel

