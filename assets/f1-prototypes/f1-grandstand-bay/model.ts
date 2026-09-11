// f1-grandstand-bay — one Silverstone-style seating bay: a raked bowl on an elevated deck, tip-up seat
// shells on standards, a hoarding-and-debris-fence frontage, and a tensioned membrane roof carried on
// slender front columns. configure({ rows, width, tiers, roof, stairs }).
//
// THE TWO TOP-LEVEL SWITCHES — the ones an emitter tiling a run of bays reaches for:
//
//   createModel({
//     rows: 8, width: 10, tiers: 3,
//     roof: 'full',   // 'full' (default) ONE canopy over the WHOLE section | 'top' top tier only
//                     // | 'none' no canopy at all | 'per-tier' obey tierSpec[k].roof
//     stairs: 'none', // 'none' (default) no end towers, so bays butt at `width` | 'left' | 'right'
//   })                // | 'both' | 'ends' (documented alias for 'both': a run end on both sides)
//
// PRECEDENCE. `roof` wins outright: `tierSpec[k].roof` is read ONLY when `roof === 'per-tier'`, so the
// per-tier field is an explicit opt-in rather than a hidden override. `stairs` is the opposite way round
// — it is only the DEFAULT each tier's `stairSide` falls back to, so a tier that sets `stairSide`
// explicitly wins for that tier. {@link F1GrandstandBayInstance.getFootprint} always reports the
// RESOLVED stairs, whichever of the two decided them.
//
// Datums read off the Silverstone reference: 0.44 m rise on a 0.80 m tread, a 1.10 m promenade sitting
// 0.95 m above ground, row 1 stepped a further 0.75 m up so it clears the hoarding, columns and rafters
// on a ~2.6 m bay pitch, and a roof that falls only 0.45 m across the span before its cantilever curls
// back up, so the canopy opens toward the track instead of shutting down onto it. `width` is the tiling
// module and the SEATING never overhangs it, so a run of bays reads as one continuous stand — the one
// thing that deliberately does overhang is an end stair tower, which is why `getFootprint()` exists (see
// TILING below). The red leading-edge fascia and the amber nosings are the catalogue tells — not a shed.
//
// `tiers` (1-4) stacks whole bowls, like Madring's S/F stand: tier k's promenade sits at tier k-1's
// bowlTop + ROOF_CLEAR (headroom for the concourse under it), and tier k's front CANTILEVERS
// OVERLAP_ROWS rows' worth of tread past tier k-1's rear edge — the balcony front overhangs the tier
// below rather than sitting flush on top of it (the Madring S/F photo's datum). Each tier's own closed
// bowl mass is already a full-depth slab underneath it (its loft profile's lowest point is local y=0
// across the WHOLE depth, front to rear — see {@link buildBowl}), so that overhang is automatically the
// soffit over the covered rows below — no separate soffit geometry needed. Each tier below the top still
// gets its own frontage (fascia/hoarding/guard-rail), landing right at the overhang's leading edge like a
// real balcony front, and a rear wall stretched to close the gap under the tier above (no see-through
// void). ONE roof — the existing membrane/rafter/column system — carries the stand, and by default
// (`roof: 'full'`) it spans the WHOLE section: rear tie at the top tier's own rear wall line, leading
// edge out over TIER 0's promenade, so a stack reads with the same profile as a rows-24 single-tier bay
// rather than a small lid parked on the top deck. `tiers: 1` is untouched: same single bowl, same
// canopy, same geometry as before, byte for byte.
//
// `tierSpec` (indexed by tier, 0 = bottom) makes every one of those per-tier decisions configurable, so a
// stack is never left floating with no visible means of support:
//   - `rows` — this tier's own row count (default `config.rows`).
//   - `plinth` (tier 0 only) — deck height above ground (default `DECK`, 0.95 m). A taller plinth raises
//     the front wall and the whole stack above it rigidly; it does not change any tier-to-tier clearance
//     (those are all rise-relative, not ground-relative — see the `rebuild` origin derivation).
//   - `lift` (tiers ≥1) — EXTRA clear height added above the default step, e.g. `tierSpec[1].lift` to
//     raise just the middle tier.
//   - `overlapRows` (tiers ≥1) — how many rows of tread this tier's front cantilevers past the tier
//     below's rear edge (default `OVERLAP_ROWS`).
//   - `support` — what carries THIS tier at its front (cantilever-tip) edge: `'columns'` (default) plants
//     a column line, on the roof's own bay pitch, from the tier below's `surfaceY` up to this tier's flat
//     underside (local y = 0), plus a raking stringer down each side to the rear support so the soffit
//     visibly rests on something rather than just closing as a slab; `'wall'` is a solid panel instead of
//     columns; `'none'` leaves it open. For tier 0 — which already stands on a closed loft face reaching
//     the ground (the plinth) — `'columns'`/`'wall'`/`'none'` are all a no-op: there is nothing to add or
//     remove, tier 0 was never floating.
//   - `rearSupport` — the back of the stand: a column line (with X cross-bracing per bay) or wall running
//     from TRUE GROUND up to this tier's own rear-wall height, at the rear face. Every tier above ground
//     gets its own rear tower rather than one member spanning past intermediate tiers, because each tier
//     steps further back as it stacks (see `tierStep.z` below), so the towers never collide.
//   - `stairSide` (`'left' | 'right' | 'both' | 'none'`; defaults to the top-level `stairs` for tiers ≥1,
//     `'none'` for tier 0) — which END face carries this tier's access stair. The stair is NOT across
//     the front of the bowl: it is a stair TOWER bolted to the bay's end face (x = ±halfW), travelling
//     along Z and climbing from the tier below's promenade to this tier's, exactly as a
//     temporary-stand scaffold tower does (Madring IMG_2437). A tower that reaches tier 0 also carries an
//     ENTRY flight from GRADE up to tier 0's promenade, in the cage's own spare lane — see
//     {@link GroundFlightPlan}. See {@link buildStairTower}.
//   - `stairWidth` (default 1.4 m — f1-stairs' own flight width) — the flight width of that tower.
//     A folded tower is two lanes wide (`2 × stairWidth + STAIR_GAP`); a straight one is one lane.
//   - `roof` (default: top tier only) — lets a non-top tier carry its own membrane roof too, gated by a
//     thrown clearance check against the tier stacked above it. IGNORED unless the top-level
//     `roof: 'per-tier'` asks for it (see PRECEDENCE above).
// Any field left out of a given tier's (partial) entry falls back to the default above, so `tiers: 3`
// alone still builds a complete, fully-supported stack. `tiers` may also be given directly as the
// `tierSpec` array (`tiers: [{...}, {...}, {...}]`), in which case `tiers = tiers.length`.
//
// TILING. `width` is the module and the SEATING never leaves it, but a stair tower deliberately does —
// it hangs off the end face. {@link F1GrandstandBayInstance.getFootprint} reports both numbers so an
// emitter tiling a run of bays can place towers only at the ends. That is why the top-level `stairs`
// DEFAULTS to `'none'`: a bay squeezes against its neighbours at exactly `width` unless asked otherwise,
// and the EMITTER decides which bay gets a tower — the two end bays pass `stairs: 'ends'` (or `'left'` /
// `'right'` for the outward face only) and the run's overall width is `getFootprint().totalWidth` on
// those, `width` in between.
//
// COLLISION. {@link F1GrandstandBayInstance.getCollisionVolumes} / `parts.collision` are a first cut at
// what a physics engine should be given for one placed stand: a handful of CONVEX volumes (one prism per
// tier's bowl mass, one box per support line, one box per stair tower) instead of the whole visual
// trimesh or one fat whole-model AABB. The roof is deliberately excluded — nothing that collides ever
// reaches it, and leaving it out is what keeps the proxy cheap and stops the canopy's cantilever from
// inflating an AABB out over the track. The group is NOT parented to `root` (so it can never reach the
// visual/compile path); `createModel({ debug: { collision: true } })` parents it for a capture.
//
// TODO(collision-as-config, Miguel 2026-09-11 — "make that into config as part of the vibe3d model; this
// is going to be more important over time"): promote the proxy from a hand-built side group to a
// first-class, PROCEDURAL config contract shared by every kit model, to land in the upstream PR:
//   1. `collision: { mode: 'volumes' | 'hull' | 'aabb' | 'none', parts?: Record<part, boolean> }` on the
//      model config — `volumes` = the convex list above, derived from the SAME layout numbers the visual
//      is built from (never a second set of typed dimensions), `hull` = the compiled .vtopo hull,
//      `aabb` = today's fallback, `none` = props that must never collide (roof, flags, banners).
//   2. Per-part opt-in so a model can say "bowl + supports + stairs collide, roof does not" in data,
//      and so `f1-kit-core/compile.ts` can emit the volume list into the .vtopo sidecar PER CONFIG
//      SIGNATURE (a 3-tier bay and a 1-tier bay are different colliders of the same id).
//   3. A single reader on the consumer side (devlo-racing `attachKitCollider`) that prefers
//      `getCollisionVolumes()` over the sidecar hull over the AABB, so the game gets cheap convex
//      colliders the day `kitAllowsBarrierCollider` stops being a blanket false.
//   Stays a TODO until the stand + garage-box models are accepted upstream.

import {
  BufferGeometry,
  DoubleSide,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  Vector3,
  type Material,
} from 'three/webgpu'
import { LoftGeometry } from 'three/examples/jsm/geometries/LoftGeometry.js'

import {
  STAIRS,
  TOKEN,
  acquireF1Materials,
  bevelBox,
  bevelPrism,
  createF1Preview,
  disposeF1Materials,
  groundPad,
  loftAlongX,
  member,
  mergeParts,
  shade,
} from '../f1-kit-core/index.ts'
// The stair tower is built from f1-stairs' OWN tread pan and channel stringer at f1-stairs' OWN pitch
// (STAIRS.rise / STAIRS.run), so the stand's access stair and the catalogue's FIA flight are one part.
import { channelStringer, gratingTread, stringerStations } from '../f1-stairs/model.ts'

type Slot = 'structure' | 'deck' | 'seat' | 'roof' | 'fascia'

/** What carries a tier at the edge in question: real columns, a solid panel, or nothing at all. */
export type TierSupport = 'columns' | 'wall' | 'none'

export const STAIR_SIDES = ['none', 'left', 'right', 'both'] as const
/** Which END face (x = ±halfW) carries a tier's access stair tower. Never the front of the bowl. */
export type StairSide = (typeof STAIR_SIDES)[number]

export const ROOF_MODES = ['full', 'top', 'none', 'per-tier'] as const
/**
 * Top-level canopy switch (`F1GrandstandBayConfig.roof`, default `'full'`).
 * - `'full'` — ONE membrane spanning the whole SECTION: rear tie at the top tier's own rear wall line,
 *   leading edge out over tier 0's promenade. At `tiers: 1` that IS the single-tier roof, byte for byte.
 * - `'top'` — the top tier only, which is what a stack used to build.
 * - `'none'` — no canopy: membrane, rafters, columns and fascia all gone.
 * - `'per-tier'` — the ONLY value that reads `tierSpec[k].roof`. Under every other value that per-tier
 *   field is ignored, so the precedence is explicit rather than magic.
 */
export type RoofMode = (typeof ROOF_MODES)[number]

export const STAIRS_MODES = ['none', 'left', 'right', 'both', 'ends'] as const
/**
 * Top-level access-tower switch (`F1GrandstandBayConfig.stairs`, default `'none'`) — which END faces of
 * THIS bay carry a tower. `'ends'` is a documented alias for `'both'`, meaning "this bay is a run end on
 * both sides". Unlike {@link RoofMode} this is only the DEFAULT a tier's `stairSide` falls back to: a
 * tier that sets `tierSpec[k].stairSide` explicitly wins for that tier.
 */
export type StairsMode = (typeof STAIRS_MODES)[number]

/** Per-tier overrides. Every field is optional on input — see the header comment for each default. */
export interface TierSpec {
  rows: number
  /** Tier 0 only: deck height above ground. */
  plinth: number
  /** Tiers ≥1 only: extra clear height added above the default step. */
  lift: number
  /** Tiers ≥1 only: cantilever over the tier below, in rows of tread. */
  overlapRows: number
  support: TierSupport
  rearSupport: TierSupport
  /** Which end face this tier's stair tower is mounted on. `'none'` for a bay mid-run. */
  stairSide: StairSide
  /** Flight width of that tower, metres (f1-stairs' own clamp: 0.9–2.8). */
  stairWidth: number
  roof: boolean
}

/**
 * What a bay actually occupies across the run direction. `width` is the tiling module the SEATING is
 * held inside; `totalWidth` includes the stair towers, which deliberately hang off the end faces.
 */
export interface F1GrandstandBayFootprint {
  /** Tiling module — the pitch a run of bays butts at. */
  readonly width: number
  /** `width` + both stair-tower overhangs. */
  readonly totalWidth: number
  /** Overhang past `-width/2`, metres (0 when no tower is mounted on that end). */
  readonly left: number
  /** Overhang past `+width/2`, metres. */
  readonly right: number
}

/** One convex volume of the physics proxy — a prism (bowl) or a box (support line / stair tower). */
export interface F1GrandstandBayCollisionVolume {
  readonly part: 'bowl' | 'front-support' | 'rear-support' | 'stair-tower'
  /** Owning tier, or -1 for a stair tower (one cage serves every tier it reaches). */
  readonly tier: number
  readonly kind: 'wedge' | 'box'
  /** Convex corners in the model's own local frame, metres. */
  readonly points: ReadonlyArray<readonly [number, number, number]>
  readonly min: readonly [number, number, number]
  readonly max: readonly [number, number, number]
}

export interface F1GrandstandBayConfig {
  rows: number
  width: number
  /** Stacked bowls, 1-4. `tiers: 1` (the default) is the original single bowl, unchanged. */
  tiers: number
  /** Canopy switch — see {@link RoofMode}. Default `'full'`: one canopy over the whole section. */
  roof: RoofMode
  /** Access-tower switch — see {@link StairsMode}. Default `'none'`: bays tile flush at `width`. */
  stairs: StairsMode
  /** Per-tier overrides, indexed by tier (0 = bottom). Missing fields/entries fall back to defaults. */
  tierSpec?: ReadonlyArray<Partial<TierSpec>>
}

/** `tiers` may be a count, or the `tierSpec` array itself (then `tiers = tiers.length`). */
export type F1GrandstandBayTiersInput = number | ReadonlyArray<Partial<TierSpec>>

export type F1GrandstandBayPatch = Partial<Omit<F1GrandstandBayConfig, 'tiers'>> & {
  tiers?: F1GrandstandBayTiersInput
}

export interface F1GrandstandBayOptions extends F1GrandstandBayPatch {
  materials?: Partial<Record<Slot, Material>>
  /**
   * DEV only. `collision: true` parents the (normally detached) collision-proxy group under `root` and
   * makes it visible, so a preview can capture the proxy over the model. Never on in a shipped build:
   * the group carries `userData.excludeFromExport`, and off by default it cannot reach the compile path.
   */
  debug?: { collision?: boolean }
}

export interface F1GrandstandBayInstance {
  readonly root: Group
  /** `collision` is a proxy group, NOT parented to `root` unless `debug.collision` was passed. */
  readonly parts: { bowl: Group; roof: Group; collision: Group }
  readonly materials: Readonly<Record<Slot, Material>>
  getConfig(): Readonly<F1GrandstandBayConfig>
  /** Seating module vs. total width including stair towers. Recomputed on every `configure`. */
  getFootprint(): F1GrandstandBayFootprint
  /** Convex physics volumes for one placed instance. Roof excluded by design. */
  getCollisionVolumes(): readonly F1GrandstandBayCollisionVolume[]
  configure(patch: F1GrandstandBayPatch): void
  setMaterial(slot: Slot, material: Material): void
  update(deltaSeconds: number): void
  dispose(): void
}

const defaults: F1GrandstandBayConfig = {
  rows: 8, width: 10, tiers: 1, roof: 'full', stairs: 'none',
}
const MIN_TIERS = 1
const MAX_TIERS = 4

const RISE = 0.44
const TREAD = 0.8
/** Promenade in front of row 1. */
const WALK = 1.1
/**
 * Step from the promenade up to row 1. Sized against the frontage hoarding rather than as a kerb: at a
 * kerb's height the first two rows sit behind the advertising and the seating field loses its depth.
 */
const NOSE = 0.75
/** The bowl stands on a plinth, so its frontage reads as a wall rather than a step. */
const DECK = 0.95
/** Circulation behind the last row, inside the bowl mass. */
const REAR = 0.5
const AISLE = 1.1
const SEAT_PITCH = 0.435
/** Column and rafter pitch. */
const BAY = 2.6
const ROOF_BACK = 0.55
const ROOF_FRONT = 0.95
const ROOF_CLEAR = 2.25
/**
 * Fall from the rear tie to the leading edge. Kept shallow: the rake alone still stops the back rows
 * peeking over their own fascia, and anything steeper shuts the canopy down onto the track instead of
 * opening it out over the bowl.
 */
const ROOF_FALL = 0.45
const ROOF_ARCH = 0.24
/** Upward curl over the outer {@link TIP_U} of the cantilever — the lift that opens the front. */
const ROOF_LIFT = 0.3
/** Where the curl starts, as a fraction of the span from the rear tie. */
const TIP_U = 0.68
/** Mid-bay pull on the fabric at the leading edge: what bays the front edge into scallops. */
const MEMBRANE_SAG = 0.3
/** Drop from the membrane tip to the column head, so the fabric edge leads and the steel follows. */
const EDGE_HEAD = 0.44
const FASCIA_H = 0.46
/**
 * Advertising band at the promenade edge. Held to a band rather than run the full height up to the
 * debris fence: at full height it welds to the plinth under it and the two read as one two-metre slab.
 */
const HOARD_H = 0.62
/** Guard-rail head above the deck. The open void between it and the hoarding is what shows the walk. */
const RAIL_H = 1.12
/**
 * estimate:photo — how many rows of tread a stacked tier's balcony front overhangs the tier below, read
 * off the Madring S/F stand photo (the upper tiers' fronts hang over roughly the last three rows of the
 * tier beneath, not sitting flush on top of it). Only meaningful when `tiers` > 1. Default for a tier's
 * `overlapRows`.
 */
const OVERLAP_ROWS = 3

/** Front/rear tier-support column radius — a lighter gauge than the roof's own 0.095 m columns, since a
 *  support column carries one tier's cantilever rather than the whole canopy. */
const SUPPORT_R = 0.085
/** Ground/tread pad under a support column foot, matching the roof column's own pad convention. */
const SUPPORT_PAD = 0.32
/** Clear of the coincident bowl/wall face by more than the column radius, so neither z-fights the other. */
const SUPPORT_INSET = SUPPORT_R + 0.05
const BRACE_R = 0.03
/** Solid-panel support thickness, front or rear. */
const WALL_SUPPORT_T = 0.18

/**
 * Where a section-spanning canopy's intermediate prop stands on a lower tier's promenade, measured back
 * from that tier's leading edge. Held against the front lip rather than mid-walk: the promenade is only
 * WALK (1.10 m) deep and a prop in the middle of it is a prop in the middle of the circulation.
 */
const PROP_INSET = 0.32
/** Clear the rafter's own 0.072 m chord radius, so a prop head meets the rafter underside, not its axis. */
const PROP_HEAD = 0.1
/** Stations sampled along each tier's exposed depth when solving the canopy's clearance. */
const CLEAR_SAMPLES = 24

/**
 * Access-stair pitch. NOT the bowl's own 0.44/0.80 rake — a stair a spectator climbs between tiers is
 * a stair, and the kit already has one: f1-stairs' FIA 180/280 flight. Same numbers, same tread pan,
 * same channel stringer, so the tower and the catalogue flight are one product.
 */
const TOWER_RISE = STAIRS.rise
const TOWER_RUN = STAIRS.run
/** Landing at every promenade the tower serves and at each switchback turn — f1-stairs' own. */
const TOWER_LANDING = STAIRS.landing
/** Default flight width — f1-stairs' own default. */
const STAIR_WIDTH = 1.4
/** Clear gap between the bay's end face and the tower's inner post line. */
const TOWER_GAP = 0.12
/** Clear gap between the two lanes of a folded switchback. */
const STAIR_GAP = 0.3
/** Scaffold gauges for the tower cage: standard, ledger, diagonal brace. */
const TOWER_POST_R = 0.06
const TOWER_LEDGER_R = 0.032
const TOWER_BRACE_R = 0.024
/** Lift height — the vertical pitch the cage's ledgers and braces repeat at. */
const TOWER_LIFT = 2.0
/**
 * Base plate under each standard. The post lines are inset by half of it (plus a hair), so the PLATES —
 * not the tube centres — are what sit flush inside the width `getFootprint()` reports: an emitter that
 * trusts that number must not find a steel plate 80 mm outside it.
 */
const TOWER_PAD = 0.34
/**
 * How far a flight actually stands proud of its NOMINAL width: f1-stairs' channel stringer sits 50 mm
 * inside the flight edge and its flanges are `stringerT + 55 mm` across, so the steel reaches ~7.5 mm
 * outside the number. Measured off those constants rather than guessed, because it is the difference
 * between `getFootprint()` being a promise and being an approximation.
 */
const FLIGHT_PROUD = (STAIRS.stringerT + 0.055) / 2 - 0.05 + 0.005
/** Headroom the cage's own top rail stands above the highest flight it carries. */
const TOWER_HEAD = 0.25
/** Standard-to-standard bay module along the run — the pitch the cage lattice keeps. */
const TOWER_BAY = 2.6

interface Layout {
  readonly rows: number
  readonly width: number
  readonly halfW: number
  readonly halfD: number
  /** This tier's own promenade height above ITS OWN local ground (0.95 m by default; only tier 0's
   *  `plinth` ever overrides it — see the header comment on why that doesn't perturb any clearance). */
  readonly base: number
  readonly bowlTop: number
  /** Rafter and column stations across the bay, boundaries inclusive. */
  readonly columns: readonly number[]
  readonly zBack: number
  readonly zFront: number
  readonly yBack: number
  readonly yFront: number
}

const layoutOf = (rows: number, width: number, base: number): Layout => {
  const halfD = (WALK + rows * TREAD + REAR) / 2
  const bays = Math.max(2, Math.round(width / BAY))
  const columns: number[] = []
  for (let i = 0; i <= bays; i++) columns.push(-width / 2 + (i / bays) * width)
  const bowlTop = base + NOSE + rows * RISE
  return {
    rows,
    width,
    halfW: width / 2,
    halfD,
    base,
    bowlTop,
    columns,
    zBack: -halfD - ROOF_BACK,
    zFront: halfD + ROOF_FRONT,
    yBack: bowlTop + ROOF_CLEAR,
    yFront: bowlTop + ROOF_CLEAR - ROOF_FALL,
  }
}

/** Walking surface of tier `r`, in this layout's own local frame. */
const treadY = (layout: Layout, r: number): number => layout.base + NOSE + r * RISE

/** Rear edge of tier `r` — where its seat standards bolt down. */
const treadBack = (layout: Layout, r: number): number => layout.halfD - WALK - (r + 1) * TREAD

/** Whatever a spectator stands on at `z`: the promenade, or the tier that covers it. */
const surfaceY = (layout: Layout, z: number): number => {
  if (z > layout.halfD - WALK) return layout.base
  const r = Math.floor((layout.halfD - WALK - z) / TREAD)
  return treadY(layout, Math.min(Math.max(r, 0), layout.rows - 1))
}

/**
 * Top of the bowl MASS at local `z` — what a canopy overhead has to clear. Not `surfaceY`: that is a
 * WALKING-surface query and deliberately clamps the rear circulation strip to the last row's tread, one
 * rise below the `bowlTop` the loft profile actually reaches there (see {@link buildBowl}'s profile).
 */
const bowlMassTopAt = (layout: Layout, z: number): number => {
  if (z >= layout.halfD - WALK) return layout.base
  const r = Math.floor((layout.halfD - WALK - z) / TREAD)
  return r >= layout.rows ? layout.bowlTop : treadY(layout, r)
}

/** Rafter top chord at `u`: 0 at the rear tie, 1 at the leading edge. */
const rafterAt = (layout: Layout, u: number): { z: number; y: number } => {
  const curl = Math.max(0, (u - TIP_U) / (1 - TIP_U))
  return {
    z: layout.zBack + (layout.zFront - layout.zBack) * u,
    y: layout.yBack
      + (layout.yFront - layout.yBack) * u
      + Math.sin(u * Math.PI) * ROOF_ARCH
      + curl * curl * ROOF_LIFT,
  }
}

/**
 * How far the fabric hangs below the rafter chord at `u` along the span and `v` across the bay. The
 * pull grows toward the leading edge, so one surface gives both a straight rafter line and a front
 * edge bayed into deep scallops between the rib tips.
 */
const membraneSag = (u: number, v: number): number =>
  -MEMBRANE_SAG * (0.1 + 0.9 * u ** 2.4) * Math.sin(Math.PI * Math.min(Math.max(v, 0), 1))

/** A point `drop` below the membrane soffit, on the bay running from `x0` to `x1`. */
const soffitAt = (
  layout: Layout, x0: number, x1: number, u: number, v: number, drop: number,
): Vector3 => {
  const station = rafterAt(layout, u)
  return new Vector3(x0 + (x1 - x0) * v, station.y + membraneSag(u, v) - drop, station.z)
}

/**
 * One fabric bay: pinned to the rafter either side and pulled down between them, so the leading edge
 * comes out scalloped rather than sawn off square. Swept across the bay rather than along the span,
 * because the scallop is what varies from rib to rib.
 */
const membranePanel = (layout: Layout, x0: number, x1: number): BufferGeometry => {
  const across = 11
  const along = 14
  const inset = 0.06
  const rings: Vector3[][] = []
  for (let i = 0; i < across; i++) {
    const v = (inset + ((x1 - x0 - inset * 2) * i) / (across - 1)) / (x1 - x0)
    const x = x0 + (x1 - x0) * v
    const upper: Vector3[] = []
    const lower: Vector3[] = []
    for (let k = 0; k <= along; k++) {
      const u = k / along
      const station = rafterAt(layout, u)
      const y = station.y + membraneSag(u, v)
      upper.push(new Vector3(x, y + 0.025, station.z))
      lower.push(new Vector3(x, y - 0.045, station.z))
    }
    lower.reverse()
    rings.push([...upper, ...lower])
  }
  return new LoftGeometry(rings, { closed: true, capStart: true, capEnd: true })
}

/** Rib stations for the tension web slung under one fabric bay. */
const WEB_U = [0.07, 0.22, 0.37, 0.52, 0.67, 0.82, 0.97] as const

/**
 * The web under one bay: transverse ribs chorded across the scallop, catenary runners down the span
 * that carry the pull, and a zig-zag brace between the two rafters. Without it the negative space
 * under the fabric reads as an empty box panel instead of a canopy.
 */
const bayWeb = (layout: Layout, x0: number, x1: number, flip: boolean): BufferGeometry[] => {
  const parts: BufferGeometry[] = []
  const at = (u: number, v: number, drop: number): Vector3 => soffitAt(layout, x0, x1, u, v, drop)

  for (const u of WEB_U) {
    for (let j = 0; j < 6; j++) {
      parts.push(member(at(u, j / 6, 0.082), at(u, (j + 1) / 6, 0.082), 0.024, 6))
    }
  }
  for (const [v, radius] of [[0.28, 0.019], [0.5, 0.026], [0.72, 0.019]] as const) {
    for (let k = 0; k < 10; k++) {
      parts.push(member(at(k / 10, v, 0.088), at((k + 1) / 10, v, 0.088), radius, 6))
    }
  }
  // Hem cable round the leading edge: the scallop has to read as pulled taut, not hung slack.
  for (let j = 0; j < 8; j++) {
    parts.push(member(at(1, j / 8, 0.012), at(1, (j + 1) / 8, 0.012), 0.028, 6))
  }
  // Hangers back to the head chord, so the lifted tip is tied down rather than floating.
  const head = rafterAt(layout, 1).y - EDGE_HEAD
  const chordZ = rafterAt(layout, 1).z - 0.07
  for (const v of [0.34, 0.66] as const) {
    const hem = at(1, v, 0.03)
    parts.push(member(hem, new Vector3(hem.x, head, chordZ), 0.019, 6))
  }
  // Flipping the zig-zag per bay breaks the mirror and reads as real bracing (rule 3).
  const braceDrop = (u: number): number => 0.16 + 0.3 * u * u
  for (let j = 0; j < WEB_U.length - 1; j++) {
    const even = (j % 2 === 0) === flip
    const a = WEB_U[j]!
    const c = WEB_U[j + 1]!
    parts.push(member(at(a, even ? 0 : 1, braceDrop(a)), at(c, even ? 1 : 0, braceDrop(c)), 0.021, 6))
    parts.push(member(at(c, 0, braceDrop(c)), at(c, 1, braceDrop(c)), 0.018, 6))
  }
  return parts
}

/** The arched rafters standing proud of the fabric, one per bay boundary. */
const roofRafters = (layout: Layout): BufferGeometry[] => {
  const parts: BufferGeometry[] = []
  const stations = 10
  for (const x of layout.columns) {
    for (let k = 0; k < stations; k++) {
      const a = rafterAt(layout, k / stations)
      const c = rafterAt(layout, (k + 1) / stations)
      parts.push(member(new Vector3(x, a.y, a.z), new Vector3(x, c.y, c.z), 0.072, 8))
    }
  }
  return parts
}

/** Tip beam, column head chord and rear tie — the three lines the whole canopy hangs between. */
const roofEdges = (layout: Layout): BufferGeometry[] => {
  const parts: BufferGeometry[] = []
  const front = rafterAt(layout, 1)
  const rear = rafterAt(layout, 0)
  const chordZ = front.z - 0.07
  const head = front.y - EDGE_HEAD
  parts.push(member(
    new Vector3(-layout.halfW, front.y - 0.1, chordZ),
    new Vector3(layout.halfW, front.y - 0.1, chordZ),
    0.048,
    10,
  ))
  parts.push(member(
    new Vector3(-layout.halfW, head, chordZ),
    new Vector3(layout.halfW, head, chordZ),
    0.058,
    10,
  ))
  parts.push(member(
    new Vector3(-layout.halfW, rear.y - 0.14, rear.z),
    new Vector3(layout.halfW, rear.y - 0.14, rear.z),
    0.055,
    8,
  ))
  for (const x of layout.columns) {
    parts.push(member(
      new Vector3(x, front.y - 0.1, chordZ),
      new Vector3(x, head, chordZ),
      0.036,
      6,
    ))
    parts.push(member(
      new Vector3(x, layout.bowlTop + 0.22, rear.z),
      new Vector3(x, rear.y - 0.16, rear.z),
      0.07,
      8,
    ))
  }
  return parts
}

/** The two seating blocks either side of the centre aisle. */
const blocks = (layout: Layout): ReadonlyArray<readonly [number, number]> => [
  [-layout.halfW, -AISLE / 2],
  [AISLE / 2, layout.halfW],
]

/**
 * One tip-up shell: a reclined back over a tilted pan, authored with its origin on the tread so a row is
 * a pure translation. The back holds its full 0.43 m width for most of its height and only relieves at
 * the very top — narrowing it lower turns a filled row into a rack of separate objects.
 */
const seatShell = (): BufferGeometry => {
  const back = bevelPrism(
    [
      [-0.185, -0.21], [0.185, -0.21],
      [0.215, -0.08], [0.215, 0.16],
      [0.175, 0.225], [-0.175, 0.225],
      [-0.215, 0.16], [-0.215, -0.08],
    ],
    0.055,
    0.013,
  )
  back.rotateX(-0.15)
  back.translate(0, 0.65, -0.12)

  const pan = bevelPrism(
    [
      [-0.205, -0.15], [0.205, -0.15],
      [0.205, 0.09], [0.16, 0.155],
      [-0.16, 0.155], [-0.205, 0.09],
    ],
    0.055,
    0.013,
  )
  pan.rotateX(Math.PI / 2 - 0.09)
  pan.translate(0, 0.44, 0.06)

  return mergeParts([back, pan], 'f1-grandstand-bay: seat shell')
}

/** The standard, pan bracket and back stay carrying one shell. */
const seatFrame = (): BufferGeometry => {
  const standard = bevelBox(0.13, 0.43, 0.1, 0.014)
  standard.translate(0, 0.215, -0.03)
  const bracket = bevelBox(0.3, 0.055, 0.07, 0.012)
  bracket.translate(0, 0.4, 0.03)
  return mergeParts(
    [
      standard,
      bracket,
      member(new Vector3(0, 0.39, -0.03), new Vector3(0, 0.71, -0.16), 0.022, 6),
      groundPad([0.2, 0.16], [0, 0, -0.03], 0.022),
    ],
    'f1-grandstand-bay: seat frame',
  )
}

const clampTierSupport = (value: TierSupport | undefined): TierSupport =>
  value === 'wall' || value === 'none' ? value : 'columns'

const clampRoofMode = (value: RoofMode | undefined): RoofMode =>
  value !== undefined && (ROOF_MODES as readonly string[]).includes(value) ? value : 'full'

const clampStairsMode = (value: StairsMode | undefined): StairsMode =>
  value !== undefined && (STAIRS_MODES as readonly string[]).includes(value) ? value : 'none'

/** `'ends'` is the documented alias — a bay that is a run end on BOTH sides carries both towers. */
const stairsModeToSide = (mode: StairsMode): StairSide => (mode === 'ends' ? 'both' : mode)

/**
 * Tier 0 stands on the ground and needs no tower; every tier above it falls back to `fallback` — the
 * resolved top-level `stairs` — unless this tier named a side of its own, which always wins.
 */
const clampStairSide = (
  value: StairSide | undefined, tier: number, fallback: StairSide,
): StairSide =>
  value !== undefined && (STAIR_SIDES as readonly string[]).includes(value)
    ? value
    : (tier >= 1 ? fallback : 'none')

/** Fills in every field of one tier's spec from its (possibly empty) partial input. */
const resolveTierSpec = (
  tier: number, rowsDefault: number, isTop: boolean, partial: Partial<TierSpec> | undefined,
  stairsFallback: StairSide,
): TierSpec => ({
  rows: Math.max(4, Math.round(partial?.rows ?? rowsDefault)),
  plinth: Math.max(0, partial?.plinth ?? DECK),
  lift: Math.max(0, partial?.lift ?? 0),
  overlapRows: Math.max(0, Math.round(partial?.overlapRows ?? OVERLAP_ROWS)),
  support: clampTierSupport(partial?.support),
  rearSupport: clampTierSupport(partial?.rearSupport),
  stairSide: clampStairSide(partial?.stairSide, tier, stairsFallback),
  // f1-stairs' own flight-width clamp, so a tower is never narrower than the flight it is built from.
  stairWidth: Math.min(2.8, Math.max(0.9, partial?.stairWidth ?? STAIR_WIDTH)),
  roof: partial?.roof ?? isTop,
})

/** Whether `side` (-1 = left / −X, +1 = right / +X) carries this tier's tower. */
const towerOnSide = (spec: TierSpec, side: -1 | 1): boolean =>
  spec.stairSide === 'both' || spec.stairSide === (side === 1 ? 'right' : 'left')

/**
 * Monotone-chain 2D convex hull, CCW. The collision proxy's bowl prism is the hull of a handful of
 * measured profile points (front skirt, promenade lip, last-row corner, rear wall) rather than a
 * hand-ordered polygon — a physics engine needs CONVEX, and hulling it is how that is guaranteed
 * instead of asserted, whatever `rows`/`plinth`/`wallTop` do to the profile.
 */
const convexHull2D = (
  input: ReadonlyArray<readonly [number, number]>,
): Array<readonly [number, number]> => {
  const points = [...input].sort((a, b) => (a[0] - b[0]) || (a[1] - b[1]))
  const cross = (
    o: readonly [number, number], a: readonly [number, number], b: readonly [number, number],
  ): number => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
  const half = (source: ReadonlyArray<readonly [number, number]>): Array<readonly [number, number]> => {
    const out: Array<readonly [number, number]> = []
    for (const point of source) {
      while (out.length >= 2 && cross(out[out.length - 2]!, out[out.length - 1]!, point) <= 1e-9) {
        out.pop()
      }
      out.push(point)
    }
    out.pop()
    return out
  }
  return [...half(points), ...half([...points].reverse())]
}

const resolveTiers = (config: F1GrandstandBayConfig): TierSpec[] => {
  const stairsFallback = stairsModeToSide(config.stairs)
  const specs: TierSpec[] = []
  for (let tier = 0; tier < config.tiers; tier++) {
    specs.push(resolveTierSpec(
      tier, config.rows, tier === config.tiers - 1, config.tierSpec?.[tier], stairsFallback,
    ))
  }
  return specs
}

/** `tiers` given as a count, or as the `tierSpec` array itself — resolves to both a clamped count and
 *  the tierSpec to store, `patch.tierSpec` (if also given) always winning over a tiers-as-array input. */
const resolveTiersInput = (
  tiers: F1GrandstandBayTiersInput, explicitTierSpec: ReadonlyArray<Partial<TierSpec>> | undefined,
): { tiers: number; tierSpec: ReadonlyArray<Partial<TierSpec>> | undefined } => {
  if (typeof tiers === 'number') {
    return {
      tiers: Math.min(MAX_TIERS, Math.max(MIN_TIERS, Math.round(tiers))),
      tierSpec: explicitTierSpec,
    }
  }
  const count = Math.min(MAX_TIERS, Math.max(MIN_TIERS, tiers.length))
  return { tiers: count, tierSpec: (explicitTierSpec ?? tiers).slice(0, count) }
}

/** One promenade the tower reaches — a tier's own walking level, in the model's local frame. */
interface TowerLevel {
  readonly tier: number
  readonly y: number
  readonly z: number
}

/**
 * One flight between two consecutive levels. STRAIGHT while the promenade-to-promenade step back is long
 * enough to swallow the run; FOLDED into two lanes about a turn landing otherwise — which is what a real
 * scaffold tower does the moment a tier step is taller than it is deep.
 *
 * The lane runs are not free. With the foot landing pinned to one promenade and the head landing to the
 * next, `runA - runB` is exactly the step back less one landing and `runA + runB` is the nominal run at
 * the FIA going, which fixes BOTH runs. So the free variable is the step SPLIT, chosen to keep each
 * lane's derived going as near f1-stairs' 280 mm as the geometry allows — rather than forcing 280 mm and
 * letting the tower miss the promenade it is supposed to land on. Rise stays uniform across both lanes.
 */
interface FlightPlan {
  readonly from: TowerLevel
  readonly to: TowerLevel
  readonly rise: number
  readonly folded: boolean
  readonly stepsA: number
  readonly goingA: number
  readonly runA: number
  readonly stepsB: number
  readonly goingB: number
  readonly runB: number
  /** Turn-landing centre (folded only; equals the head landing centre when straight). */
  readonly zTurn: number
  readonly zFront: number
  readonly zRear: number
}

const planFlight = (from: TowerLevel, to: TowerLevel): FlightPlan => {
  const dy = to.y - from.y
  const span = from.z - to.z
  if (dy <= 0) {
    throw new Error(
      `f1-grandstand-bay: stair tower flight to tier ${to.tier} does not climb `
      + `(${from.y.toFixed(3)}m -> ${to.y.toFixed(3)}m)`,
    )
  }
  if (span <= TOWER_LANDING) {
    throw new Error(
      `f1-grandstand-bay: stair tower flight to tier ${to.tier} has ${span.toFixed(3)}m of step-back to `
      + `land in, less than one landing (${TOWER_LANDING}m) — reduce overlapRows or add rows below`,
    )
  }
  const steps = Math.max(2, Math.ceil(dy / TOWER_RISE))
  const rise = dy / steps
  const nominal = steps * TOWER_RUN
  const straightRun = span - TOWER_LANDING
  // Fold only when it buys at least one going — otherwise the return lane is a single stranded step.
  if (nominal <= straightRun + TOWER_RUN) {
    return {
      from,
      to,
      rise,
      folded: false,
      stepsA: steps,
      goingA: straightRun / steps,
      runA: straightRun,
      stepsB: 0,
      goingB: 0,
      runB: 0,
      zTurn: to.z,
      zFront: from.z + TOWER_LANDING / 2,
      zRear: to.z - TOWER_LANDING / 2,
    }
  }
  const runA = (nominal + straightRun) / 2
  const runB = nominal - runA
  let stepsA = 1
  let best = Infinity
  for (let k = 1; k < steps; k++) {
    const error = Math.max(Math.abs(runA / k - TOWER_RUN), Math.abs(runB / (steps - k) - TOWER_RUN))
    if (error < best) {
      best = error
      stepsA = k
    }
  }
  const stepsB = steps - stepsA
  const zTurn = from.z - TOWER_LANDING - runA
  return {
    from,
    to,
    rise,
    folded: true,
    stepsA,
    goingA: runA / stepsA,
    runA,
    stepsB,
    goingB: runB / stepsB,
    runB,
    zTurn,
    zFront: from.z + TOWER_LANDING / 2,
    zRear: zTurn - TOWER_LANDING / 2,
  }
}

/**
 * The ENTRY flight: grade to tier 0's promenade. Every other flight is pinned at both ends by the two
 * promenades it joins, which is what makes {@link planFlight}'s runs derived rather than chosen. This one
 * is pinned at ONE end only — its head is tier 0's landing, its foot is wherever the ground is — so its
 * going is f1-stairs' own 280 mm exactly, and the free variable is instead WHICH EDGE of that landing it
 * meets and therefore which way it travels:
 *
 *   - `'rear'` — the default. A folded cage is two lanes wide and the tier 0 -> tier 1 flight leaves the
 *     rear edge on the OUTBOARD lane, so the inboard lane's rear is free all the way down to grade. The
 *     entry climbs forward (+Z) in it, switchbacking at tier 0's promenade into the flight above. That
 *     volume is already inside the cage — under the outboard lane, above nothing — so the cage, the
 *     footprint and the collision box do not move a millimetre.
 *   - `'front'` — the fallback for a cage whose flights all run STRAIGHT (one lane, which needs a step
 *     back longer than the climb: ~175 rows at the default overlap). That single lane's rear edge is
 *     taken, so the entry hangs off the landing's FRONT edge instead and the cage grows forward to cover
 *     it. {@link TowerPlan.zFront} carries that, so the collision box follows on its own.
 */
interface GroundFlightPlan {
  readonly steps: number
  readonly going: number
  readonly rise: number
  /** Lane centre the flight runs in. */
  readonly laneX: number
  /** Which edge of tier 0's landing the head meets — and so which way the flight travels. */
  readonly edge: 'front' | 'rear'
  /** z of the flight's own origin: its FOOT, on grade. */
  readonly footZ: number
  /** z where it meets the landing. */
  readonly headZ: number
  /** True when the flight climbs toward -Z (a `'front'` entry), matching {@link flightGeometry}'s turn. */
  readonly rearward: boolean
}

/** The cage: ONE per end face, serving every level any tier asked it to reach. */
interface TowerPlan {
  readonly side: -1 | 1
  readonly flightWidth: number
  readonly towerWidth: number
  /** The bay's own end face — where a landing has to reach, not where the cage starts. */
  readonly xFace: number
  readonly xInner: number
  readonly xOuter: number
  /** Lane against the bay (the straight lane, and a fold's upper lane, so its head lands at the gate). */
  readonly laneInnerX: number
  /** Outboard lane — a fold's lower, longer flight. */
  readonly laneOuterX: number
  readonly levels: readonly TowerLevel[]
  readonly flights: readonly FlightPlan[]
  /** Grade to tier 0's promenade — `null` only when tier 0 already walks at grade (`plinth: 0`). */
  readonly ground: GroundFlightPlan | null
  readonly zFront: number
  readonly zRear: number
  readonly topY: number
  /** Walking height at `z`, or `null` where the cage carries nothing — what sets each standard's head. */
  readonly envelopeY: (z: number) => number | null
}

const planTower = (
  side: -1 | 1, flightWidth: number, levels: readonly TowerLevel[], halfW: number,
): TowerPlan => {
  const flights: FlightPlan[] = []
  for (let i = 1; i < levels.length; i++) flights.push(planFlight(levels[i - 1]!, levels[i]!))
  const folded = flights.some((flight) => flight.folded)
  // The lane's true envelope, not its nominal width — see FLIGHT_PROUD.
  const lane = flightWidth + 2 * FLIGHT_PROUD
  const towerWidth = folded ? 2 * lane + STAIR_GAP : lane
  const xInner = side * (halfW + TOWER_GAP)
  const xOuter = xInner + side * towerWidth

  // The entry flight. Its head is the LOWEST level the cage serves — tier 0's promenade — and its foot is
  // grade, so the bottom bays of the cage carry a stair instead of standing as an empty braced shaft.
  const foot = levels[0]!
  let ground: GroundFlightPlan | null = null
  // Only when the cage's lowest level IS tier 0. A cage asked to serve tiers 1 and 2 alone is a cage
  // whose bottom is reached some other way — running an entry flight from grade to a promenade seven
  // metres up would invent circulation nobody asked for.
  if (foot.tier === 0 && foot.y > 1e-6) {
    const steps = Math.max(2, Math.ceil(foot.y / TOWER_RISE))
    const run = steps * TOWER_RUN
    // A folded cage has a spare lane at the foot landing's rear; a straight one does not — see
    // {@link GroundFlightPlan}.
    const edge = folded ? 'rear' : 'front'
    const headZ = foot.z + (edge === 'rear' ? -TOWER_LANDING / 2 : TOWER_LANDING / 2)
    ground = {
      steps,
      going: TOWER_RUN,
      rise: foot.y / steps,
      laneX: xInner + (side * lane) / 2,
      edge,
      footZ: edge === 'rear' ? headZ - run : headZ + run,
      headZ,
      rearward: edge === 'front',
    }
  }

  const segments: Array<{ z0: number; z1: number; y0: number; y1: number }> = []
  const add = (za: number, ya: number, zb: number, yb: number): void => {
    segments.push(za <= zb ? { z0: za, z1: zb, y0: ya, y1: yb } : { z0: zb, z1: za, y0: yb, y1: ya })
  }
  for (const level of levels) {
    add(level.z - TOWER_LANDING / 2, level.y, level.z + TOWER_LANDING / 2, level.y)
  }
  // The entry flight is a cage segment like any other: it is what decides whether the cage has to reach
  // past the level landings to cover it, and therefore whether `zFront`/`zRear` — and with them the
  // collision box — move at all. A `'rear'` entry tucks under an existing lane and moves neither.
  if (ground) add(ground.footZ, 0, ground.headZ, foot.y)
  for (const flight of flights) {
    const footZ = flight.from.z - TOWER_LANDING / 2
    const turnY = flight.from.y + flight.stepsA * flight.rise
    add(footZ, flight.from.y, footZ - flight.runA, turnY)
    if (flight.folded) {
      add(flight.zTurn - TOWER_LANDING / 2, turnY, flight.zTurn + TOWER_LANDING / 2, turnY)
      add(flight.zTurn + TOWER_LANDING / 2, turnY, flight.to.z + TOWER_LANDING / 2, flight.to.y)
    }
  }

  let zFront = -Infinity
  let zRear = Infinity
  for (const segment of segments) {
    zFront = Math.max(zFront, segment.z1)
    zRear = Math.min(zRear, segment.z0)
  }
  let topWalk = -Infinity
  for (const level of levels) topWalk = Math.max(topWalk, level.y)

  return {
    side,
    flightWidth,
    towerWidth,
    xFace: side * halfW,
    xInner,
    xOuter,
    laneInnerX: xInner + (side * lane) / 2,
    laneOuterX: xOuter - (side * lane) / 2,
    levels,
    flights,
    ground,
    zFront,
    zRear,
    topY: topWalk + STAIRS.railH + TOWER_HEAD,
    envelopeY: (z: number): number | null => {
      let best: number | null = null
      for (const segment of segments) {
        if (z < segment.z0 - 1e-6 || z > segment.z1 + 1e-6) continue
        const t = segment.z1 - segment.z0 < 1e-9
          ? 0
          : (z - segment.z0) / (segment.z1 - segment.z0)
        const y = segment.y0 + (segment.y1 - segment.y0) * t
        best = best === null ? y : Math.max(best, y)
      }
      return best
    },
  }
}

/**
 * One flight in a LOCAL frame: origin on the bottom landing's surface, travelling +Z and climbing. Built
 * from f1-stairs' OWN tread pan, stringer stations and channel stringer at this flight's derived going,
 * so the stand's access stair and the catalogue's FIA flight are literally the same part.
 *
 * Guarding follows f1-stairs exactly — top rail, midrail, posts, toe board AND its three pickets per post
 * bay. A first cut dropped the pickets on a triangle budget; against the reference that was the wrong
 * trade. A real stair's raking edge is nearly solid (close-pitched balusters or perforated mesh), and it
 * is that dense bright band, not the tube, that keeps the flight's silhouette off the bowl behind it.
 */
const flightGeometry = (
  steps: number, going: number, rise: number, width: number, underslung = true,
): {
  readonly treads: BufferGeometry[]
  readonly frame: BufferGeometry[]
  readonly rails: BufferGeometry[]
} => {
  const treads: BufferGeometry[] = []
  const frame: BufferGeometry[] = []
  const rails: BufferGeometry[] = []
  const runLen = steps * going
  const riseH = steps * rise
  const hyp = Math.hypot(going, rise) * steps
  const ang = Math.atan2(rise, going)
  const hz = width / 2

  for (let i = 0; i < steps; i++) {
    const z = (i + 0.5) * going
    const y = (i + 0.5) * rise
    treads.push(...gratingTread(width - 0.08, y, z))
    const kick = bevelBox(width - 0.14, 0.038, 0.018, 0.003)
    kick.translate(0, y - rise / 2 + 0.028, z + going / 2 - 0.03)
    treads.push(kick)
  }

  for (const sx of stringerStations(width)) {
    frame.push(...channelStringer(sx, hyp, ang, riseH, runLen))
    // f1-stairs' 220 mm channel is sized for a catalogue flight of a couple of metres. A tower flight
    // here spans seven or eight, and at that length the channel alone reads as a ladder stringer rather
    // than as something carrying a stair — so each stringer gets a raking bottom chord and a web between
    // the two, which is how a long scaffold flight is actually made up.
    //
    // `underslung: false` drops that trussing for the GROUND flight alone. It is not a budget cut: the
    // chord hangs `STAIRS.stringer + 0.24` BELOW the flight's own datum, and the ground flight's datum
    // is grade — so trussing it would bury half a metre of steel in the dirt. A short entry flight is
    // exactly the couple of metres the catalogue channel was sized for, so the channel alone is right.
    if (!underslung) continue
    const drop = STAIRS.stringer + 0.24
    frame.push(member(
      new Vector3(sx, -drop, 0.06),
      new Vector3(sx, riseH - drop, runLen - 0.06),
      0.042,
      8,
    ))
    const panels = Math.max(2, Math.round(runLen / 1.6))
    for (let p = 0; p <= panels; p++) {
      const t = p / panels
      const z = 0.06 + t * (runLen - 0.12)
      const chord = t * riseH - drop
      const web = t * riseH - STAIRS.stringer / 2 - 0.03
      frame.push(member(new Vector3(sx, chord, z), new Vector3(sx, web, z), 0.024, 6))
      if (p >= panels) continue
      const t1 = (p + 1) / panels
      frame.push(member(
        new Vector3(sx, chord, z),
        new Vector3(sx, t1 * riseH - STAIRS.stringer / 2 - 0.03, 0.06 + t1 * (runLen - 0.12)),
        0.019,
        6,
      ))
    }
  }

  const posts = Math.max(3, Math.ceil(runLen / 1.5))
  for (const sx of [-hz + 0.03, hz - 0.03] as const) {
    for (const [height, radius] of [[STAIRS.railH, 0.024], [STAIRS.midH, 0.016]] as const) {
      rails.push(member(
        new Vector3(sx, rise / 2 + height, 0.04),
        new Vector3(sx, riseH - rise / 2 + height, runLen - 0.04),
        radius,
        8,
      ))
    }
    for (let p = 0; p <= posts; p++) {
      const t = p / posts
      const z = 0.04 + t * (runLen - 0.08)
      const yTread = rise / 2 + t * (riseH - rise)
      rails.push(member(
        new Vector3(sx, yTread + 0.02, z),
        new Vector3(sx, yTread + STAIRS.railH, z),
        STAIRS.post / 2,
        6,
      ))
      if (p >= posts) continue
      for (let k = 1; k <= 3; k++) {
        const tk = t + (k / 4) * (1 / posts)
        const zk = 0.04 + tk * (runLen - 0.08)
        const yk = rise / 2 + tk * (riseH - rise)
        rails.push(member(
          new Vector3(sx, yk + STAIRS.midH, zk),
          new Vector3(sx, yk + STAIRS.railH - 0.02, zk),
          0.007,
          6,
        ))
      }
    }
    const toe = bevelBox(0.024, STAIRS.toe, hyp - 0.12, 0.003)
    toe.rotateX(-ang)
    toe.translate(sx, riseH / 2 + STAIRS.toe / 2, runLen / 2)
    frame.push(toe)
  }

  return { treads, frame, rails }
}

export function createModel(options: F1GrandstandBayOptions = {}): F1GrandstandBayInstance {
  const tiersInput = resolveTiersInput(options.tiers ?? defaults.tiers, options.tierSpec)
  const config: F1GrandstandBayConfig = {
    rows: Math.max(4, Math.round(options.rows ?? defaults.rows)),
    width: Math.max(4, options.width ?? defaults.width),
    tiers: tiersInput.tiers,
    roof: clampRoofMode(options.roof),
    stairs: clampStairsMode(options.stairs),
    tierSpec: tiersInput.tierSpec,
  }

  const bundle = acquireF1Materials()
  const kit = bundle.materials
  const extras: Material[] = []
  const own = (material: Material): Material => {
    extras.push(material)
    return material
  }
  /**
   * Three values the shared bundle does not carry, each derived from its own token and each constructed
   * only when the consumer has not supplied that slot (rule 16). GRAPHITE-800 straight puts the frame a
   * shade off black, which is where the roof steel was disappearing; COBALT-500 straight is a signal
   * blue rather than upholstery, and needs taking well down because a diffuse albedo gains most of a
   * stop under this rig; and SHELL-200 without an emissive term has no soffit at all.
   *
   * The bowl keeps the bundle's `slate`. Its metalness is what holds cast concrete at a mid value here —
   * authored as a pure diffuse it gains the same stop the seats do and washes out to near-white, and the
   * step mass against the airy canopy is the contrast this model is carried by.
   */
  const materialSlots: Record<Slot, Material> = {
    structure: options.materials?.structure ?? own(new MeshStandardMaterial({
      name: 'f1-kit / grandstand steel',
      color: shade(TOKEN.GRAPHITE_800, 0.3),
      roughness: 0.44,
      metalness: 0.55,
    })),
    deck: options.materials?.deck ?? kit.slate,
    seat: options.materials?.seat ?? own(new MeshStandardMaterial({
      name: 'f1-kit / grandstand seat',
      color: shade(TOKEN.COBALT_500, -0.5),
      roughness: 0.7,
      metalness: 0.04,
    })),
    // Tensioned PVC is translucent: in the reference the soffit is lit by the sun coming through the
    // fabric, not by bounce off the bowl. A standard material cannot transmit, so the emissive carries
    // that light instead — without it the underside faces away from every lamp in the rig and the canopy
    // reads as a hole with a web strung across it.
    roof: options.materials?.roof ?? own(new MeshStandardMaterial({
      name: 'f1-kit / grandstand membrane',
      color: TOKEN.SHELL_200,
      roughness: 0.62,
      metalness: 0.04,
      emissive: shade(TOKEN.SHELL_200, -0.24),
      emissiveIntensity: 0.5,
    })),
    fascia: options.materials?.fascia ?? kit.red,
  }

  /**
   * The proxy's own skin — never a consumer slot, because the proxy is not part of the model's look. Held
   * translucent and unlit-bright so a debug capture shows the volume THROUGH the geometry it stands for;
   * `depthWrite: false` keeps it from punching holes in the model it is overlaid on.
   */
  const proxy = own(new MeshStandardMaterial({
    name: 'f1-kit / grandstand collision proxy',
    color: TOKEN.CYAN_400,
    emissive: shade(TOKEN.CYAN_400, -0.45),
    emissiveIntensity: 0.9,
    roughness: 1,
    metalness: 0,
    transparent: true,
    opacity: 0.34,
    depthWrite: false,
    // Both faces: a volume seen from behind the geometry it stands for has only back faces facing the
    // camera, and single-sided it would silently disappear on exactly the tiers furthest from the lens.
    side: DoubleSide,
  }))

  const root = new Group()
  root.name = 'f1-grandstand-bay'
  const bowl = new Group(); bowl.name = 'bowl'
  const roof = new Group(); roof.name = 'roof'
  root.add(bowl, roof)
  // Detached by default — see {@link buildCollision}. `debug.collision` is what parents it.
  const collision = new Group()
  collision.name = 'collision'
  collision.visible = false
  collision.userData.topologyRole = 'detail'
  collision.userData.excludeFromExport = true

  let footprint: F1GrandstandBayFootprint = {
    width: config.width, totalWidth: config.width, left: 0, right: 0,
  }
  let collisionVolumes: readonly F1GrandstandBayCollisionVolume[] = []

  const generated: BufferGeometry[] = []
  const meshesBySlot: Record<Slot, Mesh[]> = {
    structure: [], deck: [], seat: [], roof: [], fascia: [],
  }

  const releaseGenerated = (): void => {
    for (const group of [bowl, roof, collision]) group.clear()
    for (const geometry of generated) geometry.dispose()
    generated.length = 0
    for (const slot of Object.keys(meshesBySlot) as Slot[]) meshesBySlot[slot].length = 0
  }

  const emit = (
    slot: Slot,
    geometry: BufferGeometry,
    group: Group,
    name: string,
    material?: Material,
  ): void => {
    generated.push(geometry)
    const mesh = new Mesh(geometry, material ?? materialSlots[slot])
    mesh.name = name
    mesh.userData.topologyRole = name === 'seats' ? 'scatter' : name.includes('fascia') || name.includes('board') ? 'detail' : 'hull'
    mesh.castShadow = true
    mesh.receiveShadow = true
    meshesBySlot[slot].push(mesh)
    group.add(mesh)
  }

  const instance = (
    slot: Slot,
    geometry: BufferGeometry,
    matrices: readonly Matrix4[],
    name: string,
    group: Group,
  ): void => {
    generated.push(geometry)
    const mesh = new InstancedMesh(geometry, materialSlots[slot], matrices.length)
    mesh.name = name
    mesh.castShadow = true
    mesh.receiveShadow = true
    for (let i = 0; i < matrices.length; i++) mesh.setMatrixAt(i, matrices[i]!)
    mesh.instanceMatrix.needsUpdate = true
    meshesBySlot[slot].push(mesh)
    group.add(mesh)
  }

  /**
   * A straight guard rail: one top-rail member from `foot` to `head`, plus baluster posts standing on
   * `floorAt(t)` at each of `postsCount` stations along the run (`t` runs 0 at `foot` to 1 at `head`).
   * Shared by the central gangway and the inter-tier stairs so both read as the same fabricated product.
   */
  const buildRail = (
    foot: Vector3, head: Vector3, postsCount: number, floorAt: (t: number) => number,
  ): BufferGeometry[] => {
    const parts: BufferGeometry[] = [member(foot, head, 0.028, 8)]
    for (let p = 0; p <= postsCount; p++) {
      const t = p / postsCount
      const x = foot.x + (head.x - foot.x) * t
      const y = foot.y + (head.y - foot.y) * t
      const z = foot.z + (head.z - foot.z) * t
      parts.push(member(new Vector3(x, floorAt(t) - 0.04, z), new Vector3(x, y, z), 0.022, 6))
    }
    return parts
  }

  /**
   * The raked mass: front skirt, promenade, tiers, rear return — one closed section swept across. Its
   * profile starts and ends at LOCAL y = 0 (front-bottom and rear-bottom corners), and because the loft
   * is closed the implicit edge joining those two points is a flat plane at y = 0 spanning the WHOLE
   * depth — this tier's own underside, flat front to rear, is what a stacked tier above cantilevers over
   * and what a `support` column's head meets (see `buildFrontSupport`).
   * `wallTop` overrides the rear-wall height (local, this tier's own origin) — used to stretch a
   * non-top tier's rear wall up to the tier stacked above it, so the concourse void underneath is
   * closed rather than see-through. Left undefined (the top/only tier) it is the original parapet.
   */
  const buildBowl = (layout: Layout, group: Group, wallTop?: number): void => {
    const profile: Array<readonly [number, number]> = [
      [layout.halfD, 0],
      [layout.halfD, layout.base - 0.12],
      [layout.halfD - 0.12, layout.base],
      [layout.halfD - WALK, layout.base],
      [layout.halfD - WALK, layout.base + NOSE],
    ]
    for (let r = 0; r < layout.rows; r++) {
      const y = treadY(layout, r)
      const back = treadBack(layout, r)
      profile.push([back, y], [back, y + RISE])
    }
    profile.push([-layout.halfD, layout.bowlTop], [-layout.halfD, 0])
    emit('deck', loftAlongX(profile, layout.width, { closed: true }), group, 'bowl')

    const wallH = wallTop ?? layout.bowlTop + 0.62
    const rear = bevelBox(layout.width, wallH, 0.5, 0.03)
    rear.translate(0, wallH / 2, -layout.halfD - 0.24)
    emit('deck', rear, group, 'rear-wall')
  }

  const buildSeating = (layout: Layout, group: Group): void => {
    const across = Math.max(6, Math.floor(layout.width / SEAT_PITCH))
    const pitch = layout.width / across
    const matrices: Matrix4[] = []
    for (let r = 0; r < layout.rows; r++) {
      const y = treadY(layout, r)
      const z = treadBack(layout, r) + 0.3
      for (let s = 0; s < across; s++) {
        const x = -layout.halfW + (s + 0.5) * pitch
        if (Math.abs(x) < AISLE / 2 + 0.04) continue
        matrices.push(new Matrix4().makeTranslation(x, y, z))
      }
    }
    instance('seat', seatShell(), matrices, 'seats', group)
    instance('structure', seatFrame(), matrices, 'seat-frames', group)
  }

  /** Centre flight: half-tier pads make a 0.44 m tier walkable at 0.22 m a step. */
  const buildAisle = (layout: Layout, group: Group): void => {
    const steps: BufferGeometry[] = []
    for (let r = 0; r < layout.rows; r++) {
      const pad = bevelBox(AISLE, RISE / 2 + 0.02, TREAD / 2, 0.012)
      pad.translate(0, treadY(layout, r) + RISE / 4 - 0.01, treadBack(layout, r) + TREAD / 4)
      steps.push(pad)
    }
    // The step up from the promenade is a full 0.75 m, so it gets its own pair of risers.
    for (let s = 0; s < 2; s++) {
      const h = (NOSE / 2) * (s + 1)
      const kerb = bevelBox(AISLE, h, TREAD / 2, 0.012)
      kerb.translate(0, layout.base + h / 2, layout.halfD - WALK + TREAD / 4 - (s * TREAD) / 2)
      steps.push(kerb)
    }
    const landing = bevelBox(AISLE, 0.06, WALK, 0.012)
    landing.translate(0, layout.base + 0.02, layout.halfD - WALK / 2)
    steps.push(landing)
    emit('deck', mergeParts(steps, 'f1-grandstand-bay: aisle steps'), group, 'aisle-steps')

    const railFoot = new Vector3(0, layout.base + 1.06, layout.halfD - WALK + 0.2)
    const railHead = new Vector3(0, layout.bowlTop + 0.86, treadBack(layout, layout.rows - 1) + 0.25)
    const posts = Math.max(3, Math.ceil(layout.rows / 2))
    const rails: BufferGeometry[] = []
    for (const sx of [-1, 1] as const) {
      const x = (sx * AISLE) / 2
      const foot = new Vector3(x, railFoot.y, railFoot.z)
      const head = new Vector3(x, railHead.y, railHead.z)
      rails.push(...buildRail(foot, head, posts, (t) => surfaceY(layout, foot.z + (head.z - foot.z) * t)))
    }
    emit('structure', mergeParts(rails, 'f1-grandstand-bay: gangway'), group, 'central-gangway')
  }

  /** Amber step marking on every tier edge and every aisle half-step. */
  const buildNosings = (layout: Layout, group: Group): void => {
    const parts: BufferGeometry[] = []
    for (let r = 0; r < layout.rows; r++) {
      const y = treadY(layout, r)
      const edge = treadBack(layout, r) + TREAD
      for (const [x0, x1] of blocks(layout)) {
        const nose = bevelBox(x1 - x0, 0.028, 0.075, 0.007)
        nose.translate((x0 + x1) / 2, y + 0.013, edge - 0.05)
        parts.push(nose)
      }
      const step = bevelBox(AISLE, 0.028, 0.075, 0.007)
      step.translate(0, y + RISE / 2 + 0.013, treadBack(layout, r) + TREAD / 2 - 0.05)
      parts.push(step)
    }
    // Promenade lip. Once the hoarding is only a band the walk behind it is on show, and an unmarked
    // slab edge is the one thing that would still give it away as a slab.
    const lip = bevelBox(layout.width, 0.026, 0.08, 0.007)
    lip.translate(0, layout.base + 0.01, layout.halfD - 0.17)
    parts.push(lip)
    emit('structure', mergeParts(parts, 'f1-grandstand-bay: nosings'), group, 'nosings', kit.amber)
  }

  /**
   * The promenade edge: an advertising band, an open guard-rail void over it, and the debris fence raked
   * back above both. The hoarding used to climb the full 0.95 m from the deck to the fence, which welded
   * it to the plinth below into a single continuous two-metre slab and shut the undercroft down. Held to
   * a band, the void above it puts the walk strip and the row-1 riser on show, so the frontage carries
   * promenade depth instead of a face.
   */
  const buildFrontage = (layout: Layout, group: Group): void => {
    const z = layout.halfD + 0.07
    const base = layout.base + 0.09
    const top = base + HOARD_H
    const railHead = layout.base + RAIL_H
    const frame: BufferGeometry[] = []
    const panels: BufferGeometry[] = []

    for (const y of [base, top] as const) {
      const rail = bevelBox(layout.width, 0.1, 0.2, 0.02)
      rail.translate(0, y, z)
      frame.push(rail)
    }
    // The rail the promenade is actually fenced to, a void's height clear of the hoarding it caps.
    const head = bevelBox(layout.width, 0.085, 0.17, 0.02)
    head.translate(0, railHead, z)
    frame.push(head)
    // Posts run past the hoarding to the head rail, so the void reads as framed rather than as absence.
    for (const x of layout.columns) {
      const post = bevelBox(0.1, railHead - base, 0.18, 0.02)
      post.translate(x, (base + railHead) / 2, z - 0.01)
      frame.push(post)
    }
    for (let b = 0; b < layout.columns.length - 1; b++) {
      const x0 = layout.columns[b]!
      const x1 = layout.columns[b + 1]!
      const panel = bevelBox(x1 - x0 - 0.13, HOARD_H - 0.14, 0.07, 0.014)
      panel.translate((x0 + x1) / 2, base + HOARD_H / 2, z - 0.055)
      panels.push(panel)
    }

    // The walk the void exposes: dark anti-slip decking laid over the cast promenade, biting into it
    // rather than floating a hair over it (rule 8). At the concrete's own value it disappears, and the
    // void reads as a gap in a face instead of a walkway seen behind a rail.
    const strip = bevelBox(layout.width - 0.16, 0.05, WALK - 0.42, 0.012)
    strip.translate(0, layout.base + 0.02, layout.halfD - WALK / 2 - 0.04)
    emit('deck', strip, group, 'promenade-strip', kit.graphite)

    // Fence posts sit mid-bay so a tiled run never doubles one up on a seam.
    const fenceTop = railHead + 1.55
    const count = Math.max(3, Math.ceil(layout.width / 1.7))
    for (let p = 0; p < count; p++) {
      const x = -layout.halfW + (p + 0.5) * (layout.width / count)
      frame.push(member(new Vector3(x, railHead, z), new Vector3(x, fenceTop, z - 0.18), 0.035, 6))
    }
    for (const t of [0.34, 0.67, 1] as const) {
      const y = railHead + (fenceTop - railHead) * t
      frame.push(member(
        new Vector3(-layout.halfW, y, z - 0.18 * t),
        new Vector3(layout.halfW, y, z - 0.18 * t),
        0.022,
        6,
      ))
    }

    emit('structure', mergeParts(frame, 'f1-grandstand-bay: frontage'), group, 'frontage')
    emit('structure', mergeParts(panels, 'f1-grandstand-bay: hoarding'), group, 'hoarding', kit.ink)
  }

  /**
   * Scalloped membrane bays clamped between arched rafters that stand proud of the fabric, each one over
   * its own tension web. One lofted slab is what made this read as a shed.
   */
  const buildRoof = (layout: Layout, group: Group): void => {
    const membrane: BufferGeometry[] = []
    const frame: BufferGeometry[] = []
    for (let b = 0; b < layout.columns.length - 1; b++) {
      const x0 = layout.columns[b]!
      const x1 = layout.columns[b + 1]!
      membrane.push(membranePanel(layout, x0, x1))
      frame.push(...bayWeb(layout, x0, x1, b % 2 === 0))
    }
    frame.push(...roofRafters(layout), ...roofEdges(layout))

    emit('roof', mergeParts(membrane, 'f1-grandstand-bay: membrane'), group, 'roof')
    emit('structure', mergeParts(frame, 'f1-grandstand-bay: roof frames'), group, 'roof-frames')
  }

  /**
   * The slender front columns that carry the cantilever — the reference's strongest vertical rhythm.
   *
   * `frame` only exists for the section-spanning canopy ({@link buildFullCanopy}), whose group sits at
   * the TOP tier's origin while its columns still stand on true ground in front of TIER 0 and still tie
   * back to TIER 0's promenade. Omitted — every single-tier and per-tier roof — the three values are the
   * literals this function always used, so nothing about that path moves a bit.
   */
  const buildColumns = (
    layout: Layout,
    group: Group,
    frame?: { readonly groundY: number; readonly tieY: number; readonly tieZ: number },
  ): void => {
    const front = rafterAt(layout, 1)
    const knee = rafterAt(layout, 0.76)
    const z = front.z - 0.07
    const groundY = frame?.groundY ?? 0
    const tieY = frame?.tieY ?? layout.base + 0.92
    const tieZ = frame?.tieZ ?? layout.halfD
    const parts: BufferGeometry[] = []
    for (const x of layout.columns) {
      const head = front.y - EDGE_HEAD
      parts.push(member(new Vector3(x, groundY, z), new Vector3(x, head, z), 0.095, 10))
      parts.push(groundPad([0.36, 0.36], [x, groundY, z], 0.035))
      parts.push(member(
        new Vector3(x, head - 1.4, z),
        new Vector3(x, knee.y - 0.22, knee.z),
        0.045,
        6,
      ))
      parts.push(member(
        new Vector3(x, tieY, z),
        new Vector3(x, tieY, tieZ),
        0.04,
        6,
      ))
    }
    emit('structure', mergeParts(parts, 'f1-grandstand-bay: columns'), group, 'columns')
  }

  /**
   * Sponsor fascia hung off the back of the column head, a third of a metre behind the membrane tip and
   * a metre below it. Set proud of the tip it becomes the silhouette; set back, it is depth trim under a
   * canopy edge that leads.
   */
  const buildFascia = (layout: Layout, group: Group): void => {
    const front = rafterAt(layout, 1)
    const z = front.z - 0.34
    const top = front.y - EDGE_HEAD - 0.04
    const frame: BufferGeometry[] = []
    const faces: BufferGeometry[] = []

    for (const y of [top, top - FASCIA_H] as const) {
      const rail = bevelBox(layout.width, 0.075, 0.15, 0.018)
      rail.translate(0, y, z)
      frame.push(rail)
    }
    for (const x of layout.columns) {
      const mullion = bevelBox(0.08, FASCIA_H, 0.12, 0.016)
      mullion.translate(x, top - FASCIA_H / 2, z - 0.015)
      frame.push(mullion)
      for (const y of [top, top - FASCIA_H] as const) {
        frame.push(member(
          new Vector3(x, y, z),
          new Vector3(x, y + (y === top ? 0.06 : -0.02), front.z - 0.07),
          0.026,
          6,
        ))
      }
    }
    for (let b = 0; b < layout.columns.length - 1; b++) {
      const x0 = layout.columns[b]!
      const x1 = layout.columns[b + 1]!
      const face = bevelBox(x1 - x0 - 0.11, FASCIA_H - 0.1, 0.05, 0.012)
      face.translate((x0 + x1) / 2, top - FASCIA_H / 2, z - 0.04)
      faces.push(face)
    }

    emit('structure', mergeParts(frame, 'f1-grandstand-bay: fascia frame'), group, 'fascia-frame')
    emit('fascia', mergeParts(faces, 'f1-grandstand-bay: fascia'), group, 'fascia-board')
  }

  /**
   * Intermediate props under a section-spanning canopy. The leading-edge column line alone would leave a
   * whole-section rafter unsupported across its middle — twenty metres of span on one pair of ties — so
   * every tier BELOW the top carries a column line of its own, standing on THAT tier's promenade, on the
   * roof's own BAY pitch (so a prop lands under a rafter rather than between two) and reaching the
   * rafter's underside above it.
   *
   * Every foot is COMPUTED through `surfaceY` and asserted to be the promenade, exactly as a tier
   * support's is — a prop is never assumed to land on something. The central-gangway stations are skipped
   * on the same clear-width test `buildSeating` keeps seats out of the aisle with: a prop planted in the
   * gangway is a prop planted in the only way out.
   *
   * Emitted in the model's OWN frame into `roof` (which is at identity), because a prop line spans from
   * one tier's deck to another tier's canopy and belongs to neither group.
   */
  const buildCanopyProps = (
    canopy: Layout,
    origin: { readonly oy: number; readonly oz: number },
    layouts: readonly Layout[],
    origins: ReadonlyArray<{ readonly oy: number; readonly oz: number }>,
  ): void => {
    const parts: BufferGeometry[] = []
    const span = canopy.zFront - canopy.zBack
    for (let tier = 0; tier < layouts.length - 1; tier++) {
      const layout = layouts[tier]!
      const lower = origins[tier]!
      const zLocal = layout.halfD - PROP_INSET
      const footY = lower.oy + surfaceY(layout, zLocal)
      if (Math.abs(footY - (lower.oy + layout.base)) > 1e-9) {
        throw new Error(
          `f1-grandstand-bay: canopy prop for tier ${tier} landed at ${footY.toFixed(3)}m, not on that `
          + `tier's promenade (${(lower.oy + layout.base).toFixed(3)}m)`,
        )
      }
      const zWorld = lower.oz + zLocal
      const u = (zWorld - (origin.oz + canopy.zBack)) / span
      if (u <= 0 || u >= 1) {
        throw new Error(
          `f1-grandstand-bay: canopy prop for tier ${tier} stands at z=${zWorld.toFixed(3)}m, outside the `
          + `canopy's own span`,
        )
      }
      const headY = origin.oy + rafterAt(canopy, u).y - PROP_HEAD
      if (headY <= footY) {
        throw new Error(
          `f1-grandstand-bay: canopy prop for tier ${tier} does not reach up `
          + `(${footY.toFixed(3)}m -> ${headY.toFixed(3)}m)`,
        )
      }
      const heads: Vector3[] = []
      for (const x of canopy.columns) {
        if (Math.abs(x) < AISLE / 2 + 0.04) continue
        parts.push(member(new Vector3(x, footY, zWorld), new Vector3(x, headY, zWorld), 0.095, 10))
        parts.push(groundPad([0.36, 0.36], [x, footY, zWorld], 0.035))
        heads.push(new Vector3(x, headY, zWorld))
      }
      // Head chord tying the line together — the same gauge the leading edge's own tip beam runs at.
      for (let i = 0; i < heads.length - 1; i++) parts.push(member(heads[i]!, heads[i + 1]!, 0.048, 10))
    }
    if (parts.length === 0) return
    emit('structure', mergeParts(parts, 'f1-grandstand-bay: canopy props'), roof, 'canopy-props')
  }

  /**
   * The SECTION-spanning canopy — `roof: 'full'`, the default, and the fix for "the canopy up top doesn't
   * extend over the whole section like it does for rows 24 tiers 1".
   *
   * ONE membrane for the whole stand: the rear tie stays exactly where the top tier's own roof tied it
   * (that tier's `bowlTop + ROOF_CLEAR`, at `zBack`), and the leading edge runs all the way out to TIER
   * 0's `halfD + ROOF_FRONT` — the same line a single-tier bay's roof leads at. So the profile reads as
   * one rafter falling ROOF_FALL from the rear tie to the front, then the TIP_U curl opening the canopy
   * out over the track, which is the rows-24 single-tier silhouette at three-tier height.
   *
   * NOTHING is forked to do it. `rafterAt` / `membranePanel` / `bayWeb` / `roofRafters` / `roofEdges` /
   * `buildRoof` / `buildColumns` / `buildFascia` are all parameterised by the layout's
   * `zBack`/`zFront`/`yBack`/`yFront`, so the canopy is literally the TOP tier's layout with `zFront`
   * pushed forward. `tiers: 1` takes the early return — today's three calls on today's layout object, in
   * today's order — which is what keeps a single-tier bay byte-identical.
   *
   * CLEARANCE. A longer span is a longer chance to dip: the straight rafter line is checked against every
   * tier's exposed mass top (`bowlMassTopAt`) at CLEAR_SAMPLES stations across the depth that tier
   * actually shows to the sky, and `yFront` is RAISED until the whole line clears `ROOF_CLEAR`. Raising
   * the front only opens the canopy further toward the track, so ROOF_FALL/TIP_U/ROOF_LIFT semantics
   * survive; a solve that would push the leading edge ABOVE its own rear tie means the stack is wrong,
   * not the roof, and throws.
   */
  const buildFullCanopy = (
    layouts: readonly Layout[],
    origins: ReadonlyArray<{ readonly oy: number; readonly oz: number }>,
  ): void => {
    const top = layouts.length - 1
    const topLayout = layouts[top]!
    if (top === 0) {
      buildRoof(topLayout, roof)
      buildColumns(topLayout, roof)
      buildFascia(topLayout, roof)
      return
    }

    const origin = origins[top]!
    const zBackWorld = origin.oz + topLayout.zBack
    const zFrontWorld = origins[0]!.oz + layouts[0]!.halfD + ROOF_FRONT
    const yBackWorld = origin.oy + topLayout.yBack
    const span = zFrontWorld - zBackWorld

    // The rafter's own shape term (arch + tip curl) at `u`, isolated by evaluating the REAL rafter with
    // its front tie held level with the rear one, so the solve can never drift from the curve the
    // geometry is actually built on.
    const level: Layout = { ...topLayout, yFront: topLayout.yBack }
    const shapeAt = (u: number): number => rafterAt(level, u).y - topLayout.yBack

    let front = origin.oy + topLayout.yFront
    let binding = -1
    for (let tier = 0; tier <= top; tier++) {
      const layout = layouts[tier]!
      const at = origins[tier]!
      // A tier below the top only shows to the sky from the FRONT EDGE of the tier above it forward;
      // behind that it is roofed by the cantilever, which `rebuild`'s own headroom check already gates.
      const zNose = at.oz + layout.halfD
      const zTail = tier === top
        ? at.oz - layout.halfD
        : origins[tier + 1]!.oz + layouts[tier + 1]!.halfD
      for (let i = 0; i <= CLEAR_SAMPLES; i++) {
        const z = zTail + ((zNose - zTail) * i) / CLEAR_SAMPLES
        const u = (z - zBackWorld) / span
        if (u <= 1e-6 || u > 1) continue
        const need = at.oy + bowlMassTopAt(layout, z - at.oz) + ROOF_CLEAR
        const lift = yBackWorld + (need - yBackWorld - shapeAt(u)) / u
        if (lift > front) {
          front = lift
          binding = tier
        }
      }
    }
    if (front > yBackWorld) {
      throw new Error(
        `f1-grandstand-bay: a section-spanning canopy cannot clear tier ${binding} by ROOF_CLEAR `
        + `(${ROOF_CLEAR}m) without lifting its leading edge to ${front.toFixed(3)}m — above its own rear `
        + `tie (${yBackWorld.toFixed(3)}m), which is a canopy shutting down onto the track rather than `
        + `opening toward it. Reduce a lower tier's rows, or ask for roof: 'top'.`,
      )
    }

    const canopy: Layout = {
      ...topLayout,
      zFront: zFrontWorld - origin.oz,
      yFront: front - origin.oy,
    }
    const group = new Group()
    group.name = 'canopy'
    group.position.set(0, origin.oy, origin.oz)
    roof.add(group)

    buildRoof(canopy, group)
    // The leading-edge columns still stand on TRUE ground in front of tier 0 and still tie back to tier
    // 0's promenade lip — expressed in this group's own (top-tier) frame.
    buildColumns(canopy, group, {
      groundY: -origin.oy,
      tieY: origins[0]!.oy + layouts[0]!.base + 0.92 - origin.oy,
      tieZ: origins[0]!.oz + layouts[0]!.halfD - origin.oz,
    })
    buildFascia(canopy, group)
    buildCanopyProps(canopy, origin, layouts, origins)
  }

  /**
   * What carries THIS tier at its front (cantilever-tip) edge: a column line on the roof's own bay pitch,
   * or a solid panel, standing in the undercroft between the lower tier's own `surfaceY` and this tier's
   * flat underside (local y = 0 — see `buildBowl`). Every foot is COMPUTED off `surfaceY`, never assumed,
   * so it can only land on a real tread or promenade.
   */
  const buildFrontSupport = (
    spec: TierSpec, layout: Layout, oy: number, oz: number, wallH: number,
    lower: { readonly layout: Layout; readonly oy: number; readonly oz: number },
    group: Group,
  ): void => {
    if (spec.support === 'none') return
    const z = oz + layout.halfD - SUPPORT_INSET
    const headY = oy
    const footY = lower.oy + surfaceY(lower.layout, z - lower.oz)
    if (footY >= headY) {
      throw new Error(
        `f1-grandstand-bay: front support foot (${footY.toFixed(3)}m) is not below its head `
        + `(${headY.toFixed(3)}m) — the tier below's surface reaches above this tier's own soffit`,
      )
    }
    const parts: BufferGeometry[] = []
    if (spec.support === 'wall') {
      const wall = bevelBox(layout.width, headY - footY, WALL_SUPPORT_T, 0.03)
      wall.translate(0, (footY + headY) / 2, z)
      parts.push(wall)
    } else {
      for (const x of layout.columns) {
        parts.push(member(new Vector3(x, footY, z), new Vector3(x, headY, z), SUPPORT_R, 10))
        parts.push(groundPad([SUPPORT_PAD, SUPPORT_PAD], [x, footY, z], 0.03))
      }
      // Raking stringer down each side of the bay, front-column head back to the rear support's own
      // head — the primary raker beam a real cantilevered stand carries its soffit on, following the
      // rake (low at the front, high at the back) rather than cutting straight across it.
      const rearZ = oz - layout.halfD - 0.24 - 0.25 - SUPPORT_INSET
      const rearHeadY = oy + wallH
      for (const x of [-layout.halfW, layout.halfW] as const) {
        parts.push(member(new Vector3(x, headY, z), new Vector3(x, rearHeadY, rearZ), BRACE_R + 0.01, 8))
      }
    }
    // Every point above was computed in WORLD space (foot/head both cross tier boundaries via `lower`),
    // but this mesh is emitted into `group`, which already carries this tier's own (oy, oz) translation
    // — convert back to local-to-group space so the group's transform doesn't apply the offset twice.
    emit(
      'structure',
      mergeParts(parts, 'f1-grandstand-bay: front support').translate(0, -oy, -oz),
      group,
      'front-support',
    )
  }

  /**
   * The back of the stand: a column line (with X cross-bracing per bay) or a wall, from TRUE GROUND up
   * to this tier's own rear-wall height (`wallH` — the same value `buildBowl` used, so the support meets
   * the wall it is bracing). Every tier gets its own tower rather than one member spanning past
   * intermediate tiers, because each tier steps further back as it stacks — the towers never collide.
   */
  const buildRearSupport = (
    spec: TierSpec, layout: Layout, oy: number, oz: number, wallH: number, group: Group,
  ): void => {
    if (spec.rearSupport === 'none') return
    // The rear-wall box (`buildBowl`) is centred at halfD+0.24 with 0.5 m depth — its far face is
    // 0.25 m further back again. Clear that face by more than the support's own radius.
    const wallBackZ = oz - layout.halfD - 0.24 - 0.25
    const z = wallBackZ - SUPPORT_INSET
    const headY = oy + wallH
    const footY = 0
    if (headY <= footY) {
      throw new Error(`f1-grandstand-bay: rear support head (${headY.toFixed(3)}m) is not above ground`)
    }
    const parts: BufferGeometry[] = []
    if (spec.rearSupport === 'wall') {
      const wall = bevelBox(layout.width, headY - footY, WALL_SUPPORT_T, 0.03)
      wall.translate(0, (footY + headY) / 2, z)
      parts.push(wall)
    } else {
      const feet: Vector3[] = []
      const heads: Vector3[] = []
      for (const x of layout.columns) {
        const foot = new Vector3(x, footY, z)
        const head = new Vector3(x, headY, z)
        feet.push(foot)
        heads.push(head)
        parts.push(member(foot, head, SUPPORT_R, 10))
        parts.push(groundPad([SUPPORT_PAD, SUPPORT_PAD], [x, footY, z], 0.03))
      }
      // X cross-bracing, two diagonals per bay, so the back reads as a braced frame rather than a row
      // of unconnected posts.
      for (let b = 0; b < feet.length - 1; b++) {
        parts.push(member(feet[b]!, heads[b + 1]!, BRACE_R, 6))
        parts.push(member(heads[b]!, feet[b + 1]!, BRACE_R, 6))
      }
    }
    // Same local/world conversion as `buildFrontSupport` — the foot is TRUE ground (world y=0).
    emit(
      'structure',
      mergeParts(parts, 'f1-grandstand-bay: rear support').translate(0, -oy, -oz),
      group,
      'rear-support',
    )
  }

  /**
   * The access tower on ONE end face (x = ±halfW): a scaffold cage bolted to the bay's end, its flights
   * travelling ALONG Z — parallel to the rake, climbing promenade to promenade — exactly like a temporary
   * stand's stair tower (Madring IMG_2437). It is deliberately OUTSIDE the seating width, which is why
   * {@link F1GrandstandBayInstance.getFootprint} reports the overhang and why a bay in the middle of a
   * tiled run must pass `stairSide: 'none'`.
   *
   * ONE cage serves every level rather than one cage per tier. Successive tiers step BACK as they stack,
   * so per-tier cages would interleave their standards through the same volume; and a shared cage makes
   * tier k's head landing and tier k+1's foot landing the SAME landing — which is what they are in a real
   * stand, and what stops two coincident slabs z-fighting on the promenade they share.
   */
  const buildStairTower = (
    plan: TowerPlan,
    layouts: readonly Layout[],
    origins: ReadonlyArray<{ oy: number; oz: number }>,
    group: Group,
  ): void => {
    if (plan.flights.length === 0) return
    const treads: BufferGeometry[] = []
    const frame: BufferGeometry[] = []
    const rails: BufferGeometry[] = []

    const place = (
      parts: readonly BufferGeometry[], x: number, y: number, z: number, rearward: boolean,
    ): void => {
      for (const part of parts) {
        // A lane climbing toward -Z is the same flight turned about Y; the flight is symmetric across its
        // own centre line, so the half-turn costs nothing but the travel direction.
        if (rearward) part.rotateY(Math.PI)
        part.translate(x, y, z)
      }
    }

    /** f1-stairs' double rail plus a toe board along one straight landing edge. */
    const guardRun = (x0: number, x1: number, z0: number, z1: number, y: number): void => {
      const length = Math.hypot(x1 - x0, z1 - z0)
      if (length < 0.25) return
      for (const [height, radius] of [[STAIRS.railH, 0.024], [STAIRS.midH, 0.016]] as const) {
        rails.push(member(
          new Vector3(x0, y + height, z0), new Vector3(x1, y + height, z1), radius, 8,
        ))
      }
      const posts = Math.max(1, Math.round(length / 1.1))
      for (let p = 0; p <= posts; p++) {
        const t = p / posts
        const x = x0 + (x1 - x0) * t
        const z = z0 + (z1 - z0) * t
        rails.push(member(
          new Vector3(x, y, z), new Vector3(x, y + STAIRS.railH, z), STAIRS.post / 2, 6,
        ))
      }
      const alongX = Math.abs(x1 - x0) > Math.abs(z1 - z0)
      const toe = bevelBox(alongX ? length : 0.04, STAIRS.toe, alongX ? 0.04 : length, 0.004)
      toe.translate((x0 + x1) / 2, y + STAIRS.toe / 2, (z0 + z1) / 2)
      frame.push(toe)
    }

    /** Guard one landing edge, leaving `openings` (spans in the edge's own varying axis) unguarded. */
    const guardEdge = (
      lo: number, hi: number, openings: ReadonlyArray<readonly [number, number]>, y: number,
      point: (value: number) => readonly [number, number],
    ): void => {
      let cursor = lo
      for (const [from, to] of [...openings].sort((a, b) => a[0] - b[0])) {
        if (from > cursor) {
          const [ax, az] = point(cursor)
          const [bx, bz] = point(Math.min(from, hi))
          guardRun(ax, bx, az, bz, y)
        }
        cursor = Math.max(cursor, to)
      }
      if (cursor < hi) {
        const [ax, az] = point(cursor)
        const [bx, bz] = point(hi)
        guardRun(ax, bx, az, bz, y)
      }
    }

    /** The x-span one lane occupies where it meets a landing edge, plus a little rail clearance. */
    const laneSpan = (centre: number): readonly [number, number] => [
      centre - plan.flightWidth / 2 - 0.12,
      centre + plan.flightWidth / 2 + 0.12,
    ]

    /**
     * A platform across the cage, top flush with the walking level.
     *
     * A LEVEL landing is decked all the way in to the bay's own end face (`xFace`), not just to the cage
     * line — the cage stands off by TOWER_GAP so its standards clear the bowl, and decking only to the
     * standards would leave a hand's width of daylight exactly where a spectator steps off the promenade.
     *
     * Every edge is guarded (double rail + toe board) EXCEPT where something actually connects: the
     * spans a flight arrives or leaves on, and — on a level landing — the whole inner edge, which is the
     * gate onto the promenade. That single deliberate gap is what makes the gate read as a gate instead
     * of as missing handrail, and it is the reason the openings are computed rather than assumed.
     */
    const landing = (
      y: number,
      z: number,
      toFace: boolean,
      openings: { front: ReadonlyArray<readonly [number, number]>; rear: ReadonlyArray<readonly [number, number]> },
    ): void => {
      const x0 = toFace ? plan.xFace : plan.xInner
      const width = Math.abs(plan.xOuter - x0)
      const cx = (x0 + plan.xOuter) / 2
      const slab = bevelBox(width, 0.08, TOWER_LANDING, 0.02)
      slab.translate(cx, y - 0.04, z)
      treads.push(slab)
      for (let i = 0; i < 5; i++) {
        const bar = bevelBox(width - 0.14, 0.016, 0.03, 0.002)
        bar.translate(cx, y + 0.008, z - TOWER_LANDING / 2 + 0.14 + i * ((TOWER_LANDING - 0.28) / 4))
        treads.push(bar)
      }

      const lo = Math.min(x0, plan.xOuter) + 0.04
      const hi = Math.max(x0, plan.xOuter) - 0.04
      const zFront = z + TOWER_LANDING / 2 - 0.05
      const zRear = z - TOWER_LANDING / 2 + 0.05
      guardEdge(lo, hi, openings.front, y, (v) => [v, zFront])
      guardEdge(lo, hi, openings.rear, y, (v) => [v, zRear])
      const outerX = plan.xOuter - plan.side * 0.05
      guardRun(outerX, outerX, zRear, zFront, y)
      // The inner edge of a TURN landing faces the bowl across the cage gap and has to be guarded; the
      // inner edge of a LEVEL landing is the gate.
      if (!toFace) {
        const innerX = plan.xInner + plan.side * 0.05
        guardRun(innerX, innerX, zRear, zFront, y)
      }
    }

    // Which spans of which level landing a flight connects to — a prepass, because a landing is guarded
    // as it is built and one level landing can carry both the flight arriving at it and the next leaving.
    const levelOpenings = new Map<number, {
      front: Array<readonly [number, number]>
      rear: Array<readonly [number, number]>
    }>()
    const openingsFor = (tier: number): { front: Array<readonly [number, number]>; rear: Array<readonly [number, number]> } => {
      let entry = levelOpenings.get(tier)
      if (!entry) {
        entry = { front: [], rear: [] }
        levelOpenings.set(tier, entry)
      }
      return entry
    }
    for (const flight of plan.flights) {
      // The lower lane leaves the FOOT landing's rear edge; the upper lane arrives at the HEAD landing's
      // front edge, and is always the inner lane so its head lands next to the gate.
      openingsFor(flight.from.tier).rear.push(laneSpan(flight.folded ? plan.laneOuterX : plan.laneInnerX))
      openingsFor(flight.to.tier).front.push(laneSpan(plan.laneInnerX))
    }
    // ...and the entry flight opens the LOWEST level landing on whichever edge it arrives at. Without
    // this the ground flight would climb into a guarded edge — a stair arriving at a handrail.
    if (plan.ground) {
      openingsFor(plan.levels[0]!.tier)[plan.ground.edge].push(laneSpan(plan.ground.laneX))
    }

    for (const level of plan.levels) {
      const openings = levelOpenings.get(level.tier) ?? { front: [], rear: [] }
      landing(level.y, level.z, true, openings)
    }

    for (const flight of plan.flights) {
      const footZ = flight.from.z - TOWER_LANDING / 2
      const turnY = flight.from.y + flight.stepsA * flight.rise
      const lower = flightGeometry(flight.stepsA, flight.goingA, flight.rise, plan.flightWidth)
      const lowerX = flight.folded ? plan.laneOuterX : plan.laneInnerX
      place(lower.treads, lowerX, flight.from.y, footZ, true)
      place(lower.frame, lowerX, flight.from.y, footZ, true)
      place(lower.rails, lowerX, flight.from.y, footZ, true)
      treads.push(...lower.treads)
      frame.push(...lower.frame)
      rails.push(...lower.rails)

      if (!flight.folded) continue
      // Both lanes meet the turn landing on its FRONT edge — the lower one arriving, the upper leaving —
      // so that edge is open over both lane columns and the other three are solid guard.
      landing(turnY, flight.zTurn, false, {
        front: [laneSpan(plan.laneOuterX), laneSpan(plan.laneInnerX)],
        rear: [],
      })
      const upper = flightGeometry(flight.stepsB, flight.goingB, flight.rise, plan.flightWidth)
      const upperZ = flight.zTurn + TOWER_LANDING / 2
      place(upper.treads, plan.laneInnerX, turnY, upperZ, false)
      place(upper.frame, plan.laneInnerX, turnY, upperZ, false)
      place(upper.rails, plan.laneInnerX, turnY, upperZ, false)
      treads.push(...upper.treads)
      frame.push(...upper.frame)
      rails.push(...upper.rails)
    }

    // The entry flight. Same tread pan, same channel stringer, same double rail and toe board as every
    // other flight in the cage — it is one more call to the same builder, at f1-stairs' own 280 mm going
    // because this is the one flight whose foot is not pinned to a promenade. Its datum is grade, so it
    // is built WITHOUT the underslung chord (see {@link flightGeometry}) and bears on sole boards.
    if (plan.ground) {
      const entry = flightGeometry(
        plan.ground.steps, plan.ground.going, plan.ground.rise, plan.flightWidth, false,
      )
      const { laneX, footZ, rearward } = plan.ground
      place(entry.treads, laneX, 0, footZ, rearward)
      place(entry.frame, laneX, 0, footZ, rearward)
      place(entry.rails, laneX, 0, footZ, rearward)
      treads.push(...entry.treads)
      frame.push(...entry.frame)
      rails.push(...entry.rails)
      // Sole boards under the stringer ends, the same base-plate convention the standards use — what
      // stops the bottom of the flight reading as steel driven into the ground.
      for (const sx of stringerStations(plan.flightWidth)) {
        frame.push(groundPad([0.26, 0.34], [laneX + sx, 0, footZ + (rearward ? -0.14 : 0.14)], 0.035))
      }
    }

    // Standards stand at every landing edge — deduped, so a shared level/turn edge never doubles one up.
    const edges: number[] = []
    const edge = (z: number): void => {
      if (!edges.some((existing) => Math.abs(existing - z) < 0.09)) edges.push(z)
    }
    for (const level of plan.levels) {
      edge(level.z - TOWER_LANDING / 2)
      edge(level.z + TOWER_LANDING / 2)
    }
    for (const flight of plan.flights) {
      if (!flight.folded) continue
      edge(flight.zTurn - TOWER_LANDING / 2)
      edge(flight.zTurn + TOWER_LANDING / 2)
    }
    edges.sort((a, b) => a - b)
    // Landing edges alone leave five-metre clear bays, and a five-metre bay reads as structural steel
    // rather than as tube. Split anything longer than the bay module so the lattice keeps its pitch.
    const stations: number[] = []
    for (let i = 0; i < edges.length; i++) {
      stations.push(edges[i]!)
      const next = edges[i + 1]
      if (next === undefined) continue
      const gap = next - edges[i]!
      const splits = Math.max(0, Math.ceil(gap / TOWER_BAY) - 1)
      for (let s = 1; s <= splits; s++) stations.push(edges[i]! + (gap * s) / (splits + 1))
    }
    stations.sort((a, b) => a - b)

    const inset = TOWER_PAD / 2 + 0.01
    const xLines = [plan.xInner + plan.side * inset, plan.xOuter - plan.side * inset] as const
    // Each standard is cut to what it actually carries at its own z, not to the cage's overall top — a
    // tower whose front posts run to the head of the back ones reads as a box, not as a raking stair.
    const heads = new Map<number, number>()
    for (const z of stations) {
      const walk = plan.envelopeY(z)
      if (walk === null) continue
      heads.set(z, walk + STAIRS.railH + TOWER_HEAD)
    }
    const ordered = [...heads.keys()]
    if (ordered.length === 0) return
    for (const z of ordered) {
      for (const x of xLines) {
        frame.push(member(new Vector3(x, 0, z), new Vector3(x, heads.get(z)!, z), TOWER_POST_R, 8))
        frame.push(groundPad([TOWER_PAD, TOWER_PAD], [x, 0, z], 0.035))
      }
    }
    // Ledgers every lift, plus one diagonal per bay per lift alternating up the cage — the brace pattern
    // is what makes a cage of tubes read as scaffold instead of as a fence.
    for (let i = 0; i < ordered.length - 1; i++) {
      const z0 = ordered[i]!
      const z1 = ordered[i + 1]!
      const top = Math.min(heads.get(z0)!, heads.get(z1)!)
      // Base ledger just above the plates. Without it the lift below the first landing is a row of bare
      // standards, and a scaffold is braced continuously to the ground whether or not it carries a stair
      // there — an unbraced bottom lift is what makes the cage's lower third read as an empty shaft.
      for (const x of xLines) {
        frame.push(member(new Vector3(x, 0.3, z0), new Vector3(x, 0.3, z1), TOWER_LEDGER_R, 6))
      }
      let lift = 0
      for (let y = TOWER_LIFT; y <= top + 1e-6; y += TOWER_LIFT) {
        for (const x of xLines) {
          frame.push(member(new Vector3(x, y, z0), new Vector3(x, y, z1), TOWER_LEDGER_R, 6))
        }
        // Alternate on BOTH the bay and the lift, so neighbouring panels mirror instead of marching in
        // step — a wall of parallel diagonals is the tell of generated bracing (rule 3). Both long faces
        // get a diagonal, mirrored against each other, so the cage is triangulated from either side
        // rather than only from outboard.
        const up = (i + lift) % 2 === 0
        for (const [index, x] of xLines.entries()) {
          const rising = index === 0 ? !up : up
          frame.push(member(
            new Vector3(x, rising ? y - TOWER_LIFT : y, z0),
            new Vector3(x, rising ? y : y - TOWER_LIFT, z1),
            TOWER_BRACE_R,
            6,
          ))
        }
        lift += 1
      }
    }
    /** Is the bay's own mass behind the cage at this height and station — i.e. is there anything to tie to? */
    const bayBehind = (y: number, z: number): boolean => {
      for (let tier = 0; tier < layouts.length; tier++) {
        const layout = layouts[tier]
        const origin = origins[tier]
        if (!layout || !origin) continue
        if (z > origin.oz + layout.halfD || z < origin.oz - layout.halfD - 0.5) continue
        if (y > origin.oy + 0.3 && y < origin.oy + layout.bowlTop + 0.5) return true
      }
      return false
    }
    // Transoms across the cage at every standard, every lift — and where the bay's own mass stands behind
    // it, the transom runs ON THROUGH the gap and ties into the end face. Untied, a 15 m cage 3 m wide is
    // a 5:1 free-standing shaft; a real stair tower is restrained by the thing it serves at every lift,
    // and those ties are what stop the cage reading as a separate object parked next to the stand.
    for (const z of ordered) {
      for (let y = TOWER_LIFT; y <= heads.get(z)! + 1e-6; y += TOWER_LIFT) {
        const inner = bayBehind(y, z) ? plan.xFace : xLines[0]!
        frame.push(member(new Vector3(inner, y, z), new Vector3(xLines[1]!, y, z), TOWER_LEDGER_R, 6))
      }
    }
    // End-face bracing front and back, so the cage is triangulated on three planes instead of only the
    // outer one — a plane braced in one direction only still racks in the other.
    for (const [index, z] of [ordered[0]!, ordered[ordered.length - 1]!].entries()) {
      let lift = 0
      for (let y = TOWER_LIFT; y <= heads.get(z)! + 1e-6; y += TOWER_LIFT) {
        const up = (index + lift) % 2 === 0
        frame.push(member(
          new Vector3(xLines[0]!, up ? y - TOWER_LIFT : y, z),
          new Vector3(xLines[1]!, up ? y : y - TOWER_LIFT, z),
          TOWER_BRACE_R,
          6,
        ))
        lift += 1
      }
    }


    // The end guard rail the landings open through. It runs the RAKED part of the end face and stops at
    // the promenade, so the gap where the tower arrives is the gate. A stand's open end has to be guarded
    // anyway; leaving exactly the landing's width unguarded is what makes the arrival read as a way in.
    const gates: BufferGeometry[] = []
    for (const level of plan.levels) {
      const layout = layouts[level.tier]
      const origin = origins[level.tier]
      if (!layout || !origin) continue
      const x = plan.side * (layout.halfW - 0.06)
      const zNear = origin.oz + layout.halfD - WALK
      const zFar = origin.oz - layout.halfD + 0.12
      const floorAt = (z: number): number => origin.oy + surfaceY(layout, z - origin.oz)
      gates.push(...buildRail(
        new Vector3(x, floorAt(zNear) + RAIL_H, zNear),
        new Vector3(x, floorAt(zFar) + RAIL_H, zFar),
        Math.max(3, Math.ceil(layout.rows / 2)),
        (t) => floorAt(zNear + (zFar - zNear) * t),
      ))
    }

    emit('deck', mergeParts(treads, 'f1-grandstand-bay: stair treads'), group, 'stairs')
    emit('structure', mergeParts(frame, 'f1-grandstand-bay: stair frame'), group, 'stair-frame')
    emit('structure', mergeParts(rails, 'f1-grandstand-bay: stair rail'), group, 'stair-rail')
    if (gates.length) {
      emit('structure', mergeParts(gates, 'f1-grandstand-bay: end guard rail'), group, 'stair-gate')
    }
  }

  /**
   * The physics proxy — a FIRST CUT at what a consumer should attach for one placed stand instead of the
   * whole visual trimesh (expensive) or one whole-model AABB (an invisible wall out over the track, which
   * is exactly why devlo-racing's `kitAllowsBarrierCollider` is a blanket `false` today).
   *
   * Every volume is CONVEX and named, so the consumer picks its own level of solidity: the bowl prisms
   * alone stop a car; add the support lines and the tower box and the undercroft is closed too. The ROOF
   * is excluded on purpose — nothing that collides ever reaches it, and its cantilever is precisely the
   * part that would push a whole-model box out over the racing line.
   *
   * The group is NOT parented to `root`: it can never reach the visual merge, the `.vtopo` compile or the
   * model's own Box3 unless `debug.collision` asks for it, so `tiers: 1` stays byte-identical.
   */
  const buildCollision = (
    tierSpecs: readonly TierSpec[],
    layouts: readonly Layout[],
    origins: ReadonlyArray<{ oy: number; oz: number }>,
    wallTops: readonly number[],
    towers: readonly TowerPlan[],
  ): void => {
    const volumes: F1GrandstandBayCollisionVolume[] = []

    const pushVolume = (
      part: F1GrandstandBayCollisionVolume['part'],
      tier: number,
      kind: F1GrandstandBayCollisionVolume['kind'],
      points: ReadonlyArray<readonly [number, number, number]>,
      geometry: BufferGeometry,
    ): void => {
      const min: [number, number, number] = [Infinity, Infinity, Infinity]
      const max: [number, number, number] = [-Infinity, -Infinity, -Infinity]
      for (const point of points) {
        for (let axis = 0; axis < 3; axis++) {
          min[axis] = Math.min(min[axis]!, point[axis]!)
          max[axis] = Math.max(max[axis]!, point[axis]!)
        }
      }
      volumes.push({ part, tier, kind, points, min, max })
      generated.push(geometry)
      const mesh = new Mesh(geometry, proxy)
      mesh.name = tier >= 0 ? `collision-${part}-${tier}` : `collision-${part}`
      // 'detail' is the only role the compiler recognises that it also EXCLUDES from both the hull and
      // the visual AABB (see f1-kit-core/topology.ts) — 'collision' is not a TopologyRole and would be
      // read as untagged, i.e. folded straight back into the compiled shape.
      mesh.userData.topologyRole = 'detail'
      mesh.userData.collisionPart = part
      mesh.userData.excludeFromExport = true
      collision.add(mesh)
    }

    const boxVolume = (
      part: F1GrandstandBayCollisionVolume['part'],
      tier: number,
      centre: readonly [number, number, number],
      size: readonly [number, number, number],
    ): void => {
      const points: Array<readonly [number, number, number]> = []
      for (const dx of [-1, 1] as const) {
        for (const dy of [-1, 1] as const) {
          for (const dz of [-1, 1] as const) {
            points.push([
              centre[0] + (dx * size[0]) / 2,
              centre[1] + (dy * size[1]) / 2,
              centre[2] + (dz * size[2]) / 2,
            ])
          }
        }
      }
      const geometry = bevelBox(size[0], size[1], size[2], 0)
      geometry.translate(centre[0], centre[1], centre[2])
      pushVolume(part, tier, 'box', points, geometry)
    }

    for (let tier = 0; tier < tierSpecs.length; tier++) {
      const spec = tierSpecs[tier]!
      const layout = layouts[tier]!
      const origin = origins[tier]!
      const rearBackZ = -layout.halfD - 0.49
      // The measured corners of the tier's own mass: front skirt, promenade lip, the last row's own
      // corner (which the whole rake lies on, exactly), the parapet and the rear wall's back face.
      const profile = convexHull2D([
        [layout.halfD, 0],
        [layout.halfD, layout.base],
        [layout.halfD - WALK, layout.base + NOSE],
        [-layout.halfD + REAR, layout.bowlTop],
        [-layout.halfD, layout.bowlTop],
        [rearBackZ, wallTops[tier]!],
        [rearBackZ, 0],
      ])
      const geometry = loftAlongX(profile, layout.width, { closed: true })
      geometry.translate(0, origin.oy, origin.oz)
      const points: Array<readonly [number, number, number]> = []
      for (const sx of [-layout.halfW, layout.halfW] as const) {
        for (const [z, y] of profile) points.push([sx, y + origin.oy, z + origin.oz])
      }
      pushVolume('bowl', tier, 'wedge', points, geometry)

      if (tier === 0) continue
      const lower = layouts[tier - 1]!
      const lowerOrigin = origins[tier - 1]!
      if (spec.support !== 'none') {
        const z = origin.oz + layout.halfD - SUPPORT_INSET
        const footY = lowerOrigin.oy + surfaceY(lower, z - lowerOrigin.oz)
        boxVolume(
          'front-support',
          tier,
          [0, (footY + origin.oy) / 2, z],
          [layout.width, origin.oy - footY, spec.support === 'wall' ? WALL_SUPPORT_T : SUPPORT_R * 2],
        )
      }
      if (spec.rearSupport !== 'none') {
        const z = rearBackZ + origin.oz - SUPPORT_INSET
        const headY = origin.oy + wallTops[tier]!
        boxVolume(
          'rear-support',
          tier,
          [0, headY / 2, z],
          [layout.width, headY, spec.rearSupport === 'wall' ? WALL_SUPPORT_T : SUPPORT_R * 2],
        )
      }
    }

    for (const tower of towers) {
      // From the bay's own end face, not from the cage line: the landings deck across TOWER_GAP, so
      // starting at `xInner` would leave a 120 mm slot of nothing between this box and the bowl prism.
      const x0 = Math.min(tower.xFace, tower.xOuter)
      const x1 = Math.max(tower.xFace, tower.xOuter)
      boxVolume(
        'stair-tower',
        -1,
        [(x0 + x1) / 2, tower.topY / 2, (tower.zFront + tower.zRear) / 2],
        [x1 - x0, tower.topY, tower.zFront - tower.zRear],
      )
    }

    collisionVolumes = volumes
  }

  /**
   * Stacks `config.tiers` bowls. Tier 0 emits straight into the `bowl`/`roof` groups exactly as the
   * single-bowl model always has (identity transform) — that's what keeps `tiers: 1` byte-identical.
   * Tier k>=1 gets its own subgroup, translated by the running (oy, oz) origin. Origins are derived in a
   * PREPASS (before anything is built) so a later tier's position is known while building an earlier one
   * — `buildRoof`'s clearance check and `buildFrontSupport`'s stringer both need to look at the tier
   * ABOVE. Only tier 0's `plinth` ever shifts an origin directly: `tierStepY` (the promenade-to-promenade
   * rise) is invariant to which local base a tier is built from (it cancels: `bowlTop - base` is always
   * `NOSE + rows*RISE` regardless of `base`), so raising the plinth shifts tier 0 and, by carrying through
   * the running `oy`, every tier stacked above it — rigidly, without perturbing any tier-to-tier
   * clearance.
   */
  const rebuild = (): void => {
    releaseGenerated()

    const tierSpecs = resolveTiers(config)
    const layouts = tierSpecs.map((spec, tier) =>
      layoutOf(spec.rows, config.width, tier === 0 ? spec.plinth : DECK),
    )

    const origins: Array<{ oy: number; oz: number }> = [{ oy: 0, oz: 0 }]
    /** Each tier's own rear-wall height, recorded as it is built — the collision prism's rear datum. */
    const wallTops: number[] = []
    for (let tier = 1; tier < tierSpecs.length; tier++) {
      const spec = tierSpecs[tier]!
      const lower = layouts[tier - 1]!
      const lowerOrigin = origins[tier - 1]!
      const lowerBase = tier === 1 ? tierSpecs[0]!.plinth : DECK
      const tierStepY = NOSE + lower.rows * RISE + ROOF_CLEAR + spec.lift
      const tierStepZ = 2 * lower.halfD - spec.overlapRows * TREAD
      const oy = lowerOrigin.oy + (lowerBase - DECK) + tierStepY
      const oz = lowerOrigin.oz - tierStepZ
      origins.push({ oy, oz })

      // The covered row is the last row of the tier below NOT under this tier's overhang; this tier's
      // own flat underside (its local y=0, see `buildBowl`) must clear that row's tread by ROOF_CLEAR, or
      // the concourse walking under the balcony has no headroom.
      const coveredRow = Math.min(Math.max(lower.rows - spec.overlapRows, 0), lower.rows - 1)
      const rowWorldY = lowerOrigin.oy + lowerBase + NOSE + coveredRow * RISE
      const headroom = oy - rowWorldY
      if (headroom < ROOF_CLEAR) {
        throw new Error(
          `f1-grandstand-bay: tier ${tier} cantilever headroom over row ${coveredRow} is `
          + `${headroom.toFixed(3)}m, short of ROOF_CLEAR (${ROOF_CLEAR}m) — raise lift, reduce `
          + `overlapRows, or reduce rows`,
        )
      }
    }

    for (let tier = 0; tier < tierSpecs.length; tier++) {
      const spec = tierSpecs[tier]!
      const layout = layouts[tier]!
      const origin = origins[tier]!
      const isTop = tier === tierSpecs.length - 1

      const bowlGroup = tier === 0 ? bowl : (() => {
        const g = new Group()
        g.name = `tier-${tier}`
        g.position.set(0, origin.oy, origin.oz)
        bowl.add(g)
        return g
      })()

      const wallH = isTop ? layout.bowlTop + 0.62 : origins[tier + 1]!.oy - origin.oy
      wallTops.push(wallH)
      buildBowl(layout, bowlGroup, isTop ? undefined : wallH)
      buildSeating(layout, bowlGroup)
      buildAisle(layout, bowlGroup)
      buildNosings(layout, bowlGroup)
      buildFrontage(layout, bowlGroup)

      if (tier > 0) {
        const lower = { layout: layouts[tier - 1]!, oy: origins[tier - 1]!.oy, oz: origins[tier - 1]!.oz }
        buildFrontSupport(spec, layout, origin.oy, origin.oz, wallH, lower, bowlGroup)
        buildRearSupport(spec, layout, origin.oy, origin.oz, wallH, bowlGroup)
      }

      // `config.roof` decides; `tierSpec[k].roof` is read ONLY under 'per-tier' — see {@link RoofMode}.
      // 'full' builds nothing here: one canopy for the whole section follows the loop.
      const ownRoof = config.roof === 'per-tier'
        ? spec.roof
        : config.roof === 'top' ? isTop : false
      if (ownRoof) {
        const roofGroup = tier === 0 ? roof : (() => {
          const g = new Group()
          g.name = `tier-${tier}`
          g.position.set(0, origin.oy, origin.oz)
          roof.add(g)
          return g
        })()

        if (!isTop) {
          let maxRoofY = -Infinity
          for (let i = 0; i <= 24; i++) maxRoofY = Math.max(maxRoofY, rafterAt(layout, i / 24).y)
          const roofTopWorldY = origin.oy + maxRoofY
          const aboveMassBottomWorldY = origins[tier + 1]!.oy
          const clearance = aboveMassBottomWorldY - roofTopWorldY
          if (clearance < ROOF_CLEAR) {
            throw new Error(
              `f1-grandstand-bay: tier ${tier} roof clears the tier above by ${clearance.toFixed(3)}m, `
              + `short of ROOF_CLEAR (${ROOF_CLEAR}m)`,
            )
          }
        }

        buildRoof(layout, roofGroup)
        buildColumns(layout, roofGroup)
        buildFascia(layout, roofGroup)
      }
    }

    if (config.roof === 'full') buildFullCanopy(layouts, origins)

    // Towers LAST, and outside the tier loop: a cage belongs to no single tier — it spans them, and its
    // landings are shared between the tier below and the tier above. Emitted into the root-level `bowl`
    // group, in the model's own frame, so nothing has to be un-offset. At `tiers: 1` no tier can ask for
    // one, nothing is emitted, and the build stays byte-identical.
    const towers: TowerPlan[] = []
    let left = 0
    let right = 0
    for (const side of [-1, 1] as const) {
      const served = new Set<number>()
      let flightWidth = 0
      for (let tier = 1; tier < tierSpecs.length; tier++) {
        if (!towerOnSide(tierSpecs[tier]!, side)) continue
        served.add(tier - 1)
        served.add(tier)
        flightWidth = Math.max(flightWidth, tierSpecs[tier]!.stairWidth)
      }
      if (served.size < 2) continue
      const levels = [...served].sort((a, b) => a - b).map((tier) => ({
        tier,
        y: origins[tier]!.oy + layouts[tier]!.base,
        z: origins[tier]!.oz + layouts[tier]!.halfD - WALK / 2,
      }))
      const plan = planTower(side, flightWidth, levels, config.width / 2)
      towers.push(plan)
      buildStairTower(plan, layouts, origins, bowl)
      const overhang = TOWER_GAP + plan.towerWidth
      if (side === -1) left = overhang
      else right = overhang
    }
    footprint = { width: config.width, totalWidth: config.width + left + right, left, right }

    buildCollision(tierSpecs, layouts, origins, wallTops, towers)
  }
  rebuild()
  if (options.debug?.collision) {
    collision.visible = true
    root.add(collision)
  }

  return {
    root,
    parts: { bowl, roof, collision },
    materials: materialSlots,
    getConfig: () => ({ ...config }),
    getFootprint: () => ({ ...footprint }),
    getCollisionVolumes: () => collisionVolumes,
    configure(patch) {
      if (patch.rows !== undefined) config.rows = Math.max(4, Math.round(patch.rows))
      if (patch.width !== undefined) config.width = Math.max(4, patch.width)
      if (patch.roof !== undefined) config.roof = clampRoofMode(patch.roof)
      if (patch.stairs !== undefined) config.stairs = clampStairsMode(patch.stairs)
      if (patch.tiers !== undefined) {
        const resolved = resolveTiersInput(patch.tiers, patch.tierSpec)
        config.tiers = resolved.tiers
        config.tierSpec = resolved.tierSpec ?? config.tierSpec
      } else if (patch.tierSpec !== undefined) {
        config.tierSpec = patch.tierSpec
      }
      rebuild()
    },
    setMaterial(slot, material) {
      materialSlots[slot] = material
      for (const mesh of meshesBySlot[slot]) mesh.material = material
    },
    update: () => {},
    dispose() {
      releaseGenerated()
      for (const material of extras) material.dispose()
      extras.length = 0
      disposeF1Materials(bundle)
      root.removeFromParent()
    },
  }
}

export function createPreview({ aspect }: { aspect: number; time?: number }) {
  // Framed from under the eave rather than over it. Above the leading edge the canopy is only a skin and
  // the tension web slung beneath it never appears; dropped below the membrane tip and swung round toward
  // the open end of the bay, the sight line passes under the near rafter and runs the length of the
  // soffit while the scalloped hem still reads against the sky.
  return createF1Preview(createModel({ rows: 6, width: 7 }), {
    aspect,
    target: [0, 4.05, 0.1],
    distance: 19.5,
    fov: 34,
    yaw: -0.86,
    pitch: 0.082,
  })
}
