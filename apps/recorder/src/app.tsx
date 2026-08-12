import { Box, ChevronRight, Grid3X3, Palette, Pause, Play, Search, Sparkles } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { catalog, categories, initialItem, type CatalogItem } from './catalog.ts'
import { Stage, type RenderMode } from './stage.tsx'

const renderModes: RenderMode[] = ['full', 'solid', 'wireframe']

const renderModeLabels: Record<RenderMode, string> = {
  full: 'Full',
  solid: 'Solid',
  wireframe: 'Wireframe',
}

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
        <strong>{item.name}</strong>
        <small>{item.category}{item.animated ? ' · Motion' : ''}</small>
      </span>
      <ChevronRight aria-hidden="true" />
    </button>
  )
}

export function App() {
  const cleanPreview = new URLSearchParams(window.location.search).has('clean')
  const [selected, setSelected] = useState(initialItem)
  const [query, setQuery] = useState('')
  const [isAnimating, setIsAnimating] = useState(selected.animated)
  const [renderMode, setRenderMode] = useState<RenderMode>('full')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    if (!normalized) return catalog
    return catalog.filter((item) => `${item.name} ${item.category}`.toLowerCase().includes(normalized))
  }, [query])

  const grouped = useMemo(() => categories
    .map((category) => ({ category, items: filtered.filter((item) => item.category === category) }))
    .filter((group) => group.items.length > 0), [filtered])

  const handleSelect = useCallback((item: CatalogItem) => {
    setSelected(item)
    setIsAnimating(item.animated)
    const url = new URL(window.location.href)
    url.searchParams.set('model', item.id)
    window.history.replaceState({}, '', url)
  }, [])

  const handleLoadingChange = useCallback((value: boolean) => setLoading(value), [])
  const handleError = useCallback((message: string | null) => setError(message), [])
  const cycleRenderMode = useCallback(() => {
    setRenderMode((current) => {
      const index = renderModes.indexOf(current)
      return renderModes[(index + 1) % renderModes.length]
    })
  }, [])

  const nextRenderMode = renderModes[(renderModes.indexOf(renderMode) + 1) % renderModes.length]

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
    <main className={`recorder-shell${cleanPreview ? ' clean-preview' : ''}`}>
      <Stage
        item={selected}
        isAnimating={isAnimating}
        renderMode={renderMode}
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

        <div className="model-list">
          {grouped.map((group) => (
            <section key={group.category} className="model-group">
              <div className="group-label"><span>{group.category}</span><small>{group.items.length}</small></div>
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

      <div className="stage-controls">
        <button
          className="render-mode-toggle"
          type="button"
          data-mode={renderMode}
          aria-label={`Render mode: ${renderModeLabels[renderMode]}. Switch to ${renderModeLabels[nextRenderMode]}.`}
          title={`Render mode: ${renderModeLabels[renderMode]}`}
          onClick={cycleRenderMode}
        >
          {renderMode === 'full' && <Palette aria-hidden="true" />}
          {renderMode === 'solid' && <Box aria-hidden="true" />}
          {renderMode === 'wireframe' && <Grid3X3 aria-hidden="true" />}
          <span>{renderModeLabels[renderMode]}</span>
        </button>

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
      </div>

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
