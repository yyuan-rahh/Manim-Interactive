import React, { useState } from 'react'
import './Timeline.css'

function Timeline({ scene, selectedObjectId, onAddKeyframe }) {
  const [currentTime, setCurrentTime] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  
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
      
      <div className="timeline-tracks">
        {scene?.objects.map(obj => (
          <div 
            key={obj.id}
            className={`timeline-track ${obj.id === selectedObjectId ? 'selected' : ''}`}
          >
            <div className="track-label">
              {obj.type}
            </div>
            <div className="track-bar">
              {obj.keyframes?.map((kf, i) => (
                <div
                  key={i}
                  className="keyframe-marker"
                  style={{ left: `${(kf.time / duration) * 100}%` }}
                  title={`${kf.property}: ${kf.value} @ ${kf.time}s`}
                />
              ))}
              <div 
                className="playhead"
                style={{ left: `${(currentTime / duration) * 100}%` }}
              />
            </div>
          </div>
        ))}
        
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

