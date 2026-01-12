import React, { useState, useCallback, useEffect } from 'react'
import SceneList from './components/SceneList'
import Canvas from './components/Canvas'
import PropertiesPanel from './components/PropertiesPanel'
import CodePanel from './components/CodePanel'
import Timeline from './components/Timeline'
import Toolbar from './components/Toolbar'
import VideoPreview from './components/VideoPreview'
import { createEmptyProject, createEmptyScene } from './project/schema'
import { generateManimCode } from './codegen/generator'
import './App.css'

function App() {
  const [project, setProject] = useState(createEmptyProject())
  const [activeSceneId, setActiveSceneId] = useState(project.scenes[0]?.id)
  const [selectedObjectId, setSelectedObjectId] = useState(null)
  const [generatedCode, setGeneratedCode] = useState('')
  const [renderLogs, setRenderLogs] = useState('')
  const [isRendering, setIsRendering] = useState(false)
  const [videoData, setVideoData] = useState(null)
  const [showVideoPreview, setShowVideoPreview] = useState(false)

  const activeScene = project.scenes.find(s => s.id === activeSceneId)
  const selectedObject = activeScene?.objects.find(o => o.id === selectedObjectId)

  // Regenerate code when project changes
  useEffect(() => {
    const code = generateManimCode(project, activeSceneId)
    setGeneratedCode(code)
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
    const newScene = createEmptyScene(`Scene ${project.scenes.length + 1}`)
    setProject(prev => ({
      ...prev,
      scenes: [...prev.scenes, newScene]
    }))
    setActiveSceneId(newScene.id)
  }, [project.scenes.length])

  const deleteScene = useCallback((sceneId) => {
    if (project.scenes.length <= 1) return
    setProject(prev => ({
      ...prev,
      scenes: prev.scenes.filter(s => s.id !== sceneId)
    }))
    if (activeSceneId === sceneId) {
      setActiveSceneId(project.scenes.find(s => s.id !== sceneId)?.id)
    }
  }, [project.scenes, activeSceneId])

  const renameScene = useCallback((sceneId, newName) => {
    setProject(prev => ({
      ...prev,
      scenes: prev.scenes.map(s => 
        s.id === sceneId ? { ...s, name: newName } : s
      )
    }))
  }, [])

  const reorderScenes = useCallback((fromIndex, toIndex) => {
    setProject(prev => {
      const newScenes = [...prev.scenes]
      const [removed] = newScenes.splice(fromIndex, 1)
      newScenes.splice(toIndex, 0, removed)
      return { ...prev, scenes: newScenes }
    })
  }, [])

  const duplicateScene = useCallback((sceneId) => {
    const scene = project.scenes.find(s => s.id === sceneId)
    if (!scene) return
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
  }, [project.scenes])

  // Object management
  const addObject = useCallback((objectType) => {
    if (!activeScene) return
    
    const newObject = createObject(objectType)
    setProject(prev => ({
      ...prev,
      scenes: prev.scenes.map(s => 
        s.id === activeSceneId 
          ? { ...s, objects: [...s.objects, newObject] }
          : s
      )
    }))
    setSelectedObjectId(newObject.id)
  }, [activeScene, activeSceneId])

  const updateObject = useCallback((objectId, updates) => {
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
  }, [activeSceneId])

  const deleteObject = useCallback((objectId) => {
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
  }, [activeSceneId, selectedObjectId])

  // Timeline / keyframe management
  const addKeyframe = useCallback((objectId, time, property, value) => {
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
        setProject(result.data)
        setActiveSceneId(result.data.scenes[0]?.id)
        setSelectedObjectId(null)
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
    const result = await window.electronAPI.renderManim({
      pythonCode: generatedCode,
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
  }, [activeScene, generatedCode])

  return (
    <div className="app">
      <Toolbar 
        onSave={saveProject}
        onLoad={loadProject}
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
          />
          
          <Timeline
            scene={activeScene}
            selectedObjectId={selectedObjectId}
            onAddKeyframe={addKeyframe}
          />
        </div>
        
        <div className="right-panel">
          <PropertiesPanel
            object={selectedObject}
            onUpdateObject={updateObject}
            onDeleteObject={deleteObject}
          />
          
          <CodePanel
            code={generatedCode}
            logs={renderLogs}
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
    delay: 0
  }
  
  switch (type) {
    case 'rectangle':
      return { ...baseObject, width: 2, height: 1, fill: '#e94560', stroke: '#ffffff', strokeWidth: 2 }
    case 'circle':
      return { ...baseObject, radius: 1, fill: '#4ade80', stroke: '#ffffff', strokeWidth: 2 }
    case 'line':
      return { ...baseObject, x2: 2, y2: 0, stroke: '#ffffff', strokeWidth: 3 }
    case 'arrow':
      return { ...baseObject, x2: 2, y2: 0, stroke: '#fbbf24', strokeWidth: 3 }
    case 'dot':
      return { ...baseObject, radius: 0.1, fill: '#ffffff' }
    case 'text':
      return { ...baseObject, text: 'Text', fontSize: 48, fill: '#ffffff' }
    case 'latex':
      return { ...baseObject, latex: '\\frac{a}{b}', fill: '#ffffff' }
    case 'polygon':
      return { ...baseObject, sides: 5, radius: 1, fill: '#8b5cf6', stroke: '#ffffff', strokeWidth: 2 }
    default:
      return baseObject
  }
}

export default App

