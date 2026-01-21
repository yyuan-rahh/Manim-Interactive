/**
 * Linking utilities for composable graph tools
 */

/**
 * Check if an object needs links (is missing required links)
 * @param {Object} obj - Object to check
 * @returns {Object} { needsLink: boolean, missingLinks: Array<string>, eligibleTargets: Array<string> }
 */
export function getLinkingStatus(obj) {
  if (!obj) return { needsLink: false, missingLinks: [], eligibleTargets: [] }
  
  const missingLinks = []
  const eligibleTargets = []
  
  switch (obj.type) {
    case 'graphCursor':
      if (!obj.graphId) {
        missingLinks.push('graphId')
        eligibleTargets.push('graph')
      }
      break
      
    case 'tangentLine':
      if (!obj.cursorId && !obj.graphId) {
        missingLinks.push('cursorId', 'graphId')
        eligibleTargets.push('graphCursor', 'graph')
      } else if (!obj.cursorId) {
        missingLinks.push('cursorId')
        eligibleTargets.push('graphCursor')
      }
      break
      
    case 'limitProbe':
      if (!obj.graphId) {
        missingLinks.push('graphId')
        eligibleTargets.push('graph', 'graphCursor')
      }
      if (!obj.cursorId && obj.graphId) {
        missingLinks.push('cursorId')
        eligibleTargets.push('graphCursor')
      }
      break
      
    case 'valueLabel':
      // Optional links, but helpful context
      if (!obj.graphId && !obj.cursorId) {
        eligibleTargets.push('graph', 'graphCursor')
      } else if (obj.graphId && !obj.cursorId && obj.valueType === 'slope') {
        eligibleTargets.push('graphCursor')
      }
      break
      
    default:
      return { needsLink: false, missingLinks: [], eligibleTargets: [] }
  }
  
  return {
    needsLink: missingLinks.length > 0,
    missingLinks,
    eligibleTargets
  }
}

/**
 * Check if a target object is eligible for linking to source object
 * @param {Object} source - Source object (the one being linked)
 * @param {Object} target - Target object (potential link target)
 * @param {string} linkType - Type of link ('graphId', 'cursorId', 'axesId')
 * @returns {boolean} Whether target is eligible
 */
export function isEligibleLinkTarget(source, target, linkType) {
  if (!source || !target || !linkType) return false
  
  // Can't link to self
  if (source.id === target.id) return false
  
  switch (linkType) {
    case 'graphId':
      return target.type === 'graph'
    case 'cursorId':
      return target.type === 'graphCursor'
    case 'axesId':
      return target.type === 'axes'
    default:
      return false
  }
}

/**
 * Get the best link type for a source -> target pair
 * @param {Object} source - Source object
 * @param {Object} target - Target object
 * @returns {string|null} Link type ('graphId', 'cursorId', 'axesId') or null
 */
export function getBestLinkType(source, target) {
  if (!source || !target) return null
  
  // For tangent line: prefer cursorId, but accept graphId
  if (source.type === 'tangentLine') {
    if (target.type === 'graphCursor') return 'cursorId'
    if (target.type === 'graph') return 'graphId'
  }
  
  // For limit probe: prefer cursorId if it has a graph, otherwise graphId
  if (source.type === 'limitProbe') {
    if (target.type === 'graphCursor') return 'cursorId'
    if (target.type === 'graph') return 'graphId'
  }
  
  // For graph cursor: must be graphId
  if (source.type === 'graphCursor' && target.type === 'graph') {
    return 'graphId'
  }
  
  // For value label: can link to graph or cursor
  if (source.type === 'valueLabel') {
    if (target.type === 'graphCursor') return 'cursorId'
    if (target.type === 'graph') return 'graphId'
  }
  
  return null
}

/**
 * Generate link updates when linking source to target
 * @param {Object} source - Source object
 * @param {Object} target - Target object
 * @returns {Object} Object with link updates
 */
export function generateLinkUpdates(source, target) {
  if (!source || !target) return {}
  
  const linkType = getBestLinkType(source, target)
  if (!linkType) return {}
  
  const updates = { [linkType]: target.id }
  
  // Auto-inherit graphId from cursor if linking tangentLine to cursor
  if (source.type === 'tangentLine' && linkType === 'cursorId' && target.graphId) {
    if (!source.graphId) {
      updates.graphId = target.graphId
    }
  }
  
  // Auto-inherit axesId from graph if available
  if ((linkType === 'graphId' || linkType === 'cursorId') && target.axesId) {
    if (!source.axesId) {
      updates.axesId = target.axesId
    }
  }
  
  return updates
}

