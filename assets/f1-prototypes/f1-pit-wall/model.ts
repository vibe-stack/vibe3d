// f1-pit-wall — a team pit-wall perch: a clad, canopied enclosure standing on the FIA barrier.
// 1.00 m deep shell, <= 2.20 m overall, one bay per GARAGE_BAY_PITCH.
//
// Depth convention: -Z is the track, +Z is the pit lane.
//
// The prop is a *branded enclosure*, not an open desk. The team colour is the whole shell — clad plinth,
// body, end panels and canopy — because that is what a perch reads as from anywhere in the pit lane; a
// sponsor stripe on a grey counter reads as a grey counter. A raked canopy oversails the working side,
// the monitor bank is a dark trough cut into the body's pit-lane elevation with its lit faces tipped up
// at the crew, and the crew sit on a row of individual high-backed stools spread along the whole run,
// mounted proud of the pit-lane face and facing the track.
//
// Brand: pass `primary` / `accent` (and optional plate colors / legend) — `configure` rebuilds the shell,
// canopy, drip band, roof emblems, sponsor run, fascia plates and stool upholstery from those values.
//
// Crew: `seats` and `tvs` are counts for the whole installation, spread evenly along the run, not per
// bay. `tvs` defaults to one screen per two seats and keeps following `seats` until it is set explicitly,
// so the default six-seat perch gets three screens, each landing between the pair it serves.
//
// Envelope: with `benches: false` the whole prop stays inside the 1.00 m x 2.20 m FIA signalling
// envelope, so a bare shell can be abutted end to end at `bays * GARAGE_BAY_PITCH`. With the stools
// installed both they and the canopy that shelters them oversail the pit-lane face — see CANOPY_D_BARE.

import {
  BufferGeometry,
  Color,
  DataTexture,
  Group,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  RepeatWrapping,
  Vector3,
  type Material,
} from 'three/webgpu'

import {
  AXIS_Y,
  GARAGE_BAY_PITCH,
  LAYER_CLEARANCE,
  PIT_WALL,
  TOKEN,
  acquireF1Materials,
  bevelBox,
  bevelDisc,
  bevelPrism,
  createF1Preview,
  disposeF1Materials,
  fasciaTexture,
  member,
  mergeParts,
  shade,
  sponsorWallTexture,
  tubeSection,
  type F1Materials,
} from '../f1-kit-core/index.ts'

type Slot = 'shell' | 'glass' | 'fascia'

export interface F1PitWallConfig {
  bays: number
  labels?: string[]
  /** Short team legend on each bay plate (e.g. RBR, FER). */
  legend?: string
  /** Brand fill for the whole shell — plinth, body, end panels, canopy, stools (0xRRGGBB). */
  primary?: number
  /** Accent for the canopy drip band and roof emblems (0xRRGGBB). */
  accent?: number
  /** Fascia plate field (0xRRGGBB). Default near-black. */
  platePaper?: number
  /** Fascia plate numerals (0xRRGGBB). Default near-white. */
  plateInk?: number
  /** High-backed crew stools, and the canopy overhang that shelters them. Default true. */
  benches?: boolean
  /** Crew stools, spread along the whole run rather than repeated per bay. Default 6. */
  seats?: number
  /** Monitors, spread along the same run. Defaults to one per two seats, and follows `seats` until set. */
  tvs?: number
}

export interface F1PitWallOptions extends Partial<F1PitWallConfig> {
  materials?: Partial<Record<Slot, Material>>
}

export interface F1PitWallInstance {
  readonly root: Group
  readonly parts: { shell: Group; glass: Group; fascia: Group }
  readonly materials: Readonly<Record<Slot, Material>>
  getConfig(): Readonly<F1PitWallConfig>
  configure(patch: Partial<F1PitWallConfig>): void
  setMaterial(slot: Slot, material: Material): void
  update(deltaSeconds: number): void
  dispose(): void
}

interface ResolvedConfig extends F1PitWallConfig {
  seats: number
  tvs: number
}

/** Seats one screen is expected to serve. */
const SEATS_PER_MONITOR = 2
const DEFAULT_SEATS = 6

const clampCount = (value: number): number => Math.max(1, Math.round(value))

/** The default monitor count for a crew: one screen between every pair of engineers. */
const monitorsFor = (seats: number): number => Math.max(1, Math.ceil(seats / SEATS_PER_MONITOR))

const defaults: ResolvedConfig = {
  bays: 2,
  legend: 'PIT',
  primary: TOKEN.INK_950,
  accent: TOKEN.CYAN_400,
  platePaper: 0x0e1620,
  plateInk: 0xe8f2f6,
  benches: true,
  seats: DEFAULT_SEATS,
  tvs: monitorsFor(DEFAULT_SEATS),
}

const DEPTH = PIT_WALL.depth
const SHELF_H = PIT_WALL.shelf
const TOTAL_H = PIT_WALL.height

/** Track face and pit-lane face of the 1.00 m envelope. */
const TRACK_Z = -DEPTH / 2
const LANE_Z = DEPTH / 2

/** FIA 3501 concrete section on a spread footing, capped by a coping the enclosure sits on. */
const FOOTING_H = 0.34
const FOOTING_T = 0.84
const BARRIER_T = 0.46
const BARRIER_H = 0.72
const COPING_H = 0.06
const COPING_T = BARRIER_T + 0.04

/**
 * Clad plinth: the branded skirt. It runs the whole installation so a bay seam is a panel joint rather
 * than a hole, and stops above the footing so the concrete the perch stands on still reads.
 */
const DECK_T = 0.09
const PLINTH_TOP = SHELF_H - DECK_T
const PLINTH_BOT = 0.30
const PLINTH_TRACK_Z = TRACK_Z + 0.06
const PLINTH_LANE_Z = LANE_Z - 0.02

/** The desk surface. It oversails the plinth both ways so the clad face gets a shadow line. */
const NOSING_T = 0.06
const NOSING_H = 0.15
const NOSING_PROUD = 0.015

/**
 * The body above the desk: a low brand kerb along the lane edge, a tall brand wall closing the track
 * side, and the monitor trough between them, open to the sky.
 *
 * The trough is deliberately *not* capped by a brand rail on the lane side. A rail there is an awning:
 * every camera high enough to see over the stool row then looks at the underside of it instead of at the
 * bank, and the one part of this prop that emits light contributes nothing. Leaving the trough open from
 * above costs nothing in the silhouette — the track wall still carries the elevation — and it is how the
 * dark housing and the lit faces both get seen.
 */
const BODY_TOP = 1.64
const BODY_TRACK_Z = TRACK_Z + 0.01
const BODY_LANE_Z = -0.05
const KERB_TOP = 1.18
const SLOT_TOP = 1.56
/** Brand wall closing the track side of the trough, full height of the body. */
const TRACK_WALL_T = 0.16

/**
 * Monitor housing, bezels and lit faces. Screens face the crew at +Z and tip up, which is both how a
 * real bank is mounted for seated engineers and what presents the emissive plane to a raised camera.
 */
const HOUSING_Z = -0.17
const HOUSING_T = 0.08
const BEZEL_Z = -0.145
const BEZEL_T = 0.045
const MONITOR_TILT = -0.32
const SCREEN_Y = (KERB_TOP + SLOT_TOP) / 2
/** Closure over the void behind the housing, so looking down the trough does not show the shell hollow. */
const HOOD_Z = -0.23
const HOOD_T = 0.20

/**
 * A monitor is a real object, so its case size is fixed and only its spacing answers to the count. Sizing
 * the bezel off the pitch instead — as this did while the bank was one screen per metre of perch — turns
 * three monitors on a fourteen-metre run into three four-metre televisions.
 */
const MONITOR_W = 0.86
const MONITOR_GAP = 0.14
const MONITOR_FACE_INSET = 0.05
const MONITOR_CHEEK = 0.05

/**
 * Debris screen between the body top and the canopy soffit: the band the crew look at the track through.
 *
 * It is doing two jobs. It is the correct part — a perch is glazed above its counter — and it is what
 * stops the gap under the roof reading as a hole. Left open, the strongest camera angle for this prop
 * looks straight through the shelter at the sky, and no amount of correct dimension survives that.
 */
const VISOR_BOT = BODY_TOP + 0.02
const VISOR_TOP = 2.00
const VISOR_Z = TRACK_Z + 0.07

/**
 * An even row of `count` items centred on the origin across `span`, each on the middle of its own share
 * of the run.
 *
 * Both the stool row and the monitor bank are laid out with this, over the same span, which is what makes
 * the default one-screen-per-two-seats bank land exactly between the pairs it serves.
 */
function rowAcross(span: number, count: number): number[] {
  const step = span / count
  return Array.from({ length: count }, (_, i) => -span / 2 + (i + 0.5) * step)
}

/**
 * Moves a piece of roof hardware clear of the stool it would otherwise pass through, to the nearer of the
 * two gaps either side of that stool.
 *
 * The hardware is placed off the bay pitch and the stools are placed off the seat count, so the two rows
 * only line up by coincidence. A strut through a headrest is invisible in a merged batch right up until
 * someone looks at the prop from the side.
 */
function clearOfStools(x: number, seatXs: number[], clear: number): number {
  const hit = seatXs.findIndex((sx) => Math.abs(x - sx) < clear)
  if (hit < 0) return x
  const seat = seatXs[hit]!
  const before = hit > 0 ? (seatXs[hit - 1]! + seat) / 2 : seat - clear
  const after = hit < seatXs.length - 1 ? (seat + seatXs[hit + 1]!) / 2 : seat + clear
  return Math.abs(before - x) <= Math.abs(after - x) ? before : after
}

/**
 * Raked canopy, authored in its own tilted frame by {@link canopyFrame} / {@link onCanopy}.
 *
 * Its depth is the one dimension in the prop that answers to configuration rather than to the envelope.
 * A roof that shelters nobody has no reason to leave the 1.00 m signalling envelope, and the bare shell
 * has to stay inside it to abut; a roof over a row of stools has every reason to, because the stools are
 * already outside it. So the canopy grows with the seating it covers. Sized from the stool row: the
 * sheltered leaf clears the headrests by roughly 0.2 m, which is what makes the overhang read as cover
 * rather than as a lid stopping short.
 */
const CANOPY_T = 0.09
const CANOPY_TILT = 0.14
const CANOPY_COS = Math.cos(CANOPY_TILT)
const CANOPY_SIN = Math.sin(CANOPY_TILT)
const CANOPY_PEAK = 2.16
const CANOPY_TRACK_Z = TRACK_Z + 0.01
const CANOPY_D_BARE = 1.13
const CANOPY_D_SHELTERED = 1.56

/** Radio whips on the roof's leading edge: the landmark that stops the silhouette being a slab. */
const MAST_TIP = TOTAL_H - 0.01

/** End panels close the run. Their top edge follows the roof rake rather than cutting square across it. */
const END_PANEL_W = 0.09
const END_PANEL_D = 0.86
const END_PANEL_Z = -0.06
const END_TOP_TRACK = 2.00
const END_TOP_LANE = 1.88

/**
 * Branded graphics on the *track* elevation: a box-number plate flanked by sponsor boards, low on the
 * concrete where a driver reads them on the way past.
 *
 * They used to sit on the pit-lane face and that was the single worst thing on the prop. Mapped cards
 * bring their own background value with them, and a strip of them across fourteen metres turned the one
 * elevation that has to read as a single sheet of team colour into a ticker tape. On the track side they
 * are where pit-wall advertising actually goes, and the lane face stays pure brand.
 */
const GRAPHIC_H = 0.30
const GRAPHIC_Y = 0.42
const GRAPHIC_Z = TRACK_Z - LAYER_CLEARANCE
const PLATE_W = 0.62
const SPONSOR_W = 2.2

/**
 * Stool row on the pit-lane working face. Furniture, so it stands proud of the depth envelope.
 *
 * Wide enough that the row nearly closes up along the run. Narrow buckets on a one-metre pitch leave
 * more gap than seat, and the row stops reading as occupied seating and starts reading as a fence.
 */
const STOOL_Z = LANE_Z + 0.14
const STOOL_W = 0.60
const STOOL_PAN_Y = 1.02
const STOOL_POST_BOT = 0.60
const STOOL_LEAN = 0.09

/** Bay-relative X offsets for the roof hardware. {@link clearOfStools} moves them off the seat row. */
const STRUT_OFFSET = 1.5
const WHIP_OFFSET = 2.5

interface Piece {
  readonly name: string
  readonly slot: Slot
  readonly geometry: BufferGeometry
  readonly tint?: keyof F1Materials
  readonly material?: Material
}

/** The roof plane's placement, derived from its depth so the track edge and peak stay put. */
interface CanopyFrame {
  readonly depth: number
  readonly y: number
  readonly z: number
}

function canopyFrame(sheltered: boolean): CanopyFrame {
  const depth = sheltered ? CANOPY_D_SHELTERED : CANOPY_D_BARE
  return {
    depth,
    y: CANOPY_PEAK - ((CANOPY_T / 2) * CANOPY_COS + (depth / 2) * CANOPY_SIN),
    z: CANOPY_TRACK_Z + (CANOPY_T / 2) * CANOPY_SIN + (depth / 2) * CANOPY_COS,
  }
}

function bayLabel(labels: string[] | undefined, index: number): string {
  if (labels?.[index]) return String(labels[index]).slice(0, 3)
  return index === 0 ? '11' : String(index + 1)
}

function hexRgb(hex: number): [number, number, number] {
  return [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255]
}

function brandMaterial(name: string, hex: number, roughness = 0.52, metalness = 0.08): MeshStandardMaterial {
  return new MeshStandardMaterial({
    name,
    color: new Color(hex),
    roughness,
    metalness,
  })
}

/** Moves a part authored at the roof's own origin into the tilted canopy frame. */
function onCanopy(frame: CanopyFrame, geometry: BufferGeometry, localY: number, localZ: number): BufferGeometry {
  geometry.translate(0, localY, localZ)
  geometry.rotateX(CANOPY_TILT)
  geometry.translate(0, frame.y, frame.z)
  return geometry
}

/** World position of a point on the roof plane, for parts that have to land on it from outside. */
function canopyPoint(frame: CanopyFrame, localY: number, localZ: number): { y: number; z: number } {
  return {
    y: frame.y + localY * CANOPY_COS - localZ * CANOPY_SIN,
    z: frame.z + localY * CANOPY_SIN + localZ * CANOPY_COS,
  }
}

/** Leans a stool part back about its own centre, then seats it. Crew face -Z, so backs tilt toward +Z. */
function leanBack(geometry: BufferGeometry, x: number, y: number, z: number): BufferGeometry {
  geometry.rotateX(STOOL_LEAN)
  geometry.translate(x, y, z)
  return geometry
}

/**
 * Turns a mapped plane to face -Z with its image still reading the right way round.
 *
 * A bare `rotateY` puts the front face on the track but mirrors every glyph with it, so the U axis has
 * to be flipped back by hand.
 */
function faceTrack(geometry: PlaneGeometry): PlaneGeometry {
  geometry.rotateY(Math.PI)
  const uv = geometry.getAttribute('uv')
  for (let i = 0; i < uv.count; i++) uv.setX(i, 1 - uv.getX(i))
  uv.needsUpdate = true
  return geometry
}

/**
 * An end panel: a raked-top plate closing one end of the run.
 *
 * Authored as a (Z, Y) profile extruded through the panel thickness and swung onto X, because the edge
 * that has to follow the roof rake is the one in the ZY plane — rule 4, choose the extrusion axis from
 * the facets the silhouette needs.
 */
function endPanel(x: number): BufferGeometry {
  const halfD = END_PANEL_D / 2
  const yc = (SHELF_H + (END_TOP_TRACK + END_TOP_LANE) / 2) / 2
  const geo = bevelPrism([
    [-halfD, SHELF_H - yc],
    [halfD, SHELF_H - yc],
    [halfD, END_TOP_LANE - yc],
    [-halfD, END_TOP_TRACK - yc],
  ], END_PANEL_W, 0.008)
  geo.rotateY(-Math.PI / 2)
  geo.translate(x, yc, END_PANEL_Z)
  return geo
}

/**
 * The parts that run the whole installation, batched by material rather than by name.
 *
 * Read bottom to top the elevation is concrete, then one continuous run of team colour broken only by
 * the desk shadow line, then the visor band, then the roof. That single large brand fill is the whole
 * point of the typology: the enclosure *is* the livery.
 */
function spinePieces(
  span: number, bays: number, roof: CanopyFrame,
  brand: Material, deep: Material, accent: Material,
): Piece[] {
  const concrete: BufferGeometry[] = []
  const shellBrand: BufferGeometry[] = []
  const shellDeep: BufferGeometry[] = []
  const shellAccent: BufferGeometry[] = []
  const hardware: BufferGeometry[] = []
  const panes: BufferGeometry[] = []
  const halfD = roof.depth / 2

  // --- concrete barrier and footing ------------------------------------------------------------
  const footing = bevelBox(span, FOOTING_H, FOOTING_T, 0.012)
  footing.translate(0, FOOTING_H / 2, TRACK_Z + FOOTING_T / 2)
  concrete.push(footing)

  const barrier = bevelBox(span, BARRIER_H, BARRIER_T, 0.014)
  barrier.translate(0, BARRIER_H / 2, TRACK_Z + BARRIER_T / 2)
  concrete.push(barrier)

  const coping = bevelBox(span, COPING_H, COPING_T, 0.010)
  coping.translate(0, BARRIER_H + COPING_H / 2, TRACK_Z + COPING_T / 2)
  hardware.push(coping)

  // --- clad plinth and desk -------------------------------------------------------------------
  const plinthD = PLINTH_LANE_Z - PLINTH_TRACK_Z
  const plinth = bevelBox(span, PLINTH_TOP - PLINTH_BOT, plinthD, 0.012)
  plinth.translate(0, (PLINTH_BOT + PLINTH_TOP) / 2, PLINTH_TRACK_Z + plinthD / 2)
  shellBrand.push(plinth)

  const deck = bevelBox(span, DECK_T, DEPTH, 0.010)
  deck.translate(0, SHELF_H - DECK_T / 2, 0)
  shellBrand.push(deck)

  const nosing = bevelBox(span, NOSING_H, NOSING_T, 0.008)
  nosing.translate(0, SHELF_H + NOSING_PROUD - NOSING_H / 2, LANE_Z - NOSING_T / 2)
  shellDeep.push(nosing)

  const kick = bevelBox(span, 0.08, 0.05, 0.006)
  kick.translate(0, PLINTH_BOT + 0.05, PLINTH_LANE_Z - 0.005)
  hardware.push(kick)

  // Panel joints at the bay seams. A fourteen-metre clad face with no break reads as a decal, not a
  // panelised enclosure, and the seam is where a real one would be.
  for (let j = 1; j < bays; j++) {
    const jx = -span / 2 + j * GARAGE_BAY_PITCH
    const seam = bevelBox(0.035, PLINTH_TOP - PLINTH_BOT - 0.04, 0.03, 0.004)
    seam.translate(jx, (PLINTH_BOT + PLINTH_TOP) / 2, PLINTH_LANE_Z)
    shellDeep.push(seam)
  }

  // --- body: brand kerb, track wall, and an open monitor trough between them --------------------
  const bodyD = BODY_LANE_Z - BODY_TRACK_Z
  const bodyZ = BODY_TRACK_Z + bodyD / 2

  const kerb = bevelBox(span, KERB_TOP - SHELF_H, bodyD, 0.010)
  kerb.translate(0, (SHELF_H + KERB_TOP) / 2, bodyZ)
  shellBrand.push(kerb)

  const trackWall = bevelBox(span, BODY_TOP - KERB_TOP, TRACK_WALL_T, 0.010)
  trackWall.translate(0, (KERB_TOP + BODY_TOP) / 2, BODY_TRACK_Z + TRACK_WALL_T / 2)
  shellBrand.push(trackWall)

  // Returns at the extreme ends close the trough so the run does not read as a cut-off extrusion.
  for (const side of [-1, 1] as const) {
    const ret = bevelBox(0.09, BODY_TOP - KERB_TOP + 0.04, bodyD, 0.008)
    ret.translate(side * (span / 2 - 0.045), (KERB_TOP + BODY_TOP) / 2 - 0.02, bodyZ)
    shellBrand.push(ret)
  }

  const housing = bevelBox(span - 0.14, SLOT_TOP - KERB_TOP + 0.02, HOUSING_T, 0.006)
  housing.translate(0, SCREEN_Y, HOUSING_Z)
  hardware.push(housing)

  const hood = bevelBox(span - 0.14, 0.04, HOOD_T, 0.005)
  hood.translate(0, BODY_TOP - 0.02, HOOD_Z)
  shellDeep.push(hood)

  // --- visor glazing above the body ------------------------------------------------------------
  const visorH = VISOR_TOP - VISOR_BOT
  const lights = bays * 4
  const lightStep = span / lights

  const sill = bevelBox(span, 0.05, 0.08, 0.006)
  sill.translate(0, VISOR_BOT - 0.01, VISOR_Z)
  shellDeep.push(sill)
  const head = bevelBox(span, 0.06, 0.08, 0.006)
  head.translate(0, VISOR_TOP + 0.015, VISOR_Z)
  shellDeep.push(head)

  for (let m = 0; m <= lights; m++) {
    const inset = m === 0 ? 0.03 : m === lights ? -0.03 : 0
    const mullion = bevelBox(0.05, visorH, 0.05, 0.005)
    mullion.translate(-span / 2 + m * lightStep + inset, (VISOR_BOT + VISOR_TOP) / 2, VISOR_Z + 0.008)
    hardware.push(mullion)
  }
  for (let p = 0; p < lights; p++) {
    const pane = bevelBox(lightStep - 0.07, visorH - 0.03, 0.014, 0.003)
    pane.translate(-span / 2 + (p + 0.5) * lightStep, (VISOR_BOT + VISOR_TOP) / 2, VISOR_Z)
    panes.push(pane)
  }

  // --- end panels and canopy ------------------------------------------------------------------
  for (const side of [-1, 1] as const) {
    shellBrand.push(endPanel(side * (span / 2 - END_PANEL_W / 2 - 0.005)))
  }

  shellBrand.push(onCanopy(roof, bevelBox(span, CANOPY_T, roof.depth, 0.008), 0, 0))

  // A standing lip on the high edge. Without it the roof's far side is a knife edge against the sky and
  // the whole canopy flattens into a card; with it the roof reads as a fabricated tray.
  shellBrand.push(onCanopy(
    roof,
    bevelBox(span, 0.06, 0.05, 0.006),
    CANOPY_T / 2 + 0.025,
    -(halfD - 0.03),
  ))

  shellDeep.push(onCanopy(
    roof,
    bevelBox(span - 0.08, 0.022, roof.depth - 0.14, 0.005),
    -CANOPY_T / 2 - 0.011,
    0,
  ))

  shellAccent.push(onCanopy(
    roof,
    bevelBox(span, 0.075, 0.055, 0.006),
    -CANOPY_T / 2 - 0.024,
    halfD - 0.03,
  ))

  // Roof emblems. From any camera high enough to read a perch the canopy is the largest single plane in
  // the prop, and an unmarked one reads as a painted lid. Authored as accent geometry rather than a
  // decal sheet: a mapped card brings its own background value onto a face that has to stay one colour.
  for (let b = 0; b < bays; b++) {
    const bx = -span / 2 + (b + 0.5) * GARAGE_BAY_PITCH
    for (const side of [-1, 1] as const) {
      const emblem = bevelDisc(0.26, 0.016, 0.004, 26)
      emblem.rotateX(-Math.PI / 2)
      onCanopy(roof, emblem, CANOPY_T / 2 + 0.002, halfD - 0.42)
      emblem.translate(bx + side * 1.7, 0, 0)
      shellAccent.push(emblem)
    }
  }

  return [
    { name: 'barrier', slot: 'shell', geometry: mergeParts(concrete, 'f1-pit-wall: barrier') },
    { name: 'hardware', slot: 'shell', geometry: mergeParts(hardware, 'f1-pit-wall: hardware'), tint: 'graphite' },
    { name: 'shell-brand', slot: 'shell', geometry: mergeParts(shellBrand, 'f1-pit-wall: shell'), material: brand },
    { name: 'shell-shade', slot: 'shell', geometry: mergeParts(shellDeep, 'f1-pit-wall: shade'), material: deep },
    { name: 'shell-accent', slot: 'shell', geometry: mergeParts(shellAccent, 'f1-pit-wall: accent'), material: accent },
    { name: 'screen-panes', slot: 'glass', geometry: mergeParts(panes, 'f1-pit-wall: glazing') },
  ]
}

/**
 * Roof whips and the struts that explain the canopy overhang, for the whole installation.
 *
 * Two of each per bay, moved off any stool they would have run through, then de-duplicated: once the
 * hardware is free to slide, two neighbouring bays can be nudged onto the same gap and stack a whip on a
 * whip. Dropping the duplicate keeps the run symmetrical, which the bay offsets alone no longer are.
 */
function framePieces(span: number, bays: number, roof: CanopyFrame, seatXs: number[]): Piece[] {
  const parts: BufferGeometry[] = []
  const halfD = roof.depth / 2
  const soffit = canopyPoint(roof, -CANOPY_T / 2, halfD - 0.09)
  const whip = canopyPoint(roof, CANOPY_T / 2, halfD - 0.12)
  const clear = STOOL_W / 2 + 0.06

  const row = (offset: number): number[] => {
    const xs: number[] = []
    for (let i = 0; i < bays; i++) {
      const bx = -span / 2 + (i + 0.5) * GARAGE_BAY_PITCH
      for (const side of [-1, 1] as const) {
        const x = clearOfStools(bx + side * offset, seatXs, clear)
        if (!xs.some((other) => Math.abs(other - x) < 0.05)) xs.push(x)
      }
    }
    return xs
  }

  for (const x of row(STRUT_OFFSET)) {
    parts.push(member(
      new Vector3(x, BODY_TOP - 0.03, BODY_LANE_Z),
      new Vector3(x, soffit.y - 0.01, soffit.z),
      0.022,
    ))
  }

  for (const x of row(WHIP_OFFSET)) {
    const boss = bevelBox(0.06, 0.05, 0.06, 0.006)
    boss.translate(x, whip.y + 0.01, whip.z)
    parts.push(boss)
    parts.push(tubeSection(
      0.011,
      MAST_TIP - whip.y,
      [x, (whip.y + MAST_TIP) / 2, whip.z],
      AXIS_Y,
      8,
    ))
  }

  return [{
    name: 'frame',
    slot: 'shell',
    geometry: mergeParts(parts, 'f1-pit-wall: frame'),
    tint: 'graphite',
  }]
}

/**
 * The monitor bank: `count` screens spread along the dark trough on the pit-lane elevation.
 *
 * The lit faces point at +Z and tip up because that is where the engineers are and how they read them.
 * Turned on the track they were technically a monitor bank and practically a row of screens nobody could
 * see: the beauty camera has to sit on the working side to catch the stools at all, and from there not
 * one lit pixel reached it.
 *
 * The housing behind them runs the whole span, so a sparse bank still reads as a fitted-out trough rather
 * than as screens floating in a gap.
 */
function bankPieces(span: number, count: number, lit: Material): Piece[] {
  const step = span / count
  const width = Math.max(0.20, Math.min(MONITOR_W, step - MONITOR_GAP))
  const bezelH = SLOT_TOP - KERB_TOP - 0.06
  const shells: BufferGeometry[] = []
  const screens: BufferGeometry[] = []

  for (const sx of rowAcross(span, count)) {
    const bezel = bevelBox(width, bezelH, BEZEL_T, 0.005)
    bezel.rotateX(MONITOR_TILT)
    bezel.translate(sx, SCREEN_Y, BEZEL_Z)
    shells.push(bezel)

    // A cheek each side. One divider between stations was enough while the screens touched; a screen
    // standing alone in the trough needs both to read as a mounted case rather than a floating panel.
    for (const side of [-1, 1] as const) {
      const fin = bevelBox(MONITOR_CHEEK, SLOT_TOP - KERB_TOP, 0.07, 0.005)
      fin.translate(sx + side * (width / 2 + MONITOR_CHEEK / 2 + 0.01), SCREEN_Y, BEZEL_Z + 0.02)
      shells.push(fin)
    }

    const face = new PlaneGeometry(width - MONITOR_FACE_INSET * 2, bezelH - 0.07)
    face.translate(0, 0, BEZEL_T / 2 + LAYER_CLEARANCE)
    face.rotateX(MONITOR_TILT)
    face.translate(sx, SCREEN_Y, BEZEL_Z)
    screens.push(face)
  }

  return [
    { name: 'bank', slot: 'shell', geometry: mergeParts(shells, 'f1-pit-wall: bank'), tint: 'graphite' },
    { name: 'screens', slot: 'fascia', geometry: mergeParts(screens, 'f1-pit-wall: screens'), material: lit },
  ]
}

/**
 * The crew seating: one high-backed stool on each `seatXs` station, not a continuous bench.
 *
 * The count is the team's, so it comes from configuration and spreads over the whole run. Deriving it
 * from the bay pitch instead sat seven engineers in every seven metres of building, which is a property
 * of the garage behind the perch and of nothing else.
 *
 * A bench reads as street furniture. What makes a perch a perch is the repeated bucket — a pan, a raked
 * back with side bolsters, and a headrest standing above the body line — so the row of them is the
 * second strongest thing in the silhouette after the roof. The headrest takes the deep brand shade
 * rather than the accent: a row of bright pads out-reads the roof it is supposed to sit under.
 *
 * The back and bolsters sit over the rear of the pan rather than behind it, which keeps the whole row
 * inside the canopy's sheltered leaf.
 */
function benchPieces(span: number, seatXs: number[], brand: Material, padMat: Material): Piece[] {
  const frame: BufferGeometry[] = []
  const seats: BufferGeometry[] = []
  const pads: BufferGeometry[] = []

  // One continuous footrest rail. Per-bay segments butt-jointed mid-row wherever the seat pitch and the
  // bay pitch disagreed, which they now do by default.
  const footrest = bevelBox(span - 0.20, 0.06, 0.09, 0.006)
  footrest.translate(0, 0.66, STOOL_Z - 0.06)
  frame.push(footrest)

  for (const sx of seatXs) {
    const post = bevelBox(0.10, STOOL_PAN_Y - STOOL_POST_BOT, 0.12, 0.008)
    post.translate(sx, (STOOL_POST_BOT + STOOL_PAN_Y) / 2, STOOL_Z - 0.04)
    frame.push(post)
    frame.push(member(
      new Vector3(sx, 0.64, PLINTH_LANE_Z),
      new Vector3(sx, 0.96, STOOL_Z - 0.02),
      0.019,
    ))

    const pan = bevelBox(STOOL_W, 0.10, 0.42, 0.010)
    pan.translate(sx, STOOL_PAN_Y, STOOL_Z)
    seats.push(pan)

    seats.push(leanBack(
      bevelBox(STOOL_W - 0.14, 0.58, 0.10, 0.010),
      sx, STOOL_PAN_Y + 0.34, STOOL_Z + 0.11,
    ))

    // Bolsters wrap forward past the back so the bucket has a section, not just a plate.
    for (const side of [-1, 1] as const) {
      seats.push(leanBack(
        bevelBox(0.07, 0.50, 0.30, 0.008),
        sx + side * (STOOL_W / 2 - 0.035), STOOL_PAN_Y + 0.30, STOOL_Z + 0.01,
      ))
    }

    pads.push(leanBack(
      bevelBox(STOOL_W - 0.16, 0.15, 0.11, 0.008),
      sx, STOOL_PAN_Y + 0.69, STOOL_Z + 0.14,
    ))
  }

  return [
    { name: 'bench-frame', slot: 'shell', geometry: mergeParts(frame, 'f1-pit-wall: stool frame'), tint: 'graphite' },
    { name: 'bench-seats', slot: 'shell', geometry: mergeParts(seats, 'f1-pit-wall: stool seats'), material: brand },
    { name: 'bench-pads', slot: 'shell', geometry: mergeParts(pads, 'f1-pit-wall: stool pads'), material: padMat },
  ]
}

export function createModel(options: F1PitWallOptions = {}): F1PitWallInstance {
  const seats = clampCount(options.seats ?? defaults.seats)
  const config: ResolvedConfig = {
    bays: clampCount(options.bays ?? defaults.bays),
    labels: options.labels,
    legend: options.legend ?? defaults.legend,
    primary: options.primary ?? defaults.primary,
    accent: options.accent ?? defaults.accent,
    platePaper: options.platePaper ?? defaults.platePaper,
    plateInk: options.plateInk ?? defaults.plateInk,
    benches: options.benches ?? defaults.benches,
    seats,
    tvs: options.tvs === undefined ? monitorsFor(seats) : clampCount(options.tvs),
  }

  /**
   * A `tvs` the caller never set tracks the seat count, so adding engineers adds the screens to serve
   * them. One they did set is a decision, and stays put across later `configure` calls.
   */
  let tvsPinned = options.tvs !== undefined

  const bundle = acquireF1Materials()
  const kit = bundle.materials
  const ownsFascia = options.materials?.fascia === undefined

  /** Live for the whole instance. Consumer-supplied materials never land here (rule 16). */
  const ownedOnce: Material[] = []
  /** Rebuilt with the geometry, so released on every rebuild. */
  const perBuild: Material[] = []
  const perBuildTextures: DataTexture[] = []

  const glassMat = options.materials?.glass ?? (() => {
    const mat = new MeshStandardMaterial({
      name: 'f1-kit / pit wall glazing',
      color: 0x0a1218,
      roughness: 0.08,
      metalness: 0.1,
      transparent: true,
      opacity: 0.48,
    })
    ownedOnce.push(mat)
    return mat
  })()

  // Live telemetry, not a lamp: `kit.cyan` is an untone-mapped signal lens, and it turns a bank of
  // twenty-odd monitors into a single flat sheet of light.
  const screenMat = new MeshStandardMaterial({
    name: 'f1-kit / pit wall monitor',
    color: shade(TOKEN.INK_950, 0.06),
    emissive: TOKEN.CYAN_400,
    emissiveIntensity: 0.55,
    roughness: 0.24,
    metalness: 0.0,
  })
  ownedOnce.push(screenMat)

  const materialSlots: Record<Slot, Material> = {
    shell: options.materials?.shell ?? kit.slate,
    glass: glassMat,
    fascia: options.materials?.fascia ?? kit.shell,
  }

  const root = new Group(); root.name = 'f1-pit-wall'
  const shell = new Group(); shell.name = 'shell'
  const glass = new Group(); glass.name = 'glass'
  const fascia = new Group(); fascia.name = 'fascia'
  root.add(shell, glass, fascia)
  const groupOf: Record<Slot, Group> = { shell, glass, fascia }

  const generated: BufferGeometry[] = []
  const meshesBySlot: Record<Slot, Mesh[]> = { shell: [], glass: [], fascia: [] }
  let disposed = false

  const releaseGenerated = (): void => {
    shell.clear(); glass.clear(); fascia.clear()
    for (const geometry of generated) geometry.dispose()
    generated.length = 0
    for (const slot of Object.keys(meshesBySlot) as Slot[]) meshesBySlot[slot].length = 0
    for (const texture of perBuildTextures) texture.dispose()
    perBuildTextures.length = 0
    for (const material of perBuild) material.dispose()
    perBuild.length = 0
  }

  const emit = (slot: Slot, geometry: BufferGeometry, group: Group, name: string, material?: Material): void => {
    generated.push(geometry)
    const mesh = new Mesh(geometry, material ?? materialSlots[slot])
    mesh.name = name
    mesh.userData.topologyRole = name.includes('bench') || name.includes('monitor') || name.includes('screen') || name.includes('counter') ? 'detail' : 'hull'
    mesh.castShadow = true
    mesh.receiveShadow = true
    meshesBySlot[slot].push(mesh)
    group.add(mesh)
  }

  const emitPiece = (piece: Piece): void => {
    const material = piece.material ?? (piece.tint ? kit[piece.tint] : undefined)
    emit(piece.slot, piece.geometry, groupOf[piece.slot], piece.name, material)
  }

  /**
   * The bay's graphics, on the track elevation: sponsor boards flanking a centred box-number plate. The
   * plate is a dark board with a light numeral, not the default white paper — a white rectangle at this
   * size out-reads every other element in the prop.
   */
  const emitGraphics = (x: number, index: number, sponsorMat: Material): void => {
    const boards: BufferGeometry[] = []
    for (const side of [-1, 1] as const) {
      const board = faceTrack(new PlaneGeometry(SPONSOR_W, GRAPHIC_H))
      board.translate(x + side * (PLATE_W / 2 + 0.25 + SPONSOR_W / 2), GRAPHIC_Y, GRAPHIC_Z)
      boards.push(board)
    }
    emit('fascia', mergeParts(boards, `f1-pit-wall: sponsor ${index}`), fascia, `sponsor-${index}`, sponsorMat)

    const plate = faceTrack(new PlaneGeometry(PLATE_W, GRAPHIC_H))
    plate.translate(x, GRAPHIC_Y, GRAPHIC_Z)
    if (!ownsFascia) {
      emit('fascia', plate, fascia, `plate-${index}`)
      return
    }
    const accent = config.accent ?? defaults.accent!
    const paperHex = config.platePaper ?? defaults.platePaper!
    const inkHex = config.plateInk ?? defaults.plateInk!
    const texture = fasciaTexture({
      number: bayLabel(config.labels, index),
      legend: String(config.legend ?? defaults.legend ?? 'PIT').slice(0, 8),
      paper: hexRgb(paperHex),
      ink: hexRgb(inkHex),
      accent: hexRgb(accent),
    })
    perBuildTextures.push(texture)
    const material = new MeshStandardMaterial({
      name: `f1-kit / pit fascia ${index}`,
      map: texture,
      roughness: 0.55,
      metalness: 0.05,
    })
    perBuild.push(material)
    emit('fascia', plate, fascia, `plate-${index}`, material)
  }

  const rebuild = (): void => {
    releaseGenerated()
    const bays = config.bays
    const span = bays * GARAGE_BAY_PITCH
    const seated = config.benches !== false
    const roof = canopyFrame(seated)
    const seatXs = seated ? rowAcross(span, config.seats) : []
    const primary = config.primary ?? defaults.primary!
    const accent = config.accent ?? defaults.accent!

    const brandMat = brandMaterial('f1-kit / pit wall brand', primary, 0.5, 0.08)
    const deepMat = brandMaterial('f1-kit / pit wall brand shade', shade(primary, -0.42), 0.62, 0.05)
    const accentMat = brandMaterial('f1-kit / pit wall accent', accent, 0.46, 0.12)
    perBuild.push(brandMat, deepMat, accentMat)

    const papers: Array<readonly [number, number, number]> = [
      hexRgb(accent),
      hexRgb(shade(accent, 0.2)),
      [242, 244, 246],
      hexRgb(shade(primary, -0.4)),
      hexRgb(accent),
      [12, 12, 14],
    ]
    const sponsorTexture = sponsorWallTexture({ width: 384, height: 256, columns: 3, rows: 2, papers })
    sponsorTexture.wrapS = RepeatWrapping
    sponsorTexture.repeat.set(1, 0.5)
    perBuildTextures.push(sponsorTexture)
    const sponsorMat = new MeshStandardMaterial({
      name: 'f1-kit / pit wall sponsor run',
      map: sponsorTexture,
      roughness: 0.62,
      metalness: 0.05,
    })
    perBuild.push(sponsorMat)

    for (const piece of spinePieces(span, bays, roof, brandMat, deepMat, accentMat)) emitPiece(piece)
    for (const piece of framePieces(span, bays, roof, seatXs)) emitPiece(piece)
    for (const piece of bankPieces(span, config.tvs, screenMat)) emitPiece(piece)
    if (seated) {
      for (const piece of benchPieces(span, seatXs, brandMat, deepMat)) emitPiece(piece)
    }

    // The graphics are the one run of parts still counted per bay: a box number belongs to a garage.
    for (let i = 0; i < bays; i++) {
      emitGraphics(-span / 2 + (i + 0.5) * GARAGE_BAY_PITCH, i, sponsorMat)
    }
  }
  rebuild()

  return {
    root,
    parts: { shell, glass, fascia },
    materials: materialSlots,
    getConfig: () => ({
      ...config,
      labels: config.labels ? [...config.labels] : undefined,
    }),
    configure(patch) {
      if (patch.bays !== undefined) config.bays = clampCount(patch.bays)
      if (patch.labels !== undefined) config.labels = patch.labels ? [...patch.labels] : undefined
      if (patch.legend !== undefined) config.legend = String(patch.legend).slice(0, 8)
      if (patch.primary !== undefined) config.primary = patch.primary
      if (patch.accent !== undefined) config.accent = patch.accent
      if (patch.platePaper !== undefined) config.platePaper = patch.platePaper
      if (patch.plateInk !== undefined) config.plateInk = patch.plateInk
      if (patch.benches !== undefined) config.benches = patch.benches
      if (patch.seats !== undefined) config.seats = clampCount(patch.seats)
      if (patch.tvs !== undefined) {
        config.tvs = clampCount(patch.tvs)
        tvsPinned = true
      }
      if (!tvsPinned) config.tvs = monitorsFor(config.seats)
      rebuild()
    },
    setMaterial(slot, material) {
      materialSlots[slot] = material
      for (const mesh of meshesBySlot[slot]) mesh.material = material
    },
    update: () => {},
    dispose() {
      if (disposed) return
      disposed = true
      releaseGenerated()
      for (const material of ownedOnce) material.dispose()
      ownedOnce.length = 0
      disposeF1Materials(bundle)
      root.removeFromParent()
    },
  }
}

/**
 * Three-quarter framing from the pit-lane / seating side, high enough to look along the roof and down
 * into the monitor trough between the stools.
 *
 * The reference is shot from a grandstand above the pit lane, and that camera is doing real work: it is
 * the only station point from which the canopy's top plane, the raked overhang, the stool row and the
 * clad plinth all read at once. A near-frontal view of a 14 m run only 1.00 m deep is an elevation
 * drawing — every mass collapses onto the plinth and the prop reads as a billboard — so the view stays
 * oblique.
 *
 * Distance is set by the run, not the section. Closer than about 20 m the near bay leaves the frame
 * while the far bay is still mid-shot, and the prop reads as a fragment of a wall rather than a whole
 * perch; the oblique has to be eased off at the same time or the two ends never share a frame.
 */
export function createPreview({ aspect }: { aspect: number; time?: number }) {
  return createF1Preview(createModel({
    bays: 2,
    labels: ['16', '55'],
    legend: 'FER',
    primary: 0xe10600,
    accent: 0xffe014,
    benches: true,
  }), {
    aspect,
    target: [-0.35, 1.24, 0.16],
    distance: 22.5,
    fov: 29,
    yaw: -0.80,
    pitch: 0.25,
  })
}
