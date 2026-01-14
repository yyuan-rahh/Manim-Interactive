import React, { useRef, useState, useCallback, useEffect } from 'react'
import SceneList from './components/SceneList'
import Canvas from './components/Canvas'
import PropertiesPanel from './components/PropertiesPanel'
import CodePanel from './components/CodePanel'
import Timeline from './components/Timeline'
import Toolbar from './components/Toolbar'
import VideoPreview from './components/VideoPreview'
import { createEmptyProject, createEmptyScene, validateProject } from './project/schema'
import { generateManimCode } from './codegen/generator'
import './App.css'

function App() {
  const [project, setProject] = useState(createEmptyProject())
  const [activeSceneId, setActiveSceneId] = useState(project.scenes[0]?.id)
  const [selectedObjectId, setSelectedObjectId] = useState(null)
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

  const activeScene = project.scenes.find(s => s.id === activeSceneId)
  const selectedObject = activeScene?.objects.find(o => o.id === selectedObjectId)

  useEffect(() => {
    stateRef.current = { project, activeSceneId, selectedObjectId, customCode, isCustomCodeSynced }
  }, [project, activeSceneId, selectedObjectId, customCode, isCustomCodeSynced])

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
    if (isCustomCodeSynced) {
      setCustomCode(code)
    }
  }, [project, activeSceneId, isCustomCodeSynced])

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
      const newObject = { ...createObject(objectType), ...overrides }
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
    
    setIsRendering(true)
    setRenderLogs('')
    setVideoData(null)
    
    const sceneName = activeScene.name.replace(/[^a-zA-Z0-9]/g, '_')
    const codeToRender = customCode || generatedCode
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
      }
    } else {
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
        
        <div className="center-panel">
          <Canvas
            scene={activeScene}
            selectedObjectId={selectedObjectId}
            onSelectObject={setSelectedObjectId}
            onUpdateObject={updateObject}
            onAddObject={addObject}
            onDuplicateObject={duplicateObject}
            onDeleteObject={deleteObject}
          />
          
          <Timeline
            scene={activeScene}
            selectedObjectId={selectedObjectId}
            onAddKeyframe={addKeyframe}
            onSelectObject={setSelectedObjectId}
            onUpdateObject={updateObject}
          />
        </div>
        
        <div className="right-panel">
          <PropertiesPanel
            object={selectedObject}
            onUpdateObject={updateObject}
            onDeleteObject={deleteObject}
            onBringForward={bringForward}
            onSendBackward={sendBackward}
            onBringToFront={bringToFront}
            onSendToBack={sendToBack}
            scene={activeScene}
          />
          
          <CodePanel
            code={customCode || generatedCode}
            logs={renderLogs}
            onCodeChange={handleCodeChange}
          />
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
function createObject(type) {
  const baseObject = {
    id: crypto.randomUUID(),
    type,
    x: 0,
    y: 0,
    rotation: 0,
    opacity: 1,
    zIndex: 0,
    keyframes: [],
    runTime: 1,
    delay: 0,
    animationType: 'auto'
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
      return { ...baseObject, text: 'Text', fontSize: 48, fill: '#ffffff' }
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
    default:
      return baseObject
  }
}

export default App

