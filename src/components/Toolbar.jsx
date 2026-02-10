import React from 'react'
import './Toolbar.css'

function Toolbar({ onSave, onLoad, onClearAll, canClearAll, onRender, isRendering, onLoadDemo, onOpenAI }) {
  return (
    <div className="toolbar">
      <div className="toolbar-brand">
        <span className="brand-icon">▶</span>
        <span className="brand-text">ManimInteractive</span>
      </div>
      
      <div className="toolbar-actions">
        <button className="toolbar-btn" onClick={onLoad} title="Open Project">
          <span className="btn-label">Open</span>
        </button>
        
        <button className="toolbar-btn" onClick={onSave} title="Save Project">
          <span className="btn-label">Save</span>
        </button>

        <button
          className="toolbar-btn danger"
          onClick={onClearAll}
          disabled={!canClearAll}
          title="Clear all objects in the current scene"
        >
          <span className="btn-label">Clear All</span>
        </button>
        
        <div className="toolbar-divider" />
        
        {onLoadDemo && (
          <button 
            className="toolbar-btn" 
            onClick={onLoadDemo}
            title="Load Demo Scene - Shows composable graph tools in action"
          >
            <span className="btn-label">Load Demo</span>
          </button>
        )}
        
        <div className="toolbar-divider" />
        
        {onOpenAI && (
          <button
            className="toolbar-btn"
            onClick={onOpenAI}
            title="AI Assistant (ops-based)"
          >
            <span className="btn-label">AI</span>
          </button>
        )}

        <button 
          className="toolbar-btn" 
          onClick={() => window.location.reload()}
          title="Refresh App (Dev Mode - Reloads without losing data)"
        >
          <span className="btn-label">Refresh</span>
        </button>
        
        <button 
          className="toolbar-btn primary" 
          onClick={onRender}
          disabled={isRendering}
          title="Preview Animation (Low Quality)"
        >
          <span className="btn-label">{isRendering ? 'Rendering...' : 'Preview'}</span>
        </button>
      </div>
    </div>
  )
}

export default Toolbar

