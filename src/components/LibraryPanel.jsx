import React, { useState, useEffect, useMemo, useCallback } from 'react'
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

  // Filter entries by search query (client-side, instant)
  const filtered = useMemo(() => {
    if (!searchQuery.trim()) return entries
    const q = searchQuery.toLowerCase().trim()
    const words = q.split(/\s+/).filter(w => w.length > 1)
    return entries.filter(e => {
      const hay = `${e.prompt} ${e.description} ${(e.tags || []).join(' ')}`.toLowerCase()
      return words.every(w => hay.includes(w))
    })
  }, [entries, searchQuery])

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
        {entries.length > 0 && (
          <button
            className="library-clear-btn"
            onClick={handleClearAll}
            title="Clear entire library"
          >
            Clear All
          </button>
        )}
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
            </div>
            <div className="library-entry-actions">
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
    </div>
  )
}
