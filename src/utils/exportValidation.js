/**
 * Export validation utilities for sanity checks before rendering
 */

import { getLinkingStatus } from './linking'
import { evalAt } from './graphTools'
import { mathParser } from './mathParser'

/**
 * Validate scene before export
 * @param {Object} scene - Scene object
 * @returns {Array<{level: string, message: string, objectId?: string}>} Array of issues
 */
export function validateScene(scene) {
  const issues = []
  
  if (!scene || !scene.objects || scene.objects.length === 0) {
    issues.push({ level: 'warning', message: 'Scene is empty - nothing to render' })
    return issues
  }
  
  try {
  // Check for missing links in tool objects
  scene.objects.forEach(obj => {
    let linkingStatus
    try {
      linkingStatus = getLinkingStatus(obj)
    } catch (e) {
      return
    }
    
    if (linkingStatus.needsLink) {
      const missingLinks = linkingStatus.missingLinks.join(', ')
      issues.push({
        level: 'error',
        message: `${obj.name || obj.type} is missing required links: ${missingLinks}`,
        objectId: obj.id
      })
    }
    
    // Check for potential undefined evaluations
    if (obj.type === 'graphCursor' && obj.graphId) {
      try {
        const graph = scene.objects.find(o => o.id === obj.graphId)
        if (graph && graph.formula && obj.x0 !== undefined) {
          const y = evalAt(graph.formula, obj.x0)
          if (isNaN(y) || !isFinite(y)) {
            issues.push({
              level: 'warning',
              message: `${obj.name || 'Graph Cursor'} may be at an undefined point (x = ${obj.x0})`,
              objectId: obj.id
            })
          }
        }
      } catch (e) {
        /* ignore */
      }
    }
    
    // Check for invalid formulas
    if (obj.type === 'graph' && obj.formula) {
      try {
        const validation = mathParser.validate(obj.formula)
        if (!validation.valid) {
          issues.push({
            level: 'error',
            message: `Graph "${obj.name || 'unnamed'}" has invalid formula: ${validation.error}`,
            objectId: obj.id
          })
        }
      } catch (e) {
        /* ignore */
      }
    }
  })
  } catch (e) {
    /* avoid validation crashing the app */
  }
  
  return issues
}

/**
 * Get summary of validation issues
 * @param {Array} issues - Array of issues from validateScene
 * @returns {Object} Summary with errorCount, warningCount, topIssue
 */
export function getValidationSummary(issues) {
  const errors = issues.filter(i => i.level === 'error')
  const warnings = issues.filter(i => i.level === 'warning')
  
  return {
    errorCount: errors.length,
    warningCount: warnings.length,
    topIssue: issues.length > 0 ? issues[0] : null,
    allIssues: issues
  }
}

