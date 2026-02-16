/**
 * VertexLabelEditor – floating <input> that lets the user rename
 * vertex / corner / axis labels by double-clicking a handle.
 *
 * Extracted from Canvas.jsx to keep the component manageable.
 */

import React, { useRef, useEffect } from 'react'

export default function VertexLabelEditor({
  editingVertex,
  setEditingVertex,
  scene,
  onUpdateObject,
  manimToCanvas,
  scaleX,
}) {
  const inputRef = useRef(null)

  useEffect(() => {
    if (editingVertex.objectId) {
      setTimeout(() => inputRef.current?.focus(), 0)
    }
  }, [editingVertex.objectId])

  if (!editingVertex.objectId) return null

  const obj = scene?.objects?.find(o => o.id === editingVertex.objectId)
  if (!obj) return null

  const LABEL_OFFSET = 30
  let labelPos

  // Axes label editing
  if (editingVertex.isAxisLabel && obj.type === 'axes') {
    const xLen = obj.xLength || 8
    const yLen = obj.yLength || 4
    if (editingVertex.axis === 'x') {
      labelPos = manimToCanvas(obj.x + xLen / 2 + 0.5, obj.y)
    } else {
      labelPos = manimToCanvas(obj.x, obj.y + yLen / 2 + 0.5)
    }
  } else if (editingVertex.isCorner && obj.type === 'rectangle') {
    const corners = [
      { x: obj.x - obj.width / 2, y: obj.y + obj.height / 2 },
      { x: obj.x + obj.width / 2, y: obj.y + obj.height / 2 },
      { x: obj.x - obj.width / 2, y: obj.y - obj.height / 2 },
      { x: obj.x + obj.width / 2, y: obj.y - obj.height / 2 },
    ]
    const corner = corners[editingVertex.vertexIndex]
    if (!corner) return null

    const dx = corner.x - obj.x
    const dy = corner.y - obj.y
    const dist = Math.sqrt(dx * dx + dy * dy)

    if (dist > 0.01) {
      const scale = LABEL_OFFSET / scaleX
      labelPos = manimToCanvas(corner.x + (dx / dist) * scale, corner.y + (dy / dist) * scale)
    } else {
      labelPos = manimToCanvas(corner.x, corner.y)
    }
  } else if (obj.vertices?.[editingVertex.vertexIndex]) {
    const vertex = obj.vertices[editingVertex.vertexIndex]
    const vManim = { x: obj.x + vertex.x, y: obj.y + vertex.y }

    const verts = obj.vertices || []
    const centroid = verts.reduce(
      (acc, v) => ({ x: acc.x + v.x, y: acc.y + v.y }),
      { x: 0, y: 0 },
    )
    centroid.x /= verts.length || 1
    centroid.y /= verts.length || 1
    const cManim = { x: obj.x + centroid.x, y: obj.y + centroid.y }

    const dx = vManim.x - cManim.x
    const dy = vManim.y - cManim.y
    const dist = Math.sqrt(dx * dx + dy * dy)

    if (dist > 0.01) {
      const scale = LABEL_OFFSET / scaleX
      labelPos = manimToCanvas(vManim.x + (dx / dist) * scale, vManim.y + (dy / dist) * scale)
    } else {
      labelPos = manimToCanvas(vManim.x, vManim.y)
    }
  } else {
    return null
  }

  const commitLabel = () => {
    const objNow = scene?.objects?.find(o => o.id === editingVertex.objectId)
    if (!objNow) {
      setEditingVertex({ objectId: null, vertexIndex: null, label: '', isCorner: false, isAxisLabel: false })
      return
    }

    if (editingVertex.isAxisLabel && objNow.type === 'axes') {
      const updates = {}
      if (editingVertex.axis === 'x') updates.xLabel = editingVertex.label.trim() || 'x'
      else updates.yLabel = editingVertex.label.trim() || 'y'
      onUpdateObject(editingVertex.objectId, updates)
    } else if (editingVertex.isCorner && objNow.type === 'rectangle') {
      const cornerLabels = [...(objNow.cornerLabels || [])]
      cornerLabels[editingVertex.vertexIndex] = editingVertex.label.trim() || undefined
      onUpdateObject(editingVertex.objectId, { cornerLabels })
    } else if (objNow.vertices?.[editingVertex.vertexIndex]) {
      const newVertices = [...objNow.vertices]
      newVertices[editingVertex.vertexIndex] = {
        ...newVertices[editingVertex.vertexIndex],
        label: editingVertex.label.trim() || undefined,
      }
      onUpdateObject(editingVertex.objectId, { vertices: newVertices })
    }
    setEditingVertex({ objectId: null, vertexIndex: null, label: '', isCorner: false, isAxisLabel: false })
  }

  return (
    <input
      ref={inputRef}
      type="text"
      value={editingVertex.label}
      onChange={(e) => setEditingVertex({ ...editingVertex, label: e.target.value })}
      onBlur={commitLabel}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === 'Escape') {
          e.preventDefault()
          commitLabel()
        }
      }}
      style={{
        position: 'absolute',
        left: `${labelPos.x}px`,
        top: `${labelPos.y}px`,
        transform: 'translate(-50%, -50%)',
        background: '#1a1a2e',
        color: '#ffffff',
        border: '2px solid #4ade80',
        borderRadius: '4px',
        padding: '4px 8px',
        fontSize: '18px',
        fontFamily: '"Latin Modern Roman", "Computer Modern", "Times New Roman", serif',
        zIndex: 1000,
        minWidth: '60px',
        outline: 'none',
      }}
      placeholder="Label"
    />
  )
}
