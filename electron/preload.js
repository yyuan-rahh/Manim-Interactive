const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  // Project save/load
  saveProject: (projectData) => ipcRenderer.invoke('save-project', projectData),
  loadProject: () => ipcRenderer.invoke('load-project'),
  
  // Export
  exportMP4: (outputPath) => ipcRenderer.invoke('export-mp4', outputPath),
  
  // Manim rendering
  renderManim: (options) => ipcRenderer.invoke('render-manim', options),
  getVideoData: (videoPath) => ipcRenderer.invoke('get-video-data', videoPath),
  
  // Render log listener
  onRenderLog: (callback) => {
    ipcRenderer.on('render-log', (event, log) => callback(log))
  },
  removeRenderLogListener: () => {
    ipcRenderer.removeAllListeners('render-log')
  },

  // App settings (stored in main process)
  getAppSettings: () => ipcRenderer.invoke('get-app-settings'),
  updateAppSettings: (partial) => ipcRenderer.invoke('update-app-settings', partial),

  // AI agent (legacy ops-only)
  agentGenerateOps: (payload) => ipcRenderer.invoke('agent-generate-ops', payload),

  // AI multi-agent pipeline
  agentGenerate: (payload) => ipcRenderer.invoke('agent-generate', payload),

  // Agent progress listener
  onAgentProgress: (callback) => {
    ipcRenderer.on('agent-progress', (event, data) => callback(data))
  },
  removeAgentProgressListener: () => {
    ipcRenderer.removeAllListeners('agent-progress')
  },

  // Code library
  libraryAdd: (entry) => ipcRenderer.invoke('library-add', entry),
  librarySearch: (prompt) => ipcRenderer.invoke('library-search', prompt),
  libraryGetAll: () => ipcRenderer.invoke('library-get-all'),
  libraryDelete: (id) => ipcRenderer.invoke('library-delete', id),
  libraryAddComponents: (payload) => ipcRenderer.invoke('library-add-components', payload),
  libraryClear: () => ipcRenderer.invoke('library-clear'),
})

