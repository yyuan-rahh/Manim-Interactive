/**
 * Code library management: CRUD, search, and assembly for reuse.
 * 
 * Expects a `deps` object with:
 *   - getLibraryPath(): returns the file path
 *   - fs: Node.js fs module
 */

let _deps = {}

function init(deps) {
  _deps = deps
}

function readLibrary() {
  try {
    const p = _deps.getLibraryPath()
    if (!_deps.fs.existsSync(p)) return { snippets: [] }
    return JSON.parse(_deps.fs.readFileSync(p, 'utf-8'))
  } catch { return { snippets: [] } }
}

function writeLibrary(lib) {
  try { _deps.fs.writeFileSync(_deps.getLibraryPath(), JSON.stringify(lib, null, 2)) } catch { /* noop */ }
}

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

function searchLibrary(prompt) {
  const lib = readLibrary()
  if (!lib.snippets?.length) return []
  const promptKeywords = extractKeywords(prompt)
  const promptSet = new Set(promptKeywords)
  if (promptSet.size === 0) return []

  const mathExprs = (prompt.match(/[a-z0-9^+\-*/()]+/gi) || [])
    .filter(e => /[a-z].*[\d^]|[\d].*[a-z]/i.test(e))

  return lib.snippets
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

function addToLibrary(entry) {
  const lib = readLibrary()
  lib.snippets.push({
    id: require('crypto').randomUUID(),
    prompt: entry.prompt || '',
    description: entry.description || '',
    tags: entry.tags || [],
    pythonCode: entry.pythonCode || '',
    sceneName: entry.sceneName || '',
    mode: entry.mode || 'python',
    ops: entry.ops || null,
    videoThumbnail: entry.videoThumbnail || '',
    isComponent: entry.isComponent || false,
    componentName: entry.componentName || '',
    parentAnimationId: entry.parentAnimationId || null,
    codeSnippet: entry.codeSnippet || '',
    opsSubset: entry.opsSubset || null,
    createdAt: new Date().toISOString(),
  })
  if (lib.snippets.length > 50) lib.snippets = lib.snippets.slice(-50)
  writeLibrary(lib)
  return lib.snippets[lib.snippets.length - 1].id
}

function deleteFromLibrary(id) {
  if (!id) return false
  const lib = readLibrary()
  const before = lib.snippets.length
  lib.snippets = lib.snippets.filter(s => s.id !== id)
  if (lib.snippets.length < before) {
    writeLibrary(lib)
    return true
  }
  return false
}

function getAllLibraryEntries() {
  return readLibrary().snippets || []
}

function computeCombinedCoverage(prompt, entries) {
  const promptSet = new Set(extractKeywords(prompt))
  if (promptSet.size === 0) return 0
  const coveredWords = new Set()
  for (const entry of entries) {
    const entryText = `${entry.prompt} ${entry.description} ${(entry.tags || []).join(' ')} ${entry.componentName || ''}`
    const entrySet = new Set(extractKeywords(entryText))
    for (const w of promptSet) {
      if (entrySet.has(w)) coveredWords.add(w)
    }
  }
  return coveredWords.size / promptSet.size
}

function mergeComponentCode(components) {
  const bodies = []
  for (const comp of components) {
    const code = comp.codeSnippet || comp.pythonCode || ''
    if (!code) continue
    const match = code.match(/def\s+construct\s*\(\s*self\s*\)\s*:\s*\n([\s\S]+?)(?=\nclass\s|\n\S|\s*$)/)
    if (match) {
      bodies.push(`        # --- ${comp.componentName || comp.prompt} ---\n${match[1]}`)
    } else {
      bodies.push(`        # --- ${comp.componentName || comp.prompt} ---\n        # (full code reference)\n`)
    }
  }
  if (bodies.length === 0) return null
  return `from manim import *\n\nclass AssembledScene(Scene):\n    def construct(self):\n${bodies.join('\n\n')}`
}

function assembleFromLibrary({ prompt, libraryMatches }) {
  if (!libraryMatches?.length) return { tier: 'full', baseCode: null, components: [] }
  const best = libraryMatches[0]
  if (best._coverage >= 0.5 && best.pythonCode) {
    console.log(`[assembleFromLibrary] Tier 2 (adapt): best match "${best.prompt}" coverage=${best._coverage.toFixed(2)}`)
    return { tier: 'adapt', baseCode: best.pythonCode, baseEntry: best, components: [best] }
  }
  const relevantComponents = libraryMatches.filter(m => m._coverage >= 0.15 && (m.codeSnippet || m.pythonCode))
  if (relevantComponents.length >= 2) {
    const combinedCoverage = computeCombinedCoverage(prompt, relevantComponents)
    if (combinedCoverage >= 0.5) {
      const merged = mergeComponentCode(relevantComponents.slice(0, 4))
      if (merged) {
        console.log(`[assembleFromLibrary] Tier 3 (assemble): ${relevantComponents.length} components, combinedCoverage=${combinedCoverage.toFixed(2)}`)
        return { tier: 'assemble', baseCode: merged, components: relevantComponents.slice(0, 4) }
      }
    }
  }
  console.log('[assembleFromLibrary] Tier 4 (full): no sufficient library coverage')
  return { tier: 'full', baseCode: null, components: [] }
}

module.exports = {
  init,
  readLibrary,
  writeLibrary,
  extractKeywords,
  searchLibrary,
  addToLibrary,
  deleteFromLibrary,
  getAllLibraryEntries,
  assembleFromLibrary,
  mergeComponentCode,
  computeCombinedCoverage,
}
