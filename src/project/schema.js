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
  data.scenes = data.scenes.map(scene => ({
    id: scene.id || crypto.randomUUID(),
    name: scene.name || 'Untitled Scene',
    duration: scene.duration || 5,
    objects: Array.isArray(scene.objects) ? scene.objects : [],
    animations: Array.isArray(scene.animations) ? scene.animations : []
  }))
  
  return data
}

