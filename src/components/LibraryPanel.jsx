import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import './LibraryPanel.css'

function timeAgo(dateStr) {
  try {
    const d = new Date(dateStr)
    const now = Date.now()
    const diff = now - d.getTime()
    const mins = Math.floor(diff / 60000)
    if (mins < 1) return 'just now'
    if (mins < 60) return `${mins}m ago`
    const hrs = Math.floor(mins / 60)
    if (hrs < 24) return `${hrs}h ago`
    const days = Math.floor(hrs / 24)
    if (days < 30) return `${days}d ago`
    return d.toLocaleDateString()
  } catch {
    return ''
  }
}

const CATEGORY_FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'components', label: 'Components' },
  { id: 'full', label: 'Full Animations' },
  { id: 'favorites', label: 'Favorites' },
]

export default function LibraryPanel({
  refreshKey,
  onApplyOps,
  onApplyPythonCode,
  onUseAsPrompt,
  onDropLibraryEntry,
}) {
  const [entries, setEntries] = useState([])
  const [searchQuery, setSearchQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [activeFilter, setActiveFilter] = useState('all')
  const [hoverEntry, setHoverEntry] = useState(null)
  const [hoverPos, setHoverPos] = useState({ x: 0, y: 0 })
  const hoverTimerRef = useRef(null)
  const [favorites, setFavorites] = useState(() => {
    try {
      return new Set(JSON.parse(localStorage.getItem('library-favorites') || '[]'))
    } catch { return new Set() }
  })

  // Load all library entries on mount
  const loadEntries = useCallback(async () => {
    if (!window.electronAPI?.libraryGetAll) {
      setLoading(false)
      return
    }
    try {
      const res = await window.electronAPI.libraryGetAll()
      if (res?.entries) {
        // Most recent first
        setEntries(res.entries.slice().reverse())
      }
    } catch { /* ignore */ }
    setLoading(false)
  }, [])

  useEffect(() => {
    loadEntries()
  }, [loadEntries, refreshKey])

  // Filter entries by search query + category filter (client-side, instant)
  const filtered = useMemo(() => {
    let result = entries

    // Apply category filter
    if (activeFilter === 'components') {
      result = result.filter(e => e.isComponent)
    } else if (activeFilter === 'full') {
      result = result.filter(e => !e.isComponent)
    } else if (activeFilter === 'favorites') {
      result = result.filter(e => favorites.has(e.id))
    }

    // Apply text search
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim()
      const words = q.split(/\s+/).filter(w => w.length > 1)
      result = result.filter(e => {
        const hay = `${e.prompt} ${e.description} ${(e.tags || []).join(' ')}`.toLowerCase()
        return words.every(w => hay.includes(w))
      })
    }

    // Sort favorites to top
    return result.sort((a, b) => {
      const aFav = favorites.has(a.id) ? 1 : 0
      const bFav = favorites.has(b.id) ? 1 : 0
      return bFav - aFav
    })
  }, [entries, searchQuery, activeFilter, favorites])

  const handleDelete = async (id) => {
    try {
      await window.electronAPI.libraryDelete?.(id)
      setEntries(prev => prev.filter(e => e.id !== id))
    } catch { /* ignore */ }
  }

  const handleUseAsPrompt = (entry) => {
    onUseAsPrompt?.(entry.prompt)
  }

  const handleClearAll = async () => {
    if (!window.confirm('Clear entire library? This cannot be undone.')) return
    try {
      await window.electronAPI.libraryClear?.()
      setEntries([])
    } catch { /* ignore */ }
  }

  const handleExport = async () => {
    try {
      const result = await window.electronAPI.libraryExport?.()
      if (result?.success) {
        console.log('Library exported to:', result.path)
      }
    } catch { /* ignore */ }
  }

  const handleImport = async () => {
    try {
      const result = await window.electronAPI.libraryImport?.()
      if (result?.success) {
        console.log(`Imported ${result.added} new entries`)
        loadEntries()
      } else if (result?.error) {
        alert(`Import failed: ${result.error}`)
      }
    } catch { /* ignore */ }
  }

  const handleEntryMouseEnter = useCallback((e, entry) => {
    clearTimeout(hoverTimerRef.current)
    hoverTimerRef.current = setTimeout(() => {
      const rect = e.currentTarget.getBoundingClientRect()
      setHoverPos({ x: rect.right + 8, y: rect.top })
      setHoverEntry(entry)
    }, 400)
  }, [])

  const handleEntryMouseLeave = useCallback(() => {
    clearTimeout(hoverTimerRef.current)
    setHoverEntry(null)
  }, [])

  const toggleFavorite = useCallback((id) => {
    setFavorites(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      try { localStorage.setItem('library-favorites', JSON.stringify([...next])) } catch {}
      return next
    })
  }, [])

  const handleDragStart = (e, entry) => {
    // Set drag data with the full library entry
    e.dataTransfer.setData('application/x-library-entry', JSON.stringify(entry))
    e.dataTransfer.effectAllowed = 'copy'
    
    // Create a small drag preview
    const ghost = document.createElement('div')
    ghost.className = 'library-drag-ghost'
    ghost.textContent = entry.prompt?.slice(0, 40) || 'Library item'
    ghost.style.cssText = 'position:fixed;top:-9999px;left:-9999px;padding:6px 12px;background:#3b82f6;color:#fff;border-radius:6px;font-size:12px;font-weight:500;white-space:nowrap;z-index:9999;pointer-events:none;'
    document.body.appendChild(ghost)
    e.dataTransfer.setDragImage(ghost, 0, 0)
    setTimeout(() => document.body.removeChild(ghost), 0)
  }

  if (loading) {
    return (
      <div className="library-panel">
        <div className="library-loading">Loading library...</div>
      </div>
    )
  }

  return (
    <div className="library-panel">
      <div className="library-search">
        <input
          type="text"
          className="library-search-input"
          placeholder="Search library..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          spellCheck={false}
        />
        <div className="library-header-actions">
          <button
            className="library-action-sm"
            onClick={handleImport}
            title="Import library from file"
          >
            Import
          </button>
          <button
            className="library-action-sm"
            onClick={handleExport}
            title="Export library to file"
            disabled={entries.length === 0}
          >
            Export
          </button>
          {entries.length > 0 && (
            <button
              className="library-clear-btn"
              onClick={handleClearAll}
              title="Clear entire library"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      <div className="library-filters">
        {CATEGORY_FILTERS.map(f => (
          <button
            key={f.id}
            className={`library-filter-btn ${activeFilter === f.id ? 'active' : ''}`}
            onClick={() => setActiveFilter(f.id)}
          >
            {f.label}
            {f.id === 'favorites' && favorites.size > 0 && (
              <span className="library-filter-count">{favorites.size}</span>
            )}
          </button>
        ))}
      </div>

      <div className="library-entries">
        {filtered.length === 0 && (
          <div className="library-empty">
            {entries.length === 0
              ? 'No saved animations yet. Use the AI assistant to create one!'
              : 'No matches found.'}
          </div>
        )}

        {filtered.map(entry => (
          <div
            key={entry.id}
            className="library-entry"
            draggable
            onDragStart={(e) => handleDragStart(e, entry)}
            onMouseEnter={(e) => handleEntryMouseEnter(e, entry)}
            onMouseLeave={handleEntryMouseLeave}
          >
            <div className="library-entry-thumb">
              {entry.videoThumbnail ? (
                <img
                  src={`data:image/jpeg;base64,${entry.videoThumbnail}`}
                  alt=""
                  className="library-thumb-img"
                />
              ) : (
                <div className="library-thumb-placeholder">
                  <span className="library-thumb-icon">▶</span>
                </div>
              )}
            </div>
            <div className="library-entry-info">
              <div className="library-entry-prompt" title={entry.prompt}>
                {entry.prompt}
              </div>
              <div className="library-entry-meta">
                {entry.isComponent && (
                  <span className="library-component-badge" title="Reusable component">
                    ⚡
                  </span>
                )}
                <span className={`library-mode-badge ${entry.mode || 'ops'}`}>
                  {entry.mode || 'ops'}
                </span>
                <span className="library-entry-date">
                  {timeAgo(entry.createdAt)}
                </span>
              </div>
              {entry.tags?.length > 0 && (
                <div className="library-entry-tags">
                  {entry.tags.slice(0, 4).map((tag, i) => (
                    <span key={i} className="library-tag">{tag}</span>
                  ))}
                  {entry.tags.length > 4 && (
                    <span className="library-tag-more">+{entry.tags.length - 4}</span>
                  )}
                </div>
              )}
            </div>
            <div className="library-entry-actions">
              <button
                className={`library-action-btn star ${favorites.has(entry.id) ? 'active' : ''}`}
                onClick={() => toggleFavorite(entry.id)}
                title={favorites.has(entry.id) ? 'Remove from favorites' : 'Add to favorites'}
              >
                {favorites.has(entry.id) ? '★' : '☆'}
              </button>
              <button
                className="library-action-btn"
                onClick={() => handleUseAsPrompt(entry)}
                title="Use as AI prompt"
              >
                AI
              </button>
              <button
                className="library-action-btn delete"
                onClick={() => handleDelete(entry.id)}
                title="Delete"
              >
                ×
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Hover preview tooltip */}
      {hoverEntry && (
        <div
          className="library-hover-preview"
          style={{
            position: 'fixed',
            left: Math.min(hoverPos.x, window.innerWidth - 320),
            top: Math.max(8, Math.min(hoverPos.y, window.innerHeight - 300)),
            zIndex: 9999,
          }}
          onMouseEnter={() => clearTimeout(hoverTimerRef.current)}
          onMouseLeave={handleEntryMouseLeave}
        >
          {hoverEntry.videoThumbnail && (
            <div className="hover-preview-thumb">
              <img
                src={`data:image/jpeg;base64,${hoverEntry.videoThumbnail}`}
                alt=""
                style={{ width: '100%', borderRadius: 4 }}
              />
            </div>
          )}
          <div className="hover-preview-prompt">{hoverEntry.prompt}</div>
          {hoverEntry.description && (
            <div className="hover-preview-desc">{hoverEntry.description}</div>
          )}
          {(hoverEntry.pythonCode || hoverEntry.codeSnippet) && (
            <pre className="hover-preview-code">
              {(hoverEntry.codeSnippet || hoverEntry.pythonCode || '').slice(0, 400)}
              {(hoverEntry.codeSnippet || hoverEntry.pythonCode || '').length > 400 && '...'}
            </pre>
          )}
        </div>
      )}
    </div>
  )
}
