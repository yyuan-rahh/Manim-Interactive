import React, { useState } from 'react'
import './CodePanel.css'

function CodePanel({ code, logs }) {
  const [activeTab, setActiveTab] = useState('code')
  const [copied, setCopied] = useState(false)

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('Failed to copy:', err)
    }
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
          <button className="copy-btn" onClick={copyToClipboard}>
            {copied ? '✓ Copied' : '📋 Copy'}
          </button>
        )}
      </div>
      
      <div className="code-content">
        {activeTab === 'code' ? (
          <pre className="code-block">
            <code>{code || '# No code generated yet'}</code>
          </pre>
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

