# ManimInteractive

A drag-and-drop Manim animation editor for macOS. Create math animations visually and render them locally with Python Manim.

## Features

- **Visual Editor**: Drag-and-drop shapes, text, and LaTeX onto a canvas
- **Live Code Generation**: See the Manim Python code update as you edit
- **Multi-Scene Support**: Create multiple scenes like iMovie
- **Local Rendering**: Preview animations directly in the app (requires Manim installed)
- **Save/Load Projects**: Save your work as JSON files

## Requirements

For development:
- Node.js 18+
- npm or yarn

For rendering (Preview/Play):
- Python 3.8+
- Manim Community Edition (`pip install manim`)
- FFmpeg
- LaTeX (for MathTex support)

## Getting Started

### 1. Install dependencies

```bash
cd ManimInteractive
npm install
```

### 2. Run in development mode

```bash
npm run electron:dev
```

This starts both the Vite dev server and Electron.

### 3. Build for production

```bash
npm run electron:build
```

This creates a distributable `.dmg` and `.zip` in the `release/` folder.

## Usage

1. **Add Objects**: Click shapes in the palette to add them to the canvas
2. **Edit Properties**: Select an object and use the Properties panel to modify it
3. **Edit Code**: The Python code panel shows the generated Manim code, supports editing, and can **Sync to Canvas** (best-effort parse of Python → canvas objects)
4. **Add Keyframes**: Use the timeline to add position/opacity/rotation keyframes
5. **Preview**: Click "Preview" to render and play the animation
6. **Save/Load**: Use the toolbar to save projects as JSON or open existing ones

### AI Assistant (experimental)

The app includes an AI assistant (click **AI** in the toolbar) that follows a **tiered, library-first pipeline** to produce either:

- **ops mode**: small, structured patch operations against the project JSON (safer for simple edits)
- **python mode**: full Manim CE Python code (for complex, multi-step animations)

The canonical workflow map lives in `AI_AGENT_WORKFLOW.md`.

#### Pipeline summary (matches `AI_AGENT_WORKFLOW.md`)

- **Stage 0 (Quick library check)**: if a near-exact match is found (coverage ≥ 0.85), the app **reuses library code and renders immediately**.  
  This is **0 generation calls**, but may still run an **ops extraction** step if `_ops` was not already stored for that entry.
- **Stage 1 (Clarification)**: ask 0–3 multiple-choice questions when the prompt is ambiguous.
- **Stage 2 (Enrichment)**: for abstract prompts, expand into a detailed plan (uses clarification answers as context).
- **Stage 3 (Classification)**: choose **ops** vs **python** (library matches can bias the decision).
- **Stage 4 (Resource gathering)**: search the local library; in full-generation python mode, optionally fetch **GitHub code examples** (ManimCommunity/manim and 3b1b/manim) using `searchTerms`.
- **Stage 5 (Generation)**:
  - **Tier 2 Adapt**: adapt one strong library match (coverage ≥ 0.5)
  - **Tier 3 Assemble**: combine multiple components (combined coverage ≥ 0.5)
  - **Tier 4 Full**: generate from scratch (with optional online examples)
- **Stage 6 (Review)**: quality pass that can correct output and attach notes (`corrections`).
- **Stage 7 (Auto-render)**: render a preview; if python render fails, attempt an automatic fix + re-render.

#### Configuration / safety

- **Providers**: OpenAI or Anthropic (selectable in the AI modal settings).
- **API keys**: set `OPENAI_API_KEY` / `ANTHROPIC_API_KEY`, or set keys in the AI modal (stored in Electron app settings).
- **Models/Base URL**: configurable in the AI modal.
- **Formula safety**: formulas used for graphing are parsed/sanitized with a strict whitelist to reduce injection risk.

#### Focus Keywords

You can select **focus keywords** below the prompt input to guide how the AI interprets and generates your animation. These keywords help customize the style and emphasis of the generated content:

- **visualize**: Emphasizes diagrams, geometric shapes, and graphs combined with text labels. Prioritizes visual depiction over abstract notation. Use this when you want the AI to "show" rather than "tell" through equations.

- **intuition / intuitive**: Focuses on conceptual understanding over mathematical rigor. Uses fewer equations and more visual analogies. Avoids formal proofs and technical notation in favor of plain-language explanations. Best for building intuition about a concept.

- **prove**: States theorems clearly with all assumptions, provides step-by-step logical arguments with mathematical rigor, and includes clear conclusions. Use this when you want a formal mathematical proof with proper notation and logical structure.

**Example Usage:**
- "Demonstrate the chain rule" + **intuitive** → generates a visual metaphor with simple shapes and minimal equations
- "Demonstrate the chain rule" + **prove** → generates a formal statement with assumptions, step-by-step derivation, and conclusion
- "Show Pythagorean theorem" + **visualize** → generates diagrams with triangles, squares, and area labels rather than just the equation

## Project Structure

```
ManimInteractive/
├── electron/           # Electron main process
│   ├── main.js         # Main process entry
│   └── preload.js      # Preload script (IPC bridge)
│   ├── agent-pipeline.js
│   ├── llm.js
│   ├── library.js
│   └── renderer.js
├── src/                # React app (renderer process)
│   ├── components/     # UI components
│   ├── codegen/        # Manim code generator
│   ├── project/        # Project schema and utilities
│   ├── store/          # Zustand state
│   ├── App.jsx         # Main app component
│   └── main.jsx        # React entry point
├── package.json
├── vite.config.js
└── index.html
```

## Supported Objects

- Rectangle
- Circle
- Line
- Arrow
- Dot
- Polygon (regular n-gon)
- Text
- LaTeX (MathTex)
- Axes (with customizable labels)
- Graph (function plotting with Desmos-style input)

### Composable Graph Tools

The app includes composable building blocks for teaching calculus concepts. These tools can be combined to create interactive demonstrations of limits and derivatives.

#### Available Tools

- **Graph Cursor**: A draggable point constrained to a graph. Link it to a graph object and drag it along the curve.
- **Tangent Line**: Renders the tangent line at a point on the graph. Can link to a Graph Cursor to follow it, or use a direct x-coordinate.
- **Limit Probe**: Visualizes approaching a point from the left/right with approach points and arrows. Shows numeric readouts comparing function values and limit estimates.
- **Value Label**: Displays computed values like slope, x/y coordinates, or custom expressions. Can link to a Graph Cursor to show dynamic values.

#### Example Recipes

**Demonstrating Derivatives:**

1. Add an **Axes** object
2. Add a **Graph** object with a function like `x^2` or `sin(x)`, and link it to the axes
3. Add a **Graph Cursor** and link it to the graph (and optionally the axes)
4. Add a **Tangent Line** and link it to the graph cursor (it will automatically follow the cursor)
5. Optionally add a **Value Label** linked to the cursor to display the slope dynamically

**Demonstrating Limits:**

1. Add an **Axes** object
2. Add a **Graph** object with a function that has interesting limit behavior, e.g., `(x^2 - 1)/(x - 1)`
3. Add a **Graph Cursor** positioned at the limit point (x = 1 in this example)
4. Add a **Limit Probe** linked to the graph cursor, set direction to "both" to show approaching from left and right
5. The limit probe will show approach points and readouts indicating whether the limit exists

**Key Concept**: These are not single "calculus mode" buttons. Instead, you build demonstrations by combining multiple composable tools. Each tool can be animated independently on the timeline, giving you full control over the pacing and presentation of mathematical concepts.

## License

MIT

