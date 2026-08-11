import { Color, DirectionalLight, Group, HemisphereLight, PerspectiveCamera, Scene } from 'three/webgpu'
import { extrudeProfile, groove, prism, type Vec2, type Vec3 } from '../../../src/asset-forge/generator/index.ts'
import type { KitSocket } from '../axiom-modular-kit/contract.ts'
import {
  bolt, createKitMaterials, facePrism, panelLine, slab, wallFace, type KitMaterials,
} from '../axiom-modular-kit/parts.ts'
import { finishPrefab, type PrefabController, type PrefabPreview, type PrefabView } from '../axiom-modular-kit/prefab.ts'

/**
 * A vehicle checkpoint built from the building kit's vocabulary rather than its
 * layout grid: this is not a room plan, but every surface on it is the same
 * dark gunmetal frame, pale composite cassette and blue livery panel used by
 * the prefab shells, at the same depths, bevels and seam rhythm.
 *
 * Plan, on the 12 x 6 m contract footprint: a central 4 m carriageway between
 * two full-height gate towers carrying a deep lintel; armoured wing returns
 * ramping down from each tower to a lamp-capped end pier; a guard booth set
 * back on the right-hand apron; and a boom barrier across the road.
 */

const WIDTH = 12
const DEPTH = 6
const TOP = 4
/** Carriageway centreline and clear span. */
const ROAD_X = 6
const SPAN = 4
const TOWER_X: readonly [number, number] = [ROAD_X - SPAN / 2, ROAD_X + SPAN / 2]
const GATE_Z = -1.9
const DECK = 0.22
const APRON = 0.46
const TOWER_W = 1.05
const TOWER_D = 1.25

const SOCKETS: readonly KitSocket[] = [
  { name: 'foundation_center', kind: 'foundation', position: [ROAD_X, 0, -DEPTH / 2], normal: [0, -1, 0] },
  { name: 'road_front', kind: 'floor', position: [ROAD_X, DECK, -0.1], normal: [0, 0, 1] },
  { name: 'road_rear', kind: 'floor', position: [ROAD_X, DECK, -DEPTH + 0.1], normal: [0, 0, -1] },
  { name: 'gate_post_left', kind: 'gate-post', position: [TOWER_X[0], 2, GATE_Z], normal: [1, 0, 0] },
  { name: 'gate_post_right', kind: 'gate-post', position: [TOWER_X[1], 2, GATE_Z], normal: [-1, 0, 0] },
  { name: 'gate_lintel_center', kind: 'gate-lintel', position: [ROAD_X, TOP, GATE_Z], normal: [0, 1, 0] },
  { name: 'return_left', kind: 'gate-return', position: [0.35, 1.2, GATE_Z], normal: [-1, 0, 0] },
  { name: 'return_right', kind: 'gate-return', position: [WIDTH - 0.35, 1.2, GATE_Z], normal: [1, 0, 0] },
  { name: 'booth_service', kind: 'service', position: [7.9, 1.2, -5.2], normal: [0, 0, -1] },
  { name: 'barrier_pivot', kind: 'dressing', position: [4.35, 1.15, -3.5], normal: [1, 0, 0] },
  { name: 'sign_center', kind: 'dressing', position: [ROAD_X, 3.5, GATE_Z + 0.55], normal: [0, 0, 1] },
]

/* ------------------------------------------------------------------ deck -- */

function addDeck(root: Group, m: KitMaterials): void {
  // One stepped ground slab, exactly on the contract footprint.
  slab(root, m.graphite, WIDTH, DEPTH, DECK, [ROAD_X, DECK / 2, -DEPTH / 2], 0.55, { fillet: 0.024, bevel: 0.03 })

  // Raised aprons either side of the carriageway, kerbed in amber.
  for (const [x0, x1] of [[0.18, TOWER_X[0] + 0.62], [TOWER_X[1] - 0.62, WIDTH - 0.18]] as const) {
    const width = x1 - x0
    slab(root, m.graphite, width, DEPTH - 0.5, APRON - DECK, [(x0 + x1) / 2, (DECK + APRON) / 2, -DEPTH / 2], 0.4,
      { fillet: 0.022, bevel: 0.026 })
    const kerb = x0 < ROAD_X ? x1 - 0.09 : x0 + 0.09
    root.add(prism(m.amber, [0.11, DEPTH - 1.4, 0.012], [kerb, APRON + 0.004, -DEPTH / 2],
      { chamfer: 0.02, fillet: 0.006, bevel: 0.005, rotation: [Math.PI / 2, 0, Math.PI / 2] }))
    for (const z of [-1.1, -DEPTH + 1.1]) {
      root.add(groove(m.ink, width - 0.5, 0.05, 0.024, [(x0 + x1) / 2, APRON + 0.004, z], [-Math.PI / 2, 0, Math.PI / 2]))
    }
  }

  // Carriageway: a darker running surface with a dashed centreline and the
  // transverse grating strip the reference lays across the approach.
  slab(root, m.deck, SPAN + 1.0, DEPTH - 0.36, 0.05, [ROAD_X, DECK + 0.02, -DEPTH / 2], 0.16, { fillet: 0.02, bevel: 0.016 })
  for (let i = 0; i < 6; i += 1) {
    root.add(prism(m.steel, [0.09, 0.5, 0.01], [ROAD_X, DECK + 0.05, -0.6 - i * 0.95],
      { chamfer: 0.02, fillet: 0.006, bevel: 0.005, rotation: [Math.PI / 2, 0, 0] }))
  }
  for (let i = 0; i < 13; i += 1) {
    root.add(groove(m.ink, SPAN + 0.7, 0.05, 0.022, [ROAD_X, DECK + 0.058, -0.5 - i * 0.4], [-Math.PI / 2, 0, Math.PI / 2]))
  }
}

/* ----------------------------------------------------------------- towers -- */

/** One gate tower: dark trunk, pale service cassette, blue livery flank, lamp. */
function addTower(root: Group, m: KitMaterials, x: number): void {
  const base = APRON
  const head = 3.42
  root.add(prism(m.graphite, [TOWER_W, head - base, TOWER_D], [x, (base + head) / 2, GATE_Z],
    { chamfer: 0.17, fillet: 0.032, bevel: 0.028 }))
  root.add(prism(m.graphite, [TOWER_W + 0.26, 0.5, TOWER_D + 0.26], [x, base + 0.25, GATE_Z],
    { chamfer: 0.22, fillet: 0.036, bevel: 0.03 }))
  root.add(prism(m.graphite, [TOWER_W + 0.16, 0.34, TOWER_D + 0.16], [x, head + 0.17, GATE_Z],
    { chamfer: 0.2, fillet: 0.034, bevel: 0.028 }))
  // Lamp housing and its amber lens cap the tower.
  root.add(prism(m.graphite, [0.42, 0.16, 0.42], [x, TOP - 0.21, GATE_Z], { chamfer: 0.11, fillet: 0.024, bevel: 0.02 }))
  root.add(prism(m.amber, [0.3, 0.13, 0.3], [x, TOP - 0.065, GATE_Z], { chamfer: 0.09, fillet: 0.02, bevel: 0.017 }))

  // The flanks - the faces looking up and down the carriageway - carry the blue
  // livery band. A face's stand-off is half the extent along its own normal:
  // the x-facing flanks measure half the tower's width, the z-facing fronts
  // half its depth. Swapping the two buries the cassettes inside the trunk.
  for (const yaw of [Math.PI / 2, -Math.PI / 2] as const) {
    const face = wallFace([x, 0, GATE_Z], yaw)
    const half = TOWER_W / 2
    facePrism(root, face, m.accent, [TOWER_D - 0.2, head - base - 0.6, 0.06], 0, (base + head) / 2, half + 0.02,
      { fillet: 0.024, bevel: 0.02 })
    panelLine(root, face, m, TOWER_D - 0.34, 0, base + 1.5, half + 0.06)
  }
  for (const yaw of [0, Math.PI] as const) {
    const face = wallFace([x, 0, GATE_Z], yaw)
    const half = TOWER_D / 2
    facePrism(root, face, m.graphite, [TOWER_W - 0.08, head - base - 0.5, 0.055], 0, (base + head) / 2 + 0.05, half + 0.015,
      { fillet: 0.022, bevel: 0.018 })
    facePrism(root, face, m.shell, [TOWER_W - 0.26, head - base - 0.72, 0.06], 0, (base + head) / 2 + 0.05, half + 0.05,
      { fillet: 0.024, bevel: 0.02 })
    // The vertical amber service strip that identifies a gate jamb.
    facePrism(root, face, m.ink, [0.17, 1.5, 0.045], 0, 1.95, half + 0.075, { fillet: 0.018, bevel: 0.014 })
    facePrism(root, face, m.amber, [0.085, 1.3, 0.03], 0, 1.95, half + 0.095, { fillet: 0.014, bevel: 0.011 })
    for (const y of [1.02, 2.86]) panelLine(root, face, m, TOWER_W - 0.42, 0, y, half + 0.08)
    for (const u of [-0.3, 0.3]) bolt(root, m, face, u, 0.86, half + 0.07)
  }
}

/* ----------------------------------------------------------------- lintel -- */

function addLintel(root: Group, m: KitMaterials): void {
  const x0 = TOWER_X[0] - 0.1
  const x1 = TOWER_X[1] + 0.1
  const length = x1 - x0
  const bottom = 3.02
  // Deep beam with a stepped soffit, swept as one convex section so the fascia,
  // top face and both chamfers share a continuous edge.
  const section: Vec2[] = [
    [-0.62, bottom + 0.34], [-0.5, bottom], [0.5, bottom], [0.62, bottom + 0.34],
    [0.62, TOP - 0.16], [0.46, TOP], [-0.46, TOP], [-0.62, TOP - 0.16],
  ]
  const mid = (bottom + TOP) / 2
  root.add(extrudeProfile(m.graphite, section.map(([a, b]): Vec2 => [a, b - mid]), length,
    [ROAD_X, mid, GATE_Z], { fillet: 0.05, bevel: 0.04, rotation: [0, Math.PI / 2, 0] }))

  for (const yaw of [0, Math.PI] as const) {
    const face = wallFace([0, 0, GATE_Z], yaw)
    const half = 0.62
    const u = yaw === 0 ? ROAD_X : -ROAD_X
    // Pale sign cassette on a dark backing, with amber marker lamps.
    facePrism(root, face, m.graphite, [length - 0.5, 0.74, 0.05], u, 3.53, half + 0.015, { fillet: 0.026, bevel: 0.022 })
    facePrism(root, face, m.shell, [length - 0.72, 0.56, 0.06], u, 3.53, half + 0.05, { fillet: 0.028, bevel: 0.024 })
    panelLine(root, face, m, length - 0.9, u, 3.28, half + 0.08)
    for (const offset of [-1.15, 1.15]) {
      facePrism(root, face, m.amber, [0.36, 0.075, 0.025], u + offset, 3.62, half + 0.085, { fillet: 0.014, bevel: 0.011 })
    }
    // Soffit shoulder returning into each tower.
    for (const side of [-1, 1] as const) {
      facePrism(root, face, m.graphite, [0.5, 0.24, 0.5], u + side * (length / 2 - 0.34), bottom + 0.14, 0,
        { chamfer: 0.1, fillet: 0.026, bevel: 0.022 })
    }
  }
}

/* ---------------------------------------------------------------- returns -- */

/** Armoured wing ramping from a tower down to a lamp-capped end pier. */
function addReturn(root: Group, m: KitMaterials, side: -1 | 1): void {
  const inner = side < 0 ? TOWER_X[0] - TOWER_W / 2 : TOWER_X[1] + TOWER_W / 2
  const outer = side < 0 ? 0.34 : WIDTH - 0.34
  const tall = 2.5
  const low = 1.32
  const base = APRON - 0.04
  // A true sloped top: one convex profile in the (x, y) plane, extruded through
  // the wall's thickness, rather than a staircase of boxes.
  const profile: Vec2[] = side < 0
    ? [[outer, base], [inner, base], [inner, tall], [inner - 1.5, low + 0.36], [outer, low]]
    : [[inner, base], [outer, base], [outer, low], [inner + 1.5, low + 0.36], [inner, tall]]
  root.add(extrudeProfile(m.graphite, profile, 0.62, [0, 0, GATE_Z],
    { fillet: 0.05, bevel: 0.04 }))

  // Pale cassette and blue livery band captured on both faces of the wing.
  const span = Math.abs(inner - outer)
  const centre = (inner + outer) / 2
  for (const yaw of [0, Math.PI] as const) {
    const face = wallFace([0, 0, GATE_Z], yaw)
    const u = yaw === 0 ? centre : -centre
    facePrism(root, face, m.shell, [span - 0.5, low - base - 0.24, 0.07], u, (base + low) / 2 + 0.04, 0.34,
      { fillet: 0.026, bevel: 0.022 })
    // A second, taller cassette fills the wing where it rises into the tower,
    // so the sloped head reads as a capped wall rather than a dark wedge.
    // Sized to stay under the sloping head at its lowest point across the
    // panel, so the cassette never breaks the wing's silhouette.
    const rise = side < 0 ? inner - 0.7 : inner + 0.7
    facePrism(root, face, m.shell, [1.0, 1.15, 0.07], yaw === 0 ? rise : -rise, 1.14, 0.34,
      { fillet: 0.026, bevel: 0.022 })
    facePrism(root, face, m.accent, [span - 0.5, 0.14, 0.05], u, base + 0.16, 0.33, { fillet: 0.016, bevel: 0.013 })
    panelLine(root, face, m, span - 0.8, u, (base + low) / 2 + 0.04, 0.38)
  }

  // End pier with its own lamp, closing the wing.
  const pier = side < 0 ? 0.46 : WIDTH - 0.46
  root.add(prism(m.graphite, [0.72, low + 0.28 - base, 0.86], [pier, (base + low + 0.28) / 2, GATE_Z],
    { chamfer: 0.15, fillet: 0.03, bevel: 0.026 }))
  root.add(prism(m.accent, [0.5, low - base - 0.2, 0.05], [pier, (base + low) / 2, GATE_Z + 0.44],
    { chamfer: 0.08, fillet: 0.02, bevel: 0.017 }))
  root.add(prism(m.graphite, [0.36, 0.14, 0.36], [pier, low + 0.35, GATE_Z], { chamfer: 0.1, fillet: 0.022, bevel: 0.018 }))
  root.add(prism(m.amber, [0.26, 0.12, 0.26], [pier, low + 0.48, GATE_Z], { chamfer: 0.08, fillet: 0.018, bevel: 0.015 }))

  // Buttress shoe where the wing meets the tower.
  root.add(prism(m.graphite, [0.62, 0.78, 0.94], [inner - side * 0.42, base + 0.39, GATE_Z],
    { chamfer: 0.15, fillet: 0.028, bevel: 0.024 }))
}

/* ------------------------------------------------------ booth and barrier -- */

function addBooth(root: Group, m: KitMaterials): void {
  const x = 7.9
  const z = -4.3
  const base = APRON
  const top = 2.32
  root.add(prism(m.graphite, [2.0, 0.16, 1.75], [x, base + 0.08, z], { chamfer: 0.3, fillet: 0.026, bevel: 0.024 }))
  root.add(prism(m.graphite, [1.84, top - base - 0.16, 1.6], [x, (base + 0.16 + top) / 2, z],
    { chamfer: 0.34, fillet: 0.03, bevel: 0.026 }))
  // Glazing band: a dark recess wrapping the upper half.
  root.add(prism(m.ink, [1.9, 0.74, 1.66], [x, top - 0.52, z], { chamfer: 0.36, fillet: 0.028, bevel: 0.024 }))
  // Pale lower panels and the blue roof cap.
  for (const yaw of [0, Math.PI, Math.PI / 2, -Math.PI / 2] as const) {
    const face = wallFace([x, 0, z], yaw)
    const half = (Math.abs(Math.cos(yaw)) > 0.5 ? 1.6 : 1.84) / 2
    facePrism(root, face, m.shell, [half * 1.1, 0.62, 0.06], 0, base + 0.52, half + 0.02, { fillet: 0.022, bevel: 0.018 })
    panelLine(root, face, m, half * 0.9, 0, base + 0.24, half + 0.05)
  }
  root.add(prism(m.accent, [2.1, 0.3, 1.86], [x, top + 0.15, z], { chamfer: 0.38, fillet: 0.03, bevel: 0.026 }))
  root.add(prism(m.graphite, [1.86, 0.09, 1.62], [x, top + 0.34, z], { chamfer: 0.34, fillet: 0.022, bevel: 0.018 }))
  root.add(prism(m.amber, [0.24, 0.07, 0.05], [x - 0.5, top + 0.04, z + 0.86], { chamfer: 0.02, fillet: 0.008, bevel: 0.006 }))
}

function addBarrier(root: Group, m: KitMaterials): void {
  const pivot = TOWER_X[0] + 0.35
  const z = -3.5
  const y = 1.16
  root.add(prism(m.graphite, [0.42, 1.1, 0.42], [pivot, APRON + 0.55, z], { chamfer: 0.1, fillet: 0.026, bevel: 0.022 }))
  root.add(prism(m.graphite, [0.54, 0.18, 0.54], [pivot, APRON + 0.09, z], { chamfer: 0.13, fillet: 0.026, bevel: 0.022 }))
  root.add(prism(m.ink, [0.16, 0.5, 0.05], [pivot, APRON + 0.72, z + 0.22], { chamfer: 0.03, fillet: 0.012, bevel: 0.01 }))
  root.add(prism(m.cyan, [0.07, 0.34, 0.03], [pivot, APRON + 0.72, z + 0.26], { chamfer: 0.014, fillet: 0.008, bevel: 0.006 }))
  // Striped boom: alternating amber and ink segments on one continuous rail.
  const reach = ROAD_X + SPAN / 2 - 0.5 - pivot
  root.add(prism(m.steel, [reach, 0.055, 0.12], [pivot + reach / 2, y, z], { chamfer: 0.02, fillet: 0.008, bevel: 0.007 }))
  const stripes = 9
  for (let i = 0; i < stripes; i += 1) {
    const width = reach / stripes
    root.add(prism(i % 2 === 0 ? m.amber : m.ink, [width - 0.01, 0.15, 0.055],
      [pivot + width * (i + 0.5), y, z + 0.05], { chamfer: 0.012, fillet: 0.006, bevel: 0.005 }))
  }
  // Kerbside bollards along the carriageway edge.
  for (const [bx, bz] of [[TOWER_X[0] + 0.35, -1.0], [TOWER_X[1] - 0.35, -3.5], [TOWER_X[1] - 0.35, -1.0]] as const) {
    root.add(prism(m.graphite, [0.3, 0.86, 0.3], [bx, APRON + 0.43, bz], { chamfer: 0.075, fillet: 0.022, bevel: 0.018 }))
    root.add(prism(m.graphite, [0.4, 0.12, 0.4], [bx, APRON + 0.06, bz], { chamfer: 0.1, fillet: 0.022, bevel: 0.018 }))
    root.add(prism(m.amber, [0.13, 0.06, 0.02], [bx, APRON + 0.74, bz + 0.16], { chamfer: 0.015, fillet: 0.006, bevel: 0.005 }))
  }
}

/* ------------------------------------------------------------------ build -- */

function build(): PrefabController {
  const acquired = createKitMaterials(5200)
  const m = acquired.materials
  const root = new Group()
  addDeck(root, m)
  addTower(root, m, TOWER_X[0])
  addTower(root, m, TOWER_X[1])
  addLintel(root, m)
  addReturn(root, m, -1)
  addReturn(root, m, 1)
  addBooth(root, m)
  addBarrier(root, m)
  return finishPrefab('checkpoint-gate-assembly', root, SOCKETS, acquired)
}

export function createModel(): PrefabController { return build() }

function makePreview(options: { aspect: number }, view: PrefabView): PrefabPreview {
  const controller = build()
  const scene = new Scene()
  scene.background = new Color(0x000000)
  scene.add(controller.root, new HemisphereLight(0x8ea3b2, 0x0a0c10, 0.3))
  const key = new DirectionalLight(0xfff2e2, 1.35)
  key.position.set(-8, 11, 12)
  const fill = new DirectionalLight(0x87a6c4, 0.36)
  fill.position.set(12, 5, 8)
  const rim = new DirectionalLight(0x9fb8cc, 0.42)
  rim.position.set(7, 8, -12)
  scene.add(key, fill, rim)

  const aspect = Number.isFinite(options.aspect) && options.aspect > 0 ? options.aspect : 1
  const target: Vec3 = [ROAD_X, 1.75, -DEPTH / 2]
  // A gate is read head-on from the approach, not from above like a room plan.
  const position: Vec3 = view === 'side'
    ? [WIDTH + 13, 4.5, -DEPTH / 2]
    : view === 'rear'
      ? [ROAD_X + 5, 6, -DEPTH - 16]
      : view === 'low'
        ? [ROAD_X - 2.5, 1.1, 11]
        : [ROAD_X - 4.6, 5.4, 20]
  const camera = new PerspectiveCamera(view === 'low' ? 34 : 26, aspect, 0.4, 140)
  camera.position.set(...position)
  camera.lookAt(...target)
  scene.add(camera)
  return {
    scene,
    root: controller.root,
    camera,
    update: controller.update,
    dispose: () => { scene.remove(controller.root); controller.dispose() },
  }
}

export function createPreview(options: { aspect: number }): PrefabPreview { return makePreview(options, 'beauty') }
export function createSidePreview(options: { aspect: number }): PrefabPreview { return makePreview(options, 'side') }
export function createRearPreview(options: { aspect: number }): PrefabPreview { return makePreview(options, 'rear') }
export function createLowPreview(options: { aspect: number }): PrefabPreview { return makePreview(options, 'low') }
