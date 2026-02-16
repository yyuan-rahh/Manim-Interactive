/** @typedef {import('../types').Project} Project */
/** @typedef {import('../types').Scene} Scene */
/** @typedef {import('../types').SceneObject} SceneObject */
/** @typedef {import('../types').AgentOp} AgentOp */

import { create } from 'zustand'
import { createEmptyProject, createEmptyScene, validateProject, createDemoScene } from '../project/schema'
import { generateManimCode, sanitizeClassName } from '../codegen/generator'
import { generateObjectName } from '../utils/objectLabel'
import { applyAgentOps } from '../agent/ops'

const useProjectStore = create((set, get) => {
  const commitInternal = (actionKey, fn) => {
    const state = get()
    const now = Date.now()
    const coalesceWindowMs = 300
    const shouldPush = !(
      actionKey &&
      state._lastCommitKey === actionKey &&
      now - state._lastCommitTime < coalesceWindowMs
    )

    const snap = {
      project: state.project,
      activeSceneId: state.activeSceneId,
      selectedObjectIds: state.selectedObjectIds,
      customCode: state.customCode,
      isCustomCodeSynced: state.isCustomCodeSynced,
    }

    set((s) => {
      const updates = {}
      if (shouldPush) {
        updates.history = { past: [...s.history.past, snap], future: [] }
      } else if (s.history.future.length) {
        updates.history = { ...s.history, future: [] }
      }
      updates._lastCommitKey = actionKey
      updates._lastCommitTime = now
      return updates
    })

    fn()
  }

  const initialProject = createEmptyProject()

  return {
    // ── Core state ──
    project: initialProject,
    activeSceneId: initialProject.scenes[0]?.id,
    selectedObjectIds: [],
    currentTime: 0,
    generatedCode: '',
    customCode: '',
    isCustomCodeSynced: true,

    // ── Undo/redo ──
    history: { past: [], future: [] },
    _lastCommitKey: null,
    _lastCommitTime: 0,

    // ── Derived state helpers ──
    getActiveScene: () => {
      const { project, activeSceneId } = get()
      return project.scenes.find((s) => s.id === activeSceneId)
    },
    getSelectedObjects: () => {
      const { project, activeSceneId, selectedObjectIds } = get()
      const scene = project.scenes.find((s) => s.id === activeSceneId)
      return scene?.objects.filter((o) => selectedObjectIds.includes(o.id)) || []
    },

    // ── Setters ──
    setCurrentTime: (t) => {
      if (typeof t === 'function') {
        set((s) => ({ currentTime: t(s.currentTime) }))
      } else {
        set({ currentTime: t })
      }
    },
    setSelectedObjectIds: (ids) => {
      if (typeof ids === 'function') {
        set((s) => ({ selectedObjectIds: ids(s.selectedObjectIds) }))
      } else {
        set({ selectedObjectIds: ids })
      }
    },
    setActiveSceneId: (id) => set({ activeSceneId: id, selectedObjectIds: [] }),
    setCustomCode: (code) => set({ customCode: code }),
    setIsCustomCodeSynced: (v) => set({ isCustomCodeSynced: v }),

    // ── Regen code (call after project changes) ──
    regenerateCode: () => {
      const { project, activeSceneId, isCustomCodeSynced } = get()
      const code = generateManimCode(project, activeSceneId)
      const updates = { generatedCode: code }
      if (isCustomCodeSynced) {
        updates.customCode = code
        updates.isCustomCodeSynced = true
      }
      set(updates)
    },

    // ── Clamp time to duration ──
    clampTime: () => {
      const scene = get().getActiveScene()
      const dur = scene?.duration || 0
      set((s) => ({ currentTime: Math.max(0, Math.min(dur, s.currentTime)) }))
    },

    // ── Undo / Redo ──
    undo: () => {
      const { history } = get()
      if (!history.past.length) return
      const prev = history.past[history.past.length - 1]
      const cur = {
        project: get().project,
        activeSceneId: get().activeSceneId,
        selectedObjectIds: get().selectedObjectIds,
        customCode: get().customCode,
        isCustomCodeSynced: get().isCustomCodeSynced,
      }
      set({
        project: prev.project,
        activeSceneId: prev.activeSceneId,
        selectedObjectIds: prev.selectedObjectIds,
        customCode: prev.customCode,
        isCustomCodeSynced: prev.isCustomCodeSynced,
        history: {
          past: history.past.slice(0, -1),
          future: [cur, ...history.future],
        },
      })
    },
    redo: () => {
      const { history } = get()
      if (!history.future.length) return
      const next = history.future[0]
      const cur = {
        project: get().project,
        activeSceneId: get().activeSceneId,
        selectedObjectIds: get().selectedObjectIds,
        customCode: get().customCode,
        isCustomCodeSynced: get().isCustomCodeSynced,
      }
      set({
        project: next.project,
        activeSceneId: next.activeSceneId,
        selectedObjectIds: next.selectedObjectIds,
        customCode: next.customCode,
        isCustomCodeSynced: next.isCustomCodeSynced,
        history: {
          past: [...history.past, cur],
          future: history.future.slice(1),
        },
      })
    },

    // ── Scene management ──
    addScene: () => {
      commitInternal('scene:add', () => {
        const { project } = get()
        const newScene = createEmptyScene(`Scene ${project.scenes.length + 1}`)
        set({
          project: { ...project, scenes: [...project.scenes, newScene] },
          activeSceneId: newScene.id,
          selectedObjectIds: [],
        })
      })
    },
    deleteScene: (sceneId) => {
      const { project, activeSceneId } = get()
      if (project.scenes.length <= 1) return
      commitInternal('scene:delete', () => {
        const newScenes = project.scenes.filter((s) => s.id !== sceneId)
        const newActiveId =
          activeSceneId === sceneId
            ? newScenes[0]?.id
            : activeSceneId
        set({
          project: { ...project, scenes: newScenes },
          activeSceneId: newActiveId,
          selectedObjectIds: activeSceneId === sceneId ? [] : get().selectedObjectIds,
        })
      })
    },
    renameScene: (sceneId, newName) => {
      commitInternal(`scene:rename:${sceneId}`, () => {
        set((s) => ({
          project: {
            ...s.project,
            scenes: s.project.scenes.map((sc) =>
              sc.id === sceneId ? { ...sc, name: newName } : sc
            ),
          },
        }))
      })
    },
    reorderScenes: (fromIndex, toIndex) => {
      commitInternal('scene:reorder', () => {
        set((s) => {
          const newScenes = [...s.project.scenes]
          const [removed] = newScenes.splice(fromIndex, 1)
          newScenes.splice(toIndex, 0, removed)
          return { project: { ...s.project, scenes: newScenes } }
        })
      })
    },
    duplicateScene: (sceneId) => {
      const { project } = get()
      const scene = project.scenes.find((s) => s.id === sceneId)
      if (!scene) return
      commitInternal('scene:duplicate', () => {
        const newScene = {
          ...JSON.parse(JSON.stringify(scene)),
          id: crypto.randomUUID(),
          name: `${scene.name} (Copy)`,
        }
        set({
          project: { ...project, scenes: [...project.scenes, newScene] },
          activeSceneId: newScene.id,
          selectedObjectIds: [],
        })
      })
    },

    // ── Object management ──
    addObject: (objectType, overrides = {}) => {
      const scene = get().getActiveScene()
      if (!scene) return
      commitInternal(`obj:add:${objectType}`, () => {
        const existingObjects = scene.objects || []
        const baseObject = createObjectHelper(objectType, existingObjects)
        const newObject = { ...baseObject, ...overrides }
        if (!newObject.name) {
          newObject.name = generateObjectName(newObject, existingObjects)
        }

        if (newObject.type === 'graph' && !newObject.axesId) {
          const existingAxes = existingObjects.find((o) => o.type === 'axes')
          if (existingAxes) {
            newObject.axesId = existingAxes.id
            newObject.x = existingAxes.x
            newObject.y = existingAxes.y
          }
        }

        if (
          ['graphCursor', 'tangentLine', 'limitProbe', 'valueLabel'].includes(
            newObject.type
          )
        ) {
          if (!newObject.graphId) {
            const existingGraph = existingObjects.find((o) => o.type === 'graph')
            if (existingGraph) {
              newObject.graphId = existingGraph.id
            }
          }
        }

        set((s) => ({
          project: {
            ...s.project,
            scenes: s.project.scenes.map((sc) =>
              sc.id === s.activeSceneId
                ? { ...sc, objects: [...sc.objects, newObject] }
                : sc
            ),
          },
          selectedObjectIds: [newObject.id],
        }))
      })
    },
    updateObject: (objectId, updates) => {
      commitInternal(`obj:update:${objectId}`, () => {
        set((s) => {
          let updatedProject = {
            ...s.project,
            scenes: s.project.scenes.map((sc) =>
              sc.id === s.activeSceneId
                ? {
                    ...sc,
                    objects: sc.objects.map((o) =>
                      o.id === objectId ? { ...o, ...updates } : o
                    ),
                  }
                : sc
            ),
          }

          const activeScene = updatedProject.scenes.find(
            (sc) => sc.id === s.activeSceneId
          )
          if (activeScene) {
            const maxEndTime = Math.max(
              0,
              ...activeScene.objects.map((obj) => (obj.delay || 0) + (obj.runTime || 1))
            )
            const requiredDuration = Math.ceil(maxEndTime + 1)
            if (requiredDuration > activeScene.duration) {
              updatedProject = {
                ...updatedProject,
                scenes: updatedProject.scenes.map((sc) =>
                  sc.id === s.activeSceneId
                    ? { ...sc, duration: requiredDuration }
                    : sc
                ),
              }
            }
          }

          return { project: updatedProject }
        })
      })
    },
    deleteObject: (objectId) => {
      commitInternal(`obj:delete:${objectId}`, () => {
        set((s) => ({
          project: {
            ...s.project,
            scenes: s.project.scenes.map((sc) =>
              sc.id === s.activeSceneId
                ? { ...sc, objects: sc.objects.filter((o) => o.id !== objectId) }
                : sc
            ),
          },
          selectedObjectIds: s.selectedObjectIds.filter((id) => id !== objectId),
        }))
      })
    },
    duplicateObject: (objectId) => {
      const scene = get().getActiveScene()
      if (!scene) return
      const original = scene.objects.find((o) => o.id === objectId)
      if (!original) return
      commitInternal(`obj:duplicate:${objectId}`, () => {
        const clone = JSON.parse(JSON.stringify(original))
        clone.id = crypto.randomUUID()
        clone.name = clone.name ? `${clone.name} (Copy)` : null
        if (typeof clone.x === 'number') clone.x = parseFloat((clone.x + 0.3).toFixed(2))
        if (typeof clone.y === 'number') clone.y = parseFloat((clone.y - 0.3).toFixed(2))
        if (typeof clone.x2 === 'number') clone.x2 = parseFloat((clone.x2 + 0.3).toFixed(2))
        if (typeof clone.y2 === 'number') clone.y2 = parseFloat((clone.y2 - 0.3).toFixed(2))

        set((s) => ({
          project: {
            ...s.project,
            scenes: s.project.scenes.map((sc) =>
              sc.id === s.activeSceneId
                ? { ...sc, objects: [...sc.objects, clone] }
                : sc
            ),
          },
          selectedObjectIds: [clone.id],
        }))
      })
    },

    // ── Layer ordering ──
    bringForward: (objectId) => {
      commitInternal(`obj:z:forward:${objectId}`, () => {
        set((s) => ({
          project: {
            ...s.project,
            scenes: s.project.scenes.map((sc) => {
              if (sc.id !== s.activeSceneId) return sc
              const obj = sc.objects.find((o) => o.id === objectId)
              if (!obj) return sc
              const maxZ = Math.max(...sc.objects.map((o) => o.zIndex || 0))
              if ((obj.zIndex || 0) >= maxZ) return sc
              return {
                ...sc,
                objects: sc.objects.map((o) =>
                  o.id === objectId ? { ...o, zIndex: (o.zIndex || 0) + 1 } : o
                ),
              }
            }),
          },
        }))
      })
    },
    sendBackward: (objectId) => {
      commitInternal(`obj:z:backward:${objectId}`, () => {
        set((s) => ({
          project: {
            ...s.project,
            scenes: s.project.scenes.map((sc) => {
              if (sc.id !== s.activeSceneId) return sc
              const obj = sc.objects.find((o) => o.id === objectId)
              if (!obj) return sc
              const minZ = Math.min(...sc.objects.map((o) => o.zIndex || 0))
              if ((obj.zIndex || 0) <= minZ) return sc
              return {
                ...sc,
                objects: sc.objects.map((o) =>
                  o.id === objectId ? { ...o, zIndex: (o.zIndex || 0) - 1 } : o
                ),
              }
            }),
          },
        }))
      })
    },
    bringToFront: (objectId) => {
      commitInternal(`obj:z:front:${objectId}`, () => {
        set((s) => ({
          project: {
            ...s.project,
            scenes: s.project.scenes.map((sc) => {
              if (sc.id !== s.activeSceneId) return sc
              const maxZ = Math.max(...sc.objects.map((o) => o.zIndex || 0))
              return {
                ...sc,
                objects: sc.objects.map((o) =>
                  o.id === objectId ? { ...o, zIndex: maxZ + 1 } : o
                ),
              }
            }),
          },
        }))
      })
    },
    sendToBack: (objectId) => {
      commitInternal(`obj:z:back:${objectId}`, () => {
        set((s) => ({
          project: {
            ...s.project,
            scenes: s.project.scenes.map((sc) => {
              if (sc.id !== s.activeSceneId) return sc
              const minZ = Math.min(...sc.objects.map((o) => o.zIndex || 0))
              return {
                ...sc,
                objects: sc.objects.map((o) =>
                  o.id === objectId ? { ...o, zIndex: minZ - 1 } : o
                ),
              }
            }),
          },
        }))
      })
    },

    // ── Keyframes ──
    addKeyframe: (objectId, time, property, value) => {
      commitInternal(`kf:add:${objectId}`, () => {
        set((s) => ({
          project: {
            ...s.project,
            scenes: s.project.scenes.map((sc) =>
              sc.id === s.activeSceneId
                ? {
                    ...sc,
                    objects: sc.objects.map((o) =>
                      o.id === objectId
                        ? {
                            ...o,
                            keyframes: [
                              ...o.keyframes.filter(
                                (k) => !(k.time === time && k.property === property)
                              ),
                              { time, property, value },
                            ].sort((a, b) => a.time - b.time),
                          }
                        : o
                    ),
                  }
                : sc
            ),
          },
        }))
      })
    },

    // ── File operations ──
    loadProject: async () => {
      if (!window.electronAPI) return
      const result = await window.electronAPI.loadProject()
      if (result.success) {
        commitInternal('project:load', () => {
          const validated = validateProject(result.data)
          set({
            project: validated,
            activeSceneId: validated.scenes[0]?.id,
            selectedObjectIds: [],
            isCustomCodeSynced: true,
          })
        })
      }
    },
    saveProject: async () => {
      if (!window.electronAPI) return
      const { project } = get()
      const result = await window.electronAPI.saveProject(project)
      if (result.success) {
        console.log('Project saved to:', result.path)
      }
    },

    // ── Bulk operations ──
    clearAllObjects: () => {
      const scene = get().getActiveScene()
      if (!scene) return
      commitInternal('scene:clearAll', () => {
        set((s) => ({
          project: {
            ...s.project,
            scenes: s.project.scenes.map((sc) =>
              sc.id === s.activeSceneId ? { ...sc, objects: [] } : sc
            ),
          },
          selectedObjectIds: [],
        }))
      })
    },
    loadDemo: () => {
      commitInternal('scene:loadDemo', () => {
        const demoScene = createDemoScene()
        set((s) => ({
          project: {
            ...s.project,
            scenes: s.project.scenes.map((sc) =>
              sc.id === s.activeSceneId ? demoScene : sc
            ),
          },
          activeSceneId: demoScene.id,
          selectedObjectIds: [],
        }))
      })
    },
    deleteSelectedObjects: () => {
      const { selectedObjectIds, deleteObject } = get()
      if (!selectedObjectIds.length) return
      selectedObjectIds.forEach((id) => deleteObject(id))
    },

    // ── AI operations ──
    applyOpsFromAgent: (ops) => {
      commitInternal('ai:apply', () => {
        const s = get()
        let { project: nextProject, warnings } = applyAgentOps(
          s.project,
          ops,
          { defaultSceneId: s.activeSceneId }
        )

        const activeScene = nextProject.scenes.find(
          (sc) => sc.id === s.activeSceneId
        )
        if (activeScene) {
          const maxEndTime = Math.max(
            0,
            ...activeScene.objects.map(
              (obj) => (obj.delay || 0) + (obj.runTime || 1)
            )
          )
          const requiredDuration = Math.ceil(maxEndTime + 1)
          if (requiredDuration > activeScene.duration) {
            nextProject = {
              ...nextProject,
              scenes: nextProject.scenes.map((sc) =>
                sc.id === s.activeSceneId
                  ? { ...sc, duration: requiredDuration }
                  : sc
              ),
            }
          }
        }

        const newActiveId = nextProject.scenes.find(
          (sc) => sc.id === s.activeSceneId
        )
          ? s.activeSceneId
          : nextProject.scenes[0]?.id

        const nextActive =
          nextProject.scenes.find((sc) => sc.id === newActiveId) ||
          nextProject.scenes[0]
        const idSet = new Set((nextActive?.objects || []).map((o) => o.id))

        set({
          project: nextProject,
          activeSceneId: newActiveId,
          selectedObjectIds: s.selectedObjectIds.filter((id) => idSet.has(id)),
        })

        return warnings || []
      })
    },
    applyPythonCodeFromAgent: (pythonCode) => {
      set({
        customCode: pythonCode,
        isCustomCodeSynced: false,
      })
    },
  }
})

// Object factory — kept outside the store for cleanliness
function createObjectHelper(type, existingObjects = []) {
  const baseObject = {
    id: crypto.randomUUID(),
    type,
    name: generateObjectName({ type }, existingObjects),
    x: 0,
    y: 0,
    rotation: 0,
    opacity: 1,
    zIndex: 0,
    keyframes: [],
    runTime: 1,
    delay: 0,
    animationType: 'auto',
    exitAnimationType: 'FadeOut',
  }

  switch (type) {
    case 'rectangle':
      return { ...baseObject, width: 2, height: 1, fill: '#e94560', stroke: '#ffffff', strokeWidth: 2 }
    case 'triangle':
      return {
        ...baseObject,
        vertices: [
          { x: 0, y: 1 },
          { x: -0.866, y: -0.5 },
          { x: 0.866, y: -0.5 },
        ],
        fill: '#f59e0b',
        stroke: '#ffffff',
        strokeWidth: 2,
      }
    case 'circle':
      return { ...baseObject, radius: 1, fill: '#4ade80', stroke: '#ffffff', strokeWidth: 2 }
    case 'line':
      return { ...baseObject, x2: 2, y2: 0, stroke: '#ffffff', strokeWidth: 3 }
    case 'arc':
      return {
        ...baseObject,
        x: -1, y: 0, x2: 1, y2: 0, cx: 0, cy: 1,
        stroke: '#ffffff', strokeWidth: 3, fill: undefined, rotation: 0,
      }
    case 'arrow':
      return { ...baseObject, x2: 2, y2: 0, stroke: '#fbbf24', strokeWidth: 3 }
    case 'dot':
      return { ...baseObject, radius: 0.1, fill: '#ffffff' }
    case 'text':
      return { ...baseObject, text: 'Text', fontSize: 48, fill: '#ffffff', width: 2, height: 0.8 }
    case 'latex':
      return { ...baseObject, latex: '\\frac{a}{b}', fill: '#ffffff' }
    case 'axes':
      return {
        ...baseObject, x: 0, y: 0,
        xRange: { min: -5, max: 5, step: 1 },
        yRange: { min: -3, max: 3, step: 1 },
        xLength: 8, yLength: 4,
        stroke: '#ffffff', strokeWidth: 2,
        showTicks: true, xLabel: 'x', yLabel: 'y',
        rotation: 0, fill: undefined,
      }
    case 'graph':
      return {
        ...baseObject, x: 0, y: 0,
        formula: 'x^2',
        xRange: { min: -5, max: 5 },
        yRange: { min: -3, max: 3 },
        stroke: '#4ade80', strokeWidth: 3,
        axesId: null, rotation: 0, fill: undefined,
      }
    case 'polygon': {
      const sides = 5
      const radius = 1
      const vertices = []
      for (let i = 0; i < sides; i++) {
        const angle = (i / sides) * Math.PI * 2 - Math.PI / 2
        vertices.push({
          x: parseFloat((Math.cos(angle) * radius).toFixed(2)),
          y: parseFloat((Math.sin(angle) * radius).toFixed(2)),
        })
      }
      return {
        ...baseObject, sides, radius, vertices,
        fill: '#8b5cf6', stroke: '#ffffff', strokeWidth: 2,
      }
    }
    case 'graphCursor':
      return {
        ...baseObject, x: 0, y: 0, x0: 0,
        graphId: null, axesId: null,
        showCrosshair: true, showDot: true, showLabel: false,
        labelFormat: '({x0}, {y0})',
        fill: '#e94560', radius: 0.08,
      }
    case 'tangentLine':
      return {
        ...baseObject, x: 0, y: 0,
        graphId: null, cursorId: null, axesId: null,
        derivativeStep: 0.001, visibleSpan: 2,
        showSlopeLabel: true, slopeLabelOffset: 0.5,
        stroke: '#fbbf24', strokeWidth: 2,
      }
    case 'limitProbe':
      return {
        ...baseObject, x: 0, y: 0, x0: 0,
        graphId: null, cursorId: null, axesId: null,
        direction: 'both',
        deltaSchedule: [1, 0.5, 0.1, 0.01],
        showReadout: true, showPoints: true, showArrow: true,
        fill: '#3b82f6', radius: 0.06,
      }
    case 'valueLabel':
      return {
        ...baseObject, x: 0, y: 0,
        graphId: null, cursorId: null,
        valueType: 'slope', customExpression: '',
        labelPrefix: '', labelSuffix: '',
        fontSize: 24, fill: '#ffffff',
        showBackground: false,
        backgroundFill: '#000000', backgroundOpacity: 0.7,
      }
    default:
      return baseObject
  }
}

export default useProjectStore
