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

import timeline from './model-timeline.json'

export interface CatalogItem {
  id: string
  name: string
  category: string
  animated: boolean
  /** A lightweight card image when the source library has a matching reference render. */
  preview: string | null
  /** ISO date of the commit that introduced this model, or null if unknown. */
  addedAt: string | null
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
  // Cargo, storage, and logistics wave. Every prop here drives something over
  // time - a lamp cycle at minimum, and usually a door, lid, lift, or gate - so
  // the recorder should give them all a moving capture rather than a still.
  'armored-cargo-crate',
  'cargo-bag',
  'cargo-crate-large',
  'cargo-crate-medium',
  'cargo-net',
  'cargo-pallet',
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

const introducedAt = timeline as Record<string, string | null>

// These are intentionally a curated subset of the much larger reference-image
// library. Keeping a small set of webp thumbnails in the recorder makes the browser
// scannable without making first load compete with the active WebGPU preview.
const previewIds = new Set([
  'armored-cargo-crate',
  'building-threshold',
  'canal-ladder',
  'cargo-crate-large',
  'cargo-pallet',
  'checkpoint-gate-assembly',
  'commercial-dumpster',
  'container-stack',
  'directional-sign',
  'door-control-panel',
  'equipment-chest',
  'equipment-shelving',
  'fuel-drum',
  'gantry-crane',
  'gas-bottles',
  'hard-equipment-case',
  'industrial-robot-arm',
  'loading-dock-ramp',
  'medical-cart',
  'microscope-science-station',
  'pressure-gauge',
  'respawn-beacon',
  'robotic-medical-arm',
  'room-shell',
  'shipping-container-standard',
  'stacked-crates',
  'storage-rack',
  'street-sign-pole',
  'traffic-cone',
  'warehouse-shelf',
])

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
      preview: previewIds.has(id)
        ? `${import.meta.env.BASE_URL}model-previews/${id}.webp`
        : null,
      addedAt: introducedAt[id] ?? null,
      // The compound cliff scene forwards the same patch to every granite
      // instance it holds, so it takes the same panel as the single boulder.
      controls: /^glacial-granite-boulder(-cliff-scene)?$/.test(id) ? glacialGraniteControls : [],
      load,
    }
  })
  .sort((a, b) => a.name.localeCompare(b.name))

export const categories = [...new Set(catalog.map((item) => item.category))]

/**
 * Models bucketed by the commit that introduced them, newest first.
 *
 * Grouped rather than listed as a flat sorted run because models arrive in
 * waves — a batch lands in one commit and shares a timestamp — so a flat sort
 * would present fifty siblings in arbitrary name order and hide the only
 * structure the view exists to show. Undated models fall into a final bucket
 * rather than being dropped, so the list can never silently omit part of the
 * library.
 *
 * The key is the full timestamp, deliberately. Bucketing by calendar day looks
 * tidier and is wrong: this library's first 110 models and the next 50 landed
 * twenty-one hours apart on the same date, so a day key merged them into one
 * group and marked the entire catalogue as new. Two commits are two drops even
 * when the clock agrees about the date.
 */
export interface ReleaseGroup {
  /** ISO timestamp shared by the group, or null for models git could not date. */
  addedAt: string | null
  label: string
  items: CatalogItem[]
}

const dayOf = (iso: string): string =>
  new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })

const timeOf = (iso: string): string =>
  new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })

export function releaseGroups(items: readonly CatalogItem[]): ReleaseGroup[] {
  const buckets = new Map<string, CatalogItem[]>()
  for (const item of items) {
    const key = item.addedAt ?? ''
    const bucket = buckets.get(key)
    if (bucket) bucket.push(item)
    else buckets.set(key, [item])
  }
  const keys = [...buckets.keys()]
  // Only spell out the time when a date carries more than one drop; otherwise
  // the label is noise on a list where most days have a single release.
  const crowdedDays = new Set(
    keys.filter((key) => key)
      .map((key) => key.slice(0, 10))
      .filter((day, index, all) => all.indexOf(day) !== index),
  )
  return [...buckets.entries()]
    .sort((a, b) => (a[0] && b[0] ? b[0].localeCompare(a[0]) : a[0] ? -1 : 1))
    .map(([key, group]) => ({
      addedAt: key || null,
      label: key
        ? crowdedDays.has(key.slice(0, 10)) ? `${dayOf(key)} · ${timeOf(key)}` : dayOf(key)
        : 'Undated',
      items: [...group].sort((a, b) => a.name.localeCompare(b.name)),
    }))
}

/** The most recent introduction timestamp present in the library. */
export const latestRelease: string | null = catalog
  .map((item) => item.addedAt)
  .filter((value): value is string => Boolean(value))
  .sort()
  .at(-1) ?? null

export function initialItem(): CatalogItem {
  const requested = new URLSearchParams(window.location.search).get('model')
  return catalog.find((item) => item.id === requested)
    ?? catalog.find((item) => item.id === 'armored-battery-bank')
    ?? catalog[0]
}
