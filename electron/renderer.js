/**
 * Manim rendering helpers: opsToManimCode, renderManimInternal, video file discovery.
 *
 * Expects `deps` from init():
 *   - fs: Node.js fs module
 *   - spawn: child_process.spawn
 *   - getTempDir(): returns base temp dir for manim renders
 *   - getManimCmd(): returns resolved manim binary path
 *   - sendProgress(phase, message)
 */

let _deps = {}

function init(deps) {
  _deps = deps
}

function hexToManimColor(hex) {
  if (!hex || typeof hex !== 'string') return null
  const map = {
    '#ffffff': 'WHITE', '#000000': 'BLACK', '#ff0000': 'RED', '#ef4444': 'RED',
    '#00ff00': 'GREEN', '#22c55e': 'GREEN', '#4ade80': 'GREEN',
    '#0000ff': 'BLUE', '#3b82f6': 'BLUE', '#2563eb': 'BLUE', '#1d4ed8': 'BLUE',
    '#ffff00': 'YELLOW', '#eab308': 'YELLOW', '#fbbf24': 'YELLOW',
    '#ff00ff': 'PURPLE', '#a855f7': 'PURPLE', '#8b5cf6': 'PURPLE',
    '#ffa500': 'ORANGE', '#f97316': 'ORANGE',
    '#00ffff': 'TEAL', '#06b6d4': 'TEAL', '#14b8a6': 'TEAL',
    '#ffc0cb': 'PINK', '#ec4899': 'PINK',
    '#808080': 'GRAY', '#6b7280': 'GRAY',
    '#e94560': 'RED',
  }
  return map[hex.toLowerCase()] || `ManimColor("${hex}")`
}

function objectToManimLine(obj, varName) {
  if (!obj || !obj.type) return null
  const pos = `np.array([${obj.x || 0}, ${obj.y || 0}, 0])`
  const fillColor = obj.fill ? hexToManimColor(obj.fill) : null
  const strokeColor = obj.stroke ? hexToManimColor(obj.stroke) : null
  const opacity = obj.opacity !== undefined ? obj.opacity : 1

  switch (obj.type) {
    case 'circle': {
      const r = obj.radius || 1
      let args = [`radius=${r}`]
      if (fillColor) args.push(`fill_color=${fillColor}`, `fill_opacity=${opacity}`)
      if (strokeColor) args.push(`stroke_color=${strokeColor}`)
      if (obj.strokeWidth) args.push(`stroke_width=${obj.strokeWidth}`)
      return `${varName} = Circle(${args.join(', ')}).move_to(${pos})`
    }
    case 'rectangle': {
      const w = obj.width || 2, h = obj.height || 1
      let args = [`width=${w}`, `height=${h}`]
      if (fillColor) args.push(`fill_color=${fillColor}`, `fill_opacity=${opacity}`)
      if (strokeColor) args.push(`stroke_color=${strokeColor}`)
      if (obj.strokeWidth) args.push(`stroke_width=${obj.strokeWidth}`)
      return `${varName} = Rectangle(${args.join(', ')}).move_to(${pos})`
    }
    case 'triangle': {
      let args = []
      if (fillColor) args.push(`fill_color=${fillColor}`, `fill_opacity=${opacity}`)
      if (strokeColor) args.push(`stroke_color=${strokeColor}`)
      return `${varName} = Triangle(${args.join(', ')}).move_to(${pos})`
    }
    case 'line': {
      const start = `np.array([${obj.x || 0}, ${obj.y || 0}, 0])`
      const end = `np.array([${obj.x2 || 2}, ${obj.y2 || 0}, 0])`
      let color = strokeColor || 'WHITE'
      return `${varName} = Line(${start}, ${end}, color=${color}, stroke_width=${obj.strokeWidth || 3})`
    }
    case 'arrow': {
      const start = `np.array([${obj.x || 0}, ${obj.y || 0}, 0])`
      const end = `np.array([${obj.x2 || 2}, ${obj.y2 || 0}, 0])`
      let color = strokeColor || 'YELLOW'
      return `${varName} = Arrow(${start}, ${end}, color=${color}, stroke_width=${obj.strokeWidth || 3})`
    }
    case 'dot': {
      let color = fillColor || 'WHITE'
      return `${varName} = Dot(point=${pos}, color=${color}, radius=${obj.radius || 0.08})`
    }
    case 'text': {
      let color = fillColor || 'WHITE'
      const text = (obj.text || 'Text').replace(/"/g, '\\"')
      return `${varName} = Text("${text}", color=${color}, font_size=${obj.fontSize || 48}).move_to(${pos})`
    }
    case 'latex': {
      let color = fillColor || 'WHITE'
      const tex = (obj.latex || 'x').replace(/\\/g, '\\\\')
      return `${varName} = MathTex(r"${tex}", color=${color}).move_to(${pos})`
    }
    default:
      return null
  }
}

function opsToManimCode(objects) {
  const lines = ['from manim import *', 'import numpy as np', '', 'class Preview(Scene):', '    def construct(self):']
  const validObjects = objects.filter(o => o && o.type)

  if (!validObjects.length) {
    lines.push('        self.add(Text("Empty scene"))')
    lines.push('        self.wait(1)')
    return lines.join('\n')
  }

  for (let i = 0; i < validObjects.length; i++) {
    const code = objectToManimLine(validObjects[i], `obj_${i}`)
    if (code) {
      lines.push(`        ${code}`)
    }
  }

  const varNames = validObjects.map((_, i) => `obj_${i}`)
    .filter((_, i) => objectToManimLine(validObjects[i], `obj_${i}`) !== null)
  if (varNames.length) {
    lines.push(`        self.play(${varNames.map(v => `Create(${v})`).join(', ')})`)
  }
  lines.push('        self.wait(1)')

  return lines.join('\n')
}

function findMp4(dir) {
  if (!_deps.fs.existsSync(dir)) return null
  for (const f of _deps.fs.readdirSync(dir, { withFileTypes: true })) {
    const fp = require('path').join(dir, f.name)
    if (f.isDirectory()) { const r = findMp4(fp); if (r) return r }
    else if (f.name.endsWith('.mp4')) return fp
  }
  return null
}

function renderManimInternal({ pythonCode, sceneName, quality = 'low' }) {
  const path = require('path')
  const tempDir = _deps.getTempDir()
  const sceneFile = path.join(tempDir, 'scene.py')
  const mediaDir = path.join(tempDir, 'media')
  if (!_deps.fs.existsSync(tempDir)) _deps.fs.mkdirSync(tempDir, { recursive: true })
  _deps.fs.writeFileSync(sceneFile, pythonCode)

  const qualityFlagMap = { low: '-ql', medium: '-qm', high: '-qh' }
  const qualityFlag = qualityFlagMap[quality] || '-ql'
  const manimCmd = _deps.getManimCmd()

  _deps.sendProgress?.('rendering', 'Rendering with Manim...')

  const extraArgs = quality === 'draft' ? ['--fps', '10', '-r', '426,240'] : []

  return new Promise((resolve) => {
    const proc = _deps.spawn(manimCmd, [qualityFlag, ...extraArgs, sceneFile, sceneName, '--media_dir', mediaDir], {
      cwd: tempDir, env: { ...process.env },
    })
    let logs = '', errorLogs = ''
    proc.stdout.on('data', d => { logs += d.toString() })
    proc.stderr.on('data', d => { errorLogs += d.toString() })

    proc.on('close', (code) => {
      if (code === 0) {
        const qualityDirMap = { draft: '240p10', low: '480p15', medium: '720p30', high: '1080p60' }
        const qualityDir = qualityDirMap[quality] || '480p15'
        const videoPath = path.join(mediaDir, 'videos', 'scene', qualityDir, `${sceneName}.mp4`)
        const found = _deps.fs.existsSync(videoPath) ? videoPath : findMp4(mediaDir)
        if (found) {
          const buffer = _deps.fs.readFileSync(found)
          resolve({ success: true, videoBase64: buffer.toString('base64'), videoPath: found, logs })
        } else {
          resolve({ success: false, error: 'Video file not found after render', logs })
        }
      } else {
        resolve({ success: false, error: errorLogs || `Render failed (exit ${code})`, logs })
      }
    })
    proc.on('error', (err) => resolve({ success: false, error: err.message, logs }))
  })
}

module.exports = {
  init,
  hexToManimColor,
  objectToManimLine,
  opsToManimCode,
  renderManimInternal,
}
