import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

function marked(text, query) {
  const needle = query.trim()
  const at = needle ? text.toLowerCase().indexOf(needle.toLowerCase()) : -1
  if (at < 0) return text
  return (
    <>
      {text.slice(0, at)}
      <mark>{text.slice(at, at + needle.length)}</mark>
      {text.slice(at + needle.length)}
    </>
  )
}

export function Search({ onOpenFile, onOpenFolder, onReveal, findRef, filePath }) {
  const still = window.still
  const inputRef = useRef(null)
  const tokenRef = useRef(0)
  const [place, setPlace] = useState(null)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [active, setActive] = useState(0)
  const [open, setOpen] = useState(false)
  const [settled, setSettled] = useState(false)
  const [scope, setScope] = useState('all')
  const [matchIndex, setMatchIndex] = useState(0)
  const [matchCount, setMatchCount] = useState(0)
  const [matchWindow, setMatchWindow] = useState([])

  function focusSearch() {
    const input = inputRef.current
    if (!input) return
    input.focus()
    input.select()
    setOpen(true)
  }

  useEffect(() => {
    if (!still) return undefined
    return still.on('find', focusSearch)
  }, [still])

  useEffect(() => {
    const onKey = (event) => {
      if (!(event.metaKey || event.ctrlKey) || event.altKey || event.key.toLowerCase() !== 'f') return
      event.preventDefault()
      focusSearch()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [])

  useEffect(() => {
    const text = query.trim()
    if (scope !== 'all' || !text || !still) {
      setResults([])
      setActive(0)
      setSettled(scope === 'all' && !!text)
      return undefined
    }
    setSettled(false)
    const token = ++tokenRef.current
    const timer = setTimeout(async () => {
      const result = await still.search(text)
      if (token !== tokenRef.current) return
      const next = result?.ok ? result.results : []
      setResults(next)
      setActive(0)
      setSettled(true)
      setOpen(true)
    }, 120)
    return () => clearTimeout(timer)
  }, [query, still, scope])

  useEffect(() => {
    const text = query.trim()
    const current = scope === 'file' ? matchIndex : -1
    const result = findRef?.current?.apply(text, current) || { count: 0, current: 0, matches: [] }
    setMatchCount(result.count)
    setMatchWindow(scope === 'file' ? result.matches || [] : [])
    if (scope === 'file' && result.count && result.current !== matchIndex) setMatchIndex(result.current)
  }, [query, scope, matchIndex, filePath, findRef])

  function choose(hit) {
    if (!hit) return
    if (hit.type === 'dir') onOpenFolder(hit.path)
    else if (hit.note) onOpenFile(hit.path)
    else onReveal(hit.path)
    tokenRef.current += 1
    setQuery('')
    setResults([])
    setMatchIndex(0)
    setOpen(false)
    inputRef.current?.blur()
  }

  function clearQuery() {
    tokenRef.current += 1
    setQuery('')
    setResults([])
    setMatchIndex(0)
    setOpen(true)
    inputRef.current?.focus()
  }

  function step(direction) {
    if (!matchCount) return
    setMatchIndex((index) => (index + direction + matchCount) % matchCount)
  }

  function onKeyDown(event) {
    if (event.key === 'Escape') {
      event.preventDefault()
      tokenRef.current += 1
      setQuery('')
      setResults([])
      setMatchIndex(0)
      setOpen(false)
      event.currentTarget.blur()
      return
    }
    if (scope === 'file') {
      if (event.key === 'Enter' || event.key === 'ArrowDown') {
        event.preventDefault()
        step(event.shiftKey ? -1 : 1)
      } else if (event.key === 'ArrowUp') {
        event.preventDefault()
        step(-1)
      }
      return
    }
    if (!results.length) return
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActive((index) => Math.min(results.length - 1, index + 1))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActive((index) => Math.max(0, index - 1))
    } else if (event.key === 'Enter') {
      event.preventDefault()
      choose(results[active] || results[0])
    }
  }

  const text = query.trim()
  const showList = open && scope === 'all' && text && (results.length > 0 || settled)

  useLayoutEffect(() => {
    if (!open) return undefined
    const placeMenu = () => {
      const rect = inputRef.current?.getBoundingClientRect()
      if (!rect) return
      setPlace({ top: Math.round(rect.bottom + 6), right: Math.round(window.innerWidth - rect.right) })
    }
    placeMenu()
    window.addEventListener('resize', placeMenu)
    return () => window.removeEventListener('resize', placeMenu)
  }, [open, query, scope, matchWindow.length, results.length])

  const menu = open && place && (
    <div
      className="search-results"
      style={{ top: place.top, right: place.right }}
      onMouseDown={(event) => event.preventDefault()}
    >
      <div className="search-scope" role="group" aria-label="Search in">
        <button
          type="button"
          className={scope === 'all' ? 'on' : undefined}
          aria-pressed={scope === 'all'}
          onClick={() => setScope('all')}
        >
          All files
        </button>
        <button
          type="button"
          className={scope === 'file' ? 'on' : undefined}
          aria-pressed={scope === 'file'}
          disabled={!filePath}
          onClick={() => {
            setScope('file')
            setMatchIndex(0)
          }}
        >
          This file
        </button>
      </div>
      {scope === 'file' && text && (
        <>
          <div className="search-count">{matchCount ? `${matchIndex + 1} of ${matchCount}` : 'Nothing'}</div>
          {matchWindow.map((hit) => (
            <button
              key={hit.index}
              type="button"
              className={hit.index === matchIndex ? 'search-hit on' : 'search-hit'}
              onClick={() => setMatchIndex(hit.index)}
            >
              <span className="search-name">{marked(hit.text, text)}</span>
            </button>
          ))}
        </>
      )}
      {showList && results.length === 0 && <div className="search-empty">Nothing</div>}
      {showList &&
        results.map((hit, index) => (
          <button
            key={hit.path}
            type="button"
            className={index === active ? 'search-hit on' : 'search-hit'}
            onMouseEnter={() => setActive(index)}
            onClick={() => choose(hit)}
          >
            <span className="search-name">{hit.name}</span>
            {hit.snippet && <span className="search-snippet">{hit.snippet}</span>}
          </button>
        ))}
    </div>
  )

  return (
    <div className={query ? 'search has-query' : 'search'}>
      <input
        ref={inputRef}
        type="search"
        aria-label="Search"
        placeholder="Search"
        value={query}
        spellCheck={false}
        onChange={(event) => {
          setQuery(event.target.value)
          setMatchIndex(0)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={onKeyDown}
      />
      {query.length > 0 && (
        <button type="button" className="search-clear" aria-label="Clear search" onMouseDown={(event) => event.preventDefault()} onClick={clearQuery}>
          <svg viewBox="0 0 12 12" width="10" height="10" aria-hidden="true">
            <path d="M2.2 2.2l7.6 7.6M9.8 2.2L2.2 9.8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
          </svg>
        </button>
      )}
      {menu && createPortal(menu, document.body)}
    </div>
  )
}
