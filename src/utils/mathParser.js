import { Parser } from 'expr-eval'

/**
 * Math parser for evaluating mathematical functions
 * Supports common functions: sin, cos, tan, exp, log, sqrt, abs
 */
class MathParser {
  constructor() {
    this.parser = new Parser()
    this.cache = new Map()
    
    // Add common functions
    this.parser.functions.sin = Math.sin
    this.parser.functions.cos = Math.cos
    this.parser.functions.tan = Math.tan
    this.parser.functions.exp = Math.exp
    this.parser.functions.log = Math.log
    this.parser.functions.ln = Math.log
    this.parser.functions.sqrt = Math.sqrt
    this.parser.functions.abs = Math.abs
    this.parser.functions.pow = Math.pow
    this.parser.functions.pi = Math.PI
    this.parser.functions.e = Math.E
  }

  /**
   * Evaluate a function at a given x value
   * @param {string} formula - Function formula (e.g., "x^2", "sin(x)")
   * @param {number} x - X value to evaluate
   * @returns {number} Function value
   */
  evaluate(formula, x) {
    if (!formula || formula.trim() === '') {
      return 0
    }

    const cacheKey = `${formula}:${x}`
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey)
    }

    try {
      const expr = this.parser.parse(formula)
      const result = expr.evaluate({ x })
      
      // Cache result (limit cache size)
      if (this.cache.size > 1000) {
        const firstKey = this.cache.keys().next().value
        this.cache.delete(firstKey)
      }
      this.cache.set(cacheKey, result)
      
      return result
    } catch (error) {
      // Silently fail to avoid console spam during rendering
      return NaN
    }
  }

  /**
   * Sample a function across a domain
   * @param {string} formula - Function formula
   * @param {number} minX - Minimum x value
   * @param {number} maxX - Maximum x value
   * @param {number} samples - Number of sample points
   * @returns {Array<{x: number, y: number}>} Array of points
   */
  sampleFunction(formula, minX, maxX, samples = 200) {
    // Safeguard: Limit samples to prevent performance issues
    const safeSamples = Math.min(Math.max(2, Math.floor(samples)), 500)
    const points = []
    const step = (maxX - minX) / (safeSamples - 1)
    
    for (let i = 0; i < safeSamples; i++) {
      const x = minX + i * step
      const y = this.evaluate(formula, x)
      
      if (!isNaN(y) && isFinite(y)) {
        points.push({ x, y })
      }
    }
    
    return points
  }

  /**
   * Calculate numerical derivative at a point
   * @param {string} formula - Function formula
   * @param {number} x - Point to evaluate derivative
   * @param {number} h - Step size (default 0.001)
   * @returns {number} Derivative value
   */
  derivative(formula, x, h = 0.001) {
    // Central difference: f'(x) ≈ (f(x+h) - f(x-h)) / (2h)
    const fPlus = this.evaluate(formula, x + h)
    const fMinus = this.evaluate(formula, x - h)
    
    if (isNaN(fPlus) || isNaN(fMinus) || !isFinite(fPlus) || !isFinite(fMinus)) {
      return NaN
    }
    
    return (fPlus - fMinus) / (2 * h)
  }

  /**
   * Validate a formula
   * @param {string} formula - Formula to validate
   * @returns {{valid: boolean, error?: string}}
   */
  validate(formula) {
    if (!formula || formula.trim() === '') {
      return { valid: false, error: 'Formula cannot be empty' }
    }

    try {
      const expr = this.parser.parse(formula)
      // Test evaluation at a few points
      const testPoints = [-1, 0, 1]
      for (const x of testPoints) {
        const result = expr.evaluate({ x })
        if (isNaN(result) || !isFinite(result)) {
          return { valid: false, error: 'Formula produces invalid results' }
        }
      }
      return { valid: true }
    } catch (error) {
      return { valid: false, error: error.message }
    }
  }

  /**
   * Clear the evaluation cache
   */
  clearCache() {
    this.cache.clear()
  }
}

// Export singleton instance
export const mathParser = new MathParser()

