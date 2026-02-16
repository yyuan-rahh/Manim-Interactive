import React from 'react'
import { PALETTE_CATEGORIES } from './constants'

/**
 * Object palette toolbar rendered above the canvas.
 */
function CanvasPalette({ onAddObject, snapEnabled, onToggleSnap, viewTransform, onResetView }) {
  return (
    <div className="shape-palette">
      {PALETTE_CATEGORIES.map(cat => (
        <React.Fragment key={cat.name}>
          <div className="palette-category-label">{cat.name}</div>
          {cat.items.map(shape => (
            <div key={shape.type} className="palette-item-wrapper">
              <button
                className="palette-item"
                onClick={(e) => { e.stopPropagation(); onAddObject(shape.type) }}
                title={shape.shortcut ? `${shape.label} (${shape.shortcut})` : shape.label}
              >
                <span className="palette-icon">{shape.icon}</span>
                <span className="palette-label">{shape.label}</span>
                {shape.shortcut && <span className="palette-shortcut">{shape.shortcut}</span>}
              </button>
            </div>
          ))}
        </React.Fragment>
      ))}

      <div className="palette-divider" />

      <button
        className={`palette-item snap-toggle ${snapEnabled ? 'active' : ''}`}
        onClick={onToggleSnap}
        title={snapEnabled ? 'Snapping ON (click to disable)' : 'Snapping OFF (click to enable)'}
        style={snapEnabled ? { background: '#3b82f6', color: 'white' } : {}}
      >
        <span className="palette-icon">⊞</span>
        <span className="palette-label">{snapEnabled ? 'Snap ON' : 'Snap OFF'}</span>
      </button>

      <button
        className="palette-item"
        onClick={onResetView}
        title="Reset zoom/pan (1:1)"
        style={viewTransform.scale !== 1 || viewTransform.offsetX !== 0 || viewTransform.offsetY !== 0 ? { background: '#f59e0b', color: '#000' } : {}}
      >
        <span className="palette-icon">{Math.round(viewTransform.scale * 100)}%</span>
        <span className="palette-label">Zoom</span>
      </button>
    </div>
  )
}

export default React.memo(CanvasPalette)
