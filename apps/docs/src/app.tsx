import { ArrowRight, Box, Braces, PackageOpen, Palette, Terminal } from 'lucide-react'
import { lazy, Suspense } from 'react'
import { Link, Navigate, Outlet, Route, Routes, useParams, useSearchParams } from 'react-router-dom'
import { CodeBlock, DocsLayout, Header, PageIntro } from './components.tsx'
import { catalog, findModel } from './catalog.ts'
import { ModelInstallation, ModelUsage } from './model-documentation.tsx'

const ModelPreview = lazy(async () => {
  const module = await import('./model-preview.tsx')
  return { default: module.ModelPreview }
})

const installOne = 'bunx vibe3d add @scifi-kit/pressure-gauge'

function Home() {
  return <>
    <Header />
    <main>
      <section className="hero">
        <p className="eyebrow">Source-first models for Three.js</p>
        <h1>Your scene deserves more than another opaque asset pack.</h1>
        <p>Vibe3D installs production-ready 3D models directly into your project. Keep the source, tune the materials, expose the moving parts, and ship the result as your own.</p>
        <div className="hero-actions"><Link className="primary-button" to="/docs/installation">Get started <ArrowRight size={17} /></Link><Link className="secondary-button" to="/models">Browse {catalog.length} models</Link></div>
        <CodeBlock>{installOne}</CodeBlock>
      </section>
      <section className="feature-grid">
        <article><PackageOpen /><h2>Files, not a black box</h2><p>Every install lands as readable TypeScript in your codebase. Change it, version it, and keep it.</p></article>
        <article><Palette /><h2>Materials with a home</h2><p>Kits mount a shared material library. Override a whole theme or one mesh without rebuilding the model.</p></article>
        <article><Braces /><h2>Runtime access included</h2><p>Stable handles expose doors, lights, panels, and dimensions to the rest of your application.</p></article>
      </section>
      <section className="home-models"><div><p className="eyebrow">The first library</p><h2>Sci-Fi Kit is built to be taken apart.</h2><p>Start with one prop or install the complete set. The same registry contract is open to every kit author.</p></div><div className="model-links">{catalog.slice(0, 6).map((model) => <Link key={model.id} to={`/models/${model.id}`}><span>{model.name}</span><ArrowRight /></Link>)}</div></section>
      <section className="home-contributors">
        <div className="contributors-heading">
          <p className="eyebrow">Maintainers &amp; contributors</p>
          <h2>Built by people who care about the details.</h2>
          <p>Vibe3D grows through source contributions that make the library broader, sharper, and more useful.</p>
        </div>
        <div className="contributor-list">
          <a className="contributor-card" href="https://x.com/alightinastorm" target="_blank" rel="noreferrer" aria-label="@alightinastorm on X">
            <img src="https://github.com/alightinastorm.png?size=160" alt="" width="80" height="80" loading="lazy" />
            <span>
              <small>Maintainer · @alightinastorm</small>
              <strong>@alightinastorm</strong>
              <p>Maintains Vibe3D and the Sci-Fi Kit.</p>
            </span>
            <ArrowRight aria-hidden="true" />
          </a>
          <a className="contributor-card" href="https://github.com/aronprins" target="_blank" rel="noreferrer">
            <img src="https://github.com/aronprins.png?size=160" alt="" width="80" height="80" loading="lazy" />
            <span>
              <small>Contributor · @aronprins</small>
              <strong>Aron Prins</strong>
              <p>Created the 50-model Axiom Relay cargo, storage, and logistics collection.</p>
            </span>
            <ArrowRight aria-hidden="true" />
          </a>
        </div>
      </section>
    </main>
  </>
}

const docsCopy = {
  docs: {
    title: 'Build the scene you actually need.',
    intro: 'Vibe3D is a source installer and registry format for Three.js models. It gives model authors a predictable contract and gives application developers full ownership after installation.',
    body: <>A model is not only geometry. It can carry configurable dimensions, runtime handles, shared materials, update hooks, and clear disposal semantics. Vibe3D keeps those boundaries explicit while leaving the implementation in your repository.</>,
    code: 'bunx vibe3d init\nbunx vibe3d add @scifi-kit/pressure-gauge',
  },
  installation: {
    title: 'Install Vibe3D in a minute.',
    intro: 'Initialize a Three.js project once, register the libraries you trust, then add models as source whenever you need them.',
    body: <>The init command creates <code>models.json</code>, a lock receipt, and the small runtime layer shared by installed models. Add commands preserve edited files unless you explicitly choose to overwrite them.</>,
    code: 'bunx vibe3d init\nbunx vibe3d add @scifi-kit/pressure-gauge\n# or install the complete library\nbunx vibe3d add @scifi-kit',
  },
  configuration: {
    title: 'One file defines where everything lives.',
    intro: 'models.json belongs to the consuming project. It maps registry namespaces, install paths, import aliases, and the target engine.',
    body: <>Registry packages can live on npm, behind an HTTPS endpoint, or in a local workspace. A checked-in lock file records exactly which source files were installed.</>,
    code: '{\n  "engine": "three",\n  "paths": { "vibe3d": "src/lib/vibe3d", "models": "src/models" },\n  "registries": {\n    "@scifi-kit": { "source": "npm:@scifi-kit/registry", "version": "^0.0.1" }\n  }\n}',
  },
  materials: {
    title: 'A material system you can replace.',
    intro: 'Models ask for semantic material roles such as painted metal, rubber, glass, or warning light. The installed kit maps those roles to Three.js materials.',
    body: <>Swap the library-level resolver for a new visual direction, pass overrides while creating a model, or reach a named mesh through its runtime handles for a one-off treatment.</>,
    code: 'const wall = createModularWall({\n  width: 4,\n  materials: { paintedMetal: myPaint }\n})\nscene.add(wall.root)',
  },
  models: {
    title: 'A small contract with useful access.',
    intro: 'Factories are the default because they compose cleanly, avoid hidden lifecycle state, and return an explicit instance the application owns.',
    body: <>Each instance exposes a root Object3D, stable named parts, update methods for configurable properties, an optional animation tick, and dispose. You can still wrap that result in a class when an application benefits from one.</>,
    code: 'const door = createBlastDoor({ width: 3.2 })\nscene.add(door.root)\n\ndoor.parts.leftPanel.material = damagedPaint\ndoor.setOpen(0.75)\ndoor.configure({ width: 4 })',
  },
  registries: {
    title: 'Publish a kit without asking permission.',
    intro: 'A Vibe3D registry is a versioned manifest plus source files. Publish it through npm and anyone can map its namespace in models.json.',
    body: <>The conformance checks validate safe paths, dependency closure, metadata, engine compatibility, and the model lifecycle before release. Namespaces keep independent libraries from colliding.</>,
    code: 'bunx vibe3d registry validate ./registry.json\nnpm publish\n\n# consumer\nbunx vibe3d add @your-kit/your-model',
  },
  terrain: {
    title: 'Procedural terrain with a deterministic fast path.',
    intro: '@vibe3djs/terrain keeps the procedural recipe authoritative while compiled topology and surface-bake artifacts make production startup predictable.',
    body: <>Terrain assets can validate a cache fingerprint, decode reusable connectivity, LODs, adjacency, collision data, and material channels, then fall back to source generation when that cache is absent or stale. The cached representation is not a final rendered mesh: applications still own runtime geometry, materials, and disposal.</>,
    code: 'import { createTerrainAsset, decodeCompiledTopology } from "@vibe3djs/terrain"\nimport { createWebGpuTopologyBuffers } from "@vibe3djs/terrain/three-webgpu"\n\nconst topology = decodeCompiledTopology(bytes)\nconst buffers = createWebGpuTopologyBuffers(topology)',
  },
  terrainAuthoring: {
    title: 'Install the terrain authoring workflow.',
    intro: 'The vibe-terrain package installs the project-local workflow for deterministic WebGPU terrain, compiled topology, multi-seed validation, and biome-aware materials.',
    body: <>Author the field and runtime source together, preview the single asset early, compile topology and surface caches only after the shape is accepted, and keep source fallback working. The installed workflow documents the cache contract, catalogue metadata, preview loop, and runtime ownership rules beside the project that uses them.</>,
    code: 'bunx vibe-terrain\n# or with npm\nnpx vibe-terrain\n\n# the workflow is installed into the current project\n# commit it beside the terrain source it governs',
  },
} as const

function DocPage({ page }: { page: keyof typeof docsCopy }) {
  const copy = docsCopy[page]
  return <article className="prose"><PageIntro eyebrow="Vibe3D documentation" title={copy.title}><p>{copy.intro}</p></PageIntro><section id="how-it-works"><h2>How it works</h2><p>{copy.body}</p><CodeBlock>{copy.code}</CodeBlock></section><section id="next"><h2>Keep going</h2><p>Browse the model library, inspect a live preview, then install only the source your scene needs.</p><Link className="text-link" to="/models">Explore the model library <ArrowRight /></Link></section></article>
}

function ModelAuthoringPage() {
  return <article className="prose">
    <PageIntro eyebrow="Vibe Model · Authoring skill" title="Build a model inside an empty Three.js project.">
      <p><code>vibe-model</code> installs a project-local workflow for Codex. It is not a model generator or a Three.js runtime dependency: Codex reads the installed instructions, authors normal TypeScript in your repository, and uses the preview loop your project provides.</p>
    </PageIntro>

    <section id="how-it-works">
      <h2>Start from an empty directory</h2>
      <p>Create a small Vite project, add Three.js, then install the skill into <code>.agents/skills/vibe-model</code>.</p>
      <CodeBlock>{`mkdir cargo-viewer
cd cargo-viewer
bun create vite . --template vanilla-ts
bun install
bun add three
bunx vibe-model`}</CodeBlock>
      <p>The last command copies the skill and its reference files into the current project. It does not modify <code>package.json</code>, create a model, or add a preview command. Commit the <code>.agents/skills/vibe-model</code> directory when collaborators and agents should share the same workflow.</p>
    </section>

    <section id="prompt" className="reference-section">
      <h2>Ask Codex for the asset</h2>
      <p>Give Codex the object, intended scale, interaction requirements, and any reference images. Name the installed skill so the request uses its preview-first hard-surface workflow.</p>
      <CodeBlock>{`Use vibe-model to build a weathered sci-fi cargo crate.
Put the source at src/models/cargo-crate/model.ts.
Export createModel, keep the root stable, and expose a lid anchor.
Use the attached front and three-quarter reference images.
Wire a deterministic preview into this Vite app.`}</CodeBlock>
      <p>The accepted source remains ordinary Three.js code. The expected entry point is <code>createModel</code>, returning either a <code>Group</code> or a controller with a stable <code>root</code>, optional <code>update</code>, semantic parts, actions, and an idempotent <code>dispose</code>.</p>
    </section>

    <section id="preview" className="reference-section">
      <h2>Preview in the empty project</h2>
      <p>For a plain Vite project, let Codex connect the model to <code>src/main.ts</code>, then use the application itself as the visual loop.</p>
      <CodeBlock>{`bun run dev

# typical model import inside src/main.ts
import { createModel } from "./models/cargo-crate/model"

const model = createModel()
scene.add("root" in model ? model.root : model)`}</CodeBlock>
      <p>Capture and inspect the same camera angle after each material or geometry change. Keep lights, floors, cameras, and other preview furniture outside the installed model root.</p>
    </section>

    <section id="capture" className="reference-section">
      <h2>About the deterministic capture command</h2>
      <p>The Vibe3D monorepo provides <code>bun run vibe:model preview</code> through its internal authoring runner. The <code>vibe-model</code> installer currently copies only the skill, so that command is not automatically available in a new external project. In a plain project, use its Vite preview unless you have separately added a compatible capture runner.</p>
      <CodeBlock>{`# Available in the Vibe3D authoring workspace
bun run vibe:model preview \
  --module assets/prototypes/cargo-crate/model.ts \
  --export createModel \
  --asset cargo-crate \
  --reference references/cargo-crate.png`}</CodeBlock>
    </section>

    <section id="next">
      <h2>Project or global installation</h2>
      <p>Prefer the project-local install so the workflow travels with the code. Use a global install only when you deliberately want one personal copy across projects.</p>
      <CodeBlock>{`bunx vibe-model doctor
bunx vibe-model --global

# replace an existing project-local copy
bunx vibe-model --force`}</CodeBlock>
    </section>
  </article>
}

function ModelIndex() {
  const [params, setParams] = useSearchParams()
  const query = params.get('q') ?? ''
  const filtered = catalog.filter((model) => `${model.name} ${model.category}`.toLowerCase().includes(query.toLowerCase()))
  return <div className="catalog-page"><PageIntro eyebrow="Sci-Fi Kit · MIT licensed" title="Models ready to become yours."><p>Preview every prop in the browser. Install one file tree or bring in the complete kit.</p></PageIntro><label className="catalog-search"><Terminal /><input value={query} onChange={(event) => setParams(event.target.value ? { q: event.target.value } : {})} placeholder="Search models" /></label><div className="catalog-grid">{filtered.map((model) => <Link className="model-card" key={model.id} to={`/models/${model.id}`}><span>{model.category}</span><Box /><h2>{model.name}</h2><p>{model.description}</p><b>Open model <ArrowRight /></b></Link>)}</div></div>
}

function ModelPage() {
  const { modelId } = useParams()
  const model = findModel(modelId)
  if (!model) return <Navigate to="/models" replace />
  return <article className="model-page"><div className="model-breadcrumb"><Link to="/models">Models</Link><span>/</span><span>{model.name}</span></div><header className="model-heading"><p className="eyebrow">{model.category}</p><h1>{model.name}</h1><p className="lead">{model.description}</p></header><section id="preview" className="reference-section preview-section"><h2>Preview</h2><Suspense fallback={<div className="model-preview" aria-hidden="true" />}><ModelPreview model={model} /></Suspense></section><ModelInstallation model={model} /><ModelUsage model={model} /></article>
}

function KitPage() {
  return <div className="kit-page"><PageIntro eyebrow="Reference library · MIT licensed" title="Sci-Fi Kit"><p>{catalog.length} procedural props and modular structures, built for Three.js and shipped as source.</p></PageIntro><CodeBlock>{'bunx vibe3d add @scifi-kit'}</CodeBlock><div className="kit-stats"><div><b>{catalog.length}</b><span>models</span></div><div><b>Three.js</b><span>engine</span></div><div><b>MIT</b><span>license</span></div></div><Link className="primary-button" to="/models">Browse every model <ArrowRight /></Link></div>
}

function DocumentationShell() {
  return <><Header /><DocsLayout><Outlet /></DocsLayout></>
}

export function App() {
  return <Routes><Route path="/" element={<Home />} /><Route element={<DocumentationShell />}><Route path="/docs" element={<DocPage page="docs" />} /><Route path="/docs/installation" element={<DocPage page="installation" />} /><Route path="/docs/configuration" element={<DocPage page="configuration" />} /><Route path="/docs/materials" element={<DocPage page="materials" />} /><Route path="/docs/models" element={<DocPage page="models" />} /><Route path="/docs/registries" element={<DocPage page="registries" />} /><Route path="/docs/model-authoring" element={<ModelAuthoringPage />} /><Route path="/docs/terrain" element={<DocPage page="terrain" />} /><Route path="/docs/terrain-authoring" element={<DocPage page="terrainAuthoring" />} /><Route path="/models" element={<ModelIndex />} /><Route path="/models/:modelId" element={<ModelPage />} /><Route path="/kits/scifi-kit" element={<KitPage />} /></Route><Route path="*" element={<Navigate to="/" replace />} /></Routes>
}
