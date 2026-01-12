import React from 'react'
import './Toolbar.css'

function Toolbar({ onSave, onLoad, onRender, isRendering }) {
  return (
    <div className="toolbar">
      <div className="toolbar-brand">
        <span className="brand-icon">▶</span>
        <span className="brand-text">ManimInteractive</span>
      </div>
      
      <div className="toolbar-actions">
        <button className="toolbar-btn" onClick={onLoad} title="Open Project">
          <span className="btn-icon">📂</span>
          <span className="btn-label">Open</span>
        </button>
        
        <button className="toolbar-btn" onClick={onSave} title="Save Project">
          <span className="btn-icon">💾</span>
          <span className="btn-label">Save</span>
        </button>
        
        <div className="toolbar-divider" />
        
        <button 
          className="toolbar-btn primary" 
          onClick={onRender}
          disabled={isRendering}
          title="Preview Animation (Low Quality)"
        >
          <span className="btn-icon">{isRendering ? '⏳' : '▶️'}</span>
          <span className="btn-label">{isRendering ? 'Rendering...' : 'Preview'}</span>
        </button>
      </div>
    </div>
  )
}

export default Toolbar

