import React, { useRef, useState, useCallback, useEffect } from 'react'
import SceneList from './components/SceneList'
import Canvas from './components/Canvas'
import PropertiesPanel from './components/PropertiesPanel'
import CodePanel from './components/CodePanel'
import Timeline from './components/Timeline'
import Toolbar from './components/Toolbar'
import VideoPreview from './components/VideoPreview'
import { createEmptyProject, createEmptyScene, validateProject, createDemoScene } from './project/schema'
import { generateManimCode, sanitizeClassName } from './codegen/generator'
import { generateObjectName } from './utils/objectLabel'
import { validateScene, getValidationSummary } from './utils/exportValidation'
import './App.css'

function App() {
  const [project, setProject] = useState(createEmptyProject())
  const [activeSceneId, setActiveSceneId] = useState(project.scenes[0]?.id)
  const [selectedObjectId, setSelectedObjectId] = useState(null)
  const [currentTime, setCurrentTime] = useState(0)
  const [timelineHeight, setTimelineHeight] = useState(220)
  const [codePanelHeight, setCodePanelHeight] = useState(280)
  const [generatedCode, setGeneratedCode] = useState('')
  const [customCode, setCustomCode] = useState('')
  const [isCustomCodeSynced, setIsCustomCodeSynced] = useState(true)
  const [renderLogs, setRenderLogs] = useState('')
  const [isRendering, setIsRendering] = useState(false)
  const [videoData, setVideoData] = useState(null)
  const [showVideoPreview, setShowVideoPreview] = useState(false)

  // Undo/redo history (captures project + selection + code state)
  const [history, setHistory] = useState({ past: [], future: [] })
  const stateRef = useRef({
    project,
    activeSceneId,
    selectedObjectId,
    customCode,
    isCustomCodeSynced,
  })
  const lastCommitRef = useRef({ key: null, time: 0 })
  const centerPanelRef = useRef(null)
  const rightPanelRef = useRef(null)
  const resizeRef = useRef(null)

  const activeScene = project.scenes.find(s => s.id === activeSceneId)
  const selectedObject = activeScene?.objects.find(o => o.id === selectedObjectId)

  // Keep time within scene bounds when switching scenes / durations
  useEffect(() => {
    const dur = activeScene?.duration || 0
    setCurrentTime(t => Math.max(0, Math.min(dur, t)))
  }, [activeSceneId, activeScene?.duration])

  useEffect(() => {
    stateRef.current = { project, activeSceneId, selectedObjectId, customCode, isCustomCodeSynced }
  }, [project, activeSceneId, selectedObjectId, customCode, isCustomCodeSynced])

  const startResize = useCallback((type, e) => {
    e.preventDefault()
    resizeRef.current = {
      type,
      startY: e.clientY,
      startTimelineHeight: timelineHeight,
      startCodePanelHeight: codePanelHeight,
    }

    const onMove = (event) => {
      if (!resizeRef.current) return
      const delta = event.clientY - resizeRef.current.startY
      if (resizeRef.current.type === 'timeline') {
        const container = centerPanelRef.current?.getBoundingClientRect()
        const min = 140
        const max = container ? container.height - 180 : 500
        // Drag down (positive delta) = bigger timeline
        const next = Math.max(min, Math.min(max, resizeRef.current.startTimelineHeight - delta))
        setTimelineHeight(next)
      } else if (resizeRef.current.type === 'code') {
        const container = rightPanelRef.current?.getBoundingClientRect()
        const min = 180
        const max = container ? container.height - 160 : 600
        const next = Math.max(min, Math.min(max, resizeRef.current.startCodePanelHeight - delta))
        setCodePanelHeight(next)
      }
    }

    const onUp = () => {
      resizeRef.current = null
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }

    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }, [timelineHeight, codePanelHeight])

  const isEditableTarget = (el) => {
    if (!el) return false
    if (el.isContentEditable) return true
    const tag = el.tagName?.toLowerCase()
    return tag === 'input' || tag === 'textarea' || tag === 'select'
  }

  const commit = useCallback((actionKey, fn) => {
    const now = Date.now()
    const last = lastCommitRef.current
    const coalesceWindowMs = 300
    const shouldPush = !(actionKey && last.key === actionKey && (now - last.time) < coalesceWindowMs)

    if (shouldPush) {
      const snap = stateRef.current
      setHistory(h => ({ past: [...h.past, snap], future: [] }))
    } else {
      // Still clear redo stack if user is making new changes
      setHistory(h => (h.future.length ? { ...h, future: [] } : h))
    }

    lastCommitRef.current = { key: actionKey, time: now }
    fn()
  }, [])

  const undo = useCallback(() => {
    setHistory(h => {
      if (!h.past.length) return h
      const prev = h.past[h.past.length - 1]
      const cur = stateRef.current
      setProject(prev.project)
      setActiveSceneId(prev.activeSceneId)
      setSelectedObjectId(prev.selectedObjectId)
      setCustomCode(prev.customCode)
      setIsCustomCodeSynced(prev.isCustomCodeSynced)
      return { past: h.past.slice(0, -1), future: [cur, ...h.future] }
    })
  }, [])

  const redo = useCallback(() => {
    setHistory(h => {
      if (!h.future.length) return h
      const next = h.future[0]
      const cur = stateRef.current
      setProject(next.project)
      setActiveSceneId(next.activeSceneId)
      setSelectedObjectId(next.selectedObjectId)
      setCustomCode(next.customCode)
      setIsCustomCodeSynced(next.isCustomCodeSynced)
      return { past: [...h.past, cur], future: h.future.slice(1) }
    })
  }, [])

  // Regenerate code when project changes
  useEffect(() => {
    const code = generateManimCode(project, activeSceneId)
    setGeneratedCode(code)
    // Always keep customCode synced with generated code
    // This ensures the code display matches what will be rendered
    setCustomCode(code)
    setIsCustomCodeSynced(true)
  }, [project, activeSceneId])

  // Listen for render logs
  useEffect(() => {
    if (window.electronAPI) {
      window.electronAPI.onRenderLog((log) => {
        setRenderLogs(prev => prev + log)
      })
      return () => window.electronAPI.removeRenderLogListener()
    }
  }, [])

  // Scene management
  const addScene = useCallback(() => {
    commit('scene:add', () => {
      const newScene = createEmptyScene(`Scene ${project.scenes.length + 1}`)
      setProject(prev => ({
        ...prev,
        scenes: [...prev.scenes, newScene]
      }))
      setActiveSceneId(newScene.id)
      setSelectedObjectId(null)
    })
  }, [project.scenes.length])

  const deleteScene = useCallback((sceneId) => {
    if (project.scenes.length <= 1) return
    commit('scene:delete', () => {
      setProject(prev => ({
        ...prev,
        scenes: prev.scenes.filter(s => s.id !== sceneId)
      }))
      if (activeSceneId === sceneId) {
        setActiveSceneId(project.scenes.find(s => s.id !== sceneId)?.id)
        setSelectedObjectId(null)
      }
    })
  }, [project.scenes, activeSceneId])

  const renameScene = useCallback((sceneId, newName) => {
    commit(`scene:rename:${sceneId}`, () => {
      setProject(prev => ({
        ...prev,
        scenes: prev.scenes.map(s => 
          s.id === sceneId ? { ...s, name: newName } : s
        )
      }))
    })
  }, [])

  const reorderScenes = useCallback((fromIndex, toIndex) => {
    commit('scene:reorder', () => {
      setProject(prev => {
        const newScenes = [...prev.scenes]
        const [removed] = newScenes.splice(fromIndex, 1)
        newScenes.splice(toIndex, 0, removed)
        return { ...prev, scenes: newScenes }
      })
    })
  }, [])

  const duplicateScene = useCallback((sceneId) => {
    const scene = project.scenes.find(s => s.id === sceneId)
    if (!scene) return
    commit('scene:duplicate', () => {
      const newScene = {
        ...JSON.parse(JSON.stringify(scene)),
        id: crypto.randomUUID(),
        name: `${scene.name} (Copy)`
      }
      setProject(prev => ({
        ...prev,
        scenes: [...prev.scenes, newScene]
      }))
      setActiveSceneId(newScene.id)
      setSelectedObjectId(null)
    })
  }, [project.scenes])

  // Object management
  const addObject = useCallback((objectType, overrides = {}) => {
    if (!activeScene) return

    commit(`obj:add:${objectType}`, () => {
      const existingObjects = activeScene.objects || []
      const baseObject = createObject(objectType, existingObjects)
      const newObject = { ...baseObject, ...overrides }
      // Ensure name is set (can be overridden in overrides)
      if (!newObject.name) {
        newObject.name = generateObjectName(newObject, existingObjects)
      }
      
      // Auto-link graphs to existing axes if not already linked
      if (newObject.type === 'graph' && !newObject.axesId) {
        const existingAxes = existingObjects.find(o => o.type === 'axes')
        if (existingAxes) {
          newObject.axesId = existingAxes.id
          // Position graph at axes origin
          newObject.x = existingAxes.x
          newObject.y = existingAxes.y
        }
      }
      
      // Auto-link graph tools to existing graphs
      if (['graphCursor', 'tangentLine', 'limitProbe', 'valueLabel'].includes(newObject.type)) {
        if (!newObject.graphId) {
          const existingGraph = existingObjects.find(o => o.type === 'graph')
          if (existingGraph) {
            newObject.graphId = existingGraph.id
          }
        }
      }
      
      setProject(prev => ({
        ...prev,
        scenes: prev.scenes.map(s => 
          s.id === activeSceneId 
            ? { ...s, objects: [...s.objects, newObject] }
            : s
        )
      }))
      setSelectedObjectId(newObject.id)
    })
  }, [activeScene, activeSceneId])

  const updateObject = useCallback((objectId, updates) => {
    // Coalesce rapid drag updates into one undo step per object
    commit(`obj:update:${objectId}`, () => {
      setProject(prev => ({
        ...prev,
        scenes: prev.scenes.map(s => 
          s.id === activeSceneId
            ? {
                ...s,
                objects: s.objects.map(o =>
                  o.id === objectId ? { ...o, ...updates } : o
                )
              }
            : s
        )
      }))
    })
  }, [activeSceneId])

  const deleteObject = useCallback((objectId) => {
    commit(`obj:delete:${objectId}`, () => {
      setProject(prev => ({
        ...prev,
        scenes: prev.scenes.map(s => 
          s.id === activeSceneId
            ? { ...s, objects: s.objects.filter(o => o.id !== objectId) }
            : s
        )
      }))
      if (selectedObjectId === objectId) {
        setSelectedObjectId(null)
      }
    })
  }, [activeSceneId, selectedObjectId])

  const duplicateObject = useCallback((objectId) => {
    if (!activeScene) return
    const original = activeScene.objects.find(o => o.id === objectId)
    if (!original) return

    commit(`obj:duplicate:${objectId}`, () => {
      const clone = JSON.parse(JSON.stringify(original))
      clone.id = crypto.randomUUID()
      clone.name = clone.name ? `${clone.name} (Copy)` : null
      // Slight offset so it's visible it's duplicated
      if (typeof clone.x === 'number') clone.x = parseFloat((clone.x + 0.3).toFixed(2))
      if (typeof clone.y === 'number') clone.y = parseFloat((clone.y - 0.3).toFixed(2))
      // Keep line endpoints consistent with the same offset
      if (typeof clone.x2 === 'number') clone.x2 = parseFloat((clone.x2 + 0.3).toFixed(2))
      if (typeof clone.y2 === 'number') clone.y2 = parseFloat((clone.y2 - 0.3).toFixed(2))

      setProject(prev => ({
        ...prev,
        scenes: prev.scenes.map(s =>
          s.id === activeSceneId ? { ...s, objects: [...s.objects, clone] } : s
        )
      }))
      setSelectedObjectId(clone.id)
    })
  }, [activeScene, activeSceneId, commit])

  // Layer ordering functions
  const bringForward = useCallback((objectId) => {
    commit(`obj:z:forward:${objectId}`, () => {
      setProject(prev => ({
        ...prev,
        scenes: prev.scenes.map(s => {
          if (s.id !== activeSceneId) return s
          const obj = s.objects.find(o => o.id === objectId)
          if (!obj) return s
          const maxZ = Math.max(...s.objects.map(o => o.zIndex || 0))
          if ((obj.zIndex || 0) >= maxZ) return s
          return {
            ...s,
            objects: s.objects.map(o => 
              o.id === objectId ? { ...o, zIndex: (o.zIndex || 0) + 1 } : o
            )
          }
        })
      }))
    })
  }, [activeSceneId])

  const sendBackward = useCallback((objectId) => {
    commit(`obj:z:backward:${objectId}`, () => {
      setProject(prev => ({
        ...prev,
        scenes: prev.scenes.map(s => {
          if (s.id !== activeSceneId) return s
          const obj = s.objects.find(o => o.id === objectId)
          if (!obj) return s
          const minZ = Math.min(...s.objects.map(o => o.zIndex || 0))
          if ((obj.zIndex || 0) <= minZ) return s
          return {
            ...s,
            objects: s.objects.map(o => 
              o.id === objectId ? { ...o, zIndex: (o.zIndex || 0) - 1 } : o
            )
          }
        })
      }))
    })
  }, [activeSceneId])

  const bringToFront = useCallback((objectId) => {
    commit(`obj:z:front:${objectId}`, () => {
      setProject(prev => ({
        ...prev,
        scenes: prev.scenes.map(s => {
          if (s.id !== activeSceneId) return s
          const maxZ = Math.max(...s.objects.map(o => o.zIndex || 0))
          return {
            ...s,
            objects: s.objects.map(o => 
              o.id === objectId ? { ...o, zIndex: maxZ + 1 } : o
            )
          }
        })
      }))
    })
  }, [activeSceneId])

  const sendToBack = useCallback((objectId) => {
    commit(`obj:z:back:${objectId}`, () => {
      setProject(prev => ({
        ...prev,
        scenes: prev.scenes.map(s => {
          if (s.id !== activeSceneId) return s
          const minZ = Math.min(...s.objects.map(o => o.zIndex || 0))
          return {
            ...s,
            objects: s.objects.map(o => 
              o.id === objectId ? { ...o, zIndex: minZ - 1 } : o
            )
          }
        })
      }))
    })
  }, [activeSceneId])

  // Timeline / keyframe management
  const addKeyframe = useCallback((objectId, time, property, value) => {
    commit(`kf:add:${objectId}`, () => {
      setProject(prev => ({
        ...prev,
        scenes: prev.scenes.map(s => 
          s.id === activeSceneId
            ? {
                ...s,
                objects: s.objects.map(o =>
                  o.id === objectId
                    ? {
                        ...o,
                        keyframes: [
                          ...o.keyframes.filter(k => !(k.time === time && k.property === property)),
                          { time, property, value }
                        ].sort((a, b) => a.time - b.time)
                      }
                    : o
                )
              }
            : s
        )
      }))
    })
  }, [activeSceneId])

  // File operations
  const saveProject = useCallback(async () => {
    if (window.electronAPI) {
      const result = await window.electronAPI.saveProject(project)
      if (result.success) {
        console.log('Project saved to:', result.path)
      }
    }
  }, [project])

  const loadProject = useCallback(async () => {
    if (window.electronAPI) {
      const result = await window.electronAPI.loadProject()
      if (result.success) {
        commit('project:load', () => {
          const validated = validateProject(result.data)
          setProject(validated)
          setActiveSceneId(validated.scenes[0]?.id)
          setSelectedObjectId(null)
          setIsCustomCodeSynced(true)
        })
      }
    }
  }, [])

  // Render preview
  const renderPreview = useCallback(async () => {
    if (!window.electronAPI || !activeScene) return
    
    // Run export sanity checks
    const validationIssues = validateScene(activeScene)
    const summary = getValidationSummary(validationIssues)
    
    if (summary.errorCount > 0) {
      // Show validation errors in logs
      const errorMessages = validationIssues
        .filter(i => i.level === 'error')
        .map(i => `Error: ${i.message}`)
        .join('\n')
      setRenderLogs(`Export validation failed:\n${errorMessages}\n\nPlease fix these issues before rendering.`)
      alert(`Cannot render: ${summary.errorCount} error(s) found. See render logs for details.`)
      return
    }
    
    if (summary.warningCount > 0) {
      // Show warnings but allow render
      const warningMessages = validationIssues
        .filter(i => i.level === 'warning')
        .map(i => `Warning: ${i.message}`)
        .join('\n')
      setRenderLogs(`Warnings:\n${warningMessages}\n\nRendering anyway...\n`)
    }
    
    setIsRendering(true)
    setRenderLogs(prev => prev + 'Starting render...\n')
    setVideoData(null)
    
    const sceneName = sanitizeClassName(activeScene.name)
    // Always use the generated code that matches the current canvas state
    const codeToRender = generatedCode
    const result = await window.electronAPI.renderManim({
      pythonCode: codeToRender,
      sceneName,
      quality: 'low'
    })
    
    if (result.success) {
      const videoResult = await window.electronAPI.getVideoData(result.videoPath)
      if (videoResult.success) {
        setVideoData(videoResult.data)
        setShowVideoPreview(true)
        setRenderLogs(prev => prev + 'Render completed successfully!\n')
      }
    } else {
      const errorMsg = result.error || 'Unknown error'
      setRenderLogs(prev => prev + `\nRender failed: ${errorMsg}\n`)
      console.error('Render failed:', result.error)
    }
    
    setIsRendering(false)
  }, [activeScene, generatedCode, customCode])

  const handleCodeChange = useCallback((newCode) => {
    commit('code:edit', () => {
      setCustomCode(newCode)
      setIsCustomCodeSynced(false)
    })
  }, [])

  const clearAllObjects = useCallback(() => {
    if (!activeScene) return
    commit('scene:clearAll', () => {
      setProject(prev => ({
        ...prev,
        scenes: prev.scenes.map(s =>
          s.id === activeSceneId ? { ...s, objects: [] } : s
        )
      }))
      setSelectedObjectId(null)
    })
  }, [activeScene, activeSceneId, commit])

  const loadDemo = useCallback(() => {
    commit('scene:loadDemo', () => {
      const demoScene = createDemoScene()
      setProject(prev => ({
        ...prev,
        scenes: prev.scenes.map(s =>
          s.id === activeSceneId ? demoScene : s
        )
      }))
      setActiveSceneId(demoScene.id)
      setSelectedObjectId(null)
    })
  }, [activeSceneId, commit])

  const deleteSelectedObject = useCallback(() => {
    if (!selectedObjectId) return
    deleteObject(selectedObjectId)
  }, [deleteObject, selectedObjectId])

  // Cmd+Z / Cmd+Shift+Z undo/redo + Delete/Backspace deletion (unless typing)
  useEffect(() => {
    const onKeyDown = (e) => {
      // Don't hijack editing contexts
      if (isEditableTarget(document.activeElement)) return

      const key = e.key.toLowerCase()
      const isMacUndo = e.metaKey && !e.shiftKey && key === 'z'
      const isMacRedo = e.metaKey && e.shiftKey && key === 'z'
      const isCmdRedo = (e.metaKey && key === 'y')
      const isWinRedo = (e.ctrlKey && key === 'y')

      if (isMacUndo) {
        e.preventDefault()
        undo()
        return
      }
      if (isMacRedo || isCmdRedo || isWinRedo) {
        e.preventDefault()
        redo()
        return
      }

      if ((e.key === 'Backspace' || e.key === 'Delete') && selectedObjectId) {
        e.preventDefault()
        deleteSelectedObject()
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [deleteSelectedObject, redo, selectedObjectId, undo])

  return (
    <div className="app">
      <Toolbar 
        onSave={saveProject}
        onLoad={loadProject}
        onClearAll={clearAllObjects}
        canClearAll={(activeScene?.objects?.length || 0) > 0}
        onRender={renderPreview}
        isRendering={isRendering}
        onLoadDemo={loadDemo}
      />
      
      <div className="main-content">
        <SceneList
          scenes={project.scenes}
          activeSceneId={activeSceneId}
          onSelectScene={setActiveSceneId}
          onAddScene={addScene}
          onDeleteScene={deleteScene}
          onRenameScene={renameScene}
          onDuplicateScene={duplicateScene}
          onReorderScenes={reorderScenes}
        />
        
        <div className="center-panel" ref={centerPanelRef}>
          <div className="canvas-panel">
            <Canvas
              scene={activeScene}
              currentTime={currentTime}
              selectedObjectId={selectedObjectId}
              onSelectObject={setSelectedObjectId}
              onUpdateObject={updateObject}
              onAddObject={addObject}
              onDuplicateObject={duplicateObject}
              onDeleteObject={deleteObject}
            />
          </div>

          <div
            className="panel-resizer horizontal"
            onMouseDown={(e) => startResize('timeline', e)}
            title="Drag to resize timeline"
          />

          <div className="timeline-panel" style={{ height: timelineHeight }}>
            <Timeline
              scene={activeScene}
              selectedObjectId={selectedObjectId}
              currentTime={currentTime}
              onTimeChange={setCurrentTime}
              onAddKeyframe={addKeyframe}
              onSelectObject={setSelectedObjectId}
              onUpdateObject={updateObject}
            />
          </div>
        </div>
        
        <div className="right-panel" ref={rightPanelRef}>
          <div className="properties-panel-wrapper">
            <PropertiesPanel
              object={selectedObject}
              onUpdateObject={updateObject}
              onDeleteObject={deleteObject}
              onBringForward={bringForward}
              onSendBackward={sendBackward}
              onBringToFront={bringToFront}
              onSendToBack={sendToBack}
              onSelectObject={setSelectedObjectId}
              scene={activeScene}
            />
          </div>

          <div
            className="panel-resizer horizontal"
            onMouseDown={(e) => startResize('code', e)}
            title="Drag to resize code panel"
          />

          <div className="code-panel-wrapper" style={{ height: codePanelHeight }}>
            <CodePanel
              code={customCode || generatedCode}
              logs={renderLogs}
              onCodeChange={handleCodeChange}
              validationIssues={activeScene ? validateScene(activeScene) : []}
            />
          </div>
        </div>
      </div>
      
      {showVideoPreview && videoData && (
        <VideoPreview
          videoData={videoData}
          onClose={() => setShowVideoPreview(false)}
        />
      )}
    </div>
  )
}

// Helper to create new objects
function createObject(type, existingObjects = []) {
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
    exitAnimationType: 'FadeOut'
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
          { x: 0.866, y: -0.5 }
        ],
        fill: '#f59e0b', 
        stroke: '#ffffff', 
        strokeWidth: 2 
      }
    case 'circle':
      return { ...baseObject, radius: 1, fill: '#4ade80', stroke: '#ffffff', strokeWidth: 2 }
    case 'line':
      return { ...baseObject, x2: 2, y2: 0, stroke: '#ffffff', strokeWidth: 3 }
    case 'arc':
      return {
        ...baseObject,
        // Start point (x,y) and end point (x2,y2), plus control point (cx,cy)
        x: -1,
        y: 0,
        x2: 1,
        y2: 0,
        cx: 0,
        cy: 1,
        stroke: '#ffffff',
        strokeWidth: 3,
        fill: undefined,
        rotation: 0
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
        ...baseObject,
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
        fill: undefined,
      }
    case 'graph':
      return {
        ...baseObject,
        x: 0,
        y: 0,
        formula: 'x^2',
        xRange: { min: -5, max: 5 },
        yRange: { min: -3, max: 3 },
        stroke: '#4ade80',
        strokeWidth: 3,
        axesId: null, // Can be linked to an axes object
        rotation: 0,
        fill: undefined,
      }
    case 'polygon': {
      const sides = 5
      const radius = 1
      const vertices = []
      for (let i = 0; i < sides; i++) {
        const angle = (i / sides) * Math.PI * 2 - Math.PI / 2
        vertices.push({
          x: parseFloat((Math.cos(angle) * radius).toFixed(2)),
          y: parseFloat((Math.sin(angle) * radius).toFixed(2))
        })
      }
      return { 
        ...baseObject, 
        sides, 
        radius, 
        vertices,
        fill: '#8b5cf6', 
        stroke: '#ffffff', 
        strokeWidth: 2 
      }
    }
    case 'graphCursor':
      return {
        ...baseObject,
        x: 0,
        y: 0,
        x0: 0, // x position on the graph
        graphId: null, // Link to a graph object
        axesId: null, // Optional link to axes for coordinate conversion
        showCrosshair: true,
        showDot: true,
        showLabel: false,
        labelFormat: '({x0}, {y0})',
        fill: '#e94560',
        radius: 0.08,
      }
    case 'tangentLine':
      return {
        ...baseObject,
        x: 0,
        y: 0,
        graphId: null, // Link to a graph object (if no cursorId)
        cursorId: null, // Link to a graphCursor object (preferred)
        axesId: null, // Optional link to axes
        derivativeStep: 0.001, // h for numerical derivative
        visibleSpan: 2, // How far the tangent line extends from the point
        showSlopeLabel: true,
        slopeLabelOffset: 0.5,
        stroke: '#fbbf24',
        strokeWidth: 2,
      }
    case 'limitProbe':
      return {
        ...baseObject,
        x: 0,
        y: 0,
        x0: 0, // Point to approach
        graphId: null, // Link to a graph object
        cursorId: null, // Optional link to a graphCursor to follow
        axesId: null, // Optional link to axes
        direction: 'both', // 'left', 'right', or 'both'
        deltaSchedule: [1, 0.5, 0.1, 0.01], // Sequence of deltas for approaching
        showReadout: true,
        showPoints: true,
        showArrow: true,
        fill: '#3b82f6',
        radius: 0.06,
      }
    case 'valueLabel':
      return {
        ...baseObject,
        x: 0,
        y: 0,
        graphId: null, // Link to a graph for evaluation context
        cursorId: null, // Link to a graphCursor to display its values
        valueType: 'slope', // 'slope', 'x', 'y', 'limit', 'custom'
        customExpression: '',
        labelPrefix: '',
        labelSuffix: '',
        fontSize: 24,
        fill: '#ffffff',
        showBackground: false,
        backgroundFill: '#000000',
        backgroundOpacity: 0.7,
      }
    default:
      return baseObject
  }
}

export default App

