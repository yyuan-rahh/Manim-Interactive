import React from 'react'

/**
 * Right-click context menu shown on the canvas.
 */
function CanvasContextMenu({ contextMenu, selectedObjectIds, onDuplicateObject, onDeleteObject, onClose }) {
  if (!contextMenu.open) return null

  return (
    <div
      className="canvas-context-menu"
      style={{ left: contextMenu.x, top: contextMenu.y }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <button
        className="canvas-context-item"
        onClick={() => {
          if (contextMenu.objectId) {
            if (selectedObjectIds.includes(contextMenu.objectId) && selectedObjectIds.length > 1) {
              selectedObjectIds.forEach(id => onDuplicateObject?.(id))
            } else {
              onDuplicateObject?.(contextMenu.objectId)
            }
          }
          onClose()
        }}
      >
        Duplicate {selectedObjectIds.length > 1 ? `(${selectedObjectIds.length})` : ''}
      </button>
      <button
        className="canvas-context-item danger"
        onClick={() => {
          if (contextMenu.objectId) onDeleteObject?.(contextMenu.objectId)
          onClose()
        }}
      >
        Delete
      </button>
    </div>
  )
}

export default React.memo(CanvasContextMenu)
