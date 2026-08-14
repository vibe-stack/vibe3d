import { Check, ChevronRight, Clipboard, Menu, Search, X } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import { catalog } from './catalog.ts'

const navigation: ReadonlyArray<{
  label: string
  items: ReadonlyArray<readonly [label: string, path: string]>
}> = [
  {
    label: 'Getting Started',
    items: [
      ['Introduction', '/docs'],
      ['Installation', '/docs/installation'],
      ['Project configuration', '/docs/configuration'],
    ],
  },
  {
    label: 'Core Concepts',
    items: [
      ['Materials', '/docs/materials'],
      ['Model contract', '/docs/models'],
      ['Publishing a kit', '/docs/registries'],
    ],
  },
  {
    label: 'Authoring',
    items: [
      ['Model authoring skill', '/docs/model-authoring'],
      ['Terrain authoring skill', '/docs/terrain-authoring'],
    ],
  },
  {
    label: 'Terrain',
    items: [
      ['Runtime and caches', '/docs/terrain'],
    ],
  },
]

export function Logo() {
  return <Link className="logo" to="/"><span>V</span> vibe3d</Link>
}

export function Header() {
  const [open, setOpen] = useState(false)
  return (
    <header className="site-header">
      <div className="header-inner">
        <Logo />
        <nav className="top-nav" aria-label="Main navigation">
          <NavLink to="/docs">Docs</NavLink>
          <NavLink to="/models">Models</NavLink>
          <NavLink to="/docs/terrain">Terrain</NavLink>
          <NavLink to="/kits/scifi-kit">Sci-Fi Kit</NavLink>
        </nav>
        <div className="header-actions">
          <Link className="search-link" to="/models"><Search size={15} /> Search models</Link>
          <span className="github-link">MIT licensed</span>
          <button className="menu-button" type="button" onClick={() => setOpen(!open)} aria-label="Toggle menu">
            {open ? <X /> : <Menu />}
          </button>
        </div>
      </div>
      {open && <nav className="mobile-nav">
        {navigation.flatMap((group) => group.items).map(([label, path]) => <NavLink key={path} to={path} onClick={() => setOpen(false)}>{label}</NavLink>)}
        <NavLink to="/models" onClick={() => setOpen(false)}>Model library</NavLink>
        <NavLink to="/kits/scifi-kit" onClick={() => setOpen(false)}>Sci-Fi Kit</NavLink>
      </nav>}
    </header>
  )
}

export function DocsLayout({ children }: { children: ReactNode }) {
  const { pathname } = useLocation()
  const isArticle = pathname.startsWith('/docs')
  const isModelDetail = pathname.startsWith('/models/')
  const isWide = pathname === '/models'
  const activeModel = catalog.find((model) => pathname === `/models/${model.id}`)
  const categories = [...new Set(catalog.map((model) => model.category))].sort()
  return (
    <div className={`docs-shell${isArticle || isModelDetail ? ' docs-shell--article' : ''}${isWide ? ' docs-shell--wide' : ''}`}>
      <aside className="docs-sidebar">
        <Link className="sidebar-search" to="/models"><Search /> <span>Search documentation</span><kbd>⌘ K</kbd></Link>
        {navigation.map((group) => <section className="sidebar-group" key={group.label}>
          <p>{group.label}</p>
          <nav>{group.items.map(([label, path]) => <NavLink end={path === '/docs'} key={path} to={path}>{label}</NavLink>)}</nav>
        </section>)}
        <section className="sidebar-group">
          <p>Model Libraries</p>
          <nav className="sidebar-tree">
            <details open>
              <summary><ChevronRight />Sci-Fi Kit</summary>
              <div className="sidebar-submenu">
                <NavLink to="/kits/scifi-kit">Overview</NavLink>
                <NavLink end to="/models">All models</NavLink>
                {categories.map((category) => <details key={category} open={activeModel?.category === category || undefined}>
                  <summary><ChevronRight />{category}</summary>
                  <div className="sidebar-submenu sidebar-submenu--models">
                    <Link to={`/models?q=${encodeURIComponent(category)}`}>View all {category.toLowerCase()}</Link>
                    {catalog.filter((model) => model.category === category).map((model) => <NavLink key={model.id} to={`/models/${model.id}`}>{model.name}</NavLink>)}
                  </div>
                </details>)}
              </div>
            </details>
          </nav>
        </section>
        <footer className="sidebar-footer"><span /> Registry connected</footer>
      </aside>
      <main className="docs-content">{children}</main>
      {isArticle && <aside className="toc"><p>On this page</p><a href="#overview">Overview</a><a href="#how-it-works">How it works</a><a href="#next">Next steps</a></aside>}
      {isModelDetail && <aside className="toc"><p>On this page</p><a href="#preview">Preview</a><a href="#installation">Installation</a><a href="#usage">Usage</a><a href="#factory">Factory</a><a href="#interface">Interface</a><a href="#manual-installation">Manual installation</a></aside>}
    </div>
  )
}

export function CodeBlock({ children }: { children: string }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    await navigator.clipboard.writeText(children)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1_500)
  }
  return (
    <div className="code-block">
      <pre><code>{children}</code></pre>
      <button type="button" onClick={() => void copy()} aria-label="Copy command">{copied ? <Check /> : <Clipboard />}</button>
    </div>
  )
}

export function PageIntro({ eyebrow, title, children }: { eyebrow?: string; title: string; children: ReactNode }) {
  return <header className="page-intro" id="overview">{eyebrow && <p className="eyebrow">{eyebrow}</p>}<h1>{title}</h1><div className="lead">{children}</div></header>
}
