const { app, BrowserWindow, ipcMain, dialog } = require('electron')
const path = require('path')
const fs = require('fs')
const { spawn } = require('child_process')

let mainWindow

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  // In development, load from Vite dev server
  if (process.env.NODE_ENV !== 'production') {
    mainWindow.loadURL('http://localhost:5173')
    mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }
}

app.whenReady().then(createWindow)

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})

// IPC Handlers for file operations
ipcMain.handle('save-project', async (event, projectData) => {
  const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
    title: 'Save Project',
    defaultPath: 'project.json',
    filters: [{ name: 'JSON Files', extensions: ['json'] }]
  })
  
  if (!canceled && filePath) {
    fs.writeFileSync(filePath, JSON.stringify(projectData, null, 2))
    return { success: true, path: filePath }
  }
  return { success: false }
})

ipcMain.handle('load-project', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
    title: 'Open Project',
    filters: [{ name: 'JSON Files', extensions: ['json'] }],
    properties: ['openFile']
  })
  
  if (!canceled && filePaths.length > 0) {
    const content = fs.readFileSync(filePaths[0], 'utf-8')
    return { success: true, data: JSON.parse(content), path: filePaths[0] }
  }
  return { success: false }
})

ipcMain.handle('export-mp4', async (event, outputPath) => {
  const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
    title: 'Export MP4',
    defaultPath: 'animation.mp4',
    filters: [{ name: 'MP4 Video', extensions: ['mp4'] }]
  })
  
  if (!canceled && filePath) {
    // Copy the rendered video to the chosen location
    if (fs.existsSync(outputPath)) {
      fs.copyFileSync(outputPath, filePath)
      return { success: true, path: filePath }
    }
  }
  return { success: false }
})

// Render Manim scene
ipcMain.handle('render-manim', async (event, { pythonCode, sceneName, quality }) => {
  const tempDir = path.join(app.getPath('temp'), 'manim-interactive')
  const sceneFile = path.join(tempDir, 'scene.py')
  const mediaDir = path.join(tempDir, 'media')
  
  // Ensure temp directory exists
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true })
  }
  
  // Write the Python code to a temp file
  fs.writeFileSync(sceneFile, pythonCode)
  
  // Determine quality flag
  const qualityFlag = quality === 'low' ? '-ql' : quality === 'medium' ? '-qm' : '-qh'
  
  // Path to your Manim virtual environment
  const manimEnvPath = path.join(
    process.env.HOME || '/Users/yigeyuan',
    'Documents/Cursor Code/Manim/manim-ce-env/bin/manim'
  )
  
  // Fallback to system manim if env not found
  const manimCmd = fs.existsSync(manimEnvPath) ? manimEnvPath : 'manim'
  
  mainWindow.webContents.send('render-log', `Using Manim at: ${manimCmd}\n`)
  mainWindow.webContents.send('render-log', `Scene file: ${sceneFile}\n`)
  mainWindow.webContents.send('render-log', `Scene name: ${sceneName}\n`)
  mainWindow.webContents.send('render-log', `Running: ${manimCmd} ${qualityFlag} ${sceneFile} ${sceneName}\n\n`)
  
  return new Promise((resolve) => {
    const manimProcess = spawn(manimCmd, [qualityFlag, sceneFile, sceneName, '--media_dir', mediaDir], {
      cwd: tempDir,
      env: { ...process.env }
    })
    
    let logs = ''
    let errorLogs = ''
    
    manimProcess.stdout.on('data', (data) => {
      const text = data.toString()
      logs += text
      mainWindow.webContents.send('render-log', text)
    })
    
    manimProcess.stderr.on('data', (data) => {
      const text = data.toString()
      errorLogs += text
      mainWindow.webContents.send('render-log', text)
    })
    
    manimProcess.on('close', (code) => {
      mainWindow.webContents.send('render-log', `\nManim exited with code: ${code}\n`)
      
      if (code === 0) {
        // Find the output video file - Manim puts it in videos/<filename>/<quality>/
        const qualityDir = quality === 'low' ? '480p15' : quality === 'medium' ? '720p30' : '1080p60'
        const videoPath = path.join(mediaDir, 'videos', 'scene', qualityDir, `${sceneName}.mp4`)
        
        mainWindow.webContents.send('render-log', `Looking for video at: ${videoPath}\n`)
        
        if (fs.existsSync(videoPath)) {
          mainWindow.webContents.send('render-log', `Video found! Opening preview...\n`)
          resolve({ success: true, videoPath, logs })
        } else {
          // Try to find the video in other locations
          const possiblePaths = [
            path.join(mediaDir, 'videos', 'scene', qualityDir, `${sceneName}.mp4`),
            path.join(tempDir, 'media', 'videos', 'scene', qualityDir, `${sceneName}.mp4`),
          ]
          
          // Also search recursively for any mp4 file
          const findMp4 = (dir) => {
            if (!fs.existsSync(dir)) return null
            const files = fs.readdirSync(dir, { withFileTypes: true })
            for (const file of files) {
              const fullPath = path.join(dir, file.name)
              if (file.isDirectory()) {
                const found = findMp4(fullPath)
                if (found) return found
              } else if (file.name.endsWith('.mp4')) {
                return fullPath
              }
            }
            return null
          }
          
          const foundVideo = findMp4(mediaDir)
          if (foundVideo) {
            mainWindow.webContents.send('render-log', `Found video at: ${foundVideo}\n`)
            resolve({ success: true, videoPath: foundVideo, logs })
          } else {
            mainWindow.webContents.send('render-log', `Video not found. Checked: ${videoPath}\n`)
            resolve({ success: false, error: 'Video file not found after render', logs })
          }
        }
      } else {
        resolve({ success: false, error: errorLogs || 'Render failed with code ' + code, logs })
      }
    })
    
    manimProcess.on('error', (err) => {
      mainWindow.webContents.send('render-log', `Error spawning Manim: ${err.message}\n`)
      resolve({ success: false, error: err.message, logs })
    })
  })
})

// Get video file as base64 for playback in renderer
ipcMain.handle('get-video-data', async (event, videoPath) => {
  if (fs.existsSync(videoPath)) {
    const buffer = fs.readFileSync(videoPath)
    return { success: true, data: buffer.toString('base64') }
  }
  return { success: false }
})

