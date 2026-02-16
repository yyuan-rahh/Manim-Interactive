---
name: manim-lesson-agent
description: Builds reliable Manim lessons from teacher prompts using a plan→research→assemble→render-verify loop, with a growing vetted pattern library. Use when implementing or iterating on an in-app Manim/LLM agent, prompt-to-animation workflows, GitHub pattern mining, or render-based verification.
---

# Manim Lesson Agent (in-app) — Operating Guide

## Goal
Turn a short teacher prompt into a working Manim animation with maximum reliability by:
- asking for missing details
- reusing vetted patterns
- rendering and verifying against requirements
- saving newly verified patterns into a local library

## Required workflow (do not skip)
1. **Interpret prompt** into a structured lesson spec:
   - learning objective
   - storyboard beats (bullet list)
   - required visuals (objects)
   - timing constraints (approx durations)
2. **Ask missing-info questions** (only what’s necessary). Default to multiple-choice options.
3. **Search local pattern library first** for matching patterns.
4. If needed, **research GitHub**:
   - Prefer Manim Community Edition compatible code
   - Prefer permissive licenses (MIT/BSD/Apache-2.0)
   - Extract minimal snippets/ideas, with attribution
5. **Assemble output** using safe constraints:
   - Prefer structured “scene ops / project JSON” over raw Python
   - If Python is required, use a fixed safe template and minimal imports
6. **Render + verify**:
   - Render low-quality preview
   - Evaluate against rubric derived from the spec
   - If fail: create a patch (smallest change) and retry (cap iterations)

## Pattern library rules
- Only add a pattern after it renders successfully and passes rubric checks.
- Store: tags, source URL/path, commit hash, license, snippet/recipe, and a minimal test scene.
- Never store proprietary content or code without a compatible license.

## Output formats
- For planning: provide a structured plan with storyboard beats and a “missing info” checklist.
- For building: produce either:
  - (Preferred) a list of scene operations against the app schema
  - (Fallback) a single Scene python file within the allowed template

## Repair loop behavior
- Patch-only changes preferred.
- Always cite the failure signal (render error or rubric miss) that motivated the patch.
