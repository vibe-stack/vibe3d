import { useEffect, useState } from 'react'
import { CodeBlock } from './components.tsx'
import type { CatalogModel } from './catalog.ts'

type InstallMethod = 'command' | 'manual'

function symbolName(id: string): string {
  return id.split('-').map((part) => `${part[0]?.toUpperCase() ?? ''}${part.slice(1)}`).join('')
}

function installedImport(model: CatalogModel): string {
  return `@/models/scifi-kit/${model.id}/model`
}

function sourceDependencies(source: string): string[] {
  return [...source.matchAll(/from\s+['"]\.\.\/([a-z0-9][a-z0-9-]*)\//g)]
    .map((match) => match[1])
    .filter((value): value is string => Boolean(value))
    .filter((value, index, values) => values.indexOf(value) === index)
}

export function ModelInstallation({ model }: { model: CatalogModel }) {
  const [method, setMethod] = useState<InstallMethod>('command')
  const [source, setSource] = useState('')

  useEffect(() => {
    if (method !== 'manual' || source) return
    void model.loadSource().then((content) => setSource(content.replaceAll(
      '../../../src/asset-forge/generator/index.ts',
      '@/lib/vibe3d/scifi-kit/generator/index.ts',
    )))
  }, [method, model, source])

  const dependencies = sourceDependencies(source)
  return <section id="installation" className="reference-section">
    <h2>Installation</h2>
    <div className="install-tabs" role="tablist" aria-label="Installation method">
      <button type="button" role="tab" aria-selected={method === 'command'} onClick={() => setMethod('command')}>Command</button>
      <button type="button" role="tab" aria-selected={method === 'manual'} onClick={() => setMethod('manual')}>Manual</button>
    </div>
    {method === 'command' ? <div className="install-panel" role="tabpanel">
      <p>Run this from the root of your Three.js project. Vibe3D installs the model and every shared source dependency it needs.</p>
      <CodeBlock>{`bunx vibe3d add @scifi-kit/${model.id}`}</CodeBlock>
    </div> : <div className="install-panel manual-install" role="tabpanel">
      <ol>
        <li>Install the engine dependency with <code>bun add three</code>.</li>
        <li>Copy the shared Sci-Fi Kit runtime into <code>src/lib/vibe3d/scifi-kit</code>.</li>
        <li>Create <code>src/models/scifi-kit/{model.id}/model.ts</code> with the source below.</li>
        {dependencies.length > 0 && <li>Copy the required model folders: {dependencies.map((dependency) => <code key={dependency}>{dependency}</code>)}</li>}
      </ol>
      {source ? <details className="source-disclosure"><summary>View model.ts source</summary><CodeBlock>{source}</CodeBlock></details> : <div className="source-loading" aria-label="Loading model source" />}
    </div>}
  </section>
}

export function ModelUsage({ model }: { model: CatalogModel }) {
  const name = symbolName(model.id)
  const modulePath = installedImport(model)
  const isConfigurableWall = model.id === 'modular-wall'
  const usage = isConfigurableWall
    ? `import { createModel } from "${modulePath}"\n\nconst wall = createModel({\n  width: 5,\n  height: 3.2,\n  thickness: 0.3,\n})\n\nscene.add(wall.root)\nwall.configure({ width: 6 })`
    : `import { createModel } from "${modulePath}"\n\nconst model = createModel()\nconst root = "root" in model ? model.root : model\n\nscene.add(root)`
  const factory = isConfigurableWall
    ? `createModel(options?: ModularWallOptions): ModularWallInstance`
    : `createModel(): ${name}Model`
  const contract = isConfigurableWall
    ? `interface ModularWallOptions {\n  width?: number\n  height?: number\n  thickness?: number\n  ribCount?: number\n  materialLibrary?: MaterialLibrary\n  materials?: Partial<Record<\n    "panel" | "frame" | "accent",\n    Material\n  >>\n}\n\ninterface ModularWallInstance {\n  readonly root: Group\n  readonly parts: {\n    panel: Mesh\n    frame: Group\n    ribs: Group\n  }\n  readonly materials: Readonly<Record<\n    "panel" | "frame" | "accent",\n    Material\n  >>\n  getConfig(): Readonly<ModularWallConfig>\n  configure(patch: Partial<ModularWallConfig>): void\n  setMaterial(slot: MaterialSlot, material: Material): void\n  update(deltaSeconds: number): void\n  dispose(): void\n}`
    : `import type { createModel } from "${modulePath}"\n\nexport type ${name}Model = ReturnType<typeof createModel>\n\ninterface ${name}Module {\n  createModel: typeof createModel\n  createPreview(options: {\n    aspect: number\n    time?: number\n  }): ModelPreview\n}`

  return <>
    <section id="usage" className="reference-section"><h2>Usage</h2><p>Create the model once, add its root to your scene, and keep the returned value when you need runtime access.</p><CodeBlock>{usage}</CodeBlock></section>
    <section id="factory" className="reference-section"><h2>Factory</h2><p>The factory owns model construction. Call it per scene instance instead of sharing mutable object trees.</p><div className="signature"><code>{factory}</code></div>{isConfigurableWall && <CodeBlock>{`const wall = createModel({ width: 4 })\nwall.parts.panel.material = customPaint\nwall.setMaterial("accent", customAccent)`}</CodeBlock>}</section>
    <section id="interface" className="reference-section"><h2>Interface</h2><p>This is the TypeScript surface available to the consuming project. Because the source is local, its inferred return type remains available even when a model has a specialized controller.</p><CodeBlock>{contract}</CodeBlock></section>
    <section id="manual-installation" className="reference-section"><h2>Manual installation</h2><p>The Manual tab above exposes the model source and identifies sibling model dependencies. Keep the directory structure intact so relative imports continue to resolve.</p><CodeBlock>{`src/\n├── lib/vibe3d/scifi-kit/\n└── models/scifi-kit/${model.id}/\n    └── model.ts`}</CodeBlock></section>
  </>
}
