/**
 * Agent pipeline stages: classify, enrich, clarify, generateOps,
 * generatePython, extractOps, reviewOutput, decomposeAnimation.
 *
 * Expects `deps` from init():
 *   - llmChat(messages, options)
 *   - llmChatStream(messages, options)
 *   - extractFirstJsonObject(text)
 *   - extractJsonWithContinuation(text, messages, options)
 *   - isAnthropicProvider()
 *   - sendProgress(phase, message)
 *   - getMainWindow()
 *   - searchLibrary(prompt)
 *   - assembleFromLibrary({ prompt, libraryMatches })
 */

let _deps = {}

function init(deps) {
  _deps = deps
}

function sendProgress(phase, message) {
  _deps.sendProgress?.(phase, message)
}

const OPS_PROPERTY_SCHEMA = `
COMPLETE object property reference for the canvas renderer.
ALL objects share: x, y, rotation, opacity (0-1), fill (hex), stroke (hex), strokeWidth (number).

BASIC SHAPES:
- circle: radius (number)
- rectangle: width, height
- triangle: vertices (array of 3 {x,y})
- polygon: vertices (array of {x,y}), sides, radius
- line: x, y, x2, y2, stroke, strokeWidth
- arrow: x, y, x2, y2, stroke, strokeWidth
- arc: x, y, x2, y2, cx, cy, stroke, strokeWidth
- dot: radius (default 0.1), fill

TEXT:
- text: text (string), fontSize (number, default 48), fill
- latex: latex (string, e.g. "\\\\frac{a}{b}"), fill

GRAPH FAMILY (link via IDs):
- axes: xRange {min,max,step}, yRange {min,max,step}, xLength (default 8), yLength (default 4), stroke, strokeWidth, showTicks (bool), xLabel ("x"), yLabel ("y")
- graph: formula (string, e.g. "x^2"), axesId (ID of axes object), xRange {min,max}, yRange {min,max}, stroke, strokeWidth
- graphCursor: graphId (ID of graph), axesId, x0 (number, position on graph), fill, radius (default 0.08), showCrosshair, showDot, showLabel
- tangentLine: graphId, cursorId (optional, ID of graphCursor), axesId, x0, derivativeStep (default 0.001), visibleSpan (default 2), stroke, strokeWidth
- limitProbe: graphId, cursorId, axesId, x0, direction ("left"/"right"/"both"), deltaSchedule (array e.g. [1,0.5,0.1,0.01]), fill, radius
- valueLabel: graphId, cursorId, valueType ("slope"/"x"/"y"/"custom"), labelPrefix, labelSuffix, customExpression, fontSize, fill, showBackground, backgroundFill, backgroundOpacity

TIMING & ANIMATION (on every object):
- delay (number, seconds) - when the object enters (default 0)
- runTime (number, seconds) - how long the object is visible. For persistent objects use the scene duration. For transient effects use a short value.
- animationType: "auto", "Create", "FadeIn", "GrowFromCenter", "Write", "DrawBorderThenFill"
- exitAnimationType: "FadeOut", "Uncreate", "ShrinkToCenter"
- transformFromId (string, optional) - ID of object this morphs from
- transformType (string, optional) - "Transform", "ReplacementTransform", "FadeTransform"

LINKING RULES:
When adding graph-family objects, add axes FIRST then reference its ID. Use deterministic IDs like "axes-1", "graph-1", "cursor-1".
Example: axes id="axes-1", then graph with axesId="axes-1" id="graph-1", then graphCursor with graphId="graph-1" axesId="axes-1".

CRITICAL: Use "fill" for fill color, "stroke" for stroke/border color. Do NOT use "fillColor", "strokeColor", "color". Colors must be hex strings like "#3b82f6".
Formulas must use x and basic functions: sin, cos, tan, exp, log/ln, sqrt, abs, pi, e.
`.trim()

async function classifyPrompt(prompt) {
  sendProgress('classifying', 'Analyzing prompt...')

  const libraryMatches = _deps.searchLibrary(prompt)
  const topMatch = libraryMatches[0]
  let libraryHint = ''
  if (topMatch && topMatch._coverage >= 0.4) {
    libraryHint = `\n\nHINT: A very similar request ("${topMatch.prompt}") was previously handled in "${topMatch.mode}" mode. Prefer using "${topMatch.mode}" mode unless the new request is fundamentally different.`
  }

  const sys = `You classify user prompts for a Manim animation editor.
Return ONLY a JSON object: {"mode":"ops"|"python","searchTerms":["term1","term2"]}

"ops" mode is ONLY for the simplest requests:
- Adding a SINGLE static shape (circle, rectangle, text, dot)
- Changing a color or position of one object
- Renaming a scene, changing duration
- Basic property edits

"python" mode is for EVERYTHING ELSE, including:
- ANY animation (moving, transforming, fading, morphing)
- Multiple objects interacting
- Math visualizations (derivatives, integrals, graphs, tangent lines, limits)
- Anything involving timing, sequences, or motion
- 3D scenes, camera movements
- Educational content with labels and annotations
- Any request mentioning "animate", "show", "explain", "visualize", "demonstrate"

searchTerms: 2-4 Manim-specific search queries for GitHub (only for python mode, empty for ops).
No markdown, no code fences, no explanation. Just the JSON.${libraryHint}`

  const content = await _deps.llmChat([
    { role: 'system', content: sys },
    { role: 'user', content: prompt },
  ])
  const parsed = _deps.extractFirstJsonObject(content)
  if (parsed?.mode === 'python' || parsed?.mode === 'ops') return parsed
  return { mode: 'ops', searchTerms: [] }
}

async function generateOps({ prompt, project, activeSceneId, libraryOps, keywords = [] }) {
  sendProgress('generating', 'Generating animation...')

  const allowedObjectTypes = [
    'rectangle', 'triangle', 'circle', 'line', 'arc', 'arrow', 'dot', 'polygon', 'text', 'latex',
    'axes', 'graph', 'graphCursor', 'tangentLine', 'limitProbe', 'valueLabel',
  ]

  const scene = project?.scenes?.find(s => s.id === activeSceneId) || project?.scenes?.[0]
  const sceneDuration = scene?.duration || 5

  let librarySection = ''
  if (libraryOps?.length) {
    librarySection = '\n\nRELATED OPS FROM LIBRARY:\n'
    for (const m of libraryOps.slice(0, 1)) {
      const truncatedOps = (m.ops || []).slice(0, 5)
      librarySection += `\n--- "${m.prompt}" ---\n${JSON.stringify(truncatedOps, null, 2)}\n`
    }
  }

  const keywordGuidanceMap = {
    'visualize': [
      '- VISUALIZE MODE: Use shapes (circle, rectangle, polygon, arc) and graphs extensively',
      '- Add text labels to all major elements',
      '- Use color (fill) to distinguish different parts',
    ],
    'intuition': [
      '- INTUITIVE MODE: Focus on simple visual metaphors',
      '- Use fewer latex/mathText objects, more text objects with plain language',
      '- Animate concepts step-by-step with clear visual transitions',
    ],
    'prove': [
      '- PROOF MODE: Use latex/mathText for all formal statements',
      '- Show assumptions clearly with text objects',
      '- Build logical steps sequentially using delay to show progression',
    ],
  }

  const keywordInstructions = keywords
    .filter(k => keywordGuidanceMap[k])
    .flatMap(k => keywordGuidanceMap[k])

  const keywordSection = keywordInstructions.length > 0
    ? '\n' + keywordInstructions.join('\n') + '\n'
    : ''

  const system = [
    'You are an in-app agent for a Manim animation editor and mathematics educator.',
    '', keywordSection,
    'MATHEMATICAL DETAIL REQUIREMENTS:',
    '- For math concepts, include ALL relevant equations as mathText objects',
    '- Label ALL geometric elements with text objects',
    '- Break complex concepts into multiple objects shown step-by-step using delay',
    '- Use clear, descriptive names for all objects',
    '',
    'TECHNICAL RULES:',
    'You must output ONLY a single JSON object with keys: summary (string) and ops (array). No markdown, no code fences.',
    'Your ops must be small patches to an existing project JSON. Do NOT output Python.',
    'Prefer editing/adding objects inside the active scene.',
    'Allowed op types (MUST use exact camelCase): addObject, updateObject, deleteObject, addKeyframe, setSceneDuration, renameScene, addScene, deleteScene.',
    'IMPORTANT: op type must be camelCase like "addObject" NOT "add_object".',
    `Allowed object types: ${allowedObjectTypes.join(', ')}.`,
    '', OPS_PROPERTY_SCHEMA, '',
    `The current scene duration is ${sceneDuration}s. For persistent objects, set runTime to ${sceneDuration}. For transient effects, use a shorter runTime.`,
    '',
    'Full addObject example:',
    `{"summary":"Added a blue circle","ops":[{"type":"addObject","sceneId":"scene-1","object":{"type":"circle","x":0,"y":0,"radius":1.5,"fill":"#3b82f6","stroke":"#ffffff","strokeWidth":2,"opacity":1,"delay":0,"runTime":${sceneDuration},"animationType":"auto"}}]}`,
    '',
    'Safety constraints:',
    '- Never introduce arbitrary code strings in formulas.',
    '- Keep changes minimal and deterministic.',
    '- No markdown wrapping. Output raw JSON only.',
    librarySection,
  ].join('\n')

  const objectCount = scene?.objects?.length || 0
  const minimalContext = { activeSceneId, sceneDuration, existingObjectCount: objectCount }

  const user = [
    'USER PROMPT:', prompt.trim(), '',
    'CONTEXT:', JSON.stringify(minimalContext, null, 2),
  ].join('\n')

  const content = await _deps.llmChat([
    { role: 'system', content: system },
    { role: 'user', content: user },
  ])

  const parsed = _deps.extractFirstJsonObject(content)
  if (!parsed || typeof parsed !== 'object') throw new Error('Agent did not return valid JSON.')
  return {
    summary: typeof parsed.summary === 'string' ? parsed.summary : '',
    ops: Array.isArray(parsed.ops) ? parsed.ops : [],
  }
}

async function generatePython({ prompt, project, activeSceneId, libraryMatches, onlineExamples, keywords = [] }) {
  sendProgress('generating', 'Generating Manim Python code...')

  let contextSection = ''
  if (libraryMatches?.length) {
    const components = libraryMatches.filter(m => m.isComponent)
    const fullAnimations = libraryMatches.filter(m => !m.isComponent)

    if (components.length > 0) {
      contextSection += '\n\nREUSABLE COMPONENT FROM LIBRARY:\n'
      contextSection += 'This component was previously generated. You can ADAPT or COMBINE it.\n'
      for (const c of components.slice(0, 1)) {
        const code = (c.codeSnippet || c.pythonCode || '').slice(0, 1200)
        if (code) {
          contextSection += `\n--- "${c.componentName || c.prompt}" ---\n`
          contextSection += `Description: ${c.description}\n${code}\n`
        }
      }
    }
    if (fullAnimations.length > 0) {
      contextSection += '\n\nRELATED ANIMATION FROM LIBRARY:\n'
      contextSection += 'This complete animation is similar. ADAPT it if relevant.\n'
      for (const m of fullAnimations.slice(0, 1)) {
        const truncated = (m.pythonCode || '').slice(0, 1500)
        contextSection += `\n--- "${m.prompt}" ---\n${truncated}\n`
      }
    }
  }
  if (onlineExamples?.length) {
    contextSection += '\n\nREFERENCE FROM MANIM REPO:\n'
    for (const ex of onlineExamples.slice(0, 1)) {
      contextSection += `\n--- ${ex.name} ---\n${ex.code.slice(0, 1000)}\n`
    }
  }

  const keywordGuidanceMap = {
    'visualize': [
      '- VISUALIZE MODE: Use diagrams, geometric shapes, graphs, and charts extensively',
      '- Combine visual elements with text labels and annotations',
      '- Prioritize showing concepts through shapes and spatial relationships',
      '- Use color coding to distinguish different parts',
    ],
    'intuition': [
      '- INTUITIVE MODE: Focus on conceptual understanding over formal rigor',
      '- Use fewer equations, more visual analogies and examples',
      '- Use everyday language in text annotations',
    ],
    'prove': [
      '- PROOF MODE: State the theorem clearly with all assumptions',
      '- Show each logical step with mathematical rigor',
      '- Use MathTex for all formal statements and equations',
      '- Build to a clear conclusion statement',
    ],
  }

  const keywordInstructions = keywords
    .filter(k => keywordGuidanceMap[k])
    .flatMap(k => keywordGuidanceMap[k])

  const keywordSection = keywordInstructions.length > 0
    ? '\n' + keywordInstructions.join('\n') + '\n'
    : ''

  const system = [
    'You are an expert Manim Community Edition (CE) Python developer and mathematics educator.',
    'Generate a COMPLETE, self-contained Manim CE Python script that implements the user\'s request.',
    '', keywordSection,
    'MATHEMATICAL DETAIL REQUIREMENTS:',
    '- Show ALL relevant equations using MathTex',
    '- Label ALL geometric elements (sides, angles, areas)',
    '- Display numerical values when demonstrating calculations',
    '- Break complex concepts into clear step-by-step visual sequences',
    '- Use text annotations to explain what\'s happening at each step',
    '',
    'TECHNICAL RULES:',
    '- Import from manim: `from manim import *`',
    '- Define exactly ONE Scene class',
    '- Use only standard Manim CE APIs (Community Edition)',
    '- Include self.play() calls with appropriate animations',
    '- Include self.wait() calls for pacing between steps',
    '- Use proper colors to distinguish different elements',
    '',
    'ANIMATION PACING:',
    '- Build the animation step-by-step, showing one concept at a time',
    '- Use self.wait(0.5-1) between major steps',
    '- Highlight or emphasize key moments',
    '',
    'Output ONLY a JSON object: {"summary":"what this does","sceneName":"MyScene","pythonCode":"from manim import *\\n..."}',
    'The pythonCode must be a complete, runnable Python string. No markdown, no code fences around the JSON.',
    contextSection,
  ].join('\n')

  const scene = project?.scenes?.find(s => s.id === activeSceneId) || project?.scenes?.[0]
  const minimalContext = { activeSceneId, existingObjectCount: scene?.objects?.length || 0 }

  const user = [
    'USER PROMPT:', prompt.trim(), '',
    'Current project context:', JSON.stringify(minimalContext, null, 2),
  ].join('\n')

  const genMessages = [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ]

  let content
  try {
    const mainWindow = _deps.getMainWindow?.()
    content = await _deps.llmChatStream(genMessages, {
      maxTokens: 8192,
      onToken: (delta, accumulated) => {
        try { mainWindow?.webContents?.send('agent-stream-token', { delta, accumulated }) } catch {}
      },
    })
  } catch {
    content = await _deps.llmChat(genMessages, { maxTokens: 8192 })
  }

  const parsed = await _deps.extractJsonWithContinuation(content, genMessages, { maxTokens: 4096 })
  if (!parsed || !parsed.pythonCode) {
    console.error('[generatePython] Failed to parse response. Raw content:', content?.substring(0, 500))
    throw new Error('Agent did not return valid Python code.')
  }
  return {
    summary: parsed.summary || '',
    sceneName: parsed.sceneName || 'GeneratedScene',
    pythonCode: parsed.pythonCode,
  }
}

async function enrichAbstractPrompt(prompt, keywords = []) {
  sendProgress('enriching', 'Breaking down concept...')

  const keywordGuidance = {
    'visualize': 'Focus on diagrams, geometric shapes, and graphs combined with text labels.',
    'intuition': 'Prioritize conceptual understanding and intuitive explanations.',
    'prove': 'State the theorem clearly with all assumptions. Provide a step-by-step logical argument.',
  }

  const activeGuidance = keywords
    .filter(k => keywordGuidance[k])
    .map(k => `- ${k.toUpperCase()}: ${keywordGuidance[k]}`)
    .join('\n')

  const guidanceSection = activeGuidance
    ? `\nUSER FOCUS KEYWORDS (apply these requirements to your output):\n${activeGuidance}\n`
    : ''

  const compact = _deps.isAnthropicProvider()
  const system = compact
    ? [
      'You are a mathematics educator and animator.',
      'Decide if the prompt is ABSTRACT (concept/theorem/proof without specifics) or CONCRETE (already specifies objects/graphs/values).',
      guidanceSection,
      'If ABSTRACT: produce a concise plan with concept, visual elements, animation sequence, math details.',
      'If CONCRETE: enrichedPrompt must be null.',
      'Return ONLY JSON: {"isAbstract":true/false,"enrichedPrompt":string|null}. No markdown, no code fences.',
    ].filter(Boolean).join('\n')
    : [
      'You are an expert mathematics educator and animator.',
      '', 'Given a user\'s animation request, determine if it\'s ABSTRACT/CONCEPTUAL or CONCRETE:',
      '- ABSTRACT: References a proof, theorem, concept without specifics',
      '- CONCRETE: Has specific details (e.g., "graph y=x^2")',
      '', guidanceSection,
      'For ABSTRACT prompts, expand into DETAILED STEP-BY-STEP visual explanation.',
      'For CONCRETE prompts, return {"isAbstract":false,"enrichedPrompt":null}',
      '', 'Return ONLY a JSON object: {"isAbstract":true/false,"enrichedPrompt":"detailed explanation"}',
      'No markdown, no code fences around the JSON.',
    ].join('\n')

  try {
    const content = await _deps.llmChat([
      { role: 'system', content: system },
      { role: 'user', content: prompt },
    ])
    const parsed = _deps.extractFirstJsonObject(content)
    if (parsed?.isAbstract && parsed.enrichedPrompt) {
      console.log('[enrichAbstractPrompt] Enriched:', parsed.enrichedPrompt.substring(0, 200) + '...')
      return parsed.enrichedPrompt
    }
  } catch (err) {
    console.error('[enrichAbstractPrompt] Error:', err.message)
  }
  return null
}

async function clarifyPrompt({ prompt, mode, enrichedPrompt, keywords = [] }) {
  sendProgress('clarifying', 'Asking clarifying questions...')

  const keywordContext = keywords.length > 0
    ? `\nUSER KEYWORDS: ${keywords.join(', ')} (these are already specified, do not ask about them)`
    : ''

  const system = [
    'You are a product designer for a math animation tool.',
    'Given a user prompt, decide whether we need clarifying questions BEFORE generating any animation.',
    '', 'Only ask questions when the prompt is ambiguous or underspecified.',
    'Ask 0-3 questions maximum.', keywordContext, '',
    'Each question MUST be multiple-choice. Some questions may allow multiple selections.',
    '', 'Return ONLY JSON: {"needsClarification":true/false,"questions":[...]}',
    'No markdown, no code fences.',
  ].join('\n')

  const user = [
    'MODE:', mode || 'unknown', '',
    'USER PROMPT:', prompt || '', '',
    enrichedPrompt ? `ENRICHED CONTEXT:\n${String(enrichedPrompt).slice(0, 2000)}` : '',
  ].filter(Boolean).join('\n')

  try {
    const content = await _deps.llmChat([
      { role: 'system', content: system },
      { role: 'user', content: user },
    ])
    const parsed = _deps.extractFirstJsonObject(content)
    if (parsed?.needsClarification && Array.isArray(parsed.questions) && parsed.questions.length > 0) {
      return parsed.questions.slice(0, 3)
    }
  } catch { /* best-effort */ }
  return []
}

async function extractOpsFromPython({ pythonCode, project, activeSceneId }) {
  sendProgress('extracting', 'Extracting canvas objects from Python code...')

  const scene = project?.scenes?.find(s => s.id === activeSceneId) || project?.scenes?.[0]
  const sceneDuration = scene?.duration || 5

  const system = [
    'You are a Manim CE code analyzer. Given Manim Python code, extract the KEY STRUCTURAL visual objects into a JSON ops array for a 2D canvas editor.',
    '',
    'IMPORTANT PRINCIPLES:',
    '1. ACCURACY over completeness',
    '2. Skip objects created in loops',
    '3. The canvas uses Manim coordinates: x -7 to 7, y -4 to 4. Origin (0,0) is center.',
    '4. Read .move_to(), .shift(), .to_edge(), .next_to() carefully for final positions.',
    '', OPS_PROPERTY_SCHEMA, '',
    'USE DETERMINISTIC IDs: "axes-1", "graph-1", "text-1", etc.',
    '',
    'Return ONLY a JSON object: {"ops":[{"type":"addObject","sceneId":"SCENE_ID","object":{...}}, ...]}',
    'No markdown, no code fences.',
  ].join('\n')

  const user = [
    'PYTHON CODE:', pythonCode, '',
    `Active scene ID: ${activeSceneId || scene?.id || 'scene-1'}`,
    `Scene duration: ${sceneDuration}s`,
  ].join('\n')

  try {
    const content = await _deps.llmChat([
      { role: 'system', content: system },
      { role: 'user', content: user },
    ])
    const parsed = _deps.extractFirstJsonObject(content)
    if (parsed?.ops && Array.isArray(parsed.ops)) return parsed.ops
  } catch { /* extraction is best-effort */ }
  return []
}

async function decomposeAnimation({ prompt, pythonCode, ops, mode }) {
  const system = [
    'You are an expert at analyzing Manim animations and breaking them into reusable conceptual components.',
    '', 'Given an animation, identify DISTINCT CONCEPTUAL PARTS that could be reused separately.',
    '', 'RULES:',
    '- Each component must be a SELF-CONTAINED concept',
    '- Return BETWEEN 2 AND 3 components. NEVER more than 3.',
    '- DO NOT create components for generic scaffolding',
    '- Only extract the CORE MATHEMATICAL CONCEPTS',
    '',
    'Return ONLY JSON: {"components":[{"name":"...","description":"...","keywords":[...],"codeSnippet":"...","opsSubset":[...]}, ...]}',
    'If too simple to decompose, return {"components":[]}. No markdown, no code fences.',
  ].join('\n')

  const user = ['USER PROMPT:', prompt, '', 'MODE:', mode, '']
  if (mode === 'python' && pythonCode) {
    user.push('PYTHON CODE:', pythonCode.slice(0, 3000), '')
  }
  if (ops?.length) {
    user.push('OPS:', JSON.stringify(ops.slice(0, 10), null, 2), '')
  }

  try {
    const content = await _deps.llmChat([
      { role: 'system', content: system },
      { role: 'user', content: user.join('\n') },
    ])
    const parsed = _deps.extractFirstJsonObject(content)
    if (parsed?.components && Array.isArray(parsed.components)) {
      return parsed.components.slice(0, 3)
    }
  } catch { /* best-effort */ }
  return []
}

async function generateFromAssembly({ tier, baseCode, prompt, keywords = [] }) {
  const keywordHints = keywords.length > 0
    ? `\nFocus keywords: ${keywords.join(', ')}.`
    : ''

  let system, user

  if (tier === 'adapt') {
    sendProgress('adapting', 'Adapting similar animation from library...')
    system = [
      'You are an expert Manim CE Python developer.',
      'You are given EXISTING working Manim code and a user request.',
      'Your job is to ADAPT the existing code with MINIMAL changes to match the new request.',
      keywordHints, '',
      'Output ONLY a JSON object: {"summary":"what changed","sceneName":"MyScene","pythonCode":"from manim import *\\n..."}',
      'No markdown, no code fences around the JSON.',
    ].join('\n')
    user = ['EXISTING CODE (adapt this):\n', baseCode, '', '\nUSER REQUEST:', prompt.trim()].join('\n')
  } else {
    sendProgress('assembling', 'Assembling from library components...')
    system = [
      'You are an expert Manim CE Python developer.',
      'You are given MULTIPLE code components from a library.',
      'Your job is to COMBINE them into ONE complete Scene class.',
      keywordHints, '',
      'Output ONLY a JSON object: {"summary":"what this does","sceneName":"MyScene","pythonCode":"from manim import *\\n..."}',
      'No markdown, no code fences around the JSON.',
    ].join('\n')
    user = ['LIBRARY COMPONENTS (combine these):\n', baseCode, '', '\nUSER REQUEST:', prompt.trim()].join('\n')
  }

  const assemblyMessages = [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ]
  const content = await _deps.llmChat(assemblyMessages, { maxTokens: 8192 })

  const parsed = await _deps.extractJsonWithContinuation(content, assemblyMessages, { maxTokens: 4096 })
  if (!parsed || !parsed.pythonCode) {
    throw new Error('Assembly generation failed.')
  }
  return {
    summary: parsed.summary || '',
    sceneName: parsed.sceneName || 'AssembledScene',
    pythonCode: parsed.pythonCode,
  }
}

async function reviewOutput({ prompt, mode, result, manimCode }) {
  sendProgress('reviewing', 'Reviewing quality...')

  const MANIM_COLOR_RULES = `
CRITICAL Manim color rules:
1. fill_color= must be set to match the user's requested color.
2. fill_opacity= must be > 0 (typically 1) for fill to be visible.
3. stroke_color= sets the border/outline color.
4. Do NOT confuse fill vs stroke.
5. Check for missing fill_opacity.`.trim()

  const TEXT_POSITIONING_RULES = `
CRITICAL text positioning rules:
1. NEVER use the same .move_to() position for multiple Text or MathTex objects.
2. Title at y ≈ 3.0-3.5. Space text at LEAST 0.8 units apart vertically.
3. Check EVERY Text/MathTex for overlapping positions.`.trim()

  const reviewSystem = mode === 'ops' ? [
    'You are a STRICT quality reviewer for a Manim animation editor.',
    '', OPS_PROPERTY_SCHEMA, '', MANIM_COLOR_RULES, '', TEXT_POSITIONING_RULES, '',
    'Return ONLY JSON: {"approved":true/false,"corrections":"explanation","summary":"description","ops":[corrected],"pythonCode":"corrected python"}',
    'No markdown, no code fences.',
  ].join('\n') : [
    'You are a STRICT quality reviewer for Manim CE Python code.',
    '', MANIM_COLOR_RULES, '', TEXT_POSITIONING_RULES, '',
    'Return ONLY JSON: {"approved":true/false,"corrections":"explanation","summary":"description","sceneName":"...","pythonCode":"corrected code"}',
    'No markdown, no code fences.',
  ].join('\n')

  const userParts = ['ORIGINAL USER PROMPT:', prompt, '']
  if (mode === 'ops') {
    userParts.push('OPS JSON:', JSON.stringify(result, null, 2), '')
    userParts.push('MANIM PYTHON CODE:', manimCode || '(none)', '')
  } else {
    userParts.push('GENERATED PYTHON CODE:', result.pythonCode || '(none)')
  }

  const reviewMessages = [
    { role: 'system', content: reviewSystem },
    { role: 'user', content: userParts.join('\n') },
  ]
  const content = await _deps.llmChat(reviewMessages, { maxTokens: 8192 })

  const parsed = await _deps.extractJsonWithContinuation(content, reviewMessages, { maxTokens: 4096 })
  if (!parsed) return { ...result, manimCode }

  const reviewResult = {
    summary: parsed.summary || result.summary || '',
    corrections: parsed.corrections || null,
    approved: parsed.approved !== false,
  }

  if (mode === 'ops') {
    reviewResult.ops = Array.isArray(parsed.ops) ? parsed.ops : result.ops
    reviewResult.manimCode = parsed.pythonCode || manimCode
  } else {
    reviewResult.sceneName = parsed.sceneName || result.sceneName
    reviewResult.pythonCode = parsed.pythonCode || result.pythonCode
  }

  return reviewResult
}

module.exports = {
  init,
  OPS_PROPERTY_SCHEMA,
  classifyPrompt,
  generateOps,
  generatePython,
  enrichAbstractPrompt,
  clarifyPrompt,
  extractOpsFromPython,
  decomposeAnimation,
  generateFromAssembly,
  reviewOutput,
}
