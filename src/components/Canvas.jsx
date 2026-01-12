import React, { useRef, useState, useEffect, useCallback } from 'react'
import './Canvas.css'
import { mathParser } from '../utils/mathParser'
import { calculateRiemannSum, integrate, taylorCoefficients } from '../utils/calculus'

const SHAPE_PALETTE = [
  { type: 'rectangle', icon: '▭', label: 'Rectangle' },
  { type: 'triangle', icon: '△', label: 'Triangle' },
  { type: 'circle', icon: '○', label: 'Circle' },
  { type: 'line', icon: '╱', label: 'Line' },
  { type: 'arrow', icon: '→', label: 'Arrow' },
  { type: 'dot', icon: '•', label: 'Dot' },
  { type: 'polygon', icon: '⬠', label: 'Polygon' },
  { type: 'text', icon: 'T', label: 'Text' },
  { type: 'latex', icon: '∑', label: 'LaTeX' },
  { type: 'function', icon: 'ƒ', label: 'Function' },
  { type: 'tangent', icon: '↗', label: 'Tangent' },
  { type: 'riemann_sum', icon: '▭', label: 'Riemann Sum' },
  { type: 'accumulation', icon: '∫', label: 'FTC' },
  { type: 'taylor_series', icon: 'Σ', label: 'Taylor Series' },
]

const RIEMANN_OPTIONS = [
  { label: 'Left Rectangles', method: 'left', n: 8 },
  { label: 'Right Rectangles', method: 'right', n: 8 },
  { label: 'Midpoint Rectangles', method: 'midpoint', n: 8 },
  { label: 'Trapezoid Rule', method: 'trapezoid', n: 8 },
]

// Manim coordinate system: center is (0,0), x: -7 to 7, y: -4 to 4
const MANIM_WIDTH = 14
const MANIM_HEIGHT = 8

const HANDLE_SIZE = 10

// Snapping constants
const SNAP_THRESHOLD = 0.15 // Manim units - how close before snapping
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

function Canvas({ scene, selectedObjectId, onSelectObject, onUpdateObject, onAddObject }) {
  const canvasRef = useRef(null)
  const containerRef = useRef(null)
  const dropdownRef = useRef(null)
  const [canvasSize, setCanvasSize] = useState({ width: 800, height: 450 })
  const [isDragging, setIsDragging] = useState(false)
  const [dragType, setDragType] = useState(null) // 'move' | 'resize-corner' | 'resize-edge' | 'endpoint'
  const [activeHandle, setActiveHandle] = useState(null) // which handle is being dragged
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 })
  const [snapEnabled, setSnapEnabled] = useState(true)
  const [openPaletteMenu, setOpenPaletteMenu] = useState(null)

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

  // Resize canvas to fit container while maintaining 16:9 aspect
  useEffect(() => {
    const updateSize = () => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect()
        const aspect = 16 / 9
        let width = rect.width - 40
        let height = width / aspect
        if (height > rect.height - 40) {
          height = rect.height - 40
          width = height * aspect
        }
        setCanvasSize({ width, height })
      }
    }
    updateSize()
    window.addEventListener('resize', updateSize)
    return () => window.removeEventListener('resize', updateSize)
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

  // Draw the scene
  useEffect(() => {
    const canvas = canvasRef.current
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
    
    // Draw objects
    if (scene?.objects) {
      const sortedObjects = [...scene.objects].sort((a, b) => (a.zIndex || 0) - (b.zIndex || 0))
      sortedObjects.forEach(obj => {
        drawObject(ctx, obj, obj.id === selectedObjectId, scene)
      })
    }
    
  }, [scene, selectedObjectId, canvasSize, manimToCanvas])

  const drawObject = (ctx, obj, isSelected, scene) => {
    const pos = manimToCanvas(obj.x, obj.y)
    
    ctx.save()
    ctx.translate(pos.x, pos.y)
    ctx.rotate(-obj.rotation * Math.PI / 180) // Negative because canvas Y is inverted
    
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
        const r = obj.radius * scaleX
        const sides = obj.sides || 5
        ctx.beginPath()
        for (let i = 0; i < sides; i++) {
          const angle = (i / sides) * Math.PI * 2 - Math.PI / 2
          const px = Math.cos(angle) * r
          const py = Math.sin(angle) * r
          if (i === 0) ctx.moveTo(px, py)
          else ctx.lineTo(px, py)
        }
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
      case 'text': {
        ctx.globalAlpha = obj.opacity ?? 1
        ctx.font = `${obj.fontSize || 48}px Arial`
        ctx.fillStyle = obj.fill || '#ffffff'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(obj.text || 'Text', 0, 0)
        ctx.globalAlpha = 1
        break
      }
      case 'latex': {
        // Simplified LaTeX preview (just show the raw text)
        ctx.globalAlpha = obj.opacity ?? 1
        ctx.font = '24px serif'
        ctx.fillStyle = obj.fill || '#ffffff'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(`[${obj.latex}]`, 0, 0)
        ctx.globalAlpha = 1
        break
      }
      case 'function': {
        const formula = obj.formula || 'x^2'
        const domain = obj.domain || { min: -5, max: 5 }
        const color = obj.color || '#60a5fa'
        const strokeWidth = obj.strokeWidth || 2
        
        // Sample function points
        const points = mathParser.sampleFunction(formula, domain.min, domain.max, 200)
        
        if (points.length > 0) {
          // Draw main function
          ctx.strokeStyle = color
          ctx.lineWidth = strokeWidth
          ctx.beginPath()
          
          points.forEach((point, i) => {
            const canvasPoint = manimToCanvas(point.x, point.y)
            if (i === 0) {
              ctx.moveTo(canvasPoint.x, canvasPoint.y)
            } else {
              ctx.lineTo(canvasPoint.x, canvasPoint.y)
            }
          })
          ctx.stroke()
          
          // Draw derivative if enabled
          if (obj.showDerivative) {
            const derivPoints = points.map(p => ({
              x: p.x,
              y: mathParser.derivative(formula, p.x)
            })).filter(p => !isNaN(p.y) && isFinite(p.y))
            
            if (derivPoints.length > 0) {
              ctx.strokeStyle = '#4ade80' // Green for derivative
              ctx.lineWidth = strokeWidth
              ctx.beginPath()
              
              derivPoints.forEach((point, i) => {
                const canvasPoint = manimToCanvas(point.x, point.y)
                if (i === 0) {
                  ctx.moveTo(canvasPoint.x, canvasPoint.y)
                } else {
                  ctx.lineTo(canvasPoint.x, canvasPoint.y)
                }
              })
              ctx.stroke()
            }
          }
          
          // Draw second derivative if enabled
          if (obj.showSecondDerivative) {
            const secondDerivPoints = points.map(p => {
              const firstDeriv = mathParser.derivative(formula, p.x)
              // Approximate second derivative
              const h = 0.001
              const derivPlus = mathParser.derivative(formula, p.x + h)
              const derivMinus = mathParser.derivative(formula, p.x - h)
              return {
                x: p.x,
                y: (derivPlus - derivMinus) / (2 * h)
              }
            }).filter(p => !isNaN(p.y) && isFinite(p.y))
            
            if (secondDerivPoints.length > 0) {
              ctx.strokeStyle = '#f59e0b' // Orange for second derivative
              ctx.lineWidth = strokeWidth
              ctx.beginPath()
              
              secondDerivPoints.forEach((point, i) => {
                const canvasPoint = manimToCanvas(point.x, point.y)
                if (i === 0) {
                  ctx.moveTo(canvasPoint.x, canvasPoint.y)
                } else {
                  ctx.lineTo(canvasPoint.x, canvasPoint.y)
                }
              })
              ctx.stroke()
            }
          }
        }
        break
      }
      case 'tangent': {
        // Find the referenced function
        const functionObj = scene?.objects.find(o => o.id === obj.functionId)
        if (!functionObj || functionObj.type !== 'function') {
          break
        }
        
        const formula = functionObj.formula || 'x^2'
        const pointX = obj.pointX || 0
        const length = obj.length || 2
        const color = obj.color || '#f59e0b'
        const strokeWidth = obj.strokeWidth || 2
        
        // Calculate function value and derivative at pointX
        const funcY = mathParser.evaluate(formula, pointX)
        const slope = mathParser.derivative(formula, pointX)
        
        if (isNaN(funcY) || isNaN(slope) || !isFinite(funcY) || !isFinite(slope)) {
          break
        }
        
        // Calculate tangent line endpoints
        const halfLength = length / 2
        const dx = halfLength / Math.sqrt(1 + slope * slope)
        const dy = slope * dx
        
        const startX = pointX - dx
        const startY = funcY - dy
        const endX = pointX + dx
        const endY = funcY + dy
        
        const start = manimToCanvas(startX, startY)
        const end = manimToCanvas(endX, endY)
        
        ctx.strokeStyle = color
        ctx.lineWidth = strokeWidth
        ctx.setLineDash([5, 5])
        ctx.beginPath()
        ctx.moveTo(start.x, start.y)
        ctx.lineTo(end.x, end.y)
        ctx.stroke()
        ctx.setLineDash([])
        
        // Draw point on function
        const point = manimToCanvas(pointX, funcY)
        ctx.fillStyle = color
        ctx.beginPath()
        ctx.arc(point.x, point.y, 4, 0, Math.PI * 2)
        ctx.fill()
        break
      }
      case 'riemann_sum': {
        try {
          // Find the referenced function
          const functionObj = scene?.objects.find(o => o.id === obj.functionId)
          if (!functionObj || functionObj.type !== 'function') {
            break
          }
          
          const formula = functionObj.formula || 'x^2'
          const interval = obj.interval || { a: 0, b: 2 }
          const n = Math.min(obj.n || 4, 200) // Limit to 200 rectangles max
          const method = obj.method || 'left'
          const fillColor = obj.fillColor || '#8b5cf6'
          const strokeColor = obj.strokeColor || '#ffffff'
          const strokeWidth = obj.strokeWidth || 1
          
          // Calculate rectangles
          const rectangles = calculateRiemannSum(formula, interval.a, interval.b, n, method)
          
          rectangles.forEach(rect => {
            const left = manimToCanvas(rect.x, rect.y)
            const right = manimToCanvas(rect.x + rect.width, rect.y)
            const top = manimToCanvas(rect.x + rect.width / 2, rect.y + rect.height)
            
            const width = right.x - left.x
            const height = top.y - left.y
            
            // Draw rectangle
            ctx.globalAlpha = obj.opacity ?? 0.5
            ctx.fillStyle = fillColor
            ctx.fillRect(left.x, left.y, width, height)
            ctx.globalAlpha = 1
            
            // Draw stroke
            ctx.strokeStyle = strokeColor
            ctx.lineWidth = strokeWidth
            ctx.strokeRect(left.x, left.y, width, height)
          })
        } catch (error) {
          // Silently skip rendering if there's an error
        }
        break
      }
      case 'accumulation': {
        try {
          // Find the referenced function
          const functionObj = scene?.objects.find(o => o.id === obj.functionId)
          if (!functionObj || functionObj.type !== 'function') {
            break
          }
          
          const formula = functionObj.formula || 'x^2'
          const startPoint = obj.startPoint || 0
          const currentX = obj.currentX || 2
          const fillColor = obj.fillColor || '#60a5fa'
          
          // Sample function and fill area under curve
          const minX = Math.min(startPoint, currentX)
          const maxX = Math.max(startPoint, currentX)
          const points = mathParser.sampleFunction(formula, minX, maxX, 100)
        
          if (points.length > 0) {
            ctx.globalAlpha = (obj.opacity ?? 0.5)
            ctx.fillStyle = fillColor
            ctx.beginPath()
            
            // Start at bottom left
            const start = manimToCanvas(minX, 0)
            ctx.moveTo(start.x, start.y)
            
            // Draw along function curve
            points.forEach(point => {
              const p = manimToCanvas(point.x, point.y)
              ctx.lineTo(p.x, p.y)
            })
            
            // Close path to bottom right
            const end = manimToCanvas(maxX, 0)
            ctx.lineTo(end.x, end.y)
            ctx.closePath()
            ctx.fill()
            ctx.globalAlpha = 1
          }
        } catch (error) {
          // Silently skip rendering if there's an error
        }
        break
      }
      case 'taylor_series': {
        try {
          // Find the referenced function
          const functionObj = scene?.objects.find(o => o.id === obj.functionId)
          if (!functionObj || functionObj.type !== 'function') {
            break
          }
          
          const formula = functionObj.formula || 'x^2'
          const center = obj.center || 0
          const degree = Math.min(obj.degree || 3, 10) // Limit to degree 10
        const domain = functionObj.domain || { min: -5, max: 5 }
        const color = obj.color || '#f59e0b'
        const strokeWidth = obj.strokeWidth || 2
        
        // Calculate Taylor polynomial
        const coefficients = taylorCoefficients(formula, center, degree)
        
        // Sample Taylor polynomial
        const points = []
        for (let x = domain.min; x <= domain.max; x += 0.1) {
          let y = 0
          for (let n = 0; n <= degree; n++) {
            y += coefficients[n] * Math.pow(x - center, n)
          }
          if (!isNaN(y) && isFinite(y)) {
            points.push({ x, y })
          }
        }
        
        if (points.length > 0) {
          ctx.strokeStyle = color
          ctx.lineWidth = strokeWidth
          ctx.setLineDash([10, 5])
          ctx.beginPath()
          
          points.forEach((point, i) => {
            const canvasPoint = manimToCanvas(point.x, point.y)
            if (i === 0) {
              ctx.moveTo(canvasPoint.x, canvasPoint.y)
            } else {
              ctx.lineTo(canvasPoint.x, canvasPoint.y)
            }
          })
          ctx.stroke()
          ctx.setLineDash([])
        }
        } catch (error) {
          // Silently skip rendering if there's an error
        }
        break
      }
    }
    
    ctx.restore()
    
    // Selection outline and handles
    if (isSelected) {
      ctx.save()
      
      // Draw shape-specific outline with padding
      ctx.strokeStyle = '#e94560'
      ctx.lineWidth = 3
      ctx.setLineDash([5, 5])
      const pad = 8
      
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
          ctx.beginPath()
          
          // Scale triangle slightly larger from center for outline
          const scale = 1 + (pad * 2) / (scaleX * 2) // Approximate scale factor
          
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
          break
        }
        case 'polygon': {
          const r = obj.radius
          const sides = obj.sides || 5
          ctx.beginPath()
          for (let i = 0; i < sides; i++) {
            const angle = (i / sides) * Math.PI * 2 - Math.PI / 2
            const mx = obj.x + Math.cos(angle) * (r + pad / scaleX)
            const my = obj.y + Math.sin(angle) * (r + pad / scaleY)
            const p = manimToCanvas(mx, my)
            if (i === 0) ctx.moveTo(p.x, p.y)
            else ctx.lineTo(p.x, p.y)
          }
          ctx.closePath()
          ctx.stroke()
          break
        }
        case 'line':
        case 'arrow': {
          const start = manimToCanvas(obj.x, obj.y)
          const end = manimToCanvas(obj.x2, obj.y2)
          const dx = end.x - start.x
          const dy = end.y - start.y
          const len = Math.sqrt(dx * dx + dy * dy)
          const padX = (dx / len) * pad
          const padY = (dy / len) * pad
          ctx.beginPath()
          ctx.moveTo(start.x - padX, start.y - padY)
          ctx.lineTo(end.x + padX, end.y + padY)
          ctx.stroke()
          break
        }
        default: {
          // Fallback to bounding box for text/latex
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
      } else if (obj.type === 'rectangle') {
        // Draw corner handles at actual corners
        ctx.fillStyle = '#4ade80'
        const corners = [
          { x: obj.x - obj.width/2, y: obj.y + obj.height/2 }, // NW
          { x: obj.x + obj.width/2, y: obj.y + obj.height/2 }, // NE
          { x: obj.x - obj.width/2, y: obj.y - obj.height/2 }, // SW
          { x: obj.x + obj.width/2, y: obj.y - obj.height/2 }, // SE
        ]
        corners.forEach(c => {
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
      } else if (obj.type === 'circle' || obj.type === 'polygon') {
        // Draw corner resize handles at bounding box corners
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
    if (obj.type === 'line' || obj.type === 'arrow' || obj.type === 'triangle' || obj.type === 'rectangle') {
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
      case 'polygon':
        return {
          minX: obj.x - obj.radius,
          maxX: obj.x + obj.radius,
          minY: obj.y - obj.radius,
          maxY: obj.y + obj.radius
        }
      case 'line':
      case 'arrow':
        return {
          minX: Math.min(obj.x, obj.x2),
          maxX: Math.max(obj.x, obj.x2),
          minY: Math.min(obj.y, obj.y2),
          maxY: Math.max(obj.y, obj.y2)
        }
      case 'function': {
        const domain = obj.domain || { min: -5, max: 5 }
        const formula = obj.formula || 'x^2'
        const points = mathParser.sampleFunction(formula, domain.min, domain.max, 50)
        if (points.length === 0) {
          return { minX: domain.min, maxX: domain.max, minY: -2, maxY: 2 }
        }
        const ys = points.map(p => p.y).filter(y => !isNaN(y) && isFinite(y))
        if (ys.length === 0) {
          return { minX: domain.min, maxX: domain.max, minY: -2, maxY: 2 }
        }
        return {
          minX: domain.min,
          maxX: domain.max,
          minY: Math.min(...ys),
          maxY: Math.max(...ys)
        }
      }
      case 'tangent': {
        const functionObj = scene?.objects.find(o => o.id === obj.functionId)
        if (!functionObj || functionObj.type !== 'function') {
          return { minX: obj.pointX - 1, maxX: obj.pointX + 1, minY: -1, maxY: 1 }
        }
        
        const formula = functionObj.formula || 'x^2'
        const pointX = obj.pointX || 0
        const length = obj.length || 2
        
        const funcY = mathParser.evaluate(formula, pointX)
        const slope = mathParser.derivative(formula, pointX)
        
        if (isNaN(funcY) || isNaN(slope) || !isFinite(funcY) || !isFinite(slope)) {
          return { minX: pointX - length/2, maxX: pointX + length/2, minY: funcY - 1, maxY: funcY + 1 }
        }
        
        const halfLength = length / 2
        const y1 = funcY - slope * halfLength
        const y2 = funcY + slope * halfLength
        
        return {
          minX: pointX - halfLength,
          maxX: pointX + halfLength,
          minY: Math.min(y1, y2),
          maxY: Math.max(y1, y2)
        }
      }
      case 'riemann_sum': {
        try {
          const functionObj = scene?.objects.find(o => o.id === obj.functionId)
          if (!functionObj || functionObj.type !== 'function') {
            const interval = obj.interval || { a: 0, b: 2 }
            return { minX: interval.a, maxX: interval.b, minY: -1, maxY: 1 }
          }
          
          const formula = functionObj.formula || 'x^2'
          const interval = obj.interval || { a: 0, b: 2 }
          const n = Math.min(obj.n || 4, 200)
          const method = obj.method || 'left'
          
          const rectangles = calculateRiemannSum(formula, interval.a, interval.b, n, method)
          if (rectangles.length === 0) {
            return { minX: interval.a, maxX: interval.b, minY: -1, maxY: 1 }
          }
          
          const minY = Math.min(...rectangles.map(r => r.y))
          const maxY = Math.max(...rectangles.map(r => r.y + r.height))
          
          return {
            minX: interval.a,
            maxX: interval.b,
            minY: minY,
            maxY: maxY
          }
        } catch (error) {
          const interval = obj.interval || { a: 0, b: 2 }
          return { minX: interval.a, maxX: interval.b, minY: -1, maxY: 1 }
        }
      }
      case 'accumulation': {
        try {
          const functionObj = scene?.objects.find(o => o.id === obj.functionId)
          if (!functionObj || functionObj.type !== 'function') {
            const startPoint = obj.startPoint || 0
            const currentX = obj.currentX || 2
            return { minX: Math.min(startPoint, currentX), maxX: Math.max(startPoint, currentX), minY: 0, maxY: 2 }
          }
          
          const formula = functionObj.formula || 'x^2'
          const startPoint = obj.startPoint || 0
          const currentX = obj.currentX || 2
          const minX = Math.min(startPoint, currentX)
          const maxX = Math.max(startPoint, currentX)
          
          const points = mathParser.sampleFunction(formula, minX, maxX, 50)
          if (points.length === 0) {
            return { minX, maxX, minY: 0, maxY: 2 }
          }
          const ys = points.map(p => p.y).filter(y => !isNaN(y) && isFinite(y) && y >= 0)
          const maxY = ys.length > 0 ? Math.max(...ys) : 2
          
          return { minX, maxX, minY: 0, maxY }
        } catch (error) {
          const startPoint = obj.startPoint || 0
          const currentX = obj.currentX || 2
          return { minX: Math.min(startPoint, currentX), maxX: Math.max(startPoint, currentX), minY: 0, maxY: 2 }
        }
      }
      case 'taylor_series': {
        try {
          const functionObj = scene?.objects.find(o => o.id === obj.functionId)
          if (!functionObj || functionObj.type !== 'function') {
            const domain = functionObj?.domain || { min: -5, max: 5 }
            return { minX: domain.min, maxX: domain.max, minY: -2, maxY: 2 }
          }
          
          const formula = functionObj.formula || 'x^2'
          const center = obj.center || 0
          const degree = Math.min(obj.degree || 3, 10)
          const domain = functionObj.domain || { min: -5, max: 5 }
          
          const coefficients = taylorCoefficients(formula, center, degree)
        const points = []
        for (let x = domain.min; x <= domain.max; x += 0.2) {
          let y = 0
          for (let n = 0; n <= degree; n++) {
            y += coefficients[n] * Math.pow(x - center, n)
          }
          if (!isNaN(y) && isFinite(y)) {
            points.push({ x, y })
          }
        }
        
        if (points.length === 0) {
          return { minX: domain.min, maxX: domain.max, minY: -2, maxY: 2 }
        }
        const ys = points.map(p => p.y).filter(y => !isNaN(y) && isFinite(y))
        return {
          minX: domain.min,
          maxX: domain.max,
          minY: Math.min(...ys),
          maxY: Math.max(...ys)
        }
        } catch (error) {
          const domain = { min: -5, max: 5 }
          return { minX: domain.min, maxX: domain.max, minY: -2, maxY: 2 }
        }
      }
      default:
        return { minX: obj.x - 1, maxX: obj.x + 1, minY: obj.y - 0.5, maxY: obj.y + 0.5 }
    }
  }

  const hitTest = (canvasX, canvasY) => {
    if (!scene?.objects) return null
    const manim = canvasToManim(canvasX, canvasY)
    
    // Check objects in reverse z-order (top first)
    // When z-index is equal, later objects (higher array index) are in front
    const sortedObjects = scene.objects
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
        // Check if point is inside regular polygon (simplified circle check)
        const dist = Math.sqrt((mx - obj.x) ** 2 + (my - obj.y) ** 2)
        return dist <= obj.radius
      }
      case 'line':
      case 'arrow': {
        // Check if point is near the line (within stroke width distance)
        const distToLine = pointToLineDistance(mx, my, obj.x, obj.y, obj.x2, obj.y2)
        const strokeRadius = (obj.strokeWidth || 2) * 0.1 // Convert pixels to manim units roughly
        return distToLine <= Math.max(strokeRadius, 0.2)
      }
      case 'text':
      case 'latex': {
        // Use bounding box for text
        const bounds = getObjectBounds(obj)
        return mx >= bounds.minX && mx <= bounds.maxX &&
               my >= bounds.minY && my <= bounds.maxY
      }
      case 'function': {
        // Check if point is near the function curve
        const formula = obj.formula || 'x^2'
        const domain = obj.domain || { min: -5, max: 5 }
        
        // Check if x is in domain
        if (mx < domain.min || mx > domain.max) return false
        
        // Get function value at this x
        const funcY = mathParser.evaluate(formula, mx)
        if (isNaN(funcY) || !isFinite(funcY)) return false
        
        // Check if y is within threshold distance from function
        const threshold = 0.3 // Manim units
        return Math.abs(my - funcY) <= threshold
      }
      case 'tangent': {
        // Check if point is near the tangent line
        const functionObj = scene?.objects.find(o => o.id === obj.functionId)
        if (!functionObj || functionObj.type !== 'function') return false
        
        const formula = functionObj.formula || 'x^2'
        const pointX = obj.pointX || 0
        const length = obj.length || 2
        
        // Calculate function value and derivative
        const funcY = mathParser.evaluate(formula, pointX)
        const slope = mathParser.derivative(formula, pointX)
        
        if (isNaN(funcY) || isNaN(slope) || !isFinite(funcY) || !isFinite(slope)) {
          return false
        }
        
        // Check if point is on the tangent line
        const halfLength = length / 2
        if (mx < pointX - halfLength || mx > pointX + halfLength) return false
        
        const expectedY = funcY + slope * (mx - pointX)
        const threshold = 0.3
        return Math.abs(my - expectedY) <= threshold
      }
      case 'riemann_sum': {
        try {
          // Check if point is inside any rectangle
          const functionObj = scene?.objects.find(o => o.id === obj.functionId)
          if (!functionObj || functionObj.type !== 'function') return false
          
          const formula = functionObj.formula || 'x^2'
          const interval = obj.interval || { a: 0, b: 2 }
          const n = Math.min(obj.n || 4, 200)
          const method = obj.method || 'left'
          
          const rectangles = calculateRiemannSum(formula, interval.a, interval.b, n, method)
          
          return rectangles.some(rect => {
            return mx >= rect.x && mx <= rect.x + rect.width &&
                   my >= rect.y && my <= rect.y + rect.height
          })
        } catch (error) {
          return false
        }
      }
      case 'accumulation': {
        try {
          const functionObj = scene?.objects.find(o => o.id === obj.functionId)
          if (!functionObj || functionObj.type !== 'function') return false
          
          const formula = functionObj.formula || 'x^2'
          const startPoint = obj.startPoint || 0
          const currentX = obj.currentX || 2
          
          const minX = Math.min(startPoint, currentX)
          const maxX = Math.max(startPoint, currentX)
          
          if (mx < minX || mx > maxX) return false
          
          const funcY = mathParser.evaluate(formula, mx)
          if (isNaN(funcY) || !isFinite(funcY)) return false
          
          // Check if point is in the area under the curve
          return my >= 0 && my <= funcY
        } catch (error) {
          return false
        }
      }
      case 'taylor_series': {
        try {
          const functionObj = scene?.objects.find(o => o.id === obj.functionId)
          if (!functionObj || functionObj.type !== 'function') return false
          
          const formula = functionObj.formula || 'x^2'
          const center = obj.center || 0
          const degree = Math.min(obj.degree || 3, 10)
          const domain = functionObj.domain || { min: -5, max: 5 }
          
          if (mx < domain.min || mx > domain.max) return false
          
          // Calculate Taylor polynomial value
          const coefficients = taylorCoefficients(formula, center, degree)
          let taylorY = 0
          for (let n = 0; n <= degree; n++) {
            taylorY += coefficients[n] * Math.pow(mx - center, n)
          }
          
          if (isNaN(taylorY) || !isFinite(taylorY)) return false
          
          const threshold = 0.3
          return Math.abs(my - taylorY) <= threshold
        } catch (error) {
          return false
        }
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
    
    // For rectangles, check corner vertex handles
    if (obj.type === 'rectangle') {
      const corners = [
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
    
    // Check corner handles for other shapes
    const handles = getHandles(obj, topLeft, size)
    for (const handle of handles) {
      if (Math.abs(canvasX - handle.x) < HANDLE_SIZE && Math.abs(canvasY - handle.y) < HANDLE_SIZE) {
        return handle.id
      }
    }
    
    return null
  }

  // Simplified snap - just grid and axes
  const snapPosition = useCallback((x, y, excludeId = null) => {
    // If snapping is disabled, just return rounded values
    if (!snapEnabled) {
      return { 
        x: parseFloat(x.toFixed(2)), 
        y: parseFloat(y.toFixed(2)) 
      }
    }
    
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
    
    return { 
      x: parseFloat(snappedX.toFixed(2)), 
      y: parseFloat(snappedY.toFixed(2)) 
    }
  }, [snapEnabled])

  const handleMouseDown = (e) => {
    const rect = canvasRef.current.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    
    // First check if clicking on a handle of the selected object
    if (selectedObjectId) {
      const selectedObj = scene.objects.find(o => o.id === selectedObjectId)
      const handleHit = hitTestHandle(x, y, selectedObj)
      
      if (handleHit) {
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
      const obj = scene.objects.find(o => o.id === hitId)
      if (obj) {
        setIsDragging(true)
        setDragType('move')
        setActiveHandle(null)
        setDragStart({ x: e.clientX, y: e.clientY })
        setDragOffset({ ...obj })
      }
    }
  }

  const handleMouseMove = (e) => {
    if (!isDragging || !selectedObjectId) return
    
    const dx = (e.clientX - dragStart.x) / scaleX
    const dy = -(e.clientY - dragStart.y) / scaleY
    
    // Check if shift is held for angle snapping
    const shiftHeld = e.shiftKey
    
    if (dragType === 'move') {
      const rawX = dragOffset.x + dx
      const rawY = dragOffset.y + dy
      const snapped = snapPosition(rawX, rawY, selectedObjectId)
      onUpdateObject(selectedObjectId, snapped)
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
      
      // Handle rectangle corner dragging
      if (obj.type === 'rectangle' && activeHandle?.startsWith('corner-')) {
        const cornerIndex = parseInt(activeHandle.split('-')[1])
        // Corners: 0=NW, 1=NE, 2=SW, 3=SE
        let newX = dragOffset.x
        let newY = dragOffset.y
        let newWidth = dragOffset.width
        let newHeight = dragOffset.height
        
        // Calculate new dimensions based on which corner is being dragged
        if (cornerIndex === 0) { // NW
          newWidth = Math.max(0.2, dragOffset.width - dx)
          newHeight = Math.max(0.2, dragOffset.height + dy)
          newX = dragOffset.x + dx / 2
          newY = dragOffset.y + dy / 2
        } else if (cornerIndex === 1) { // NE
          newWidth = Math.max(0.2, dragOffset.width + dx)
          newHeight = Math.max(0.2, dragOffset.height + dy)
          newX = dragOffset.x + dx / 2
          newY = dragOffset.y + dy / 2
        } else if (cornerIndex === 2) { // SW
          newWidth = Math.max(0.2, dragOffset.width - dx)
          newHeight = Math.max(0.2, dragOffset.height - dy)
          newX = dragOffset.x + dx / 2
          newY = dragOffset.y + dy / 2
        } else if (cornerIndex === 3) { // SE
          newWidth = Math.max(0.2, dragOffset.width + dx)
          newHeight = Math.max(0.2, dragOffset.height - dy)
          newX = dragOffset.x + dx / 2
          newY = dragOffset.y + dy / 2
        }
        
        onUpdateObject(selectedObjectId, {
          width: parseFloat(newWidth.toFixed(2)),
          height: parseFloat(newHeight.toFixed(2)),
          x: parseFloat(newX.toFixed(2)),
          y: parseFloat(newY.toFixed(2))
        })
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
      
      // For circles/polygons, resize radius based on distance from center
      if (obj.type === 'circle' || obj.type === 'polygon' || obj.type === 'dot') {
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
  }

  const handlePaletteClick = (type, event) => {
    if (event) event.stopPropagation()
    if (type === 'riemann_sum') {
      setOpenPaletteMenu(openPaletteMenu === 'riemann_sum' ? null : 'riemann_sum')
      return
    }
    setOpenPaletteMenu(null)
    onAddObject(type)
  }

  const handleRiemannSelection = (option) => {
    onAddObject('riemann_sum', {
      method: option.method,
      n: option.n,
      interval: option.interval || { a: -3, b: 3 }
    })
    setOpenPaletteMenu(null)
  }

  return (
    <div className="canvas-container" ref={containerRef}>
      <div className="shape-palette">
        {SHAPE_PALETTE.map(shape => (
          <div key={shape.type} className="palette-item-wrapper">
            <button
              className={`palette-item ${shape.type === 'riemann_sum' && openPaletteMenu === 'riemann_sum' ? 'active' : ''}`}
              onClick={(event) => handlePaletteClick(shape.type, event)}
              title={shape.label}
            >
              <span className="palette-icon">{shape.icon}</span>
              <span className="palette-label">{shape.label}</span>
            </button>
            {shape.type === 'riemann_sum' && openPaletteMenu === 'riemann_sum' && (
              <div ref={dropdownRef} className="palette-dropdown">
                {RIEMANN_OPTIONS.map(option => (
                  <button
                    key={option.label}
                    className="dropdown-item"
                    onClick={(event) => {
                      event.stopPropagation()
                      handleRiemannSelection(option)
                    }}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
        
        <div className="palette-divider" />
        
        <button
          className={`palette-item snap-toggle ${snapEnabled ? 'active' : ''}`}
          onClick={() => setSnapEnabled(!snapEnabled)}
          title={snapEnabled ? 'Snapping ON (click to disable)' : 'Snapping OFF (click to enable)'}
        >
          <span className="palette-icon">⊞</span>
          <span className="palette-label">{snapEnabled ? 'Snap ON' : 'Snap OFF'}</span>
        </button>
      </div>
      
      <div className="canvas-wrapper">
        <canvas
          ref={canvasRef}
          width={canvasSize.width}
          height={canvasSize.height}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        />
      </div>
    </div>
  )
}

export default Canvas

