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

  const handleLoad = (entry) => {
    // Load onto canvas/code panel
    if (entry.ops?.length) {
      onApplyOps?.(entry.ops)
    }
    if (entry.pythonCode) {
      onApplyPythonCode?.(entry.pythonCode, entry.sceneName)
    }
  }

  const handleUseAsPrompt = (entry) => {
    onUseAsPrompt?.(entry.prompt)
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
          <div key={entry.id} className="library-entry">
            <div className="library-entry-thumb" onClick={() => handleLoad(entry)}>
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
            <div className="library-entry-info" onClick={() => handleLoad(entry)}>
              <div className="library-entry-prompt" title={entry.prompt}>
                {entry.prompt}
              </div>
              <div className="library-entry-meta">
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
