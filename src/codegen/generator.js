/**
 * Generate Manim Python code from project JSON
 */
export function generateManimCode(project, activeSceneId) {
  const lines = []
  
  // Imports
  lines.push('from manim import *')
  lines.push('')
  
  // Generate a Scene class for each scene
  project.scenes.forEach((scene, index) => {
    const className = sanitizeClassName(scene.name)
    const isActive = scene.id === activeSceneId
    
    lines.push(`class ${className}(Scene):`)
    lines.push('    def construct(self):')
    
    if (scene.objects.length === 0) {
      lines.push('        pass  # Empty scene')
    } else {
      // Generate object creation code
      // Note: objects that are transform targets get their own target variable, and are not "created" directly.
      const idToSourceVar = new Map()
      const idToTargetVar = new Map()
      const idToIndex = new Map()
      scene.objects.forEach((obj, objIndex) => {
        idToIndex.set(obj.id, objIndex)
      })

      scene.objects.forEach((obj, objIndex) => {
        const isTransformTarget = !!obj.transformFromId
        const varName = isTransformTarget ? `target_${objIndex}` : `obj_${objIndex}`

        if (isTransformTarget) {
          idToTargetVar.set(obj.id, varName)
        } else {
          idToSourceVar.set(obj.id, varName)
        }

        const creation = generateObjectCreation(obj, varName, scene.objects)
        if (creation) {
          // Ensure multi-line object creations are properly indented
          const creationLines = creation.split('\n')
          creationLines.forEach((cl, i) => {
            lines.push(`        ${cl}`)
          })
        }
      })
      
      lines.push('')
      
      // Generate animations based on keyframes (now supports transforms)
      const animations = generateAnimations(scene.objects, { idToSourceVar, idToTargetVar })
      if (animations.length > 0) {
        animations.forEach(anim => {
          lines.push(`        ${anim}`)
        })
      } else {
        // Default: Animate objects with their entry animation settings (supports transforms)
        const defaultAnims = generateDefaultAnimations(scene.objects, { idToSourceVar, idToTargetVar })
        defaultAnims.forEach(a => lines.push(`        ${a}`))
      }
    }
    
    lines.push('')
  })
  
  return lines.join('\n')
}

function generateDefaultAnimations(objects, { idToSourceVar, idToTargetVar }) {
  const out = []

  // Current variable that represents each logical object on screen (for chains)
  const curVarById = new Map()
  for (const [id, v] of idToSourceVar.entries()) curVarById.set(id, v)
  for (const [id, v] of idToTargetVar.entries()) curVarById.set(id, v)

  // Group by delay time
  const byDelay = new Map()
  objects.forEach((obj) => {
    const delay = obj.delay || 0
    if (!byDelay.has(delay)) byDelay.set(delay, [])
    byDelay.get(delay).push(obj)
  })

  const sortedDelays = [...byDelay.keys()].sort((a, b) => a - b)
  let currentTime = 0

  sortedDelays.forEach(delay => {
    if (delay > currentTime) {
      out.push(`self.wait(${(delay - currentTime).toFixed(1)})`)
      currentTime = delay
    }

    const items = byDelay.get(delay)
    const creations = []
    const transforms = []

    items.forEach((obj) => {
      const runTime = obj.runTime || 1

      if (obj.transformFromId) {
        const srcVar = curVarById.get(obj.transformFromId) || idToSourceVar.get(obj.transformFromId)
        const tgtVar = idToTargetVar.get(obj.id) || curVarById.get(obj.id)
        if (srcVar && tgtVar) {
          const tType = obj.transformType || 'Transform'
          transforms.push({ srcVar, tgtVar, tType, runTime, srcId: obj.transformFromId, objId: obj.id })
        }
      } else {
        const varName = idToSourceVar.get(obj.id) || curVarById.get(obj.id)
        const anim = obj.animationType && obj.animationType !== 'auto'
          ? obj.animationType
          : getDefaultAnimation(obj.type)
        if (varName) {
          creations.push({ expr: `${anim}(${varName}, run_time=${runTime})`, runTime })
        }
      }
    })

    if (creations.length > 0) {
      out.push(`self.play(${creations.map(c => c.expr).join(', ')})`)
      currentTime = delay + Math.max(...creations.map(c => c.runTime))
    }

    if (transforms.length > 0) {
      out.push(`self.play(${transforms.map(t => `${t.tType}(${t.srcVar}, ${t.tgtVar}, run_time=${t.runTime})`).join(', ')})`)
      // After transforms complete, advance time and update mapping so chains work
      currentTime = Math.max(currentTime, delay + Math.max(...transforms.map(t => t.runTime)))
      transforms.forEach(t => {
        // For Transform: the source object remains on screen, keep using it
        // For ReplacementTransform: the target replaces the source
        if (t.tType === 'ReplacementTransform') {
          out.push(`${t.srcVar} = ${t.tgtVar}`)
          curVarById.set(t.srcId, t.tgtVar)
          curVarById.set(t.objId, t.tgtVar)
        } else {
          // Regular Transform: source stays on screen, subsequent transforms should use srcVar
          curVarById.set(t.objId, t.srcVar)
        }
      })
    }
  })

  out.push('self.wait(1)')
  return out
}

/**
 * Convert scene name to valid Python class name
 */
function sanitizeClassName(name) {
  // Remove non-alphanumeric, capitalize words, remove spaces
  return name
    .replace(/[^a-zA-Z0-9\s]/g, '')
    .split(/\s+/)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join('')
    || 'Scene1'
}

/**
 * Generate Python code for creating a Manim object
 */
function generateObjectCreation(obj, varName, objects = []) {
  const pos = `[${obj.x}, ${obj.y}, 0]`
  
  switch (obj.type) {
    case 'rectangle': {
      const fill = obj.fill ? colorToManim(obj.fill) : 'None'
      const stroke = obj.stroke ? colorToManim(obj.stroke) : 'WHITE'
      return `${varName} = Rectangle(width=${obj.width}, height=${obj.height}, fill_color=${fill}, fill_opacity=${obj.fill ? obj.opacity : 0}, stroke_color=${stroke}, stroke_width=${obj.strokeWidth || 2}).move_to(${pos})`
    }
    
    case 'circle': {
      const fill = obj.fill ? colorToManim(obj.fill) : 'None'
      const stroke = obj.stroke ? colorToManim(obj.stroke) : 'WHITE'
      return `${varName} = Circle(radius=${obj.radius}, fill_color=${fill}, fill_opacity=${obj.fill ? obj.opacity : 0}, stroke_color=${stroke}, stroke_width=${obj.strokeWidth || 2}).move_to(${pos})`
    }
    
    case 'line': {
      const stroke = obj.stroke ? colorToManim(obj.stroke) : 'WHITE'
      return `${varName} = Line([${obj.x}, ${obj.y}, 0], [${obj.x2}, ${obj.y2}, 0], color=${stroke}, stroke_width=${obj.strokeWidth || 2})`
    }
    
    case 'arrow': {
      const stroke = obj.stroke ? colorToManim(obj.stroke) : 'YELLOW'
      return `${varName} = Arrow([${obj.x}, ${obj.y}, 0], [${obj.x2}, ${obj.y2}, 0], color=${stroke}, stroke_width=${obj.strokeWidth || 2})`
    }

    case 'arc': {
      const stroke = obj.stroke ? colorToManim(obj.stroke) : 'WHITE'
      const strokeWidth = obj.strokeWidth || 3

      // Non-circular curve: quadratic Bézier.
      // We store `cx, cy` as the midpoint-on-curve at t=0.5 and derive the actual control point P1.
      const x0 = obj.x, y0 = obj.y
      const x2 = obj.x2, y2 = obj.y2
      const x1 = 2 * obj.cx - 0.5 * (x0 + x2)
      const y1 = 2 * obj.cy - 0.5 * (y0 + y2)

      return `${varName} = QuadraticBezier([${x0}, ${y0}, 0], [${x1.toFixed(4)}, ${y1.toFixed(4)}, 0], [${x2}, ${y2}, 0]).set_stroke(color=${stroke}, width=${strokeWidth})`
    }
    
    case 'dot': {
      const fill = obj.fill ? colorToManim(obj.fill) : 'WHITE'
      return `${varName} = Dot(point=${pos}, radius=${obj.radius}, color=${fill})`
    }
    
    case 'triangle': {
      const fill = obj.fill ? colorToManim(obj.fill) : 'None'
      const stroke = obj.stroke ? colorToManim(obj.stroke) : 'WHITE'
      const verts = obj.vertices || [{ x: 0, y: 1 }, { x: -0.866, y: -0.5 }, { x: 0.866, y: -0.5 }]
      const points = verts.map(v => `[${(obj.x + v.x).toFixed(2)}, ${(obj.y + v.y).toFixed(2)}, 0]`).join(', ')
      return `${varName} = Polygon(${points}, fill_color=${fill}, fill_opacity=${obj.fill ? obj.opacity : 0}, stroke_color=${stroke}, stroke_width=${obj.strokeWidth || 2})`
    }
    
    case 'polygon': {
      const fill = obj.fill ? colorToManim(obj.fill) : 'None'
      const stroke = obj.stroke ? colorToManim(obj.stroke) : 'WHITE'
      const verts = obj.vertices || []
      if (verts.length >= 3) {
        const points = verts.map(v => `[${(obj.x + v.x).toFixed(2)}, ${(obj.y + v.y).toFixed(2)}, 0]`).join(', ')
        return `${varName} = Polygon(${points}, fill_color=${fill}, fill_opacity=${obj.fill ? obj.opacity : 0}, stroke_color=${stroke}, stroke_width=${obj.strokeWidth || 2})`
      } else {
        // Fallback to regular polygon if no vertices
        return `${varName} = RegularPolygon(n=${obj.sides || 5}, radius=${obj.radius || 1}, fill_color=${fill}, fill_opacity=${obj.fill ? obj.opacity : 0}, stroke_color=${stroke}, stroke_width=${obj.strokeWidth || 2}).move_to(${pos})`
      }
    }
    
    case 'text': {
      const fill = obj.fill ? colorToManim(obj.fill) : 'WHITE'
      const escaped = (obj.text || 'Text').replace(/"/g, '\\"')
      return `${varName} = Text("${escaped}", font_size=${obj.fontSize || 48}, color=${fill}).move_to(${pos})`
    }
    
    case 'latex': {
      const fill = obj.fill ? colorToManim(obj.fill) : 'WHITE'
      // LaTeX in raw strings doesn't need double escaping
      const latex = obj.latex || '\\frac{a}{b}'
      return `${varName} = MathTex(r"${latex}", color=${fill}).move_to(${pos})`
    }
    
    case 'axes': {
      const stroke = obj.stroke ? colorToManim(obj.stroke) : 'WHITE'
      const strokeWidth = obj.strokeWidth || 2
      const xMin = obj.xRange?.min ?? -5
      const xMax = obj.xRange?.max ?? 5
      const xStep = obj.xRange?.step ?? 1
      const yMin = obj.yRange?.min ?? -3
      const yMax = obj.yRange?.max ?? 3
      const yStep = obj.yRange?.step ?? 1
      const xLen = obj.xLength ?? 8
      const yLen = obj.yLength ?? 4
      const includeTicks = obj.showTicks !== false

      return `${varName} = Axes(
            x_range=[${xMin}, ${xMax}, ${xStep}],
            y_range=[${yMin}, ${yMax}, ${yStep}],
            x_length=${xLen},
            y_length=${yLen},
            axis_config={"color": ${stroke}, "stroke_width": ${strokeWidth}},
            tips=False
        )
        ${varName}.shift(np.array(${pos}) - ${varName}.c2p(0, 0))`
    }
    
    default:
      return null
  }
}

/**
 * Generate animations from keyframes
 */
function generateAnimations(objects, { idToSourceVar, idToTargetVar }) {
  const animations = []

  // Current variable that represents each logical object on screen (for chains)
  const curVarById = new Map()
  for (const [id, v] of idToSourceVar.entries()) curVarById.set(id, v)
  for (const [id, v] of idToTargetVar.entries()) curVarById.set(id, v)
  
  // Group keyframes by time
  const timeMap = new Map()
  
  objects.forEach((obj) => {
    if (obj.keyframes && obj.keyframes.length > 0) {
      obj.keyframes.forEach(kf => {
        if (!timeMap.has(kf.time)) timeMap.set(kf.time, [])
        timeMap.get(kf.time).push({ objectId: obj.id, ...kf })
      })
    }
  })
  
  // Sort times
  const sortedTimes = [...timeMap.keys()].sort((a, b) => a - b)
  
  // Generate animation calls
  let currentTime = 0
  
  // Create objects respecting their delay and runTime (supports transforms)
  const byDelay = new Map()
  objects.forEach((obj) => {
    const delay = obj.delay || 0
    if (!byDelay.has(delay)) byDelay.set(delay, [])
    byDelay.get(delay).push(obj)
  })
  
  const sortedDelays = [...byDelay.keys()].sort((a, b) => a - b)
  
    sortedDelays.forEach(delay => {
      if (delay > currentTime) {
        animations.push(`self.wait(${(delay - currentTime).toFixed(1)})`)
        currentTime = delay
      }
      
      const items = byDelay.get(delay)
    const creations = []
    const transforms = []

    items.forEach((obj) => {
      const runTime = obj.runTime || 1
      if (obj.transformFromId) {
        const srcVar = curVarById.get(obj.transformFromId) || idToSourceVar.get(obj.transformFromId)
        const tgtVar = idToTargetVar.get(obj.id) || curVarById.get(obj.id)
        if (srcVar && tgtVar) {
          const tType = obj.transformType || 'Transform'
          transforms.push({ srcVar, tgtVar, tType, runTime, srcId: obj.transformFromId, objId: obj.id })
        }
      } else {
        const varName = idToSourceVar.get(obj.id) || curVarById.get(obj.id)
        const anim = obj.animationType && obj.animationType !== 'auto' 
          ? obj.animationType 
          : getDefaultAnimation(obj.type)
        if (varName) {
          creations.push({ expr: `${anim}(${varName}, run_time=${runTime})`, runTime })
        }
      }
    })

    if (creations.length > 0) {
      animations.push(`self.play(${creations.map(c => c.expr).join(', ')})`)
      currentTime = delay + Math.max(...creations.map(c => c.runTime))
    }

    if (transforms.length > 0) {
      animations.push(`self.play(${transforms.map(t => `${t.tType}(${t.srcVar}, ${t.tgtVar}, run_time=${t.runTime})`).join(', ')})`)
      currentTime = Math.max(currentTime, delay + Math.max(...transforms.map(t => t.runTime)))
      transforms.forEach(t => {
        // For Transform: the source object remains on screen, keep using it
        // For ReplacementTransform: the target replaces the source
        if (t.tType === 'ReplacementTransform') {
          animations.push(`${t.srcVar} = ${t.tgtVar}`)
          curVarById.set(t.srcId, t.tgtVar)
          curVarById.set(t.objId, t.tgtVar)
        } else {
          // Regular Transform: source stays on screen, subsequent transforms should use srcVar
          curVarById.set(t.objId, t.srcVar)
        }
      })
    }
    })
  
  // Now handle keyframes
  sortedTimes.forEach(time => {
    const keyframes = timeMap.get(time)
    
    // Wait until this keyframe time
    if (time > currentTime) {
      animations.push(`self.wait(${(time - currentTime).toFixed(1)})`)
    }
    
    // Group by variable for combined transforms
    const byObj = new Map()
    keyframes.forEach(kf => {
      if (!byObj.has(kf.objectId)) byObj.set(kf.objectId, [])
      byObj.get(kf.objectId).push(kf)
    })
    
    // Generate animations for this time
    const anims = []
    byObj.forEach((kfs, objectId) => {
      const varName = curVarById.get(objectId) || idToSourceVar.get(objectId) || idToTargetVar.get(objectId)
      if (!varName) return

      kfs.forEach(kf => {
        switch (kf.property) {
          case 'x':
          case 'y':
            // Position change - would need to track target position
            anims.push(`${varName}.animate.move_to([${kf.value}, ${varName}.get_center()[1], 0])`)
            break
          case 'opacity':
            if (kf.value === 0) {
              anims.push(`FadeOut(${varName})`)
            } else {
              anims.push(`${varName}.animate.set_opacity(${kf.value})`)
            }
            break
          case 'rotation':
            anims.push(`Rotate(${varName}, ${kf.value} * DEGREES)`)
            break
        }
      })
    })
    
    if (anims.length > 0) {
      animations.push(`self.play(${anims.join(', ')})`)
    }
    
    currentTime = time
  })
  
  // Final wait
  if (animations.length > 0) {
    animations.push('self.wait(1)')
  }
  
  return animations
}

/**
 * Get default animation for object type
 */
function getDefaultAnimation(type) {
  switch (type) {
    case 'text':
    case 'latex':
      return 'Write'
    case 'circle':
    case 'dot':
      return 'GrowFromCenter'
    case 'line':
    case 'arrow':
      return 'Create'
    case 'polygon':
    case 'triangle':
      return 'DrawBorderThenFill'
    default:
      return 'Create'
  }
}

/**
 * Convert hex color to Manim color constant or hex string
 */
function colorToManim(hex) {
  const colorMap = {
    '#ffffff': 'WHITE',
    '#000000': 'BLACK',
    '#ff0000': 'RED',
    '#00ff00': 'GREEN',
    '#0000ff': 'BLUE',
    '#ffff00': 'YELLOW',
    '#ff00ff': 'PINK',
    '#00ffff': 'TEAL',
    '#ffa500': 'ORANGE',
    '#800080': 'PURPLE',
    '#e94560': '"#e94560"',
    '#4ade80': '"#4ade80"',
    '#fbbf24': '"#fbbf24"',
    '#8b5cf6': '"#8b5cf6"',
  }
  
  const lower = hex.toLowerCase()
  return colorMap[lower] || `"${hex}"`
}

