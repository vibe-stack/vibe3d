export interface CatalogModel {
  id: string
  name: string
  category: string
  kind: 'prototype' | 'terrain'
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
  createPreview(options: { aspect: number; time?: number }): ModelPreview | Promise<ModelPreview>
}

const modules = {
  ...import.meta.glob<ModelModule>('../../../assets/prototypes/*/model.ts'),
  // Only standalone terrain assets belong in the model catalogue. Compound
  // evaluation scenes use *-scene.ts and are intentionally not matched here.
  ...import.meta.glob<ModelModule>('../../../assets/terrain/*/model.ts'),
}
const sources = {
  ...import.meta.glob<string>(
    '../../../assets/prototypes/*/model.ts',
    { query: '?raw', import: 'default' },
  ),
  ...import.meta.glob<string>(
    '../../../assets/terrain/*/model.ts',
    { query: '?raw', import: 'default' },
  ),
}

const descriptions: Record<string, string> = {
  'gantry-crane': 'A travelling industrial crane with a working hoist and a weathered structural frame.',
  'pressure-gauge': 'A compact analogue gauge for pipes, service walls, and machinery panels.',
  'industrial-toolbox': 'An armoured field case with a hinged lid and readable surface wear.',
  'modular-catwalk': 'A repeatable elevated walkway for industrial interiors and exterior structures.',
  'door-control-panel': 'A wall-mounted access control with tactile controls and emissive status lights.',
  'glacial-granite-boulder': 'A source-first granite outcrop with compiled topology, three LODs, collision data, and biome-aware surface controls.',
  'red-sandstone-canyon': 'A stratified sandstone formation with compiled topology, baked relief, and procedural dust, varnish, and wetness.',
}

const cargoLogisticsIds = new Set([
  'armored-cargo-crate',
  'cargo-bag',
  'cargo-crate-large',
  'cargo-crate-medium',
  'cargo-net',
  'cargo-pallet',
  'cargo-strap',
  'cargo-trailer',
  'cargo-trolley',
  'chemical-drum',
  'commercial-dumpster',
  'container-door',
  'container-small',
  'container-stack',
  'damaged-container',
  'equipment-chest',
  'equipment-shelving',
  'freight-cart',
  'fuel-drum',
  'gas-bottles',
  'hard-equipment-case',
  'industrial-cable-tray',
  'industrial-crane-trolley',
  'industrial-dumpster',
  'industrial-equipment-rack',
  'industrial-forklift-loader',
  'industrial-fuel-tank',
  'industrial-hoist',
  'industrial-horizontal-tank',
  'industrial-pressure-vessel',
  'industrial-silo',
  'industrial-tool-cabinet',
  'industrial-tool-chest',
  'loading-dock-ramp',
  'long-cargo-crate',
  'military-case',
  'open-crate',
  'polymer-case',
  'sacks',
  'sealed-barrel',
  'shipping-container-open',
  'shipping-container-short',
  'shipping-container-standard',
  'square-cargo-crate',
  'stacked-crates',
  'stacked-drums',
  'storage-rack',
  'warehouse-shelf',
  'weapon-crate',
  'wooden-pallet',
])

const words = (id: string) => id.split('-')
const title = (id: string) => words(id).map((word) => word[0]?.toUpperCase() + word.slice(1)).join(' ')

function categoryFor(id: string, kind: CatalogModel['kind']): string {
  if (kind === 'terrain') return 'Terrain'
  if (cargoLogisticsIds.has(id)) return 'Cargo & Logistics'
  if (/wall|room|shell|roof|ceiling|floor|facade|column|door|window/.test(id)) return 'Architecture'
  if (/pipe|vent|duct|drain|gauge|generator|tank|pump/.test(id)) return 'Infrastructure'
  if (/crane|cart|forklift|trolley|vehicle/.test(id)) return 'Machinery'
  if (/sign|panel|terminal|console|display|light|lamp/.test(id)) return 'Fixtures'
  return 'Props'
}

export const catalog = Object.entries(modules)
  .map(([path, load]) => {
    const match = path.match(/assets\/(prototypes|terrain)\/([^/]+)\/model\.ts$/)
    const kind: CatalogModel['kind'] = match?.[1] === 'terrain' ? 'terrain' : 'prototype'
    const id = match?.[2]
    if (!id) throw new Error(`Unable to identify model at ${path}`)
    return {
      id,
      name: title(id),
      category: categoryFor(id, kind),
      kind,
      description: descriptions[id] ?? `A configurable ${title(id).toLowerCase()} built for real-time Three.js scenes.`,
      load,
      loadSource: sources[path] ?? (() => Promise.reject(new Error(`Missing source for ${id}`))),
    }
  })
  .sort((a, b) => a.name.localeCompare(b.name))

export function findModel(id: string | undefined): CatalogModel | undefined {
  return catalog.find((model) => model.id === id)
}
