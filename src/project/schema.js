/** @typedef {import('../types').Project} Project */
/** @typedef {import('../types').Scene} Scene */
/** @typedef {import('../types').SceneObject} SceneObject */

// Project schema version
export const SCHEMA_VERSION = '1.0.0'

/**
 * Create an empty project with one default scene.
 * @returns {Project}
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
 * Create an empty scene.
 * @param {string} [name]
 * @returns {Scene}
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
 * Create a demo scene showcasing composable graph tools.
 * @returns {Scene}
 */
export function createDemoScene() {
  const sceneId = crypto.randomUUID()
  
  // Create axes
  const axesId = crypto.randomUUID()
  const axes = {
    id: axesId,
    type: 'axes',
    x: 0,
    y: 0,
    xRange: { min: -5, max: 5, step: 1 },
    yRange: { min: -3, max: 3, step: 1 },
    xLength: 8,
    yLength: 4,
    stroke: '#ffffff',
    strokeWidth: 2,
    showTicks: true,
    xLabel: 'x',
    yLabel: 'y',
    rotation: 0,
    opacity: 1,
    zIndex: 0,
    keyframes: [],
    runTime: 1,
    delay: 0,
    animationType: 'auto',
    exitAnimationType: 'FadeOut'
  }
  
  // Create graph
  const graphId = crypto.randomUUID()
  const graph = {
    id: graphId,
    type: 'graph',
    x: 0,
    y: 0,
    formula: 'x^2',
    xRange: { min: -5, max: 5 },
    yRange: { min: -3, max: 3 },
    stroke: '#4ade80',
    strokeWidth: 3,
    axesId: axesId,
    rotation: 0,
    opacity: 1,
    zIndex: 0,
    keyframes: [],
    runTime: 1,
    delay: 0.5,
    animationType: 'auto',
    exitAnimationType: 'FadeOut'
  }
  
  // Create graph cursor
  const cursorId = crypto.randomUUID()
  const cursor = {
    id: cursorId,
    type: 'graphCursor',
    x: 1,
    y: 1,
    x0: 1,
    graphId: graphId,
    axesId: axesId,
    showCrosshair: true,
    showDot: true,
    showLabel: false,
    labelFormat: '({x0}, {y0})',
    fill: '#e94560',
    radius: 0.08,
    opacity: 1,
    zIndex: 1,
    keyframes: [],
    runTime: 1,
    delay: 1,
    animationType: 'auto',
    exitAnimationType: 'FadeOut'
  }
  
  // Create tangent line
  const tangentId = crypto.randomUUID()
  const tangent = {
    id: tangentId,
    type: 'tangentLine',
    x: 0,
    y: 0,
    graphId: graphId,
    cursorId: cursorId,
    axesId: axesId,
    derivativeStep: 0.001,
    visibleSpan: 2,
    showSlopeLabel: true,
    slopeLabelOffset: 0.5,
    stroke: '#fbbf24',
    strokeWidth: 2,
    opacity: 1,
    zIndex: 1,
    keyframes: [],
    runTime: 1,
    delay: 1.5,
    animationType: 'auto',
    exitAnimationType: 'FadeOut'
  }
  
  // Create value label for slope
  const labelId = crypto.randomUUID()
  const label = {
    id: labelId,
    type: 'valueLabel',
    x: 2,
    y: 2.5,
    graphId: graphId,
    cursorId: cursorId,
    valueType: 'slope',
    customExpression: '',
    labelPrefix: 'm = ',
    labelSuffix: '',
    fontSize: 32,
    fill: '#ffffff',
    showBackground: true,
    backgroundFill: '#000000',
    backgroundOpacity: 0.7,
    opacity: 1,
    zIndex: 2,
    keyframes: [],
    runTime: 1,
    delay: 2,
    animationType: 'auto',
    exitAnimationType: 'FadeOut'
  }
  
  // Add a second demo: limit probe example
  const limitGraphId = crypto.randomUUID()
  const limitGraph = {
    id: limitGraphId,
    type: 'graph',
    x: 0,
    y: -2,
    formula: '(x^2 - 1)/(x - 1)',
    xRange: { min: -3, max: 3 },
    yRange: { min: -3, max: 3 },
    stroke: '#3b82f6',
    strokeWidth: 3,
    axesId: axesId,
    rotation: 0,
    opacity: 1,
    zIndex: 0,
    keyframes: [],
    runTime: 1,
    delay: 0.5,
    animationType: 'auto',
    exitAnimationType: 'FadeOut'
  }
  
  const limitCursorId = crypto.randomUUID()
  const limitCursor = {
    id: limitCursorId,
    type: 'graphCursor',
    x: 1,
    y: 0,
    x0: 0.9999, // Slightly offset to avoid division by zero, but close enough to show the limit
    graphId: limitGraphId,
    axesId: axesId,
    showCrosshair: true,
    showDot: true,
    showLabel: false,
    labelFormat: '({x0}, {y0})',
    fill: '#8b5cf6',
    radius: 0.08,
    opacity: 1,
    zIndex: 1,
    keyframes: [],
    runTime: 1,
    delay: 2.5,
    animationType: 'auto',
    exitAnimationType: 'FadeOut'
  }
  
  const limitProbeId = crypto.randomUUID()
  const limitProbe = {
    id: limitProbeId,
    type: 'limitProbe',
    x: 1,
    y: 0,
    x0: 1, // Probe approaches 1, which is fine - the function handles this
    graphId: limitGraphId,
    cursorId: limitCursorId,
    axesId: axesId,
    direction: 'both',
    deltaSchedule: [1, 0.5, 0.1, 0.01],
    showReadout: true,
    showPoints: true,
    showArrow: true,
    fill: '#3b82f6',
    radius: 0.06,
    opacity: 1,
    zIndex: 1,
    keyframes: [],
    runTime: 1,
    delay: 3,
    animationType: 'auto',
    exitAnimationType: 'FadeOut'
  }
  
  return {
    id: sceneId,
    name: 'Graph Tools Demo',
    duration: 5,
    objects: [
      axes,
      graph,
      cursor,
      tangent,
      label,
      limitGraph,
      limitCursor,
      limitProbe
    ],
    animations: []
  }
}

/**
 * Validate and migrate project data.
 * @param {object} data - Raw project JSON
 * @returns {Project}
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
    'graph',
    'graphCursor',
    'tangentLine',
    'limitProbe',
    'valueLabel',
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

