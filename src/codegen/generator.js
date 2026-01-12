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
      scene.objects.forEach((obj, objIndex) => {
        const varName = `obj_${objIndex}`
        const creation = generateObjectCreation(obj, varName)
        if (creation) {
          lines.push(`        ${creation}`)
        }
      })
      
      lines.push('')
      
      // Generate animations based on keyframes
      const animations = generateAnimations(scene.objects)
      if (animations.length > 0) {
        animations.forEach(anim => {
          lines.push(`        ${anim}`)
        })
      } else {
        // Default: Animate objects with their entry animation settings
        // Group by delay time
        const byDelay = new Map()
        scene.objects.forEach((obj, i) => {
          const delay = obj.delay || 0
          if (!byDelay.has(delay)) {
            byDelay.set(delay, [])
          }
          byDelay.get(delay).push({ obj, varName: `obj_${i}` })
        })
        
        const sortedDelays = [...byDelay.keys()].sort((a, b) => a - b)
        let currentTime = 0
        
        sortedDelays.forEach(delay => {
          // Wait if needed
          if (delay > currentTime) {
            lines.push(`        self.wait(${(delay - currentTime).toFixed(1)})`)
            currentTime = delay
          }
          
          const items = byDelay.get(delay)
          const anims = items.map(({ obj, varName }) => {
            const anim = getDefaultAnimation(obj.type)
            const runTime = obj.runTime || 1
            return `${anim}(${varName}, run_time=${runTime})`
          })
          
          lines.push(`        self.play(${anims.join(', ')})`)
          
          // Update current time based on longest animation
          const maxRunTime = Math.max(...items.map(({ obj }) => obj.runTime || 1))
          currentTime = delay + maxRunTime
        })
        
        lines.push('        self.wait(1)')
      }
    }
    
    lines.push('')
  })
  
  return lines.join('\n')
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
function generateObjectCreation(obj, varName) {
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
    
    case 'dot': {
      const fill = obj.fill ? colorToManim(obj.fill) : 'WHITE'
      return `${varName} = Dot(point=${pos}, radius=${obj.radius}, color=${fill})`
    }
    
    case 'polygon': {
      const fill = obj.fill ? colorToManim(obj.fill) : 'None'
      const stroke = obj.stroke ? colorToManim(obj.stroke) : 'WHITE'
      return `${varName} = RegularPolygon(n=${obj.sides}, radius=${obj.radius}, fill_color=${fill}, fill_opacity=${obj.fill ? obj.opacity : 0}, stroke_color=${stroke}, stroke_width=${obj.strokeWidth || 2}).move_to(${pos})`
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
    
    default:
      return null
  }
}

/**
 * Generate animations from keyframes
 */
function generateAnimations(objects) {
  const animations = []
  
  // Group keyframes by time
  const timeMap = new Map()
  
  objects.forEach((obj, objIndex) => {
    const varName = `obj_${objIndex}`
    
    if (obj.keyframes && obj.keyframes.length > 0) {
      obj.keyframes.forEach(kf => {
        if (!timeMap.has(kf.time)) {
          timeMap.set(kf.time, [])
        }
        timeMap.get(kf.time).push({ varName, ...kf })
      })
    }
  })
  
  // Sort times
  const sortedTimes = [...timeMap.keys()].sort((a, b) => a - b)
  
  // Generate animation calls
  let prevTime = 0
  
  // First, create all objects
  const createAnims = objects.map((_, i) => `Create(obj_${i})`).join(', ')
  if (createAnims) {
    animations.push(`self.play(${createAnims})`)
  }
  
  sortedTimes.forEach(time => {
    const keyframes = timeMap.get(time)
    
    // Wait until this keyframe time
    if (time > prevTime) {
      animations.push(`self.wait(${(time - prevTime).toFixed(1)})`)
    }
    
    // Group by variable for combined transforms
    const byVar = new Map()
    keyframes.forEach(kf => {
      if (!byVar.has(kf.varName)) {
        byVar.set(kf.varName, [])
      }
      byVar.get(kf.varName).push(kf)
    })
    
    // Generate animations for this time
    const anims = []
    byVar.forEach((kfs, varName) => {
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
    
    prevTime = time
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

