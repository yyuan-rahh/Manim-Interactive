/**
 * Object labeling utilities for consistent naming across UI
 */

/**
 * Generate a human-readable name for an object
 * @param {Object} obj - Object with type and optional name
 * @param {Array} existingObjects - Array of existing objects to avoid duplicates
 * @returns {string} Display name
 */
export function getObjectDisplayName(obj, existingObjects = []) {
  if (!obj) return 'Unknown'
  
  // Use explicit name if set
  if (obj.name && obj.name.trim()) {
    return obj.name.trim()
  }
  
  // Derive name from type
  return getObjectTypeDisplayName(obj.type)
}

/**
 * Get display name for an object type
 * @param {string} type - Object type
 * @returns {string} Type display name
 */
export function getObjectTypeDisplayName(type) {
  const typeNames = {
    rectangle: 'Rectangle',
    triangle: 'Triangle',
    circle: 'Circle',
    line: 'Line',
    arc: 'Arc',
    arrow: 'Arrow',
    dot: 'Dot',
    polygon: 'Polygon',
    text: 'Text',
    latex: 'LaTeX',
    axes: 'Axes',
    graph: 'Graph',
    graphCursor: 'Graph Cursor',
    tangentLine: 'Tangent Line',
    limitProbe: 'Limit Probe',
    valueLabel: 'Value Label',
  }
  
  return typeNames[type] || type || 'Object'
}

/**
 * Generate a unique name for a new object
 * @param {Object} obj - New object
 * @param {Array} existingObjects - Array of existing objects to avoid duplicates
 * @returns {string} Unique name (e.g., "Graph 1", "Graph Cursor 2")
 */
export function generateObjectName(obj, existingObjects = []) {
  if (!obj || !obj.type) return 'Object'
  
  const baseName = getObjectTypeDisplayName(obj.type)
  
  // Count existing objects of the same type
  const sameType = existingObjects.filter(o => o.type === obj.type)
  const nextNumber = sameType.length + 1
  
  return `${baseName} ${nextNumber}`
}

/**
 * Get a summary/description for an object (for dropdowns, tooltips)
 * @param {Object} obj - Object
 * @returns {string} Summary string
 */
export function getObjectSummary(obj) {
  if (!obj) return ''
  
  switch (obj.type) {
    case 'graph':
      return obj.formula ? `f(x) = ${obj.formula}` : 'f(x)'
    case 'graphCursor':
      return obj.x0 !== undefined ? `at x = ${obj.x0.toFixed(2)}` : 'unlinked'
    case 'tangentLine':
      if (obj.cursorId) return 'linked to cursor'
      if (obj.graphId) return `at x = ${(obj.x0 || 0).toFixed(2)}`
      return 'unlinked'
    case 'limitProbe':
      return obj.x0 !== undefined ? `approaching x = ${obj.x0.toFixed(2)}` : 'unlinked'
    case 'valueLabel':
      return obj.valueType || 'label'
    case 'axes':
      return `(${obj.x.toFixed(1)}, ${obj.y.toFixed(1)})`
    case 'text':
      return obj.text ? `"${obj.text.substring(0, 20)}${obj.text.length > 20 ? '...' : ''}"` : 'text'
    case 'latex':
      return obj.latex ? `$\\LaTeX$` : 'formula'
    default:
      return obj.type || ''
  }
}

/**
 * Get full label for dropdowns: "Name (Summary)"
 * @param {Object} obj - Object
 * @param {Array} existingObjects - Array of existing objects (for name generation)
 * @returns {string} Full label
 */
export function getObjectFullLabel(obj, existingObjects = []) {
  if (!obj) return ''
  
  const name = getObjectDisplayName(obj, existingObjects)
  const summary = getObjectSummary(obj)
  
  if (summary) {
    return `${name} (${summary})`
  }
  
  return name
}

