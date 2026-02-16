/**
 * Deterministic Python-to-ops parser for bidirectional code sync.
 * 
 * Parses common Manim patterns (Circle, Rectangle, MathTex, etc.)
 * and extracts canvas-compatible ops, without requiring an LLM call.
 */

/** @typedef {import('../types').AgentOp} AgentOp */
/** @typedef {import('../types').SceneObject} SceneObject */

const COLOR_MAP = {
  RED: '#ef4444', BLUE: '#3b82f6', GREEN: '#22c55e', YELLOW: '#eab308',
  ORANGE: '#f97316', PURPLE: '#a855f7', PINK: '#ec4899', WHITE: '#ffffff',
  BLACK: '#000000', TEAL: '#14b8a6', GOLD: '#ca8a04', MAROON: '#7f1d1d',
  GREY: '#6b7280', GRAY: '#6b7280',
  BLUE_A: '#c7e9f1', BLUE_B: '#9cdceb', BLUE_C: '#58c4dd', BLUE_D: '#29abca', BLUE_E: '#1c758a',
  GREEN_A: '#c9e2ae', GREEN_B: '#a6cf8c', GREEN_C: '#83c167', GREEN_D: '#77b05d', GREEN_E: '#699c52',
  RED_A: '#f7a1a3', RED_B: '#ff8080', RED_C: '#fc6255', RED_D: '#e65a4c', RED_E: '#cf5044',
  YELLOW_A: '#fff1b6', YELLOW_B: '#ffea94', YELLOW_C: '#ffff00', YELLOW_D: '#f4d345', YELLOW_E: '#e8c11c',
}

function resolveManimColor(colorStr) {
  if (!colorStr) return null
  const trimmed = colorStr.trim()
  if (COLOR_MAP[trimmed]) return COLOR_MAP[trimmed]
  if (/^#[0-9a-fA-F]{3,8}$/.test(trimmed)) return trimmed
  if (/^".*"$/.test(trimmed) || /^'.*'$/.test(trimmed)) {
    const inner = trimmed.slice(1, -1)
    if (/^#[0-9a-fA-F]{3,8}$/.test(inner)) return inner
    return COLOR_MAP[inner.toUpperCase()] || inner
  }
  return COLOR_MAP[trimmed.toUpperCase()] || null
}

function extractKwarg(text, name) {
  const re = new RegExp(`${name}\\s*=\\s*([^,)]+)`)
  const m = text.match(re)
  return m ? m[1].trim() : null
}

function extractNumber(text, name) {
  const raw = extractKwarg(text, name)
  if (raw === null) return null
  const n = parseFloat(raw)
  return isNaN(n) ? null : n
}

function extractString(text, name) {
  const raw = extractKwarg(text, name)
  if (!raw) return null
  const m = raw.match(/^["'](.*)["']$/)
  return m ? m[1] : raw
}

function extractPositionalArgs(argsStr) {
  const args = []
  let depth = 0
  let current = ''
  for (const ch of argsStr) {
    if (ch === '(' || ch === '[') depth++
    else if (ch === ')' || ch === ']') depth--
    if (ch === ',' && depth === 0) {
      args.push(current.trim())
      current = ''
    } else {
      current += ch
    }
  }
  if (current.trim()) args.push(current.trim())
  return args
}

function parseMoveTo(line) {
  const m = line.match(/\.move_to\(\s*\[?\s*([-.\d]+)\s*,\s*([-.\d]+)(?:\s*,\s*[-.\d]+)?\s*\]?\s*\)/)
  if (m) return { x: parseFloat(m[1]), y: parseFloat(m[2]) }
  const named = line.match(/\.move_to\(\s*(\w+)\s*\)/)
  if (named) {
    const dir = named[1].toUpperCase()
    const dirs = { UP: [0, 2], DOWN: [0, -2], LEFT: [-3, 0], RIGHT: [3, 0], ORIGIN: [0, 0], UL: [-3, 2], UR: [3, 2], DL: [-3, -2], DR: [3, -2] }
    if (dirs[dir]) return { x: dirs[dir][0], y: dirs[dir][1] }
  }
  return null
}

function parseShift(line) {
  const m = line.match(/\.shift\(\s*\[?\s*([-.\d]+)\s*,\s*([-.\d]+)(?:\s*,\s*[-.\d]+)?\s*\]?\s*\)/)
  if (m) return { dx: parseFloat(m[1]), dy: parseFloat(m[2]) }
  const dirMatch = line.match(/\.shift\(\s*([-.\d]*)\s*\*?\s*(\w+)\s*\)/)
  if (dirMatch) {
    const factor = dirMatch[1] ? parseFloat(dirMatch[1]) || 1 : 1
    const dir = dirMatch[2].toUpperCase()
    const dirs = { UP: [0, 1], DOWN: [0, -1], LEFT: [-1, 0], RIGHT: [1, 0] }
    if (dirs[dir]) return { dx: dirs[dir][0] * factor, dy: dirs[dir][1] * factor }
  }
  return null
}

function parseObjectCreation(line) {
  const patterns = [
    { re: /Circle\(([^)]*)\)/, type: 'circle' },
    { re: /Square\(([^)]*)\)/, type: 'rectangle' },
    { re: /Rectangle\(([^)]*)\)/, type: 'rectangle' },
    { re: /Line\(([^)]*)\)/, type: 'line' },
    { re: /Arrow\(([^)]*)\)/, type: 'arrow' },
    { re: /Dot\(([^)]*)\)/, type: 'dot' },
    { re: /Text\(([^)]*)\)/, type: 'text' },
    { re: /MathTex\(([^)]*)\)/, type: 'latex' },
    { re: /Tex\(([^)]*)\)/, type: 'latex' },
    { re: /Axes\(([^)]*)\)/, type: 'axes' },
    { re: /Triangle\(([^)]*)\)/, type: 'triangle' },
  ]

  for (const pat of patterns) {
    const m = line.match(pat.re)
    if (!m) continue
    const argsStr = m[1]
    const obj = { type: pat.type, x: 0, y: 0 }

    const color = extractKwarg(argsStr, 'color') || extractKwarg(argsStr, 'fill_color')
    if (color) {
      const resolved = resolveManimColor(color)
      if (resolved) obj.fill = resolved
    }

    const stroke = extractKwarg(argsStr, 'stroke_color')
    if (stroke) {
      const resolved = resolveManimColor(stroke)
      if (resolved) obj.stroke = resolved
    }

    const strokeWidth = extractNumber(argsStr, 'stroke_width')
    if (strokeWidth !== null) obj.strokeWidth = strokeWidth

    const fillOpacity = extractNumber(argsStr, 'fill_opacity')
    if (fillOpacity !== null) obj.opacity = fillOpacity

    switch (pat.type) {
      case 'circle': {
        const r = extractNumber(argsStr, 'radius')
        if (r !== null) obj.radius = r
        else obj.radius = 1
        break
      }
      case 'rectangle': {
        const w = extractNumber(argsStr, 'width')
        const h = extractNumber(argsStr, 'height')
        if (w !== null) obj.width = w
        if (h !== null) obj.height = h
        if (pat.re.source.startsWith('Square')) {
          const side = extractNumber(argsStr, 'side_length')
          if (side !== null) { obj.width = side; obj.height = side }
          else { obj.width = obj.width || 2; obj.height = obj.width }
        } else {
          obj.width = obj.width || 2
          obj.height = obj.height || 1
        }
        break
      }
      case 'line':
      case 'arrow': {
        const posArgs = extractPositionalArgs(argsStr)
        if (posArgs.length >= 2) {
          const parsePoint = (s) => {
            const pm = s.match(/\[\s*([-.\d]+)\s*,\s*([-.\d]+)/)
            return pm ? [parseFloat(pm[1]), parseFloat(pm[2])] : null
          }
          const p1 = parsePoint(posArgs[0])
          const p2 = parsePoint(posArgs[1])
          if (p1 && p2) {
            obj.x = p1[0]; obj.y = p1[1]
            obj.x2 = p2[0]; obj.y2 = p2[1]
          }
        }
        if (!obj.fill) obj.stroke = obj.stroke || '#ffffff'
        break
      }
      case 'text': {
        const posArgs = extractPositionalArgs(argsStr)
        if (posArgs.length > 0) {
          const tm = posArgs[0].match(/^["'](.*)["']$/)
          if (tm) obj.text = tm[1]
        }
        const fontSize = extractNumber(argsStr, 'font_size')
        if (fontSize !== null) obj.fontSize = fontSize
        break
      }
      case 'latex': {
        const posArgs = extractPositionalArgs(argsStr)
        if (posArgs.length > 0) {
          const tm = posArgs[0].match(/^["'](.*)["']$/)
          if (tm) obj.latex = tm[1]
        }
        break
      }
      case 'axes': {
        const xRange = argsStr.match(/x_range\s*=\s*\[\s*([-.\d]+)\s*,\s*([-.\d]+)(?:\s*,\s*([-.\d]+))?\s*\]/)
        if (xRange) {
          obj.xRange = { min: parseFloat(xRange[1]), max: parseFloat(xRange[2]) }
          if (xRange[3]) obj.xRange.step = parseFloat(xRange[3])
        }
        const yRange = argsStr.match(/y_range\s*=\s*\[\s*([-.\d]+)\s*,\s*([-.\d]+)(?:\s*,\s*([-.\d]+))?\s*\]/)
        if (yRange) {
          obj.yRange = { min: parseFloat(yRange[1]), max: parseFloat(yRange[2]) }
          if (yRange[3]) obj.yRange.step = parseFloat(yRange[3])
        }
        const xLen = extractNumber(argsStr, 'x_length')
        const yLen = extractNumber(argsStr, 'y_length')
        if (xLen !== null) obj.xLength = xLen
        if (yLen !== null) obj.yLength = yLen
        break
      }
      default:
        break
    }

    const moveTo = parseMoveTo(line)
    if (moveTo) { obj.x = moveTo.x; obj.y = moveTo.y }

    const shift = parseShift(line)
    if (shift) { obj.x += shift.dx; obj.y += shift.dy }

    return obj
  }
  return null
}

/**
 * Parse Manim Python source into canvas-compatible agent ops.
 * @param {string} pythonCode
 * @returns {AgentOp[]}
 */
export function parsePythonToOps(pythonCode) {
  if (!pythonCode || typeof pythonCode !== 'string') return []

  const lines = pythonCode.split('\n')
  const ops = []
  const varMap = {}

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue

    const assignMatch = trimmed.match(/^(\w+)\s*=\s*(.+)/)
    if (assignMatch) {
      const varName = assignMatch[1]
      const rhs = assignMatch[2]
      const obj = parseObjectCreation(rhs)
      if (obj) {
        obj.id = crypto.randomUUID()
        obj.name = varName
        obj.keyframes = obj.keyframes || []
        obj.runTime = obj.runTime || 1
        obj.delay = obj.delay || 0
        obj.animationType = obj.animationType || 'auto'
        obj.exitAnimationType = obj.exitAnimationType || 'FadeOut'
        obj.rotation = obj.rotation || 0
        obj.opacity = obj.opacity ?? 1
        obj.zIndex = obj.zIndex || 0

        if (!obj.fill && !obj.stroke) {
          obj.stroke = '#ffffff'
          obj.strokeWidth = obj.strokeWidth || 2
        }

        varMap[varName] = obj
        ops.push({ type: 'addObject', object: obj })
        continue
      }
    }

    if (!assignMatch) {
      for (const [varName, obj] of Object.entries(varMap)) {
        if (!trimmed.includes(varName)) continue

        const moveTo = parseMoveTo(trimmed)
        if (moveTo) {
          obj.x = moveTo.x
          obj.y = moveTo.y
        }

        const shift = parseShift(trimmed)
        if (shift) {
          obj.x = (obj.x || 0) + shift.dx
          obj.y = (obj.y || 0) + shift.dy
        }

        const scaleMatch = trimmed.match(/\.scale\(\s*([-.\d]+)\s*\)/)
        if (scaleMatch) {
          const factor = parseFloat(scaleMatch[1])
          if (obj.radius) obj.radius *= factor
          if (obj.width) obj.width *= factor
          if (obj.height) obj.height *= factor
        }

        const colorMatch = trimmed.match(/\.set_color\(\s*(\w+|"[^"]+"|'[^']+')\s*\)/)
        if (colorMatch) {
          const resolved = resolveManimColor(colorMatch[1])
          if (resolved) obj.fill = resolved
        }

        const opacityMatch = trimmed.match(/\.set_opacity\(\s*([-.\d]+)\s*\)/)
        if (opacityMatch) {
          obj.opacity = parseFloat(opacityMatch[1])
        }

        const rotateMatch = trimmed.match(/\.rotate\(\s*([-.\d]+)/)
        if (rotateMatch) {
          obj.rotation = (obj.rotation || 0) + parseFloat(rotateMatch[1]) * (180 / Math.PI)
        }
      }
    }
  }

  return ops
}
