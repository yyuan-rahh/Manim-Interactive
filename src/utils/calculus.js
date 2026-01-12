import { mathParser } from './mathParser'

/**
 * Calculate Riemann sum rectangles for a function
 * @param {string} formula - Function formula
 * @param {number} a - Lower bound
 * @param {number} b - Upper bound
 * @param {number} n - Number of rectangles
 * @param {string} method - 'left' | 'right' | 'midpoint' | 'trapezoid'
 * @returns {Array<{x: number, width: number, height: number, y: number}>} Array of rectangles
 */
export function calculateRiemannSum(formula, a, b, n, method = 'left') {
  // Safeguard: Limit n to prevent performance issues
  const safeN = Math.min(Math.max(1, Math.floor(n)), 200)
  if (safeN <= 0 || a >= b || !formula) return []
  
  const width = (b - a) / safeN
  const rectangles = []
  
  for (let i = 0; i < safeN; i++) {
    const xLeft = a + i * width
    const xRight = xLeft + width
    let x, height
    
    switch (method) {
      case 'left':
        x = xLeft
        height = mathParser.evaluate(formula, x)
        break
      case 'right':
        x = xRight
        height = mathParser.evaluate(formula, x)
        break
      case 'midpoint':
        x = (xLeft + xRight) / 2
        height = mathParser.evaluate(formula, x)
        break
      case 'trapezoid':
        // For trapezoid, average of left and right
        const hLeft = mathParser.evaluate(formula, xLeft)
        const hRight = mathParser.evaluate(formula, xRight)
        height = (hLeft + hRight) / 2
        x = xLeft
        break
      default:
        x = xLeft
        height = mathParser.evaluate(formula, x)
    }
    
    if (!isNaN(height) && isFinite(height)) {
      rectangles.push({
        x: xLeft,
        width: width,
        height: Math.abs(height),
        y: height >= 0 ? 0 : height, // y position (bottom of rectangle)
        value: height
      })
    }
  }
  
  return rectangles
}

/**
 * Calculate numerical integral using trapezoid rule
 * @param {string} formula - Function formula
 * @param {number} a - Lower bound
 * @param {number} b - Upper bound
 * @param {number} n - Number of subintervals (default 100)
 * @returns {number} Approximate integral value
 */
export function integrate(formula, a, b, n = 100) {
  if (a >= b) return 0
  
  const h = (b - a) / n
  let sum = 0
  
  for (let i = 0; i <= n; i++) {
    const x = a + i * h
    const y = mathParser.evaluate(formula, x)
    
    if (!isNaN(y) && isFinite(y)) {
      if (i === 0 || i === n) {
        sum += y / 2 // Endpoints weighted by 1/2
      } else {
        sum += y
      }
    }
  }
  
  return sum * h
}

/**
 * Calculate sum of Riemann rectangles
 * @param {string} formula - Function formula
 * @param {number} a - Lower bound
 * @param {number} b - Upper bound
 * @param {number} n - Number of rectangles
 * @param {string} method - Method type
 * @returns {number} Sum value
 */
export function riemannSumValue(formula, a, b, n, method) {
  const rectangles = calculateRiemannSum(formula, a, b, n, method)
  return rectangles.reduce((sum, rect) => sum + rect.width * rect.value, 0)
}

/**
 * Calculate Taylor series coefficients numerically
 * @param {string} formula - Function formula
 * @param {number} center - Expansion point
 * @param {number} degree - Polynomial degree
 * @returns {Array<number>} Coefficients [a0, a1, a2, ...]
 */
export function taylorCoefficients(formula, center, degree) {
  // Safeguard: Limit degree to prevent performance issues
  const safeDegree = Math.min(Math.max(0, Math.floor(degree)), 10)
  const coefficients = []
  const h = 0.0001
  
  for (let n = 0; n <= safeDegree; n++) {
    // Calculate n-th derivative at center using finite differences
    let derivative = 0
    if (n === 0) {
      derivative = mathParser.evaluate(formula, center)
    } else {
      // Use central difference for higher derivatives
      const step = h / Math.pow(10, n)
      let sum = 0
      for (let k = 0; k <= n; k++) {
        const sign = Math.pow(-1, k)
        const x = center + (k - n/2) * step
        const value = mathParser.evaluate(formula, x)
        const binom = factorial(n) / (factorial(k) * factorial(n - k))
        sum += sign * binom * value
      }
      derivative = sum / Math.pow(step, n)
    }
    
    coefficients.push(derivative / factorial(n))
  }
  
  return coefficients
}

function factorial(n) {
  if (n <= 1) return 1
  let result = 1
  for (let i = 2; i <= n; i++) {
    result *= i
  }
  return result
}

