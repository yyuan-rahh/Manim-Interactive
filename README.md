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

## License

MIT

