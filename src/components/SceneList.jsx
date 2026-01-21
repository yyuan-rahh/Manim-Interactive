import React, { useState } from 'react'
import './SceneList.css'

function SceneList({
  scenes,
  activeSceneId,
  onSelectScene,
  onAddScene,
  onDeleteScene,
  onRenameScene,
  onDuplicateScene,
  onReorderScenes
}) {
  const [editingId, setEditingId] = useState(null)
  const [editName, setEditName] = useState('')
  const [draggedIndex, setDraggedIndex] = useState(null)

  const startEditing = (scene) => {
    setEditingId(scene.id)
    setEditName(scene.name)
  }

  const finishEditing = () => {
    if (editingId && editName.trim()) {
      onRenameScene(editingId, editName.trim())
    }
    setEditingId(null)
    setEditName('')
  }

  const handleDragStart = (e, index) => {
    setDraggedIndex(index)
    e.dataTransfer.effectAllowed = 'move'
  }

  const handleDragOver = (e, index) => {
    e.preventDefault()
    if (draggedIndex === null || draggedIndex === index) return
  }

  const handleDrop = (e, index) => {
    e.preventDefault()
    if (draggedIndex !== null && draggedIndex !== index) {
      onReorderScenes(draggedIndex, index)
    }
    setDraggedIndex(null)
  }

  return (
    <div className="scene-list">
      <div className="scene-list-header">
        <h3>Scenes</h3>
        <button className="add-scene-btn" onClick={onAddScene} title="Add Scene">
          +
        </button>
      </div>
      
      <div className="scenes">
        {scenes.map((scene, index) => (
          <div
            key={scene.id}
            className={`scene-item ${scene.id === activeSceneId ? 'active' : ''}`}
            onClick={() => onSelectScene(scene.id)}
            draggable
            onDragStart={(e) => handleDragStart(e, index)}
            onDragOver={(e) => handleDragOver(e, index)}
            onDrop={(e) => handleDrop(e, index)}
          >
            <div className="scene-thumbnail">
              <span className="scene-number">{index + 1}</span>
            </div>
            
            <div className="scene-info">
              {editingId === scene.id ? (
                <input
                  className="scene-name-input"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  onBlur={finishEditing}
                  onKeyDown={(e) => e.key === 'Enter' && finishEditing()}
                  autoFocus
                  onClick={(e) => e.stopPropagation()}
                />
              ) : (
                <span 
                  className="scene-name"
                  onDoubleClick={() => startEditing(scene)}
                >
                  {scene.name}
                </span>
              )}
              <span className="scene-duration">{scene.duration}s</span>
            </div>
            
            <div className="scene-actions">
              <button
                className="scene-action-btn"
                onClick={(e) => {
                  e.stopPropagation()
                  onDuplicateScene(scene.id)
                }}
                title="Duplicate"
              >
                Dup
              </button>
              {scenes.length > 1 && (
                <button
                  className="scene-action-btn delete"
                  onClick={(e) => {
                    e.stopPropagation()
                    onDeleteScene(scene.id)
                  }}
                  title="Delete"
                >
                  ×
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default SceneList

