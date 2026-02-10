/**
 * Agent operations format + application logic.
 *
 * Philosophy:
 * - Agent outputs small "ops" (patches) against the existing project schema
 * - We validate + apply ops defensively
 * - Undo/redo is handled by the App-level history snapshotting
 */
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
 
export function applyAgentOps(project, ops, { defaultSceneId } = {}) {
  const warnings = []
  const next = structuredClone(project)
 
  if (!Array.isArray(ops)) {
    return { project: next, warnings: ['Ops must be an array'] }
  }
 
  const getScene = (sceneId) => next.scenes?.find(s => s.id === sceneId)
  const resolveSceneId = (sceneId) => sceneId || defaultSceneId || next.scenes?.[0]?.id
 
  for (const rawOp of ops) {
    const op = rawOp && typeof rawOp === 'object' ? rawOp : null
    if (!op || !ALLOWED_OP_TYPES.has(op.type)) {
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
          if (!obj.id) obj.id = crypto.randomUUID()
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
 
