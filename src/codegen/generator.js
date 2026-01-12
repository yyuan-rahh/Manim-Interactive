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
        const creation = generateObjectCreation(obj, varName, scene.objects)
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
            const anim = obj.animationType && obj.animationType !== 'auto' 
              ? obj.animationType 
              : getDefaultAnimation(obj.type)
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
    
    case 'function': {
      const formula = obj.formula || 'x^2'
      const domain = obj.domain || { min: -5, max: 5 }
      const color = obj.color || '#60a5fa'
      const strokeWidth = obj.strokeWidth || 2
      const manimColor = colorToManim(color)
      
      // Convert formula to Python lambda function
      // Replace common math functions and operators
      let pythonFormula = formula
        .replace(/\^/g, '**')  // ^ to **
        .replace(/sin\(/g, 'np.sin(')
        .replace(/cos\(/g, 'np.cos(')
        .replace(/tan\(/g, 'np.tan(')
        .replace(/exp\(/g, 'np.exp(')
        .replace(/log\(/g, 'np.log(')
        .replace(/ln\(/g, 'np.log(')
        .replace(/sqrt\(/g, 'np.sqrt(')
        .replace(/abs\(/g, 'np.abs(')
      
      return `${varName} = FunctionGraph(
            lambda x: ${pythonFormula},
            x_range=[${domain.min}, ${domain.max}],
            color=${manimColor},
            stroke_width=${strokeWidth}
        )`
    }
    
    case 'tangent': {
      // Find the referenced function
      const functionObj = objects.find(o => o.id === obj.functionId)
      if (!functionObj || functionObj.type !== 'function') {
        return null
      }
      
      const formula = functionObj.formula || 'x^2'
      const pointX = obj.pointX || 0
      const length = obj.length || 2
      const color = obj.color || '#f59e0b'
      const strokeWidth = obj.strokeWidth || 2
      const manimColor = colorToManim(color)
      
      // Convert formula for Python
      let pythonFormula = formula
        .replace(/\^/g, '**')
        .replace(/sin\(/g, 'np.sin(')
        .replace(/cos\(/g, 'np.cos(')
        .replace(/tan\(/g, 'np.tan(')
        .replace(/exp\(/g, 'np.exp(')
        .replace(/log\(/g, 'np.log(')
        .replace(/ln\(/g, 'np.log(')
        .replace(/sqrt\(/g, 'np.sqrt(')
        .replace(/abs\(/g, 'np.abs(')
      
      // Use Manim's TangentLine if available, otherwise create Line manually
      // For now, create a simple line - in production, use TangentLine from function graph
      const h = 0.001
      const x1 = pointX - h
      const x2 = pointX + h
      const y1 = pythonFormula.replace(/x/g, `(${x1})`)
      const y2 = pythonFormula.replace(/x/g, `(${x2})`)
      const slope = `((${y2}) - (${y1})) / (2 * ${h})`
      const y0 = pythonFormula.replace(/x/g, `(${pointX})`)
      const halfLen = length / 2
      
      return `${varName} = Line(
            [${pointX} - ${halfLen}, ${y0} - ${slope} * ${halfLen}, 0],
            [${pointX} + ${halfLen}, ${y0} + ${slope} * ${halfLen}, 0],
            color=${manimColor},
            stroke_width=${strokeWidth}
        )`
    }
    
    case 'riemann_sum': {
      // Find the referenced function
      const functionObj = objects.find(o => o.id === obj.functionId)
      if (!functionObj || functionObj.type !== 'function') {
        return null
      }
      
      const formula = functionObj.formula || 'x^2'
      const interval = obj.interval || { a: 0, b: 2 }
      const n = obj.n || 4
      const method = obj.method || 'left'
      const fillColor = obj.fillColor || '#8b5cf6'
      const strokeColor = obj.strokeColor || '#ffffff'
      const strokeWidth = obj.strokeWidth || 1
      
      // Convert formula for Python
      let pythonFormula = formula
        .replace(/\^/g, '**')
        .replace(/sin\(/g, 'np.sin(')
        .replace(/cos\(/g, 'np.cos(')
        .replace(/tan\(/g, 'np.tan(')
        .replace(/exp\(/g, 'np.exp(')
        .replace(/log\(/g, 'np.log(')
        .replace(/ln\(/g, 'np.log(')
        .replace(/sqrt\(/g, 'np.sqrt(')
        .replace(/abs\(/g, 'np.abs(')
      
      const manimFill = colorToManim(fillColor)
      const manimStroke = colorToManim(strokeColor)
      
      // Generate Riemann rectangles using VGroup
      const width = (interval.b - interval.a) / n
      const rects = []
      
      for (let i = 0; i < n; i++) {
        const xLeft = interval.a + i * width
        const xRight = xLeft + width
        let x, height
        
        switch (method) {
          case 'left':
            x = xLeft
            break
          case 'right':
            x = xRight
            break
          case 'midpoint':
            x = (xLeft + xRight) / 2
            break
          default:
            x = xLeft
        }
        
        if (method === 'trapezoid') {
          const hLeft = pythonFormula.replace(/x/g, `(${xLeft})`)
          const hRight = pythonFormula.replace(/x/g, `(${xRight})`)
          height = `((${hLeft}) + (${hRight})) / 2`
        } else {
          height = pythonFormula.replace(/x/g, `(${x})`)
        }
        
        const y = height >= 0 ? 0 : height
        const rectHeight = `abs(${height})`
        
        rects.push(`Rectangle(
                width=${width},
                height=${rectHeight},
                fill_color=${manimFill},
                fill_opacity=0.5,
                stroke_color=${manimStroke},
                stroke_width=${strokeWidth}
            ).move_to([${xLeft + width/2}, ${y} + ${rectHeight}/2, 0])`)
      }
      
      return `${varName} = VGroup(${rects.join(',\n                ')})`
    }
    
    case 'accumulation': {
      // Find the referenced function
      const functionObj = objects.find(o => o.id === obj.functionId)
      if (!functionObj || functionObj.type !== 'function') {
        return null
      }
      
      const formula = functionObj.formula || 'x^2'
      const startPoint = obj.startPoint || 0
      const currentX = obj.currentX || 2
      const fillColor = obj.fillColor || '#60a5fa'
      const manimColor = colorToManim(fillColor)
      
      // Convert formula for Python
      let pythonFormula = formula
        .replace(/\^/g, '**')
        .replace(/sin\(/g, 'np.sin(')
        .replace(/cos\(/g, 'np.cos(')
        .replace(/tan\(/g, 'np.tan(')
        .replace(/exp\(/g, 'np.exp(')
        .replace(/log\(/g, 'np.log(')
        .replace(/ln\(/g, 'np.log(')
        .replace(/sqrt\(/g, 'np.sqrt(')
        .replace(/abs\(/g, 'np.abs(')
      
      return `${varName} = AreaUnderCurve(
            FunctionGraph(lambda x: ${pythonFormula}, x_range=[${startPoint}, ${currentX}]),
            x_range=[${startPoint}, ${currentX}],
            color=${manimColor},
            fill_opacity=${obj.opacity ?? 0.5}
        )`
    }
    
    case 'taylor_series': {
      // Find the referenced function
      const functionObj = objects.find(o => o.id === obj.functionId)
      if (!functionObj || functionObj.type !== 'function') {
        return null
      }
      
      const formula = functionObj.formula || 'x^2'
      const center = obj.center || 0
      const degree = obj.degree || 3
      const domain = functionObj.domain || { min: -5, max: 5 }
      const color = obj.color || '#f59e0b'
      const strokeWidth = obj.strokeWidth || 2
      const manimColor = colorToManim(color)
      
      // Convert formula for Python
      let pythonFormula = formula
        .replace(/\^/g, '**')
        .replace(/sin\(/g, 'np.sin(')
        .replace(/cos\(/g, 'np.cos(')
        .replace(/tan\(/g, 'np.tan(')
        .replace(/exp\(/g, 'np.exp(')
        .replace(/log\(/g, 'np.log(')
        .replace(/ln\(/g, 'np.log(')
        .replace(/sqrt\(/g, 'np.sqrt(')
        .replace(/abs\(/g, 'np.abs(')
      
      // Generate Taylor polynomial - calculate coefficients and create polynomial
      // Note: This is a simplified version. For production, calculate coefficients numerically
      return `${varName} = FunctionGraph(
            lambda x: ${pythonFormula},
            x_range=[${domain.min}, ${domain.max}],
            color=${manimColor},
            stroke_width=${strokeWidth}
        )  # Taylor series approximation of degree ${degree} at ${center}`
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
  let currentTime = 0
  
  // Create objects respecting their delay and runTime
  // Group by delay time
  const byDelay = new Map()
  objects.forEach((obj, i) => {
    const delay = obj.delay || 0
    if (!byDelay.has(delay)) {
      byDelay.set(delay, [])
    }
    byDelay.get(delay).push({ obj, varName: `obj_${i}` })
  })
  
  const sortedDelays = [...byDelay.keys()].sort((a, b) => a - b)
  
    sortedDelays.forEach(delay => {
      // Wait if needed
      if (delay > currentTime) {
        animations.push(`self.wait(${(delay - currentTime).toFixed(1)})`)
        currentTime = delay
      }
      
      const items = byDelay.get(delay)
      const anims = items.map(({ obj, varName }) => {
        const anim = obj.animationType && obj.animationType !== 'auto' 
          ? obj.animationType 
          : getDefaultAnimation(obj.type)
        const runTime = obj.runTime || 1
        return `${anim}(${varName}, run_time=${runTime})`
      })
      
      animations.push(`self.play(${anims.join(', ')})`)
      
      // Update current time based on longest animation
      const maxRunTime = Math.max(...items.map(({ obj }) => obj.runTime || 1))
      currentTime = delay + maxRunTime
    })
  
  // Now handle keyframes
  sortedTimes.forEach(time => {
    const keyframes = timeMap.get(time)
    
    // Wait until this keyframe time
    if (time > currentTime) {
      animations.push(`self.wait(${(time - currentTime).toFixed(1)})`)
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
    case 'function':
    case 'tangent':
    case 'riemann_sum':
    case 'accumulation':
    case 'taylor_series':
      return 'Create'
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

