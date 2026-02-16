/**
 * @file Core JSDoc type definitions for ManimInteractive.
 *
 * Import these types in any module with:
 *   /** @typedef {import('../types').Project} Project *​/
 *
 * These are pure type annotations — no runtime code is emitted.
 */

// ─── Project / Scene ────────────────────────────────────────────────

/**
 * @typedef {object} ProjectSettings
 * @property {number} width        - Render width in pixels (default 1920)
 * @property {number} height       - Render height in pixels (default 1080)
 * @property {number} fps          - Frames per second (default 30)
 * @property {string} backgroundColor - CSS hex colour (default '#1a1a2e')
 */

/**
 * @typedef {object} Project
 * @property {string} version   - Schema version string (e.g. '1.0.0')
 * @property {string} name      - Human-readable project name
 * @property {ProjectSettings} settings
 * @property {Scene[]} scenes
 */

/**
 * @typedef {object} Scene
 * @property {string}  id         - UUID
 * @property {string}  name       - Display name
 * @property {number}  duration   - Scene duration in seconds
 * @property {SceneObject[]} objects
 * @property {Animation[]} animations
 */

// ─── Scene Objects ──────────────────────────────────────────────────

/**
 * Common properties shared by every canvas object.
 *
 * @typedef {object} BaseObject
 * @property {string}  id           - UUID
 * @property {ObjectType} type
 * @property {number}  x            - Manim x coordinate
 * @property {number}  y            - Manim y coordinate
 * @property {number}  [rotation]   - Degrees (default 0)
 * @property {number}  [opacity]    - 0-1 (default 1)
 * @property {number}  [zIndex]     - Stacking order (default 0)
 * @property {string}  [fill]       - CSS hex colour
 * @property {string}  [stroke]     - CSS hex colour
 * @property {number}  [strokeWidth]
 * @property {number}  [runTime]    - Animation run-time in seconds
 * @property {number}  [delay]      - Delay before animation starts
 * @property {string}  [animationType]     - Entry animation type
 * @property {string}  [exitAnimationType] - Exit animation type
 * @property {Keyframe[]} [keyframes]
 * @property {string}  [transformFromId]   - ID of the object this transforms from
 * @property {string}  [transformType]     - e.g. 'Transform', 'ReplacementTransform'
 */

/**
 * @typedef {'rectangle'|'triangle'|'circle'|'line'|'arc'|'arrow'|'dot'|
 *           'polygon'|'text'|'latex'|'axes'|'graph'|'graphCursor'|
 *           'tangentLine'|'limitProbe'|'valueLabel'} ObjectType
 */

/**
 * @typedef {object} RectangleObject
 * @property {'rectangle'} type
 * @property {number} width
 * @property {number} height
 * @property {string[]} [cornerLabels] - Labels for each corner (NW,NE,SW,SE)
 */

/**
 * @typedef {object} Vertex
 * @property {number} x  - Relative to parent object centre
 * @property {number} y
 * @property {string} [label]
 */

/**
 * @typedef {object} TriangleObject
 * @property {'triangle'} type
 * @property {Vertex[]} vertices - Relative vertex positions (length 3)
 */

/**
 * @typedef {object} PolygonObject
 * @property {'polygon'} type
 * @property {Vertex[]} vertices
 */

/**
 * @typedef {object} CircleObject
 * @property {'circle'} type
 * @property {number} radius
 */

/**
 * @typedef {object} DotObject
 * @property {'dot'} type
 * @property {number} radius
 */

/**
 * @typedef {object} LineObject
 * @property {'line'} type
 * @property {number} x2 - End-point Manim x
 * @property {number} y2 - End-point Manim y
 */

/**
 * @typedef {object} ArrowObject
 * @property {'arrow'} type
 * @property {number} x2
 * @property {number} y2
 */

/**
 * @typedef {object} ArcObject
 * @property {'arc'} type
 * @property {number} x2  - End-point
 * @property {number} y2
 * @property {number} cx  - Control-point
 * @property {number} cy
 */

/**
 * @typedef {object} TextObject
 * @property {'text'} type
 * @property {string} text
 * @property {number} [fontSize]
 * @property {number} [width]
 * @property {number} [height]
 */

/**
 * @typedef {object} LatexObject
 * @property {'latex'} type
 * @property {string} latex - LaTeX expression string
 */

/**
 * @typedef {object} Range
 * @property {number} min
 * @property {number} max
 * @property {number} [step]
 */

/**
 * @typedef {object} AxesObject
 * @property {'axes'} type
 * @property {Range}  xRange
 * @property {Range}  yRange
 * @property {number} xLength - Visual length of the x-axis in Manim units
 * @property {number} yLength
 * @property {boolean} [showTicks]
 * @property {string}  [xLabel]
 * @property {string}  [yLabel]
 */

/**
 * @typedef {object} GraphObject
 * @property {'graph'} type
 * @property {string} formula   - Math expression in terms of x (e.g. 'x^2')
 * @property {Range}  xRange
 * @property {Range}  yRange
 * @property {string} [axesId]  - Linked axes UUID
 */

/**
 * @typedef {object} GraphCursorObject
 * @property {'graphCursor'} type
 * @property {number} x0           - Current x-value on the graph
 * @property {string} graphId      - Linked graph UUID
 * @property {string} [axesId]     - Linked axes UUID
 * @property {boolean} [showCrosshair]
 * @property {boolean} [showDot]
 * @property {boolean} [showLabel]
 * @property {string}  [labelFormat]
 */

/**
 * @typedef {object} TangentLineObject
 * @property {'tangentLine'} type
 * @property {string} graphId
 * @property {string} cursorId
 * @property {string} [axesId]
 * @property {number} [derivativeStep]
 * @property {number} [visibleSpan]
 * @property {boolean} [showSlopeLabel]
 * @property {number}  [slopeLabelOffset]
 */

/**
 * @typedef {object} LimitProbeObject
 * @property {'limitProbe'} type
 * @property {number} x0            - Value the limit approaches
 * @property {string} graphId
 * @property {string} [cursorId]
 * @property {string} [axesId]
 * @property {'left'|'right'|'both'} [direction]
 * @property {number[]} [deltaSchedule]
 * @property {boolean}  [showReadout]
 * @property {boolean}  [showPoints]
 * @property {boolean}  [showArrow]
 */

/**
 * @typedef {object} ValueLabelObject
 * @property {'valueLabel'} type
 * @property {string} graphId
 * @property {string} cursorId
 * @property {'slope'|'y'|'x'|'custom'} [valueType]
 * @property {string}  [customExpression]
 * @property {string}  [labelPrefix]
 * @property {string}  [labelSuffix]
 * @property {number}  [fontSize]
 * @property {boolean} [showBackground]
 * @property {string}  [backgroundFill]
 * @property {number}  [backgroundOpacity]
 */

/**
 * Union of all scene object types.
 * In practice every object also has the BaseObject common fields.
 *
 * @typedef {BaseObject & (
 *   RectangleObject | TriangleObject | PolygonObject |
 *   CircleObject | DotObject |
 *   LineObject | ArrowObject | ArcObject |
 *   TextObject | LatexObject |
 *   AxesObject | GraphObject | GraphCursorObject |
 *   TangentLineObject | LimitProbeObject | ValueLabelObject
 * )} SceneObject
 */

// ─── Keyframes / Animation ──────────────────────────────────────────

/**
 * @typedef {object} Keyframe
 * @property {number} time         - Seconds offset from object delay
 * @property {string} property     - Property name being animated
 * @property {*}      value        - Target value at this keyframe
 * @property {string} [easing]     - Easing function name
 */

/**
 * @typedef {object} Animation
 * @property {string} id
 * @property {string} objectId
 * @property {string} type          - Animation type name
 * @property {number} [startTime]
 * @property {number} [duration]
 * @property {object} [params]
 */

// ─── Agent Operations ───────────────────────────────────────────────

/**
 * @typedef {'addObject'|'updateObject'|'deleteObject'|'addKeyframe'|
 *           'setSceneDuration'|'renameScene'|'addScene'|'deleteScene'} OpType
 */

/**
 * @typedef {object} AgentOp
 * @property {OpType}  type
 * @property {string}  [sceneId]       - Target scene (defaults to active)
 * @property {object}  [object]        - For addObject: full object definition
 * @property {string}  [objectId]      - For update/delete: target object ID
 * @property {object}  [updates]       - For updateObject: partial property patch
 * @property {string}  [name]          - For renameScene / addScene
 * @property {number}  [duration]      - For setSceneDuration
 * @property {Keyframe} [keyframe]     - For addKeyframe
 */

// ─── Library ────────────────────────────────────────────────────────

/**
 * @typedef {object} LibraryEntry
 * @property {string}   id
 * @property {string}   prompt        - Original user prompt
 * @property {string}   [description]
 * @property {string[]} [tags]
 * @property {string}   [pythonCode]
 * @property {string}   [sceneName]
 * @property {'ops'|'python'|'component'} [mode]
 * @property {AgentOp[]} [ops]
 * @property {string}   [videoThumbnail] - Base64-encoded image
 * @property {number[]} [embedding]      - Semantic embedding vector
 * @property {number}   [createdAt]      - Unix timestamp (ms)
 */

// ─── Pipeline / LLM ────────────────────────────────────────────────

/**
 * @typedef {object} PipelineResult
 * @property {boolean} success
 * @property {string}  [mode]           - 'ops' | 'python'
 * @property {string}  [summary]
 * @property {string}  [corrections]
 * @property {string}  [videoBase64]
 * @property {string}  [renderError]
 * @property {AgentOp[]} [_ops]
 * @property {string}  [_pythonCode]
 * @property {string}  [_sceneName]
 * @property {string}  [error]
 * @property {boolean} [needsClarification]
 * @property {ClarifyQuestion[]} [questions]
 */

/**
 * @typedef {object} ClarifyQuestion
 * @property {string}  id
 * @property {string}  prompt
 * @property {boolean} [allowMultiple]
 * @property {ClarifyOption[]} options
 */

/**
 * @typedef {object} ClarifyOption
 * @property {string} id
 * @property {string} label
 */

// ─── Export nothing at runtime ──────────────────────────────────────
// This file is imported only for its JSDoc types.
export {}
