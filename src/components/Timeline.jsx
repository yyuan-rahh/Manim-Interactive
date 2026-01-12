import React, { useState, useRef, useCallback } from 'react'
import './Timeline.css'

function Timeline({ scene, selectedObjectId, onAddKeyframe, onSelectObject, onUpdateObject }) {
  const [currentTime, setCurrentTime] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [dragState, setDragState] = useState(null)
  const trackRefs = useRef({})
  
  const duration = scene?.duration || 5
  const selectedObject = scene?.objects.find(o => o.id === selectedObjectId)

  const handleTimeChange = (e) => {
    setCurrentTime(parseFloat(e.target.value))
  }

  const handleAddKeyframe = (property) => {
    if (!selectedObjectId || !selectedObject) return
    
    const value = selectedObject[property]
    onAddKeyframe(selectedObjectId, currentTime, property, value)
  }

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60)
    const secs = (seconds % 60).toFixed(1)
    return `${mins}:${secs.padStart(4, '0')}`
  }

  // Convert pixel position to time
  const pixelToTime = useCallback((px, trackElement) => {
    if (!trackElement) return 0
    const rect = trackElement.getBoundingClientRect()
    const ratio = Math.max(0, Math.min(1, px / rect.width))
    return ratio * duration
  }, [duration])

  // Handle drag start for clip edges
  const handleDragStart = useCallback((e, obj, dragType) => {
    e.preventDefault()
    e.stopPropagation()
    
    const trackElement = trackRefs.current[obj.id]
    if (!trackElement) return
    
    const rect = trackElement.getBoundingClientRect()
    const startX = e.clientX
    const initialDelay = obj.delay || 0
    const initialRunTime = obj.runTime || 1
    
    setDragState({
      objectId: obj.id,
      dragType,
      startX,
      initialDelay,
      initialRunTime,
      trackRect: rect
    })
    
    // Select the object when starting to drag
    onSelectObject?.(obj.id)
  }, [onSelectObject])

  // Handle drag move
  const handleMouseMove = useCallback((e) => {
    if (!dragState) return
    
    const { objectId, dragType, startX, initialDelay, initialRunTime, trackRect } = dragState
    const deltaX = e.clientX - startX
    const deltaTime = (deltaX / trackRect.width) * duration
    
    let newDelay = initialDelay
    let newRunTime = initialRunTime
    
    if (dragType === 'start') {
      // Dragging the start handle
      newDelay = Math.max(0, Math.min(initialDelay + initialRunTime - 0.1, initialDelay + deltaTime))
      newRunTime = initialRunTime - (newDelay - initialDelay)
    } else if (dragType === 'end') {
      // Dragging the end handle
      newRunTime = Math.max(0.1, Math.min(duration - initialDelay, initialRunTime + deltaTime))
    } else if (dragType === 'move') {
      // Dragging the entire clip
      const maxDelay = duration - initialRunTime
      newDelay = Math.max(0, Math.min(maxDelay, initialDelay + deltaTime))
    }
    
    onUpdateObject?.(objectId, { 
      delay: Math.round(newDelay * 100) / 100, 
      runTime: Math.round(newRunTime * 100) / 100 
    })
  }, [dragState, duration, onUpdateObject])

  // Handle drag end
  const handleMouseUp = useCallback(() => {
    setDragState(null)
  }, [])

  // Attach global mouse listeners when dragging
  React.useEffect(() => {
    if (dragState) {
      window.addEventListener('mousemove', handleMouseMove)
      window.addEventListener('mouseup', handleMouseUp)
      return () => {
        window.removeEventListener('mousemove', handleMouseMove)
        window.removeEventListener('mouseup', handleMouseUp)
      }
    }
  }, [dragState, handleMouseMove, handleMouseUp])

  // Calculate clip position and width
  const getClipStyle = (obj) => {
    const delay = obj.delay || 0
    const runTime = obj.runTime || 1
    const left = (delay / duration) * 100
    const width = (runTime / duration) * 100
    return { left: `${left}%`, width: `${width}%` }
  }

  // Get color based on object type
  const getClipColor = (type) => {
    const colors = {
      rectangle: '#e94560',
      circle: '#4ade80',
      triangle: '#f59e0b',
      text: '#60a5fa',
      latex: '#a78bfa',
      line: '#94a3b8',
      arrow: '#fbbf24',
      dot: '#f472b6',
      polygon: '#8b5cf6'
    }
    return colors[type] || '#6b7280'
  }

  return (
    <div className="timeline">
      <div className="timeline-controls">
        <button 
          className="timeline-btn play-btn"
          onClick={() => setIsPlaying(!isPlaying)}
        >
          {isPlaying ? '⏸' : '▶'}
        </button>
        
        <span className="time-display">
          {formatTime(currentTime)} / {formatTime(duration)}
        </span>
        
        <input
          type="range"
          className="time-slider"
          min="0"
          max={duration}
          step="0.1"
          value={currentTime}
          onChange={handleTimeChange}
        />
        
        {selectedObject && (
          <div className="keyframe-actions">
            <span className="keyframe-label">Add keyframe:</span>
            <button 
              className="keyframe-btn"
              onClick={() => handleAddKeyframe('x')}
              title="Position keyframe"
            >
              📍 Position
            </button>
            <button 
              className="keyframe-btn"
              onClick={() => handleAddKeyframe('opacity')}
              title="Opacity keyframe"
            >
              👁 Opacity
            </button>
            <button 
              className="keyframe-btn"
              onClick={() => handleAddKeyframe('rotation')}
              title="Rotation keyframe"
            >
              🔄 Rotation
            </button>
          </div>
        )}
      </div>

      {/* Time ruler */}
      <div className="timeline-ruler">
        {Array.from({ length: Math.ceil(duration) + 1 }, (_, i) => (
          <div 
            key={i} 
            className="ruler-mark"
            style={{ left: `${(i / duration) * 100}%` }}
          >
            <span className="ruler-label">{i}s</span>
          </div>
        ))}
        <div 
          className="ruler-playhead"
          style={{ left: `${(currentTime / duration) * 100}%` }}
        />
      </div>
      
      <div className="timeline-tracks">
        {scene?.objects.map(obj => {
          const isSelected = obj.id === selectedObjectId
          const isDragging = dragState?.objectId === obj.id
          const clipStyle = getClipStyle(obj)
          const clipColor = getClipColor(obj.type)
          
          return (
            <div 
              key={obj.id}
              className={`timeline-track ${isSelected ? 'selected' : ''}`}
              onClick={() => onSelectObject?.(obj.id)}
            >
              <div className="track-label">
                <span className="track-icon" style={{ backgroundColor: clipColor }} />
                {obj.type}
              </div>
              <div 
                className="track-bar"
                ref={el => trackRefs.current[obj.id] = el}
              >
                {/* Object clip */}
                <div 
                  className={`timeline-clip ${isDragging ? 'dragging' : ''}`}
                  style={{ 
                    ...clipStyle,
                    backgroundColor: clipColor,
                    borderColor: isSelected ? '#fff' : clipColor
                  }}
                  onMouseDown={(e) => handleDragStart(e, obj, 'move')}
                >
                  {/* Start handle */}
                  <div 
                    className="clip-handle clip-handle-start"
                    onMouseDown={(e) => handleDragStart(e, obj, 'start')}
                  />
                  
                  {/* Clip label */}
                  <span className="clip-label">
                    {obj.text || obj.latex || obj.type}
                  </span>
                  
                  {/* End handle */}
                  <div 
                    className="clip-handle clip-handle-end"
                    onMouseDown={(e) => handleDragStart(e, obj, 'end')}
                  />
                </div>

                {/* Keyframe markers */}
                {obj.keyframes?.map((kf, i) => (
                  <div
                    key={i}
                    className="keyframe-marker"
                    style={{ left: `${(kf.time / duration) * 100}%` }}
                    title={`${kf.property}: ${kf.value} @ ${kf.time}s`}
                  />
                ))}
                
                {/* Playhead */}
                <div 
                  className="playhead"
                  style={{ left: `${(currentTime / duration) * 100}%` }}
                />
              </div>
            </div>
          )
        })}
        
        {(!scene?.objects || scene.objects.length === 0) && (
          <div className="timeline-empty">
            Add objects to see them in the timeline
          </div>
        )}
      </div>
    </div>
  )
}

export default Timeline
