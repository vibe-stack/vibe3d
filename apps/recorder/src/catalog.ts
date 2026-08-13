export interface ModelPreview {
  scene: import('three/webgpu').Scene
  root: import('three/webgpu').Group
  camera: import('three/webgpu').PerspectiveCamera
  update(deltaSeconds: number): void
  configure?(patch: Record<string, number>): void
  dispose(): void
  [action: string]: unknown
}

export interface ModelModule {
  createPreview(options: { aspect: number; time?: number; [key: string]: unknown }): ModelPreview | Promise<ModelPreview>
}

export interface ModelControl {
  id: string
  label: string
  description: string
  default: number
  min: number
  max: number
  step: number
  format: 'percent' | 'integer'
}

export interface CatalogItem {
  id: string
  name: string
  category: string
  animated: boolean
  controls: ModelControl[]
  load: () => Promise<ModelModule>
}

const glacialGraniteControls: ModelControl[] = [
  {
    id: 'snow',
    label: 'Snow cover',
    description: 'Settles only on upward-facing, broken-up surfaces.',
    default: 0,
    min: 0,
    max: 1,
    step: 0.01,
    format: 'percent',
  },
  {
    id: 'moss',
    label: 'Moss',
    description: 'Follows moisture, shelter, and upward-facing pockets.',
    default: 0.06,
    min: 0,
    max: 1,
    step: 0.01,
    format: 'percent',
  },
  {
    id: 'lichen',
    label: 'Pale lichen',
    description: 'Sparse colonies on exposed granite faces.',
    default: 0.16,
    min: 0,
    max: 1,
    step: 0.01,
    format: 'percent',
  },
  {
    id: 'wetness',
    label: 'Wetness',
    description: 'Darkens low and sheltered stone and tightens roughness.',
    default: 0.12,
    min: 0,
    max: 1,
    step: 0.01,
    format: 'percent',
  },
  {
    id: 'detailStrength',
    label: 'Relief detail',
    description: 'Blends between reduced geometry and the baked scan relief.',
    default: 0.72,
    min: 0,
    max: 1,
    step: 0.01,
    format: 'percent',
  },
  {
    id: 'surfaceSeed',
    label: 'Surface variation',
    description: 'Changes pigment and biome breakup without rebuilding geometry.',
    default: 1,
    min: 1,
    max: 64,
    step: 1,
    format: 'integer',
  },
]

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
      // The compound cliff scene forwards the same patch to every granite
      // instance it holds, so it takes the same panel as the single boulder.
      controls: /^glacial-granite-boulder(-cliff-scene)?$/.test(id) ? glacialGraniteControls : [],
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
