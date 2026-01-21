import { mathParser } from './mathParser'

/**
 * Shared computation helpers for graph tools
 * Used by both Canvas rendering and Manim code generation
 */

/**
 * Evaluate a function at a given x value
 * @param {string} formula - Function formula (e.g., "x^2", "sin(x)")
 * @param {number} x - X value to evaluate
 * @returns {number} Function value, or NaN if undefined
 */
export function evalAt(formula, x) {
  if (!formula || formula.trim() === '') {
    return NaN
  }
  try {
    return mathParser.evaluate(formula, x)
  } catch (error) {
    return NaN
  }
}

/**
 * Calculate numerical derivative at a point using central difference
 * @param {string} formula - Function formula
 * @param {number} x - Point to evaluate derivative
 * @param {number} h - Step size (default 0.001)
 * @returns {number} Derivative value, or NaN if undefined
 */
export function derivativeAt(formula, x, h = 0.001) {
  return mathParser.derivative(formula, x, h)
}

/**
 * Project an x value to a point on the graph
 * @param {string} formula - Function formula
 * @param {number} x - X coordinate
 * @returns {{x: number, y: number}} Point (x, f(x)), with NaN handling
 */
export function projectToGraph(formula, x) {
  const y = evalAt(formula, x)
  return { x, y }
}

/**
 * Get tangent line endpoints at a given point
 * @param {string} formula - Function formula
 * @param {number} x0 - Point on the graph
 * @param {number} visibleSpan - How far the line extends from x0 (in x units)
 * @param {number} h - Step size for derivative calculation
 * @returns {{x1: number, y1: number, x2: number, y2: number}} Line endpoints in Manim coordinates
 */
export function tangentLineAt(formula, x0, visibleSpan = 2, h = 0.001) {
  const y0 = evalAt(formula, x0)
  const slope = derivativeAt(formula, x0, h)
  
  if (isNaN(y0) || isNaN(slope) || !isFinite(y0) || !isFinite(slope)) {
    // Return a horizontal line at y0 if derivative is invalid
    return {
      x1: x0 - visibleSpan,
      y1: y0,
      x2: x0 + visibleSpan,
      y2: y0
    }
  }
  
  // Calculate endpoints: y = y0 + slope * (x - x0)
  const x1 = x0 - visibleSpan
  const y1 = y0 + slope * (x1 - x0)
  const x2 = x0 + visibleSpan
  const y2 = y0 + slope * (x2 - x0)
  
  return { x1, y1, x2, y2 }
}

/**
 * Generate sequence of points approaching x0 from left/right for limit visualization
 * @param {string} formula - Function formula
 * @param {number} x0 - Point to approach
 * @param {string} direction - 'left', 'right', or 'both'
 * @param {number[]} deltaSchedule - Sequence of deltas (distances from x0)
 * @returns {Array<{x: number, y: number, delta: number}>} Array of approach points
 */
export function limitEstimate(formula, x0, direction = 'both', deltaSchedule = [1, 0.5, 0.1, 0.01]) {
  const points = []
  
  if (direction === 'left' || direction === 'both') {
    for (const delta of deltaSchedule) {
      const x = x0 - Math.abs(delta)
      const y = evalAt(formula, x)
      if (!isNaN(y) && isFinite(y)) {
        points.push({ x, y, delta: -Math.abs(delta), direction: 'left' })
      }
    }
  }
  
  if (direction === 'right' || direction === 'both') {
    for (const delta of deltaSchedule) {
      const x = x0 + Math.abs(delta)
      const y = evalAt(formula, x)
      if (!isNaN(y) && isFinite(y)) {
        points.push({ x, y, delta: Math.abs(delta), direction: 'right' })
      }
    }
  }
  
  return points
}

/**
 * Estimate limit value by averaging left and right approach values
 * @param {string} formula - Function formula
 * @param {number} x0 - Point to approach
 * @param {number} minDelta - Minimum delta to use (default 0.0001)
 * @returns {{limit: number, leftValue: number, rightValue: number, exists: boolean}}
 */
export function estimateLimit(formula, x0, minDelta = 0.0001) {
  const leftValue = evalAt(formula, x0 - minDelta)
  const rightValue = evalAt(formula, x0 + minDelta)
  
  const leftValid = !isNaN(leftValue) && isFinite(leftValue)
  const rightValid = !isNaN(rightValue) && isFinite(rightValue)
  
  if (!leftValid && !rightValid) {
    return { limit: NaN, leftValue: NaN, rightValue: NaN, exists: false }
  }
  
  if (leftValid && rightValid) {
    const diff = Math.abs(leftValue - rightValue)
    const exists = diff < 0.01 // Limit exists if values are very close
    return {
      limit: exists ? (leftValue + rightValue) / 2 : NaN,
      leftValue,
      rightValue,
      exists
    }
  }
  
  // Only one side exists
  return {
    limit: leftValid ? leftValue : rightValue,
    leftValue,
    rightValue,
    exists: false
  }
}

/**
 * Clamp x value to graph range
 * @param {number} x - X value to clamp
 * @param {{min: number, max: number}} xRange - Graph x range
 * @returns {number} Clamped x value
 */
export function clampToGraphRange(x, xRange) {
  if (!xRange) return x
  return Math.max(xRange.min || -5, Math.min(xRange.max || 5, x))
}

/**
 * Get graph object from scene by ID
 * @param {Array} objects - Scene objects
 * @param {string} graphId - Graph object ID
 * @returns {Object|null} Graph object or null
 */
export function getGraphById(objects, graphId) {
  if (!graphId || !objects) return null
  return objects.find(obj => obj.id === graphId && obj.type === 'graph') || null
}

/**
 * Get graph cursor object from scene by ID
 * @param {Array} objects - Scene objects
 * @param {string} cursorId - Cursor object ID
 * @returns {Object|null} Cursor object or null
 */
export function getCursorById(objects, cursorId) {
  if (!cursorId || !objects) return null
  return objects.find(obj => obj.id === cursorId && obj.type === 'graphCursor') || null
}

