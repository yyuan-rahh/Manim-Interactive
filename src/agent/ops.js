/**
 * Agent operations format + application logic.
 *
 * Philosophy:
 * - Agent outputs small "ops" (patches) against the existing project schema
 * - We validate + apply ops defensively
 * - Undo/redo is handled by the App-level history snapshotting
 */

/** @typedef {import('../types').AgentOp} AgentOp */
/** @typedef {import('../types').SceneObject} SceneObject */
/** @typedef {import('../types').Project} Project */

import { validateProject } from '../project/schema'
 
const ALLOWED_OP_TYPES = new Set([
  'addObject',
  'updateObject',
  'deleteObject',
  'addKeyframe',
  'setSceneDuration',
  'renameScene',
  'addScene',
  'deleteScene',
])

// ── Property normalization ──────────────────────────────────────────
// LLMs often return Manim-style property names (fillColor, strokeColor)
// but the canvas renderer expects (fill, stroke). This maps common
// mistakes to the correct property names.

const CSS_COLOR_MAP = {
  red: '#ef4444', blue: '#3b82f6', green: '#22c55e', yellow: '#eab308',
  orange: '#f97316', purple: '#a855f7', pink: '#ec4899', white: '#ffffff',
  black: '#000000', cyan: '#06b6d4', magenta: '#d946ef', lime: '#84cc16',
  teal: '#14b8a6', indigo: '#6366f1', violet: '#8b5cf6', gray: '#6b7280',
  grey: '#6b7280', gold: '#ca8a04', silver: '#a8a29e', navy: '#1e3a5f',
  maroon: '#7f1d1d', aqua: '#06b6d4', coral: '#f87171', salmon: '#fb923c',
}

function normalizeColor(val) {
  if (typeof val !== 'string') return val
  const lower = val.trim().toLowerCase()
  return CSS_COLOR_MAP[lower] || val
}

/**
 * Normalise LLM-generated object properties to the canvas schema.
 * @param {Partial<SceneObject>} obj
 * @returns {Partial<SceneObject>}
 */
export function normalizeObjectProps(obj) {
  if (!obj || typeof obj !== 'object') return obj
  const out = { ...obj }

  // Map alternate property names
  if (out.fillColor !== undefined && out.fill === undefined) {
    out.fill = out.fillColor; delete out.fillColor
  }
  if (out.color !== undefined && out.fill === undefined) {
    out.fill = out.color; delete out.color
  }
  if (out.strokeColor !== undefined && out.stroke === undefined) {
    out.stroke = out.strokeColor; delete out.strokeColor
  }
  if (out.borderColor !== undefined && out.stroke === undefined) {
    out.stroke = out.borderColor; delete out.borderColor
  }
  if (out.fillOpacity !== undefined && out.opacity === undefined) {
    out.opacity = out.fillOpacity; delete out.fillOpacity
  }
  if (out.strokeOpacity !== undefined) { delete out.strokeOpacity }

  // Normalize CSS named colors to hex
  if (typeof out.fill === 'string') out.fill = normalizeColor(out.fill)
  if (typeof out.stroke === 'string') out.stroke = normalizeColor(out.stroke)

  return out
}
 
/**
 * Apply an array of agent operations to a project, returning a new project.
 *
 * @param {Project} project
 * @param {AgentOp[]} ops
 * @param {{ defaultSceneId?: string }} [options]
 * @returns {{ project: Project, warnings: string[] }}
 */
export function applyAgentOps(project, ops, { defaultSceneId } = {}) {
  const warnings = []
  const next = structuredClone(project)
 
  if (!Array.isArray(ops)) {
    return { project: next, warnings: ['Ops must be an array'] }
  }
 
  const getScene = (sceneId) => next.scenes?.find(s => s.id === sceneId)
  const resolveSceneId = (sceneId) => sceneId || defaultSceneId || next.scenes?.[0]?.id
 
  // Map snake_case op types to camelCase (LLMs sometimes use add_object instead of addObject)
  const SNAKE_TO_CAMEL = {
    add_object: 'addObject', update_object: 'updateObject', delete_object: 'deleteObject',
    add_keyframe: 'addKeyframe', set_scene_duration: 'setSceneDuration',
    rename_scene: 'renameScene', add_scene: 'addScene', delete_scene: 'deleteScene',
  }

  for (const rawOp of ops) {
    const op = rawOp && typeof rawOp === 'object' ? { ...rawOp } : null
    if (!op) { warnings.push(`Skipped invalid op: ${JSON.stringify(rawOp)}`); continue }
    
    // Normalize snake_case to camelCase
    if (op.type && SNAKE_TO_CAMEL[op.type]) op.type = SNAKE_TO_CAMEL[op.type]
    
    if (!ALLOWED_OP_TYPES.has(op.type)) {
      warnings.push(`Skipped invalid op: ${JSON.stringify(rawOp)}`)
      continue
    }
 
    try {
      switch (op.type) {
        case 'addScene': {
          const name = typeof op.name === 'string' && op.name.trim() ? op.name.trim() : `Scene ${next.scenes.length + 1}`
          const newScene = {
            id: crypto.randomUUID(),
            name,
            duration: typeof op.duration === 'number' && isFinite(op.duration) ? op.duration : 5,
            objects: [],
            animations: [],
          }
          next.scenes.push(newScene)
          break
        }
 
        case 'deleteScene': {
          const sceneId = op.sceneId
          if (!sceneId) break
          if ((next.scenes?.length || 0) <= 1) break
          next.scenes = next.scenes.filter(s => s.id !== sceneId)
          break
        }
 
        case 'renameScene': {
          const sceneId = op.sceneId
          const name = typeof op.name === 'string' ? op.name : null
          if (!sceneId || !name) break
          const scene = getScene(sceneId)
          if (!scene) break
          scene.name = name
          break
        }
 
        case 'setSceneDuration': {
          const sceneId = resolveSceneId(op.sceneId)
          const scene = sceneId ? getScene(sceneId) : null
          if (!scene) break
          const duration = Number(op.duration)
          if (!isFinite(duration) || duration <= 0) break
          scene.duration = duration
          break
        }
 
        case 'addObject': {
          const sceneId = resolveSceneId(op.sceneId)
          const scene = sceneId ? getScene(sceneId) : null
          if (!scene) break

          let obj = op.object && typeof op.object === 'object' ? structuredClone(op.object) : null
          if (!obj || typeof obj.type !== 'string') break

          obj = normalizeObjectProps(obj)

          // ── Ensure required base properties exist ──
          // Without these, the canvas won't render and codegen won't produce valid code.
          if (!obj.id) obj.id = crypto.randomUUID()
          if (obj.name === undefined) {
            const typeLabel = obj.type.charAt(0).toUpperCase() + obj.type.slice(1)
            const existing = scene.objects || []
            const count = existing.filter(o => o.type === obj.type).length
            obj.name = `${typeLabel} ${count + 1}`
          }
          if (obj.x === undefined) obj.x = 0
          if (obj.y === undefined) obj.y = 0
          if (obj.rotation === undefined) obj.rotation = 0
          if (obj.opacity === undefined) obj.opacity = 1
          if (obj.zIndex === undefined) obj.zIndex = 0
          if (!Array.isArray(obj.keyframes)) obj.keyframes = []
          if (obj.runTime === undefined) obj.runTime = 1
          if (obj.delay === undefined) obj.delay = 0
          if (obj.animationType === undefined) obj.animationType = 'auto'
          if (obj.exitAnimationType === undefined) obj.exitAnimationType = 'FadeOut'

          // Clamp timing values to valid ranges
          if (typeof obj.delay === 'number') obj.delay = Math.max(0, obj.delay)
          if (typeof obj.runTime === 'number') obj.runTime = Math.max(0.1, obj.runTime)

          // Type-specific defaults
          switch (obj.type) {
            case 'circle':
            case 'dot':
              if (obj.radius === undefined) obj.radius = obj.type === 'dot' ? 0.1 : 1
              break
            case 'rectangle':
              if (obj.width === undefined) obj.width = 2
              if (obj.height === undefined) obj.height = 1
              break
            case 'line':
            case 'arrow':
              if (obj.x2 === undefined) obj.x2 = (obj.x || 0) + 2
              if (obj.y2 === undefined) obj.y2 = obj.y || 0
              if (!obj.stroke) obj.stroke = obj.type === 'arrow' ? '#fbbf24' : '#ffffff'
              if (obj.strokeWidth === undefined) obj.strokeWidth = 3
              break
            case 'text':
              if (!obj.text) obj.text = 'Text'
              if (obj.fontSize === undefined) obj.fontSize = 48
              if (obj.width === undefined) obj.width = 2
              if (obj.height === undefined) obj.height = 0.8
              break
            case 'latex':
              if (!obj.latex) obj.latex = 'x'
              break
            case 'triangle':
              if (!obj.vertices) obj.vertices = [{ x: 0, y: 1 }, { x: -0.866, y: -0.5 }, { x: 0.866, y: -0.5 }]
              break
            case 'axes':
              if (!obj.xRange) obj.xRange = { min: -5, max: 5, step: 1 }
              if (!obj.yRange) obj.yRange = { min: -3, max: 3, step: 1 }
              if (obj.xLength === undefined) obj.xLength = 8
              if (obj.yLength === undefined) obj.yLength = 4
              if (obj.showTicks === undefined) obj.showTicks = true
              if (obj.xLabel === undefined) obj.xLabel = 'x'
              if (obj.yLabel === undefined) obj.yLabel = 'y'
              if (!obj.stroke) obj.stroke = '#ffffff'
              if (obj.strokeWidth === undefined) obj.strokeWidth = 2
              break
            case 'graph':
              if (obj.formula === undefined) obj.formula = 'x^2'
              if (!obj.xRange) obj.xRange = { min: -5, max: 5 }
              if (!obj.yRange) obj.yRange = { min: -5, max: 5 }
              if (!obj.stroke) obj.stroke = '#3b82f6'
              if (obj.strokeWidth === undefined) obj.strokeWidth = 2
              break
            case 'graphCursor':
              if (obj.x0 === undefined) obj.x0 = 0
              if (!obj.fill) obj.fill = '#ef4444'
              if (obj.radius === undefined) obj.radius = 0.08
              if (obj.showDot === undefined) obj.showDot = true
              if (obj.showCrosshair === undefined) obj.showCrosshair = false
              if (obj.showLabel === undefined) obj.showLabel = false
              break
            case 'tangentLine':
              if (obj.x0 === undefined) obj.x0 = 0
              if (obj.derivativeStep === undefined) obj.derivativeStep = 0.001
              if (obj.visibleSpan === undefined) obj.visibleSpan = 2
              if (!obj.stroke) obj.stroke = '#eab308'
              if (obj.strokeWidth === undefined) obj.strokeWidth = 2
              break
            case 'limitProbe':
              if (obj.x0 === undefined) obj.x0 = 0
              if (obj.direction === undefined) obj.direction = 'both'
              if (!obj.deltaSchedule) obj.deltaSchedule = [1, 0.5, 0.1, 0.01]
              if (!obj.fill) obj.fill = '#22c55e'
              if (obj.radius === undefined) obj.radius = 0.06
              break
            case 'valueLabel':
              if (obj.valueType === undefined) obj.valueType = 'slope'
              if (obj.fontSize === undefined) obj.fontSize = 24
              if (!obj.fill) obj.fill = '#ffffff'
              if (obj.showBackground === undefined) obj.showBackground = true
              if (obj.backgroundFill === undefined) obj.backgroundFill = '#000000'
              if (obj.backgroundOpacity === undefined) obj.backgroundOpacity = 0.6
              break
            case 'polygon':
              if (!obj.vertices && !obj.sides) obj.sides = 6
              if (!obj.vertices && obj.sides) {
                const r = obj.radius || 1
                const n = obj.sides
                obj.vertices = Array.from({ length: n }, (_, i) => ({
                  x: r * Math.cos((2 * Math.PI * i) / n - Math.PI / 2),
                  y: r * Math.sin((2 * Math.PI * i) / n - Math.PI / 2),
                }))
              }
              break
            case 'arc':
              if (obj.x2 === undefined) obj.x2 = (obj.x || 0) + 2
              if (obj.y2 === undefined) obj.y2 = obj.y || 0
              if (obj.cx === undefined) obj.cx = (obj.x || 0) + 1
              if (obj.cy === undefined) obj.cy = (obj.y || 0) + 1
              if (!obj.stroke) obj.stroke = '#ffffff'
              if (obj.strokeWidth === undefined) obj.strokeWidth = 2
              break
          }

          // Default stroke for shapes if not set
          if (['circle', 'rectangle', 'triangle', 'polygon'].includes(obj.type)) {
            if (!obj.stroke) obj.stroke = '#ffffff'
            if (obj.strokeWidth === undefined) obj.strokeWidth = 2
          }

          scene.objects = Array.isArray(scene.objects) ? scene.objects : []
          scene.objects.push(obj)
          break
        }
 
        case 'updateObject': {
          const sceneId = resolveSceneId(op.sceneId)
          const scene = sceneId ? getScene(sceneId) : null
          if (!scene) break
          const objectId = op.objectId
          const rawUpdates = op.updates && typeof op.updates === 'object' ? op.updates : null
          if (!objectId || !rawUpdates) break
          const updates = normalizeObjectProps(rawUpdates)
          scene.objects = Array.isArray(scene.objects) ? scene.objects : []
          scene.objects = scene.objects.map(o => (o?.id === objectId ? { ...o, ...updates } : o))
          break
        }
 
        case 'deleteObject': {
          const sceneId = resolveSceneId(op.sceneId)
          const scene = sceneId ? getScene(sceneId) : null
          if (!scene) break
          const objectId = op.objectId
          if (!objectId) break
          scene.objects = Array.isArray(scene.objects) ? scene.objects : []
          scene.objects = scene.objects.filter(o => o?.id !== objectId)
          break
        }
 
        case 'addKeyframe': {
          const sceneId = resolveSceneId(op.sceneId)
          const scene = sceneId ? getScene(sceneId) : null
          if (!scene) break
          const objectId = op.objectId
          const time = Number(op.time)
          const property = op.property
          const value = op.value
          if (!objectId || !isFinite(time) || time < 0 || typeof property !== 'string') break
 
          const idx = (scene.objects || []).findIndex(o => o?.id === objectId)
          if (idx < 0) break
          const obj = scene.objects[idx]
          const keyframes = Array.isArray(obj.keyframes) ? obj.keyframes : []
          const nextKfs = [
            ...keyframes.filter(k => !(k?.time === time && k?.property === property)),
            { time, property, value },
          ].sort((a, b) => a.time - b.time)
          scene.objects[idx] = { ...obj, keyframes: nextKfs }
          break
        }
      }
    } catch (e) {
      warnings.push(`Op failed (${op.type}): ${e?.message || String(e)}`)
    }
  }
 
  // Normalize / drop invalid types / fix dangling links (existing behavior)
  let validated = next
  try {
    validated = validateProject(validated)
  } catch (e) {
    warnings.push(`Project validation failed after ops: ${e?.message || String(e)}`)
  }
 
  return { project: validated, warnings }
}
 
