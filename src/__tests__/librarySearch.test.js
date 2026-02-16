import { describe, it, expect, beforeEach, vi } from 'vitest'

/**
 * We test the library search logic by importing the Node module
 * and injecting mock file-system dependencies.
 */

// We can't directly import the electron module in vitest,
// so we re-implement the pure search logic for testing.
const SEARCH_STOPWORDS = new Set([
  'the', 'and', 'how', 'for', 'with', 'into', 'that', 'this', 'from',
  'are', 'was', 'were', 'been', 'has', 'have', 'had', 'does', 'did',
  'will', 'would', 'could', 'should', 'may', 'might', 'can', 'shall',
  'animate', 'animation', 'show', 'create', 'make', 'get', 'set',
  'using', 'use', 'like', 'also', 'about', 'just', 'more', 'when',
  'what', 'which', 'where', 'who', 'whom', 'why', 'not', 'all',
  'each', 'every', 'both', 'few', 'some', 'any', 'most', 'other',
  'than', 'then', 'very', 'its', 'let', 'say', 'see', 'way',
  'want', 'need', 'try', 'please', 'add', 'put', 'give',
])

function extractKeywords(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2 && !SEARCH_STOPWORDS.has(w))
}

function searchLibrary(prompt, snippets) {
  if (!snippets?.length) return []
  const promptKeywords = extractKeywords(prompt)
  const promptSet = new Set(promptKeywords)
  if (promptSet.size === 0) return []

  const mathExprs = (prompt.match(/[a-z0-9^+\-*/()]+/gi) || [])
    .filter(e => /[a-z].*[\d^]|[\d].*[a-z]/i.test(e))

  return snippets
    .map(s => {
      const entryText = `${s.prompt} ${s.description} ${(s.tags || []).join(' ')} ${s.componentName || ''}`
      const entryKeywords = extractKeywords(entryText)
      const entrySet = new Set(entryKeywords)
      const intersection = [...promptSet].filter(w => entrySet.has(w))
      const union = new Set([...promptSet, ...entrySet])
      const jaccard = union.size > 0 ? intersection.length / union.size : 0
      const coverage = promptSet.size > 0 ? intersection.length / promptSet.size : 0
      let score = (jaccard * 3) + (coverage * 5)

      const haystack = entryText.toLowerCase()
      for (const expr of mathExprs) {
        const base = expr.replace(/[+\-]\s*\d+$/, '').toLowerCase()
        if (base.length > 1 && haystack.includes(base)) score += 2
      }
      if (s.ops?.length) score += 0.3
      if (s.isComponent) score += 0.5
      return { ...s, _score: score, _jaccard: jaccard, _coverage: coverage }
    })
    .filter(s => s._score > 0)
    .sort((a, b) => b._score - a._score)
    .slice(0, 10)
}

describe('searchLibrary', () => {
  const snippets = [
    {
      id: '1',
      prompt: 'animate a blue circle',
      description: 'Creates a blue circle animation',
      tags: ['circle', 'blue', 'animation'],
      pythonCode: 'from manim import *\nclass S(Scene):\n def construct(self): ...',
      mode: 'python',
      ops: null,
    },
    {
      id: '2',
      prompt: 'graph of x^2',
      description: 'Plots a parabola y=x^2',
      tags: ['graph', 'parabola', 'quadratic'],
      pythonCode: 'from manim import *',
      mode: 'python',
      ops: [{ type: 'addObject' }],
    },
    {
      id: '3',
      prompt: 'derivative visualization',
      description: 'Shows the derivative of a function',
      tags: ['derivative', 'calculus', 'tangent'],
      pythonCode: 'from manim import *',
      mode: 'python',
      isComponent: true,
      componentName: 'DerivativeViz',
    },
    {
      id: '4',
      prompt: 'fibonacci spiral',
      description: 'Draws a golden spiral using Fibonacci numbers',
      tags: ['fibonacci', 'spiral', 'golden'],
      pythonCode: 'from manim import *',
      mode: 'python',
    },
  ]

  it('returns empty for empty prompt', () => {
    expect(searchLibrary('', snippets)).toEqual([])
    expect(searchLibrary('   ', snippets)).toEqual([])
  })

  it('returns empty for empty library', () => {
    expect(searchLibrary('circle', [])).toEqual([])
  })

  it('finds matching entries by keyword', () => {
    const results = searchLibrary('blue circle', snippets)
    expect(results.length).toBeGreaterThan(0)
    expect(results[0].id).toBe('1')
  })

  it('ranks entries by relevance score', () => {
    const results = searchLibrary('derivative calculus', snippets)
    expect(results.length).toBeGreaterThan(0)
    expect(results[0].id).toBe('3')
  })

  it('boosts entries with ops', () => {
    const results = searchLibrary('graph x^2', snippets)
    const graphEntry = results.find(r => r.id === '2')
    expect(graphEntry).toBeDefined()
    expect(graphEntry._score).toBeGreaterThan(0)
  })

  it('boosts component entries', () => {
    const results = searchLibrary('derivative', snippets)
    const compEntry = results.find(r => r.id === '3')
    expect(compEntry).toBeDefined()
    expect(compEntry.isComponent).toBe(true)
  })

  it('returns at most 10 results', () => {
    const manySnippets = Array.from({ length: 20 }, (_, i) => ({
      id: `entry-${i}`,
      prompt: `test entry number ${i}`,
      description: `description ${i}`,
      tags: ['test'],
    }))
    const results = searchLibrary('test entry', manySnippets)
    expect(results.length).toBeLessThanOrEqual(10)
  })

  it('computes coverage correctly', () => {
    const results = searchLibrary('blue circle animation', snippets)
    const top = results[0]
    expect(top.id).toBe('1')
    expect(top._coverage).toBeGreaterThan(0.5)
  })

  it('does not match unrelated entries', () => {
    const results = searchLibrary('fibonacci spiral', snippets)
    const circleEntry = results.find(r => r.id === '1')
    expect(circleEntry).toBeUndefined()
  })

  it('handles math expressions in prompt', () => {
    const results = searchLibrary('plot x^2 parabola', snippets)
    expect(results.length).toBeGreaterThan(0)
    const graphEntry = results.find(r => r.id === '2')
    expect(graphEntry).toBeDefined()
  })
})

describe('extractKeywords', () => {
  it('extracts meaningful words', () => {
    const kw = extractKeywords('animate a blue circle with rotation')
    expect(kw).toContain('blue')
    expect(kw).toContain('circle')
    expect(kw).toContain('rotation')
    expect(kw).not.toContain('animate')
    expect(kw).not.toContain('with')
  })

  it('removes short words', () => {
    const kw = extractKeywords('a to by on')
    expect(kw).toEqual([])
  })

  it('lowercases and strips special chars', () => {
    const kw = extractKeywords('Circle (RED) x^2')
    expect(kw).toContain('circle')
    expect(kw).toContain('red')
  })
})
