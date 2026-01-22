import React, { useMemo, useRef, useState, useEffect, useCallback } from 'react'
import './Canvas.css'
import { convertLatexToMarkup } from 'mathlive'
import { mathParser } from '../utils/mathParser'
import { evalAt, derivativeAt, projectToGraph, tangentLineAt, limitEstimate, estimateLimit, clampToGraphRange, getGraphById, getCursorById } from '../utils/graphTools'
import { getLinkingStatus, isEligibleLinkTarget, getBestLinkType, generateLinkUpdates } from '../utils/linking'

const SHAPE_PALETTE = [
  { type: 'rectangle', icon: '▭', label: 'Rectangle' },
  { type: 'triangle', icon: '△', label: 'Triangle' },
  { type: 'circle', icon: '○', label: 'Circle' },
  { type: 'line', icon: '╱', label: 'Line' },
  { type: 'arc', icon: '⌒', label: 'Arc' },
  { type: 'arrow', icon: '→', label: 'Arrow' },
  { type: 'dot', icon: '•', label: 'Dot' },
  { type: 'polygon', icon: '⬠', label: 'Polygon' },
  { type: 'text', icon: 'T', label: 'Text' },
  { type: 'latex', icon: '∑', label: 'LaTeX' },
  { type: 'axes', icon: '⊞', label: 'Axes' },
  { type: 'graph', icon: 'ƒ', label: 'Graph' },
  { type: 'graphCursor', icon: '•', label: 'Graph Cursor' },
  { type: 'tangentLine', icon: '─', label: 'Tangent Line' },
  { type: 'limitProbe', icon: '→', label: 'Limit Probe' },
  { type: 'valueLabel', icon: 'T', label: 'Value Label' },
]

// Riemann/FTC/Taylor features removed

// Manim coordinate system: center is (0,0), x: -7 to 7, y: -4 to 4
const MANIM_WIDTH = 14
const MANIM_HEIGHT = 8

const HANDLE_SIZE = 10

// Snapping constants
const SNAP_THRESHOLD = 0.08 // Manim units - grid/axis snapping (reduced from 0.15)
const SHAPE_SNAP_THRESHOLD = 0.08 // Manim units - snapping to other shapes' vertices/edges (reduced from 0.15)
const GRID_SNAP = 0.5 // Snap to half-unit grid
const ANGLE_SNAP = 45 // Degrees for angle snapping

// Snap a value to the nearest grid point
const snapToGrid = (value, gridSize = GRID_SNAP) => {
  return Math.round(value / gridSize) * gridSize
}

// Snap angle to nearest 45 degrees
const snapAngle = (angle) => {
  const snapped = Math.round(angle / ANGLE_SNAP) * ANGLE_SNAP
  return snapped
}

// Snap a point to horizontal/vertical/45° alignment relative to another point
const snapToAngleFromPoint = (x, y, refX, refY) => {
  const dx = x - refX
  const dy = y - refY
  const dist = Math.sqrt(dx * dx + dy * dy)
  
  if (dist < 0.01) return { x, y }
  
  // Calculate angle in degrees
  const angle = Math.atan2(dy, dx) * 180 / Math.PI
  
  // Snap to nearest 45 degrees
  const snappedAngle = snapAngle(angle)
  const snappedRad = snappedAngle * Math.PI / 180
  
  // Check if we're close enough to snap
  if (Math.abs(angle - snappedAngle) < 8) { // Within 8 degrees
    return {
      x: refX + Math.cos(snappedRad) * dist,
      y: refY + Math.sin(snappedRad) * dist
    }
  }
  
  return { x, y }
}

const hypot = (a, b) => Math.sqrt(a * a + b * b)

// Closest point on a segment AB to point P, in Manim coords
const closestPointOnSegment = (px, py, ax, ay, bx, by) => {
  const abx = bx - ax
  const aby = by - ay
  const apx = px - ax
  const apy = py - ay
  const abLenSq = abx * abx + aby * aby
  if (abLenSq === 0) return { x: ax, y: ay, t: 0 }
  const t = Math.max(0, Math.min(1, (apx * abx + apy * aby) / abLenSq))
  return { x: ax + t * abx, y: ay + t * aby, t }
}

const getSnapGeometry = (obj) => {
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

const getVisibleObjectsAtTime = (objects, t) => {
  const objs = objects || []
  const replaced = new Set()

  // When a transform target starts (at its delay), the source is replaced.
  for (const obj of objs) {
    if (!obj?.transformFromId) continue
    const delay = obj.delay || 0
    if (t >= delay) replaced.add(obj.transformFromId)
  }

  return objs.filter(obj => {
    if (!obj) return false
    const delay = obj.delay || 0
    const runTime = obj.runTime || 1
    // All objects (including transform targets) are visible starting from their delay time
    if (t < delay) return false
    // Non-transform-targets disappear after their runTime ends
    if (!obj.transformFromId && t >= delay + runTime) return false
    // Objects that have been replaced by a transform target are hidden
    if (replaced.has(obj.id)) return false
    return true
  })
}

function Canvas({ scene, currentTime = 0, selectedObjectId, onSelectObject, onUpdateObject, onAddObject, onDuplicateObject, onDeleteObject }) {
  const canvasRef = useRef(null)
  const containerRef = useRef(null)
  const canvasWrapperRef = useRef(null)
  const [canvasSize, setCanvasSize] = useState({ width: 800, height: 450 })
  const MIN_CANVAS_WIDTH = 320
  const MIN_CANVAS_HEIGHT = 180
  const [isDragging, setIsDragging] = useState(false)
  const [dragType, setDragType] = useState(null) // 'move' | 'resize-corner' | 'resize-edge' | 'endpoint'
  const [activeHandle, setActiveHandle] = useState(null) // which handle is being dragged
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 })
  const [snapEnabled, setSnapEnabled] = useState(true)
  // Legacy dropdown menu state (advanced math features removed)
  const [openPaletteMenu, setOpenPaletteMenu] = useState(null)
  const [contextMenu, setContextMenu] = useState({ open: false, x: 0, y: 0, objectId: null })
  const [editingVertex, setEditingVertex] = useState({ objectId: null, vertexIndex: null, label: '', isCorner: false })
  const vertexInputRef = useRef(null)
  const latexLayerRef = useRef(null)
  const rotateStartRef = useRef(null)
  
  // Link mode state
  const selectedObject = scene?.objects?.find(o => o.id === selectedObjectId)
  const linkingStatus = selectedObject ? getLinkingStatus(selectedObject) : { needsLink: false, missingLinks: [], eligibleTargets: [] }
  const [linkModeActive, setLinkModeActive] = useState(false)
  const [hoveredLinkTarget, setHoveredLinkTarget] = useState(null)
  
  // Auto-enter link mode when selected object needs links
  useEffect(() => {
    if (linkingStatus.needsLink && selectedObjectId) {
      setLinkModeActive(true)
    } else {
      setLinkModeActive(false)
      setHoveredLinkTarget(null)
    }
  }, [linkingStatus.needsLink, selectedObjectId])
  
  // Handle Escape key to exit link mode
  useEffect(() => {
    if (!linkModeActive) return
    
    const handleEscape = (e) => {
      if (e.key === 'Escape') {
        setLinkModeActive(false)
        setHoveredLinkTarget(null)
      }
    }
    
    window.addEventListener('keydown', handleEscape)
    return () => window.removeEventListener('keydown', handleEscape)
  }, [linkModeActive])

  // Convert Manim coords to canvas coords
  const manimToCanvas = useCallback((mx, my) => {
    const x = ((mx + MANIM_WIDTH / 2) / MANIM_WIDTH) * canvasSize.width
    const y = ((MANIM_HEIGHT / 2 - my) / MANIM_HEIGHT) * canvasSize.height
    return { x, y }
  }, [canvasSize])

  // Convert canvas coords to Manim coords
  const canvasToManim = useCallback((cx, cy) => {
    const mx = (cx / canvasSize.width) * MANIM_WIDTH - MANIM_WIDTH / 2
    const my = MANIM_HEIGHT / 2 - (cy / canvasSize.height) * MANIM_HEIGHT
    return { x: parseFloat(mx.toFixed(2)), y: parseFloat(my.toFixed(2)) }
  }, [canvasSize])

  // Scale factor for sizes (Manim units to canvas pixels)
  const scaleX = canvasSize.width / MANIM_WIDTH
  const scaleY = canvasSize.height / MANIM_HEIGHT

  const getTextCorners = useCallback((obj) => {
    const hw = (obj.width || 2) / 2
    const hh = (obj.height || 0.8) / 2
    const rad = (obj.rotation || 0) * Math.PI / 180
    const cos = Math.cos(rad)
    const sin = Math.sin(rad)
    const local = [
      { x: -hw, y: hh },  // NW
      { x: hw, y: hh },   // NE
      { x: -hw, y: -hh }, // SW
      { x: hw, y: -hh },  // SE
    ]
    return local.map(p => ({
      x: obj.x + p.x * cos - p.y * sin,
      y: obj.y + p.x * sin + p.y * cos,
    }))
  }, [])

  const getTextRotateHandle = useCallback((obj) => {
    const hh = (obj.height || 0.8) / 2
    const offset = 20 / scaleY
    const rad = (obj.rotation || 0) * Math.PI / 180
    const cos = Math.cos(rad)
    const sin = Math.sin(rad)
    const local = { x: 0, y: hh + offset }
    return {
      x: obj.x + local.x * cos - local.y * sin,
      y: obj.y + local.x * sin + local.y * cos,
    }
  }, [scaleY])

  // Resize canvas to fit the canvas-wrapper (actual drawing area) while maintaining 16:9 aspect
  useEffect(() => {
    const updateSize = () => {
      const el = canvasWrapperRef.current || containerRef.current
      if (el) {
        const rect = el.getBoundingClientRect()
        const aspect = 16 / 9
        const padding = canvasWrapperRef.current ? 0 : 40
        let width = Math.max(MIN_CANVAS_WIDTH, rect.width - padding)
        let height = Math.max(MIN_CANVAS_HEIGHT, width / aspect)
        if (height > rect.height - padding) {
          height = Math.max(MIN_CANVAS_HEIGHT, rect.height - padding)
          width = Math.max(MIN_CANVAS_WIDTH, height * aspect)
        }
        setCanvasSize({ width, height })
      }
    }
    updateSize()
    window.addEventListener('resize', updateSize)
    return () => window.removeEventListener('resize', updateSize)
  }, [])

  // Observe canvas-wrapper for size changes (e.g. panel resize) so we re-fit the canvas
  useEffect(() => {
    const wrapper = canvasWrapperRef.current
    if (!wrapper || typeof ResizeObserver === 'undefined') return
    const updateSize = () => {
      const rect = wrapper.getBoundingClientRect()
      const pad = 40
      const w = Math.max(0, rect.width - pad)
      const h = Math.max(0, rect.height - pad)
      if (w <= 0 || h <= 0) return
      const aspect = 16 / 9
      let width = Math.max(MIN_CANVAS_WIDTH, w)
      let height = Math.max(MIN_CANVAS_HEIGHT, width / aspect)
      if (height > h) {
        height = Math.max(MIN_CANVAS_HEIGHT, h)
        width = Math.max(MIN_CANVAS_WIDTH, height * aspect)
      }
      setCanvasSize(s => {
        if (s.width === width && s.height === height) return s
        return { width, height }
      })
    }
    const ro = new ResizeObserver(updateSize)
    ro.observe(wrapper)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    if (!openPaletteMenu) return
    const handleClick = (event) => {
      if (dropdownRef.current?.contains(event.target)) return
      setOpenPaletteMenu(null)
    }
    window.addEventListener('click', handleClick)
    return () => window.removeEventListener('click', handleClick)
  }, [openPaletteMenu])

  useEffect(() => {
    if (!contextMenu.open) return
    const onGlobal = (e) => {
      // close on any click outside
      setContextMenu({ open: false, x: 0, y: 0, objectId: null })
    }
    const onKey = (e) => {
      if (e.key === 'Escape') {
        setContextMenu({ open: false, x: 0, y: 0, objectId: null })
      }
    }
    window.addEventListener('mousedown', onGlobal)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', onGlobal)
      window.removeEventListener('keydown', onKey)
    }
  }, [contextMenu.open])

  // Draw the scene
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    
    // Clear and draw background
    ctx.fillStyle = '#1a1a2e'
    ctx.fillRect(0, 0, canvasSize.width, canvasSize.height)
    
    // Draw grid
    ctx.strokeStyle = 'rgba(255,255,255,0.05)'
    ctx.lineWidth = 1
    for (let i = 0; i <= MANIM_WIDTH; i++) {
      const { x } = manimToCanvas(i - MANIM_WIDTH / 2, 0)
      ctx.beginPath()
      ctx.moveTo(x, 0)
      ctx.lineTo(x, canvasSize.height)
      ctx.stroke()
    }
    for (let i = 0; i <= MANIM_HEIGHT; i++) {
      const { y } = manimToCanvas(0, i - MANIM_HEIGHT / 2)
      ctx.beginPath()
      ctx.moveTo(0, y)
      ctx.lineTo(canvasSize.width, y)
      ctx.stroke()
    }
    
    // Draw axes
    ctx.strokeStyle = 'rgba(255,255,255,0.15)'
    ctx.lineWidth = 2
    const origin = manimToCanvas(0, 0)
    ctx.beginPath()
    ctx.moveTo(0, origin.y)
    ctx.lineTo(canvasSize.width, origin.y)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(origin.x, 0)
    ctx.lineTo(origin.x, canvasSize.height)
    ctx.stroke()
    
    // Draw objects (non-LaTeX objects are drawn on canvas; LaTeX is rendered as DOM overlay)
    if (scene?.objects) {
      const visible = getVisibleObjectsAtTime(scene.objects, currentTime)
      const sortedObjects = [...visible].sort((a, b) => (a.zIndex || 0) - (b.zIndex || 0))
      
      // Collect eligible link targets if in link mode
      const eligibleTargetIds = new Set()
      if (linkModeActive && selectedObject) {
        sortedObjects.forEach(obj => {
          if (obj.id !== selectedObjectId) {
            const linkType = getBestLinkType(selectedObject, obj)
            if (linkType) {
              eligibleTargetIds.add(obj.id)
            }
          }
        })
      }
      
      sortedObjects.forEach(obj => {
        if (obj.type === 'latex') return
        const isEligibleTarget = eligibleTargetIds.has(obj.id)
        const isHoveredTarget = obj.id === hoveredLinkTarget
        drawObject(ctx, obj, obj.id === selectedObjectId, scene, linkModeActive, isEligibleTarget, isHoveredTarget)
      })
    }
    
  }, [scene, currentTime, selectedObjectId, canvasSize, manimToCanvas, linkModeActive, selectedObject, hoveredLinkTarget])

  const latexObjects = useMemo(() => {
    const objs = scene?.objects || []
    return getVisibleObjectsAtTime(objs, currentTime).filter(o => o.type === 'latex')
  }, [scene?.objects, currentTime])

  const drawObject = (ctx, obj, isSelected, scene, linkModeActive = false, isEligibleTarget = false, isHoveredTarget = false) => {
    const pos = manimToCanvas(obj.x, obj.y)
    
    ctx.save()
    ctx.translate(pos.x, pos.y)
    
    // Highlight eligible link targets
    if (linkModeActive && isEligibleTarget) {
      const bounds = getObjectBounds(obj)
      const minX = manimToCanvas(bounds.minX, bounds.minY).x
      const maxX = manimToCanvas(bounds.maxX, bounds.maxY).x
      const minY = manimToCanvas(bounds.minX, bounds.minY).y
      const maxY = manimToCanvas(bounds.maxX, bounds.maxY).y
      const width = maxX - minX
      const height = maxY - minY
      const centerX = (minX + maxX) / 2
      const centerY = (minY + maxY) / 2
      
      ctx.save()
      ctx.translate(-pos.x, -pos.y)
      ctx.globalAlpha = isHoveredTarget ? 0.4 : 0.2
      ctx.fillStyle = isHoveredTarget ? '#4ade80' : '#3b82f6'
      ctx.beginPath()
      ctx.rect(centerX - width/2 - 10, centerY - height/2 - 10, width + 20, height + 20)
      ctx.fill()
      ctx.restore()
    }
    ctx.rotate(-obj.rotation * Math.PI / 180) // Negative because canvas Y is inverted

    // For "arc" we actually want a non-circular curve: a quadratic Bézier.
    // We store `cx, cy` as the midpoint-on-curve at t=0.5 (pink handle), and derive the Bézier control point P1.
    // If P0 is start, P2 is end, and M is midpoint at t=0.5:
    //   M = 0.25*P0 + 0.5*P1 + 0.25*P2  =>  P1 = 2*M - 0.5*(P0+P2)
    const computeArcQuadraticControl = (arcObj) => {
      const p2 = { x: arcObj.x2 - arcObj.x, y: arcObj.y2 - arcObj.y }
      const m = { x: arcObj.cx - arcObj.x, y: arcObj.cy - arcObj.y }
      return {
        x: 2 * m.x - 0.5 * p2.x,
        y: 2 * m.y - 0.5 * p2.y,
      }
    }
    
    switch (obj.type) {
      case 'rectangle': {
        const w = obj.width * scaleX
        const h = obj.height * scaleY
        if (obj.fill) {
          ctx.globalAlpha = obj.opacity ?? 1
          ctx.fillStyle = obj.fill
          ctx.fillRect(-w / 2, -h / 2, w, h)
          ctx.globalAlpha = 1
        }
        if (obj.stroke) {
          ctx.strokeStyle = obj.stroke
          ctx.lineWidth = obj.strokeWidth || 2
          ctx.strokeRect(-w / 2, -h / 2, w, h)
        }
        break
      }
      case 'circle': {
        const r = obj.radius * scaleX
        ctx.beginPath()
        ctx.arc(0, 0, r, 0, Math.PI * 2)
        if (obj.fill) {
          ctx.globalAlpha = obj.opacity ?? 1
          ctx.fillStyle = obj.fill
          ctx.fill()
          ctx.globalAlpha = 1
        }
        if (obj.stroke) {
          ctx.strokeStyle = obj.stroke
          ctx.lineWidth = obj.strokeWidth || 2
          ctx.stroke()
        }
        break
      }
      case 'line':
      case 'arrow': {
        const end = { x: (obj.x2 - obj.x) * scaleX, y: -(obj.y2 - obj.y) * scaleY }
        ctx.strokeStyle = obj.stroke || '#ffffff'
        ctx.lineWidth = obj.strokeWidth || 2
        ctx.beginPath()
        ctx.moveTo(0, 0)
        ctx.lineTo(end.x, end.y)
        ctx.stroke()
        
        if (obj.type === 'arrow') {
          // Draw arrowhead
          const angle = Math.atan2(end.y, end.x)
          const headLen = 15
          ctx.beginPath()
          ctx.moveTo(end.x, end.y)
          ctx.lineTo(end.x - headLen * Math.cos(angle - Math.PI / 6), end.y - headLen * Math.sin(angle - Math.PI / 6))
          ctx.moveTo(end.x, end.y)
          ctx.lineTo(end.x - headLen * Math.cos(angle + Math.PI / 6), end.y - headLen * Math.sin(angle + Math.PI / 6))
          ctx.stroke()
        }
        break
      }
      case 'arc': {
        ctx.strokeStyle = obj.stroke || '#ffffff'
        ctx.lineWidth = obj.strokeWidth || 3
        const end = { x: (obj.x2 - obj.x) * scaleX, y: -(obj.y2 - obj.y) * scaleY }
        const p1 = computeArcQuadraticControl(obj)
        const ctrl = { x: p1.x * scaleX, y: -p1.y * scaleY }
        ctx.beginPath()
        ctx.moveTo(0, 0)
        ctx.quadraticCurveTo(ctrl.x, ctrl.y, end.x, end.y)
        ctx.stroke()
        break
      }
      case 'dot': {
        const r = Math.max(obj.radius * scaleX, 5)
        ctx.beginPath()
        ctx.arc(0, 0, r, 0, Math.PI * 2)
        ctx.globalAlpha = obj.opacity ?? 1
        ctx.fillStyle = obj.fill || '#ffffff'
        ctx.fill()
        ctx.globalAlpha = 1
        break
      }
      case 'triangle': {
        // Triangle with 3 vertices (relative to center)
        const verts = obj.vertices || [
          { x: 0, y: 1 },
          { x: -0.866, y: -0.5 },
          { x: 0.866, y: -0.5 }
        ]
        ctx.beginPath()
        verts.forEach((v, i) => {
          const px = v.x * scaleX
          const py = -v.y * scaleY // Flip Y for canvas
          if (i === 0) ctx.moveTo(px, py)
          else ctx.lineTo(px, py)
        })
        ctx.closePath()
        if (obj.fill) {
          ctx.globalAlpha = obj.opacity ?? 1
          ctx.fillStyle = obj.fill
          ctx.fill()
          ctx.globalAlpha = 1
        }
        if (obj.stroke) {
          ctx.strokeStyle = obj.stroke
          ctx.lineWidth = obj.strokeWidth || 2
          ctx.stroke()
        }
        break
      }
      case 'polygon': {
        const verts = obj.vertices || []
        if (verts.length >= 3) {
        ctx.beginPath()
          verts.forEach((v, i) => {
            const px = v.x * scaleX
            const py = -v.y * scaleY // Flip Y for canvas
          if (i === 0) ctx.moveTo(px, py)
          else ctx.lineTo(px, py)
          })
        ctx.closePath()
        if (obj.fill) {
          ctx.globalAlpha = obj.opacity ?? 1
          ctx.fillStyle = obj.fill
          ctx.fill()
          ctx.globalAlpha = 1
        }
        if (obj.stroke) {
          ctx.strokeStyle = obj.stroke
          ctx.lineWidth = obj.strokeWidth || 2
          ctx.stroke()
          }
        }
        break
      }
      case 'text': {
        ctx.globalAlpha = obj.opacity ?? 1
        ctx.font = `${obj.fontSize || 48}px "Latin Modern Roman", "Computer Modern", "Times New Roman", serif`
        ctx.fillStyle = obj.fill || '#ffffff'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(obj.text || 'Text', 0, 0)
        ctx.globalAlpha = 1
        break
      }
      case 'latex': {
        // LaTeX is rendered as HTML overlay (see `latexLayerRef`), not on canvas.
        break
      }
      case 'axes': {
        // Render a simple XY axis that can be moved around.
        const xLen = (obj.xLength || 8) * scaleX
        const yLen = (obj.yLength || 4) * scaleY
        const stroke = obj.stroke || '#ffffff'
        const strokeWidth = obj.strokeWidth || 2
        ctx.strokeStyle = stroke
          ctx.lineWidth = strokeWidth

        // Axis lines (centered at obj.x,obj.y)
              ctx.beginPath()
        ctx.moveTo(-xLen / 2, 0)
        ctx.lineTo(xLen / 2, 0)
              ctx.stroke()
              ctx.beginPath()
        ctx.moveTo(0, -yLen / 2)
        ctx.lineTo(0, yLen / 2)
              ctx.stroke()

        // Ticks (optional)
        if (obj.showTicks) {
          ctx.strokeStyle = stroke
          ctx.lineWidth = Math.max(1, strokeWidth - 1)
          const tickPx = 6
          const stepX = obj.xRange?.step ?? 1
          const stepY = obj.yRange?.step ?? 1

          // Ticks along x axis
          for (let mx = (obj.xRange?.min ?? -5); mx <= (obj.xRange?.max ?? 5); mx += stepX) {
            const tx = (mx / (obj.xRange?.max ?? 5)) * (xLen / 2)
        ctx.beginPath()
            ctx.moveTo(tx, -tickPx / 2)
            ctx.lineTo(tx, tickPx / 2)
        ctx.stroke()
          }
          // Ticks along y axis
          for (let my = (obj.yRange?.min ?? -3); my <= (obj.yRange?.max ?? 3); my += stepY) {
            const ty = -(my / (obj.yRange?.max ?? 3)) * (yLen / 2)
            ctx.beginPath()
            ctx.moveTo(-tickPx / 2, ty)
            ctx.lineTo(tickPx / 2, ty)
          ctx.stroke()
        }
        }
        
        // Draw axis labels
        ctx.fillStyle = stroke
        ctx.font = '20px "Latin Modern Roman", "Computer Modern", "Times New Roman", serif'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        
        // X-axis label (at the right end)
        const xLabelText = obj.xLabel || 'x'
        ctx.fillText(xLabelText, xLen / 2 + 20, 0)
        
        // Y-axis label (at the top end)
        const yLabelText = obj.yLabel || 'y'
        ctx.fillText(yLabelText, 0, -yLen / 2 - 20)
        
        break
      }
      
      case 'graph': {
        // Render a function graph
        const stroke = obj.stroke || '#4ade80'
        const strokeWidth = obj.strokeWidth || 3
        const formula = obj.formula || 'x^2'
        
        // Get axis info (graph should be attached to an axes object)
        const axesId = obj.axesId
        const axes = scene?.objects?.find(o => o.id === axesId)
        
        // Use axes range if available, otherwise use default range
        const xMin = axes?.xRange?.min ?? obj.xRange?.min ?? -5
        const xMax = axes?.xRange?.max ?? obj.xRange?.max ?? 5
        const yMin = axes?.yRange?.min ?? obj.yRange?.min ?? -3
        const yMax = axes?.yRange?.max ?? obj.yRange?.max ?? 3
        
        let points = []
        try {
          points = mathParser.sampleFunction(formula, xMin, xMax, 200)
        } catch (_) {
          /* skip graph if formula invalid */
        }
        
        if (points.length > 1) {
          ctx.strokeStyle = stroke
          ctx.lineWidth = strokeWidth
          ctx.globalAlpha = obj.opacity ?? 1
          ctx.beginPath()
          
          let isFirstPoint = true
          points.forEach(point => {
            // Skip points outside y range
            if (point.y < yMin || point.y > yMax) return
            
            // Local coords (we're already translated to obj.x, obj.y): scale math units to pixels
            const px = point.x * scaleX
            const py = -point.y * scaleY
            
            if (isFirstPoint) {
              ctx.moveTo(px, py)
              isFirstPoint = false
            } else {
              ctx.lineTo(px, py)
            }
          })
          
          ctx.stroke()
          ctx.globalAlpha = 1
        }
        break
      }
      
      case 'graphCursor': {
        // Render a draggable point on a graph
        const graph = getGraphById(scene?.objects || [], obj.graphId)
        if (!graph) break
        
        const formula = graph.formula || 'x^2'
        const x0 = obj.x0 ?? 0
        const graphXRange = graph.xRange || { min: -5, max: 5 }
        const clampedX0 = clampToGraphRange(x0, graphXRange)
        const point = projectToGraph(formula, clampedX0)
        
        // Get axes if linked for coordinate conversion
        const axes = obj.axesId ? scene?.objects?.find(o => o.id === obj.axesId) : null
        const axesXRange = axes?.xRange || graphXRange
        
        // If we have a valid point, render it
        if (!isNaN(point.y) && isFinite(point.y)) {
          // Position relative to graph's origin or axes
          const offsetX = (axes || graph).x || 0
          const offsetY = (axes || graph).y || 0
          
          const canvasPoint = manimToCanvas(offsetX + point.x, offsetY + point.y)
          const radius = (obj.radius || 0.08) * scaleX
          const fill = obj.fill || '#e94560'
          
          ctx.globalAlpha = obj.opacity ?? 1
          
          // Draw crosshair if enabled
          if (obj.showCrosshair) {
            ctx.strokeStyle = fill
            ctx.lineWidth = 1
            ctx.setLineDash([5, 5])
            const crosshairSize = 20
            ctx.beginPath()
            ctx.moveTo(canvasPoint.x - crosshairSize, canvasPoint.y)
            ctx.lineTo(canvasPoint.x + crosshairSize, canvasPoint.y)
            ctx.moveTo(canvasPoint.x, canvasPoint.y - crosshairSize)
            ctx.lineTo(canvasPoint.x, canvasPoint.y + crosshairSize)
            ctx.stroke()
            ctx.setLineDash([])
          }
          
          // Draw dot if enabled
          if (obj.showDot) {
            ctx.fillStyle = fill
            ctx.beginPath()
            ctx.arc(canvasPoint.x, canvasPoint.y, radius, 0, Math.PI * 2)
            ctx.fill()
            
            // Draw white border
            ctx.strokeStyle = '#ffffff'
            ctx.lineWidth = 2
            ctx.stroke()
          }
          
          // Draw label if enabled
          if (obj.showLabel) {
            const labelText = (obj.labelFormat || '({x0}, {y0})')
              .replace('{x0}', clampedX0.toFixed(2))
              .replace('{y0}', point.y.toFixed(2))
            ctx.fillStyle = '#ffffff'
            ctx.font = '14px monospace'
            ctx.textAlign = 'left'
            ctx.textBaseline = 'top'
            ctx.fillText(labelText, canvasPoint.x + radius + 5, canvasPoint.y - radius)
          }
          
          ctx.globalAlpha = 1
        }
        break
      }
      
      case 'tangentLine': {
        // Render a tangent line to a graph
        const graph = getGraphById(scene?.objects || [], obj.graphId)
        if (!graph) break
        
        const formula = graph.formula || 'x^2'
        const axes = obj.axesId ? scene?.objects?.find(o => o.id === obj.axesId) : null
        
        // Get x0 from cursor or use direct x0
        let x0 = obj.x0 ?? 0
        if (obj.cursorId) {
          const cursor = getCursorById(scene?.objects || [], obj.cursorId)
          if (cursor) {
            x0 = cursor.x0 ?? 0
          }
        }
        
        const visibleSpan = obj.visibleSpan || 2
        const h = obj.derivativeStep || 0.001
        const tangent = tangentLineAt(formula, x0, visibleSpan, h)
        
        if (!isNaN(tangent.x1) && !isNaN(tangent.y1) && !isNaN(tangent.x2) && !isNaN(tangent.y2)) {
          const offsetX = (axes || graph).x || 0
          const offsetY = (axes || graph).y || 0
          
          const p1 = manimToCanvas(offsetX + tangent.x1, offsetY + tangent.y1)
          const p2 = manimToCanvas(offsetX + tangent.x2, offsetY + tangent.y2)
          
          const stroke = obj.stroke || '#fbbf24'
          const strokeWidth = obj.strokeWidth || 2
          
          ctx.globalAlpha = obj.opacity ?? 1
          ctx.strokeStyle = stroke
          ctx.lineWidth = strokeWidth
          ctx.beginPath()
          ctx.moveTo(p1.x, p1.y)
          ctx.lineTo(p2.x, p2.y)
          ctx.stroke()
          
          // Draw slope label if enabled
          if (obj.showSlopeLabel) {
            const slope = derivativeAt(formula, x0, h)
            const midX = (p1.x + p2.x) / 2
            const midY = (p1.y + p2.y) / 2
            const labelText = `m = ${slope.toFixed(3)}`
            ctx.fillStyle = stroke
            ctx.font = '14px monospace'
            ctx.textAlign = 'center'
            ctx.textBaseline = 'middle'
            const offset = (obj.slopeLabelOffset || 0.5) * scaleY
            ctx.fillText(labelText, midX, midY - offset)
          }
          
          ctx.globalAlpha = 1
        }
        break
      }
      
      case 'limitProbe': {
        // Render limit approach visualization
        const graph = getGraphById(scene?.objects || [], obj.graphId)
        if (!graph) break
        
        const formula = graph.formula || 'x^2'
        const axes = obj.axesId ? scene?.objects?.find(o => o.id === obj.axesId) : null
        
        // Get x0 from cursor or use direct x0
        let x0 = obj.x0 ?? 0
        if (obj.cursorId) {
          const cursor = getCursorById(scene?.objects || [], obj.cursorId)
          if (cursor) {
            x0 = cursor.x0 ?? 0
          }
        }
        
        const direction = obj.direction || 'both'
        const deltaSchedule = obj.deltaSchedule || [1, 0.5, 0.1, 0.01]
        const approachPoints = limitEstimate(formula, x0, direction, deltaSchedule)
        
        if (approachPoints.length > 0) {
          const offsetX = (axes || graph).x || 0
          const offsetY = (axes || graph).y || 0
          const fill = obj.fill || '#3b82f6'
          const radius = (obj.radius || 0.06) * scaleX
          
          ctx.globalAlpha = obj.opacity ?? 1
          
          // Draw approach points if enabled
          if (obj.showPoints) {
            approachPoints.forEach(point => {
              const canvasPoint = manimToCanvas(offsetX + point.x, offsetY + point.y)
              ctx.fillStyle = fill
              ctx.beginPath()
              ctx.arc(canvasPoint.x, canvasPoint.y, radius, 0, Math.PI * 2)
              ctx.fill()
            })
          }
          
          // Draw arrows pointing to x0 if enabled
          if (obj.showArrow) {
            const targetPoint = manimToCanvas(offsetX + x0, offsetY + evalAt(formula, x0))
            ctx.strokeStyle = fill
            ctx.lineWidth = 2
            ctx.setLineDash([])
            
            approachPoints.forEach(point => {
              if (point.direction === 'left' || point.direction === 'right') {
                const startPoint = manimToCanvas(offsetX + point.x, offsetY + point.y)
                ctx.beginPath()
                ctx.moveTo(startPoint.x, startPoint.y)
                const dx = targetPoint.x - startPoint.x
                const dy = targetPoint.y - startPoint.y
                const len = Math.sqrt(dx * dx + dy * dy)
                if (len > 0) {
                  // Draw arrow
                  const arrowLen = Math.min(len * 0.8, 30)
                  const arrowX = startPoint.x + (dx / len) * arrowLen
                  const arrowY = startPoint.y + (dy / len) * arrowLen
                  ctx.lineTo(arrowX, arrowY)
                  ctx.stroke()
                  
                  // Arrowhead
                  const angle = Math.atan2(dy, dx)
                  const arrowHeadLen = 8
                  const arrowHeadAngle = Math.PI / 6
                  ctx.beginPath()
                  ctx.moveTo(arrowX, arrowY)
                  ctx.lineTo(arrowX - arrowHeadLen * Math.cos(angle - arrowHeadAngle), arrowY - arrowHeadLen * Math.sin(angle - arrowHeadAngle))
                  ctx.moveTo(arrowX, arrowY)
                  ctx.lineTo(arrowX - arrowHeadLen * Math.cos(angle + arrowHeadAngle), arrowY - arrowHeadLen * Math.sin(angle + arrowHeadAngle))
                  ctx.stroke()
                }
              }
            })
          }
          
          // Draw readout if enabled
          if (obj.showReadout) {
            const limitInfo = estimateLimit(formula, x0)
            const readoutY = offsetY + 2
            ctx.fillStyle = '#ffffff'
            ctx.font = '14px monospace'
            ctx.textAlign = 'center'
            ctx.textBaseline = 'middle'
            
            let readoutText = ''
            if (limitInfo.exists) {
              readoutText = `lim f(x) = ${limitInfo.limit.toFixed(3)}`
            } else {
              readoutText = `L: ${limitInfo.leftValue.toFixed(3)}, R: ${limitInfo.rightValue.toFixed(3)}`
            }
            
            const readoutPoint = manimToCanvas(offsetX + x0, readoutY)
            ctx.fillText(readoutText, readoutPoint.x, readoutPoint.y)
          }
          
          ctx.globalAlpha = 1
        }
        break
      }
      
      case 'valueLabel': {
        // Render a label that displays a computed value
        const graph = obj.graphId ? getGraphById(scene?.objects || [], obj.graphId) : null
        const cursor = obj.cursorId ? getCursorById(scene?.objects || [], obj.cursorId) : null
        
        let valueText = ''
        
        if (obj.valueType === 'slope' && graph && cursor) {
          const formula = graph.formula || 'x^2'
          const x0 = cursor.x0 ?? 0
          const slope = derivativeAt(formula, x0)
          valueText = `${obj.labelPrefix || ''}${slope.toFixed(3)}${obj.labelSuffix || ''}`
        } else if (obj.valueType === 'x' && cursor) {
          valueText = `${obj.labelPrefix || ''}${(cursor.x0 ?? 0).toFixed(2)}${obj.labelSuffix || ''}`
        } else if (obj.valueType === 'y' && graph && cursor) {
          const formula = graph.formula || 'x^2'
          const x0 = cursor.x0 ?? 0
          const y = evalAt(formula, x0)
          valueText = `${obj.labelPrefix || ''}${y.toFixed(3)}${obj.labelSuffix || ''}`
        } else if (obj.valueType === 'custom' && obj.customExpression) {
          valueText = obj.customExpression
        } else {
          valueText = obj.labelPrefix || ''
        }
        
        if (valueText) {
          const canvasPoint = manimToCanvas(obj.x, obj.y)
          const fontSize = obj.fontSize || 24
          
          ctx.globalAlpha = obj.opacity ?? 1
          
          // Draw background if enabled
          if (obj.showBackground) {
            ctx.fillStyle = obj.backgroundFill || '#000000'
            ctx.globalAlpha = (obj.opacity ?? 1) * (obj.backgroundOpacity ?? 0.7)
            ctx.fillRect(canvasPoint.x - 50, canvasPoint.y - 15, 100, 30)
            ctx.globalAlpha = obj.opacity ?? 1
          }
          
          // Draw text
          ctx.fillStyle = obj.fill || '#ffffff'
          ctx.font = `${fontSize}px monospace`
          ctx.textAlign = 'center'
          ctx.textBaseline = 'middle'
          ctx.fillText(valueText, canvasPoint.x, canvasPoint.y)
          
          ctx.globalAlpha = 1
        }
        break
      }
    }
    
    ctx.restore()
    
    // Draw vertex labels (always visible, not just when selected)
    ctx.save()
    const LABEL_OFFSET = 30 // pixels to offset label outside the shape
    
    if (obj.type === 'triangle') {
      const verts = obj.vertices || []
      // Calculate centroid
      const centroid = verts.reduce(
        (acc, v) => ({ x: acc.x + v.x, y: acc.y + v.y }),
        { x: 0, y: 0 }
      )
      centroid.x /= verts.length || 1
      centroid.y /= verts.length || 1
      
      verts.forEach((v) => {
        if (v.label) {
          const vManim = { x: obj.x + v.x, y: obj.y + v.y }
          const cManim = { x: obj.x + centroid.x, y: obj.y + centroid.y }
          
          // Direction vector from centroid to vertex
          const dx = vManim.x - cManim.x
          const dy = vManim.y - cManim.y
          const dist = Math.sqrt(dx * dx + dy * dy)
          
          if (dist > 0.01) {
            // Normalize and extend outward
            const scale = LABEL_OFFSET / scaleX // Convert pixels to Manim units
            const labelX = vManim.x + (dx / dist) * scale
            const labelY = vManim.y + (dy / dist) * scale
            const labelPos = manimToCanvas(labelX, labelY)
            
            ctx.fillStyle = '#ffffff'
            ctx.font = '18px "Latin Modern Roman", "Computer Modern", "Times New Roman", serif'
            ctx.textAlign = 'center'
            ctx.textBaseline = 'middle'
            ctx.fillText(v.label, labelPos.x, labelPos.y)
          }
        }
      })
    } else if (obj.type === 'polygon') {
      const verts = obj.vertices || []
      // Calculate centroid
      const centroid = verts.reduce(
        (acc, v) => ({ x: acc.x + v.x, y: acc.y + v.y }),
        { x: 0, y: 0 }
      )
      centroid.x /= verts.length || 1
      centroid.y /= verts.length || 1
      
      verts.forEach((v) => {
        if (v.label) {
          const vManim = { x: obj.x + v.x, y: obj.y + v.y }
          const cManim = { x: obj.x + centroid.x, y: obj.y + centroid.y }
          
          // Direction vector from centroid to vertex
          const dx = vManim.x - cManim.x
          const dy = vManim.y - cManim.y
          const dist = Math.sqrt(dx * dx + dy * dy)
          
          if (dist > 0.01) {
            // Normalize and extend outward
            const scale = LABEL_OFFSET / scaleX
            const labelX = vManim.x + (dx / dist) * scale
            const labelY = vManim.y + (dy / dist) * scale
            const labelPos = manimToCanvas(labelX, labelY)
            
            ctx.fillStyle = '#ffffff'
            ctx.font = '18px "Latin Modern Roman", "Computer Modern", "Times New Roman", serif'
            ctx.textAlign = 'center'
            ctx.textBaseline = 'middle'
            ctx.fillText(v.label, labelPos.x, labelPos.y)
          }
        }
      })
    } else if (obj.type === 'rectangle') {
      const corners = [
        { x: obj.x - obj.width/2, y: obj.y + obj.height/2, label: obj.cornerLabels?.[0] },
        { x: obj.x + obj.width/2, y: obj.y + obj.height/2, label: obj.cornerLabels?.[1] },
        { x: obj.x - obj.width/2, y: obj.y - obj.height/2, label: obj.cornerLabels?.[2] },
        { x: obj.x + obj.width/2, y: obj.y - obj.height/2, label: obj.cornerLabels?.[3] },
      ]
      corners.forEach((c) => {
        if (c.label) {
          // Direction from rectangle center to corner
          const dx = c.x - obj.x
          const dy = c.y - obj.y
          const dist = Math.sqrt(dx * dx + dy * dy)
          
          if (dist > 0.01) {
            // Normalize and extend outward
            const scale = LABEL_OFFSET / scaleX
            const labelX = c.x + (dx / dist) * scale
            const labelY = c.y + (dy / dist) * scale
            const labelPos = manimToCanvas(labelX, labelY)
            
            ctx.fillStyle = '#ffffff'
            ctx.font = '18px "Latin Modern Roman", "Computer Modern", "Times New Roman", serif'
            ctx.textAlign = 'center'
            ctx.textBaseline = 'middle'
            ctx.fillText(c.label, labelPos.x, labelPos.y)
          }
        }
      })
    }
    ctx.restore()
    
    // Selection outline and handles
    // Highlight linked targets when selected object is a tool
    if (!isSelected && selectedObjectId && selectedObject) {
      const isLinkedTarget = 
        (obj.type === 'graph' && selectedObject.graphId === obj.id) ||
        (obj.type === 'graphCursor' && (selectedObject.cursorId === obj.id || selectedObject.graphId === obj.graphId)) ||
        (obj.type === 'axes' && (selectedObject.axesId === obj.id || selectedObject.graphId && scene?.objects?.find(o => o.id === selectedObject.graphId)?.axesId === obj.id))
      
      if (isLinkedTarget) {
        ctx.save()
        ctx.strokeStyle = '#fbbf24'
        ctx.lineWidth = 2
        ctx.setLineDash([3, 3])
        ctx.globalAlpha = 0.6
        const pad = 4
        // Draw subtle highlight for linked targets (reuse outline logic below)
        const bounds = getObjectBounds(obj)
        const minX = manimToCanvas(bounds.minX, bounds.minY).x
        const maxX = manimToCanvas(bounds.maxX, bounds.maxY).x
        const minY = manimToCanvas(bounds.minX, bounds.minY).y
        const maxY = manimToCanvas(bounds.maxX, bounds.maxY).y
        ctx.beginPath()
        ctx.rect(minX - pad, minY - pad, maxX - minX + pad * 2, maxY - minY + pad * 2)
        ctx.stroke()
        ctx.restore()
      }
    }
    
    if (isSelected) {
      ctx.save()
      
      // Draw shape-specific outline with padding - stronger/more visible
      ctx.strokeStyle = '#e94560'
      ctx.lineWidth = 4
      ctx.setLineDash([6, 3])
      ctx.globalAlpha = 1
      const pad = 10
      
      switch (obj.type) {
        case 'rectangle': {
          ctx.translate(pos.x, pos.y)
          ctx.rotate(-obj.rotation * Math.PI / 180)
          const w = obj.width * scaleX
          const h = obj.height * scaleY
          ctx.strokeRect(-w/2 - pad, -h/2 - pad, w + pad*2, h + pad*2)
          break
        }
        case 'circle':
        case 'dot': {
          const r = obj.radius * scaleX
          ctx.beginPath()
          ctx.arc(pos.x, pos.y, r + pad, 0, Math.PI * 2)
          ctx.stroke()
          break
        }
        case 'triangle': {
          const verts = obj.vertices || [{ x: 0, y: 1 }, { x: -0.866, y: -0.5 }, { x: 0.866, y: -0.5 }]

          // Draw outline centered on the triangle center, in the same local space as the triangle itself.
          // We scale vertices uniformly so the pink dotted outline is the same shape, just larger.
          ctx.translate(pos.x, pos.y)
          ctx.rotate(-obj.rotation * Math.PI / 180)

          // Compute triangle centroid in LOCAL (object) coords so scaling stays centered on the *actual* triangle,
          // even if the vertices are no longer centered around (0,0) after editing.
          const centroid = verts.reduce(
            (acc, v) => ({ x: acc.x + v.x, y: acc.y + v.y }),
            { x: 0, y: 0 }
          )
          centroid.x /= verts.length || 1
          centroid.y /= verts.length || 1

          // Convert vertices into local canvas coords and compute a uniform scale factor that expands by ~`pad` pixels,
          // measuring distance from the centroid (not from the object origin).
          const localVerts = verts.map(v => ({ x: v.x * scaleX, y: -v.y * scaleY }))
          const cCanvas = { x: centroid.x * scaleX, y: -centroid.y * scaleY }
          const maxDist = Math.max(
            1e-6,
            ...localVerts.map(p => Math.hypot(p.x - cCanvas.x, p.y - cCanvas.y))
          )
          // Make triangle outline a bit more prominent than other shapes
          const trianglePad = pad * 2.25
          const outlineScale = 1 + (trianglePad / maxDist)

          ctx.beginPath()
          localVerts.forEach((p, i) => {
            const x = cCanvas.x + (p.x - cCanvas.x) * outlineScale
            const y = cCanvas.y + (p.y - cCanvas.y) * outlineScale
            if (i === 0) ctx.moveTo(x, y)
            else ctx.lineTo(x, y)
          })
          ctx.closePath()
          ctx.stroke()
          break
        }
        case 'polygon': {
          const verts = obj.vertices || []
          if (verts.length >= 3) {
          ctx.beginPath()
            
            // Scale polygon slightly larger from center for outline
            const scale = 1 + (pad * 2) / (scaleX * 2)
            
            verts.forEach((v, i) => {
              // Scale vertex outward from center
              const scaledX = v.x * scale
              const scaledY = v.y * scale
              const outlinePos = manimToCanvas(obj.x + scaledX, obj.y + scaledY)
              
              if (i === 0) ctx.moveTo(outlinePos.x, outlinePos.y)
              else ctx.lineTo(outlinePos.x, outlinePos.y)
            })
          ctx.closePath()
          ctx.stroke()
          }
          break
        }
        case 'line':
        case 'arrow':
        case 'arc': {
          // No pink dashed outline for these (they already have explicit edit handles).
          break
        }
        case 'text': {
          ctx.translate(pos.x, pos.y)
          ctx.rotate(-obj.rotation * Math.PI / 180)
          const w = (obj.width || 2) * scaleX
          const h = (obj.height || 0.8) * scaleY
          ctx.strokeRect(-w/2 - pad, -h/2 - pad, w + pad*2, h + pad*2)
          break
        }
        default: {
          // Fallback to bounding box for latex
          ctx.translate(pos.x, pos.y)
          ctx.rotate(-obj.rotation * Math.PI / 180)
      const bounds = getObjectBounds(obj)
          const w = (bounds.maxX - bounds.minX) * scaleX
          const h = (bounds.maxY - bounds.minY) * scaleY
          ctx.strokeRect(-w/2 - pad, -h/2 - pad, w + pad*2, h + pad*2)
        }
      }
      
      ctx.setLineDash([])
      ctx.restore()
      
      // Draw vertex handles (without rotation)
      ctx.save()
      if (obj.type === 'triangle') {
        ctx.fillStyle = '#4ade80'
        const verts = obj.vertices || []
        verts.forEach((v, i) => {
          const vPos = manimToCanvas(obj.x + v.x, obj.y + v.y)
          ctx.beginPath()
          ctx.arc(vPos.x, vPos.y, HANDLE_SIZE/2 + 2, 0, Math.PI * 2)
          ctx.fill()
        })
      } else if (obj.type === 'polygon') {
        // Draw vertex handles for polygons
        ctx.fillStyle = '#4ade80'
        const verts = obj.vertices || []
        verts.forEach((v, i) => {
          const vPos = manimToCanvas(obj.x + v.x, obj.y + v.y)
          ctx.beginPath()
          ctx.arc(vPos.x, vPos.y, HANDLE_SIZE/2 + 2, 0, Math.PI * 2)
          ctx.fill()
        })
      } else if (obj.type === 'rectangle') {
        // Draw corner handles at actual corners
        ctx.fillStyle = '#4ade80'
        const corners = [
          { x: obj.x - obj.width/2, y: obj.y + obj.height/2, label: obj.cornerLabels?.[0] }, // NW
          { x: obj.x + obj.width/2, y: obj.y + obj.height/2, label: obj.cornerLabels?.[1] }, // NE
          { x: obj.x - obj.width/2, y: obj.y - obj.height/2, label: obj.cornerLabels?.[2] }, // SW
          { x: obj.x + obj.width/2, y: obj.y - obj.height/2, label: obj.cornerLabels?.[3] }, // SE
        ]
        corners.forEach((c, i) => {
          const cPos = manimToCanvas(c.x, c.y)
          ctx.beginPath()
          ctx.arc(cPos.x, cPos.y, HANDLE_SIZE/2 + 2, 0, Math.PI * 2)
          ctx.fill()
        })
      } else if (obj.type === 'line' || obj.type === 'arrow') {
        // Draw endpoint handles
        const start = manimToCanvas(obj.x, obj.y)
        const end = manimToCanvas(obj.x2, obj.y2)
        ctx.fillStyle = '#4ade80'
        ctx.beginPath()
        ctx.arc(start.x, start.y, HANDLE_SIZE/2 + 2, 0, Math.PI * 2)
        ctx.fill()
        ctx.beginPath()
        ctx.arc(end.x, end.y, HANDLE_SIZE/2 + 2, 0, Math.PI * 2)
        ctx.fill()
      } else if (obj.type === 'arc') {
        // Draw arc handles: start/end + control (midpoint handle)
        const start = manimToCanvas(obj.x, obj.y)
        const end = manimToCanvas(obj.x2, obj.y2)
        const ctrl = manimToCanvas(obj.cx, obj.cy)
        // Endpoints (green)
        ctx.fillStyle = '#4ade80'
        ctx.beginPath()
        ctx.arc(start.x, start.y, HANDLE_SIZE/2 + 2, 0, Math.PI * 2)
        ctx.fill()
        ctx.beginPath()
        ctx.arc(end.x, end.y, HANDLE_SIZE/2 + 2, 0, Math.PI * 2)
        ctx.fill()
        // Control handle (pink)
        ctx.fillStyle = '#e94560'
        ctx.beginPath()
        ctx.arc(ctrl.x, ctrl.y, HANDLE_SIZE/2 + 2, 0, Math.PI * 2)
        ctx.fill()
      } else if (obj.type === 'axes') {
        // Draw axis endpoint handles for extending
        const xLen = obj.xLength || 8
        const yLen = obj.yLength || 4
        const left = manimToCanvas(obj.x - xLen / 2, obj.y)
        const right = manimToCanvas(obj.x + xLen / 2, obj.y)
        const top = manimToCanvas(obj.x, obj.y + yLen / 2)
        const bottom = manimToCanvas(obj.x, obj.y - yLen / 2)
        
        ctx.fillStyle = '#4ade80'
        // X-axis endpoints
        ctx.beginPath()
        ctx.arc(left.x, left.y, HANDLE_SIZE/2 + 2, 0, Math.PI * 2)
        ctx.fill()
        ctx.beginPath()
        ctx.arc(right.x, right.y, HANDLE_SIZE/2 + 2, 0, Math.PI * 2)
        ctx.fill()
        // Y-axis endpoints
        ctx.beginPath()
        ctx.arc(top.x, top.y, HANDLE_SIZE/2 + 2, 0, Math.PI * 2)
        ctx.fill()
        ctx.beginPath()
        ctx.arc(bottom.x, bottom.y, HANDLE_SIZE/2 + 2, 0, Math.PI * 2)
        ctx.fill()
      } else if (obj.type === 'text') {
        // Draw corner handles for text (like rectangles)
        ctx.fillStyle = '#4ade80'
        const corners = getTextCorners(obj)
        corners.forEach(c => {
          const cPos = manimToCanvas(c.x, c.y)
          ctx.beginPath()
          ctx.arc(cPos.x, cPos.y, HANDLE_SIZE/2 + 2, 0, Math.PI * 2)
          ctx.fill()
        })
        const rot = getTextRotateHandle(obj)
        const rPos = manimToCanvas(rot.x, rot.y)
        ctx.fillStyle = '#e94560'
        ctx.beginPath()
        ctx.arc(rPos.x, rPos.y, HANDLE_SIZE/2 + 2, 0, Math.PI * 2)
        ctx.fill()
      } else if (obj.type === 'circle') {
        // Draw corner resize handles at bounding box corners for circles only
        ctx.fillStyle = '#e94560'
        const bounds = getObjectBounds(obj)
        const topLeft = manimToCanvas(bounds.minX, bounds.maxY)
        const bottomRight = manimToCanvas(bounds.maxX, bounds.minY)
        const size = {
          width: bottomRight.x - topLeft.x,
          height: bottomRight.y - topLeft.y
        }
        const handles = getHandles(obj, topLeft, size)
        handles.forEach(handle => {
          ctx.fillRect(handle.x - HANDLE_SIZE/2, handle.y - HANDLE_SIZE/2, HANDLE_SIZE, HANDLE_SIZE)
        })
      }
      
      ctx.restore()
    }
  }
  
  // Get resize handles for an object
  const getHandles = (obj, topLeft, size) => {
    if (obj.type === 'line' || obj.type === 'arrow' || obj.type === 'triangle' || obj.type === 'rectangle' || obj.type === 'polygon') {
      return [] // These use vertex handles instead
    }
    
    return [
      { id: 'nw', x: topLeft.x - 4, y: topLeft.y - 4 },
      { id: 'ne', x: topLeft.x + size.width + 4, y: topLeft.y - 4 },
      { id: 'sw', x: topLeft.x - 4, y: topLeft.y + size.height + 4 },
      { id: 'se', x: topLeft.x + size.width + 4, y: topLeft.y + size.height + 4 },
    ]
  }

  const getObjectBounds = (obj) => {
    switch (obj.type) {
      case 'rectangle':
        return {
          minX: obj.x - obj.width / 2,
          maxX: obj.x + obj.width / 2,
          minY: obj.y - obj.height / 2,
          maxY: obj.y + obj.height / 2
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
      case 'circle':
      case 'dot':
        return {
          minX: obj.x - obj.radius,
          maxX: obj.x + obj.radius,
          minY: obj.y - obj.radius,
          maxY: obj.y + obj.radius
        }
      case 'polygon': {
        const verts = obj.vertices || []
        if (verts.length === 0) {
          return { minX: obj.x - 1, maxX: obj.x + 1, minY: obj.y - 1, maxY: obj.y + 1 }
        }
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
        // Bounds by sampling the quadratic Bézier in Manim coords (control derived from midpoint).
        const x0 = obj.x
        const y0 = obj.y
        const x2 = obj.x2
        const y2 = obj.y2
        // Derived quadratic control point P1 in absolute Manim coords
        const p1 = {
          x: 2 * obj.cx - 0.5 * (x0 + x2),
          y: 2 * obj.cy - 0.5 * (y0 + y2),
        }

        const pts = []
        const n = 24
        for (let i = 0; i <= n; i++) {
          const t = i / n
          const mt = 1 - t
          const px = mt * mt * x0 + 2 * mt * t * p1.x + t * t * x2
          const py = mt * mt * y0 + 2 * mt * t * p1.y + t * t * y2
          pts.push({ x: px, y: py })
        }
        const xs = pts.map(p => p.x)
        const ys = pts.map(p => p.y)
        return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) }
      }
      case 'text':
        return {
          minX: obj.x - (obj.width || 2) / 2,
          maxX: obj.x + (obj.width || 2) / 2,
          minY: obj.y - (obj.height || 0.8) / 2,
          maxY: obj.y + (obj.height || 0.8) / 2
        }
      case 'axes': {
        const xLen = obj.xLength || 8
        const yLen = obj.yLength || 4
          return {
          minX: obj.x - xLen / 2,
          maxX: obj.x + xLen / 2,
          minY: obj.y - yLen / 2,
          maxY: obj.y + yLen / 2
        }
        }
      case 'graph': {
        // Sample the function to get bounds
        const formula = obj.formula || 'x^2'
        const xMin = obj.xRange?.min ?? -5
        const xMax = obj.xRange?.max ?? 5
        const points = mathParser.sampleFunction(formula, xMin, xMax, 100)
        
        if (points.length === 0) {
          return { minX: obj.x - 1, maxX: obj.x + 1, minY: obj.y - 1, maxY: obj.y + 1 }
        }
        
        const xs = points.map(p => obj.x + p.x)
        const ys = points.map(p => obj.y + p.y)
        return {
          minX: Math.min(...xs),
          maxX: Math.max(...xs),
          minY: Math.min(...ys),
          maxY: Math.max(...ys)
        }
      }
      default:
        return { minX: obj.x - 1, maxX: obj.x + 1, minY: obj.y - 0.5, maxY: obj.y + 0.5 }
    }
  }

  const hitTest = (canvasX, canvasY) => {
    if (!scene?.objects) return null
    const objects = getVisibleObjectsAtTime(scene.objects, currentTime)
    const manim = canvasToManim(canvasX, canvasY)
    
    // Check objects in reverse z-order (top first)
    // When z-index is equal, later objects (higher array index) are in front
    const sortedObjects = objects
      .map((obj, index) => ({ obj, index }))
      .sort((a, b) => {
        const zDiff = (b.obj.zIndex || 0) - (a.obj.zIndex || 0)
        if (zDiff !== 0) return zDiff
        // If z-index is equal, later in array = in front
        return b.index - a.index
      })
    
    for (const { obj } of sortedObjects) {
      if (hitTestShape(obj, manim.x, manim.y)) {
        return obj.id
      }
    }
    return null
  }

  // More precise hit testing based on actual shape geometry
  const hitTestShape = (obj, mx, my) => {
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
        // Check if point is inside the triangle using barycentric coordinates
        const verts = obj.vertices || [{ x: 0, y: 1 }, { x: -0.866, y: -0.5 }, { x: 0.866, y: -0.5 }]
        const v0 = { x: obj.x + verts[0].x, y: obj.y + verts[0].y }
        const v1 = { x: obj.x + verts[1].x, y: obj.y + verts[1].y }
        const v2 = { x: obj.x + verts[2].x, y: obj.y + verts[2].y }
        
        const sign = (p1, p2, p3) => {
          return (p1.x - p3.x) * (p2.y - p3.y) - (p2.x - p3.x) * (p1.y - p3.y)
        }
        
        const d1 = sign({ x: mx, y: my }, v0, v1)
        const d2 = sign({ x: mx, y: my }, v1, v2)
        const d3 = sign({ x: mx, y: my }, v2, v0)
        
        const hasNeg = (d1 < 0) || (d2 < 0) || (d3 < 0)
        const hasPos = (d1 > 0) || (d2 > 0) || (d3 > 0)
        
        return !(hasNeg && hasPos)
      }
      case 'polygon': {
        // Check if point is inside polygon using ray casting algorithm
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
        // Check if point is near the line (within stroke width distance)
        const distToLine = pointToLineDistance(mx, my, obj.x, obj.y, obj.x2, obj.y2)
        const strokeRadius = (obj.strokeWidth || 2) * 0.1 // Convert pixels to manim units roughly
        return distToLine <= Math.max(strokeRadius, 0.2)
      }
      case 'arc': {
        // Hit test for quadratic Bézier in Manim coords (control derived from midpoint).
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
        // Hit test near the x-axis or y-axis segments
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
        // Hit test near the graph curve
        const formula = obj.formula || 'x^2'
        const xMin = obj.xRange?.min ?? -5
        const xMax = obj.xRange?.max ?? 5
        
        // Sample points near the click location
        const samples = 50
        const points = mathParser.sampleFunction(formula, xMin, xMax, samples)
        
        let minDist = Infinity
        for (let i = 0; i < points.length - 1; i++) {
          const p1 = points[i]
          const p2 = points[i + 1]
          
          // Convert to absolute Manim coords (graph's position + function value)
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
        // Text uses width/height like rectangles
        const halfW = (obj.width || 2) / 2
        const halfH = (obj.height || 0.8) / 2
        // Rotate point around text center
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
        // Use bounding box for latex
        const bounds = getObjectBounds(obj)
        return mx >= bounds.minX && mx <= bounds.maxX &&
               my >= bounds.minY && my <= bounds.maxY
      }
      case 'graphCursor': {
        // Hit test the dot on the graph
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
        return dist <= radius * 1.5 // Make it easier to hit
      }
      case 'tangentLine': {
        // Hit test along the tangent line
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
        
        if (isNaN(tangent.x1) || isNaN(tangent.y1) || isNaN(tangent.x2) || isNaN(tangent.y2)) {
          return false
        }
        
        const axes = obj.axesId ? scene?.objects?.find(o => o.id === obj.axesId) : null
        const offsetX = (axes || graph).x || 0
        const offsetY = (axes || graph).y || 0
        
        const dist = pointToLineDistance(mx, my, offsetX + tangent.x1, offsetY + tangent.y1, offsetX + tangent.x2, offsetY + tangent.y2)
        return dist <= 0.2
      }
      case 'limitProbe': {
        // Hit test approach points
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
        // Hit test bounding box (approximate based on text size)
        const fontSize = obj.fontSize || 24
        const padding = fontSize * 0.5 / scaleX // Approximate text width
        return mx >= obj.x - padding && mx <= obj.x + padding &&
               my >= obj.y - fontSize * 0.3 / scaleY && my <= obj.y + fontSize * 0.3 / scaleY
      }
      default: {
        const bounds = getObjectBounds(obj)
        return mx >= bounds.minX && mx <= bounds.maxX &&
               my >= bounds.minY && my <= bounds.maxY
      }
    }
  }

  // Helper: calculate distance from point to line segment
  const pointToLineDistance = (px, py, x1, y1, x2, y2) => {
    const dx = x2 - x1
    const dy = y2 - y1
    const lengthSq = dx * dx + dy * dy
    
    if (lengthSq === 0) return Math.sqrt((px - x1) ** 2 + (py - y1) ** 2)
    
    const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lengthSq))
    const projX = x1 + t * dx
    const projY = y1 + t * dy
    
    return Math.sqrt((px - projX) ** 2 + (py - projY) ** 2)
  }

  // Check if clicking on a resize handle
  const hitTestHandle = (canvasX, canvasY, obj) => {
    if (!obj) return null
    
    const bounds = getObjectBounds(obj)
    const topLeft = manimToCanvas(bounds.minX, bounds.maxY)
    const bottomRight = manimToCanvas(bounds.maxX, bounds.minY)
    const size = { width: bottomRight.x - topLeft.x, height: bottomRight.y - topLeft.y }
    
    // For triangles, check vertex handles
    if (obj.type === 'triangle') {
      const verts = obj.vertices || []
      for (let i = 0; i < verts.length; i++) {
        const vPos = manimToCanvas(obj.x + verts[i].x, obj.y + verts[i].y)
        if (Math.hypot(canvasX - vPos.x, canvasY - vPos.y) < HANDLE_SIZE + 4) {
          return `vertex-${i}`
        }
      }
      return null
    }
    
    // For polygons, check vertex handles
    if (obj.type === 'polygon') {
      const verts = obj.vertices || []
      for (let i = 0; i < verts.length; i++) {
        const vPos = manimToCanvas(obj.x + verts[i].x, obj.y + verts[i].y)
        if (Math.hypot(canvasX - vPos.x, canvasY - vPos.y) < HANDLE_SIZE + 4) {
          return `vertex-${i}`
        }
      }
      return null
    }
    
    // For rectangles and text, check corner vertex handles
    if (obj.type === 'rectangle' || obj.type === 'text') {
      const corners = obj.type === 'text'
        ? getTextCorners(obj).map((c, i) => ({ id: `corner-${i}`, x: c.x, y: c.y }))
        : [
            { id: 'corner-0', x: obj.x - obj.width/2, y: obj.y + obj.height/2 }, // NW
            { id: 'corner-1', x: obj.x + obj.width/2, y: obj.y + obj.height/2 }, // NE
            { id: 'corner-2', x: obj.x - obj.width/2, y: obj.y - obj.height/2 }, // SW
            { id: 'corner-3', x: obj.x + obj.width/2, y: obj.y - obj.height/2 }, // SE
          ]
      for (const corner of corners) {
        const cPos = manimToCanvas(corner.x, corner.y)
        if (Math.hypot(canvasX - cPos.x, canvasY - cPos.y) < HANDLE_SIZE + 4) {
          return corner.id
        }
      }
      if (obj.type === 'text') {
        const rot = getTextRotateHandle(obj)
        const rPos = manimToCanvas(rot.x, rot.y)
        if (Math.hypot(canvasX - rPos.x, canvasY - rPos.y) < HANDLE_SIZE + 4) {
          return 'rotate'
        }
      }
      return null
    }
    
    // For lines/arrows, check endpoint handles
    if (obj.type === 'line' || obj.type === 'arrow') {
      const start = manimToCanvas(obj.x, obj.y)
      const end = manimToCanvas(obj.x2, obj.y2)
      
      if (Math.hypot(canvasX - start.x, canvasY - start.y) < HANDLE_SIZE + 4) {
        return 'start'
      }
      if (Math.hypot(canvasX - end.x, canvasY - end.y) < HANDLE_SIZE + 4) {
        return 'end'
      }
      return null
    }

    // For arcs, check start/end/control handles
    if (obj.type === 'arc') {
      const start = manimToCanvas(obj.x, obj.y)
      const end = manimToCanvas(obj.x2, obj.y2)
      const ctrl = manimToCanvas(obj.cx, obj.cy)

      if (Math.hypot(canvasX - start.x, canvasY - start.y) < HANDLE_SIZE + 4) return 'start'
      if (Math.hypot(canvasX - end.x, canvasY - end.y) < HANDLE_SIZE + 4) return 'end'
      if (Math.hypot(canvasX - ctrl.x, canvasY - ctrl.y) < HANDLE_SIZE + 4) return 'control'
      return null
    }
    
    // For axes, check endpoint handles
    if (obj.type === 'axes') {
      const xLen = obj.xLength || 8
      const yLen = obj.yLength || 4
      const left = manimToCanvas(obj.x - xLen / 2, obj.y)
      const right = manimToCanvas(obj.x + xLen / 2, obj.y)
      const top = manimToCanvas(obj.x, obj.y + yLen / 2)
      const bottom = manimToCanvas(obj.x, obj.y - yLen / 2)
      
      if (Math.hypot(canvasX - left.x, canvasY - left.y) < HANDLE_SIZE + 4) return 'left'
      if (Math.hypot(canvasX - right.x, canvasY - right.y) < HANDLE_SIZE + 4) return 'right'
      if (Math.hypot(canvasX - top.x, canvasY - top.y) < HANDLE_SIZE + 4) return 'top'
      if (Math.hypot(canvasX - bottom.x, canvasY - bottom.y) < HANDLE_SIZE + 4) return 'bottom'
      return null
    }
    
    // Check corner handles for other shapes
    const handles = getHandles(obj, topLeft, size)
    for (const handle of handles) {
      if (Math.abs(canvasX - handle.x) < HANDLE_SIZE && Math.abs(canvasY - handle.y) < HANDLE_SIZE) {
        return handle.id
      }
    }
    
    return null
  }

  // Snap to grid/axes + other shapes' vertices and edges
  const snapPosition = useCallback((x, y, excludeId = null) => {
    // If snapping is disabled, just return rounded values
    if (!snapEnabled) {
      return { 
        x: parseFloat(x.toFixed(2)), 
        y: parseFloat(y.toFixed(2)) 
      }
    }
    
    const baseX = x
    const baseY = y
    let snappedX = x
    let snappedY = y
    
    // Snap to grid (0.5 units)
    const gridX = snapToGrid(x)
    const gridY = snapToGrid(y)
    
    if (Math.abs(x - gridX) < SNAP_THRESHOLD) {
      snappedX = gridX
    }
    if (Math.abs(y - gridY) < SNAP_THRESHOLD) {
      snappedY = gridY
    }
    
    // Snap to origin axes (strongest snap)
    if (Math.abs(snappedX) < SNAP_THRESHOLD * 1.5) {
      snappedX = 0
    }
    if (Math.abs(snappedY) < SNAP_THRESHOLD * 1.5) {
      snappedY = 0
    }

    // Snap to other shapes (vertices/edges/perimeters)
    const visible = getVisibleObjectsAtTime(scene?.objects || [], currentTime)
    const others = visible.filter(o => o.id !== excludeId)
    if (others.length > 0) {
      // Use the raw (pre-grid) position as the reference for finding the closest snap target.
      // This makes snapping feel consistent even when grid-snapping nudges the point slightly.
      let best = { dist: Infinity, x: baseX, y: baseY }

      for (const obj of others) {
        const { points, segments } = getSnapGeometry(obj)

        // Vertex / key-point snapping
        for (const p of points) {
          const d = hypot(baseX - p.x, baseY - p.y)
          if (d < best.dist) best = { dist: d, x: p.x, y: p.y }
        }

        // Edge snapping (closest point on edges)
        for (const s of segments) {
          const cp = closestPointOnSegment(baseX, baseY, s.ax, s.ay, s.bx, s.by)
          const d = hypot(baseX - cp.x, baseY - cp.y)
          if (d < best.dist) best = { dist: d, x: cp.x, y: cp.y }
        }

        // Circle perimeter snapping (more natural than only 4 points)
        if ((obj.type === 'circle' || obj.type === 'dot') && (obj.radius || 0) > 0) {
          const dx = baseX - obj.x
          const dy = baseY - obj.y
          const len = hypot(dx, dy)
          if (len > 1e-6) {
            const r = obj.radius
            const onCircle = { x: obj.x + (dx / len) * r, y: obj.y + (dy / len) * r }
            const d = Math.abs(len - r)
            if (d < best.dist) best = { dist: d, x: onCircle.x, y: onCircle.y }
          }
        }
      }

      if (best.dist < SHAPE_SNAP_THRESHOLD) {
        snappedX = best.x
        snappedY = best.y
      }
    }
    
    return { 
      x: parseFloat(snappedX.toFixed(2)), 
      y: parseFloat(snappedY.toFixed(2)) 
    }
  }, [snapEnabled, scene?.objects, currentTime])

  const handleMouseDown = (e) => {
    // Ctrl+click (macOS) should open context menu
    if (e.button === 0 && e.ctrlKey) {
      e.preventDefault()
      e.stopPropagation()
      openContextMenu(e)
      return
    }

    const rect = canvasRef.current.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    
    // Link mode: if active, try to link to clicked object
    if (linkModeActive && selectedObjectId && selectedObject) {
      const manim = canvasToManim(x, y)
      const objects = getVisibleObjectsAtTime(scene.objects, currentTime)
      
      // Check if clicking on an eligible target
      for (const obj of objects) {
        if (hitTestShape(obj, manim.x, manim.y)) {
          const linkType = getBestLinkType(selectedObject, obj)
          if (linkType) {
            const updates = generateLinkUpdates(selectedObject, obj)
            onUpdateObject(selectedObjectId, updates)
            setLinkModeActive(false)
            setHoveredLinkTarget(null)
            e.preventDefault()
            e.stopPropagation()
            return
          }
        }
      }
    }
    
    // First check if clicking on a handle of the selected object
    if (selectedObjectId) {
      const selectedObj = getVisibleObjectsAtTime(scene.objects, currentTime).find(o => o.id === selectedObjectId)
      const handleHit = hitTestHandle(x, y, selectedObj)
      
      if (handleHit) {
        if (handleHit === 'rotate' && selectedObj?.type === 'text') {
          const center = { x: selectedObj.x, y: selectedObj.y }
          const mouse = canvasToManim(x, y)
          const angle = Math.atan2(mouse.y - center.y, mouse.x - center.x)
          rotateStartRef.current = {
            angle,
            rotation: selectedObj.rotation || 0,
          }
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
              setEditingVertex({ objectId: selectedObjectId, vertexIndex, label: vertex.label || '', isCorner: false })
              setTimeout(() => vertexInputRef.current?.focus(), 0)
              return
            }
          } else if (handleHit.startsWith('corner-')) {
            const cornerIndex = parseInt(handleHit.split('-')[1])
            const cornerLabels = selectedObj.cornerLabels || []
            setEditingVertex({ objectId: selectedObjectId, vertexIndex: cornerIndex, label: cornerLabels[cornerIndex] || '', isCorner: true })
            setTimeout(() => vertexInputRef.current?.focus(), 0)
            return
          } else if (selectedObj.type === 'axes' && (handleHit === 'right' || handleHit === 'top')) {
            // Double-click on axes endpoint to edit label
            const isXAxis = handleHit === 'right'
            setEditingVertex({ 
              objectId: selectedObjectId, 
              vertexIndex: -1, 
              label: isXAxis ? (selectedObj.xLabel || 'x') : (selectedObj.yLabel || 'y'), 
              isCorner: false,
              isAxisLabel: true,
              axis: isXAxis ? 'x' : 'y'
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
    
    // Otherwise, check if clicking on an object
    const hitId = hitTest(x, y)
    onSelectObject(hitId)
    
    if (hitId) {
      const obj = getVisibleObjectsAtTime(scene.objects, currentTime).find(o => o.id === hitId)
      if (obj) {
        // Move object clip to current timeline time when clicked
        if (typeof currentTime === 'number' && obj.delay !== currentTime) {
          onUpdateObject?.(hitId, { delay: parseFloat(currentTime.toFixed(2)) })
        }
        setIsDragging(true)
        setDragType('move')
        setActiveHandle(null)
        setDragStart({ x: e.clientX, y: e.clientY })
        setDragOffset({ ...obj })
      }
    }
  }

  const openContextMenu = (e) => {
    const rect = canvasRef.current.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    const hitId = hitTest(x, y)

    if (!hitId) {
      setContextMenu({ open: false, x: 0, y: 0, objectId: null })
      return
    }

    onSelectObject?.(hitId)

    const containerRect = containerRef.current?.getBoundingClientRect()
    const relX = containerRect ? (e.clientX - containerRect.left) : e.clientX
    const relY = containerRect ? (e.clientY - containerRect.top) : e.clientY

    setContextMenu({ open: true, x: relX, y: relY, objectId: hitId })
  }

  const handleMouseMove = (e) => {
    // Update hovered link target in link mode
    if (linkModeActive && selectedObjectId && selectedObject) {
      const rect = canvasRef.current.getBoundingClientRect()
      const x = e.clientX - rect.left
      const y = e.clientY - rect.top
      const manim = canvasToManim(x, y)
      const objects = getVisibleObjectsAtTime(scene.objects, currentTime)
      
      let foundTarget = null
      for (const obj of objects) {
        if (obj.id !== selectedObjectId && hitTestShape(obj, manim.x, manim.y)) {
          const linkType = getBestLinkType(selectedObject, obj)
          if (linkType) {
            foundTarget = obj.id
            break
          }
        }
      }
      
      if (foundTarget !== hoveredLinkTarget) {
        setHoveredLinkTarget(foundTarget)
      }
      
      // Don't process dragging if in link mode
      return
    }
    
    if (!isDragging || !selectedObjectId) return
    
    const dx = (e.clientX - dragStart.x) / scaleX
    const dy = -(e.clientY - dragStart.y) / scaleY
    
    // Check if shift is held for angle snapping
    const shiftHeld = e.shiftKey
    
    if (dragType === 'rotate') {
      const obj = scene.objects.find(o => o.id === selectedObjectId)
      if (!obj || !rotateStartRef.current) return
      const rect = canvasRef.current.getBoundingClientRect()
      const mouse = canvasToManim(e.clientX - rect.left, e.clientY - rect.top)
      const center = { x: obj.x, y: obj.y }
      const angle = Math.atan2(mouse.y - center.y, mouse.x - center.x)
      const delta = (angle - rotateStartRef.current.angle) * 180 / Math.PI
      const next = rotateStartRef.current.rotation + delta
      onUpdateObject(selectedObjectId, { rotation: parseFloat(next.toFixed(2)) })
      return
    }

    if (dragType === 'move') {
      const obj = scene.objects.find(o => o.id === selectedObjectId)
      if (!obj) return

      // Move special-cases: keep multi-point objects coherent
      if (obj.type === 'line' || obj.type === 'arrow') {
        const rawStart = { x: dragOffset.x + dx, y: dragOffset.y + dy }
        const rawEnd = { x: dragOffset.x2 + dx, y: dragOffset.y2 + dy }
        const snappedStart = snapPosition(rawStart.x, rawStart.y, selectedObjectId)
        const delta = { x: snappedStart.x - rawStart.x, y: snappedStart.y - rawStart.y }
        onUpdateObject(selectedObjectId, {
          x: snappedStart.x,
          y: snappedStart.y,
          x2: parseFloat((rawEnd.x + delta.x).toFixed(2)),
          y2: parseFloat((rawEnd.y + delta.y).toFixed(2)),
        })
      } else if (obj.type === 'arc') {
        const rawStart = { x: dragOffset.x + dx, y: dragOffset.y + dy }
        const rawEnd = { x: dragOffset.x2 + dx, y: dragOffset.y2 + dy }
        const rawCtrl = { x: dragOffset.cx + dx, y: dragOffset.cy + dy }
        const snappedStart = snapPosition(rawStart.x, rawStart.y, selectedObjectId)
        const delta = { x: snappedStart.x - rawStart.x, y: snappedStart.y - rawStart.y }
        onUpdateObject(selectedObjectId, {
          x: snappedStart.x,
          y: snappedStart.y,
          x2: parseFloat((rawEnd.x + delta.x).toFixed(2)),
          y2: parseFloat((rawEnd.y + delta.y).toFixed(2)),
          cx: parseFloat((rawCtrl.x + delta.x).toFixed(2)),
          cy: parseFloat((rawCtrl.y + delta.y).toFixed(2)),
        })
      } else if (obj.type === 'graphCursor') {
        // Constrain cursor to the graph when dragging
        const graph = getGraphById(scene?.objects || [], obj.graphId)
        if (!graph) return
        
        const formula = graph.formula || 'x^2'
        const graphXRange = graph.xRange || { min: -5, max: 5 }
        
        // Get axes if linked for coordinate conversion
        const axes = obj.axesId ? scene?.objects?.find(o => o.id === obj.axesId) : null
        const offsetX = (axes || graph).x || 0
        
        // Convert current drag position to Manim coordinates
        const currentManim = canvasToManim(dragStart.x + dx, dragStart.y + dy)
        
        // Extract x-value from drag position (relative to graph/axes origin)
        const dragX = currentManim.x - offsetX
        
        // Clamp to graph range
        const clampedX = clampToGraphRange(dragX, graphXRange)
        
        // Project to graph to get y-value
        const point = projectToGraph(formula, clampedX)
        
        // Update cursor position
        if (!isNaN(point.y) && isFinite(point.y)) {
          onUpdateObject(selectedObjectId, { 
            x0: parseFloat(clampedX.toFixed(4)),
            x: offsetX + point.x,
            y: (axes || graph).y + point.y
          })
        }
      } else {
      const rawX = dragOffset.x + dx
      const rawY = dragOffset.y + dy
      const snapped = snapPosition(rawX, rawY, selectedObjectId)
      onUpdateObject(selectedObjectId, snapped)
      }
    } else if (dragType === 'resize') {
      const obj = scene.objects.find(o => o.id === selectedObjectId)
      if (!obj) return
      
      // Handle triangle vertex dragging
      if (obj.type === 'triangle' && activeHandle?.startsWith('vertex-')) {
        const vertexIndex = parseInt(activeHandle.split('-')[1])
        const verts = [...(dragOffset.vertices || [])]
        if (verts[vertexIndex]) {
          let newVX = verts[vertexIndex].x + dx
          let newVY = verts[vertexIndex].y + dy
          
          // Snap to angle from center if shift held
          if (shiftHeld) {
            const snappedPos = snapToAngleFromPoint(newVX, newVY, 0, 0)
            newVX = snappedPos.x
            newVY = snappedPos.y
          }

          // Snap this vertex (absolute) to other shapes / grid, then convert back to relative
          const abs = snapPosition(obj.x + newVX, obj.y + newVY, selectedObjectId)
          newVX = abs.x - obj.x
          newVY = abs.y - obj.y
          
          verts[vertexIndex] = {
            x: parseFloat(newVX.toFixed(2)),
            y: parseFloat(newVY.toFixed(2))
          }
          onUpdateObject(selectedObjectId, { vertices: verts })
          setDragStart({ x: e.clientX, y: e.clientY })
          setDragOffset({ ...dragOffset, vertices: verts })
        }
        return
      }
      
      // Handle polygon vertex dragging (move individual vertices)
      if (obj.type === 'polygon' && activeHandle?.startsWith('vertex-')) {
        const vertexIndex = parseInt(activeHandle.split('-')[1])
        const verts = [...(dragOffset.vertices || [])]
        if (verts[vertexIndex]) {
          let newVX = verts[vertexIndex].x + dx
          let newVY = verts[vertexIndex].y + dy
          
          // Snap to angle from center if shift held
          if (shiftHeld) {
            const snappedPos = snapToAngleFromPoint(newVX, newVY, 0, 0)
            newVX = snappedPos.x
            newVY = snappedPos.y
          }

          // Snap this vertex (absolute) to other shapes / grid, then convert back to relative
          const abs = snapPosition(obj.x + newVX, obj.y + newVY, selectedObjectId)
          newVX = abs.x - obj.x
          newVY = abs.y - obj.y
          
          verts[vertexIndex] = {
            x: parseFloat(newVX.toFixed(2)),
            y: parseFloat(newVY.toFixed(2))
          }
          onUpdateObject(selectedObjectId, { vertices: verts })
          setDragStart({ x: e.clientX, y: e.clientY })
          setDragOffset({ ...dragOffset, vertices: verts })
        }
        return
      }
      
      // Handle rectangle and text corner dragging
      if ((obj.type === 'rectangle' || obj.type === 'text') && activeHandle?.startsWith('corner-')) {
        const cornerIndex = parseInt(activeHandle.split('-')[1])
        // Corners: 0=NW, 1=NE, 2=SW, 3=SE
        const MIN_W = 0.2
        const MIN_H = 0.2

        const left0 = dragOffset.x - dragOffset.width / 2
        const right0 = dragOffset.x + dragOffset.width / 2
        const bottom0 = dragOffset.y - dragOffset.height / 2
        const top0 = dragOffset.y + dragOffset.height / 2

        let left = left0
        let right = right0
        let bottom = bottom0
        let top = top0

        // Dragged corner moves; opposite edges remain fixed.
        // Clamp the dragged edges so they never cross the opposite side beyond a minimum size.
        if (cornerIndex === 0) { // NW: move left + top
          left = Math.min(left0 + dx, right0 - MIN_W)
          top = Math.max(top0 + dy, bottom0 + MIN_H)
          right = right0
          bottom = bottom0
        } else if (cornerIndex === 1) { // NE: move right + top
          right = Math.max(right0 + dx, left0 + MIN_W)
          top = Math.max(top0 + dy, bottom0 + MIN_H)
          left = left0
          bottom = bottom0
        } else if (cornerIndex === 2) { // SW: move left + bottom
          left = Math.min(left0 + dx, right0 - MIN_W)
          bottom = Math.min(bottom0 + dy, top0 - MIN_H)
          right = right0
          top = top0
        } else if (cornerIndex === 3) { // SE: move right + bottom
          right = Math.max(right0 + dx, left0 + MIN_W)
          bottom = Math.min(bottom0 + dy, top0 - MIN_H)
          left = left0
          top = top0
        }

        const newWidth = Math.max(MIN_W, right - left)
        const newHeight = Math.max(MIN_H, top - bottom)
        const newX = (left + right) / 2
        const newY = (bottom + top) / 2

        const updates = {
          width: parseFloat(newWidth.toFixed(2)),
          height: parseFloat(newHeight.toFixed(2)),
          x: parseFloat(newX.toFixed(2)),
          y: parseFloat(newY.toFixed(2)),
        }

        // For text objects, scale font size proportionally
        if (obj.type === 'text') {
          const widthScale = newWidth / (dragOffset.width || 2)
          const heightScale = newHeight / (dragOffset.height || 0.8)
          // Use average of width and height scaling for balanced scaling
          const avgScale = (widthScale + heightScale) / 2
          const initialFontSize = dragOffset.fontSize || 48
          const newFontSize = Math.max(8, Math.round(initialFontSize * avgScale))
          updates.fontSize = newFontSize
        }

        onUpdateObject(selectedObjectId, updates)
        return
      }
      
      // Handle line/arrow endpoint dragging
      if (obj.type === 'line' || obj.type === 'arrow') {
        if (activeHandle === 'start') {
          let newX = dragOffset.x + dx
          let newY = dragOffset.y + dy
          
          // Snap to angle from end point if shift or close to 45° angles
          if (shiftHeld) {
            const snappedAngle = snapToAngleFromPoint(newX, newY, obj.x2, obj.y2)
            newX = snappedAngle.x
            newY = snappedAngle.y
          }
          
          const snapped = snapPosition(newX, newY, selectedObjectId)
          onUpdateObject(selectedObjectId, snapped)
        } else if (activeHandle === 'end') {
          let newX2 = dragOffset.x2 + dx
          let newY2 = dragOffset.y2 + dy
          
          // Snap to angle from start point if shift or close to 45° angles
          if (shiftHeld) {
            const snappedAngle = snapToAngleFromPoint(newX2, newY2, obj.x, obj.y)
            newX2 = snappedAngle.x
            newY2 = snappedAngle.y
          }
          
          const snapped = snapPosition(newX2, newY2, selectedObjectId)
          onUpdateObject(selectedObjectId, {
            x2: snapped.x,
            y2: snapped.y
          })
        }
        return
      }
      
      // Handle arc handle dragging
      if (obj.type === 'arc') {
        if (activeHandle === 'start') {
          const raw = { x: dragOffset.x + dx, y: dragOffset.y + dy }
          const snapped = snapPosition(raw.x, raw.y, selectedObjectId)
          onUpdateObject(selectedObjectId, { x: snapped.x, y: snapped.y })
        } else if (activeHandle === 'end') {
          const raw = { x: dragOffset.x2 + dx, y: dragOffset.y2 + dy }
          const snapped = snapPosition(raw.x, raw.y, selectedObjectId)
          onUpdateObject(selectedObjectId, { x2: snapped.x, y2: snapped.y })
        } else if (activeHandle === 'control') {
          const raw = { x: dragOffset.cx + dx, y: dragOffset.cy + dy }
          const snapped = snapPosition(raw.x, raw.y, selectedObjectId)
          onUpdateObject(selectedObjectId, { cx: snapped.x, cy: snapped.y })
        }
        return
      }
      
      // Handle axes endpoint dragging to extend axes
      if (obj.type === 'axes') {
        const MIN_LENGTH = 1
        if (activeHandle === 'left' || activeHandle === 'right') {
          // Dragging x-axis endpoints
          const delta = activeHandle === 'right' ? dx : -dx
          const newXLength = Math.max(MIN_LENGTH, (dragOffset.xLength || 8) + delta * 2)
          onUpdateObject(selectedObjectId, { xLength: parseFloat(newXLength.toFixed(2)) })
        } else if (activeHandle === 'top' || activeHandle === 'bottom') {
          // Dragging y-axis endpoints
          const delta = activeHandle === 'top' ? dy : -dy
          const newYLength = Math.max(MIN_LENGTH, (dragOffset.yLength || 4) + delta * 2)
          onUpdateObject(selectedObjectId, { yLength: parseFloat(newYLength.toFixed(2)) })
        }
        return
      }
      
      // Handle graphCursor dragging - constrain to the graph
      if (obj.type === 'graphCursor') {
        const graph = getGraphById(scene?.objects || [], obj.graphId)
        if (!graph) return
        
        const formula = graph.formula || 'x^2'
        const graphXRange = graph.xRange || { min: -5, max: 5 }
        
        // Get axes if linked for coordinate conversion
        const axes = obj.axesId ? scene?.objects?.find(o => o.id === obj.axesId) : null
        const offsetX = (axes || graph).x || 0
        
        // Convert current drag position to Manim coordinates
        const currentManim = canvasToManim(dragStart.x + dx, dragStart.y + dy)
        
        // Extract x-value from drag position (relative to graph/axes origin)
        const dragX = currentManim.x - offsetX
        
        // Clamp to graph range
        const clampedX = clampToGraphRange(dragX, graphXRange)
        
        // Project to graph to get y-value
        const point = projectToGraph(formula, clampedX)
        
        // Update cursor position
        if (!isNaN(point.y) && isFinite(point.y)) {
          onUpdateObject(selectedObjectId, { 
            x0: parseFloat(clampedX.toFixed(4)),
            x: offsetX + point.x,
            y: (axes || graph).y + point.y
          })
        }
        return
      }
      
      // For circles/dots, resize radius based on distance from center
      if (obj.type === 'circle' || obj.type === 'dot') {
        const dist = Math.sqrt(dx * dx + dy * dy)
        const sign = (activeHandle?.includes('e') || activeHandle?.includes('s')) ? 1 : -1
        const newRadius = Math.max(0.1, dragOffset.radius + sign * dist * 0.5)
        
        // Snap radius to grid
        const snappedRadius = snapToGrid(newRadius, 0.25)
        
        onUpdateObject(selectedObjectId, {
          radius: parseFloat(snappedRadius.toFixed(2))
        })
      }
    }
  }

  const handleMouseUp = () => {
    setIsDragging(false)
    setDragType(null)
    setActiveHandle(null)
    rotateStartRef.current = null
  }

  const handlePaletteClick = (type, event) => {
    if (event) event.stopPropagation()
    setOpenPaletteMenu(null)
    onAddObject(type)
  }

  const getTextRotateButtonPosition = useCallback((obj) => {
    const center = manimToCanvas(obj.x, obj.y)
    const heightPx = (obj.height || 0.8) * scaleY
    const offset = heightPx / 2 + 20
    const angle = -obj.rotation * Math.PI / 180
    const dx = 0
    const dy = -offset
    const rx = dx * Math.cos(angle) - dy * Math.sin(angle)
    const ry = dx * Math.sin(angle) + dy * Math.cos(angle)
    return { x: center.x + rx, y: center.y + ry }
  }, [manimToCanvas, scaleY])

  return (
    <div className="canvas-container" ref={containerRef}>
      <div className="shape-palette">
        {SHAPE_PALETTE.map(shape => (
          <div key={shape.type} className="palette-item-wrapper">
          <button
              className="palette-item"
              onClick={(event) => handlePaletteClick(shape.type, event)}
            title={shape.label}
          >
            <span className="palette-icon">{shape.icon}</span>
            <span className="palette-label">{shape.label}</span>
            </button>
          </div>
        ))}
        
        <div className="palette-divider" />
        
        <button
          className={`palette-item snap-toggle ${snapEnabled ? 'active' : ''}`}
          onClick={() => setSnapEnabled(!snapEnabled)}
          title={snapEnabled ? 'Snapping ON (click to disable)' : 'Snapping OFF (click to enable)'}
          style={snapEnabled ? { background: '#3b82f6', color: 'white' } : {}}
        >
          <span className="palette-icon">⊞</span>
          <span className="palette-label">{snapEnabled ? 'Snap ON' : 'Snap OFF'}</span>
        </button>
      </div>
      
      {linkModeActive && linkingStatus.eligibleTargets.length > 0 && (
        <div style={{ position: 'absolute', top: '10px', left: '50%', transform: 'translateX(-50%)', zIndex: 1000, background: '#3b82f6', color: 'white', padding: '8px 16px', borderRadius: '4px', fontSize: '14px', pointerEvents: 'none' }}>
          Link Mode: Click on an eligible {linkingStatus.eligibleTargets.join(' or ')} to link (Press Esc to cancel)
        </div>
      )}
      
      <div className="canvas-wrapper" ref={canvasWrapperRef}>
        <div className="canvas-stage" style={{ width: canvasSize.width, height: canvasSize.height }}>
        <canvas
          ref={canvasRef}
          width={canvasSize.width}
          height={canvasSize.height}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
            onContextMenu={(e) => {
              e.preventDefault()
              e.stopPropagation()
              openContextMenu(e)
            }}
          />

          {(() => {
            const obj = getVisibleObjectsAtTime(scene?.objects || [], currentTime)
              .find(o => o.id === selectedObjectId && o.type === 'text')
            if (!obj) return null
            const pos = getTextRotateButtonPosition(obj)
            return (
              <button
                className="text-rotate-btn"
                style={{ left: `${pos.x}px`, top: `${pos.y}px` }}
                title="Rotate +15°"
                onMouseDown={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                }}
                onClick={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  const next = ((obj.rotation || 0) + 15) % 360
                  onUpdateObject?.(obj.id, { rotation: next })
                }}
              >
                +15°
              </button>
            )
          })()}

          <div ref={latexLayerRef} className="latex-overlay-layer" aria-hidden="true">
            {latexObjects.map((obj) => {
              const p = manimToCanvas(obj.x, obj.y)
              const color = obj.fill || '#ffffff'
              const opacity = obj.opacity ?? 1
              let markup = ''
              try {
                markup = obj.latex ? convertLatexToMarkup(obj.latex) : ''
              } catch {
                markup = ''
              }
              return (
                <div
                  key={obj.id}
                  className="latex-overlay-item"
                  style={{
                    left: `${p.x}px`,
                    top: `${p.y}px`,
                    color,
                    opacity,
                    transform: `translate(-50%, -50%) rotate(${-obj.rotation}deg)`,
                  }}
                >
                  {markup ? (
                    <span dangerouslySetInnerHTML={{ __html: markup }} />
                  ) : (
                    <span />
                  )}
      </div>
              )
            })}
          </div>
        </div>
      </div>

          {contextMenu.open && (
        <div
          className="canvas-context-menu"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <button
            className="canvas-context-item"
            onClick={() => {
              if (contextMenu.objectId) onDuplicateObject?.(contextMenu.objectId)
              setContextMenu({ open: false, x: 0, y: 0, objectId: null })
            }}
          >
            Duplicate
          </button>
          <button
            className="canvas-context-item danger"
            onClick={() => {
              if (contextMenu.objectId) onDeleteObject?.(contextMenu.objectId)
              setContextMenu({ open: false, x: 0, y: 0, objectId: null })
            }}
          >
            Delete
          </button>
        </div>
      )}

      {editingVertex.objectId && (() => {
        const obj = scene?.objects?.find(o => o.id === editingVertex.objectId)
        if (!obj) return null
        
        const LABEL_OFFSET = 30
        let labelPos
        
        // Handle axes label editing
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
            { x: obj.x - obj.width/2, y: obj.y + obj.height/2 },
            { x: obj.x + obj.width/2, y: obj.y + obj.height/2 },
            { x: obj.x - obj.width/2, y: obj.y - obj.height/2 },
            { x: obj.x + obj.width/2, y: obj.y - obj.height/2 },
          ]
          const corner = corners[editingVertex.vertexIndex]
          if (!corner) return null
          
          // Direction from rectangle center to corner
          const dx = corner.x - obj.x
          const dy = corner.y - obj.y
          const dist = Math.sqrt(dx * dx + dy * dy)
          
          if (dist > 0.01) {
            const scale = LABEL_OFFSET / scaleX
            const labelX = corner.x + (dx / dist) * scale
            const labelY = corner.y + (dy / dist) * scale
            labelPos = manimToCanvas(labelX, labelY)
          } else {
            labelPos = manimToCanvas(corner.x, corner.y)
          }
        } else if (obj.vertices?.[editingVertex.vertexIndex]) {
          const vertex = obj.vertices[editingVertex.vertexIndex]
          const vManim = { x: obj.x + vertex.x, y: obj.y + vertex.y }
          
          // Calculate centroid for direction
          const verts = obj.vertices || []
          const centroid = verts.reduce(
            (acc, v) => ({ x: acc.x + v.x, y: acc.y + v.y }),
            { x: 0, y: 0 }
          )
          centroid.x /= verts.length || 1
          centroid.y /= verts.length || 1
          const cManim = { x: obj.x + centroid.x, y: obj.y + centroid.y }
          
          // Direction vector from centroid to vertex
          const dx = vManim.x - cManim.x
          const dy = vManim.y - cManim.y
          const dist = Math.sqrt(dx * dx + dy * dy)
          
          if (dist > 0.01) {
            const scale = LABEL_OFFSET / scaleX
            const labelX = vManim.x + (dx / dist) * scale
            const labelY = vManim.y + (dy / dist) * scale
            labelPos = manimToCanvas(labelX, labelY)
          } else {
            labelPos = manimToCanvas(vManim.x, vManim.y)
          }
        } else {
          return null
        }
        
        return (
          <input
            ref={vertexInputRef}
            type="text"
            value={editingVertex.label}
            onChange={(e) => setEditingVertex({ ...editingVertex, label: e.target.value })}
            onBlur={() => {
              const obj = scene?.objects?.find(o => o.id === editingVertex.objectId)
              if (!obj) {
                setEditingVertex({ objectId: null, vertexIndex: null, label: '', isCorner: false, isAxisLabel: false })
                return
              }
              
              if (editingVertex.isAxisLabel && obj.type === 'axes') {
                const updates = {}
                if (editingVertex.axis === 'x') {
                  updates.xLabel = editingVertex.label.trim() || 'x'
                } else {
                  updates.yLabel = editingVertex.label.trim() || 'y'
                }
                onUpdateObject(editingVertex.objectId, updates)
              } else if (editingVertex.isCorner && obj.type === 'rectangle') {
                const cornerLabels = [...(obj.cornerLabels || [])]
                cornerLabels[editingVertex.vertexIndex] = editingVertex.label.trim() || undefined
                onUpdateObject(editingVertex.objectId, { cornerLabels })
              } else if (obj.vertices?.[editingVertex.vertexIndex]) {
                const newVertices = [...obj.vertices]
                newVertices[editingVertex.vertexIndex] = {
                  ...newVertices[editingVertex.vertexIndex],
                  label: editingVertex.label.trim() || undefined
                }
                onUpdateObject(editingVertex.objectId, { vertices: newVertices })
              }
              setEditingVertex({ objectId: null, vertexIndex: null, label: '', isCorner: false, isAxisLabel: false })
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === 'Escape') {
                e.preventDefault()
                const obj = scene?.objects?.find(o => o.id === editingVertex.objectId)
                if (!obj) {
                  setEditingVertex({ objectId: null, vertexIndex: null, label: '', isCorner: false, isAxisLabel: false })
                  return
                }
                
                if (editingVertex.isAxisLabel && obj.type === 'axes') {
                  const updates = {}
                  if (editingVertex.axis === 'x') {
                    updates.xLabel = editingVertex.label.trim() || 'x'
                  } else {
                    updates.yLabel = editingVertex.label.trim() || 'y'
                  }
                  onUpdateObject(editingVertex.objectId, updates)
                } else if (editingVertex.isCorner && obj.type === 'rectangle') {
                  const cornerLabels = [...(obj.cornerLabels || [])]
                  cornerLabels[editingVertex.vertexIndex] = editingVertex.label.trim() || undefined
                  onUpdateObject(editingVertex.objectId, { cornerLabels })
                } else if (obj.vertices?.[editingVertex.vertexIndex]) {
                  const newVertices = [...obj.vertices]
                  newVertices[editingVertex.vertexIndex] = {
                    ...newVertices[editingVertex.vertexIndex],
                    label: editingVertex.label.trim() || undefined
                  }
                  onUpdateObject(editingVertex.objectId, { vertices: newVertices })
                }
                setEditingVertex({ objectId: null, vertexIndex: null, label: '', isCorner: false, isAxisLabel: false })
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
              outline: 'none'
            }}
            placeholder="Label"
          />
        )
      })()}
    </div>
  )
}

export default Canvas

