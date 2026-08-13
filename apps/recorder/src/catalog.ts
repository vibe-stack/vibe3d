export interface ModelPreview {
  scene: import('three/webgpu').Scene
  root: import('three/webgpu').Group
  camera: import('three/webgpu').PerspectiveCamera
  update(deltaSeconds: number): void
  dispose(): void
  [action: string]: unknown
}

export interface ModelModule {
  createPreview(options: { aspect: number; time?: number }): ModelPreview
}

import timeline from './model-timeline.json'

export interface CatalogItem {
  id: string
  name: string
  category: string
  animated: boolean
  /** ISO date of the commit that introduced this model, or null if unknown. */
  addedAt: string | null
  load: () => Promise<ModelModule>
}

const modules = import.meta.glob<ModelModule>(
  '../../../assets/prototypes/*/model.ts',
)

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
  if (id.startsWith('medical-') || id.includes('microscope')) return 'Medical'
  if (id.startsWith('military-') || id.includes('checkpoint')) return 'Military'
  if (/wall|building|floor|roof|ceiling|room|shell|facade|door|window|foundation|threshold/.test(id)) return 'Architecture'
  if (/street|road|curb|sidewalk|bollard|drain|canal|manhole|railing/.test(id)) return 'Streets'
  return 'Industrial'
}

const introducedAt = timeline as Record<string, string | null>

export const catalog: CatalogItem[] = Object.entries(modules)
  .map(([path, load]) => {
    const id = path.match(/prototypes\/([^/]+)\/model\.ts$/)?.[1]
    if (!id) throw new Error(`Unable to identify model at ${path}`)
    return {
      id,
      name: title(id),
      category: categoryFor(id),
      animated: animatedIds.has(id),
      addedAt: introducedAt[id] ?? null,
      load,
    }
  })
  .sort((a, b) => a.name.localeCompare(b.name))

export const categories = [...new Set(catalog.map((item) => item.category))]

/**
 * Models bucketed by the date they were introduced, newest first.
 *
 * Grouped by *date* rather than listed as a flat sorted run because models
 * arrive in waves — a batch lands in one commit and shares a timestamp — so a
 * flat sort would present fifty siblings in arbitrary name order and hide the
 * only structure that matters. Undated models fall into a final bucket rather
 * than being dropped, so the view can never silently omit part of the library.
 */
export interface ReleaseGroup {
  /** ISO date shared by the group, or null for models git could not date. */
  addedAt: string | null
  label: string
  items: CatalogItem[]
}

const dateLabel = (iso: string): string =>
  new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })

export function releaseGroups(items: readonly CatalogItem[]): ReleaseGroup[] {
  const buckets = new Map<string, CatalogItem[]>()
  for (const item of items) {
    // Bucket on the calendar day, not the exact timestamp: two commits an hour
    // apart are one drop as far as anyone reviewing the library is concerned.
    const key = item.addedAt ? item.addedAt.slice(0, 10) : ''
    const bucket = buckets.get(key)
    if (bucket) bucket.push(item)
    else buckets.set(key, [item])
  }
  return [...buckets.entries()]
    .sort((a, b) => (a[0] && b[0] ? b[0].localeCompare(a[0]) : a[0] ? -1 : 1))
    .map(([key, group]) => ({
      addedAt: key || null,
      label: key ? dateLabel(key) : 'Undated',
      items: [...group].sort((a, b) => a.name.localeCompare(b.name)),
    }))
}

/** The most recent introduction date present in the library. */
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
