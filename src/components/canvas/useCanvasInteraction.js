/**
 * useCanvasInteraction – custom hook that manages all drag / click / select
 * interaction state and handlers for the Canvas component.
 *
 * Extracted from Canvas.jsx to reduce component size and isolate concerns.
 */

import { useState, useRef, useCallback } from 'react'
import {
  snapToGrid, snapToAngleFromPoint,
  getVisibleObjectsAtTime, getObjectBounds,
} from './constants'
import { snapPosition as snapPositionFn } from './snapping'
import { getBestLinkType, generateLinkUpdates } from '../../utils/linking'
import { projectToGraph, clampToGraphRange, getGraphById } from '../../utils/graphTools'

/**
 * @param {object} opts
 * @param {object} opts.scene              – current scene
 * @param {number} opts.currentTime        – playback cursor
 * @param {string[]} opts.selectedObjectIds
 * @param {object|null} opts.selectedObject
 * @param {Function} opts.onSelectObjects
 * @param {Function} opts.onUpdateObject
 * @param {boolean} opts.snapEnabled
 * @param {boolean} opts.linkModeActive
 * @param {Function} opts.setLinkModeActive
 * @param {string|null} opts.hoveredLinkTarget
 * @param {Function} opts.setHoveredLinkTarget
 * @param {Function} opts.canvasToManim
 * @param {Function} opts.hitTest
 * @param {Function} opts.hitTestShape
 * @param {Function} opts.hitTestHandle
 * @param {number} opts.scaleX
 * @param {number} opts.scaleY
 * @param {React.RefObject} opts.canvasRef
 * @param {React.RefObject} opts.containerRef
 * @param {Function} opts.setContextMenu
 * @param {Function} opts.setEditingVertex
 * @param {React.RefObject} opts.vertexInputRef
 */
export default function useCanvasInteraction({
  scene,
  currentTime,
  selectedObjectIds,
  selectedObject,
  onSelectObjects,
  onUpdateObject,
  snapEnabled,
  linkModeActive,
  setLinkModeActive,
  hoveredLinkTarget,
  setHoveredLinkTarget,
  canvasToManim,
  hitTest,
  hitTestShape,
  hitTestHandle,
  scaleX,
  scaleY,
  canvasRef,
  containerRef,
  setContextMenu,
  setEditingVertex,
  vertexInputRef,
}) {
  // ── drag state ──
  const [isDragging, setIsDragging] = useState(false)
  const [dragType, setDragType] = useState(null)
  const [activeHandle, setActiveHandle] = useState(null)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 })
  const [selectionBox, setSelectionBox] = useState(null)
  const rotateStartRef = useRef(null)

  // ── snapping helper bound to current scene/time ──
  const snapPosition = useCallback((x, y, excludeId = null) => {
    return snapPositionFn(x, y, snapEnabled, scene?.objects, currentTime, excludeId)
  }, [snapEnabled, scene?.objects, currentTime])

  // ── context menu ──
  const openContextMenu = useCallback((e) => {
    const rect = canvasRef.current.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    const hitId = hitTest(x, y)

    if (!hitId) {
      setContextMenu({ open: false, x: 0, y: 0, objectId: null })
      return
    }

    onSelectObjects?.([hitId])

    const containerRect = containerRef.current?.getBoundingClientRect()
    const relX = containerRect ? (e.clientX - containerRect.left) : e.clientX
    const relY = containerRect ? (e.clientY - containerRect.top) : e.clientY

    setContextMenu({ open: true, x: relX, y: relY, objectId: hitId })
  }, [canvasRef, containerRef, hitTest, onSelectObjects, setContextMenu])

  // ── handleMouseDown ──
  const handleMouseDown = useCallback((e) => {
    // Ctrl+click (macOS) → context menu
    if (e.button === 0 && e.ctrlKey) {
      e.preventDefault()
      e.stopPropagation()
      openContextMenu(e)
      return
    }

    const rect = canvasRef.current.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top

    // Link mode click
    if (linkModeActive && selectedObjectIds.length === 1 && selectedObject) {
      const manim = canvasToManim(x, y)
      const objects = getVisibleObjectsAtTime(scene.objects, currentTime)

      for (const obj of objects) {
        if (hitTestShape(obj, manim.x, manim.y)) {
          const linkType = getBestLinkType(selectedObject, obj)
          if (linkType) {
            const updates = generateLinkUpdates(selectedObject, obj)
            onUpdateObject(selectedObjectIds[0], updates)
            setLinkModeActive(false)
            setHoveredLinkTarget(null)
            e.preventDefault()
            e.stopPropagation()
            return
          }
        }
      }
    }

    // Handle clicks
    if (selectedObjectIds.length > 0) {
      const selectedObj = selectedObjectIds.length === 1
        ? getVisibleObjectsAtTime(scene.objects, currentTime).find(o => o.id === selectedObjectIds[0])
        : null
      const handleHit = selectedObj ? hitTestHandle(x, y, selectedObj) : null

      if (handleHit) {
        if (handleHit === 'rotate' && (selectedObj?.type === 'text' || selectedObj?.type === 'rectangle')) {
          const center = { x: selectedObj.x, y: selectedObj.y }
          const mouse = canvasToManim(x, y)
          const angle = Math.atan2(mouse.y - center.y, mouse.x - center.x)
          rotateStartRef.current = { angle, rotation: selectedObj.rotation || 0 }
          setIsDragging(true)
          setDragType('rotate')
          setActiveHandle(handleHit)
          return
        }
        // Double-click on handle to edit labels
        if (e.detail === 2) {
          if (handleHit.startsWith('vertex-')) {
            const vertexIndex = parseInt(handleHit.split('-')[1])
            const verts = selectedObj.vertices || []
            const vertex = verts[vertexIndex]
            if (vertex) {
              setEditingVertex({ objectId: selectedObjectIds[0], vertexIndex, label: vertex.label || '', isCorner: false })
              setTimeout(() => vertexInputRef.current?.focus(), 0)
              return
            }
          } else if (handleHit.startsWith('corner-')) {
            const cornerIndex = parseInt(handleHit.split('-')[1])
            const cornerLabels = selectedObj.cornerLabels || []
            setEditingVertex({ objectId: selectedObjectIds[0], vertexIndex: cornerIndex, label: cornerLabels[cornerIndex] || '', isCorner: true })
            setTimeout(() => vertexInputRef.current?.focus(), 0)
            return
          } else if (selectedObj.type === 'axes' && (handleHit === 'right' || handleHit === 'top')) {
            const isXAxis = handleHit === 'right'
            setEditingVertex({
              objectId: selectedObjectIds[0],
              vertexIndex: -1,
              label: isXAxis ? (selectedObj.xLabel || 'x') : (selectedObj.yLabel || 'y'),
              isCorner: false,
              isAxisLabel: true,
              axis: isXAxis ? 'x' : 'y',
            })
            setTimeout(() => vertexInputRef.current?.focus(), 0)
            return
          }
        }

        setIsDragging(true)
        setDragType('resize')
        setActiveHandle(handleHit)
        setDragStart({ x: e.clientX, y: e.clientY })
        setDragOffset({ ...selectedObj })
        return
      }
    }

    // Check if clicking on an object
    const hitId = hitTest(x, y)

    if (hitId) {
      if (e.shiftKey) {
        if (selectedObjectIds.includes(hitId)) {
          onSelectObjects(selectedObjectIds.filter(id => id !== hitId))
        } else {
          onSelectObjects([...selectedObjectIds, hitId])
        }
        return
      }

      if (selectedObjectIds.length !== 1 || selectedObjectIds[0] !== hitId) {
        onSelectObjects([hitId])
      }

      const obj = getVisibleObjectsAtTime(scene.objects, currentTime).find(o => o.id === hitId)
      if (obj) {
        if (typeof currentTime === 'number' && obj.delay !== currentTime) {
          onUpdateObject?.(hitId, { delay: parseFloat(currentTime.toFixed(2)) })
        }
        setIsDragging(true)
        setDragType('move')
        setActiveHandle(null)
        setDragStart({ x: e.clientX, y: e.clientY })

        if (selectedObjectIds.length > 1 || (selectedObjectIds.length === 1 && selectedObjectIds[0] === hitId)) {
          const selectedObjs = getVisibleObjectsAtTime(scene.objects, currentTime).filter(o =>
            selectedObjectIds.includes(o.id) || o.id === hitId
          )
          setDragOffset({
            multiSelect: selectedObjs.map(o => ({
              id: o.id, x: o.x, y: o.y, x2: o.x2, y2: o.y2, cx: o.cx, cy: o.cy,
              ...(o.type === 'graph' ? { baseFormula: o.formula, xRange: { ...o.xRange }, yRange: { ...o.yRange } } : {}),
            })),
          })
        } else if (obj.type === 'graph') {
          setDragOffset({ ...obj, baseFormula: obj.formula, xRange: { ...obj.xRange }, yRange: { ...obj.yRange } })
        } else {
          setDragOffset({ ...obj })
        }
      }
    } else {
      if (!e.shiftKey) {
        onSelectObjects([])
        setSelectionBox({ startX: x, startY: y, endX: x, endY: y })
        setIsDragging(true)
        setDragType('select-area')
      }
    }
  }, [
    openContextMenu, canvasRef, canvasToManim, linkModeActive, selectedObjectIds,
    selectedObject, scene, currentTime, hitTest, hitTestShape, hitTestHandle,
    onSelectObjects, onUpdateObject, setLinkModeActive, setHoveredLinkTarget,
    setEditingVertex, vertexInputRef,
  ])

  // ── handleMouseMove ──
  const handleMouseMove = useCallback((e) => {
    // Link-mode hover
    if (linkModeActive && selectedObjectIds.length === 1 && selectedObject) {
      const rect = canvasRef.current.getBoundingClientRect()
      const x = e.clientX - rect.left
      const y = e.clientY - rect.top
      const manim = canvasToManim(x, y)
      const objects = getVisibleObjectsAtTime(scene.objects, currentTime)

      let foundTarget = null
      for (const obj of objects) {
        if (!selectedObjectIds.includes(obj.id) && hitTestShape(obj, manim.x, manim.y)) {
          const linkType = getBestLinkType(selectedObject, obj)
          if (linkType) { foundTarget = obj.id; break }
        }
      }
      if (foundTarget !== hoveredLinkTarget) setHoveredLinkTarget(foundTarget)
      return
    }

    // Area selection dragging
    if (isDragging && dragType === 'select-area') {
      const rect = canvasRef.current.getBoundingClientRect()
      const x = e.clientX - rect.left
      const y = e.clientY - rect.top
      setSelectionBox(prev => prev ? { ...prev, endX: x, endY: y } : null)
      return
    }

    if (!isDragging || selectedObjectIds.length === 0) return

    const dx = (e.clientX - dragStart.x) / scaleX
    const dy = -(e.clientY - dragStart.y) / scaleY
    const shiftHeld = e.shiftKey

    // Rotate (text and rectangle)
    if (dragType === 'rotate') {
      const obj = scene.objects.find(o => o.id === selectedObjectIds[0])
      if (!obj || !rotateStartRef.current) return
      const rect = canvasRef.current.getBoundingClientRect()
      const mouse = canvasToManim(e.clientX - rect.left, e.clientY - rect.top)
      const center = { x: obj.x, y: obj.y }
      const angle = Math.atan2(mouse.y - center.y, mouse.x - center.x)
      const delta = (angle - rotateStartRef.current.angle) * 180 / Math.PI
      let next = rotateStartRef.current.rotation + delta
      if (shiftHeld) next = Math.round(next / 15) * 15
      onUpdateObject(selectedObjectIds[0], { rotation: parseFloat(next.toFixed(2)) })
      return
    }

    // Move
    if (dragType === 'move') {
      if (dragOffset.multiSelect && dragOffset.multiSelect.length > 0) {
        dragOffset.multiSelect.forEach(orig => {
          const obj = scene.objects.find(o => o.id === orig.id)
          if (!obj) return
          if (obj.type === 'line' || obj.type === 'arrow') {
            onUpdateObject(orig.id, {
              x: parseFloat((orig.x + dx).toFixed(2)), y: parseFloat((orig.y + dy).toFixed(2)),
              x2: parseFloat((orig.x2 + dx).toFixed(2)), y2: parseFloat((orig.y2 + dy).toFixed(2)),
            })
          } else if (obj.type === 'arc') {
            onUpdateObject(orig.id, {
              x: parseFloat((orig.x + dx).toFixed(2)), y: parseFloat((orig.y + dy).toFixed(2)),
              x2: parseFloat((orig.x2 + dx).toFixed(2)), y2: parseFloat((orig.y2 + dy).toFixed(2)),
              cx: parseFloat((orig.cx + dx).toFixed(2)), cy: parseFloat((orig.cy + dy).toFixed(2)),
            })
          } else {
            onUpdateObject(orig.id, {
              x: parseFloat((orig.x + dx).toFixed(2)), y: parseFloat((orig.y + dy).toFixed(2)),
            })
          }
        })
        return
      }

      const obj = scene.objects.find(o => o.id === selectedObjectIds[0])
      if (!obj) return

      if (obj.type === 'line' || obj.type === 'arrow') {
        const rawStart = { x: dragOffset.x + dx, y: dragOffset.y + dy }
        const rawEnd = { x: dragOffset.x2 + dx, y: dragOffset.y2 + dy }
        const snappedStart = snapPosition(rawStart.x, rawStart.y, selectedObjectIds[0])
        const delta = { x: snappedStart.x - rawStart.x, y: snappedStart.y - rawStart.y }
        onUpdateObject(selectedObjectIds[0], {
          x: snappedStart.x, y: snappedStart.y,
          x2: parseFloat((rawEnd.x + delta.x).toFixed(2)), y2: parseFloat((rawEnd.y + delta.y).toFixed(2)),
        })
      } else if (obj.type === 'arc') {
        const rawStart = { x: dragOffset.x + dx, y: dragOffset.y + dy }
        const rawEnd = { x: dragOffset.x2 + dx, y: dragOffset.y2 + dy }
        const rawCtrl = { x: dragOffset.cx + dx, y: dragOffset.cy + dy }
        const snappedStart = snapPosition(rawStart.x, rawStart.y, selectedObjectIds[0])
        const delta = { x: snappedStart.x - rawStart.x, y: snappedStart.y - rawStart.y }
        onUpdateObject(selectedObjectIds[0], {
          x: snappedStart.x, y: snappedStart.y,
          x2: parseFloat((rawEnd.x + delta.x).toFixed(2)), y2: parseFloat((rawEnd.y + delta.y).toFixed(2)),
          cx: parseFloat((rawCtrl.x + delta.x).toFixed(2)), cy: parseFloat((rawCtrl.y + delta.y).toFixed(2)),
        })
      } else if (obj.type === 'graphCursor') {
        const graph = getGraphById(scene?.objects || [], obj.graphId)
        if (!graph) return
        const formula = graph.formula || 'x^2'
        const graphXRange = graph.xRange || { min: -5, max: 5 }
        const axes = obj.axesId ? scene?.objects?.find(o => o.id === obj.axesId) : null
        const offsetX = (axes || graph).x || 0
        const currentManim = canvasToManim(dragStart.x + dx, dragStart.y + dy)
        const dragX = currentManim.x - offsetX
        const clampedX = clampToGraphRange(dragX, graphXRange)
        const point = projectToGraph(formula, clampedX)
        if (!isNaN(point.y) && isFinite(point.y)) {
          onUpdateObject(selectedObjectIds[0], {
            x0: parseFloat(clampedX.toFixed(4)),
            x: offsetX + point.x,
            y: (axes || graph).y + point.y,
          })
        }
      } else if (obj.type === 'graph') {
        const rawX = dragOffset.x + dx
        const rawY = dragOffset.y + dy
        const shiftX = rawX - dragOffset.x
        const shiftY = rawY - dragOffset.y
        if (Math.abs(shiftX) > 0.01 || Math.abs(shiftY) > 0.01) {
          const baseFormula = dragOffset.baseFormula || obj.formula || 'x^2'
          let transformedFormula = baseFormula
          if (Math.abs(shiftX) > 0.01) {
            const shift = shiftX > 0 ? `-${Math.abs(shiftX).toFixed(2)}` : `+${Math.abs(shiftX).toFixed(2)}`
            if (baseFormula.includes('x')) {
              transformedFormula = baseFormula.replace(/x/g, `(x${shift})`)
            }
          }
          if (Math.abs(shiftY) > 0.01) {
            const shift = shiftY > 0 ? `+${shiftY.toFixed(2)}` : `${shiftY.toFixed(2)}`
            transformedFormula = `(${transformedFormula})${shift}`
          }
          const xRange = dragOffset.xRange || obj.xRange || { min: -5, max: 5 }
          const yRange = dragOffset.yRange || obj.yRange || { min: -3, max: 3 }
          onUpdateObject(selectedObjectIds[0], {
            formula: transformedFormula,
            xRange: { min: parseFloat((xRange.min + shiftX).toFixed(2)), max: parseFloat((xRange.max + shiftX).toFixed(2)) },
            yRange: { min: parseFloat((yRange.min + shiftY).toFixed(2)), max: parseFloat((yRange.max + shiftY).toFixed(2)) },
          })
        }
      } else {
        const rawX = dragOffset.x + dx
        const rawY = dragOffset.y + dy
        const snapped = snapPosition(rawX, rawY, selectedObjectIds[0])
        onUpdateObject(selectedObjectIds[0], snapped)
      }
      return
    }

    // Resize
    if (dragType === 'resize') {
      const obj = scene.objects.find(o => o.id === selectedObjectIds[0])
      if (!obj) return

      // Graph edge dragging
      if (obj.type === 'graph' && ['left', 'right', 'top', 'bottom'].includes(activeHandle)) {
        const xRange = dragOffset.xRange || obj.xRange || { min: -5, max: 5 }
        const yRange = dragOffset.yRange || obj.yRange || { min: -3, max: 3 }
        let newXRange = { ...xRange }
        let newYRange = { ...yRange }
        if (activeHandle === 'left') {
          newXRange.min = parseFloat((xRange.min + dx).toFixed(2))
          if (newXRange.min >= xRange.max - 0.5) newXRange.min = xRange.max - 0.5
        } else if (activeHandle === 'right') {
          newXRange.max = parseFloat((xRange.max + dx).toFixed(2))
          if (newXRange.max <= xRange.min + 0.5) newXRange.max = xRange.min + 0.5
        } else if (activeHandle === 'top') {
          newYRange.max = parseFloat((yRange.max + dy).toFixed(2))
          if (newYRange.max <= yRange.min + 0.5) newYRange.max = yRange.min + 0.5
        } else if (activeHandle === 'bottom') {
          newYRange.min = parseFloat((yRange.min + dy).toFixed(2))
          if (newYRange.min >= yRange.max - 0.5) newYRange.min = yRange.max - 0.5
        }
        onUpdateObject(selectedObjectIds[0], { xRange: newXRange, yRange: newYRange })
        setDragOffset({ ...dragOffset, xRange: newXRange, yRange: newYRange })
        return
      }

      // Triangle vertex dragging
      if (obj.type === 'triangle' && activeHandle?.startsWith('vertex-')) {
        const vertexIndex = parseInt(activeHandle.split('-')[1])
        const verts = [...(dragOffset.vertices || [])]
        if (verts[vertexIndex]) {
          let newVX = verts[vertexIndex].x + dx
          let newVY = verts[vertexIndex].y + dy
          if (shiftHeld) {
            const snappedPos = snapToAngleFromPoint(newVX, newVY, 0, 0)
            newVX = snappedPos.x; newVY = snappedPos.y
          }
          const abs = snapPosition(obj.x + newVX, obj.y + newVY, selectedObjectIds[0])
          newVX = abs.x - obj.x; newVY = abs.y - obj.y
          verts[vertexIndex] = { x: parseFloat(newVX.toFixed(2)), y: parseFloat(newVY.toFixed(2)) }
          onUpdateObject(selectedObjectIds[0], { vertices: verts })
          setDragStart({ x: e.clientX, y: e.clientY })
          setDragOffset({ ...dragOffset, vertices: verts })
        }
        return
      }

      // Polygon vertex dragging
      if (obj.type === 'polygon' && activeHandle?.startsWith('vertex-')) {
        const vertexIndex = parseInt(activeHandle.split('-')[1])
        const verts = [...(dragOffset.vertices || [])]
        if (verts[vertexIndex]) {
          let newVX = verts[vertexIndex].x + dx
          let newVY = verts[vertexIndex].y + dy
          if (shiftHeld) {
            const snappedPos = snapToAngleFromPoint(newVX, newVY, 0, 0)
            newVX = snappedPos.x; newVY = snappedPos.y
          }
          const abs = snapPosition(obj.x + newVX, obj.y + newVY, selectedObjectIds[0])
          newVX = abs.x - obj.x; newVY = abs.y - obj.y
          verts[vertexIndex] = { x: parseFloat(newVX.toFixed(2)), y: parseFloat(newVY.toFixed(2)) }
          onUpdateObject(selectedObjectIds[0], { vertices: verts })
          setDragStart({ x: e.clientX, y: e.clientY })
          setDragOffset({ ...dragOffset, vertices: verts })
        }
        return
      }

      // Rectangle / text corner dragging
      if ((obj.type === 'rectangle' || obj.type === 'text') && activeHandle?.startsWith('corner-')) {
        const cornerIndex = parseInt(activeHandle.split('-')[1])
        const MIN_W = 0.2
        const MIN_H = 0.2
        const left0 = dragOffset.x - dragOffset.width / 2
        const right0 = dragOffset.x + dragOffset.width / 2
        const bottom0 = dragOffset.y - dragOffset.height / 2
        const top0 = dragOffset.y + dragOffset.height / 2
        let left = left0, right = right0, bottom = bottom0, top = top0

        if (cornerIndex === 0) { left = Math.min(left0 + dx, right0 - MIN_W); top = Math.max(top0 + dy, bottom0 + MIN_H); right = right0; bottom = bottom0 }
        else if (cornerIndex === 1) { right = Math.max(right0 + dx, left0 + MIN_W); top = Math.max(top0 + dy, bottom0 + MIN_H); left = left0; bottom = bottom0 }
        else if (cornerIndex === 2) { left = Math.min(left0 + dx, right0 - MIN_W); bottom = Math.min(bottom0 + dy, top0 - MIN_H); right = right0; top = top0 }
        else if (cornerIndex === 3) { right = Math.max(right0 + dx, left0 + MIN_W); bottom = Math.min(bottom0 + dy, top0 - MIN_H); left = left0; top = top0 }

        const newWidth = Math.max(MIN_W, right - left)
        const newHeight = Math.max(MIN_H, top - bottom)
        const newX = (left + right) / 2
        const newY = (bottom + top) / 2
        const updates = {
          width: parseFloat(newWidth.toFixed(2)), height: parseFloat(newHeight.toFixed(2)),
          x: parseFloat(newX.toFixed(2)), y: parseFloat(newY.toFixed(2)),
        }
        if (obj.type === 'text') {
          const widthScale = newWidth / (dragOffset.width || 2)
          const heightScale = newHeight / (dragOffset.height || 0.8)
          const avgScale = (widthScale + heightScale) / 2
          const initialFontSize = dragOffset.fontSize || 48
          updates.fontSize = Math.max(8, Math.round(initialFontSize * avgScale))
        }
        onUpdateObject(selectedObjectIds[0], updates)
        return
      }

      // Rectangle midpoint handle dragging (resize width or height independently)
      if (obj.type === 'rectangle' && activeHandle?.startsWith('mid-')) {
        const MIN_DIM = 0.2
        if (activeHandle === 'mid-top' || activeHandle === 'mid-bottom') {
          const sign = activeHandle === 'mid-top' ? 1 : -1
          const newHeight = Math.max(MIN_DIM, (dragOffset.height || 1) + sign * dy)
          const yShift = (newHeight - (dragOffset.height || 1)) * sign / 2
          onUpdateObject(selectedObjectIds[0], {
            height: parseFloat(newHeight.toFixed(2)),
            y: parseFloat((dragOffset.y + yShift).toFixed(2)),
          })
        } else {
          const sign = activeHandle === 'mid-right' ? 1 : -1
          const newWidth = Math.max(MIN_DIM, (dragOffset.width || 2) + sign * dx)
          const xShift = (newWidth - (dragOffset.width || 2)) * sign / 2
          onUpdateObject(selectedObjectIds[0], {
            width: parseFloat(newWidth.toFixed(2)),
            x: parseFloat((dragOffset.x + xShift).toFixed(2)),
          })
        }
        return
      }

      // Line / arrow endpoint dragging
      if (obj.type === 'line' || obj.type === 'arrow') {
        if (activeHandle === 'start') {
          let newX = dragOffset.x + dx
          let newY = dragOffset.y + dy
          if (shiftHeld) { const sa = snapToAngleFromPoint(newX, newY, obj.x2, obj.y2); newX = sa.x; newY = sa.y }
          const snapped = snapPosition(newX, newY, selectedObjectIds[0])
          onUpdateObject(selectedObjectIds[0], snapped)
        } else if (activeHandle === 'end') {
          let newX2 = dragOffset.x2 + dx
          let newY2 = dragOffset.y2 + dy
          if (shiftHeld) { const sa = snapToAngleFromPoint(newX2, newY2, obj.x, obj.y); newX2 = sa.x; newY2 = sa.y }
          const snapped = snapPosition(newX2, newY2, selectedObjectIds[0])
          onUpdateObject(selectedObjectIds[0], { x2: snapped.x, y2: snapped.y })
        }
        return
      }

      // Arc handle dragging
      if (obj.type === 'arc') {
        if (activeHandle === 'start') {
          const raw = { x: dragOffset.x + dx, y: dragOffset.y + dy }
          const snapped = snapPosition(raw.x, raw.y, selectedObjectIds[0])
          onUpdateObject(selectedObjectIds[0], { x: snapped.x, y: snapped.y })
        } else if (activeHandle === 'end') {
          const raw = { x: dragOffset.x2 + dx, y: dragOffset.y2 + dy }
          const snapped = snapPosition(raw.x, raw.y, selectedObjectIds[0])
          onUpdateObject(selectedObjectIds[0], { x2: snapped.x, y2: snapped.y })
        } else if (activeHandle === 'control') {
          const raw = { x: dragOffset.cx + dx, y: dragOffset.cy + dy }
          const snapped = snapPosition(raw.x, raw.y, selectedObjectIds[0])
          onUpdateObject(selectedObjectIds[0], { cx: snapped.x, cy: snapped.y })
        }
        return
      }

      // Axes endpoint dragging
      if (obj.type === 'axes') {
        const MIN_LENGTH = 1
        if (activeHandle === 'left' || activeHandle === 'right') {
          const delta = activeHandle === 'right' ? dx : -dx
          const newXLength = Math.max(MIN_LENGTH, (dragOffset.xLength || 8) + delta * 2)
          onUpdateObject(selectedObjectIds[0], { xLength: parseFloat(newXLength.toFixed(2)) })
        } else if (activeHandle === 'top' || activeHandle === 'bottom') {
          const delta = activeHandle === 'top' ? dy : -dy
          const newYLength = Math.max(MIN_LENGTH, (dragOffset.yLength || 4) + delta * 2)
          onUpdateObject(selectedObjectIds[0], { yLength: parseFloat(newYLength.toFixed(2)) })
        }
        return
      }

      // GraphCursor dragging – constrain to graph
      if (obj.type === 'graphCursor') {
        const graph = getGraphById(scene?.objects || [], obj.graphId)
        if (!graph) return
        const formula = graph.formula || 'x^2'
        const graphXRange = graph.xRange || { min: -5, max: 5 }
        const axes = obj.axesId ? scene?.objects?.find(o => o.id === obj.axesId) : null
        const offsetX = (axes || graph).x || 0
        const currentManim = canvasToManim(dragStart.x + dx, dragStart.y + dy)
        const dragX = currentManim.x - offsetX
        const clampedX = clampToGraphRange(dragX, graphXRange)
        const point = projectToGraph(formula, clampedX)
        if (!isNaN(point.y) && isFinite(point.y)) {
          onUpdateObject(selectedObjectIds[0], {
            x0: parseFloat(clampedX.toFixed(4)),
            x: offsetX + point.x,
            y: (axes || graph).y + point.y,
          })
        }
        return
      }

      // Circle / dot resize
      if (obj.type === 'circle' || obj.type === 'dot') {
        const dist = Math.sqrt(dx * dx + dy * dy)
        const sign = (activeHandle?.includes('e') || activeHandle?.includes('s')) ? 1 : -1
        const newRadius = Math.max(0.1, dragOffset.radius + sign * dist * 0.5)
        const snappedRadius = snapToGrid(newRadius, 0.25)
        onUpdateObject(selectedObjectIds[0], { radius: parseFloat(snappedRadius.toFixed(2)) })
      }
    }
  }, [
    linkModeActive, selectedObjectIds, selectedObject, scene, currentTime,
    canvasRef, canvasToManim, hitTestShape, hoveredLinkTarget,
    setHoveredLinkTarget, isDragging, dragType, dragStart, dragOffset,
    activeHandle, scaleX, scaleY, snapPosition, onUpdateObject,
  ])

  // ── handleMouseUp ──
  const handleMouseUp = useCallback(() => {
    if (dragType === 'select-area' && selectionBox) {
      const { startX, startY, endX, endY } = selectionBox
      const minX = Math.min(startX, endX)
      const maxX = Math.max(startX, endX)
      const minY = Math.min(startY, endY)
      const maxY = Math.max(startY, endY)
      const topLeft = canvasToManim(minX, minY)
      const bottomRight = canvasToManim(maxX, maxY)
      const visibleObjects = getVisibleObjectsAtTime(scene.objects, currentTime)
      const selectedIds = []
      for (const obj of visibleObjects) {
        const bounds = getObjectBounds(obj)
        if (bounds.maxX >= topLeft.x && bounds.minX <= bottomRight.x &&
            bounds.maxY >= bottomRight.y && bounds.minY <= topLeft.y) {
          selectedIds.push(obj.id)
        }
      }
      onSelectObjects(selectedIds)
      setSelectionBox(null)
    }
    setIsDragging(false)
    setDragType(null)
    setActiveHandle(null)
    rotateStartRef.current = null
  }, [dragType, selectionBox, canvasToManim, scene, currentTime, onSelectObjects])

  return {
    // state needed by draw loop & JSX
    selectionBox,
    // handlers
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    openContextMenu,
  }
}
