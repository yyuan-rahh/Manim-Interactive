# AI Focus Keywords Guide

This document explains the focus keywords feature in the AI Assistant.

## Overview

Focus keywords allow you to customize how the AI interprets and generates animations. When you input a prompt, you can optionally select one or more keywords to guide the AI's approach.

## Available Keywords

### 1. **visualize**
**Purpose**: Depict concepts with diagrams, geometry, and graphs combined with text explanations.

**What it does:**
- Prioritizes visual elements (shapes, graphs, diagrams) over equations
- Adds text labels and annotations to all major elements
- Uses color coding to distinguish different parts
- Shows concepts through spatial relationships

**Example:**
```
Prompt: "Pythagorean theorem"
Without keyword: Might show just the equation a² + b² = c²
With "visualize": Shows a right triangle with labeled sides, three squares built on each side, area labels, and visual proof
```

### 2. **intuitive**
**Purpose**: Emphasize conceptual understanding over mathematical rigor; fewer equations, more explanations.

**What it does:**
- Uses plain language text instead of mathematical notation
- Focuses on "why" things work, not just formulas
- Creates visual analogies and metaphors
- Avoids formal proofs and technical jargon

**Example:**
```
Prompt: "Chain rule"
Without keyword: Might show ∂f/∂x = (∂f/∂u)(∂u/∂x) with formal notation
With "intuitive": Shows nested function boxes, arrows showing composition, plain text like "rate of outer × rate of inner"
```

### 3. **prove**
**Purpose**: State the theorem with assumptions, provide step-by-step logical argument, and clear conclusion.

**What it does:**
- States theorem clearly with all assumptions
- Shows each logical step with mathematical rigor
- Uses formal notation (MathTex) for all statements
- Builds to a clear conclusion statement

**Example:**
```
Prompt: "Pythagorean theorem"
Without keyword: Might show visual demonstration
With "prove": States "Given: right triangle with sides a, b, hypotenuse c", shows algebraic derivation step-by-step, concludes "Therefore, a² + b² = c²"
```

## How to Use

1. Open the AI Assistant modal (click **AI** in the toolbar)
2. Type your animation prompt
3. Click one or more keyword buttons below the prompt input
4. Click **Generate**

The selected keywords will be highlighted in purple.

## Combining Keywords

You can select multiple keywords. For example:
- **visualize** + **prove**: Creates a formal proof with extensive diagrams
- **visualize** + **intuitive**: Creates visual explanations with plain-language annotations

## Implementation Details

### Frontend (AIAssistantModal.jsx)
- Keywords are stored in `selectedKeywords` state array
- UI renders keyword buttons with tooltips
- Selected keywords are passed to the backend in the `agentGenerate` IPC call

### Backend (main.js)
- Keywords are received in the `agent-generate` handler
- Passed to `enrichAbstractPrompt()` to guide conceptual expansion
- Passed to `clarifyPrompt()` to avoid asking redundant questions
- Passed to `generatePython()` and `generateOps()` to customize generation

### Prompt Engineering
Each keyword injects specific instructions into the system prompts:

**visualize**:
```
- Use diagrams, geometric shapes, graphs, and charts extensively
- Combine visual elements with text labels and annotations
- Prioritize showing concepts through shapes and spatial relationships
```

**intuitive**:
```
- Focus on conceptual understanding over formal rigor
- Use fewer equations, more visual analogies and examples
- Explain "why" things work, not just "what" the formulas are
```

**prove**:
```
- State the theorem clearly with all assumptions
- Show each logical step with mathematical rigor
- Use MathTex for all formal statements and equations
```

## Future Extensions

Potential keywords to add:
- **dynamic**: Emphasize motion and animation
- **stepwise**: Break down into many small incremental steps
- **minimal**: Keep it simple with few elements
- **detailed**: Include comprehensive annotations and labels
- **interactive**: Suggest user-controllable elements

---

**Last Updated**: 2026-02-10
