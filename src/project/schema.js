// Project schema version
export const SCHEMA_VERSION = '1.0.0'

/**
 * Create an empty project with one default scene
 */
export function createEmptyProject() {
  return {
    version: SCHEMA_VERSION,
    name: 'Untitled Project',
    settings: {
      width: 1920,
      height: 1080,
      fps: 30,
      backgroundColor: '#1a1a2e'
    },
    scenes: [createEmptyScene('Scene 1')]
  }
}

/**
 * Create an empty scene
 */
export function createEmptyScene(name = 'New Scene') {
  return {
    id: crypto.randomUUID(),
    name,
    duration: 5, // seconds
    objects: [],
    animations: []
  }
}

/**
 * Validate and migrate project data
 */
export function validateProject(data) {
  if (!data || typeof data !== 'object') {
    throw new Error('Invalid project data')
  }
  
  // Ensure required fields
  if (!data.version) data.version = SCHEMA_VERSION
  if (!data.scenes || !Array.isArray(data.scenes)) {
    data.scenes = [createEmptyScene('Scene 1')]
  }
  if (!data.settings) {
    data.settings = {
      width: 1920,
      height: 1080,
      fps: 30,
      backgroundColor: '#1a1a2e'
    }
  }
  
  // Ensure each scene has required fields
  const allowedTypes = new Set([
    'rectangle',
    'triangle',
    'circle',
    'line',
    'arc',
    'arrow',
    'dot',
    'polygon',
    'text',
    'latex',
    'axes',
  ])

  data.scenes = data.scenes.map(scene => {
    const rawObjects = Array.isArray(scene.objects) ? scene.objects : []
    const objects = rawObjects.filter(o => o && allowedTypes.has(o.type))
    const idSet = new Set(objects.map(o => o.id).filter(Boolean))

    // Drop dangling transform references if their source object was removed
    const cleaned = objects.map(o => {
      if (o.transformFromId && !idSet.has(o.transformFromId)) {
        const { transformFromId, transformType, ...rest } = o
        return rest
      }
      return o
    })

    return {
      id: scene.id || crypto.randomUUID(),
      name: scene.name || 'Untitled Scene',
      duration: scene.duration || 5,
      objects: cleaned,
      animations: Array.isArray(scene.animations) ? scene.animations : []
    }
  })
  
  return data
}

