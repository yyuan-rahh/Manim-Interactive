import { describe, it, expect, beforeEach } from 'vitest'
import { mathParser } from '../utils/mathParser'

describe('MathParser', () => {
  beforeEach(() => {
    mathParser.clearCache()
  })

  describe('evaluate', () => {
    it('evaluates simple polynomial x^2', () => {
      expect(mathParser.evaluate('x^2', 3)).toBe(9)
      expect(mathParser.evaluate('x^2', -2)).toBe(4)
      expect(mathParser.evaluate('x^2', 0)).toBe(0)
    })

    it('evaluates linear expression 2*x + 1', () => {
      expect(mathParser.evaluate('2*x + 1', 0)).toBe(1)
      expect(mathParser.evaluate('2*x + 1', 5)).toBe(11)
    })

    it('evaluates trig functions', () => {
      expect(mathParser.evaluate('sin(x)', 0)).toBeCloseTo(0)
      expect(mathParser.evaluate('cos(x)', 0)).toBeCloseTo(1)
      expect(mathParser.evaluate('sin(x)', Math.PI / 2)).toBeCloseTo(1)
    })

    it('evaluates sqrt and abs', () => {
      expect(mathParser.evaluate('sqrt(x)', 4)).toBe(2)
      expect(mathParser.evaluate('abs(x)', -5)).toBe(5)
    })

    it('supports constants pi and e', () => {
      expect(mathParser.evaluate('pi', 0)).toBeCloseTo(Math.PI)
      expect(mathParser.evaluate('e', 0)).toBeCloseTo(Math.E)
    })

    it('returns 0 for empty formula', () => {
      expect(mathParser.evaluate('', 1)).toBe(0)
      expect(mathParser.evaluate('  ', 1)).toBe(0)
    })

    it('returns NaN for invalid formula', () => {
      expect(mathParser.evaluate('!!!', 1)).toBeNaN()
    })

    it('caches repeated evaluations', () => {
      const r1 = mathParser.evaluate('x^3', 2)
      const r2 = mathParser.evaluate('x^3', 2)
      expect(r1).toBe(8)
      expect(r2).toBe(8)
    })
  })

  describe('sampleFunction', () => {
    it('returns the expected number of sample points', () => {
      const pts = mathParser.sampleFunction('x', 0, 1, 11)
      expect(pts.length).toBe(11)
    })

    it('filters out NaN values', () => {
      const pts = mathParser.sampleFunction('1/x', -1, 1, 21)
      // x=0 produces Infinity which should be filtered out
      for (const p of pts) {
        expect(isFinite(p.y)).toBe(true)
      }
    })

    it('limits samples to 500', () => {
      const pts = mathParser.sampleFunction('x', 0, 1, 9999)
      expect(pts.length).toBeLessThanOrEqual(500)
    })
  })

  describe('derivative', () => {
    it('approximates d/dx(x^2) = 2x', () => {
      expect(mathParser.derivative('x^2', 3)).toBeCloseTo(6, 3)
      expect(mathParser.derivative('x^2', 0)).toBeCloseTo(0, 3)
    })

    it('approximates d/dx(sin(x)) = cos(x)', () => {
      expect(mathParser.derivative('sin(x)', 0)).toBeCloseTo(1, 3)
      expect(mathParser.derivative('sin(x)', Math.PI)).toBeCloseTo(-1, 3)
    })
  })

  describe('validate', () => {
    it('accepts valid formulas', () => {
      expect(mathParser.validate('x^2').valid).toBe(true)
      expect(mathParser.validate('sin(x) + cos(x)').valid).toBe(true)
    })

    it('rejects empty formulas', () => {
      expect(mathParser.validate('').valid).toBe(false)
    })

    it('rejects syntactically invalid formulas', () => {
      expect(mathParser.validate('+++').valid).toBe(false)
    })
  })
})
