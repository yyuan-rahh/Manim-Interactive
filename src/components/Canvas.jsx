import React, { useMemo, useRef, useState, useEffect, useCallback } from 'react'
import './Canvas.css'
import { convertLatexToMarkup } from 'mathlive'
import { projectToGraph, clampToGraphRange, getGraphById, getCursorById } from '../utils/graphTools'
import { getLinkingStatus, getBestLinkType, generateLinkUpdates } from '../utils/linking'

// Extracted canvas modules
import {
  PALETTE_CATEGORIES,
  MANIM_WIDTH, MANIM_HEIGHT, HANDLE_SIZE,
  getVisibleObjectsAtTime,
  getObjectBounds,
  getHandles,
} from './canvas/constants'
import { drawObject as drawObjectFn } from './canvas/renderer'
import { hitTest as hitTestFn, hitTestShape as hitTestShapeFn, hitTestHandle as hitTestHandleFn } from './canvas/hitTesting'
import useCanvasInteraction from './canvas/useCanvasInteraction'
import VertexLabelEditor from './canvas/VertexLabelEditor'
import CanvasPalette from './canvas/CanvasPalette'
import CanvasContextMenu from './canvas/CanvasContextMenu'

function Canvas({ scene, currentTime = 0, selectedObjectIds = [], onSelectObjects, onUpdateObject, onAddObject, onDuplicateObject, onDeleteObject }) {
  const canvasRef = useRef(null)
  const containerRef = useRef(null)
  const canvasWrapperRef = useRef(null)

  const [canvasSize, setCanvasSize] = useState({ width: 800, height: 450 })
  const MIN_CANVAS_WIDTH = 320
  const MIN_CANVAS_HEIGHT = 180
  const [snapEnabled, setSnapEnabled] = useState(true)
  // Zoom/pan view transform
  const [viewTransform, setViewTransform] = useState({ offsetX: 0, offsetY: 0, scale: 1 })
  const isPanningRef = useRef(false)
  const panStartRef = useRef({ x: 0, y: 0, offsetX: 0, offsetY: 0 })
  const [contextMenu, setContextMenu] = useState({ open: false, x: 0, y: 0, objectId: null })
  const [editingVertex, setEditingVertex] = useState({ objectId: null, vertexIndex: null, label: '', isCorner: false })
  const vertexInputRef = useRef(null)
  const latexLayerRef = useRef(null)

  // Link mode state
  const selectedObjects = scene?.objects?.filter(o => selectedObjectIds.includes(o.id)) || []
  const selectedObject = selectedObjects.length === 1 ? selectedObjects[0] : null
  const linkingStatus = selectedObject ? getLinkingStatus(selectedObject) : { needsLink: false, missingLinks: [], eligibleTargets: [] }
  const [linkModeActive, setLinkModeActive] = useState(false)
  const [hoveredLinkTarget, setHoveredLinkTarget] = useState(null)

  // Auto-enter link mode when selected object needs links
  useEffect(() => {
    if (linkingStatus.needsLink && selectedObjectIds.length === 1) {
      setLinkModeActive(true)
    } else {
      setLinkModeActive(false)
      setHoveredLinkTarget(null)
    }
  }, [linkingStatus.needsLink, selectedObjectIds])

  // Keyboard shortcuts for palette items
  useEffect(() => {
    const SHORTCUT_MAP = {}
    for (const cat of PALETTE_CATEGORIES) {
      for (const item of cat.items) {
        if (item.shortcut) {
          SHORTCUT_MAP[item.shortcut.toLowerCase()] = item.type
        }
      }
    }
    const handleShortcut = (e) => {
      const el = document.activeElement
      if (el?.tagName === 'INPUT' || el?.tagName === 'TEXTAREA' || el?.isContentEditable) return
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const type = SHORTCUT_MAP[e.key.toLowerCase()]
      if (type) {
        e.preventDefault()
        onAddObject?.(type)
      }
    }
    window.addEventListener('keydown', handleShortcut)
    return () => window.removeEventListener('keydown', handleShortcut)
  }, [onAddObject])

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

  // Convert Manim coords to canvas coords (with zoom/pan)
  const manimToCanvas = useCallback((mx, my) => {
    const { offsetX, offsetY, scale } = viewTransform
    const x = (((mx + MANIM_WIDTH / 2) / MANIM_WIDTH) * canvasSize.width) * scale + offsetX
    const y = (((MANIM_HEIGHT / 2 - my) / MANIM_HEIGHT) * canvasSize.height) * scale + offsetY
    return { x, y }
  }, [canvasSize, viewTransform])

  // Convert canvas coords to Manim coords (with zoom/pan)
  const canvasToManim = useCallback((cx, cy) => {
    const { offsetX, offsetY, scale } = viewTransform
    const rawCx = (cx - offsetX) / scale
    const rawCy = (cy - offsetY) / scale
    const mx = (rawCx / canvasSize.width) * MANIM_WIDTH - MANIM_WIDTH / 2
    const my = MANIM_HEIGHT / 2 - (rawCy / canvasSize.height) * MANIM_HEIGHT
    return { x: parseFloat(mx.toFixed(2)), y: parseFloat(my.toFixed(2)) }
  }, [canvasSize, viewTransform])

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

  // ── Wrappers that bind extracted module functions to component state ──
  const renderCtx = useMemo(() => ({
    manimToCanvas, scaleX, scaleY,
    getObjectBounds, getTextCorners, getTextRotateHandle, getHandles,
    selectedObjectIds, selectedObject,
    HANDLE_SIZE,
  }), [manimToCanvas, scaleX, scaleY, getTextCorners, getTextRotateHandle, selectedObjectIds, selectedObject])

  const hitCtx = useMemo(() => ({
    manimToCanvas, canvasToManim,
    scaleX, scaleY,
    getObjectBounds, getTextCorners, getTextRotateHandle, getHandles,
    HANDLE_SIZE,
  }), [manimToCanvas, canvasToManim, scaleX, scaleY, getTextCorners, getTextRotateHandle])

  const drawObject = useCallback((ctx, obj, isSelected, sceneArg, linkModeActiveArg = false, isEligibleTarget = false, isHoveredTarget = false) => {
    drawObjectFn(ctx, obj, isSelected, sceneArg, renderCtx, { linkModeActive: linkModeActiveArg, isEligibleTarget, isHoveredTarget })
  }, [renderCtx])

  const hitTest = useCallback((canvasX, canvasY) => {
    return hitTestFn(canvasX, canvasY, scene, currentTime, hitCtx)
  }, [scene, currentTime, hitCtx])

  const hitTestShape = useCallback((obj, mx, my) => {
    return hitTestShapeFn(obj, mx, my, scene, hitCtx)
  }, [scene, hitCtx])

  const hitTestHandle = useCallback((canvasX, canvasY, obj) => {
    return hitTestHandleFn(canvasX, canvasY, obj, hitCtx)
  }, [hitCtx])

  // ── Interaction hook (all drag / click / select logic) ──
  const {
    selectionBox,
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    openContextMenu,
  } = useCanvasInteraction({
    scene, currentTime, selectedObjectIds, selectedObject,
    onSelectObjects, onUpdateObject, snapEnabled,
    linkModeActive, setLinkModeActive,
    hoveredLinkTarget, setHoveredLinkTarget,
    canvasToManim, hitTest, hitTestShape, hitTestHandle,
    scaleX, scaleY,
    canvasRef, containerRef,
    setContextMenu, setEditingVertex, vertexInputRef,
  })

  // Resize canvas to fit the canvas-wrapper while maintaining 16:9 aspect
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

  // Observe canvas-wrapper for size changes (e.g. panel resize)
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

  // Close context menu on outside click / Escape
  useEffect(() => {
    if (!contextMenu.open) return
    const onGlobal = () => setContextMenu({ open: false, x: 0, y: 0, objectId: null })
    const onKey = (e) => { if (e.key === 'Escape') setContextMenu({ open: false, x: 0, y: 0, objectId: null }) }
    window.addEventListener('mousedown', onGlobal)
    window.addEventListener('keydown', onKey)
    return () => { window.removeEventListener('mousedown', onGlobal); window.removeEventListener('keydown', onKey) }
  }, [contextMenu.open])

  // ── Draw the scene ──
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')

    ctx.fillStyle = '#1a1a2e'
    ctx.fillRect(0, 0, canvasSize.width, canvasSize.height)

    // Sub-grid (0.25 Manim-unit increments)
    if (snapEnabled && viewTransform.scale >= 0.7) {
      ctx.strokeStyle = 'rgba(255,255,255,0.03)'
      ctx.lineWidth = 0.5
      const subStep = 0.25
      for (let mx = Math.ceil(-MANIM_WIDTH / 2 / subStep) * subStep; mx <= MANIM_WIDTH / 2; mx += subStep) {
        if (Number.isInteger(mx)) continue
        const { x } = manimToCanvas(mx, 0)
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvasSize.height); ctx.stroke()
      }
      for (let my = Math.ceil(-MANIM_HEIGHT / 2 / subStep) * subStep; my <= MANIM_HEIGHT / 2; my += subStep) {
        if (Number.isInteger(my)) continue
        const { y } = manimToCanvas(0, my)
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvasSize.width, y); ctx.stroke()
      }
    }

    // Integer grid
    ctx.strokeStyle = 'rgba(255,255,255,0.08)'
    ctx.lineWidth = 1
    for (let i = 0; i <= MANIM_WIDTH; i++) {
      const { x } = manimToCanvas(i - MANIM_WIDTH / 2, 0)
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvasSize.height); ctx.stroke()
    }
    for (let i = 0; i <= MANIM_HEIGHT; i++) {
      const { y } = manimToCanvas(0, i - MANIM_HEIGHT / 2)
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvasSize.width, y); ctx.stroke()
    }

    // Origin axes
    ctx.strokeStyle = 'rgba(255,255,255,0.2)'
    ctx.lineWidth = 1.5
    const origin = manimToCanvas(0, 0)
    ctx.beginPath(); ctx.moveTo(0, origin.y); ctx.lineTo(canvasSize.width, origin.y); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(origin.x, 0); ctx.lineTo(origin.x, canvasSize.height); ctx.stroke()

    // Coordinate labels
    if (viewTransform.scale >= 1.2) {
      ctx.fillStyle = 'rgba(255,255,255,0.12)'
      ctx.font = '9px sans-serif'
      ctx.textAlign = 'left'
      ctx.textBaseline = 'top'
      for (let mx = Math.ceil(-MANIM_WIDTH / 2); mx <= MANIM_WIDTH / 2; mx += 2) {
        for (let my = Math.ceil(-MANIM_HEIGHT / 2); my <= MANIM_HEIGHT / 2; my += 2) {
          if (mx === 0 && my === 0) continue
          const pt = manimToCanvas(mx, my)
          ctx.fillText(`${mx},${my}`, pt.x + 2, pt.y + 2)
        }
      }
    }

    // Draw objects
    if (scene?.objects) {
      const visible = getVisibleObjectsAtTime(scene.objects, currentTime)
      const sortedObjects = [...visible].sort((a, b) => (a.zIndex || 0) - (b.zIndex || 0))

      const eligibleTargetIds = new Set()
      if (linkModeActive && selectedObject) {
        sortedObjects.forEach(obj => {
          if (!selectedObjectIds.includes(obj.id)) {
            const linkType = getBestLinkType(selectedObject, obj)
            if (linkType) eligibleTargetIds.add(obj.id)
          }
        })
      }

      sortedObjects.forEach(obj => {
        if (obj.type === 'latex') return
        const isSelected = selectedObjectIds.includes(obj.id)
        const isEligibleTarget = eligibleTargetIds.has(obj.id)
        const isHoveredTarget = obj.id === hoveredLinkTarget
        drawObject(ctx, obj, isSelected, scene, linkModeActive, isEligibleTarget, isHoveredTarget)
      })

      // Selection box
      if (selectionBox) {
        const { startX, startY, endX, endY } = selectionBox
        ctx.strokeStyle = '#3b82f6'
        ctx.fillStyle = 'rgba(59, 130, 246, 0.1)'
        ctx.lineWidth = 2
        ctx.setLineDash([])
        const bx = Math.min(startX, endX)
        const by = Math.min(startY, endY)
        const bw = Math.abs(endX - startX)
        const bh = Math.abs(endY - startY)
        ctx.fillRect(bx, by, bw, bh)
        ctx.strokeRect(bx, by, bw, bh)
      }
    }
  }, [scene, currentTime, selectedObjectIds, canvasSize, manimToCanvas, linkModeActive, selectedObject, hoveredLinkTarget, selectionBox, snapEnabled, viewTransform.scale, drawObject])

  const latexObjects = useMemo(() => {
    const objs = scene?.objects || []
    return getVisibleObjectsAtTime(objs, currentTime).filter(o => o.type === 'latex')
  }, [scene?.objects, currentTime])

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
      <CanvasPalette
        onAddObject={onAddObject}
        snapEnabled={snapEnabled}
        onToggleSnap={() => setSnapEnabled(!snapEnabled)}
        viewTransform={viewTransform}
        onResetView={() => setViewTransform({ offsetX: 0, offsetY: 0, scale: 1 })}
      />

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
          onMouseDown={(e) => {
            if (e.button === 1) {
              e.preventDefault()
              isPanningRef.current = true
              panStartRef.current = {
                x: e.clientX, y: e.clientY,
                offsetX: viewTransform.offsetX, offsetY: viewTransform.offsetY,
              }
              return
            }
            handleMouseDown(e)
          }}
          onMouseMove={(e) => {
            if (isPanningRef.current) {
              const dx = e.clientX - panStartRef.current.x
              const dy = e.clientY - panStartRef.current.y
              setViewTransform(vt => ({
                ...vt,
                offsetX: panStartRef.current.offsetX + dx,
                offsetY: panStartRef.current.offsetY + dy,
              }))
              return
            }
            handleMouseMove(e)
          }}
          onMouseUp={(e) => {
            if (isPanningRef.current) { isPanningRef.current = false; return }
            handleMouseUp(e)
          }}
          onMouseLeave={(e) => {
            isPanningRef.current = false
            handleMouseUp(e)
          }}
          onWheel={(e) => {
            e.preventDefault()
            const rect = canvasRef.current?.getBoundingClientRect()
            if (!rect) return
            const mouseX = e.clientX - rect.left
            const mouseY = e.clientY - rect.top
            const zoomFactor = e.deltaY < 0 ? 1.1 : 1 / 1.1
            setViewTransform(vt => {
              const newScale = Math.max(0.25, Math.min(5, vt.scale * zoomFactor))
              const ratio = newScale / vt.scale
              return {
                scale: newScale,
                offsetX: mouseX - ratio * (mouseX - vt.offsetX),
                offsetY: mouseY - ratio * (mouseY - vt.offsetY),
              }
            })
          }}
          onContextMenu={(e) => {
            e.preventDefault()
            e.stopPropagation()
            openContextMenu(e)
          }}
        />

          {(() => {
            const obj = getVisibleObjectsAtTime(scene?.objects || [], currentTime)
              .find(o => o.id === selectedObjectIds[0] && o.type === 'text')
            if (!obj) return null
            const pos = getTextRotateButtonPosition(obj)
            return (
              <button
                className="text-rotate-btn"
                style={{ left: `${pos.x}px`, top: `${pos.y}px` }}
                title="Rotate +15°"
                onMouseDown={(e) => { e.preventDefault(); e.stopPropagation() }}
                onClick={(e) => {
                  e.preventDefault(); e.stopPropagation()
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
              try { markup = obj.latex ? convertLatexToMarkup(obj.latex) : '' } catch { markup = '' }
              return (
                <div
                  key={obj.id}
                  className="latex-overlay-item"
                  style={{
                    left: `${p.x}px`, top: `${p.y}px`,
                    color, opacity,
                    transform: `translate(-50%, -50%) rotate(${-obj.rotation}deg)`,
                  }}
                >
                  {markup ? <span dangerouslySetInnerHTML={{ __html: markup }} /> : <span />}
                </div>
              )
            })}
          </div>
        </div>
      </div>

      <CanvasContextMenu
        contextMenu={contextMenu}
        selectedObjectIds={selectedObjectIds}
        onDuplicateObject={onDuplicateObject}
        onDeleteObject={onDeleteObject}
        onClose={() => setContextMenu({ open: false, x: 0, y: 0, objectId: null })}
      />

      <VertexLabelEditor
        editingVertex={editingVertex}
        setEditingVertex={setEditingVertex}
        scene={scene}
        onUpdateObject={onUpdateObject}
        manimToCanvas={manimToCanvas}
        scaleX={scaleX}
      />
    </div>
  )
}

export default Canvas
