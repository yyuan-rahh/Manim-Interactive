import { describe, it, expect } from 'vitest'
import { generateManimCode, sanitizeClassName } from '../codegen/generator'
import { createEmptyProject, createEmptyScene } from '../project/schema'

describe('sanitizeClassName', () => {
  it('capitalises words and removes special chars', () => {
    expect(sanitizeClassName('my cool scene')).toBe('MyCoolScene')
  })

  it('removes non-alphanumeric characters', () => {
    expect(sanitizeClassName('scene #1 (test)')).toBe('Scene1Test')
  })

  it('returns fallback for empty input', () => {
    expect(sanitizeClassName('')).toBe('Scene1')
    expect(sanitizeClassName('  ')).toBe('Scene1')
  })

  it('handles single word', () => {
    expect(sanitizeClassName('circles')).toBe('Circles')
  })
})

describe('generateManimCode', () => {
  it('generates valid Python for an empty scene', () => {
    const project = createEmptyProject()
    const sceneId = project.scenes[0].id
    const code = generateManimCode(project, sceneId)

    expect(code).toContain('from manim import *')
    expect(code).toContain('class Scene1(Scene):')
    expect(code).toContain('def construct(self):')
    expect(code).toContain('pass')
  })

  it('generates code for a scene with a circle', () => {
    const project = createEmptyProject()
    const sceneId = project.scenes[0].id
    project.scenes[0].objects = [
      {
        id: 'circle-1',
        type: 'circle',
        x: 0,
        y: 0,
        radius: 1,
        fill: '#3b82f6',
        stroke: '#ffffff',
        strokeWidth: 2,
        opacity: 1,
        rotation: 0,
        zIndex: 0,
        runTime: 1,
        delay: 0,
        animationType: 'auto',
        exitAnimationType: 'FadeOut',
        keyframes: [],
      },
    ]
    const code = generateManimCode(project, sceneId)

    expect(code).toContain('Circle')
    expect(code).toContain('radius=1')
    expect(code).not.toContain('pass')
  })

  it('generates code for a scene with a rectangle', () => {
    const project = createEmptyProject()
    const sceneId = project.scenes[0].id
    project.scenes[0].objects = [
      {
        id: 'rect-1',
        type: 'rectangle',
        x: 1,
        y: 2,
        width: 3,
        height: 2,
        fill: '#ef4444',
        stroke: '#ffffff',
        strokeWidth: 2,
        opacity: 1,
        rotation: 0,
        zIndex: 0,
        runTime: 1,
        delay: 0,
        animationType: 'auto',
        exitAnimationType: 'FadeOut',
        keyframes: [],
      },
    ]
    const code = generateManimCode(project, sceneId)

    expect(code).toContain('Rectangle')
    expect(code).toContain('width=3')
    expect(code).toContain('height=2')
  })
})
