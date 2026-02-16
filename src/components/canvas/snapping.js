/**
 * Snap position logic: grid snapping, axis snapping, and shape-to-shape snapping.
 *
 * Extracted from Canvas.jsx to keep the component manageable.
 */

import {
  SNAP_THRESHOLD, SHAPE_SNAP_THRESHOLD,
  snapToGrid, hypot, closestPointOnSegment,
  getSnapGeometry, getVisibleObjectsAtTime,
} from './constants'

/**
 * Snap a Manim coordinate to grid, axes, and nearby object geometry.
 *
 * @param {number} x - Raw Manim x
 * @param {number} y - Raw Manim y
 * @param {boolean} snapEnabled - Whether snapping is on
 * @param {Array} objects - All scene objects
 * @param {number} currentTime - Current playback time
 * @param {string|null} excludeId - Object ID to exclude from snap targets
 * @returns {{ x: number, y: number }}
 */
export function snapPosition(x, y, snapEnabled, objects, currentTime, excludeId = null) {
  if (!snapEnabled) {
    return {
      x: parseFloat(x.toFixed(2)),
      y: parseFloat(y.toFixed(2)),
    }
  }

  const baseX = x
  const baseY = y
  let snappedX = x
  let snappedY = y

  // Snap to grid (0.5 units)
  const gridX = snapToGrid(x)
  const gridY = snapToGrid(y)

  if (Math.abs(x - gridX) < SNAP_THRESHOLD) snappedX = gridX
  if (Math.abs(y - gridY) < SNAP_THRESHOLD) snappedY = gridY

  // Snap to origin axes (strongest snap)
  if (Math.abs(snappedX) < SNAP_THRESHOLD * 1.5) snappedX = 0
  if (Math.abs(snappedY) < SNAP_THRESHOLD * 1.5) snappedY = 0

  // Snap to other shapes
  const visible = getVisibleObjectsAtTime(objects || [], currentTime)
  const others = visible.filter(o => o.id !== excludeId)
  if (others.length > 0) {
    let best = { dist: Infinity, x: baseX, y: baseY }

    for (const obj of others) {
      const { points, segments } = getSnapGeometry(obj)

      for (const p of points) {
        const d = hypot(baseX - p.x, baseY - p.y)
        if (d < best.dist) best = { dist: d, x: p.x, y: p.y }
      }

      for (const s of segments) {
        const cp = closestPointOnSegment(baseX, baseY, s.ax, s.ay, s.bx, s.by)
        const d = hypot(baseX - cp.x, baseY - cp.y)
        if (d < best.dist) best = { dist: d, x: cp.x, y: cp.y }
      }

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
    y: parseFloat(snappedY.toFixed(2)),
  }
}
