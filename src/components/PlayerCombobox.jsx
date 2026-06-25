import { useEffect, useMemo, useRef, useState } from 'react'
import { ALL_PLAYER_NAMES, getHeadshotUrl, getPlayerMeta } from '../data/players'

// Searchable picker over the known PGA player list.
// onSelect(name) is called with the canonical name from PLAYER_DATA.
// excludeNames: array of names to hide (e.g. already-added players).
export default function PlayerCombobox({ onSelect, excludeNames = [], placeholder = 'Search players...', autoFocus = false }) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [highlight, setHighlight] = useState(0)
  const wrapRef = useRef(null)

  const exclude = useMemo(() => new Set(excludeNames), [excludeNames])

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase()
    const base = ALL_PLAYER_NAMES.filter(n => !exclude.has(n))
    if (!q) return base.slice(0, 8)
    const starts = []
    const includes = []
    for (const n of base) {
      const low = n.toLowerCase()
      if (low.startsWith(q)) starts.push(n)
      else if (low.includes(q)) includes.push(n)
    }
    return [...starts, ...includes].slice(0, 8)
  }, [query, exclude])

  useEffect(() => {
    setHighlight(0)
  }, [query])

  useEffect(() => {
    function onDocClick(e) {
      if (!wrapRef.current?.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [])

  function choose(name) {
    onSelect?.(name)
    setQuery('')
    setOpen(false)
  }

  function onKeyDown(e) {
    if (!open) return
    if (e.key === 'ArrowDown') { e.preventDefault(); setHighlight(h => Math.min(h + 1, matches.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHighlight(h => Math.max(h - 1, 0)) }
    else if (e.key === 'Enter' && matches[highlight]) { e.preventDefault(); choose(matches[highlight]) }
    else if (e.key === 'Escape') setOpen(false)
  }

  return (
    <div className="relative" ref={wrapRef}>
      <input
        type="text"
        value={query}
        autoFocus={autoFocus}
        onChange={e => { setQuery(e.target.value); setOpen(true) }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
      />
      {open && matches.length > 0 && (
        <ul className="absolute z-20 left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-72 overflow-y-auto">
          {matches.map((name, i) => {
            const meta = getPlayerMeta(name)
            return (
              <li key={name}>
                <button
                  type="button"
                  onMouseEnter={() => setHighlight(i)}
                  onClick={() => choose(name)}
                  className={`w-full flex items-center gap-2 px-3 py-2 text-left text-sm transition ${
                    i === highlight ? 'bg-green-50' : 'hover:bg-gray-50'
                  }`}
                >
                  <img
                    src={getHeadshotUrl(name)}
                    alt=""
                    className="w-7 h-7 rounded-full object-cover object-top bg-gray-200 shrink-0"
                    onError={e => { e.currentTarget.style.visibility = 'hidden' }}
                  />
                  <span className="flex-1 truncate text-gray-800">{name}</span>
                  {meta.flag && <span className="shrink-0">{meta.flag}</span>}
                </button>
              </li>
            )
          })}
        </ul>
      )}
      {open && query && matches.length === 0 && (
        <div className="absolute z-20 left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg px-3 py-3 text-sm text-gray-500">
          No matches in known player list.
        </div>
      )}
    </div>
  )
}
