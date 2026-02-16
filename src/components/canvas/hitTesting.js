/**
 * Hit-testing utilities for canvas objects.
 *
 * All exported functions receive any component-scoped dependencies
 * (like manimToCanvas, canvasToManim) via a `hitCtx` parameter.
 *
 * hitCtx = {
 *   manimToCanvas, canvasToManim,
 *   scaleX, scaleY,
 *   getObjectBounds, getTextCorners, getTextRotateHandle, getHandles,
 *   HANDLE_SIZE,
 * }
 */

import { mathParser } from '../../utils/mathParser'
import { projectToGraph, tangentLineAt, limitEstimate, clampToGraphRange, getGraphById, getCursorById } from '../../utils/graphTools'
import { getVisibleObjectsAtTime, pointToLineDistance, getObjectBounds as defaultGetObjectBounds, getHandles as defaultGetHandles, HANDLE_SIZE as DEFAULT_HANDLE_SIZE } from './constants'

/**
 * Find which object (if any) is at the given canvas pixel coordinate.
 * Returns the object id, or null.
 */
export function hitTest(canvasX, canvasY, scene, currentTime, hitCtx) {
  if (!scene?.objects) return null
  const objects = getVisibleObjectsAtTime(scene.objects, currentTime)
  const manim = hitCtx.canvasToManim(canvasX, canvasY)

  const sortedObjects = objects
    .map((obj, index) => ({ obj, index }))
    .sort((a, b) => {
      const zDiff = (b.obj.zIndex || 0) - (a.obj.zIndex || 0)
      if (zDiff !== 0) return zDiff
      return b.index - a.index
    })

  for (const { obj } of sortedObjects) {
    if (hitTestShape(obj, manim.x, manim.y, scene, hitCtx)) {
      return obj.id
    }
  }
  return null
}

/**
 * Test whether point (mx, my) in Manim coords hits the given object.
 */
export function hitTestShape(obj, mx, my, scene, hitCtx) {
  const { scaleX, scaleY } = hitCtx
  const getObjBounds = hitCtx.getObjectBounds || defaultGetObjectBounds

  switch (obj.type) {
    case 'rectangle': {
      const halfW = obj.width / 2
      const halfH = obj.height / 2
      return mx >= obj.x - halfW && mx <= obj.x + halfW &&
             my >= obj.y - halfH && my <= obj.y + halfH
    }
    case 'circle':
    case 'dot': {
      const dist = Math.sqrt((mx - obj.x) ** 2 + (my - obj.y) ** 2)
      return dist <= obj.radius
    }
    case 'triangle': {
      const verts = obj.vertices || [{ x: 0, y: 1 }, { x: -0.866, y: -0.5 }, { x: 0.866, y: -0.5 }]
      const v0 = { x: obj.x + verts[0].x, y: obj.y + verts[0].y }
      const v1 = { x: obj.x + verts[1].x, y: obj.y + verts[1].y }
      const v2 = { x: obj.x + verts[2].x, y: obj.y + verts[2].y }

      const sign = (p1, p2, p3) => (p1.x - p3.x) * (p2.y - p3.y) - (p2.x - p3.x) * (p1.y - p3.y)

      const d1 = sign({ x: mx, y: my }, v0, v1)
      const d2 = sign({ x: mx, y: my }, v1, v2)
      const d3 = sign({ x: mx, y: my }, v2, v0)

      const hasNeg = (d1 < 0) || (d2 < 0) || (d3 < 0)
      const hasPos = (d1 > 0) || (d2 > 0) || (d3 > 0)
      return !(hasNeg && hasPos)
    }
    case 'polygon': {
      const verts = obj.vertices || []
      if (verts.length < 3) return false
      const polygonVerts = verts.map(v => ({ x: obj.x + v.x, y: obj.y + v.y }))
      let inside = false
      for (let i = 0, j = polygonVerts.length - 1; i < polygonVerts.length; j = i++) {
        const xi = polygonVerts[i].x, yi = polygonVerts[i].y
        const xj = polygonVerts[j].x, yj = polygonVerts[j].y
        const intersect = ((yi > my) !== (yj > my))
            && (mx < (xj - xi) * (my - yi) / (yj - yi) + xi)
        if (intersect) inside = !inside
      }
      return inside
    }
    case 'line':
    case 'arrow': {
      const distToLine = pointToLineDistance(mx, my, obj.x, obj.y, obj.x2, obj.y2)
      const strokeRadius = (obj.strokeWidth || 2) * 0.1
      return distToLine <= Math.max(strokeRadius, 0.2)
    }
    case 'arc': {
      const x0 = obj.x
      const y0 = obj.y
      const x2 = obj.x2
      const y2 = obj.y2
      const p1 = {
        x: 2 * obj.cx - 0.5 * (x0 + x2),
        y: 2 * obj.cy - 0.5 * (y0 + y2),
      }
      const samples = 24
      let prev = { x: x0, y: y0 }
      let minDist = Infinity
      for (let i = 1; i <= samples; i++) {
        const t = i / samples
        const mt = 1 - t
        const px = mt * mt * x0 + 2 * mt * t * p1.x + t * t * x2
        const py = mt * mt * y0 + 2 * mt * t * p1.y + t * t * y2
        const dist = pointToLineDistance(mx, my, prev.x, prev.y, px, py)
        if (dist < minDist) minDist = dist
        prev = { x: px, y: py }
      }
      const strokeRadius = (obj.strokeWidth || 3) * 0.1
      return minDist <= Math.max(strokeRadius, 0.25)
    }
    case 'axes': {
      const xLen = obj.xLength || 8
      const yLen = obj.yLength || 4
      const x1 = obj.x - xLen / 2
      const x2 = obj.x + xLen / 2
      const y1 = obj.y - yLen / 2
      const y2 = obj.y + yLen / 2
      const dX = pointToLineDistance(mx, my, x1, obj.y, x2, obj.y)
      const dY = pointToLineDistance(mx, my, obj.x, y1, obj.x, y2)
      return Math.min(dX, dY) <= 0.25
    }
    case 'graph': {
      const formula = obj.formula || 'x^2'
      const xMin = obj.xRange?.min ?? -5
      const xMax = obj.xRange?.max ?? 5

      const sampleCount = 50
      const points = mathParser.sampleFunction(formula, xMin, xMax, sampleCount)

      let minDist = Infinity
      for (let i = 0; i < points.length - 1; i++) {
        const p1 = points[i]
        const p2 = points[i + 1]
        const x1 = obj.x + p1.x
        const y1 = obj.y + p1.y
        const x2 = obj.x + p2.x
        const y2 = obj.y + p2.y
        const dist = pointToLineDistance(mx, my, x1, y1, x2, y2)
        if (dist < minDist) minDist = dist
      }

      const strokeRadius = (obj.strokeWidth || 3) * 0.15
      return minDist <= Math.max(strokeRadius, 0.3)
    }
    case 'text': {
      const halfW = (obj.width || 2) / 2
      const halfH = (obj.height || 0.8) / 2
      const cos = Math.cos(-obj.rotation * Math.PI / 180)
      const sin = Math.sin(-obj.rotation * Math.PI / 180)
      const dx = mx - obj.x
      const dy = my - obj.y
      const rotatedX = dx * cos - dy * sin
      const rotatedY = dx * sin + dy * cos
      return rotatedX >= -halfW && rotatedX <= halfW &&
             rotatedY >= -halfH && rotatedY <= halfH
    }
    case 'latex': {
      const bounds = getObjBounds(obj)
      return mx >= bounds.minX && mx <= bounds.maxX &&
             my >= bounds.minY && my <= bounds.maxY
    }
    case 'graphCursor': {
      const graph = getGraphById(scene?.objects || [], obj.graphId)
      if (!graph) return false
      const formula = graph.formula || 'x^2'
      const x0 = obj.x0 ?? 0
      const graphXRange = graph.xRange || { min: -5, max: 5 }
      const clampedX0 = clampToGraphRange(x0, graphXRange)
      const point = projectToGraph(formula, clampedX0)
      if (isNaN(point.y) || !isFinite(point.y)) return false
      const axes = obj.axesId ? scene?.objects?.find(o => o.id === obj.axesId) : null
      const offsetX = (axes || graph).x || 0
      const offsetY = (axes || graph).y || 0
      const dist = Math.sqrt((mx - (offsetX + point.x)) ** 2 + (my - (offsetY + point.y)) ** 2)
      const radius = obj.radius || 0.08
      return dist <= radius * 1.5
    }
    case 'tangentLine': {
      const graph = getGraphById(scene?.objects || [], obj.graphId)
      if (!graph) return false
      const formula = graph.formula || 'x^2'
      let x0 = obj.x0 ?? 0
      if (obj.cursorId) {
        const cursor = getCursorById(scene?.objects || [], obj.cursorId)
        if (cursor) x0 = cursor.x0 ?? 0
      }
      const visibleSpan = obj.visibleSpan || 2
      const h = obj.derivativeStep || 0.001
      const tangent = tangentLineAt(formula, x0, visibleSpan, h)
      if (isNaN(tangent.x1) || isNaN(tangent.y1) || isNaN(tangent.x2) || isNaN(tangent.y2)) return false
      const axes = obj.axesId ? scene?.objects?.find(o => o.id === obj.axesId) : null
      const offsetX = (axes || graph).x || 0
      const offsetY = (axes || graph).y || 0
      const dist = pointToLineDistance(mx, my, offsetX + tangent.x1, offsetY + tangent.y1, offsetX + tangent.x2, offsetY + tangent.y2)
      return dist <= 0.2
    }
    case 'limitProbe': {
      const graph = getGraphById(scene?.objects || [], obj.graphId)
      if (!graph) return false
      const formula = graph.formula || 'x^2'
      let x0 = obj.x0 ?? 0
      if (obj.cursorId) {
        const cursor = getCursorById(scene?.objects || [], obj.cursorId)
        if (cursor) x0 = cursor.x0 ?? 0
      }
      const direction = obj.direction || 'both'
      const deltaSchedule = obj.deltaSchedule || [1, 0.5, 0.1, 0.01]
      const approachPoints = limitEstimate(formula, x0, direction, deltaSchedule)
      if (approachPoints.length === 0) return false
      const axes = obj.axesId ? scene?.objects?.find(o => o.id === obj.axesId) : null
      const offsetX = (axes || graph).x || 0
      const offsetY = (axes || graph).y || 0
      const radius = obj.radius || 0.06
      for (const point of approachPoints) {
        const dist = Math.sqrt((mx - (offsetX + point.x)) ** 2 + (my - (offsetY + point.y)) ** 2)
        if (dist <= radius * 1.5) return true
      }
      return false
    }
    case 'valueLabel': {
      const fontSize = obj.fontSize || 24
      const padding = fontSize * 0.5 / scaleX
      return mx >= obj.x - padding && mx <= obj.x + padding &&
             my >= obj.y - fontSize * 0.3 / scaleY && my <= obj.y + fontSize * 0.3 / scaleY
    }
    default: {
      const bounds = getObjBounds(obj)
      return mx >= bounds.minX && mx <= bounds.maxX &&
             my >= bounds.minY && my <= bounds.maxY
    }
  }
}

/**
 * Check if a canvas-pixel click lands on a resize/vertex handle of the given object.
 * Returns handle id string, or null.
 */
export function hitTestHandle(canvasX, canvasY, obj, hitCtx) {
  if (!obj) return null

  const {
    manimToCanvas,
    getObjectBounds: getObjBounds = defaultGetObjectBounds,
    getTextCorners,
    getTextRotateHandle,
    getHandles: getHandlesFn = defaultGetHandles,
    HANDLE_SIZE: HS = DEFAULT_HANDLE_SIZE,
  } = hitCtx

  const bounds = getObjBounds(obj)
  const topLeft = manimToCanvas(bounds.minX, bounds.maxY)
  const bottomRight = manimToCanvas(bounds.maxX, bounds.minY)
  const size = { width: bottomRight.x - topLeft.x, height: bottomRight.y - topLeft.y }

  if (obj.type === 'triangle' || obj.type === 'polygon') {
    const verts = obj.vertices || []
    for (let i = 0; i < verts.length; i++) {
      const vPos = manimToCanvas(obj.x + verts[i].x, obj.y + verts[i].y)
      if (Math.hypot(canvasX - vPos.x, canvasY - vPos.y) < HS + 4) {
        return `vertex-${i}`
      }
    }
    return null
  }

  if (obj.type === 'rectangle' || obj.type === 'text') {
    const corners = obj.type === 'text'
      ? getTextCorners(obj).map((c, i) => ({ id: `corner-${i}`, x: c.x, y: c.y }))
      : [
          { id: 'corner-0', x: obj.x - obj.width / 2, y: obj.y + obj.height / 2 },
          { id: 'corner-1', x: obj.x + obj.width / 2, y: obj.y + obj.height / 2 },
          { id: 'corner-2', x: obj.x - obj.width / 2, y: obj.y - obj.height / 2 },
          { id: 'corner-3', x: obj.x + obj.width / 2, y: obj.y - obj.height / 2 },
        ]
    for (const corner of corners) {
      const cPos = manimToCanvas(corner.x, corner.y)
      if (Math.hypot(canvasX - cPos.x, canvasY - cPos.y) < HS + 4) {
        return corner.id
      }
    }
    if (obj.type === 'rectangle') {
      const midpoints = [
        { id: 'mid-top', x: obj.x, y: obj.y + obj.height / 2 },
        { id: 'mid-right', x: obj.x + obj.width / 2, y: obj.y },
        { id: 'mid-bottom', x: obj.x, y: obj.y - obj.height / 2 },
        { id: 'mid-left', x: obj.x - obj.width / 2, y: obj.y },
      ]
      for (const mp of midpoints) {
        const mPos = manimToCanvas(mp.x, mp.y)
        if (Math.hypot(canvasX - mPos.x, canvasY - mPos.y) < HS + 4) {
          return mp.id
        }
      }
      const rotOffset = (obj.height / 2) + 0.4
      const rotPos = manimToCanvas(obj.x, obj.y + rotOffset)
      if (Math.hypot(canvasX - rotPos.x, canvasY - rotPos.y) < HS + 4) {
        return 'rotate'
      }
    }
    if (obj.type === 'text') {
      const rot = getTextRotateHandle(obj)
      const rPos = manimToCanvas(rot.x, rot.y)
      if (Math.hypot(canvasX - rPos.x, canvasY - rPos.y) < HS + 4) {
        return 'rotate'
      }
    }
    return null
  }

  if (obj.type === 'line' || obj.type === 'arrow') {
    const start = manimToCanvas(obj.x, obj.y)
    const end = manimToCanvas(obj.x2, obj.y2)
    if (Math.hypot(canvasX - start.x, canvasY - start.y) < HS + 4) return 'start'
    if (Math.hypot(canvasX - end.x, canvasY - end.y) < HS + 4) return 'end'
    return null
  }

  if (obj.type === 'arc') {
    const start = manimToCanvas(obj.x, obj.y)
    const end = manimToCanvas(obj.x2, obj.y2)
    const ctrl = manimToCanvas(obj.cx, obj.cy)
    if (Math.hypot(canvasX - start.x, canvasY - start.y) < HS + 4) return 'start'
    if (Math.hypot(canvasX - end.x, canvasY - end.y) < HS + 4) return 'end'
    if (Math.hypot(canvasX - ctrl.x, canvasY - ctrl.y) < HS + 4) return 'control'
    return null
  }

  if (obj.type === 'axes') {
    const xLen = obj.xLength || 8
    const yLen = obj.yLength || 4
    const left = manimToCanvas(obj.x - xLen / 2, obj.y)
    const right = manimToCanvas(obj.x + xLen / 2, obj.y)
    const top = manimToCanvas(obj.x, obj.y + yLen / 2)
    const bottom = manimToCanvas(obj.x, obj.y - yLen / 2)
    if (Math.hypot(canvasX - left.x, canvasY - left.y) < HS + 4) return 'left'
    if (Math.hypot(canvasX - right.x, canvasY - right.y) < HS + 4) return 'right'
    if (Math.hypot(canvasX - top.x, canvasY - top.y) < HS + 4) return 'top'
    if (Math.hypot(canvasX - bottom.x, canvasY - bottom.y) < HS + 4) return 'bottom'
    return null
  }

  const handles = getHandlesFn(obj, topLeft, size)
  for (const handle of handles) {
    if (Math.abs(canvasX - handle.x) < HS && Math.abs(canvasY - handle.y) < HS) {
      return handle.id
    }
  }

  return null
}
