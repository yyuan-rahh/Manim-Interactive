# AI Agent Workflow Map

## Overview
The ManimInteractive AI Agent uses a **tiered library-first pipeline** to transform user prompts into Manim animations. The system checks the library first and takes the cheapest possible path: direct reuse, lightweight adaptation, component assembly, or full generation.

**Tiered Pipeline Flow**:
0. **Quick Library Check** - If near-exact match exists, skip generation and render (Tier 1: 0 generation tokens, ~10s + optional ops extraction)
1. **Clarification** - Ask multiple-choice questions to resolve ambiguities
2. **Enrichment** - Expand abstract prompts into detailed animation plans (uses clarifications as context)
3. **Classification** - Route to ops or Python generation mode
4. **Resource Gathering** - Search library and online examples
4.5. **Library Assembly** - Determine tier: adapt (Tier 2), assemble (Tier 3), or full (Tier 4)
5. **Generation** - Tier-dependent: adapt existing code, assemble components, or full generation
6. **Review** - Quality control and validation
7. **Return** - Package video preview, ops, and code for user

**Tier Summary**:
| Tier | When | LLM Calls | Tokens | Est. Time |
|------|------|-----------|--------|-----------|
| 1 - Direct Reuse | Same/near-identical prompt (coverage >= 0.85) | 0 (generation) + optional ops extraction | 0–~2K | ~10s (render) + optional extraction |
| 2 - Adapt | Similar prompt, one strong match (coverage >= 0.5) | 1 (light) + review | ~3K | ~25s |
| 3 - Assemble | Multiple components cover request (combined >= 0.5) | 1 (light) + review | ~4K | ~35s |
| 4 - Full Generation | No library coverage | 3-5 (full pipeline) | ~10-15K | ~70s |

---

## Complete Workflow Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           USER INPUT                                     │
│  • Prompt text                                                          │
│  • Optional keywords: [visualize, intuitive, prove]                     │
└───────────────────────────┬─────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                STAGE 0: QUICK LIBRARY CHECK                             │
│  Function: searchLibrary(prompt) — Jaccard + coverage scoring           │
│                                                                          │
│  If best match has coverage >= 0.85 and has pythonCode:                 │
│  → TIER 1: DIRECT REUSE — skip generation, jump to render               │
│  → 0 generation tokens, ~10s (may still extract ops if missing)         │
│                                                                          │
│  Otherwise: continue to full pipeline                                   │
└───────────────────────────┬─────────────────────────────────────────────┘
                            │
              ┌─────────────┴──────────────┐
              │                            │
        coverage >= 0.85            coverage < 0.85
              │                            │
              ▼                            ▼
     ┌────────────────┐     ┌─────────────────────────────────┐
     │  DIRECT REUSE  │     │  Continue to full pipeline...   │
     │  (Tier 1)      │     └──────────────┬──────────────────┘
     │  Skip to       │                    │
     │  RENDER ──────►│──► Stage 7         ▼
     └────────────────┘
┌─────────────────────────────────────────────────────────────────────────┐
│                      STAGE 1: CLARIFICATION                             │
│  Function: clarifyPrompt({ prompt, mode, enrichedPrompt: null, keywords })│
│  Purpose: Ask user multiple-choice questions when the prompt is         │
│           ambiguous or underspecified                                   │
│                                                                          │
│  Decision Logic:                                                        │
│  • Only ask when needed (0–3 questions max)                             │
│  • Each question is multiple-choice (2–4 options)                       │
│  • Keywords reduce ambiguity (don’t ask what is already specified)      │
│                                                                          │
│  Examples:                                                              │
│  • "animate parabola" → "Show equation labels? Show vertex? Color?"     │
│  • "prove theorem" → "Focus on visual proof or algebraic steps?"        │
│                                                                          │
│  If needsClarification: true                                            │
│    → Return to frontend, wait for user answers                          │
│    → User answers questions → Continue pipeline                          │
│                                                                          │
│  Output: needsClarification: true/false, questions: []                  │
└───────────────────────────┬─────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                      STAGE 2: ENRICHMENT                                │
│  Function: enrichAbstractPrompt(promptPlusClarifications, keywords)     │
│  Purpose: Expand abstract/conceptual prompts into a detailed animation  │
│           plan (best-effort). Concrete prompts return null.             │
│                                                                          │
│  Decision Logic:                                                        │
│  • ABSTRACT (e.g., "Euclid's proof", "Fourier transform")               │
│    → Expand into: concept + visual elements + animation sequence +      │
│      mathematical details                                               │
│  • CONCRETE (e.g., "blue circle", "graph y=x^2")                        │
│    → enrichedPrompt = null                                              │
│                                                                          │
│  Keyword Influence:                                                     │
│  • visualize: Focus on diagrams, geometry, spatial relationships        │
│  • intuition: Emphasize conceptual understanding, avoid formal rigor    │
│  • prove: State theorem + assumptions + logical steps                   │
│                                                                          │
│  Output: enrichedPrompt (string) or null                                │
└───────────────────────────┬─────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                    STAGE 3: CLASSIFICATION                              │
│  Function: classifyPrompt(prompt)                                       │
│  Purpose: Determine output mode (ops or Python)                         │
│                                                                          │
│  Step 1: Library Search                                                 │
│  • Search local library with original prompt                            │
│  • Score matches: keyword overlap (Jaccard + coverage) + formula bonus  │
│  • Bonus: has ops +0.3, isComponent +0.5                                │
│                                                                          │
│  Step 2: Mode Decision                                                  │
│  • If strong library match (coverage ≥ 0.4): add a hint to bias mode    │
│  • Simple request (add/create single object) → ops mode                 │
│  • Complex request (multiple steps, transforms, proofs) → python mode   │
│  • Custom Manim code, advanced animations → python mode                 │
│                                                                          │
│  Output:                                                                │
│  • mode: "ops" or "python"                                              │
│  • searchTerms: [] (empty for ops, populated for python)                │
└───────────────────────────┬─────────────────────────────────────────────┘
                            │
                ┌───────────┴───────────┐
                │                       │
          mode: "ops"            mode: "python"
                │                       │
                ▼                       ▼
┌──────────────────────────┐  ┌──────────────────────────────────────────┐
│   STAGE 4a: OPS PATH     │  │      STAGE 4b: PYTHON PATH               │
│                          │  │                                          │
│  Library Search          │  │  Library Search (Jaccard + coverage)     │
│  • Filter: entries with  │  │  • Get all relevant matches              │
│    ops array             │  │  • Compute coverage per entry            │
│  • Return: top matches   │  │                                          │
│                          │  │  Library Assembly (Stage 4.5):           │
│                          │  │  • coverage >= 0.5 (single) → Tier 2    │
│                          │  │  • combined >= 0.5 (multi)  → Tier 3    │
│                          │  │  • otherwise                → Tier 4    │
│                          │  │                                          │
│                          │  │  Online Examples (Tier 4 only)           │
│                          │  │  • GitHub code search (ManimCommunity/manim,│
│                          │  │    3b1b/manim) using searchTerms          │
└────────────┬─────────────┘  └──────────────┬───────────────────────────┘
             │                               │
             ▼                               ▼
┌──────────────────────────┐  ┌──────────────────────────────────────────┐
│  STAGE 5a: GENERATE OPS  │  │    STAGE 5b: GENERATE PYTHON             │
│                          │  │                                          │
│  Function: generateOps() │  │  Function: generatePython()              │
│                          │  │                                          │
│  Input Context:          │  │  Input Context:                          │
│  • Effective prompt:     │  │  • Effective prompt:                     │
│    - Original prompt     │  │    - Original prompt                     │
│    - + enrichedPrompt    │  │    - + enrichedPrompt                    │
│    - + clarifications    │  │    - + clarifications                    │
│  • Keywords              │  │  • Keywords                              │
│  • Scene duration        │  │  • Library matches (truncated)           │
│  • Library ops (max 1)   │  │    - 1 component (max 1200 chars)        │
│                          │  │    - 1 full animation (max 1500 chars)   │
│  Keyword Guidance:       │  │  • Online examples (max 1)               │
│  • visualize: Use shapes │  │    - Max 1000 chars                      │
│    & graphs, add labels  │  │                                          │
│  • intuition: Simple     │  │  Keyword Guidance:                       │
│    visuals, plain text   │  │  • visualize: Diagrams, geometry, graphs │
│  • prove: Use latex,     │  │  • intuition: Conceptual understanding,  │
│    show steps            │  │    fewer equations                       │
│                          │  │  • prove: State theorem + assumptions +  │
│  Output:                 │  │    logical steps + conclusion            │
│  • summary: string       │  │                                          │
│  • ops: [                │  │  Mathematical Detail:                    │
│      { type: "addObject",│  │  • ALL relevant equations (MathTex)      │
│        object: {...} }   │  │  • Label ALL geometric elements          │
│    ]                     │  │  • Display numerical values              │
│                          │  │  • Step-by-step sequences                │
│                          │  │  • Text annotations for explanations     │
│                          │  │                                          │
│                          │  │  Output:                                 │
│                          │  │  • summary: string                       │
│                          │  │  • sceneName: string                     │
│                          │  │  • pythonCode: string (complete script)  │
└────────────┬─────────────┘  └──────────────┬───────────────────────────┘
             │                               │
             │                               ▼
             │               ┌──────────────────────────────────────────┐
             │               │  (Integrated with Stage 5b)              │
│  RENDER PYTHON PREVIEW                   │
             │               │                                          │
             │               │  • Extract scene class name              │
             │               │  • Write to temp .py file                │
             │               │  • Execute: manim render --format=mp4    │
             │               │  • Read video as base64                  │
             │               └──────────────┬───────────────────────────┘
             │                              │
             │                              ▼
             │               ┌──────────────────────────────────────────┐
             │               │  (Integrated with Stage 5b)              │
│  EXTRACT OPS FROM PYTHON                 │
             │               │                                          │
             │               │  Function: extractOpsFromPython()        │
             │               │  Purpose: Convert Python → canvas ops    │
             │               │                                          │
             │               │  LLM analyzes Python code and extracts:  │
             │               │  • Main structural elements              │
             │               │  • Position, color, size properties      │
             │               │  • Animation timing (delay, runTime)     │
             │               │  • Transform chains (transformFromId)    │
             │               │                                          │
             │               │  Priority: ACCURACY over COMPLETENESS    │
             │               │  • Skip loop-generated objects           │
             │               │  • Focus on key elements                 │
             │               │  • Translate Manim coords → canvas coords│
             │               │                                          │
             │               │  Output: ops array                       │
             │               └──────────────┬───────────────────────────┘
             │                              │
             └──────────────┬───────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                       STAGE 6: REVIEW                                   │
│  Function: reviewOutput({ code, mode, prompt })                         │
│  Purpose: Quality control and correctness verification                  │
│                                                                          │
│  Review Criteria:                                                       │
│  1. PROMPT ADHERENCE                                                    │
│     • Does output match ALL user requirements?                          │
│     • Are colors, positions, shapes correct?                            │
│     • Are mathematical details accurate?                                │
│                                                                          │
│  2. CODE QUALITY (Python mode)                                          │
│     • Valid Manim CE syntax?                                            │
│     • Proper imports (from manim import *)?                             │
│     • Scene class defined?                                              │
│     • Animation calls present?                                          │
│                                                                          │
│  3. MANIM COLOR RULES                                                   │
│     • Check fill_color=BLUE + fill_opacity=1.0                          │
│     • Verify color constants vs hex codes                               │
│     • Ensure opacity values set correctly                               │
│                                                                          │
│  4. MATHEMATICAL ACCURACY                                               │
│     • Formulas correct?                                                 │
│     • Geometric relationships valid?                                    │
│     • Proof steps logical?                                              │
│                                                                          │
│  Decision:                                                              │
│  • approved: true → Continue to user                                    │
│  • approved: false → Still continue, but return corrected output + notes │
│                                                                          │
│  Output:                                                                │
│  • approved: boolean                                                    │
│  • corrections: string (what was fixed / why)                           │
│  • summary: string                                                      │
│  • ops OR pythonCode (corrected)                                        │
└───────────────────────────┬─────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                    STAGE 7: RETURN TO USER                              │
│                                                                          │
│  Package and send to frontend:                                          │
│  • videoPreview: base64 MP4 (always)                                    │
│  • _ops: operations array (for canvas rendering)                        │
│  • _pythonCode: exact code used (for code panel)                        │
│  • summary: description of animation                                    │
│  • mode: "ops" or "python"                                              │
│                                                                          │
│  User Options:                                                          │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐                                │
│  │  APPLY  │  │  EDIT   │  │  RETRY  │                                │
│  └────┬────┘  └────┬────┘  └────┬────┘                                │
│       │            │            │                                       │
│       ▼            ▼            ▼                                       │
│   Save to      Add more    Generate                                    │
│   Library      prompts     new version                                 │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Stage Details

### Stage 0: Quick Library Check
**File**: `electron/main.js` → `searchLibrary()` + pipeline handler

**Purpose**: Before any LLM calls, check if the library already has a near-exact match for the prompt. If so, skip the entire generation pipeline and just render.

**Search Algorithm (Jaccard + Coverage)**:
- Extract keywords from prompt (lowercase, strip punctuation, filter stopwords)
- For each library entry, compute:
  - **Jaccard similarity**: `|intersection| / |union|` of keyword sets
  - **Coverage**: `|intersection| / |promptKeywords|` (fraction of prompt covered)
  - Combined score: `jaccard * 3 + coverage * 5 + formula_bonus + component_bonus`

**Tier 1 Decision**: If `coverage >= 0.85` and entry has `pythonCode` → **Direct Reuse**
- Skip: Enrichment, Clarification, Classification, Generation, Review
- Only run: Render (manim execution) + ops extraction
- Result: **0 generation LLM tokens, ~10 seconds**, plus optional ops extraction if `_ops` isn’t already stored

---

### Stage 1: Clarification
**File**: `electron/main.js` → `clarifyPrompt()`

**Purpose**: Resolve ambiguities before doing deeper work (classification/generation). If needed, ask 0–3 multiple-choice questions and wait for the user’s answers.

**Question Types**:
- Style: "Show equation labels?"
- Detail: "Include step-by-step derivation?"
- Visual: "Use specific colors?"
- Scope: "Animate entire proof or just conclusion?"

**Smart Skipping**:
- If `keywords` already specify the intent (e.g., `prove`, `intuition`) → avoid redundant questions
- Avoid asking for details already present in the prompt

**UI Format**: Multiple-choice questions, user can select options

---

### Stage 2: Enrichment
**File**: `electron/main.js` → `enrichAbstractPrompt()`

**Purpose**: Transform abstract prompts into a concrete, detailed animation plan. This stage **uses clarification answers as extra context**.

**Examples**:
- Input: `"Euclid's proof of Pythagorean theorem"`
- Output:
  ```
  CONCEPT: Euclid's proof uses area relationships...
  VISUAL ELEMENTS:
  - Right triangle (sides a, b, hypotenuse c)
  - Square on side a (area a²)
  - Square on side b (area b²)
  - Square on hypotenuse c (area c²)
  ANIMATION SEQUENCE:
  1. Draw right triangle...
  2. Construct square on side a...
  ...
  ```

**Keyword Effects**:
- `visualize`: Emphasize diagrams and spatial relationships
- `intuition`: Avoid formal notation, use conceptual language
- `prove`: Include theorem statement and logical progression

---

### Stage 3: Classification
**File**: `electron/main.js` → `classifyPrompt()`

**Purpose**: Route to appropriate generation pipeline.

**Decision Tree**:
```
Is there a strong library match (coverage >= 0.4)?
  YES → Prefer library entry's mode
  NO  → Analyze prompt complexity
    Simple (single object) → ops
    Complex (proof, multi-step) → python
    Requires custom code → python
```

**Library Scoring** (Jaccard + coverage):
- Jaccard similarity * 3 (0-3 points)
- Coverage * 5 (0-5 points)
- +2 per formula match
- +0.3 if entry has ops
- +0.5 if entry is component

---

### Stage 4: Resource Gathering
**OPS PATH**: Search library for ops-compatible entries
**PYTHON PATH**: Search library + online Manim repositories

**Online Examples Source** (Tier 4 only):
- Uses GitHub Search API (code search) scoped to:
  - `ManimCommunity/manim`
  - `3b1b/manim`
- Query is built from `searchTerms` + `language:python`

**Context Limits** (to prevent token overflow):
- Library components: 1 entry, max 1200 chars
- Library animations: 1 entry, max 1500 chars
- Online examples: 1 entry, max 1000 chars

---

### Stage 4.5: Library Assembly (Python mode only)
**File**: `electron/main.js` → `assembleFromLibrary()`

**Purpose**: Determine how much of the request can be fulfilled from existing library code.

**Tier Decision Logic**:
```
Best match coverage >= 0.5 and has pythonCode?
  YES → Tier 2 (Adapt)
         Use generateFromAssembly() with existing code
         "Adapt this code for: [prompt]"

Multiple components each >= 0.15 coverage, combined >= 0.5?
  YES → Tier 3 (Assemble)
         Merge construct() bodies from up to 4 components
         Use generateFromAssembly() to integrate + fill gaps
         "Combine these components for: [prompt]"

Otherwise → Tier 4 (Full Generation)
         Standard generatePython() pipeline
```

**Component Merging** (`mergeComponentCode`):
- Extracts `construct()` method body from each component's code
- Concatenates bodies with section comments
- Wraps in a single `AssembledScene` class

**Lightweight LLM Call** (`generateFromAssembly`):
- System prompt: ~500 tokens (vs ~2000 for full generation)
- Tier 2: "Here is existing code. Adapt with MINIMAL changes."
- Tier 3: "Here are code components. Combine into one Scene."
- Same output format as `generatePython()`: `{summary, sceneName, pythonCode}`

---

### Stage 5a: Generate Ops
**File**: `electron/main.js` → `generateOps()`

**System Prompt Structure**:
```
1. Role: Manim editor agent + mathematics educator
2. Keyword-specific guidance (if applicable)
3. Mathematical detail requirements
4. Technical rules (allowed types, camelCase, etc.)
5. Property schema (OPS_PROPERTY_SCHEMA)
6. Scene duration context
7. Example operations
8. Safety constraints
9. Library ops (if available, truncated to 5 ops)
```

**Output Format**:
```json
{
  "summary": "Added a blue circle at origin",
  "ops": [
    {
      "type": "addObject",
      "sceneId": "scene-1",
      "object": {
        "type": "circle",
        "x": 0, "y": 0,
        "radius": 1.5,
        "fill": "#3b82f6",
        "opacity": 1,
        "delay": 0,
        "runTime": 5,
        "animationType": "auto"
      }
    }
  ]
}
```

---

### Stage 5b: Generate Python (Tier-Dependent)
**File**: `electron/main.js` → `generateFromAssembly()` (Tier 2-3) or `generatePython()` (Tier 4)

**System Prompt Structure**:
```
1. Role: Manim CE Python developer + mathematics educator
2. Keyword-specific guidance (if applicable)
3. Mathematical detail requirements:
   - ALL relevant equations (MathTex)
   - Label ALL geometric elements
   - Display numerical values
   - Step-by-step sequences
4. Technical rules (imports, scene class, APIs)
5. Animation pacing guidelines
6. Output format (JSON with pythonCode)
7. Library context (components + animations, truncated)
8. Online examples (if available)
```

**Adaptation Instructions**:
- Library components: "You can ADAPT or COMBINE it"
- Similar animations: "ADAPT it if relevant"
- Minimize changes when adapting
- Combine components intelligently

**Output Format**:
```json
{
  "summary": "Animated proof of Pythagorean theorem",
  "sceneName": "PythagoreanProof",
  "pythonCode": "from manim import *\n\nclass PythagoreanProof(Scene):\n  ..."
}
```

---

### (Integrated with Stage 5b): Render Python Preview
**File**: `electron/main.js` → `renderManimPreview()`

**Process**:
1. Extract scene class name via regex
2. Write Python code to temp file
3. Execute: `manim render {file} {SceneName} --format=mp4 -ql --media_dir={temp}`
4. Read generated video file
5. Convert to base64 for transmission
6. Clean up temp files

**Error Handling**:
- Manim syntax errors → Return error to user
- Timeout (>60s) → Kill process, return error
- Missing scene class → Return error

---

### (Integrated with Stage 5b): Extract Ops from Python
**File**: `electron/main.js` → `extractOpsFromPython()`

**Purpose**: Convert Python code → canvas-renderable operations

**Strategy**: ACCURACY over COMPLETENESS
- Focus on main structural elements
- Skip loop-generated objects
- Prioritize key visual elements

**Coordinate Translation**:
- Manim: `ORIGIN = (0, 0, 0)`, unit square = 1 Manim unit
- Canvas: Center at (0, 0), unit square ~= 100 pixels

**Property Extraction**:
- Position: `.move_to()`, `.shift()`, constructor args
- Color: `color=`, `fill_color=`, `stroke_color=`
- Size: `width=`, `height=`, `radius=`
- Timing: Infer from `.play()` calls and `run_time=`
- Transforms: Track object references in `Transform(a, b)`

**Output**: Standard ops array (same format as generateOps)

---

### Stage 6: Review
**File**: `electron/main.js` → `reviewOutput()`

**Review Process**:
1. Compare output against original prompt requirements
2. Check Python syntax and Manim API correctness
3. Verify Manim color rules (fill_color + fill_opacity)
4. Validate mathematical accuracy
5. Check for completeness

**Manim Color Rules Checked**:
```python
# CORRECT:
circle = Circle(fill_color=BLUE, fill_opacity=1.0)

# INCORRECT:
circle = Circle(color=BLUE)  # Missing fill_opacity
```

**Rejection Criteria**:
- Missing requested elements
- Wrong colors/positions
- Invalid Python syntax
- Mathematical errors
- Incomplete animation

**Retry Logic**:
- Max 2 generation attempts
- After 2 failures, return to user with error

---

### Stage 7: Package and Return
**File**: `electron/main.js` → `ipcMain.handle('agent-generate')`

**Return Payload**:
```javascript
{
  success: true,
  videoPreview: "data:video/mp4;base64,...",
  _ops: [...],              // For canvas rendering
  _pythonCode: "...",       // For code panel
  summary: "...",           // Description
  mode: "ops" | "python"
}
```

**Frontend Actions**:
- Display video preview immediately
- Enable Apply/Edit/Retry buttons
- Store ops and Python code for Apply action

---

## User Action Outcomes

### Apply Button
**File**: `src/components/AIAssistantModal.jsx` → `handleApply()`

**Process**:
1. Extract video thumbnail (first frame)
2. Apply `_ops` to canvas (update project state)
3. Apply `_pythonCode` to code panel (update customCode)
4. Save to library via `libraryAddComponents()`:
   - Attempts decomposition into 2-3 components
   - Falls back to saving complete animation
   - Stores: prompt, ops, Python code, thumbnail, mode
5. Close modal

**Canvas Update**:
- New objects appear on canvas
- Timeline shows all ops with timing
- Objects become movable/editable

---

### Edit Button
**File**: `src/components/AIAssistantModal.jsx` → `handleEdit()`

**Process**:
1. User adds additional instructions
2. Append to original prompt
3. Re-run full pipeline from Stage 1
4. Keep library context + previous clarifications

---

### Retry Button
**File**: `src/components/AIAssistantModal.jsx` → `handleRetry()`

**Process**:
1. Clear current result
2. Clear clarification state
3. Clear selected keywords
4. Re-run pipeline from Stage 0 with same original prompt

---

## Library System

### Storage
**File**: `~/Library/Application Support/manim-interactive/code-library.json`

**Entry Format**:
```json
{
  "id": "uuid",
  "prompt": "original user prompt",
  "description": "what it does",
  "mode": "ops" | "python",
  "ops": [...],
  "pythonCode": "...",
  "codeSnippet": "...",  // For components
  "videoThumbnail": "data:image/...",
  "timestamp": 1234567890,
  "isComponent": true/false,
  "componentName": "Riemann Sum",
  "parentAnimationId": "parent-uuid"
}
```

**Size Limits**:
- Max 50 entries total
- Oldest entries removed when limit reached

---

### Decomposition
**File**: `electron/main.js` → `decomposeAnimation()`

**Purpose**: Break complete animations into reusable components

**Rules**:
- Identify BETWEEN 2 AND 3 components (hard cap: 3)
- Focus on core mathematical concepts
- Avoid generic scaffolding (setup, imports, scene class)
- Each component should be independently useful

**Example**:
```
Input: "Riemann sum converging to integral"
Components:
1. "Riemann Sum" (rectangles approximating area)
2. "Integral" (smooth curve with shaded region)
```

---

### Search
**Files**:
- `electron/library.js` → `searchLibrary()` (used by `agent-generate`)
- `electron/main.js` → `semanticSearchLibrary()` (used by `library-search` IPC)

**Keyword scoring (agent pipeline)**:
- Extract keywords from prompt and each entry (stopword-filtered)
- Compute:
  - **Jaccard** = \(|intersection| / |union|\)
  - **Coverage** = \(|intersection| / |prompt|\)
- Score:
  - `score = (jaccard * 3) + (coverage * 5)`
  - `+2` per math-expression substring match
  - `+0.3` if entry has `ops`
  - `+0.5` if `isComponent`
- Return top 10 results by score

**Semantic reranking (library UI search)**:
- If OpenAI credentials are available, compute an embedding for the query
- Combine keyword score with cosine similarity:
  - Existing keyword hits get `+ (semanticScore * 4)`
  - Pure semantic matches can be added when `semanticScore > 0.3`

---

### Drag-and-Drop
**Files**: 
- `src/components/LibraryPanel.jsx` (drag source)
- `src/components/Timeline.jsx` (drop target)
- `src/App.jsx` (drop handler)

**Process**:
1. User drags library entry onto canvas/timeline
2. Calculate drop time (where on timeline)
3. Offset all ops' `delay` by drop time
4. Assign new UUIDs to avoid ID collisions
5. Apply ops to canvas
6. Merge Python code into existing code panel content

**Code Merging**:
```javascript
// Extract construct() method body from new code
// Append to existing construct() method
existingCode += "\n\n# From library\n" + newConstructBody
```

---

## Error Handling

### Token Overflow
**Prevention**:
- Removed full project JSON from LLM context
- Only send minimal metadata (scene ID, duration, object count)
- Truncate library examples (1200-1500 chars max)
- Limit online examples (1000 chars max)

### Generation Failures
**Current behavior**:
- **JSON continuation**: if the model response is truncated mid-JSON, request up to 2 continuations (`extractJsonWithContinuation`)
- **Rate limits**: Anthropic calls retry with backoff (up to 3 attempts)
- **No fixed regenerate loop**: the pipeline does not currently run a hard “max 2 generations with review feedback” loop

### Rendering Failures
**Manim Errors**:
- Catch syntax errors, display to user
- Timeout after 60 seconds
- Clean up temp files on error

---

## Keyword System

### Available Keywords
**File**: `src/components/AIAssistantModal.jsx` → `KEYWORD_DEFINITIONS`

1. **visualize**
   - Purpose: Depict with diagrams, geometry, graphs
   - Effect: Increases use of shapes, adds labels, emphasizes spatial relationships

2. **intuition / intuitive**
   - Purpose: Emphasize conceptual understanding over rigor
   - Effect: Fewer equations, more visual metaphors, plain language explanations

3. **prove**
   - Purpose: Formal proof structure
   - Effect: State theorem + assumptions + step-by-step argument + conclusion

### Keyword Propagation
**Path**: Frontend → IPC → Backend → All stages

1. User selects keywords in modal
2. Passed to `agentGenerate` IPC call
3. Injected into:
   - `enrichAbstractPrompt()` system prompt
   - `clarifyPrompt()` system prompt (to avoid redundant questions)
   - `generateOps()` system prompt
   - `generatePython()` system prompt

---

## Performance Optimizations

### Tiered Library Reuse
- **Tier 1 (Direct Reuse)**: 0 generation tokens, ~10s — exact/near-exact match from library (may still extract ops if missing)
- **Tier 2 (Adapt)**: ~3K tokens, ~25s — lightweight "adapt this code" LLM call
- **Tier 3 (Assemble)**: ~4K tokens, ~35s — merge components + fill gaps
- **Tier 4 (Full Generation)**: ~10-15K tokens, ~70s — standard pipeline
- **As the library grows, more prompts hit Tier 1-3 automatically**

### Library Search Algorithm
- **Jaccard similarity**: Normalized 0-1 score based on keyword set overlap
- **Coverage metric**: Fraction of prompt keywords found in each library entry
- **Stopword filtering**: Removes 60+ common words for better signal
- **Formula matching**: Detects mathematical expression overlap

### Token Management
- **Before**: Sent entire project (potentially 200K+ tokens)
- **After**: Send only minimal context (~100 tokens)
- **Result**: 99.5% reduction in context size

### Library Context (Tier 4 only)
- Max 1 component (1200 chars)
- Max 1 full animation (1500 chars)
- Max 1 online example (1000 chars)
- **Total library context**: ~3700 chars max

### Caching
- Library loaded once at startup
- Searched locally (no network calls for ops mode)
- Online search only when searchTerms provided (Tier 4 only)

---

## Future Enhancements

### Potential Improvements
1. **Multi-turn dialogue**: Allow back-and-forth clarification
2. **Live preview**: Show partial results while generating
3. **Component tagging**: Manual tags for better library search
4. **Version history**: Track iterations of same animation
5. **Collaborative library**: Share animations with other users
6. **Fine-tuned models**: Train on Manim-specific code
7. **Visual editor**: Adjust generated animations with GUI controls
8. **Template library**: Pre-built common animation patterns

---

## Technical Stack

### LLM Providers
- OpenAI (GPT-4o-mini)
- Anthropic (Claude Sonnet 4.5)

### Key Dependencies
- Electron (app framework)
- React (UI)
- Manim Community Edition (rendering)
- Node.js (backend)

### File Structure
```
electron/
  main.js          # Backend, IPC handlers, LLM calls
  preload.js       # IPC bridge

src/
  components/
    AIAssistantModal.jsx    # Modal UI, pipeline orchestration
    LibraryPanel.jsx        # Library sidebar, drag source
    Timeline.jsx            # Timeline, drop target
    Canvas.jsx              # Canvas rendering
  agent/
    ops.js                  # Op execution logic
  utils/
    mathParser.js           # Formula parsing
```

---

## Conclusion

This multi-agent system represents a sophisticated pipeline that transforms natural language prompts into executable Manim animations. The workflow balances:

- **Intelligence** (LLM reasoning at each stage)
- **Efficiency** (library reuse, online search)
- **User Experience** (clarification, preview, easy editing)
- **Reliability** (review stage, retry logic)
- **Flexibility** (keywords for customization)

The system continuously learns from user interactions by building a local library of successful animations, making future generations faster and more accurate.
