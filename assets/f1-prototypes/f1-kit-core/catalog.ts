/**
 * Canonical compile catalog for every F1-kit model.ts.
 * Hull names are applied at compile time; visual recipes stay unchanged.
 */
import type { PropCompileStrategy } from './topology.ts'

export type CatalogEntry = {
  id: string
  strategy: PropCompileStrategy
  topologyKey: string
  config: Record<string, unknown>
  hull: readonly string[]
  detail: readonly string[]
  scatter: readonly string[]
  keepOpenings?: boolean
  pruneToLargest?: boolean
  allowAabbHull?: boolean
  forceAabbHull?: boolean
}

const swept = (
  id: string,
  key: string,
  config: Record<string, unknown>,
  hull: readonly string[],
  detail: readonly string[] = [],
  extra: Partial<CatalogEntry> = {},
): CatalogEntry => ({
  id,
  strategy: 'swept-volume',
  topologyKey: key,
  config,
  hull,
  detail,
  scatter: [],
  pruneToLargest: false,
  forceAabbHull: extra.forceAabbHull,
  ...extra,
})

const shell = (
  id: string,
  hull: readonly string[] = [],
  detail: readonly string[] = [],
  extra: Partial<CatalogEntry> = {},
): CatalogEntry => ({
  id,
  strategy: 'deformable-shell',
  topologyKey: `${id}-canonical`,
  config: extra.config ?? {},
  hull,
  detail,
  scatter: extra.scatter ?? [],
  pruneToLargest: extra.pruneToLargest ?? true,
  allowAabbHull: extra.allowAabbHull,
  keepOpenings: extra.keepOpenings,
  forceAabbHull: extra.forceAabbHull,
})

const scatter = (
  id: string,
  config: Record<string, unknown>,
  hull: readonly string[],
  scatterNames: readonly string[],
  extra: Partial<CatalogEntry> = {},
): CatalogEntry => ({
  id,
  strategy: 'instanced-scatter',
  topologyKey: `${id}-canonical`,
  config,
  hull,
  detail: extra.detail ?? [],
  scatter: scatterNames,
  keepOpenings: true,
  pruneToLargest: false,
  allowAabbHull: extra.allowAabbHull,
  forceAabbHull: extra.forceAabbHull,
})

const openAssembly = (
  id: string,
  config: Record<string, unknown>,
  hull: readonly string[],
  detail: readonly string[] = [],
  extra: Partial<CatalogEntry> = {},
): CatalogEntry => ({
  id,
  strategy: 'swept-volume',
  topologyKey: extra.topologyKey ?? `${id}-canonical`,
  config,
  hull,
  detail,
  scatter: extra.scatter ?? [],
  keepOpenings: true,
  pruneToLargest: false,
  allowAabbHull: extra.allowAabbHull,
  forceAabbHull: extra.forceAabbHull,
})

const dressing = (id: string, config: Record<string, unknown> = {}): CatalogEntry =>
  shell(id, [], [], { config, allowAabbHull: true, pruneToLargest: true, keepOpenings: true })

export const CATALOG: CatalogEntry[] = [
  // Wave 1 — swept trackside
  swept('f1-sausage-kerb', 'f1-sausage-kerb-modules-1', { modules: 1 }, ['sausage'], ['pads', 'grooves']),
  swept('f1-kerb', 'f1-kerb-modules-1', { modules: 1 }, ['kerb-red', 'kerb-white']),
  swept('f1-armco', 'f1-armco-bay-1', { bays: 1 }, ['posts', 'rails'], ['reflectors-red', 'reflectors-white'], {
    keepOpenings: true,
  }),
  swept('f1-jersey-barrier', 'f1-jersey-barrier-modules-1', { modules: 1 }, ['jersey'], ['drains']),
  swept('f1-concrete-wall', 'f1-concrete-wall-bay-1', { bays: 1 }, ['body'], ['cap', 'sockets']),
  swept('f1-slot-drain', 'f1-slot-drain-modules-1', { modules: 1 }, ['trough'], ['grate'], { keepOpenings: true }),

  // Wave 2 — closed solids
  shell('f1-cone'),
  shell('f1-bollard'),
  shell('f1-tyre'),
  shell('f1-fire-extinguisher'),
  shell('f1-trophy-cup'),
  shell('f1-ice-bucket', ['shell', 'liner'], ['rim-bead', 'base-bead']),
  shell('f1-champagne'),

  // Wave 3 — assemblies (openings matter)
  openAssembly(
    'f1-garage-box',
    { count: 1 },
    ['plinth-0', 'apron-0', 'kerb-0', 'floor-0', 'piers-0', 'flanks-0', 'fascia-beam-0', 'deck-0'],
    [
      'reliefs-0', 'coping-0', 'soffit-lining-0', 'threshold-0', 'trim-0',
      'head-box-0', 'shutter-gear-0', 'shutter-0', 'fascia-0',
    ],
    { topologyKey: 'f1-garage-box-count-1' },
  ),
  openAssembly('f1-pit-wall', { benches: false, bays: 1 }, [], [], { topologyKey: 'f1-pit-wall-bay-1' }),
  openAssembly('f1-stairs', { kind: 'flight', steps: 4, landing: false }, [], [], { topologyKey: 'f1-stairs-flight-4' }),
  openAssembly('f1-start-gantry', { span: 8, height: 6 }, [], [], { topologyKey: 'f1-start-gantry-span-8' }),
  openAssembly('f1-marshal-post', {}, [], []),
  openAssembly('f1-race-control', {}, [], []),

  // Wave 4 — open / scatter
  openAssembly('f1-catch-fence', { length: 3, height: 3 }, [], ['chain-link'], { topologyKey: 'f1-catch-fence-3' }),
  openAssembly('f1-crowd-fence', { length: 3 }, [], ['infill'], { topologyKey: 'f1-crowd-fence-3' }),
  scatter('f1-gravel-trap', { modules: 1 }, ['bed'], ['stones', 'stones-dark'], { detail: ['rake'] }),
  scatter('f1-grandstand-bay', { rows: 2, width: 3 }, [], ['seats']),
  scatter('f1-tyre-stack', {}, [], [], { allowAabbHull: true }),
  scatter('f1-tyre-barrier', {}, ['straps'], ['carcass'], { allowAabbHull: true }),

  // Wave 5 — remaining catalog
  swept('f1-astroturf-strip', 'f1-astroturf-strip-modules-1', { modules: 1 }, ['bed'], ['pile', 'pile-dark']),
  swept('f1-tecpro', 'f1-tecpro-canonical', { columns: 1, rows: 1 }, ['wrap'], ['straps', 'handles']),
  swept('f1-crash-cushion', 'f1-crash-cushion-canonical', { fits: 'armco' }, ['cushion', 'frame'], ['bands']),
  openAssembly('f1-access-gate', { fits: 'armco', width: 1.8 }, ['frame'], ['infill']),
  shell('f1-oranje-can'),
  dressing('f1-brake-marker', { distance: 100 }),
  shell('f1-camera-platform', [], [], { keepOpenings: true, pruneToLargest: false }),
  shell('f1-camera-tower', [], [], { keepOpenings: true, pruneToLargest: false }),
  shell('f1-cctv-mast', [], [], { keepOpenings: true, pruneToLargest: false }),
  dressing('f1-chequered-flag', { waving: false }),
  dressing('f1-chevron-board', { count: 2 }),
  dressing('f1-circuit-sign', { kind: 'DRS', turn: 1 }),
  dressing('f1-cooldown-board'),
  dressing('f1-fia-light-panel', { mode: 'yellow' }),
  dressing('f1-flag-pole'),
  shell('f1-floodlight', [], [], { keepOpenings: true, pruneToLargest: false }),
  shell('f1-foam-monitor', [], [], { pruneToLargest: false }),
  shell('f1-generator-cabin', [], [], { keepOpenings: true, pruneToLargest: false }),
  dressing('f1-grid-box'),
  shell('f1-gun-rack', [], [], { pruneToLargest: false, keepOpenings: true }),
  shell('f1-hose-reel'),
  dressing('f1-interview-backdrop'),
  dressing('f1-jumbotron'),
  dressing('f1-led-ribbon'),
  dressing('f1-lollipop-board'),
  shell('f1-marker-post'),
  shell('f1-medical-post', [], [], { keepOpenings: true, pruneToLargest: false }),
  dressing('f1-nameboard'),
  shell('f1-pa-horn'),
  openAssembly('f1-parc-ferme', {}, [], []),
  dressing('f1-pit-board'),
  openAssembly('f1-pit-gantry', {}, [], []),
  shell('f1-pit-jack'),
  openAssembly('f1-podium', {}, [], []),
  dressing('f1-sector-board'),
  openAssembly('f1-sector-gantry', {}, [], []),
  shell('f1-service-truck', [], [], { pruneToLargest: false, allowAabbHull: true, forceAabbHull: true }),
  openAssembly('f1-spectator-bridge', { span: 8 }, [], []),
  dressing('f1-start-finish-line'),
  dressing('f1-start-lights', { lit: 0 }),
  shell('f1-team-motorhome', [], [], { keepOpenings: true, pruneToLargest: false, allowAabbHull: true, forceAabbHull: true }),
  shell('f1-timing-pylon', [], [], { keepOpenings: true, pruneToLargest: false }),
  shell('f1-tool-cabinet', [], [], { keepOpenings: true, pruneToLargest: false }),
  shell('f1-trophy-table', [], [], { pruneToLargest: false }),
  openAssembly('f1-tunnel-portal', {}, [], []),
  shell('f1-tyre-gun'),
  shell('f1-weighbridge', [], [], { keepOpenings: true, pruneToLargest: false }),
  swept('hot-wheels-loop', 'hot-wheels-loop-canonical', {}, [], [], { allowAabbHull: true, keepOpenings: true, forceAabbHull: true }),
  swept('hot-wheels-banked-turned', 'hot-wheels-banked-turned-canonical', {}, [], [], {
    allowAabbHull: true,
    keepOpenings: true,
    forceAabbHull: true,
  }),
]

export const CATALOG_BY_ID = new Map(CATALOG.map((entry) => [entry.id, entry]))

if (new Set(CATALOG.map((entry) => entry.id)).size !== CATALOG.length) {
  throw new Error('f1-kit topology catalog has duplicate ids')
}
