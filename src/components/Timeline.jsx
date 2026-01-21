import React, { useEffect, useMemo, useState, useRef, useCallback } from 'react'
import './Timeline.css'
import { getObjectDisplayName as getObjectDisplayNameHelper, getObjectTypeDisplayName } from '../utils/objectLabel'

function Timeline({ scene, selectedObjectId, currentTime, onTimeChange, onAddKeyframe, onSelectObject, onUpdateObject }) {
  const [isPlaying, setIsPlaying] = useState(false)
  const [dragState, setDragState] = useState(null)
  const trackRefs = useRef({})
  const rowRefs = useRef({})
  const [editingObjectId, setEditingObjectId] = useState(null)
  const [editingName, setEditingName] = useState('')
  const editInputRef = useRef(null)
  
  const duration = scene?.duration || 5
  const selectedObject = scene?.objects.find(o => o.id === selectedObjectId)

  const objectsById = useMemo(() => {
    const map = new Map()
    scene?.objects?.forEach(o => map.set(o.id, o))
    return map
  }, [scene?.objects])

  const getRootId = useCallback((obj) => {
    let cur = obj
    const seen = new Set()
    while (cur?.transformFromId && objectsById.has(cur.transformFromId) && !seen.has(cur.transformFromId)) {
      seen.add(cur.transformFromId)
      cur = objectsById.get(cur.transformFromId)
    }
    return cur?.id || obj.id
  }, [objectsById])

  const rows = useMemo(() => {
    const objs = scene?.objects || []
    const map = new Map()
    const order = []

    for (const obj of objs) {
      const rootId = getRootId(obj)
      if (!map.has(rootId)) {
        map.set(rootId, { rootId, objects: [] })
        order.push(rootId)
      }
      map.get(rootId).objects.push(obj)
    }

    // Preserve original insertion order of roots, but sort clips in-row by time
    return order.map(rootId => {
      const row = map.get(rootId)
      row.objects = [...row.objects].sort((a, b) => (a.delay || 0) - (b.delay || 0))
      return row
    })
  }, [scene?.objects, getRootId])

  useEffect(() => {
    if (editingObjectId) {
      // Focus + select for quick rename
      setTimeout(() => {
        editInputRef.current?.focus()
        editInputRef.current?.select?.()
      }, 0)
    }
  }, [editingObjectId])

  const handleTimeChange = (e) => {
    onTimeChange?.(parseFloat(e.target.value))
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

  // Handle drag start for clip edges
  const handleDragStart = useCallback((e, obj, dragType) => {
    e.preventDefault()
    e.stopPropagation()
    
    const rootId = getRootId(obj)
    const trackElement = trackRefs.current[rootId]
    if (!trackElement) return
    
    const rect = trackElement.getBoundingClientRect()
    const startX = e.clientX
    const startY = e.clientY
    const initialDelay = obj.delay || 0
    const initialRunTime = obj.runTime || 1
    
    setDragState({
      objectId: obj.id,
      dragType,
      startX,
      startY,
      initialDelay,
      initialRunTime,
      trackRect: rect,
      initialRootId: rootId,
      hoverRootId: rootId,
      snapTargetId: null,
      snapDelay: null,
      initialTransformFromId: obj.transformFromId || null
    })
    
    // Select the object when starting to drag
    onSelectObject?.(obj.id)
  }, [getRootId, onSelectObject])

  // Handle drag move
  const handleMouseMove = useCallback((e) => {
    if (!dragState) return
    
    const { objectId, dragType, startX, initialDelay, initialRunTime, trackRect, initialRootId } = dragState
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

    // Detect which row we're hovering over (vertical drag)
    let hoverRootId = null
    for (const row of rows) {
      const el = rowRefs.current[row.rootId]
      if (!el) continue
      const r = el.getBoundingClientRect()
      if (e.clientY >= r.top && e.clientY <= r.bottom) {
        hoverRootId = row.rootId
        break
      }
    }
    // If we didn't find a row under the cursor, treat it as "outside" (drop will detach).

    // If hovering another row, snap to the nearest clip end in that row
    let snapTargetId = null
    let snapDelay = null
    const SNAP_TIME_THRESHOLD = 0.2
    if (hoverRootId && hoverRootId !== initialRootId) {
      const row = rows.find(r => r.rootId === hoverRootId)
      if (row) {
        let best = { dist: Infinity, targetId: null, t: null }
        for (const candidate of row.objects) {
          if (candidate.id === objectId) continue
          const endT = (candidate.delay || 0) + (candidate.runTime || 1)
          const dist = Math.abs(endT - newDelay)
          if (dist < best.dist) best = { dist, targetId: candidate.id, t: endT }
        }
        if (best.targetId && best.dist <= SNAP_TIME_THRESHOLD) {
          snapTargetId = best.targetId
          snapDelay = Math.max(0, Math.min(duration - newRunTime, best.t))
          newDelay = snapDelay
        }
      }
    }

    // Snap to other clip times (start/end) across all rows
    const snapCandidates = []
    rows.forEach(r => {
      r.objects.forEach(o => {
        if (o.id === objectId) return
        const d = o.delay || 0
        const rt = o.runTime || 1
        snapCandidates.push(d, d + rt)
      })
    })

    const nearestTime = (t) => {
      let best = { dist: Infinity, t }
      for (const c of snapCandidates) {
        const dist = Math.abs(c - t)
        if (dist < best.dist) best = { dist, t: c }
      }
      return best
    }

    if (snapCandidates.length > 0) {
      if (dragType === 'move') {
        const best = nearestTime(newDelay)
        if (best.dist <= SNAP_TIME_THRESHOLD) {
          const maxDelay = duration - newRunTime
          newDelay = Math.max(0, Math.min(maxDelay, best.t))
        }
      } else if (dragType === 'start') {
        const best = nearestTime(newDelay)
        if (best.dist <= SNAP_TIME_THRESHOLD) {
          const minStart = 0
          const maxStart = initialDelay + initialRunTime - 0.1
          const snapped = Math.max(minStart, Math.min(maxStart, best.t))
          newDelay = snapped
          newRunTime = initialRunTime - (newDelay - initialDelay)
        }
      } else if (dragType === 'end') {
        const endTime = newDelay + newRunTime
        const best = nearestTime(endTime)
        if (best.dist <= SNAP_TIME_THRESHOLD) {
          const minEnd = newDelay + 0.1
          const maxEnd = duration
          const snappedEnd = Math.max(minEnd, Math.min(maxEnd, best.t))
          newRunTime = Math.max(0.1, snappedEnd - newDelay)
        }
      }
    }

    // Update local drag state for visual feedback / mouseup behavior
    setDragState(prev => prev ? ({
      ...prev,
      hoverRootId,
      snapTargetId,
      snapDelay
    }) : prev)
    
    onUpdateObject?.(objectId, { 
      delay: Math.round(newDelay * 100) / 100, 
      runTime: Math.round(newRunTime * 100) / 100 
    })
  }, [dragState, duration, onUpdateObject, rows])

  // Handle drag end
  const handleMouseUp = useCallback(() => {
    if (!dragState) return

    const { objectId, hoverRootId, initialRootId, snapTargetId, snapDelay } = dragState
    const dragged = objectsById.get(objectId)

    // If we snapped onto another row, link as a transform and "stick" to that row.
    if (hoverRootId && hoverRootId !== initialRootId && snapTargetId && typeof snapDelay === 'number') {
      onUpdateObject?.(objectId, {
        delay: Math.round(snapDelay * 100) / 100,
        transformFromId: snapTargetId,
        transformType: objectsById.get(objectId)?.transformType || 'Transform'
      })
    } else {
      // Dropping outside the original row (or onto another row without snapping) should detach.
      const droppedOutside = !hoverRootId
      const droppedOtherRow = hoverRootId && hoverRootId !== initialRootId
      if (droppedOutside || droppedOtherRow) {
        // If it's a transform target, detaching is just clearing transformFromId.
        if (dragged?.transformFromId) {
          onUpdateObject?.(objectId, { transformFromId: null })
        } else if (objectId === initialRootId) {
          // Special case: dragging the root out should split the chain so the rest stays behind.
          // Re-root any direct children so they no longer follow this root.
          const children = (scene?.objects || []).filter(o => o.transformFromId === objectId)
          children.forEach(child => {
            onUpdateObject?.(child.id, { transformFromId: null })
          })
        }
      }
    }

    setDragState(null)
  }, [dragState, objectsById, onUpdateObject, scene?.objects])

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

  const getObjectDisplayName = (obj) => {
    return getObjectDisplayNameHelper(obj, scene?.objects || [])
  }
  
  const getObjectTypeBadge = (obj) => {
    return getObjectTypeDisplayName(obj.type)
  }
  
  // Check if an object is part of a composable chain
  const isPartOfComposableChain = (obj) => {
    if (obj.type === 'graph') {
      // Graph has cursor/tangent/limit tools
      return (scene?.objects || []).some(o => 
        (o.type === 'graphCursor' || o.type === 'tangentLine' || o.type === 'limitProbe' || o.type === 'valueLabel') &&
        (o.graphId === obj.id || o.cursorId && (scene?.objects || []).find(c => c.id === o.cursorId)?.graphId === obj.id)
      )
    }
    if (obj.type === 'graphCursor') {
      // Cursor has tangent/limit/label tools
      return (scene?.objects || []).some(o => 
        (o.type === 'tangentLine' || o.type === 'limitProbe' || o.type === 'valueLabel') &&
        o.cursorId === obj.id
      )
    }
    return false
  }

  const getObjectColor = (obj) => {
    // Prefer user-chosen colors
    // - filled shapes: fill
    // - strokes: stroke
    // - function-like: color
    // fallback to type palette
    return obj.fill || obj.stroke || obj.color || getClipColor(obj.type)
  }

  const getRowDisplayName = (row) => {
    const rootObj = objectsById.get(row.rootId) || row.objects[0]
    if (!rootObj) return 'object'
    if ((row.objects?.length || 0) <= 1) return getObjectDisplayName(rootObj)
    const sorted = [...row.objects].sort((a, b) => (a.delay || 0) - (b.delay || 0))
    const last = sorted[sorted.length - 1]
    const rootName = getObjectDisplayName(rootObj)
    const lastName = getObjectDisplayName(last)
    const mid = Math.max(0, sorted.length - 2)
    return mid > 0 ? `${rootName} → ${lastName} (+${mid})` : `${rootName} → ${lastName}`
  }

  const beginRename = (obj) => {
    setEditingObjectId(obj.id)
    setEditingName(obj.name || '')
    onSelectObject?.(obj.id)
  }

  const commitRename = useCallback(() => {
    if (!editingObjectId) return
    const trimmed = (editingName || '').trim()
    onUpdateObject?.(editingObjectId, { name: trimmed || null })
    setEditingObjectId(null)
    setEditingName('')
  }, [editingName, editingObjectId, onUpdateObject])

  const cancelRename = useCallback(() => {
    setEditingObjectId(null)
    setEditingName('')
  }, [])

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
              Position
            </button>
            <button 
              className="keyframe-btn"
              onClick={() => handleAddKeyframe('opacity')}
              title="Opacity keyframe"
            >
              Opacity
            </button>
            <button 
              className="keyframe-btn"
              onClick={() => handleAddKeyframe('rotation')}
              title="Rotation keyframe"
            >
              Rotation
            </button>
            {selectedObject.type === 'graphCursor' && (
              <button 
                className="keyframe-btn"
                onClick={() => handleAddKeyframe('x0')}
                title="Cursor x-position keyframe"
              >
                X Position
              </button>
            )}
            {selectedObject.type === 'tangentLine' && (
              <button 
                className="keyframe-btn"
                onClick={() => handleAddKeyframe('visibleSpan')}
                title="Tangent span keyframe"
              >
                Span
              </button>
            )}
            {selectedObject.type === 'limitProbe' && (
              <button 
                className="keyframe-btn"
                onClick={() => handleAddKeyframe('x0')}
                title="Limit point keyframe"
              >
                Limit Point
              </button>
            )}
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
        {rows.map(row => {
          const rootObj = objectsById.get(row.rootId) || row.objects[0]
          const rowColor = rootObj ? getObjectColor(rootObj) : getClipColor(rootObj?.type)
          const isHoverRow = dragState?.hoverRootId === row.rootId && dragState?.hoverRootId !== dragState?.initialRootId
          const isEditingRowLabel = editingObjectId === row.rootId
          const rowName = getRowDisplayName(row)

          return (
            <div
              key={row.rootId}
              ref={el => rowRefs.current[row.rootId] = el}
              className={`timeline-track ${isHoverRow ? 'hover-target' : ''}`}
            >
              <div className="track-label">
                <span className="track-icon" style={{ backgroundColor: rowColor }} />
                {rootObj && (
                  <span 
                    className="track-type-badge"
                    style={{ fontSize: '10px', color: '#9ca3af', marginRight: '4px' }}
                    title={getObjectTypeBadge(rootObj)}
                  >
                    {getObjectTypeBadge(rootObj).substring(0, 3)}
                  </span>
                )}
                <span
                  className="track-name"
                  onDoubleClick={(e) => {
                    e.stopPropagation()
                    if (rootObj) beginRename(rootObj)
                  }}
                  title="Double-click to rename"
                >
                  {rowName}
                </span>
                {rootObj && isPartOfComposableChain(rootObj) && (
                  <span style={{ fontSize: '10px', color: '#3b82f6', marginLeft: '4px' }} title="Has linked tools">
                    →
                  </span>
                )}
              </div>
              <div
                className="track-bar"
                ref={el => trackRefs.current[row.rootId] = el}
              >
                {row.objects.map(obj => {
                  const isSelected = obj.id === selectedObjectId
                  const isDragging = dragState?.objectId === obj.id
                  const clipStyle = getClipStyle(obj)
                  const clipColor = getObjectColor(obj)
                  const isSnapSource = dragState?.snapTargetId === obj.id
                  const isEditing = editingObjectId === obj.id

                  return (
                    <div
                      key={obj.id}
                      className={`timeline-clip ${isDragging ? 'dragging' : ''} ${isSnapSource ? 'snap-source' : ''} ${isSelected ? 'selected' : ''}`}
                      style={{
                        ...clipStyle,
                        backgroundColor: clipColor,
                        borderColor: isSelected ? '#fff' : clipColor
                      }}
                      onMouseDown={(e) => handleDragStart(e, obj, 'move')}
                      onClick={(e) => {
                        e.stopPropagation()
                        onSelectObject?.(obj.id)
                      }}
                      onDoubleClick={(e) => {
                        e.stopPropagation()
                        beginRename(obj)
                      }}
                    >
                      <div
                        className="clip-handle clip-handle-start"
                        onMouseDown={(e) => handleDragStart(e, obj, 'start')}
                      />
                      {isEditing ? (
                        <input
                          ref={editInputRef}
                          className="clip-name-input"
                          value={editingName}
                          onChange={(e) => setEditingName(e.target.value)}
                          onBlur={commitRename}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault()
                              commitRename()
                            } else if (e.key === 'Escape') {
                              e.preventDefault()
                              cancelRename()
                            }
                          }}
                          placeholder={getObjectDisplayName(obj)}
                        />
                      ) : (
                        <span className="clip-label" title={`${getObjectTypeBadge(obj)} - Double-click to rename`}>
                          {getObjectDisplayName(obj)}
                        </span>
                      )}
                      <div
                        className="clip-handle clip-handle-end"
                        onMouseDown={(e) => handleDragStart(e, obj, 'end')}
                      />
                    </div>
                  )
                })}

                {/* Keyframe markers for selected object only (avoids clutter in grouped rows) */}
                {selectedObject?.keyframes?.map((kf, i) => (
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
