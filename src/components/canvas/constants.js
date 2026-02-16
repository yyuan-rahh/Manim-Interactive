/**
 * Canvas constants and pure utility functions.
 * These have no React or component-state dependencies.
 */

/** @typedef {import('../../types').SceneObject} SceneObject */

import { mathParser } from '../../utils/mathParser'

// ── Palette definitions ──
export const PALETTE_CATEGORIES = [
  {
    name: 'Shapes',
    items: [
      { type: 'rectangle', icon: '▭', label: 'Rectangle', shortcut: 'R' },
      { type: 'triangle', icon: '△', label: 'Triangle', shortcut: 'T' },
      { type: 'circle', icon: '○', label: 'Circle', shortcut: 'C' },
      { type: 'polygon', icon: '⬠', label: 'Polygon' },
      { type: 'dot', icon: '•', label: 'Dot', shortcut: 'D' },
    ],
  },
  {
    name: 'Lines',
    items: [
      { type: 'line', icon: '╱', label: 'Line', shortcut: 'L' },
      { type: 'arc', icon: '⌒', label: 'Arc' },
      { type: 'arrow', icon: '→', label: 'Arrow', shortcut: 'A' },
    ],
  },
  {
    name: 'Text',
    items: [
      { type: 'text', icon: 'T', label: 'Text', shortcut: 'X' },
      { type: 'latex', icon: '∑', label: 'LaTeX' },
    ],
  },
  {
    name: 'Math',
    items: [
      { type: 'axes', icon: '⊞', label: 'Axes' },
      { type: 'graph', icon: 'ƒ', label: 'Graph', shortcut: 'G' },
      { type: 'graphCursor', icon: '⊙', label: 'Cursor' },
      { type: 'tangentLine', icon: '⟋', label: 'Tangent' },
      { type: 'limitProbe', icon: '→|', label: 'Limit' },
      { type: 'valueLabel', icon: '#', label: 'Value' },
    ],
  },
]

export const SHAPE_PALETTE = PALETTE_CATEGORIES.flatMap(c => c.items)

// ── Coordinate system ──
export const MANIM_WIDTH = 14
export const MANIM_HEIGHT = 8

// ── Selection handles ──
export const HANDLE_SIZE = 12

// ── Snapping ──
export const SNAP_THRESHOLD = 0.08
export const SHAPE_SNAP_THRESHOLD = 0.08
export const GRID_SNAP = 0.5
export const ANGLE_SNAP = 45

export const snapToGrid = (value, gridSize = GRID_SNAP) => {
  return Math.round(value / gridSize) * gridSize
}

export const snapAngle = (angle) => {
  return Math.round(angle / ANGLE_SNAP) * ANGLE_SNAP
}

export const snapToAngleFromPoint = (x, y, refX, refY) => {
  const dx = x - refX
  const dy = y - refY
  const dist = Math.sqrt(dx * dx + dy * dy)

  if (dist < 0.01) return { x, y }

  const angle = Math.atan2(dy, dx) * 180 / Math.PI
  const snappedAngle = snapAngle(angle)
  const snappedRad = snappedAngle * Math.PI / 180

  if (Math.abs(angle - snappedAngle) < 8) {
    return {
      x: refX + Math.cos(snappedRad) * dist,
      y: refY + Math.sin(snappedRad) * dist
    }
  }

  return { x, y }
}

// ── Geometry helpers ──
export const hypot = (a, b) => Math.sqrt(a * a + b * b)

export const closestPointOnSegment = (px, py, ax, ay, bx, by) => {
  const abx = bx - ax
  const aby = by - ay
  const apx = px - ax
  const apy = py - ay
  const abLenSq = abx * abx + aby * aby
  if (abLenSq === 0) return { x: ax, y: ay, t: 0 }
  const t = Math.max(0, Math.min(1, (apx * abx + apy * aby) / abLenSq))
  return { x: ax + t * abx, y: ay + t * aby, t }
}

export const getSnapGeometry = (obj) => {
  const points = []
  const segments = []

  const addSegmentLoop = (verts) => {
    for (let i = 0; i < verts.length; i++) {
      const a = verts[i]
      const b = verts[(i + 1) % verts.length]
      segments.push({ ax: a.x, ay: a.y, bx: b.x, by: b.y })
    }
  }

  switch (obj.type) {
    case 'rectangle': {
      const w = obj.width || 0
      const h = obj.height || 0
      const hw = w / 2
      const hh = h / 2
      const corners = [
        { x: obj.x - hw, y: obj.y + hh },
        { x: obj.x + hw, y: obj.y + hh },
        { x: obj.x + hw, y: obj.y - hh },
        { x: obj.x - hw, y: obj.y - hh },
      ]
      points.push(...corners)
      points.push(
        { x: obj.x, y: obj.y + hh },
        { x: obj.x + hw, y: obj.y },
        { x: obj.x, y: obj.y - hh },
        { x: obj.x - hw, y: obj.y }
      )
      addSegmentLoop(corners)
      break
    }
    case 'triangle': {
      const verts = obj.vertices || []
      const absVerts = verts.map(v => ({ x: obj.x + v.x, y: obj.y + v.y }))
      points.push(...absVerts)
      if (absVerts.length >= 3) addSegmentLoop(absVerts)
      break
    }
    case 'polygon': {
      const verts = obj.vertices || []
      const absVerts = verts.map(v => ({ x: obj.x + v.x, y: obj.y + v.y }))
      points.push(...absVerts)
      if (absVerts.length >= 3) addSegmentLoop(absVerts)
      break
    }
    case 'line':
    case 'arrow': {
      const a = { x: obj.x, y: obj.y }
      const b = { x: obj.x2, y: obj.y2 }
      points.push(a, b)
      segments.push({ ax: a.x, ay: a.y, bx: b.x, by: b.y })
      break
    }
    case 'circle':
    case 'dot': {
      const r = obj.radius || 0
      if (r > 0) {
        points.push(
          { x: obj.x + r, y: obj.y },
          { x: obj.x - r, y: obj.y },
          { x: obj.x, y: obj.y + r },
          { x: obj.x, y: obj.y - r }
        )
      }
      break
    }
    default:
      break
  }

  return { points, segments }
}

// ── Visibility ──
/**
 * Return objects visible at a given time, accounting for delays and transforms.
 * @param {SceneObject[]} objects
 * @param {number} t
 * @returns {SceneObject[]}
 */
export const getVisibleObjectsAtTime = (objects, t) => {
  const objs = objects || []
  const replaced = new Set()

  for (const obj of objs) {
    if (!obj?.transformFromId) continue
    const delay = obj.delay || 0
    if (t >= delay) replaced.add(obj.transformFromId)
  }

  return objs.filter(obj => {
    if (!obj) return false
    const delay = obj.delay || 0
    const runTime = obj.runTime || 1
    if (t < delay) return false
    if (!obj.transformFromId && t >= delay + runTime) return false
    if (replaced.has(obj.id)) return false
    return true
  })
}

// ── Object bounds (used by renderer and hit testing) ──
/**
 * Compute the axis-aligned bounding box of an object in Manim coordinates.
 * @param {SceneObject} obj
 * @returns {{ minX: number, maxX: number, minY: number, maxY: number }}
 */
export const getObjectBounds = (obj) => {
  switch (obj.type) {
    case 'rectangle':
      return {
        minX: obj.x - obj.width / 2,
        maxX: obj.x + obj.width / 2,
        minY: obj.y - obj.height / 2,
        maxY: obj.y + obj.height / 2
      }
    case 'circle':
      return {
        minX: obj.x - obj.radius,
        maxX: obj.x + obj.radius,
        minY: obj.y - obj.radius,
        maxY: obj.y + obj.radius
      }
    case 'dot':
      return {
        minX: obj.x - obj.radius,
        maxX: obj.x + obj.radius,
        minY: obj.y - obj.radius,
        maxY: obj.y + obj.radius
      }
    case 'triangle': {
      const verts = obj.vertices || [{ x: 0, y: 1 }, { x: -0.866, y: -0.5 }, { x: 0.866, y: -0.5 }]
      const xs = verts.map(v => obj.x + v.x)
      const ys = verts.map(v => obj.y + v.y)
      return {
        minX: Math.min(...xs),
        maxX: Math.max(...xs),
        minY: Math.min(...ys),
        maxY: Math.max(...ys)
      }
    }
    case 'polygon': {
      const verts = obj.vertices || []
      if (verts.length === 0) return { minX: obj.x - 1, maxX: obj.x + 1, minY: obj.y - 1, maxY: obj.y + 1 }
      const xs = verts.map(v => obj.x + v.x)
      const ys = verts.map(v => obj.y + v.y)
      return {
        minX: Math.min(...xs),
        maxX: Math.max(...xs),
        minY: Math.min(...ys),
        maxY: Math.max(...ys)
      }
    }
    case 'line':
    case 'arrow':
      return {
        minX: Math.min(obj.x, obj.x2),
        maxX: Math.max(obj.x, obj.x2),
        minY: Math.min(obj.y, obj.y2),
        maxY: Math.max(obj.y, obj.y2)
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
      const arcPts = []
      const arcN = 24
      for (let i = 0; i <= arcN; i++) {
        const t = i / arcN
        const mt = 1 - t
        arcPts.push({
          x: mt * mt * x0 + 2 * mt * t * p1.x + t * t * x2,
          y: mt * mt * y0 + 2 * mt * t * p1.y + t * t * y2,
        })
      }
      const arcXs = arcPts.map(p => p.x)
      const arcYs = arcPts.map(p => p.y)
      return { minX: Math.min(...arcXs), maxX: Math.max(...arcXs), minY: Math.min(...arcYs), maxY: Math.max(...arcYs) }
    }
    case 'text':
      return {
        minX: obj.x - (obj.width || 2) / 2,
        maxX: obj.x + (obj.width || 2) / 2,
        minY: obj.y - (obj.height || 0.8) / 2,
        maxY: obj.y + (obj.height || 0.8) / 2
      }
    case 'latex':
      return {
        minX: obj.x - 0.8,
        maxX: obj.x + 0.8,
        minY: obj.y - 0.4,
        maxY: obj.y + 0.4
      }
    case 'axes':
      return {
        minX: obj.x - (obj.xLength || 8) / 2,
        maxX: obj.x + (obj.xLength || 8) / 2,
        minY: obj.y - (obj.yLength || 4) / 2,
        maxY: obj.y + (obj.yLength || 4) / 2
      }
    case 'graph': {
      const formula = obj.formula || 'x^2'
      const xMin = obj.xRange?.min ?? -5
      const xMax = obj.xRange?.max ?? 5
      const yMin = obj.yRange?.min ?? -3
      const yMax = obj.yRange?.max ?? 3

      try {
        const points = mathParser.sampleFunction(formula, xMin, xMax, 200)
        if (points.length === 0) {
          return { minX: obj.x + xMin, maxX: obj.x + xMax, minY: obj.y + yMin, maxY: obj.y + yMax }
        }
        const visiblePoints = points.filter(p =>
          p.x >= xMin && p.x <= xMax &&
          !isNaN(p.y) && isFinite(p.y) &&
          p.y >= yMin && p.y <= yMax
        )
        if (visiblePoints.length === 0) {
          return { minX: obj.x + xMin, maxX: obj.x + xMax, minY: obj.y + yMin, maxY: obj.y + yMax }
        }
        const curveYMin = Math.min(...visiblePoints.map(p => p.y))
        const curveYMax = Math.max(...visiblePoints.map(p => p.y))
        const curveXMin = Math.min(...visiblePoints.map(p => p.x))
        const curveXMax = Math.max(...visiblePoints.map(p => p.x))
        const paddingX = (curveXMax - curveXMin) * 0.05 + 0.1
        const paddingY = (curveYMax - curveYMin) * 0.05 + 0.1
        return {
          minX: obj.x + curveXMin - paddingX,
          maxX: obj.x + curveXMax + paddingX,
          minY: obj.y + curveYMin - paddingY,
          maxY: obj.y + curveYMax + paddingY
        }
      } catch (e) {
        return { minX: obj.x + xMin, maxX: obj.x + xMax, minY: obj.y + yMin, maxY: obj.y + yMax }
      }
    }
    default:
      return { minX: obj.x - 1, maxX: obj.x + 1, minY: obj.y - 0.5, maxY: obj.y + 0.5 }
  }
}

// ── Handle layout ──
export const getHandles = (obj, topLeft, size) => {
  if (obj.type === 'line' || obj.type === 'arrow' || obj.type === 'triangle' || obj.type === 'rectangle' || obj.type === 'polygon') {
    return []
  }

  if (obj.type === 'graph') {
    const midX = topLeft.x + size.width / 2
    const midY = topLeft.y + size.height / 2
    return [
      { id: 'left', x: topLeft.x, y: midY },
      { id: 'right', x: topLeft.x + size.width, y: midY },
      { id: 'top', x: midX, y: topLeft.y },
      { id: 'bottom', x: midX, y: topLeft.y + size.height },
    ]
  }

  return [
    { id: 'nw', x: topLeft.x - 4, y: topLeft.y - 4 },
    { id: 'ne', x: topLeft.x + size.width + 4, y: topLeft.y - 4 },
    { id: 'sw', x: topLeft.x - 4, y: topLeft.y + size.height + 4 },
    { id: 'se', x: topLeft.x + size.width + 4, y: topLeft.y + size.height + 4 },
  ]
}

// ── Point-to-line-segment distance ──
export const pointToLineDistance = (px, py, x1, y1, x2, y2) => {
  const dx = x2 - x1
  const dy = y2 - y1
  const lengthSq = dx * dx + dy * dy

  if (lengthSq === 0) return Math.sqrt((px - x1) ** 2 + (py - y1) ** 2)

  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lengthSq))
  const projX = x1 + t * dx
  const projY = y1 + t * dy

  return Math.sqrt((px - projX) ** 2 + (py - projY) ** 2)
}
