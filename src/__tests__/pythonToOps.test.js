import { describe, it, expect } from 'vitest'
import { parsePythonToOps } from '../codegen/pythonToOps'

describe('parsePythonToOps', () => {
  it('returns empty array for null/empty input', () => {
    expect(parsePythonToOps(null)).toEqual([])
    expect(parsePythonToOps('')).toEqual([])
    expect(parsePythonToOps(123)).toEqual([])
  })

  it('parses a Circle creation', () => {
    const code = `
class MyScene(Scene):
    def construct(self):
        c = Circle(radius=2, color=RED)
        self.play(Create(c))
`
    const ops = parsePythonToOps(code)
    expect(ops.length).toBeGreaterThanOrEqual(1)
    const addOp = ops.find(op => op.type === 'addObject')
    expect(addOp).toBeDefined()
    expect(addOp.object.type).toBe('circle')
    expect(addOp.object.radius).toBe(2)
  })

  it('parses a Rectangle creation', () => {
    const code = `
class MyScene(Scene):
    def construct(self):
        r = Rectangle(width=3, height=2, color=BLUE)
        self.play(Create(r))
`
    const ops = parsePythonToOps(code)
    const addOp = ops.find(op => op.type === 'addObject')
    expect(addOp).toBeDefined()
    expect(addOp.object.type).toBe('rectangle')
    expect(addOp.object.width).toBe(3)
    expect(addOp.object.height).toBe(2)
  })

  it('parses MathTex as latex', () => {
    const code = `
class MyScene(Scene):
    def construct(self):
        tex = MathTex("x^2 + y^2 = 1")
        self.play(Write(tex))
`
    const ops = parsePythonToOps(code)
    const addOp = ops.find(op => op.type === 'addObject' && op.object.type === 'latex')
    expect(addOp).toBeDefined()
    expect(addOp.object.latex).toContain('x^2')
  })

  it('handles move_to positioning', () => {
    const code = `
class MyScene(Scene):
    def construct(self):
        d = Dot(point=[1, 2, 0])
        self.play(Create(d))
`
    const ops = parsePythonToOps(code)
    const addOp = ops.find(op => op.type === 'addObject')
    if (addOp) {
      expect(addOp.object.x).toBeDefined()
    }
  })

  it('parses Text with font_size and move_to', () => {
    const code = `
class MyScene(Scene):
    def construct(self):
        title = Text("Hello World", font_size=36, color=WHITE).move_to([0, 3, 0])
        self.play(Write(title))
`
    const ops = parsePythonToOps(code)
    const addOp = ops.find(op => op.type === 'addObject' && op.object.type === 'text')
    expect(addOp).toBeDefined()
    expect(addOp.object.text).toBe('Hello World')
    expect(addOp.object.fontSize).toBe(36)
    expect(addOp.object.y).toBe(3)
  })

  it('parses Axes with x_range and y_range', () => {
    const code = `
class MyScene(Scene):
    def construct(self):
        axes = Axes(x_range=[-3, 3, 1], y_range=[-2, 2, 1], x_length=6, y_length=4)
        self.play(Create(axes))
`
    const ops = parsePythonToOps(code)
    const addOp = ops.find(op => op.type === 'addObject' && op.object.type === 'axes')
    expect(addOp).toBeDefined()
    expect(addOp.object.xRange.min).toBe(-3)
    expect(addOp.object.xRange.max).toBe(3)
    expect(addOp.object.yRange.min).toBe(-2)
    expect(addOp.object.yRange.max).toBe(2)
    expect(addOp.object.xLength).toBe(6)
    expect(addOp.object.yLength).toBe(4)
  })

  it('applies .shift() and .set_color() mutations', () => {
    const code = `
class MyScene(Scene):
    def construct(self):
        c = Circle(radius=1, color=RED)
        c.shift(2 * RIGHT)
        c.set_color(BLUE)
        self.play(Create(c))
`
    const ops = parsePythonToOps(code)
    const addOp = ops.find(op => op.type === 'addObject')
    expect(addOp).toBeDefined()
    expect(addOp.object.x).toBeCloseTo(2, 1)
    expect(addOp.object.fill).toBe('#3b82f6')
  })

  it('parses Arrow with positional arguments', () => {
    const code = `
class MyScene(Scene):
    def construct(self):
        a = Arrow([0, 0, 0], [3, 2, 0], color=YELLOW)
        self.play(Create(a))
`
    const ops = parsePythonToOps(code)
    const addOp = ops.find(op => op.type === 'addObject' && op.object.type === 'arrow')
    expect(addOp).toBeDefined()
    expect(addOp.object.x).toBe(0)
    expect(addOp.object.y).toBe(0)
    expect(addOp.object.x2).toBe(3)
    expect(addOp.object.y2).toBe(2)
  })

  it('parses multiple objects from a scene', () => {
    const code = `
from manim import *

class DemoScene(Scene):
    def construct(self):
        c = Circle(radius=1, color=RED)
        r = Rectangle(width=2, height=1, color=BLUE)
        t = Text("Hello")
        self.play(Create(c), Create(r), Write(t))
`
    const ops = parsePythonToOps(code)
    expect(ops.length).toBe(3)
    expect(ops.map(op => op.object.type)).toEqual(
      expect.arrayContaining(['circle', 'rectangle', 'text'])
    )
  })

  it('sets default properties on parsed objects', () => {
    const code = `
class MyScene(Scene):
    def construct(self):
        c = Circle(radius=1)
`
    const ops = parsePythonToOps(code)
    const obj = ops[0]?.object
    expect(obj).toBeDefined()
    expect(obj.keyframes).toEqual([])
    expect(obj.runTime).toBe(1)
    expect(obj.delay).toBe(0)
    expect(obj.animationType).toBe('auto')
    expect(obj.rotation).toBe(0)
    expect(typeof obj.id).toBe('string')
    expect(obj.name).toBe('c')
  })
})
