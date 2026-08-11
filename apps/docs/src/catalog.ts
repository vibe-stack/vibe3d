export interface CatalogModel {
  id: string
  name: string
  category: string
  description: string
  load: () => Promise<ModelModule>
  loadSource: () => Promise<string>
}

export interface ModelPreview {
  scene: import('three/webgpu').Scene
  root: import('three/webgpu').Group
  camera: import('three/webgpu').PerspectiveCamera
  update(deltaSeconds: number): void
  dispose(): void
}

export interface ModelModule {
  createPreview(options: { aspect: number; time?: number }): ModelPreview
}

const modules = import.meta.glob<ModelModule>(
  '../../../assets/prototypes/*/model.ts',
)
const sources = import.meta.glob<string>(
  '../../../assets/prototypes/*/model.ts',
  { query: '?raw', import: 'default' },
)

const descriptions: Record<string, string> = {
  'gantry-crane': 'A travelling industrial crane with a working hoist and a weathered structural frame.',
  'pressure-gauge': 'A compact analogue gauge for pipes, service walls, and machinery panels.',
  'industrial-toolbox': 'An armoured field case with a hinged lid and readable surface wear.',
  'modular-catwalk': 'A repeatable elevated walkway for industrial interiors and exterior structures.',
  'door-control-panel': 'A wall-mounted access control with tactile controls and emissive status lights.',
}

const words = (id: string) => id.split('-')
const title = (id: string) => words(id).map((word) => word[0]?.toUpperCase() + word.slice(1)).join(' ')

function categoryFor(id: string): string {
  if (/wall|room|shell|roof|ceiling|floor|facade|column|door|window/.test(id)) return 'Architecture'
  if (/pipe|vent|duct|drain|gauge|generator|tank|pump/.test(id)) return 'Infrastructure'
  if (/crane|cart|forklift|trolley|vehicle/.test(id)) return 'Machinery'
  if (/sign|panel|terminal|console|display|light|lamp/.test(id)) return 'Fixtures'
  return 'Props'
}

export const catalog = Object.entries(modules)
  .map(([path, load]) => {
    const id = path.match(/prototypes\/([^/]+)\/model\.ts$/)?.[1]
    if (!id) throw new Error(`Unable to identify model at ${path}`)
    return {
      id,
      name: title(id),
      category: categoryFor(id),
      description: descriptions[id] ?? `A configurable ${title(id).toLowerCase()} built for real-time Three.js scenes.`,
      load,
      loadSource: sources[path] ?? (() => Promise.reject(new Error(`Missing source for ${id}`))),
    }
  })
  .sort((a, b) => a.name.localeCompare(b.name))

export function findModel(id: string | undefined): CatalogModel | undefined {
  return catalog.find((model) => model.id === id)
}
