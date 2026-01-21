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
3. **View Code**: The Python code panel shows the generated Manim code (read-only, updates on changes)
4. **Add Keyframes**: Use the timeline to add position/opacity/rotation keyframes
5. **Preview**: Click "Preview" to render and play the animation
6. **Save/Load**: Use the toolbar to save projects as JSON or open existing ones

## Project Structure

```
ManimInteractive/
├── electron/           # Electron main process
│   ├── main.js         # Main process entry
│   └── preload.js      # Preload script (IPC bridge)
├── src/                # React app (renderer process)
│   ├── components/     # UI components
│   ├── codegen/        # Manim code generator
│   ├── project/        # Project schema and utilities
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

