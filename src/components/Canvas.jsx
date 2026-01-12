import React, { useRef, useState, useEffect, useCallback } from 'react'
import './Canvas.css'

const SHAPE_PALETTE = [
  { type: 'rectangle', icon: '▭', label: 'Rectangle' },
  { type: 'circle', icon: '○', label: 'Circle' },
  { type: 'line', icon: '╱', label: 'Line' },
  { type: 'arrow', icon: '→', label: 'Arrow' },
  { type: 'dot', icon: '•', label: 'Dot' },
  { type: 'polygon', icon: '⬠', label: 'Polygon' },
  { type: 'text', icon: 'T', label: 'Text' },
  { type: 'latex', icon: '∑', label: 'LaTeX' },
]

// Manim coordinate system: center is (0,0), x: -7 to 7, y: -4 to 4
const MANIM_WIDTH = 14
const MANIM_HEIGHT = 8

const HANDLE_SIZE = 10

function Canvas({ scene, selectedObjectId, onSelectObject, onUpdateObject, onAddObject }) {
  const canvasRef = useRef(null)
  const containerRef = useRef(null)
  const [canvasSize, setCanvasSize] = useState({ width: 800, height: 450 })
  const [isDragging, setIsDragging] = useState(false)
  const [dragType, setDragType] = useState(null) // 'move' | 'resize-corner' | 'resize-edge' | 'endpoint'
  const [activeHandle, setActiveHandle] = useState(null) // which handle is being dragged
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 })

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
        drawObject(ctx, obj, obj.id === selectedObjectId)
      })
    }
  }, [scene, selectedObjectId, canvasSize, manimToCanvas])

  const drawObject = (ctx, obj, isSelected) => {
    const pos = manimToCanvas(obj.x, obj.y)
    
    ctx.save()
    ctx.translate(pos.x, pos.y)
    ctx.rotate(-obj.rotation * Math.PI / 180) // Negative because canvas Y is inverted
    ctx.globalAlpha = obj.opacity ?? 1
    
    switch (obj.type) {
      case 'rectangle': {
        const w = obj.width * scaleX
        const h = obj.height * scaleY
        if (obj.fill) {
          ctx.fillStyle = obj.fill
          ctx.fillRect(-w / 2, -h / 2, w, h)
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
          ctx.fillStyle = obj.fill
          ctx.fill()
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
        ctx.fillStyle = obj.fill || '#ffffff'
        ctx.fill()
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
          ctx.fillStyle = obj.fill
          ctx.fill()
        }
        if (obj.stroke) {
          ctx.strokeStyle = obj.stroke
          ctx.lineWidth = obj.strokeWidth || 2
          ctx.stroke()
        }
        break
      }
      case 'text': {
        ctx.font = `${obj.fontSize || 48}px Arial`
        ctx.fillStyle = obj.fill || '#ffffff'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(obj.text || 'Text', 0, 0)
        break
      }
      case 'latex': {
        // Simplified LaTeX preview (just show the raw text)
        ctx.font = '24px serif'
        ctx.fillStyle = obj.fill || '#ffffff'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(`[${obj.latex}]`, 0, 0)
        break
      }
    }
    
    ctx.restore()
    
    // Selection outline and handles
    if (isSelected) {
      ctx.save()
      
      const bounds = getObjectBounds(obj)
      const topLeft = manimToCanvas(bounds.minX, bounds.maxY)
      const bottomRight = manimToCanvas(bounds.maxX, bounds.minY)
      const size = {
        width: bottomRight.x - topLeft.x,
        height: bottomRight.y - topLeft.y
      }
      
      // Selection outline
      ctx.strokeStyle = '#e94560'
      ctx.lineWidth = 2
      ctx.setLineDash([5, 5])
      ctx.strokeRect(topLeft.x - 4, topLeft.y - 4, size.width + 8, size.height + 8)
      ctx.setLineDash([])
      
      // Draw resize handles
      ctx.fillStyle = '#e94560'
      const handles = getHandles(obj, topLeft, size)
      handles.forEach(handle => {
        ctx.fillRect(handle.x - HANDLE_SIZE/2, handle.y - HANDLE_SIZE/2, HANDLE_SIZE, HANDLE_SIZE)
      })
      
      // For lines/arrows, draw endpoint handles
      if (obj.type === 'line' || obj.type === 'arrow') {
        const start = manimToCanvas(obj.x, obj.y)
        const end = manimToCanvas(obj.x2, obj.y2)
        ctx.fillStyle = '#4ade80'
        ctx.beginPath()
        ctx.arc(start.x, start.y, HANDLE_SIZE/2, 0, Math.PI * 2)
        ctx.fill()
        ctx.beginPath()
        ctx.arc(end.x, end.y, HANDLE_SIZE/2, 0, Math.PI * 2)
        ctx.fill()
      }
      
      ctx.restore()
    }
  }
  
  // Get resize handles for an object
  const getHandles = (obj, topLeft, size) => {
    if (obj.type === 'line' || obj.type === 'arrow') {
      return [] // Lines use endpoint handles instead
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
      default:
        return { minX: obj.x - 1, maxX: obj.x + 1, minY: obj.y - 0.5, maxY: obj.y + 0.5 }
    }
  }

  const hitTest = (canvasX, canvasY) => {
    if (!scene?.objects) return null
    const manim = canvasToManim(canvasX, canvasY)
    
    // Check objects in reverse z-order (top first)
    const sortedObjects = [...scene.objects].sort((a, b) => (b.zIndex || 0) - (a.zIndex || 0))
    
    for (const obj of sortedObjects) {
      const bounds = getObjectBounds(obj)
      if (manim.x >= bounds.minX && manim.x <= bounds.maxX &&
          manim.y >= bounds.minY && manim.y <= bounds.maxY) {
        return obj.id
      }
    }
    return null
  }

  // Check if clicking on a resize handle
  const hitTestHandle = (canvasX, canvasY, obj) => {
    if (!obj) return null
    
    const bounds = getObjectBounds(obj)
    const topLeft = manimToCanvas(bounds.minX, bounds.maxY)
    const bottomRight = manimToCanvas(bounds.maxX, bounds.minY)
    const size = { width: bottomRight.x - topLeft.x, height: bottomRight.y - topLeft.y }
    
    // For lines/arrows, check endpoint handles
    if (obj.type === 'line' || obj.type === 'arrow') {
      const start = manimToCanvas(obj.x, obj.y)
      const end = manimToCanvas(obj.x2, obj.y2)
      
      if (Math.hypot(canvasX - start.x, canvasY - start.y) < HANDLE_SIZE) {
        return 'start'
      }
      if (Math.hypot(canvasX - end.x, canvasY - end.y) < HANDLE_SIZE) {
        return 'end'
      }
      return null
    }
    
    // Check corner handles
    const handles = getHandles(obj, topLeft, size)
    for (const handle of handles) {
      if (Math.abs(canvasX - handle.x) < HANDLE_SIZE && Math.abs(canvasY - handle.y) < HANDLE_SIZE) {
        return handle.id
      }
    }
    
    return null
  }

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
    
    if (dragType === 'move') {
      onUpdateObject(selectedObjectId, {
        x: parseFloat((dragOffset.x + dx).toFixed(2)),
        y: parseFloat((dragOffset.y + dy).toFixed(2))
      })
    } else if (dragType === 'resize') {
      const obj = scene.objects.find(o => o.id === selectedObjectId)
      if (!obj) return
      
      // Handle line/arrow endpoint dragging
      if (obj.type === 'line' || obj.type === 'arrow') {
        if (activeHandle === 'start') {
          onUpdateObject(selectedObjectId, {
            x: parseFloat((dragOffset.x + dx).toFixed(2)),
            y: parseFloat((dragOffset.y + dy).toFixed(2))
          })
        } else if (activeHandle === 'end') {
          onUpdateObject(selectedObjectId, {
            x2: parseFloat((dragOffset.x2 + dx).toFixed(2)),
            y2: parseFloat((dragOffset.y2 + dy).toFixed(2))
          })
        }
        return
      }
      
      // Handle corner resizing for shapes
      if (obj.type === 'rectangle') {
        let newWidth = dragOffset.width
        let newHeight = dragOffset.height
        let newX = dragOffset.x
        let newY = dragOffset.y
        
        if (activeHandle.includes('e')) {
          newWidth = Math.max(0.2, dragOffset.width + dx)
          newX = dragOffset.x + dx / 2
        }
        if (activeHandle.includes('w')) {
          newWidth = Math.max(0.2, dragOffset.width - dx)
          newX = dragOffset.x + dx / 2
        }
        if (activeHandle.includes('s')) {
          newHeight = Math.max(0.2, dragOffset.height - dy)
          newY = dragOffset.y + dy / 2
        }
        if (activeHandle.includes('n')) {
          newHeight = Math.max(0.2, dragOffset.height + dy)
          newY = dragOffset.y + dy / 2
        }
        
        onUpdateObject(selectedObjectId, {
          width: parseFloat(newWidth.toFixed(2)),
          height: parseFloat(newHeight.toFixed(2)),
          x: parseFloat(newX.toFixed(2)),
          y: parseFloat(newY.toFixed(2))
        })
      } else if (obj.type === 'circle' || obj.type === 'polygon' || obj.type === 'dot') {
        // For circles/polygons, resize radius based on distance from center
        const dist = Math.sqrt(dx * dx + dy * dy)
        const sign = (activeHandle.includes('e') || activeHandle.includes('s')) ? 1 : -1
        const newRadius = Math.max(0.1, dragOffset.radius + sign * dist * 0.5)
        
        onUpdateObject(selectedObjectId, {
          radius: parseFloat(newRadius.toFixed(2))
        })
      }
    }
  }

  const handleMouseUp = () => {
    setIsDragging(false)
    setDragType(null)
    setActiveHandle(null)
  }

  const handlePaletteClick = (type) => {
    onAddObject(type)
  }

  return (
    <div className="canvas-container" ref={containerRef}>
      <div className="shape-palette">
        {SHAPE_PALETTE.map(shape => (
          <button
            key={shape.type}
            className="palette-item"
            onClick={() => handlePaletteClick(shape.type)}
            title={shape.label}
          >
            <span className="palette-icon">{shape.icon}</span>
            <span className="palette-label">{shape.label}</span>
          </button>
        ))}
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

