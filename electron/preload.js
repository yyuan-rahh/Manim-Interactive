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
  }
})

