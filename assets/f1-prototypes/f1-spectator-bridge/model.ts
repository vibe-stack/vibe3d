// f1-spectator-bridge — an architectural circuit overpass: a shallow warren girder on
// battered portal piers, clad parapets, and a switchback stair tower at each abutment.
// Deck clears this kit's 5.5 m catch fence by default; `deckHeight` is configurable
// (a consumer sitting the crossing on a raised structure — a cut-and-cover lid, say —
// passes its own clearance), and the piers, stairs and handrails scale with it.

import {
  BufferGeometry,
  Group,
  Mesh,
  Vector3,
  type Material,
} from 'three/webgpu'

import {
  SPECTATOR_BRIDGE,
  STAIRS,
  acquireF1Materials,
  bevelBox,
  bevelPrism,
  bolt,
  createF1Preview,
  disposeF1Materials,
  groundPad,
  member,
  mergeParts,
} from '../f1-kit-core/index.ts'

type Slot = 'truss' | 'mesh' | 'stairs'

export interface F1SpectatorBridgeConfig {
  span: number
  /**
   * Deck height above the ground plane, in metres. The bridge SITS on whatever the caller's
   * datum is — a flush trackside pad by default, but a cut-and-cover lid or a graded verge
   * needs its own clearance — so this belongs to the consumer, not to the model. Default 5.5
   * is this kit's standard catch-fence clearance. The piers, the stair towers and their
   * handrails all scale to reach the deck at this height; the girder depth and parapet/rail
   * proportions do not change.
   */
  deckHeight: number
}

export interface F1SpectatorBridgeOptions extends Partial<F1SpectatorBridgeConfig> {
  materials?: Partial<Record<Slot, Material>>
}

export interface F1SpectatorBridgeInstance {
  readonly root: Group
  readonly parts: { truss: Group; mesh: Group; stairs: Group }
  readonly materials: Readonly<Record<Slot, Material>>
  getConfig(): Readonly<F1SpectatorBridgeConfig>
  configure(patch: Partial<F1SpectatorBridgeConfig>): void
  setMaterial(slot: Slot, material: Material): void
  update(deltaSeconds: number): void
  dispose(): void
}

const defaults: F1SpectatorBridgeConfig = { span: 12, deckHeight: SPECTATOR_BRIDGE.deckHeight }

/** Finite and `>= 4` (a shorter clearance leaves no room for the switchback stair). */
function clampDeckHeight(value: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback
  return Math.max(4, value)
}

// DECK_H and every quantity derived from it are `let`s recomputed by `applyDeckHeight()` at
// the top of each `rebuild()` — see that function, right after the derivation chain below.
let DECK_H: number = SPECTATOR_BRIDGE.deckHeight
const WIDTH = SPECTATOR_BRIDGE.width
const HZ = WIDTH / 2

/**
 * Slab, plus the fascia band. The fascia is the one element that turns a lattice into a
 * bridge at silhouette distance, so it is a deep continuous edge beam rather than the
 * thickness of the slab it hides.
 */
const DECK_T = 0.16
const FASCIA_H = 0.62
const FASCIA_T = 0.13
const FASCIA_Z = HZ + 0.06

/**
 * The girder is a shallow box under the deck rather than a full-height screen off the
 * ground. A 1.5 m warren between chords is what a 10–16 m footbridge span actually
 * carries, and keeping it shallow leaves the piers to read as the vertical structure.
 *
 * The chords are sized as rolled sections rather than bars. At 0.34 by 0.24 each one holds
 * a lit face over a shadowed soffit at silhouette distance, which is the difference between
 * a girder and a lattice; the diagonals and the gusset plates at every panel point are
 * scaled off that so the joints read as fabricated rather than welded stick to stick.
 */
const GIRDER_D = 1.52
const CHORD_H = 0.34
const CHORD_W = 0.24
let CHORD_TOP = DECK_H - DECK_T - CHORD_H / 2 - 0.01
let CHORD_BOT = CHORD_TOP - GIRDER_D
const GIRDER_Z = HZ - 0.18
const DIAGONAL_R = 0.115
const GUSSET = 0.26

/** Parapet: clad infill inside a posted frame, under a capping channel. */
const RAIL_H = 1.16
const PANEL_H = RAIL_H - 0.36
const PANEL_T = 0.03
const POST_S = 0.075
const RAIL_Z = HZ - 0.06
/**
 * Tower cladding runs three times the parapet infill: a wall plane, not a sheet.
 *
 * The wall is a rebated tray rather than a single sheet — a back plate carrying a thicker face
 * plate set inside a border reveal. A sheet flush with its frame has no edge of its own, so the
 * dark skin reads as a hole cut in the silver frame; giving the face plate a return that both
 * catches light and casts into the reveal is what makes the tower read as a skinned mass.
 */
const CLAD_T = 0.14
const CLAD_FACE = 0.24
const CLAD_MARGIN = 0.12
/** The raking flight wall repeats the tray shallower: it has to pass inside the tower frame. */
const CLAD_RAKE = CLAD_T + 0.07

/**
 * Battered portal pier, held inboard of the span ends so the girder cantilevers onto the
 * towers and the pier reads as free-standing structure instead of another tower column.
 *
 * The leg is battered twice over: its centreline rakes outward toward the plinth, and its
 * section widens from 0.56 m at the head to 0.92 m at the base. A constant section leaning
 * outward still reads as a propped post, so the leg is a trapezoid prism rather than a
 * rotated box.
 *
 * The batter itself lies across the bridge, which is the one axis a three-quarter view
 * foreshortens, so the same taper is stepped into the elevation as well: pad, plinth
 * course, plinth cap, shoe, shaft, capital. Six widths is what makes the portal read as
 * built rather than propped.
 */
const PIER_INSET = 1.45
const PIER_LEG = 0.80
const PIER_W_BASE = 0.46
const PIER_W_TOP = 0.28
const PIER_Z_TOP = HZ - 0.34
const PIER_Z_BASE = HZ + 0.55
const PIER_PAD_T = 0.18
const PIER_PLINTH_H = 0.78
const PIER_PLINTH_CAP = 0.28
const PIER_BASE_Y = PIER_PAD_T + PIER_PLINTH_H
const PIER_HEAD_H = 0.40
/** The head sits exactly one bearing plate below the bottom chord it carries. */
const PIER_BEARING_H = 0.11
let PIER_HEAD_Y = CHORD_BOT - CHORD_H / 2 - PIER_BEARING_H - PIER_HEAD_H / 2
let PIER_LEG_TOP = PIER_HEAD_Y - PIER_HEAD_H / 2 - 0.01
const PIER_HEAD_Z = (PIER_Z_TOP + PIER_W_TOP) * 2 + 0.48

/** Switchback stair tower: two equal flights about a half-height landing. */
let HALF_RISE = DECK_H / 2
let FLIGHT_STEPS = Math.ceil(HALF_RISE / STAIRS.rise)
let STEP_RISE = HALF_RISE / FLIGHT_STEPS
let FLIGHT_RUN = FLIGHT_STEPS * STAIRS.run
const LAND = STAIRS.landing
let TOWER_LEN = LAND * 2 + FLIGHT_RUN
const FLIGHT_W = HZ - 0.14
const FLIGHT_Z = HZ / 2
let RAKE = Math.atan2(STEP_RISE, STAIRS.run)
const COL_S = 0.26
const COL_Z = HZ + 0.13
let CAP_Y = DECK_H + RAIL_H - 0.05
/**
 * The towers land on the pier's own courses — pad, plinth, cap — and arrive at exactly
 * `PIER_BASE_Y`. Matching the datum rather than approximating it puts one masonry line under the
 * whole crossing, so the towers stand on substructure instead of on four bolted foot pads.
 */
const TOWER_PAD_T = PIER_PAD_T
const TOWER_PLINTH_CAP = PIER_PLINTH_CAP
const TOWER_BASE_Y = PIER_BASE_Y
/**
 * The plinth wall's courses. The middle one is the narrowest of the three so the pad below and
 * the cap above both oversail it — a cap flush with its own course has no shadow under it and
 * the whole base flattens back into one rounded bar. The corner pedestals step proud again.
 */
const TOWER_WALL_D = 0.62
/** Corner pedestals finish above the wall cap, so the tower reads as piers with infill between. */
const TOWER_PIER_Y = TOWER_BASE_Y + 0.12
/**
 * Each tower face is three bays wide and the outer two are walled solid, so the cladding
 * holds two thirds of the face and the bracing survives as one lit slot in the middle. A
 * thin band under every edge beam reads as scaffold no matter how many bands it is given.
 */
const FACE_BAYS = 3
/** Parapet-height wall capping the tower, picking up the deck fascia band it runs into. */
const PARAPET_CLAD = (CAP_Y - DECK_H) * 0.72

/**
 * Recomputes every DECK_H-derived quantity above for a new deck height. Called once at the
 * top of `rebuild()`, synchronously, before any geometry is built from these — so two bridge
 * instances with different `deckHeight` configs never interleave a build against the other's
 * derived values; each rebuild bakes vertex positions from whatever this last set.
 *
 * `PARAPET_CLAD` is deliberately NOT recomputed here: `CAP_Y - DECK_H` is `RAIL_H - 0.05`
 * regardless of deck height, so it stays the module-level constant it already was.
 */
function applyDeckHeight(deckHeight: number): void {
  DECK_H = deckHeight
  CHORD_TOP = DECK_H - DECK_T - CHORD_H / 2 - 0.01
  CHORD_BOT = CHORD_TOP - GIRDER_D
  PIER_HEAD_Y = CHORD_BOT - CHORD_H / 2 - PIER_BEARING_H - PIER_HEAD_H / 2
  PIER_LEG_TOP = PIER_HEAD_Y - PIER_HEAD_H / 2 - 0.01
  HALF_RISE = DECK_H / 2
  FLIGHT_STEPS = Math.ceil(HALF_RISE / STAIRS.rise)
  STEP_RISE = HALF_RISE / FLIGHT_STEPS
  FLIGHT_RUN = FLIGHT_STEPS * STAIRS.run
  TOWER_LEN = LAND * 2 + FLIGHT_RUN
  RAKE = Math.atan2(STEP_RISE, STAIRS.run)
  CAP_Y = DECK_H + RAIL_H - 0.05
}

/**
 * Geometry is collected per destination rather than per material slot: the deck slab is
 * anatomically part of the span, so it stays in the `truss` group while taking the
 * walking-surface material that the treads and landings share.
 */
interface Bag {
  /** Girder, piers, tower frame, fascia, parapet frame. Slot `truss`, group `truss`. */
  structure: BufferGeometry[]
  /** Parapet infill and tower cladding. Slot `mesh`, group `mesh`. */
  infill: BufferGeometry[]
  /**
   * Pads, plinth courses, plinth caps and tower pedestals. Slot `stairs`, group `truss`.
   *
   * The bases take the walking-surface material rather than the structural one so the bulk under
   * the bridge sits a full value below galvanized steel. Bright metal plinths read as more frame;
   * a mid grey reads as the concrete the frame is bolted down to, which is the whole point of
   * making them heavy. Kept out of the `truss` slot for value, kept in the `truss` group because
   * anatomically they belong to the span, not to the approach stairs.
   */
  base: BufferGeometry[]
  /** Bridge walking surface. Slot `stairs`, group `truss`. */
  deck: BufferGeometry[]
  /** Treads and landings. Slot `stairs`, group `stairs`. */
  walk: BufferGeometry[]
}

const BAG_KEYS = ['structure', 'infill', 'base', 'deck', 'walk'] as const

const newBag = (): Bag => ({ structure: [], infill: [], base: [], deck: [], walk: [] })

function box(
  size: readonly [number, number, number],
  at: readonly [number, number, number],
  bevel = 0.012,
): BufferGeometry {
  return bevelBox(size[0], size[1], size[2], bevel).translate(at[0], at[1], at[2])
}

/** A box lying along a stair rake in XY. `dir` of +1 climbs toward +X. */
function rakedBox(
  size: readonly [number, number, number],
  at: readonly [number, number, number],
  dir: 1 | -1,
  bevel = 0.008,
): BufferGeometry {
  const geo = bevelBox(size[0], size[1], size[2], bevel)
  geo.rotateZ(dir * RAKE)
  return geo.translate(at[0], at[1], at[2])
}

/** Capped parapet with clad infill along a level run of walkway. */
function parapetRun(bag: Bag, x0: number, x1: number, y: number): void {
  const len = x1 - x0
  const xc = (x0 + x1) / 2
  const bays = Math.max(3, Math.round(len / 1.5))
  for (const sz of [-1, 1] as const) {
    const z = sz * RAIL_Z
    bag.structure.push(box([len, 0.10, 0.15], [xc, y + RAIL_H - 0.05, z]))
    bag.structure.push(box([len, 0.09, 0.11], [xc, y + 0.11, z], 0.008))
    for (let i = 0; i <= bays; i++) {
      bag.structure.push(box(
        [POST_S, RAIL_H - 0.05, POST_S],
        [x0 + (i / bays) * len, y + (RAIL_H - 0.05) / 2, z],
        0.008,
      ))
    }
    for (let i = 0; i < bays; i++) {
      bag.infill.push(box(
        [len / bays - POST_S - 0.03, PANEL_H, PANEL_T],
        [x0 + ((i + 0.5) / bays) * len, y + 0.16 + PANEL_H / 2, z],
        0.004,
      ))
    }
  }
}

/** Deck slab and the fascia + parapet band that runs continuously onto both towers. */
function buildSpan(bag: Bag, span: number): void {
  const half = span / 2
  const bandLen = span + LAND * 2
  bag.deck.push(box([span, DECK_T, WIDTH], [0, DECK_H - DECK_T / 2, 0], 0.014))
  const planks = Math.max(8, Math.round(span / 1.1))
  for (let i = 0; i <= planks; i++) {
    bag.deck.push(box(
      [0.04, 0.024, WIDTH - 0.16],
      [-half + 0.12 + (i / planks) * (span - 0.24), DECK_H + 0.008, 0],
      0.003,
    ))
  }
  for (const sz of [-1, 1] as const) {
    const z = sz * FASCIA_Z
    bag.structure.push(box([bandLen, FASCIA_H, FASCIA_T], [0, DECK_H + 0.06 - FASCIA_H / 2, z], 0.014))
    bag.structure.push(box([bandLen, 0.07, FASCIA_T + 0.07], [0, DECK_H + 0.025, z], 0.006))
    bag.structure.push(box(
      [bandLen, 0.09, FASCIA_T + 0.05],
      [0, DECK_H + 0.06 - FASCIA_H + 0.045, z],
      0.006,
    ))
  }
  parapetRun(bag, -bandLen / 2, bandLen / 2, DECK_H)
}

/** Warren girder: paired side trusses, transverse floor beams, bottom lateral bracing. */
function buildGirder(bag: Bag, span: number): void {
  const half = span / 2
  const bays = Math.max(4, Math.round(span / 2.4))
  const midY = (CHORD_TOP + CHORD_BOT) / 2
  const topJoint = CHORD_TOP - CHORD_H / 2
  const botJoint = CHORD_BOT + CHORD_H / 2
  for (const sz of [-1, 1] as const) {
    const z = sz * GIRDER_Z
    bag.structure.push(box([span, CHORD_H, CHORD_W], [0, CHORD_TOP, z], 0.018))
    bag.structure.push(box([span, CHORD_H, CHORD_W], [0, CHORD_BOT, z], 0.018))
    for (let i = 0; i <= bays; i++) {
      const x = -half + (i / bays) * span
      bag.structure.push(box([0.22, GIRDER_D, CHORD_W - 0.03], [x, midY, z], 0.01))
      for (const gy of [topJoint - GUSSET / 2, botJoint + GUSSET / 2] as const) {
        bag.structure.push(box([0.48, GUSSET, CHORD_W + 0.06], [x, gy, z], 0.01))
      }
      if (i === bays) continue
      const x1 = -half + ((i + 1) / bays) * span
      const climbs = i % 2 === 0
      bag.structure.push(member(
        new Vector3(climbs ? x : x1, botJoint, z),
        new Vector3(climbs ? x1 : x, topJoint, z),
        DIAGONAL_R,
        6,
      ))
    }
  }
  const transoms = Math.max(5, Math.round(span / 1.6))
  for (let i = 0; i <= transoms; i++) {
    bag.structure.push(box(
      [0.20, CHORD_H, WIDTH - 0.08],
      [-half + (i / transoms) * span, CHORD_TOP, 0],
      0.01,
    ))
  }
  for (let i = 0; i < bays; i++) {
    const sign = i % 2 === 0 ? 1 : -1
    bag.structure.push(member(
      new Vector3(-half + (i / bays) * span, CHORD_BOT, -sign * GIRDER_Z),
      new Vector3(-half + ((i + 1) / bays) * span, CHORD_BOT, sign * GIRDER_Z),
      0.052,
      6,
    ))
  }
  for (const sx of [-1, 1] as const) {
    bag.structure.push(box(
      [0.40, CHORD_H + 0.20, COL_Z * 2 + COL_S],
      [sx * half, CHORD_BOT - 0.02, 0],
      0.016,
    ))
  }
}

/**
 * One battered leg. The trapezoid is authored in the plane of the batter — wide and outboard
 * at the plinth, narrow and inboard at the head — then extruded across the bridge axis. The
 * two sides are quarter turns of the same outline rather than a mirror, so the winding stays
 * outward on both of them (rule 5).
 */
function pierLeg(x: number, sz: 1 | -1): BufferGeometry {
  const zMid = (PIER_Z_BASE + PIER_Z_TOP) / 2
  const dBase = PIER_Z_BASE - zMid
  const dTop = PIER_Z_TOP - zMid
  const hh = (PIER_LEG_TOP - PIER_BASE_Y) / 2
  // Centred on the outline's own bounds rather than on the two centrelines: bevelPrism
  // insets toward the origin, so a corner that lands near it would lose its facet (rule 6).
  const uMid = (
    Math.min(dBase - PIER_W_BASE, dTop - PIER_W_TOP)
    + Math.max(dBase + PIER_W_BASE, dTop + PIER_W_TOP)
  ) / 2
  const geo = bevelPrism([
    [dBase - PIER_W_BASE - uMid, -hh],
    [dBase + PIER_W_BASE - uMid, -hh],
    [dTop + PIER_W_TOP - uMid, hh],
    [dTop - PIER_W_TOP - uMid, hh],
  ], PIER_LEG, 0.03)
  geo.rotateY((-sz * Math.PI) / 2)
  return geo.translate(x, (PIER_BASE_Y + PIER_LEG_TOP) / 2, sz * (zMid + uMid))
}

/** Battered two-leg portal on stepped plinths, carrying the girder inboard of the span end. */
function buildPier(bag: Bag, x: number): void {
  const height = PIER_LEG_TOP - PIER_BASE_Y
  const legAt = (y: number): { z: number; w: number } => {
    const t = (y - PIER_BASE_Y) / height
    return {
      z: PIER_Z_BASE + t * (PIER_Z_TOP - PIER_Z_BASE),
      w: PIER_W_BASE + t * (PIER_W_TOP - PIER_W_BASE),
    }
  }
  const braceY = PIER_BASE_Y + height * 0.44
  const brace = legAt(braceY)
  const course = PIER_PLINTH_H - PIER_PLINTH_CAP

  for (const sz of [-1, 1] as const) {
    bag.structure.push(pierLeg(x, sz))

    const zBase = sz * PIER_Z_BASE
    const zSpread = PIER_W_BASE * 2
    bag.base.push(groundPad(
      [PIER_LEG + 0.60, zSpread + 0.66], [x, 0, zBase], PIER_PAD_T,
    ))
    bag.base.push(box(
      [PIER_LEG + 0.40, course, zSpread + 0.44],
      [x, PIER_PAD_T + course / 2, zBase],
      0.04,
    ))
    bag.base.push(box(
      [PIER_LEG + 0.22, PIER_PLINTH_CAP, zSpread + 0.24],
      [x, PIER_BASE_Y - PIER_PLINTH_CAP / 2, zBase],
      0.03,
    ))
    for (const sb of [-1, 1] as const) {
      bag.structure.push(bolt([x, PIER_BASE_Y, zBase + sb * (PIER_W_BASE + 0.06)], 0.022, 0.028))
    }
    bag.structure.push(box(
      [PIER_LEG + 0.10, 0.34, zSpread + 0.10],
      [x, PIER_BASE_Y + 0.17, zBase],
      0.02,
    ))
    bag.structure.push(box(
      [PIER_LEG + 0.20, 0.24, PIER_W_TOP * 2 + 0.18],
      [x, PIER_LEG_TOP - 0.12, sz * PIER_Z_TOP],
      0.018,
    ))
    bag.structure.push(box(
      [PIER_LEG - 0.10, PIER_BEARING_H, 0.34],
      [x, PIER_HEAD_Y + PIER_HEAD_H / 2 + PIER_BEARING_H / 2, sz * GIRDER_Z],
      0.008,
    ))
    bag.structure.push(member(
      new Vector3(x, braceY + 0.14, sz * (brace.z - brace.w / 2)),
      new Vector3(x, PIER_LEG_TOP - 0.18, -sz * (PIER_Z_TOP - 0.04)),
      0.06,
      6,
    ))
  }
  bag.structure.push(box(
    [PIER_LEG + 0.44, PIER_HEAD_H, PIER_HEAD_Z],
    [x, PIER_HEAD_Y, 0],
  ))
  bag.structure.push(box(
    [PIER_LEG + 0.16, 0.22, PIER_HEAD_Z - 0.34],
    [x, PIER_HEAD_Y - PIER_HEAD_H / 2 - 0.10, 0],
    0.014,
  ))
  bag.structure.push(box(
    [PIER_LEG - 0.08, 0.34, (brace.z - brace.w) * 2 + 0.14],
    [x, braceY, 0],
    0.016,
  ))
}

/** Grating landing slab on a pair of edge beams. */
function landingSlab(bag: Bag, x0: number, x1: number, y: number): void {
  const len = x1 - x0
  const xc = (x0 + x1) / 2
  const thickness = STAIRS.treadT + 0.06
  bag.walk.push(box([len, thickness, WIDTH], [xc, y - thickness / 2, 0], 0.008))
  const bars = Math.max(3, Math.round(len / 0.32))
  for (let i = 0; i <= bars; i++) {
    bag.walk.push(box(
      [0.04, 0.022, WIDTH - 0.14],
      [x0 + 0.08 + (i / bars) * (len - 0.16), y + 0.008, 0],
      0.003,
    ))
  }
  for (const sz of [-1, 1] as const) {
    bag.structure.push(box([len, 0.22, 0.13], [xc, y - thickness - 0.11, sz * (HZ - 0.08)], 0.01))
  }
}

/**
 * One raking flight: treads, channel stringers, and a clad raking parapet. The panel sits
 * a step above the nosing line so the tread ends still read as a shadowed sawtooth under
 * it instead of the flight going solid.
 */
function buildFlight(bag: Bag, x0: number, y0: number, dir: 1 | -1, zc: number): void {
  const xc = x0 + (dir * FLIGHT_RUN) / 2
  const yc = y0 + HALF_RISE / 2
  const hyp = FLIGHT_STEPS * Math.hypot(STAIRS.run, STEP_RISE)

  for (let i = 0; i < FLIGHT_STEPS; i++) {
    bag.walk.push(box(
      [STAIRS.run + 0.01, STAIRS.treadT, FLIGHT_W - 0.10],
      [x0 + dir * (i + 0.5) * STAIRS.run, y0 + (i + 1) * STEP_RISE - STAIRS.treadT / 2, zc],
      0.005,
    ))
  }
  for (const sz of [-1, 1] as const) {
    bag.structure.push(rakedBox(
      [hyp, STAIRS.stringer, 0.08],
      [xc, yc - 0.12, zc + sz * (FLIGHT_W / 2 - 0.05)],
      dir,
    ))
  }
  for (const sz of [-1, 1] as const) {
    const z = zc + sz * (FLIGHT_W / 2 - 0.015)
    bag.structure.push(rakedBox(
      [hyp + 0.20, 0.10, CLAD_RAKE + 0.03], [xc, yc + STAIRS.railH, z], dir, 0.01,
    ))
    bag.infill.push(rakedBox([hyp - 0.12, 0.82, CLAD_T], [xc, yc + 0.64, z], dir, 0.006))
    bag.infill.push(rakedBox([hyp - 0.44, 0.56, CLAD_RAKE], [xc, yc + 0.64, z], dir, 0.014))
    const posts = 5
    for (let p = 0; p <= posts; p++) {
      const t = p / posts
      bag.structure.push(box(
        [POST_S, STAIRS.railH, POST_S],
        [x0 + dir * t * FLIGHT_RUN, y0 + t * HALF_RISE + STAIRS.railH / 2, z],
        0.008,
      ))
    }
  }
}

/**
 * A recessed clad plane inside a capping rail, a kick rail and mullion ribs on the panel
 * pitch the deck parapet already uses. An unbroken plane of this size reads as a billboard
 * rather than cladding, so the ribs are what keep the dark mass legible as wall.
 *
 * Authored spanning X and given a quarter turn for the tower end wall, so both orientations
 * come off one profile.
 */
function cladPanel(
  bag: Bag, len: number, h: number, at: readonly [number, number, number], turn = false,
): void {
  const place = (geo: BufferGeometry): BufferGeometry => {
    if (turn) geo.rotateY(Math.PI / 2)
    return geo.translate(at[0], at[1], at[2])
  }
  bag.infill.push(place(bevelBox(len, h, CLAD_T, 0.006)))
  cladFace(bag, place, len, h)
  bag.structure.push(place(
    bevelBox(len, 0.13, CLAD_FACE + 0.09, 0.006).translate(0, h / 2 - 0.065, 0),
  ))
  bag.structure.push(place(
    bevelBox(len, 0.10, CLAD_FACE + 0.07, 0.006).translate(0, -h / 2 + 0.05, 0),
  ))
  const ribs = Math.max(1, Math.round(len / 1.35) - 1)
  for (let i = 1; i <= ribs; i++) {
    bag.structure.push(place(
      bevelBox(0.10, h - 0.16, CLAD_FACE + 0.06, 0.006)
        .translate(-len / 2 + (i / (ribs + 1)) * len, 0, 0),
    ))
  }
  if (h > 1.6) bag.structure.push(place(bevelBox(len, 0.11, CLAD_FACE + 0.06, 0.006)))
}

/**
 * The proud half of the tray: a face plate inside the border reveal, with sheeting seams standing
 * off it again. Every one of these edges belongs to the dark material, so the wall carries its own
 * light and shade instead of borrowing all of it from the steel frame around it.
 */
function cladFace(
  bag: Bag, place: (geo: BufferGeometry) => BufferGeometry, len: number, h: number,
): void {
  const faceLen = len - CLAD_MARGIN * 2
  const faceH = h - CLAD_MARGIN * 2
  if (faceLen < 0.3 || faceH < 0.3) return
  bag.infill.push(place(bevelBox(faceLen, faceH, CLAD_FACE, 0.02)))
  const seams = Math.max(1, Math.round(faceH / 0.8) - 1)
  for (let i = 1; i <= seams; i++) {
    bag.infill.push(place(
      bevelBox(faceLen, 0.055, CLAD_FACE + 0.04, 0.008)
        .translate(0, -faceH / 2 + (i / (seams + 1)) * faceH, 0),
    ))
  }
}

/**
 * A tower corner pedestal, cut to the same courses as a pier plinth. A stair tower carries a
 * fraction of the load a portal pier does, but it is the same height of masonry above ground, and
 * a bridge whose end towers taper away to bolted feet reads as temporary however heavy the piers
 * are. The steel column starts on the cap rather than running through it.
 */
function towerPedestal(bag: Bag, x: number, z: number): void {
  const course = TOWER_PIER_Y - TOWER_PAD_T - TOWER_PLINTH_CAP
  bag.base.push(groundPad([1.38, TOWER_WALL_D + 0.68], [x, 0, z], TOWER_PAD_T))
  bag.base.push(box(
    [1.16, course, TOWER_WALL_D + 0.50], [x, TOWER_PAD_T + course / 2, z], 0.04,
  ))
  bag.base.push(box(
    [1.00, TOWER_PLINTH_CAP, TOWER_WALL_D + 0.34],
    [x, TOWER_PIER_Y - TOWER_PLINTH_CAP / 2, z],
    0.03,
  ))
  bag.structure.push(box(
    [COL_S + 0.26, 0.14, COL_S + 0.26], [x, TOWER_PIER_Y + 0.07, z], 0.016,
  ))
  for (const sb of [-1, 1] as const) {
    bag.structure.push(bolt([x, TOWER_PIER_Y + 0.14, z + sb * (COL_S / 2 + 0.10)], 0.02, 0.026))
  }
}

/** One storey of a tower face: walled outer bays, a cross-braced slot, mullions between. */
function towerFaceLevel(
  bag: Bag, x0: number, faceLen: number, y0: number, y1: number, z: number,
): void {
  const bayLen = faceLen / FACE_BAYS
  const wallH = y1 - y0 - 0.34
  for (let i = 0; i < FACE_BAYS; i++) {
    const a = x0 + i * bayLen
    const b = a + bayLen
    if (i % 2 === 0) {
      cladPanel(bag, bayLen - 0.10, wallH, [(a + b) / 2, (y0 + y1) / 2 - 0.03, z])
      continue
    }
    for (const climbs of [true, false] as const) {
      bag.structure.push(member(
        new Vector3(climbs ? a : b, y0 + 0.12, z),
        new Vector3(climbs ? b : a, y1 - 0.24, z),
        0.088,
        6,
      ))
    }
  }
  for (let i = 1; i < FACE_BAYS; i++) {
    bag.structure.push(box([0.20, y1 - y0, 0.22], [x0 + i * bayLen, (y0 + y1) / 2, z], 0.012))
  }
}

/** Exoskeleton tower frame: corner columns, walled braced faces, overhead portal beams. */
function buildTowerFrame(bag: Bag): void {
  const xEnd = TOWER_LEN - 0.18
  const faceLen = xEnd - 0.18
  const xMid = LAND + FLIGHT_RUN
  const xFace = TOWER_LEN / 2

  for (const sz of [-1, 1] as const) {
    const z = sz * COL_Z
    // Not a sill between four feet but a plinth wall the whole tower stands on, stepped on the
    // pier's courses and stopped at the pier's datum. Below the cladding the tower was reading
    // as open frame on pads; carrying masonry all the way round closes it into one mass.
    const wallCourse = TOWER_BASE_Y - TOWER_PAD_T - TOWER_PLINTH_CAP
    bag.base.push(box(
      [faceLen + 0.46, TOWER_PAD_T, TOWER_WALL_D + 0.28], [xFace, TOWER_PAD_T / 2, z], 0.03,
    ))
    bag.base.push(box(
      [faceLen + 0.30, wallCourse, TOWER_WALL_D],
      [xFace, TOWER_PAD_T + wallCourse / 2, z],
      0.03,
    ))
    bag.base.push(box(
      [faceLen + 0.40, TOWER_PLINTH_CAP, TOWER_WALL_D + 0.22],
      [xFace, TOWER_BASE_Y - TOWER_PLINTH_CAP / 2, z],
      0.025,
    ))
    for (const x of [0.18, xEnd] as const) {
      bag.structure.push(box(
        [COL_S, CAP_Y - TOWER_PIER_Y, COL_S], [x, (TOWER_PIER_Y + CAP_Y) / 2, z], 0.016,
      ))
      towerPedestal(bag, x, z)
    }
    for (const x of [LAND, xMid] as const) {
      bag.structure.push(box(
        [COL_S - 0.06, DECK_H - TOWER_BASE_Y, COL_S - 0.06],
        [x, (TOWER_BASE_Y + DECK_H) / 2, z],
        0.014,
      ))
      bag.base.push(box(
        [COL_S + 0.40, TOWER_BASE_Y + 0.09, TOWER_WALL_D + 0.30],
        [x, (TOWER_BASE_Y + 0.09) / 2, z],
        0.024,
      ))
    }
    for (const [y0, y1] of [[TOWER_BASE_Y, HALF_RISE], [HALF_RISE, DECK_H]] as const) {
      bag.structure.push(box([faceLen, 0.30, CLAD_FACE + 0.10], [xFace, y1, z]))
      towerFaceLevel(bag, 0.18, faceLen, y0, y1, z)
    }
    cladPanel(bag, faceLen - 0.08, PARAPET_CLAD, [xFace, CAP_Y - 0.20 - PARAPET_CLAD / 2, z])
    bag.structure.push(box(
      [faceLen + 0.10, 0.24, CLAD_FACE + 0.12], [xFace, CAP_Y - 0.05, z], 0.012,
    ))
  }
  const gableH = HALF_RISE - TOWER_BASE_Y - 0.40
  cladPanel(bag, COL_Z * 2 - COL_S, gableH, [xEnd, TOWER_BASE_Y + 0.14 + gableH / 2, 0], true)
  for (const x of [0.18, xEnd] as const) {
    bag.structure.push(box([0.18, 0.24, COL_Z * 2 + COL_S], [x, CAP_Y + 0.12, 0], 0.014))
    bag.structure.push(box([0.16, 0.22, COL_Z * 2 + COL_S], [x, HALF_RISE - 0.34, 0], 0.012))
  }
}

/**
 * One tower in local space: x = 0 sits at the span end, the flights switch back away from
 * the deck, so the whole approach folds into a 6.9 m footprint instead of a 10 m straight
 * run that would out-measure the span it serves.
 */
function buildTower(): Bag {
  const bag = newBag()
  const xMid = LAND + FLIGHT_RUN
  buildTowerFrame(bag)
  landingSlab(bag, 0, LAND, DECK_H)
  buildFlight(bag, xMid, HALF_RISE, -1, FLIGHT_Z)
  buildFlight(bag, LAND, 0, 1, -FLIGHT_Z)
  landingSlab(bag, xMid, TOWER_LEN, HALF_RISE)
  parapetRun(bag, xMid - 0.10, TOWER_LEN, HALF_RISE)
  bag.structure.push(box(
    [CLAD_RAKE + 0.03, 0.10, WIDTH - 0.10],
    [TOWER_LEN - 0.08, HALF_RISE + RAIL_H - 0.05, 0],
  ))
  bag.infill.push(box(
    [CLAD_T, PANEL_H, WIDTH - 0.16],
    [TOWER_LEN - 0.08, HALF_RISE + 0.16 + PANEL_H / 2, 0],
    0.006,
  ))
  bag.infill.push(box(
    [CLAD_RAKE, PANEL_H - 0.22, WIDTH - 0.40],
    [TOWER_LEN - 0.08, HALF_RISE + 0.16 + PANEL_H / 2, 0],
    0.014,
  ))
  bag.walk.push(box([LAND + 0.60, 0.16, WIDTH + 0.40], [LAND / 2 - 0.10, 0.08, 0], 0.014))
  return bag
}

/** Rotate rather than mirror, so the flights alternate hand and winding stays outward. */
function placeTower(bag: Bag, tower: Bag, xOrigin: number, flip: boolean): void {
  for (const key of BAG_KEYS) {
    for (const geometry of tower[key]) {
      if (flip) geometry.rotateY(Math.PI)
      geometry.translate(xOrigin, 0, 0)
      bag[key].push(geometry)
    }
  }
}

export function createModel(options: F1SpectatorBridgeOptions = {}): F1SpectatorBridgeInstance {
  const config: F1SpectatorBridgeConfig = {
    span: Math.max(6, options.span ?? defaults.span),
    deckHeight: clampDeckHeight(options.deckHeight ?? defaults.deckHeight, defaults.deckHeight),
  }

  const bundle = acquireF1Materials()
  const kit = bundle.materials
  const materialSlots: Record<Slot, Material> = {
    truss: options.materials?.truss ?? kit.steel,
    mesh: options.materials?.mesh ?? kit.graphite,
    stairs: options.materials?.stairs ?? kit.slate,
  }

  const root = new Group(); root.name = 'f1-spectator-bridge'
  const truss = new Group(); truss.name = 'truss'
  const mesh = new Group(); mesh.name = 'mesh'
  const stairs = new Group(); stairs.name = 'stairs'
  root.add(truss, mesh, stairs)

  const generated: BufferGeometry[] = []
  const meshesBySlot: Record<Slot, Mesh[]> = { truss: [], mesh: [], stairs: [] }

  const releaseGenerated = (): void => {
    truss.clear(); mesh.clear(); stairs.clear()
    for (const geometry of generated) geometry.dispose()
    generated.length = 0
    for (const slot of Object.keys(meshesBySlot) as Slot[]) meshesBySlot[slot].length = 0
  }

  const emit = (slot: Slot, geometry: BufferGeometry, group: Group, name: string): void => {
    generated.push(geometry)
    const meshObj = new Mesh(geometry, materialSlots[slot])
    meshObj.name = name
    meshObj.castShadow = true
    meshObj.receiveShadow = true
    meshesBySlot[slot].push(meshObj)
    group.add(meshObj)
  }

  const rebuild = (): void => {
    releaseGenerated()
    applyDeckHeight(config.deckHeight)
    const half = config.span / 2
    const pierX = Math.max(half * 0.4, half - PIER_INSET)
    const bag = newBag()
    buildSpan(bag, config.span)
    buildGirder(bag, config.span)
    buildPier(bag, -pierX)
    buildPier(bag, pierX)
    placeTower(bag, buildTower(), half, false)
    placeTower(bag, buildTower(), -half, true)

    emit('truss', mergeParts(bag.structure, 'structure'), truss, 'structure')
    emit('stairs', mergeParts(bag.base, 'plinths'), truss, 'plinths')
    emit('stairs', mergeParts(bag.deck, 'deck'), truss, 'deck')
    emit('mesh', mergeParts(bag.infill, 'infill'), mesh, 'infill')
    emit('stairs', mergeParts(bag.walk, 'approach'), stairs, 'approach')
  }
  rebuild()

  return {
    root,
    parts: { truss, mesh, stairs },
    materials: materialSlots,
    getConfig: () => ({ ...config }),
    configure(patch) {
      if (patch.span !== undefined) config.span = Math.max(6, patch.span)
      if (patch.deckHeight !== undefined) {
        config.deckHeight = clampDeckHeight(patch.deckHeight, config.deckHeight)
      }
      rebuild()
    },
    setMaterial(slot, material) {
      materialSlots[slot] = material
      for (const mesh of meshesBySlot[slot]) mesh.material = material
    },
    dispose() {
      releaseGenerated()
      disposeF1Materials(bundle)
      root.removeFromParent()
    },
    update: () => {},
  }
}

export function createPreview({ aspect }: { aspect: number; time?: number }) {
  return createF1Preview(createModel({ span: 12 }), {
    aspect,
    target: [0, 3.2, 0],
    distance: 53,
    fov: 30,
    yaw: 0.26,
    pitch: 0.16,
  })
}
