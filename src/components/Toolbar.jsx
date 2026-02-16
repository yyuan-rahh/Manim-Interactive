import React, { useState } from 'react'
import './Toolbar.css'

const QUALITY_OPTIONS = [
  { value: 'draft', label: 'Draft', desc: '240p 10fps', flag: '-ql' },
  { value: 'low', label: 'Preview', desc: '480p 15fps', flag: '-ql' },
  { value: 'medium', label: 'Medium', desc: '720p 30fps', flag: '-qm' },
  { value: 'high', label: 'Final', desc: '1080p 60fps', flag: '-qh' },
]

function Toolbar({ onSave, onLoad, onClearAll, canClearAll, onRender, isRendering, onLoadDemo, onOpenAI, renderQuality, onRenderQualityChange }) {
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
        
        <div className="toolbar-divider" />

        <select
          className="toolbar-quality-select"
          value={renderQuality || 'low'}
          onChange={(e) => onRenderQualityChange?.(e.target.value)}
          title="Render quality"
        >
          {QUALITY_OPTIONS.map(opt => (
            <option key={opt.value} value={opt.value}>
              {opt.label} ({opt.desc})
            </option>
          ))}
        </select>

        <button 
          className="toolbar-btn primary" 
          onClick={onRender}
          disabled={isRendering}
          title={`Render Animation (${QUALITY_OPTIONS.find(o => o.value === (renderQuality || 'low'))?.desc || 'Preview'})`}
        >
          <span className="btn-label">{isRendering ? 'Rendering...' : 'Render'}</span>
        </button>
      </div>
    </div>
  )
}

export default Toolbar
