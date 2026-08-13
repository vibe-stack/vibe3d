import { Box, ChevronRight, Clock, LayoutGrid, Pause, Play, Search, Sparkles } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  catalog,
  categories,
  initialItem,
  latestRelease,
  releaseGroups,
  type CatalogItem,
} from './catalog.ts'
import { Stage } from './stage.tsx'

type SortMode = 'category' | 'latest'

const isNew = (item: CatalogItem): boolean =>
  latestRelease !== null && item.addedAt?.slice(0, 10) === latestRelease.slice(0, 10)

interface ItemCardProps {
  item: CatalogItem
  active: boolean
  index: number
  onSelect(item: CatalogItem): void
}

function ItemCard({ item, active, index, onSelect }: ItemCardProps) {
  return (
    <button
      className="item-card"
      type="button"
      aria-pressed={active}
      onClick={() => onSelect(item)}
    >
      <span className="item-index">{String(index + 1).padStart(2, '0')}</span>
      <span className="item-copy">
        <strong>{item.name}{isNew(item) && <em className="item-new">New</em>}</strong>
        <small>{item.category}{item.animated ? ' · Motion' : ''}</small>
      </span>
      <ChevronRight aria-hidden="true" />
    </button>
  )
}

export function App() {
  const [selected, setSelected] = useState(initialItem)
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<SortMode>('category')
  const [isAnimating, setIsAnimating] = useState(selected.animated)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    if (!normalized) return catalog
    return catalog.filter((item) => `${item.name} ${item.category}`.toLowerCase().includes(normalized))
  }, [query])

  // Both modes produce the same shape, so the list below renders one way and
  // only the grouping key changes. Search filters first in either mode.
  const grouped = useMemo(() => {
    if (sort === 'latest') {
      return releaseGroups(filtered).map((group) => ({ key: group.label, label: group.label, items: group.items }))
    }
    return categories
      .map((category) => ({ key: category, label: category, items: filtered.filter((item) => item.category === category) }))
      .filter((group) => group.items.length > 0)
  }, [filtered, sort])

  const newCount = useMemo(() => catalog.filter(isNew).length, [])

  const handleSelect = useCallback((item: CatalogItem) => {
    setSelected(item)
    setIsAnimating(item.animated)
    const url = new URL(window.location.href)
    url.searchParams.set('model', item.id)
    window.history.replaceState({}, '', url)
  }, [])

  const handleLoadingChange = useCallback((value: boolean) => setLoading(value), [])
  const handleError = useCallback((message: string | null) => setError(message), [])

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === '/' && document.activeElement?.tagName !== 'INPUT') {
        event.preventDefault()
        document.querySelector<HTMLInputElement>('#model-search')?.focus()
      }
      if (event.code === 'Space' && selected.animated && document.activeElement?.tagName !== 'INPUT') {
        event.preventDefault()
        setIsAnimating((value) => !value)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [selected.animated])

  return (
    <main className="recorder-shell">
      <Stage
        item={selected}
        isAnimating={isAnimating}
        onLoadingChange={handleLoadingChange}
        onError={handleError}
      />
      <div className="stage-shade" aria-hidden="true" />

      <aside className="library-panel" aria-label="Sci-Fi Kit models">
        <header className="panel-header">
          <div className="brand-mark"><Box aria-hidden="true" /></div>
          <div>
            <p>Sci-Fi Kit</p>
            <span>Object recorder</span>
          </div>
          <span className="model-count">{catalog.length}</span>
        </header>

        <label className="search-field" htmlFor="model-search">
          <Search aria-hidden="true" />
          <input
            id="model-search"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Find an object"
          />
          <kbd>/</kbd>
        </label>

        <div className="sort-tabs" role="tablist" aria-label="Sort models">
          <button
            type="button"
            role="tab"
            aria-selected={sort === 'category'}
            className="sort-tab"
            onClick={() => setSort('category')}
          >
            <LayoutGrid aria-hidden="true" />
            <span>Category</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={sort === 'latest'}
            className="sort-tab"
            onClick={() => setSort('latest')}
          >
            <Clock aria-hidden="true" />
            <span>Latest</span>
            {newCount > 0 && <em>{newCount}</em>}
          </button>
        </div>

        <div className="model-list">
          {grouped.map((group) => (
            <section key={group.key} className="model-group">
              <div className="group-label"><span>{group.label}</span><small>{group.items.length}</small></div>
              {group.items.map((item) => (
                <ItemCard
                  key={item.id}
                  item={item}
                  active={item.id === selected.id}
                  index={catalog.indexOf(item)}
                  onSelect={handleSelect}
                />
              ))}
            </section>
          ))}
          {filtered.length === 0 && <p className="empty-state">No objects match “{query}”.</p>}
        </div>
      </aside>

      {selected.animated && (
        <button
          className="animation-toggle"
          type="button"
          aria-pressed={isAnimating}
          onClick={() => setIsAnimating((value) => !value)}
        >
          {isAnimating ? <Pause aria-hidden="true" /> : <Play aria-hidden="true" />}
          <span>{isAnimating ? 'Pause motion' : 'Play motion'}</span>
        </button>
      )}

      <div className="object-caption" aria-live="polite">
        <span>{selected.category}</span>
        <h1>{selected.name}</h1>
        <p><Sparkles aria-hidden="true" /> Drag to orbit · Scroll to zoom</p>
      </div>

      <div className="mobile-deck" aria-label="Sci-Fi Kit models">
        {filtered.map((item) => (
          <ItemCard
            key={item.id}
            item={item}
            active={item.id === selected.id}
            index={catalog.indexOf(item)}
            onSelect={handleSelect}
          />
        ))}
      </div>

      {loading && (
        <div className="loading-state" role="status">
          <span />
          <p>Building {selected.name}</p>
        </div>
      )}

      {error && (
        <div className="error-state" role="alert">
          <strong>Preview unavailable</strong>
          <span>{error}</span>
        </div>
      )}
    </main>
  )
}
