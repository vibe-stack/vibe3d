export interface ModelPreview {
  scene: import('three/webgpu').Scene
  root: import('three/webgpu').Group
  camera: import('three/webgpu').PerspectiveCamera
  update(deltaSeconds: number): void
  dispose(): void
  [action: string]: unknown
}

export interface ModelModule {
  createPreview(options: { aspect: number; time?: number }): ModelPreview | Promise<ModelPreview>
}

export interface CatalogItem {
  id: string
  name: string
  category: string
  animated: boolean
  load: () => Promise<ModelModule>
}

const modules: Record<string, () => Promise<ModelModule>> = {
  ...import.meta.glob<ModelModule>('../../../assets/prototypes/*/model.ts'),
  ...import.meta.glob<ModelModule>('../../../assets/terrain/*/model.ts'),
  // Compound evaluation scenes live beside their asset and are browsable too.
  ...import.meta.glob<ModelModule>('../../../assets/terrain/*/*-scene.ts'),
}

const animatedIds = new Set([
  'amber-specimen-tank',
  'armored-battery-bank',
  'armored-supply-crate',
  'armored-ventilation-fan',
  'freestanding-service-terminal',
  'gantry-crane',
  'industrial-air-intake',
  'industrial-breaker-box',
  'industrial-cable-spool',
  'industrial-compressor',
  'industrial-control-desk',
  'industrial-crane-hook',
  'industrial-cylinder-rack',
  'industrial-electrical-switchboard',
  'industrial-gas-cylinder',
  'industrial-hopper',
  'industrial-hose-reel',
  'industrial-maintenance-trolley',
  'industrial-pallet-jack',
  'industrial-pipe-valve',
  'industrial-pressure-gauge',
  'industrial-pump',
  'industrial-robot-arm',
  'industrial-toolbox',
  'industrial-transformer',
  'industrial-welding-station',
  'industrial-winch',
  'industrial-workbench',
  'medical-cart',
  'medical-examination-table',
  'medical-hospital-bed',
  'medical-imaging-scanner',
  'medical-operating-light',
  'microscope-science-station',
  'military-checkpoint-booth',
  'military-communications-mast',
  'military-radar-dish',
  'military-sensor-array',
  'military-sentry-emplacement',
  'military-tactical-floodlight',
  'neon-arcade-cabinet',
  'portable-field-generator',
  'pressure-gauge',
  'respawn-beacon',
  'robotic-medical-arm',
  'room-shell',
  'storefront-facade-shell',
  'storm-point-large-gate',
  'utility-enclosure',
])

const title = (id: string): string => id
  .split('-')
  .map((word) => word[0]?.toUpperCase() + word.slice(1))
  .join(' ')

function categoryFor(id: string): string {
  if (/granite|boulder|terrain|sandstone|canyon|cliff/.test(id)) return 'Terrain'
  if (id.startsWith('medical-') || id.includes('microscope')) return 'Medical'
  if (id.startsWith('military-') || id.includes('checkpoint')) return 'Military'
  if (/wall|building|floor|roof|ceiling|room|shell|facade|door|window|foundation|threshold/.test(id)) return 'Architecture'
  if (/street|road|curb|sidewalk|bollard|drain|canal|manhole|railing/.test(id)) return 'Streets'
  return 'Industrial'
}

export const catalog: CatalogItem[] = Object.entries(modules)
  .map(([path, load]) => {
    const scene = path.match(/terrain\/([^/]+)\/([^/]+)-scene\.ts$/)
    const id = scene
      ? `${scene[1]}-${scene[2]}-scene`
      : path.match(/(?:prototypes|terrain)\/([^/]+)\/model\.ts$/)?.[1]
    if (!id) throw new Error(`Unable to identify model at ${path}`)
    return {
      id,
      name: title(id),
      category: categoryFor(id),
      animated: animatedIds.has(id),
      load,
    }
  })
  .sort((a, b) => a.name.localeCompare(b.name))

export const categories = [...new Set(catalog.map((item) => item.category))]

export function initialItem(): CatalogItem {
  const requested = new URLSearchParams(window.location.search).get('model')
  return catalog.find((item) => item.id === requested)
    ?? catalog.find((item) => item.id === 'armored-battery-bank')
    ?? catalog[0]
}
