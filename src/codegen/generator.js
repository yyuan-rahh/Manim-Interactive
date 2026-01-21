/**
 * Generate Manim Python code from project JSON
 */
export function generateManimCode(project, activeSceneId) {
  const lines = []
  
  // Imports
  lines.push('from manim import *')
  lines.push('import numpy as np')
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

  // Track all animation events (entrances and exits)
  const events = []
  
  // Add entrance events
  objects.forEach((obj) => {
    const delay = obj.delay || 0
    const runTime = obj.runTime || 1
    const endTime = delay + runTime
    
    events.push({ time: delay, type: 'enter', obj })
    
    // Add exit event for objects that aren't transform targets
    if (!obj.transformFromId) {
      events.push({ time: endTime, type: 'exit', obj })
    }
  })
  
  // Sort events by time
  events.sort((a, b) => a.time - b.time)
  
  // Group events by time
  const eventsByTime = new Map()
  events.forEach(event => {
    if (!eventsByTime.has(event.time)) eventsByTime.set(event.time, [])
    eventsByTime.get(event.time).push(event)
  })
  
  let currentTime = 0
  const sortedTimes = [...eventsByTime.keys()].sort((a, b) => a - b)

  sortedTimes.forEach(time => {
    if (time > currentTime) {
      out.push(`self.wait(${(time - currentTime).toFixed(1)})`)
      currentTime = time
    }

    const timeEvents = eventsByTime.get(time)
    const enters = timeEvents.filter(e => e.type === 'enter')
    const exits = timeEvents.filter(e => e.type === 'exit')
    
    // Process entrances
    const creations = []
    const transforms = []

    enters.forEach(({ obj }) => {
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
          creations.push({ expr: `${anim}(${varName}, run_time=${runTime})`, runTime, objId: obj.id })
        }
      }
    })

    if (creations.length > 0) {
      out.push(`self.play(${creations.map(c => c.expr).join(', ')})`)
      currentTime = time + Math.max(...creations.map(c => c.runTime))
    }

    if (transforms.length > 0) {
      out.push(`self.play(${transforms.map(t => `${t.tType}(${t.srcVar}, ${t.tgtVar}, run_time=${t.runTime})`).join(', ')})`)
      currentTime = Math.max(currentTime, time + Math.max(...transforms.map(t => t.runTime)))
      transforms.forEach(t => {
        if (t.tType === 'ReplacementTransform') {
          out.push(`${t.srcVar} = ${t.tgtVar}`)
          curVarById.set(t.srcId, t.tgtVar)
          curVarById.set(t.objId, t.tgtVar)
        } else {
          curVarById.set(t.objId, t.srcVar)
        }
      })
    }
    
    // Process exits
    if (exits.length > 0) {
      const fadeOuts = []
      exits.forEach(({ obj }) => {
        const varName = curVarById.get(obj.id) || idToSourceVar.get(obj.id)
        const exitAnim = obj.exitAnimationType || 'FadeOut'
        if (varName) {
          fadeOuts.push(`${exitAnim}(${varName})`)
        }
      })
      
      if (fadeOuts.length > 0) {
        out.push(`self.play(${fadeOuts.join(', ')})`)
        currentTime = time
      }
    }
  })

  out.push('self.wait(1)')
  return out
}

/**
 * Convert scene name to valid Python class name
 */
export function sanitizeClassName(name) {
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

      // Quadratic Bézier curve using CubicBezier (convert quadratic to cubic)
      // We store `cx, cy` as the midpoint-on-curve at t=0.5 and derive the control point.
      const x0 = obj.x, y0 = obj.y
      const x2 = obj.x2, y2 = obj.y2
      // Derive quadratic control point P1 from midpoint
      const qx1 = 2 * obj.cx - 0.5 * (x0 + x2)
      const qy1 = 2 * obj.cy - 0.5 * (y0 + y2)
      
      // Convert quadratic Bezier to cubic Bezier
      // For quadratic with control point Q, cubic control points are:
      // C1 = P0 + 2/3*(Q - P0), C2 = P2 + 2/3*(Q - P2)
      const cx1 = x0 + (2/3) * (qx1 - x0)
      const cy1 = y0 + (2/3) * (qy1 - y0)
      const cx2 = x2 + (2/3) * (qx1 - x2)
      const cy2 = y2 + (2/3) * (qy1 - y2)

      return `${varName} = CubicBezier([${x0}, ${y0}, 0], [${cx1.toFixed(4)}, ${cy1.toFixed(4)}, 0], [${cx2.toFixed(4)}, ${cy2.toFixed(4)}, 0], [${x2}, ${y2}, 0], stroke_color=${stroke}, stroke_width=${strokeWidth})`
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
      const rotation = obj.rotation ? `.rotate(${obj.rotation} * DEGREES)` : ''
      return `${varName} = Text("${escaped}", font_size=${obj.fontSize || 48}, color=${fill}).move_to(${pos})${rotation}`
    }
    
    case 'latex': {
      const fill = obj.fill ? colorToManim(obj.fill) : 'WHITE'
      // Clean up LaTeX: remove placeholders and extra escaping from Desmos
      let latex = obj.latex || '\\frac{a}{b}'
      // Remove \placeholder{} which is Desmos-specific
      latex = latex.replace(/\\placeholder\{\}/g, '')
      // Remove any remaining empty braces that might cause issues
      latex = latex.replace(/\{\s*\}/g, '')
      // Clean up any double backslashes that might have been introduced
      latex = latex.replace(/\\\\/g, '\\')
      const rotation = obj.rotation ? `.rotate(${obj.rotation} * DEGREES)` : ''
      return `${varName} = MathTex(r"${latex}", color=${fill}).move_to(${pos})${rotation}`
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
      const xLabel = obj.xLabel || 'x'
      const yLabel = obj.yLabel || 'y'

      let code = `${varName} = Axes(x_range=[${xMin}, ${xMax}, ${xStep}], y_range=[${yMin}, ${yMax}, ${yStep}], x_length=${xLen}, y_length=${yLen}, axis_config={"color": ${stroke}, "stroke_width": ${strokeWidth}}, tips=False)`
      // Only shift if position is not (0, 0, 0)
      const posArray = pos.match(/\[([^\]]+)\]/)?.[1]?.split(',').map(s => parseFloat(s.trim()))
      if (posArray && (posArray[0] !== 0 || posArray[1] !== 0)) {
        code += `\n${varName}.shift(np.array(${pos}) - ${varName}.c2p(0, 0))`
      }
      code += `\n${varName}_xlabel = ${varName}.get_x_axis_label(MathTex("${xLabel}"), edge=RIGHT, direction=RIGHT)\n${varName}_ylabel = ${varName}.get_y_axis_label(MathTex("${yLabel}"), edge=UP, direction=UP)\n${varName} = VGroup(${varName}, ${varName}_xlabel, ${varName}_ylabel)`
      
      return code
    }
    
    case 'graph': {
      const stroke = obj.stroke ? colorToManim(obj.stroke) : '"#4ade80"'
      const strokeWidth = obj.strokeWidth || 3
      const formula = obj.formula || 'x**2'
      const xMin = obj.xRange?.min ?? -5
      const xMax = obj.xRange?.max ?? 5
      
      // Convert formula to Python syntax (x^2 -> x**2, etc.)
      let pythonFormula = formula
        .replace(/\^/g, '**')  // x^2 -> x**2
        .replace(/sin/g, 'np.sin')
        .replace(/cos/g, 'np.cos')
        .replace(/tan/g, 'np.tan')
        .replace(/exp/g, 'np.exp')
        .replace(/log/g, 'np.log')
        .replace(/sqrt/g, 'np.sqrt')
        .replace(/abs/g, 'np.abs')
      
      // If linked to axes, use axes coordinates
      const axesId = obj.axesId
      const linkedAxes = objects.find(o => o.id === axesId)
      
      if (linkedAxes) {
        const axesVarName = `obj_${objects.indexOf(linkedAxes)}`
        // Since axes are now VGroups with labels, reference the actual Axes object (first element)
        return `${varName} = ${axesVarName}[0].plot(lambda x: ${pythonFormula}, x_range=[${xMin}, ${xMax}], color=${stroke}, stroke_width=${strokeWidth})`
      } else {
        // Create independent axes and graph - use VGroup to combine them
        const axesVarName = `${varName}_axes`
        return `${axesVarName} = Axes(x_range=[${xMin}, ${xMax}, 1], y_range=[${obj.yRange?.min ?? -3}, ${obj.yRange?.max ?? 3}, 1], x_length=8, y_length=4, tips=False).move_to(${pos})
${varName} = VGroup(${axesVarName}, ${axesVarName}.plot(lambda x: ${pythonFormula}, x_range=[${xMin}, ${xMax}], color=${stroke}, stroke_width=${strokeWidth}))`
      }
    }
    
    case 'graphCursor': {
      const graph = objects.find(o => o.id === obj.graphId && o.type === 'graph')
      if (!graph) return `${varName} = Dot(point=${pos}, radius=0.08, color=RED)  # Warning: No graph linked`
      
      const formula = graph.formula || 'x**2'
      const pythonFormula = formula
        .replace(/\^/g, '**')
        .replace(/sin/g, 'np.sin')
        .replace(/cos/g, 'np.cos')
        .replace(/tan/g, 'np.tan')
        .replace(/exp/g, 'np.exp')
        .replace(/log/g, 'np.log')
        .replace(/sqrt/g, 'np.sqrt')
        .replace(/abs/g, 'np.abs')
      
      const x0 = obj.x0 ?? 0
      const fill = obj.fill ? colorToManim(obj.fill) : 'RED'
      const radius = obj.radius || 0.08
      
      // Get axes if linked
      const axes = obj.axesId ? objects.find(o => o.id === obj.axesId && o.type === 'axes') : null
      const linkedAxes = graph.axesId ? objects.find(o => o.id === graph.axesId && o.type === 'axes') : null
      const useAxes = axes || linkedAxes
      
      if (useAxes) {
        const axesVarName = `obj_${objects.indexOf(useAxes)}`
        // Axes are VGroups, so reference [0] for the actual Axes object
        const f = `lambda x: ${pythonFormula}`
        // Safely evaluate - use try/except to handle undefined points
        return `${varName}_f = ${f}\ntry:\n    ${varName}_y = ${varName}_f(${x0})\nexcept (ZeroDivisionError, ValueError):\n    ${varName}_y = ${varName}_f(${x0} + 1e-8)\n${varName} = Dot(point=${axesVarName}[0].c2p(${x0}, ${varName}_y), radius=${radius}, color=${fill})`
      } else {
        // Independent positioning
        const f = `lambda x: ${pythonFormula}`
        return `${varName}_f = ${f}\ntry:\n    ${varName}_y = ${varName}_f(${x0})\nexcept (ZeroDivisionError, ValueError):\n    ${varName}_y = ${varName}_f(${x0} + 1e-8)\n${varName} = Dot(point=[${x0}, ${varName}_y, 0], radius=${radius}, color=${fill})`
      }
    }
    
    case 'tangentLine': {
      const graph = objects.find(o => o.id === obj.graphId && o.type === 'graph')
      if (!graph) return `${varName} = Line(start=[0, 0, 0], end=[1, 1, 0], color=YELLOW)  # Warning: No graph linked`
      
      const formula = graph.formula || 'x**2'
      const pythonFormula = formula
        .replace(/\^/g, '**')
        .replace(/sin/g, 'np.sin')
        .replace(/cos/g, 'np.cos')
        .replace(/tan/g, 'np.tan')
        .replace(/exp/g, 'np.exp')
        .replace(/log/g, 'np.log')
        .replace(/sqrt/g, 'np.sqrt')
        .replace(/abs/g, 'np.abs')
      
      // Get x0 from cursor or use direct x0
      let x0 = obj.x0 ?? 0
      if (obj.cursorId) {
        const cursor = objects.find(o => o.id === obj.cursorId && o.type === 'graphCursor')
        if (cursor) {
          x0 = cursor.x0 ?? 0
        }
      }
      
      const h = obj.derivativeStep || 0.001
      const visibleSpan = obj.visibleSpan || 2
      const stroke = obj.stroke ? colorToManim(obj.stroke) : 'YELLOW'
      const strokeWidth = obj.strokeWidth || 2
      
      // Get axes if linked
      const axes = obj.axesId ? objects.find(o => o.id === obj.axesId && o.type === 'axes') : null
      const linkedAxes = graph.axesId ? objects.find(o => o.id === graph.axesId && o.type === 'axes') : null
      const useAxes = axes || linkedAxes
      
      if (useAxes) {
        const axesVarName = `obj_${objects.indexOf(useAxes)}`
        const f = `lambda x: ${pythonFormula}`
        // Compute slope using central difference
        const slope = `((${f})(${x0} + ${h}) - (${f})(${x0} - ${h})) / (2 * ${h})`
        const y0 = `(${f})(${x0})`
        const x1 = x0 - visibleSpan
        const x2 = x0 + visibleSpan
        const y1 = `${y0} + ${slope} * (${x1} - ${x0})`
        const y2 = `${y0} + ${slope} * (${x2} - ${x0})`
        return `${varName} = Line(start=${axesVarName}[0].c2p(${x1}, ${y1}), end=${axesVarName}[0].c2p(${x2}, ${y2}), color=${stroke}, stroke_width=${strokeWidth})`
      } else {
        // Independent positioning
        const f = `lambda x: ${pythonFormula}`
        const slope = `((${f})(${x0} + ${h}) - (${f})(${x0} - ${h})) / (2 * ${h})`
        const y0 = `(${f})(${x0})`
        const x1 = x0 - visibleSpan
        const x2 = x0 + visibleSpan
        const y1 = `${y0} + ${slope} * (${x1} - ${x0})`
        const y2 = `${y0} + ${slope} * (${x2} - ${x0})`
        return `${varName} = Line(start=[${x1}, ${y1}, 0], end=[${x2}, ${y2}, 0], color=${stroke}, stroke_width=${strokeWidth})`
      }
    }
    
    case 'limitProbe': {
      const graph = objects.find(o => o.id === obj.graphId && o.type === 'graph')
      if (!graph) return `${varName} = VGroup()  # Warning: No graph linked`
      
      const formula = graph.formula || 'x**2'
      const pythonFormula = formula
        .replace(/\^/g, '**')
        .replace(/sin/g, 'np.sin')
        .replace(/cos/g, 'np.cos')
        .replace(/tan/g, 'np.tan')
        .replace(/exp/g, 'np.exp')
        .replace(/log/g, 'np.log')
        .replace(/sqrt/g, 'np.sqrt')
        .replace(/abs/g, 'np.abs')
      
      // Get x0 from cursor or use direct x0
      let x0 = obj.x0 ?? 0
      if (obj.cursorId) {
        const cursor = objects.find(o => o.id === obj.cursorId && o.type === 'graphCursor')
        if (cursor) {
          x0 = cursor.x0 ?? 0
        }
      }
      
      const direction = obj.direction || 'both'
      const deltaSchedule = obj.deltaSchedule || [1, 0.5, 0.1, 0.01]
      const fill = obj.fill ? colorToManim(obj.fill) : 'BLUE'
      const radius = obj.radius || 0.06
      
      // Get axes if linked
      const axes = obj.axesId ? objects.find(o => o.id === obj.axesId && o.type === 'axes') : null
      const linkedAxes = graph.axesId ? objects.find(o => o.id === graph.axesId && o.type === 'axes') : null
      const useAxes = axes || linkedAxes
      
      const f = `lambda x: ${pythonFormula}`
      const dots = []
      const deltas = direction === 'both' ? [...deltaSchedule.map(d => -d), ...deltaSchedule] :
                     direction === 'left' ? deltaSchedule.map(d => -d) :
                     deltaSchedule
      
      for (const delta of deltas) {
        const x = x0 + delta
        if (useAxes) {
          const axesVarName = `obj_${objects.indexOf(useAxes)}`
          dots.push(`Dot(point=${axesVarName}[0].c2p(${x}, (${f})(${x})), radius=${radius}, color=${fill})`)
        } else {
          dots.push(`Dot(point=[${x}, (${f})(${x}), 0], radius=${radius}, color=${fill})`)
        }
      }
      
      if (dots.length === 0) {
        return `${varName} = VGroup()`
      }
      
      return `${varName} = VGroup(${dots.join(', ')})`
    }
    
    case 'valueLabel': {
      const graph = obj.graphId ? objects.find(o => o.id === obj.graphId && o.type === 'graph') : null
      const cursor = obj.cursorId ? objects.find(o => o.id === obj.cursorId && o.type === 'graphCursor') : null
      
      const fill = obj.fill ? colorToManim(obj.fill) : 'WHITE'
      const fontSize = obj.fontSize || 24
      const prefix = obj.labelPrefix || ''
      const suffix = obj.labelSuffix || ''
      
      let textValue = ''
      
      if (obj.valueType === 'slope' && graph && cursor) {
        const formula = graph.formula || 'x**2'
        const pythonFormula = formula
          .replace(/\^/g, '**')
          .replace(/sin/g, 'np.sin')
          .replace(/cos/g, 'np.cos')
          .replace(/tan/g, 'np.tan')
          .replace(/exp/g, 'np.exp')
          .replace(/log/g, 'np.log')
          .replace(/sqrt/g, 'np.sqrt')
          .replace(/abs/g, 'np.abs')
        const x0 = cursor.x0 ?? 0
        const h = 0.001
        const f = `lambda x: ${pythonFormula}`
        const slope = `((${f})(${x0} + ${h}) - (${f})(${x0} - ${h})) / (2 * ${h})`
        textValue = prefix || suffix ? `f"${prefix}{${slope}:.3f}${suffix}"` : `f"{${slope}:.3f}"`
      } else if (obj.valueType === 'x' && cursor) {
        const x0 = cursor.x0 ?? 0
        textValue = prefix || suffix ? `f"${prefix}{${x0}:.2f}${suffix}"` : `f"{${x0}:.2f}"`
      } else if (obj.valueType === 'y' && graph && cursor) {
        const formula = graph.formula || 'x**2'
        const pythonFormula = formula
          .replace(/\^/g, '**')
          .replace(/sin/g, 'np.sin')
          .replace(/cos/g, 'np.cos')
          .replace(/tan/g, 'np.tan')
          .replace(/exp/g, 'np.exp')
          .replace(/log/g, 'np.log')
          .replace(/sqrt/g, 'np.sqrt')
          .replace(/abs/g, 'np.abs')
        const x0 = cursor.x0 ?? 0
        const f = `lambda x: ${pythonFormula}`
        const y = `(${f})(${x0})`
        textValue = prefix || suffix ? `f"${prefix}{${y}:.3f}${suffix}"` : `f"{${y}:.3f}"`
      } else if (obj.valueType === 'custom' && obj.customExpression) {
        const escaped = obj.customExpression.replace(/"/g, '\\"')
        textValue = `"${escaped}"`
      } else {
        const escaped = (prefix || '').replace(/"/g, '\\"')
        textValue = `"${escaped}"`
      }
      
      if (obj.showBackground) {
        const bgFill = obj.backgroundFill ? colorToManim(obj.backgroundFill) : 'BLACK'
        const bgOpacity = obj.backgroundOpacity || 0.7
        return `${varName} = VGroup(RoundedRectangle(width=2, height=0.5, fill_color=${bgFill}, fill_opacity=${bgOpacity}), Text(${textValue}, font_size=${fontSize}, color=${fill})).move_to(${pos})`
      } else {
        return `${varName} = Text(${textValue}, font_size=${fontSize}, color=${fill}).move_to(${pos})`
      }
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
  
  // Track all events (entrances, keyframes, exits)
  const allEvents = []
  
  // Add entrance and exit events
  objects.forEach((obj) => {
    const delay = obj.delay || 0
    const runTime = obj.runTime || 1
    const endTime = delay + runTime
    
    allEvents.push({ time: delay, type: 'enter', obj })
    
    // Add exit event for objects that aren't transform targets
    if (!obj.transformFromId) {
      allEvents.push({ time: endTime, type: 'exit', obj })
    }
    
    // Add keyframe events
    if (obj.keyframes && obj.keyframes.length > 0) {
      obj.keyframes.forEach(kf => {
        allEvents.push({ time: kf.time, type: 'keyframe', obj, keyframe: kf })
      })
    }
  })
  
  // Sort all events by time
  allEvents.sort((a, b) => a.time - b.time)
  
  // Group events by time
  const eventsByTime = new Map()
  allEvents.forEach(event => {
    if (!eventsByTime.has(event.time)) eventsByTime.set(event.time, [])
    eventsByTime.get(event.time).push(event)
  })
  
  let currentTime = 0
  const sortedTimes = [...eventsByTime.keys()].sort((a, b) => a - b)
  
  sortedTimes.forEach(time => {
    if (time > currentTime) {
      animations.push(`self.wait(${(time - currentTime).toFixed(1)})`)
      currentTime = time
    }

    const timeEvents = eventsByTime.get(time)
    const enters = timeEvents.filter(e => e.type === 'enter')
    const exits = timeEvents.filter(e => e.type === 'exit')
    const keyframes = timeEvents.filter(e => e.type === 'keyframe')
    
    // Process entrances
    const creations = []
    const transforms = []

    enters.forEach(({ obj }) => {
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
      currentTime = time + Math.max(...creations.map(c => c.runTime))
    }

    if (transforms.length > 0) {
      animations.push(`self.play(${transforms.map(t => `${t.tType}(${t.srcVar}, ${t.tgtVar}, run_time=${t.runTime})`).join(', ')})`)
      currentTime = Math.max(currentTime, time + Math.max(...transforms.map(t => t.runTime)))
      transforms.forEach(t => {
        if (t.tType === 'ReplacementTransform') {
          animations.push(`${t.srcVar} = ${t.tgtVar}`)
          curVarById.set(t.srcId, t.tgtVar)
          curVarById.set(t.objId, t.tgtVar)
        } else {
          curVarById.set(t.objId, t.srcVar)
        }
      })
    }
    
    // Process keyframes
    if (keyframes.length > 0) {
    const byObj = new Map()
      keyframes.forEach(({ obj, keyframe }) => {
        if (!byObj.has(obj.id)) byObj.set(obj.id, [])
        byObj.get(obj.id).push(keyframe)
      })
      
    const anims = []
    byObj.forEach((kfs, objectId) => {
      const varName = curVarById.get(objectId) || idToSourceVar.get(objectId) || idToTargetVar.get(objectId)
      if (!varName) return

      kfs.forEach(kf => {
        switch (kf.property) {
          case 'x':
          case 'y':
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
    }
    
    // Process exits
    if (exits.length > 0) {
      const fadeOuts = []
      exits.forEach(({ obj }) => {
        const varName = curVarById.get(obj.id) || idToSourceVar.get(obj.id)
        const exitAnim = obj.exitAnimationType || 'FadeOut'
        if (varName) {
          fadeOuts.push(`${exitAnim}(${varName})`)
        }
      })
      
      if (fadeOuts.length > 0) {
        animations.push(`self.play(${fadeOuts.join(', ')})`)
      }
    }
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
  // All shapes use Create animation by default
  return 'Create'
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

