/**
 * Canvas rendering: drawObject and related helpers.
 *
 * Extracted from Canvas.jsx to keep the main component manageable.
 * All functions receive a `renderCtx` object that bundles the closure
 * values they previously captured from the component scope.
 *
 * renderCtx = {
 *   manimToCanvas, scaleX, scaleY,
 *   getObjectBounds, getTextCorners, getTextRotateHandle, getHandles,
 *   selectedObjectIds, selectedObject,
 *   HANDLE_SIZE,
 * }
 */

import { mathParser } from '../../utils/mathParser'
import { evalAt, derivativeAt, projectToGraph, tangentLineAt, limitEstimate, estimateLimit, clampToGraphRange, getGraphById, getCursorById } from '../../utils/graphTools'

/**
 * Draw a single scene object onto the canvas.
 */
export function drawObject(ctx, obj, isSelected, scene, renderCtx, options = {}) {
  const { linkModeActive = false, isEligibleTarget = false, isHoveredTarget = false } = options
  const {
    manimToCanvas, scaleX, scaleY,
    getObjectBounds, getTextCorners, getTextRotateHandle, getHandles,
    selectedObjectIds, selectedObject,
    HANDLE_SIZE,
  } = renderCtx

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
    ctx.rect(centerX - width / 2 - 10, centerY - height / 2 - 10, width + 20, height + 20)
    ctx.fill()
    ctx.restore()
  }
  ctx.rotate(-obj.rotation * Math.PI / 180)

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
      const verts = obj.vertices || [
        { x: 0, y: 1 },
        { x: -0.866, y: -0.5 },
        { x: 0.866, y: -0.5 }
      ]
      ctx.beginPath()
      verts.forEach((v, i) => {
        const px = v.x * scaleX
        const py = -v.y * scaleY
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
          const py = -v.y * scaleY
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
      break
    }
    case 'axes': {
      const xLen = (obj.xLength || 8) * scaleX
      const yLen = (obj.yLength || 4) * scaleY
      const stroke = obj.stroke || '#ffffff'
      const strokeWidth = obj.strokeWidth || 2
      ctx.strokeStyle = stroke
      ctx.lineWidth = strokeWidth

      ctx.beginPath()
      ctx.moveTo(-xLen / 2, 0)
      ctx.lineTo(xLen / 2, 0)
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(0, -yLen / 2)
      ctx.lineTo(0, yLen / 2)
      ctx.stroke()

      if (obj.showTicks) {
        ctx.strokeStyle = stroke
        ctx.lineWidth = Math.max(1, strokeWidth - 1)
        const tickPx = 6
        const stepX = obj.xRange?.step ?? 1
        const stepY = obj.yRange?.step ?? 1

        for (let mx = (obj.xRange?.min ?? -5); mx <= (obj.xRange?.max ?? 5); mx += stepX) {
          const tx = (mx / (obj.xRange?.max ?? 5)) * (xLen / 2)
          ctx.beginPath()
          ctx.moveTo(tx, -tickPx / 2)
          ctx.lineTo(tx, tickPx / 2)
          ctx.stroke()
        }
        for (let my = (obj.yRange?.min ?? -3); my <= (obj.yRange?.max ?? 3); my += stepY) {
          const ty = -(my / (obj.yRange?.max ?? 3)) * (yLen / 2)
          ctx.beginPath()
          ctx.moveTo(-tickPx / 2, ty)
          ctx.lineTo(tickPx / 2, ty)
          ctx.stroke()
        }
      }

      ctx.fillStyle = stroke
      ctx.font = '20px "Latin Modern Roman", "Computer Modern", "Times New Roman", serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'

      ctx.fillText(obj.xLabel || 'x', xLen / 2 + 20, 0)
      ctx.fillText(obj.yLabel || 'y', 0, -yLen / 2 - 20)
      break
    }

    case 'graph': {
      const stroke = obj.stroke || '#4ade80'
      const strokeWidth = obj.strokeWidth || 3
      const formula = obj.formula || 'x^2'

      const xMin = obj.xRange?.min ?? -5
      const xMax = obj.xRange?.max ?? 5
      const yMin = obj.yRange?.min ?? -3
      const yMax = obj.yRange?.max ?? 3

      let points = []
      try {
        points = mathParser.sampleFunction(formula, xMin, xMax, 200)
      } catch (_) {
        /* skip */
      }

      if (points.length > 1) {
        ctx.strokeStyle = stroke
        ctx.lineWidth = strokeWidth
        ctx.globalAlpha = obj.opacity ?? 1
        ctx.beginPath()

        let isFirstPoint = true
        points.forEach(point => {
          if (point.y < yMin || point.y > yMax) return
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
      const graph = getGraphById(scene?.objects || [], obj.graphId)
      if (!graph) break

      const formula = graph.formula || 'x^2'
      const x0 = obj.x0 ?? 0
      const graphXRange = graph.xRange || { min: -5, max: 5 }
      const clampedX0 = clampToGraphRange(x0, graphXRange)
      const point = projectToGraph(formula, clampedX0)

      const axes = obj.axesId ? scene?.objects?.find(o => o.id === obj.axesId) : null

      if (!isNaN(point.y) && isFinite(point.y)) {
        const offsetX = (axes || graph).x || 0
        const offsetY = (axes || graph).y || 0

        const canvasPoint = manimToCanvas(offsetX + point.x, offsetY + point.y)
        const radius = (obj.radius || 0.08) * scaleX
        const fill = obj.fill || '#e94560'

        ctx.globalAlpha = obj.opacity ?? 1

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

        if (obj.showDot) {
          ctx.fillStyle = fill
          ctx.beginPath()
          ctx.arc(canvasPoint.x, canvasPoint.y, radius, 0, Math.PI * 2)
          ctx.fill()
          ctx.strokeStyle = '#ffffff'
          ctx.lineWidth = 2
          ctx.stroke()
        }

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
      const graph = getGraphById(scene?.objects || [], obj.graphId)
      if (!graph) break

      const formula = graph.formula || 'x^2'
      const axes = obj.axesId ? scene?.objects?.find(o => o.id === obj.axesId) : null

      let x0 = obj.x0 ?? 0
      if (obj.cursorId) {
        const cursor = getCursorById(scene?.objects || [], obj.cursorId)
        if (cursor) x0 = cursor.x0 ?? 0
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
      const graph = getGraphById(scene?.objects || [], obj.graphId)
      if (!graph) break

      const formula = graph.formula || 'x^2'
      const axes = obj.axesId ? scene?.objects?.find(o => o.id === obj.axesId) : null

      let x0 = obj.x0 ?? 0
      if (obj.cursorId) {
        const cursor = getCursorById(scene?.objects || [], obj.cursorId)
        if (cursor) x0 = cursor.x0 ?? 0
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

        if (obj.showPoints) {
          approachPoints.forEach(point => {
            const canvasPoint = manimToCanvas(offsetX + point.x, offsetY + point.y)
            ctx.fillStyle = fill
            ctx.beginPath()
            ctx.arc(canvasPoint.x, canvasPoint.y, radius, 0, Math.PI * 2)
            ctx.fill()
          })
        }

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
                const arrowLen = Math.min(len * 0.8, 30)
                const arrowX = startPoint.x + (dx / len) * arrowLen
                const arrowY = startPoint.y + (dy / len) * arrowLen
                ctx.lineTo(arrowX, arrowY)
                ctx.stroke()

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

        if (obj.showBackground) {
          ctx.fillStyle = obj.backgroundFill || '#000000'
          ctx.globalAlpha = (obj.opacity ?? 1) * (obj.backgroundOpacity ?? 0.7)
          ctx.fillRect(canvasPoint.x - 50, canvasPoint.y - 15, 100, 30)
          ctx.globalAlpha = obj.opacity ?? 1
        }

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

  // ── Vertex labels (always visible) ──
  ctx.save()
  const LABEL_OFFSET = 30

  if (obj.type === 'triangle') {
    drawVertexLabels(ctx, obj, manimToCanvas, scaleX, LABEL_OFFSET)
  } else if (obj.type === 'polygon') {
    drawVertexLabels(ctx, obj, manimToCanvas, scaleX, LABEL_OFFSET)
  } else if (obj.type === 'rectangle') {
    drawRectangleCornerLabels(ctx, obj, manimToCanvas, scaleX, LABEL_OFFSET)
  }
  ctx.restore()

  // ── Linked-target highlight ──
  if (!isSelected && selectedObjectIds.length === 1 && selectedObject) {
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

  // ── Selection outline and handles ──
  if (isSelected) {
    drawSelectionOutline(ctx, obj, pos, renderCtx)
    drawSelectionHandles(ctx, obj, renderCtx)
  }
}

// ── Internal helpers ──

function drawVertexLabels(ctx, obj, manimToCanvas, scaleX, LABEL_OFFSET) {
  const verts = obj.vertices || []
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
      const dx = vManim.x - cManim.x
      const dy = vManim.y - cManim.y
      const dist = Math.sqrt(dx * dx + dy * dy)

      if (dist > 0.01) {
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
}

function drawRectangleCornerLabels(ctx, obj, manimToCanvas, scaleX, LABEL_OFFSET) {
  const corners = [
    { x: obj.x - obj.width / 2, y: obj.y + obj.height / 2, label: obj.cornerLabels?.[0] },
    { x: obj.x + obj.width / 2, y: obj.y + obj.height / 2, label: obj.cornerLabels?.[1] },
    { x: obj.x - obj.width / 2, y: obj.y - obj.height / 2, label: obj.cornerLabels?.[2] },
    { x: obj.x + obj.width / 2, y: obj.y - obj.height / 2, label: obj.cornerLabels?.[3] },
  ]
  corners.forEach((c) => {
    if (c.label) {
      const dx = c.x - obj.x
      const dy = c.y - obj.y
      const dist = Math.sqrt(dx * dx + dy * dy)
      if (dist > 0.01) {
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

function drawSelectionOutline(ctx, obj, pos, renderCtx) {
  const { manimToCanvas, scaleX, scaleY, getObjectBounds } = renderCtx

  ctx.save()
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
      ctx.strokeRect(-w / 2 - pad, -h / 2 - pad, w + pad * 2, h + pad * 2)
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
      ctx.translate(pos.x, pos.y)
      ctx.rotate(-obj.rotation * Math.PI / 180)

      const centroid = verts.reduce(
        (acc, v) => ({ x: acc.x + v.x, y: acc.y + v.y }),
        { x: 0, y: 0 }
      )
      centroid.x /= verts.length || 1
      centroid.y /= verts.length || 1

      const localVerts = verts.map(v => ({ x: v.x * scaleX, y: -v.y * scaleY }))
      const cCanvas = { x: centroid.x * scaleX, y: -centroid.y * scaleY }
      const maxDist = Math.max(
        1e-6,
        ...localVerts.map(p => Math.hypot(p.x - cCanvas.x, p.y - cCanvas.y))
      )
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
        const scale = 1 + (pad * 2) / (scaleX * 2)
        verts.forEach((v, i) => {
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
    case 'arc':
      break
    case 'text': {
      ctx.translate(pos.x, pos.y)
      ctx.rotate(-obj.rotation * Math.PI / 180)
      const w = (obj.width || 2) * scaleX
      const h = (obj.height || 0.8) * scaleY
      ctx.strokeRect(-w / 2 - pad, -h / 2 - pad, w + pad * 2, h + pad * 2)
      break
    }
    case 'graph': {
      const bounds = getObjectBounds(obj)
      const topLeft = manimToCanvas(bounds.minX, bounds.maxY)
      const bottomRight = manimToCanvas(bounds.maxX, bounds.minY)
      ctx.strokeRect(topLeft.x - pad, topLeft.y - pad,
        bottomRight.x - topLeft.x + pad * 2,
        bottomRight.y - topLeft.y + pad * 2)
      break
    }
    default: {
      ctx.translate(pos.x, pos.y)
      ctx.rotate(-obj.rotation * Math.PI / 180)
      const bounds = getObjectBounds(obj)
      const w = (bounds.maxX - bounds.minX) * scaleX
      const h = (bounds.maxY - bounds.minY) * scaleY
      ctx.strokeRect(-w / 2 - pad, -h / 2 - pad, w + pad * 2, h + pad * 2)
    }
  }

  ctx.setLineDash([])
  ctx.restore()
}

function drawSelectionHandles(ctx, obj, renderCtx) {
  const {
    manimToCanvas, scaleX, scaleY,
    getObjectBounds, getTextCorners, getTextRotateHandle, getHandles,
    selectedObjectIds, HANDLE_SIZE,
  } = renderCtx

  if (selectedObjectIds.length !== 1) return

  ctx.save()

  if (obj.type === 'triangle' || obj.type === 'polygon') {
    ctx.fillStyle = '#4ade80'
    const verts = obj.vertices || []
    verts.forEach((v) => {
      const vPos = manimToCanvas(obj.x + v.x, obj.y + v.y)
      ctx.beginPath()
      ctx.arc(vPos.x, vPos.y, HANDLE_SIZE / 2 + 2, 0, Math.PI * 2)
      ctx.fill()
    })
  } else if (obj.type === 'rectangle') {
    ctx.fillStyle = '#4ade80'
    const corners = [
      { x: obj.x - obj.width / 2, y: obj.y + obj.height / 2 },
      { x: obj.x + obj.width / 2, y: obj.y + obj.height / 2 },
      { x: obj.x - obj.width / 2, y: obj.y - obj.height / 2 },
      { x: obj.x + obj.width / 2, y: obj.y - obj.height / 2 },
    ]
    corners.forEach((c) => {
      const cPos = manimToCanvas(c.x, c.y)
      ctx.beginPath()
      ctx.arc(cPos.x, cPos.y, HANDLE_SIZE / 2 + 2, 0, Math.PI * 2)
      ctx.fill()
    })
    ctx.fillStyle = '#60a5fa'
    const midpoints = [
      { x: obj.x, y: obj.y + obj.height / 2 },
      { x: obj.x + obj.width / 2, y: obj.y },
      { x: obj.x, y: obj.y - obj.height / 2 },
      { x: obj.x - obj.width / 2, y: obj.y },
    ]
    midpoints.forEach((m) => {
      const mPos = manimToCanvas(m.x, m.y)
      ctx.fillRect(mPos.x - HANDLE_SIZE / 2, mPos.y - HANDLE_SIZE / 2, HANDLE_SIZE, HANDLE_SIZE)
    })
    const rotOffset = (obj.height / 2) + 0.4
    const rotPos = manimToCanvas(obj.x, obj.y + rotOffset)
    ctx.fillStyle = '#e94560'
    ctx.beginPath()
    ctx.arc(rotPos.x, rotPos.y, HANDLE_SIZE / 2 + 2, 0, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = 'rgba(233, 69, 96, 0.5)'
    ctx.lineWidth = 1
    const topMid = manimToCanvas(obj.x, obj.y + obj.height / 2)
    ctx.beginPath()
    ctx.moveTo(topMid.x, topMid.y)
    ctx.lineTo(rotPos.x, rotPos.y)
    ctx.stroke()
  } else if (obj.type === 'line' || obj.type === 'arrow') {
    const start = manimToCanvas(obj.x, obj.y)
    const end = manimToCanvas(obj.x2, obj.y2)
    ctx.fillStyle = '#4ade80'
    ctx.beginPath()
    ctx.arc(start.x, start.y, HANDLE_SIZE / 2 + 2, 0, Math.PI * 2)
    ctx.fill()
    ctx.beginPath()
    ctx.arc(end.x, end.y, HANDLE_SIZE / 2 + 2, 0, Math.PI * 2)
    ctx.fill()
  } else if (obj.type === 'arc') {
    const start = manimToCanvas(obj.x, obj.y)
    const end = manimToCanvas(obj.x2, obj.y2)
    const ctrl = manimToCanvas(obj.cx, obj.cy)
    ctx.fillStyle = '#4ade80'
    ctx.beginPath()
    ctx.arc(start.x, start.y, HANDLE_SIZE / 2 + 2, 0, Math.PI * 2)
    ctx.fill()
    ctx.beginPath()
    ctx.arc(end.x, end.y, HANDLE_SIZE / 2 + 2, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#e94560'
    ctx.beginPath()
    ctx.arc(ctrl.x, ctrl.y, HANDLE_SIZE / 2 + 2, 0, Math.PI * 2)
    ctx.fill()
  } else if (obj.type === 'axes') {
    const xLen = obj.xLength || 8
    const yLen = obj.yLength || 4
    const left = manimToCanvas(obj.x - xLen / 2, obj.y)
    const right = manimToCanvas(obj.x + xLen / 2, obj.y)
    const top = manimToCanvas(obj.x, obj.y + yLen / 2)
    const bottom = manimToCanvas(obj.x, obj.y - yLen / 2)
    ctx.fillStyle = '#4ade80'
    ;[left, right, top, bottom].forEach(p => {
      ctx.beginPath()
      ctx.arc(p.x, p.y, HANDLE_SIZE / 2 + 2, 0, Math.PI * 2)
      ctx.fill()
    })
  } else if (obj.type === 'text') {
    ctx.fillStyle = '#4ade80'
    const corners = getTextCorners(obj)
    corners.forEach(c => {
      const cPos = manimToCanvas(c.x, c.y)
      ctx.beginPath()
      ctx.arc(cPos.x, cPos.y, HANDLE_SIZE / 2 + 2, 0, Math.PI * 2)
      ctx.fill()
    })
    const rot = getTextRotateHandle(obj)
    const rPos = manimToCanvas(rot.x, rot.y)
    ctx.fillStyle = '#e94560'
    ctx.beginPath()
    ctx.arc(rPos.x, rPos.y, HANDLE_SIZE / 2 + 2, 0, Math.PI * 2)
    ctx.fill()
  } else if (obj.type === 'circle' || obj.type === 'graph') {
    ctx.fillStyle = '#e94560'
    const bounds = getObjectBounds(obj)
    const topLeft = manimToCanvas(bounds.minX, bounds.maxY)
    const bottomRight = manimToCanvas(bounds.maxX, bounds.minY)
    const size = { width: bottomRight.x - topLeft.x, height: bottomRight.y - topLeft.y }
    const handles = getHandles(obj, topLeft, size)
    handles.forEach(handle => {
      ctx.fillRect(handle.x - HANDLE_SIZE / 2, handle.y - HANDLE_SIZE / 2, HANDLE_SIZE, HANDLE_SIZE)
    })
  }

  ctx.restore()
}
