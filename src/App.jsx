import React, { useRef, useState, useCallback, useEffect } from 'react'
import SceneList from './components/SceneList'
import LibraryPanel from './components/LibraryPanel'
import Canvas from './components/Canvas'
import PropertiesPanel from './components/PropertiesPanel'
import CodePanel from './components/CodePanel'
import Timeline from './components/Timeline'
import Toolbar from './components/Toolbar'
import VideoPreview from './components/VideoPreview'
import AIAssistantModal from './components/AIAssistantModal'
import InlineAIChat from './components/InlineAIChat'
import { sanitizeClassName } from './codegen/generator'
import { parsePythonToOps } from './codegen/pythonToOps'
import { validateScene, getValidationSummary } from './utils/exportValidation'
import { applyAgentOps } from './agent/ops'
import useProjectStore from './store/useProjectStore'
import './App.css'

function App() {
  // ── Zustand store — core project state ──
  const project = useProjectStore((s) => s.project)
  const activeSceneId = useProjectStore((s) => s.activeSceneId)
  const selectedObjectIds = useProjectStore((s) => s.selectedObjectIds)
  const currentTime = useProjectStore((s) => s.currentTime)
  const generatedCode = useProjectStore((s) => s.generatedCode)
  const customCode = useProjectStore((s) => s.customCode)
  const isCustomCodeSynced = useProjectStore((s) => s.isCustomCodeSynced)

  const setCurrentTime = useProjectStore((s) => s.setCurrentTime)
  const setSelectedObjectIds = useProjectStore((s) => s.setSelectedObjectIds)
  const setActiveSceneId = useProjectStore((s) => s.setActiveSceneId)

  const addObject = useProjectStore((s) => s.addObject)
  const updateObject = useProjectStore((s) => s.updateObject)
  const deleteObject = useProjectStore((s) => s.deleteObject)
  const duplicateObject = useProjectStore((s) => s.duplicateObject)
  const addScene = useProjectStore((s) => s.addScene)
  const deleteScene = useProjectStore((s) => s.deleteScene)
  const renameScene = useProjectStore((s) => s.renameScene)
  const reorderScenes = useProjectStore((s) => s.reorderScenes)
  const duplicateScene = useProjectStore((s) => s.duplicateScene)
  const addKeyframe = useProjectStore((s) => s.addKeyframe)
  const bringForward = useProjectStore((s) => s.bringForward)
  const sendBackward = useProjectStore((s) => s.sendBackward)
  const bringToFront = useProjectStore((s) => s.bringToFront)
  const sendToBack = useProjectStore((s) => s.sendToBack)
  const undo = useProjectStore((s) => s.undo)
  const redo = useProjectStore((s) => s.redo)
  const clearAllObjects = useProjectStore((s) => s.clearAllObjects)
  const loadDemo = useProjectStore((s) => s.loadDemo)
  const deleteSelectedObjects = useProjectStore((s) => s.deleteSelectedObjects)
  const applyOpsFromAgent = useProjectStore((s) => s.applyOpsFromAgent)
  const applyPythonCodeFromAgent = useProjectStore((s) => s.applyPythonCodeFromAgent)
  const storeLoadProject = useProjectStore((s) => s.loadProject)
  const storeSaveProject = useProjectStore((s) => s.saveProject)
  const regenerateCode = useProjectStore((s) => s.regenerateCode)
  const clampTime = useProjectStore((s) => s.clampTime)

  // ── Local UI state (not in store) ──
  const [timelineHeight, setTimelineHeight] = useState(220)
  const [codePanelHeight, setCodePanelHeight] = useState(280)
  const [leftSidebarWidth, setLeftSidebarWidth] = useState(220)
  const [rightPanelWidth, setRightPanelWidth] = useState(320)
  const [renderLogs, setRenderLogs] = useState('')
  const [isRendering, setIsRendering] = useState(false)
  const [videoData, setVideoData] = useState(null)
  const [showVideoPreview, setShowVideoPreview] = useState(false)
  const [showAIModal, setShowAIModal] = useState(false)
  const [sidebarTab, setSidebarTab] = useState('library')
  const [aiPrefillPrompt, setAiPrefillPrompt] = useState('')
  const [libraryRefreshKey, setLibraryRefreshKey] = useState(0)
  const [renderQuality, setRenderQuality] = useState('low')

  const centerPanelRef = useRef(null)
  const rightPanelRef = useRef(null)
  const resizeRef = useRef(null)

  const activeScene = project.scenes.find(s => s.id === activeSceneId)
  const selectedObjects = activeScene?.objects.filter(o => selectedObjectIds.includes(o.id)) || []
  const selectedObject = selectedObjects.length === 1 ? selectedObjects[0] : null

  // Keep time within scene bounds when switching scenes / durations
  useEffect(() => {
    clampTime()
  }, [activeSceneId, activeScene?.duration, clampTime])

  // Regenerate code when project changes
  useEffect(() => {
    regenerateCode()
  }, [project, activeSceneId, regenerateCode])

  const startResize = useCallback((type, e) => {
    e.preventDefault()
    resizeRef.current = {
      type,
      startY: e.clientY,
      startX: e.clientX,
      startTimelineHeight: timelineHeight,
      startCodePanelHeight: codePanelHeight,
      startLeftSidebarWidth: leftSidebarWidth,
      startRightPanelWidth: rightPanelWidth,
    }

    const onMove = (event) => {
      if (!resizeRef.current) return
      const deltaY = event.clientY - resizeRef.current.startY
      const deltaX = event.clientX - resizeRef.current.startX
      
      if (resizeRef.current.type === 'timeline') {
        const container = centerPanelRef.current?.getBoundingClientRect()
        const min = 140
        const max = container ? container.height - 180 : 500
        // Drag down (positive delta) = bigger timeline
        const next = Math.max(min, Math.min(max, resizeRef.current.startTimelineHeight - deltaY))
        setTimelineHeight(next)
      } else if (resizeRef.current.type === 'code') {
        const container = rightPanelRef.current?.getBoundingClientRect()
        const min = 180
        const max = container ? container.height - 160 : 600
        const next = Math.max(min, Math.min(max, resizeRef.current.startCodePanelHeight - deltaY))
        setCodePanelHeight(next)
      } else if (resizeRef.current.type === 'leftSidebar') {
        const min = 180
        const max = 500
        // Drag right (positive delta) = wider sidebar
        const next = Math.max(min, Math.min(max, resizeRef.current.startLeftSidebarWidth + deltaX))
        setLeftSidebarWidth(next)
      } else if (resizeRef.current.type === 'rightPanel') {
        const min = 250
        const max = 600
        // Drag left (negative delta) = wider panel
        const next = Math.max(min, Math.min(max, resizeRef.current.startRightPanelWidth - deltaX))
        setRightPanelWidth(next)
      }
    }

    const onUp = () => {
      resizeRef.current = null
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }

    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }, [timelineHeight, codePanelHeight, leftSidebarWidth, rightPanelWidth])

  const isEditableTarget = (el) => {
    if (!el) return false
    if (el.isContentEditable) return true
    const tag = el.tagName?.toLowerCase()
    return tag === 'input' || tag === 'textarea' || tag === 'select'
  }

  // Listen for render logs
  useEffect(() => {
    if (window.electronAPI) {
      window.electronAPI.onRenderLog((log) => {
        setRenderLogs(prev => prev + log)
      })
      return () => window.electronAPI.removeRenderLogListener()
    }
  }, [])

  // File operations wrapped around store methods
  const saveProject = useCallback(async () => {
    await storeSaveProject()
  }, [storeSaveProject])

  const loadProject = useCallback(async () => {
    await storeLoadProject()
  }, [storeLoadProject])

  function extractSceneClassNameFromCode(code) {
    if (!code || typeof code !== 'string') return null
    // Matches classes like: class MyScene(Scene): / class MyScene(MovingCameraScene):
    const match = code.match(/class\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(\s*[^)]*Scene[^)]*\)\s*:/m)
    return match?.[1] || null
  }

  // Render preview
  const renderPreview = useCallback(async () => {
    if (!window.electronAPI || !activeScene) return

    const usingCustomCode = !isCustomCodeSynced && !!customCode?.trim()

    // Run export sanity checks only when rendering generated code from canvas state.
    if (!usingCustomCode) {
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
    } else {
      setRenderLogs(prev => prev + 'Rendering custom code from editor...\n')
    }

    setIsRendering(true)
    setRenderLogs(prev => prev + 'Starting render...\n')
    setVideoData(null)

    const codeToRender = usingCustomCode ? customCode : generatedCode
    const sceneName = usingCustomCode
      ? (extractSceneClassNameFromCode(codeToRender) || sanitizeClassName(activeScene.name))
      : sanitizeClassName(activeScene.name)
    const result = await window.electronAPI.renderManim({
      pythonCode: codeToRender,
      sceneName,
      quality: renderQuality || 'low'
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
  }, [activeScene, generatedCode, customCode, isCustomCodeSynced, renderQuality])

  const handleCodeChange = useCallback((newCode) => {
    const store = useProjectStore.getState()
    store.setCustomCode(newCode)
    store.setIsCustomCodeSynced(false)
  }, [])

  const handleSyncToCanvas = useCallback((pythonCode) => {
    if (!pythonCode?.trim()) return
    const ops = parsePythonToOps(pythonCode)
    if (ops.length === 0) {
      setRenderLogs(prev => prev + '\n[Sync] No objects found in Python code.\n')
      return
    }
    const sceneOps = ops.map(op => ({
      ...op,
      sceneId: activeSceneId,
    }))
    const warnings = applyOpsFromAgent(sceneOps)
    setRenderLogs(prev => prev + `\n[Sync] Parsed ${ops.length} objects from Python code.\n`)
    if (warnings?.length) {
      setRenderLogs(prev => prev + `Sync warnings:\n${warnings.map(w => `- ${w}`).join('\n')}\n`)
    }
  }, [activeSceneId, applyOpsFromAgent])

  const handleDropLibraryEntry = useCallback((entry, dropTime) => {
    if (!entry) return
    if (entry.ops?.length) {
      const offsetOps = entry.ops.map(op => {
        if (op.type === 'addObject' && op.object) {
          return {
            ...op,
            sceneId: op.sceneId || activeSceneId,
            object: {
              ...op.object,
              id: crypto.randomUUID(),
              delay: (op.object.delay || 0) + dropTime,
            }
          }
        }
        return { ...op, sceneId: op.sceneId || activeSceneId }
      })
      const warnings = applyOpsFromAgent(offsetOps)
      if (warnings?.length) {
        setRenderLogs(prev => prev + `\nLibrary drop warnings:\n${warnings.map(w => `- ${w}`).join('\n')}\n`)
      }
    }
    if (entry.pythonCode) {
      applyPythonCodeFromAgent(entry.pythonCode)
      setRenderLogs(prev => prev + `\n[Library] Applied "${entry.prompt}" at ${dropTime}s\n`)
    }
  }, [activeSceneId, applyOpsFromAgent, applyPythonCodeFromAgent])

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

      if ((e.key === 'Backspace' || e.key === 'Delete') && selectedObjectIds.length > 0) {
        e.preventDefault()
        deleteSelectedObjects()
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [deleteSelectedObjects, redo, selectedObjectIds, undo])

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
        onOpenAI={() => setShowAIModal(true)}
        renderQuality={renderQuality}
        onRenderQualityChange={setRenderQuality}
      />
      
      <div className="main-content">
        <div className="left-sidebar" style={{ width: leftSidebarWidth }}>
          <div className="sidebar-tabs">
            <button
              className={`sidebar-tab ${sidebarTab === 'library' ? 'active' : ''}`}
              onClick={() => setSidebarTab('library')}
            >
              Library
            </button>
            <button
              className={`sidebar-tab ${sidebarTab === 'scenes' ? 'active' : ''}`}
              onClick={() => setSidebarTab('scenes')}
            >
              Scenes
            </button>
          </div>
          {sidebarTab === 'library' ? (
            <LibraryPanel
              refreshKey={libraryRefreshKey}
              onApplyOps={applyOpsFromAgent}
              onApplyPythonCode={applyPythonCodeFromAgent}
              onUseAsPrompt={(p) => {
                setAiPrefillPrompt(p)
                setShowAIModal(true)
              }}
            />
          ) : (
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
          )}
        </div>
        
        <div
          className="panel-resizer vertical"
          onMouseDown={(e) => startResize('leftSidebar', e)}
          title="Drag to resize sidebar"
        />
        
        <div className="center-panel" ref={centerPanelRef}>
          <div
            className="canvas-panel"
            onDragOver={(e) => {
              if (e.dataTransfer.types.includes('application/x-library-entry')) {
                e.preventDefault()
                e.dataTransfer.dropEffect = 'copy'
              }
            }}
            onDrop={(e) => {
              const data = e.dataTransfer.getData('application/x-library-entry')
              if (!data) return
              e.preventDefault()
              try {
                const entry = JSON.parse(data)
                handleDropLibraryEntry(entry, currentTime)
              } catch { /* ignore */ }
            }}
          >
            <Canvas
              scene={activeScene}
              currentTime={currentTime}
              selectedObjectIds={selectedObjectIds}
              onSelectObjects={setSelectedObjectIds}
              onUpdateObject={updateObject}
              onAddObject={addObject}
              onDuplicateObject={duplicateObject}
              onDeleteObject={deleteObject}
            />
          </div>

          <InlineAIChat
            project={project}
            activeSceneId={activeSceneId}
            onApplyOps={applyOpsFromAgent}
            onApplyPythonCode={applyPythonCodeFromAgent}
            onOpenFullModal={() => setShowAIModal(true)}
          />

          <div
            className="panel-resizer horizontal"
            onMouseDown={(e) => startResize('timeline', e)}
            title="Drag to resize timeline"
          />

          <div className="timeline-panel" style={{ height: timelineHeight }}>
            <Timeline
              scene={activeScene}
              selectedObjectIds={selectedObjectIds}
              currentTime={currentTime}
              onTimeChange={setCurrentTime}
              onAddKeyframe={addKeyframe}
              onSelectObjects={setSelectedObjectIds}
              onUpdateObject={updateObject}
              onDropLibraryEntry={handleDropLibraryEntry}
            />
          </div>
        </div>
        
        <div
          className="panel-resizer vertical"
          onMouseDown={(e) => startResize('rightPanel', e)}
          title="Drag to resize panel"
        />
        
        <div className="right-panel" style={{ width: rightPanelWidth }} ref={rightPanelRef}>
          <div className="properties-panel-wrapper">
            <PropertiesPanel
              object={selectedObject}
              selectedObjects={selectedObjects}
              onUpdateObject={updateObject}
              onDeleteObject={deleteObject}
              onBringForward={bringForward}
              onSendBackward={sendBackward}
              onBringToFront={bringToFront}
              onSendToBack={sendToBack}
              onSelectObjects={setSelectedObjectIds}
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
              onSyncToCanvas={handleSyncToCanvas}
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

      <AIAssistantModal
        isOpen={showAIModal}
        onClose={() => { setShowAIModal(false); setAiPrefillPrompt(''); setLibraryRefreshKey(k => k + 1) }}
        project={project}
        activeSceneId={activeSceneId}
        onApplyOps={applyOpsFromAgent}
        onApplyPythonCode={applyPythonCodeFromAgent}
        prefillPrompt={aiPrefillPrompt}
      />
    </div>
  )
}

export default App

