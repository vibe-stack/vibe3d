import { Group, MeshPhysicalMaterial } from 'three/webgpu'
import {
  MaterialLibrary, cylinder, extrudeProfile, groove, prism, tuneMaterial,
  type Corners, type MaterialHandle, type Vec2, type Vec3,
} from '../../../src/asset-forge/generator/index.ts'

/**
 * The shared hard-surface vocabulary for the Axiom architecture kit.
 *
 * Every prefab and connector in the kit is assembled from the same six pieces:
 * a stepped plinth, a structural post, a wall cassette run, a clipped-corner
 * opening, a top ring beam, and a floor bay. Building them here - rather than
 * once per prototype - is what makes a door bay authored on its own line up
 * with the same opening cut into a building shell.
 *
 * The construction rules that matter:
 *
 * - Depth is layered, never coplanar. The dark structural core sits at the wall
 *   centre, the pale cassette rides proud of it on a slightly larger dark
 *   backing plate, and applied trim sits proud of that again. Each step is at
 *   least 15 mm, so nothing z-fights and every layer earns a bevel highlight.
 * - Openings are ring assemblies, not booleans. Four straight bars and four
 *   clipped corner pentagons tile the region between an aperture and its host
 *   rectangle exactly. The same routine produces the wall around a door, the
 *   proud frame flange, and the deep reveal lining the jamb.
 * - Detail concentrates on posts, openings and junctions. Broad wall and beam
 *   faces stay as single beveled solids.
 */

export interface KitMaterials {
  /** Light composite infill cassettes. */
  readonly shell: MeshPhysicalMaterial
  /** Dark painted structural frame: posts, beams, plinth, wall cores. */
  readonly graphite: MeshPhysicalMaterial
  /** Deep recesses, vents, reveals, glass. */
  readonly ink: MeshPhysicalMaterial
  /** Bright machined trim rails and hardware. */
  readonly steel: MeshPhysicalMaterial
  /** Cooler, more matte floor and lower service band. */
  readonly deck: MeshPhysicalMaterial
  /** Saturated livery blue, for identity panels and equipment caps. */
  readonly accent: MeshPhysicalMaterial
  readonly amber: MeshPhysicalMaterial
  readonly cyan: MeshPhysicalMaterial
}

export interface KitMaterialSet {
  readonly materials: KitMaterials
  readonly handles: readonly MaterialHandle[]
}

export function createKitMaterials(seed = 4100): KitMaterialSet {
  const library = new MaterialLibrary()
  const shell = library.acquire({ recipeId: 'MAT-04', palette: 'SHELL-200', condition: 'clean', seed: seed + 1 })
  const graphite = library.acquire({ recipeId: 'MAT-03', palette: 'GRAPHITE-800', condition: 'clean', seed: seed + 2 })
  const ink = library.acquire({ recipeId: 'MAT-03', palette: 'INK-950', condition: 'clean', seed: seed + 3 })
  const steel = library.acquire({ recipeId: 'MAT-02', palette: 'STEEL', condition: 'clean', seed: seed + 4 })
  const deck = library.acquire({ recipeId: 'MAT-03', palette: 'DECK-700', condition: 'clean', seed: seed + 5 })
  const accent = library.acquire({ recipeId: 'MAT-04', palette: 'ACCENT-500', condition: 'clean', seed: seed + 8 })
  const amber = library.acquire({ recipeId: 'MAT-09', palette: 'AMBER-400', condition: 'active', seed: seed + 6 })
  const cyan = library.acquire({ recipeId: 'MAT-09', palette: 'CYAN-400', condition: 'active', seed: seed + 7 })
  return {
    materials: {
      // Painted, coated metal: restrained specular, no mirror response.
      shell: tuneMaterial(shell, 0x94958f, 0.66, 0.04),
      // Two steps darker than the cassettes it carries. Coated metal, so the
      // separation has to survive a strong key without going specular.
      graphite: tuneMaterial(graphite, 0x242b32, 0.58, 0.22),
      ink: tuneMaterial(ink, 0x0d1114, 0.68, 0.2),
      steel: tuneMaterial(steel, 0x7f888e, 0.4, 0.8),
      // Cooler and more matte than the frame; carries the floor and the impact
      // skirt, which must stay clearly darker than the pale infill.
      deck: tuneMaterial(deck, 0x2d353d, 0.8, 0.12),
      accent: tuneMaterial(accent, 0x27486d, 0.58, 0.18),
      amber: tuneMaterial(amber, 0xd98a1c, 0.3, 0.05, { emissive: 0.85 }),
      cyan: tuneMaterial(cyan, 0x2fbcd4, 0.3, 0.05, { emissive: 0.8 }),
    },
    handles: [shell, graphite, ink, steel, deck, accent, amber, cyan],
  }
}

/** Shared dimensions. Every structural break lands on the 0.25 m increment. */
export const KIT_BUILD = {
  wallThickness: 0.3,
  /** Interior floor surface, and the base of every wall and post. */
  floorY: 0.44,
  /**
   * Top of the wall cassettes; the ring beam laps down over this. The plate
   * reads as a shallow tray, not a room box: total height above the plinth is
   * held near 0.85x the width of one square bay, and the beam keeps its
   * absolute depth so it grows proportionally heavier.
   */
  wallTop: 2.95,
  beamBottom: 2.89,
  beamTop: 3.3,
  /** Top of the dark impact skirt: the lower ~22% of the wall. */
  skirtTop: 0.82,
  // Sized so a post stands ~85 mm proud of the cassettes it flanks. Flush with
  // them it stops reading as a column and dissolves into the wall.
  postSize: 0.66,
  junctionSize: 0.8,
} as const

const HALF = KIT_BUILD.wallThickness * 0.5

/** Exact top of every post cap, and so of every prefab assembled from them. */
export const POST_CAP_TOP = 3.5

/**
 * A wall's local frame. `u` runs along the wall, `y` is world height, and `w`
 * measures outward from the wall centreline, so one piece of authoring code
 * serves all four elevations plus both faces of a partition.
 */
export interface WallFace {
  readonly origin: Vec3
  readonly u: Vec3
  readonly n: Vec3
  readonly yaw: number
}

/** `yaw` is chosen so a prism's local +z lands on the face normal. */
export function wallFace(origin: Vec3, yaw: number): WallFace {
  const n: Vec3 = [Math.sin(yaw), 0, Math.cos(yaw)]
  // u = n rotated a quarter turn, so (u, up, n) stays right-handed.
  const u: Vec3 = [Math.cos(yaw), 0, -Math.sin(yaw)]
  return { origin, u, n, yaw }
}

export function facePoint(face: WallFace, u: number, y: number, w: number): Vec3 {
  return [
    face.origin[0] + face.u[0] * u + face.n[0] * w,
    y,
    face.origin[2] + face.u[2] * u + face.n[2] * w,
  ]
}

export interface FacePieceOptions {
  chamfer?: number | Corners
  fillet?: number
  bevel?: number
  /** Roll about the face normal, for diagonal knuckles and gussets. */
  roll?: number
}

/** A box authored in wall-local (u, y, w). `size` is [along u, up, through w]. */
export function facePrism(
  root: Group, face: WallFace, material: MeshPhysicalMaterial,
  size: Vec3, u: number, y: number, w: number, options: FacePieceOptions = {},
): void {
  root.add(prism(material, size, facePoint(face, u, y, w), {
    chamfer: options.chamfer,
    fillet: options.fillet ?? 0.02,
    bevel: options.bevel ?? 0.016,
    rotation: [0, face.yaw, options.roll ?? 0],
  }))
}

/** An arbitrary (u, y) profile extruded through the wall along the normal. */
export function faceProfile(
  root: Group, face: WallFace, material: MeshPhysicalMaterial,
  profile: readonly Vec2[], depth: number, w: number, options: FacePieceOptions = {},
): void {
  let minU = Infinity; let maxU = -Infinity; let minY = Infinity; let maxY = -Infinity
  for (const [u, y] of profile) {
    minU = Math.min(minU, u); maxU = Math.max(maxU, u)
    minY = Math.min(minY, y); maxY = Math.max(maxY, y)
  }
  const centreU = (minU + maxU) * 0.5
  const centreY = (minY + maxY) * 0.5
  const centred = profile.map(([u, y]): Vec2 => [u - centreU, y - centreY])
  root.add(extrudeProfile(material, centred, depth, facePoint(face, centreU, centreY, w), {
    fillet: options.fillet ?? 0.014,
    bevel: options.bevel ?? 0.012,
    rotation: [0, face.yaw, options.roll ?? 0],
  }))
}

/**
 * A ring of solid between an aperture and the rectangle hosting it.
 *
 * Corner order matches `prism`: [top-right, top-left, bottom-left, bottom-right]
 * in wall-local (u, y). The region is tiled by four straight bars and four
 * corner pentagons with no overlap, so the clipped-corner opening exists as
 * real geometry rather than as a Boolean scar dragged across the whole wall.
 */
export interface OpeningRing {
  /** Aperture bounds. */
  readonly uL: number
  readonly uR: number
  readonly yB: number
  readonly yT: number
  /** 45-degree cuts on the aperture corners. */
  readonly clip: Corners
  /** Host rectangle bounds. */
  readonly OL: number
  readonly OR: number
  readonly OB: number
  readonly OT: number
  /** 45-degree cuts on the host's own outer corners. */
  readonly outerClip?: Corners
}

const EPS = 1e-4

function rect(u0: number, y0: number, u1: number, y1: number): Vec2[] {
  return [[u0, y0], [u1, y0], [u1, y1], [u0, y1]]
}

function dedupe(points: readonly Vec2[]): Vec2[] {
  const out: Vec2[] = []
  for (const point of points) {
    const last = out[out.length - 1]
    if (last && Math.abs(last[0] - point[0]) < 1e-6 && Math.abs(last[1] - point[1]) < 1e-6) continue
    out.push(point)
  }
  const first = out[0]
  const last = out[out.length - 1]
  if (out.length > 1 && first && last && Math.abs(first[0] - last[0]) < 1e-6 && Math.abs(first[1] - last[1]) < 1e-6) out.pop()
  return out
}

export function ringPolygons(ring: OpeningRing): Vec2[][] {
  const [ctr, ctl, cbl, cbr] = ring.clip
  const [ktr, ktl, kbl, kbr] = ring.outerClip ?? [0, 0, 0, 0]
  const out: Vec2[][] = []
  if (ring.OT - ring.yT > EPS) out.push(rect(ring.uL + ctl, ring.yT, ring.uR - ctr, ring.OT))
  if (ring.yB - ring.OB > EPS) out.push(rect(ring.uL + cbl, ring.OB, ring.uR - cbr, ring.yB))
  if (ring.uL - ring.OL > EPS) out.push(rect(ring.OL, ring.yB + cbl, ring.uL, ring.yT - ctl))
  if (ring.OR - ring.uR > EPS) out.push(rect(ring.uR, ring.yB + cbr, ring.OR, ring.yT - ctr))

  const corners = [
    [1, 1, ctr, ktr], [-1, 1, ctl, ktl], [-1, -1, cbl, kbl], [1, -1, cbr, kbr],
  ] as const
  for (const [su, sv, clip, outerClip] of corners) {
    const iu = su > 0 ? ring.uR : ring.uL
    const iv = sv > 0 ? ring.yT : ring.yB
    const ou = su > 0 ? ring.OR : ring.OL
    const ov = sv > 0 ? ring.OT : ring.OB
    if (Math.abs(ou - iu) < EPS || Math.abs(ov - iv) < EPS) continue
    const k = Math.min(outerClip, Math.abs(ov - iv) * 0.7, Math.abs(ou - iu) * 0.7)
    // Authored counter-clockwise for the top-right corner; the two mirrored
    // corners reverse handedness and have to be flipped back.
    const points: Vec2[] = [
      [iu - su * clip, iv],
      [iu, iv - sv * clip],
      [ou, iv - sv * clip],
      [ou, ov - sv * k],
      [ou - su * k, ov],
      [iu - su * clip, ov],
    ]
    out.push(dedupe(su * sv > 0 ? points : [...points].reverse()))
  }
  return out
}

export function openingRing(
  root: Group, face: WallFace, material: MeshPhysicalMaterial,
  ring: OpeningRing, depth: number, w: number, options: FacePieceOptions = {},
): void {
  for (const polygon of ringPolygons(ring)) {
    faceProfile(root, face, material, polygon, depth, w, options)
  }
}

/**
 * Pale infill cassettes and the dark impact skirt for one rectangular stretch
 * of wall. `side` is +1 for the outward face and -1 for the interior face.
 *
 * The pale panel is a plain plate riding proud of a slightly larger dark
 * backing, so the shallow routed border around every cassette is a real 45 mm
 * ledge rather than a texture. Panel seams are gaps that expose the wall core.
 */
export function cassetteRun(
  root: Group, face: WallFace, m: KitMaterials,
  u0: number, u1: number, y0: number, y1: number, side: 1 | -1,
): void {
  const width = u1 - u0
  const height = y1 - y0
  if (width < 0.12 || height < 0.1) return
  // The pale field has to dominate the elevation: keep the dark reveal around
  // each cassette to a thin border rather than a wide frame.
  const margin = 0.03
  let panelBottom = y0 + margin

  if (y0 < KIT_BUILD.floorY + 0.02 && y1 > KIT_BUILD.skirtTop + 0.14) {
    const top = KIT_BUILD.skirtTop
    const skirtWidth = width - margin * 2
    facePrism(root, face, m.deck, [skirtWidth, top - y0, 0.07],
      (u0 + u1) / 2, (y0 + top) / 2, side * 0.165, { fillet: 0.02, bevel: 0.016 })
    // The service band is sectioned on the same module rhythm as the panels.
    panelLine(root, face, m, skirtWidth - 0.08, (u0 + u1) / 2, top - 0.12, side * 0.2)
    const bays = Math.max(1, Math.round(skirtWidth / 1.3))
    for (let i = 1; i < bays; i += 1) {
      panelLine(root, face, m, top - y0 - 0.1, u0 + margin + (skirtWidth * i) / bays, (y0 + top) / 2, side * 0.2, false, 0.04, 0.02)
    }
    panelBottom = top + 0.04
  }

  const panelTop = y1 - margin
  const panelHeight = panelTop - panelBottom
  if (panelHeight < 0.16) return
  const span = width - margin * 2
  const count = Math.max(1, Math.round(span / 2.2))
  const gap = 0.035
  const panelWidth = (span - gap * (count - 1)) / count
  if (panelWidth < 0.16) return
  for (let i = 0; i < count; i += 1) {
    const centre = u0 + margin + panelWidth / 2 + i * (panelWidth + gap)
    const y = (panelBottom + panelTop) / 2
    facePrism(root, face, m.graphite, [panelWidth + 0.06, panelHeight + 0.06, 0.055],
      centre, y, side * 0.1575, { fillet: 0.018, bevel: 0.014 })
    facePrism(root, face, m.shell, [panelWidth, panelHeight, 0.06],
      centre, y, side * 0.195, { fillet: 0.022, bevel: 0.018 })
    // Two shallow seams divide the cassette into standardised courses. The
    // upper one lands on the same height across the whole building.
    panelLine(root, face, m, panelWidth - 0.12, centre, panelTop - 0.42, side * 0.225)
    if (panelHeight > 1.4) panelLine(root, face, m, panelWidth - 0.12, centre, panelBottom + 0.5, side * 0.225)
  }
}

export interface OpeningSpec {
  readonly centre: number
  readonly width: number
  readonly sill: number
  readonly head: number
  readonly clip: Corners
}

export function apertureRing(spec: OpeningSpec, OL: number, OR: number, OB: number, OT: number): OpeningRing {
  return {
    uL: spec.centre - spec.width / 2,
    uR: spec.centre + spec.width / 2,
    yB: spec.sill,
    yT: spec.head,
    clip: spec.clip,
    OL, OR, OB, OT,
  }
}

/**
 * The stepped frame around a door or window: a proud outer flange, an inward
 * lip overhanging the aperture, and a deep reveal lining the jamb through the
 * full wall thickness. Three concentric rings, each a handful of triangles.
 */
/** Width of the dark lining inside an aperture; the wall core starts outside it. */
export const FRAME_LINER = 0.05
/** How far the frame flange reaches past the clear opening. */
export const FRAME_REACH = 0.13

/**
 * Offsets a clipped rectangle outward. A 45-degree corner cut keeps its length
 * under a uniform offset, so the clip carries through every ring unchanged.
 */
function grow(spec: OpeningSpec, d: number): { uL: number; uR: number; yB: number; yT: number } {
  return {
    uL: spec.centre - spec.width / 2 - d,
    uR: spec.centre + spec.width / 2 + d,
    yB: spec.sill - d,
    yT: spec.head + d,
  }
}

export function openingFrame(
  root: Group, face: WallFace, m: KitMaterials, spec: OpeningSpec, options: { inner?: boolean } = {},
): void {
  // Three concentric stages, each stepping back as it moves inboard: a proud
  // outer flange, a flatter middle ring, and the dark reveal lining the hole.
  // Every band is at least 50 mm wide - nested rings whose inner and outer
  // bounds meet collapse to slivers and render as loose black planes.
  const stage = (inner: number, outer: number, depth: number, w: number, material = m.graphite): void => {
    const a = grow(spec, inner)
    const b = grow(spec, outer)
    openingRing(root, face, material, {
      uL: a.uL, uR: a.uR, yB: a.yB, yT: a.yT, clip: spec.clip,
      OL: b.uL, OR: b.uR, OB: b.yB, OT: b.yT, outerClip: spec.clip,
    }, depth, w, { fillet: 0.014, bevel: 0.012 })
  }

  stage(0.11, FRAME_REACH, 0.1, HALF + 0.045)
  stage(0.03, 0.12, 0.075, HALF + 0.0325)
  stage(0, FRAME_LINER, KIT_BUILD.wallThickness + 0.02, 0, m.ink)

  if (options.inner === false) return
  // A single flatter flange repeats the language on the interior face.
  stage(0.02, 0.11, 0.07, -(HALF + 0.025))
}

/**
 * A structural post: beveled trunk, expanded pedestal and collar, an inset
 * octagonal cap plate, and a recessed service channel on each exposed face.
 */
export interface PostOptions {
  readonly size?: number
  readonly top?: number
  /** Face yaws that are visible and therefore carry the channel detail. */
  readonly faces: readonly number[]
  readonly accent?: 'amber' | 'cyan'
  /** Wider shoulder plates, for the T-junction posts. */
  readonly gussets?: readonly number[]
}

export function structuralPost(root: Group, m: KitMaterials, x: number, z: number, options: PostOptions): void {
  const size = options.size ?? KIT_BUILD.postSize
  const half = size / 2
  // The collar has to land on the beam, so the trunk stops one collar short of it.
  const top = options.top ?? KIT_BUILD.beamTop - 0.28
  const base = KIT_BUILD.floorY
  const chamfer = size * 0.19

  root.add(prism(m.graphite, [size, top - base, size], [x, (base + top) / 2, z],
    { chamfer, fillet: 0.03, bevel: 0.026 }))
  root.add(prism(m.graphite, [size + 0.16, 0.34, size + 0.16], [x, base + 0.15, z],
    { chamfer: chamfer + 0.05, fillet: 0.034, bevel: 0.028 }))
  // The collar and cap stack are pinned to POST_CAP_TOP rather than measured up
  // from the trunk, so a junction post and an ordinary post finish at exactly
  // the same height and an asset's bounds match its declared envelope.
  const capBase = POST_CAP_TOP - 0.08
  root.add(prism(m.graphite, [size + 0.1, capBase - top, size + 0.1], [x, (top + capBase) / 2, z],
    { chamfer: chamfer + 0.03, fillet: 0.032, bevel: 0.026 }))
  // Flattened octagonal cap: inset from the collar and lightly beveled.
  root.add(prism(m.graphite, [size - 0.02, 0.05, size - 0.02], [x, capBase + 0.025, z],
    { chamfer: size * 0.3, fillet: 0.02, bevel: 0.017 }))
  // The cap is an inset, beveled plate in the same gunmetal as the frame, not a
  // bright badge: it should read through its edge highlight alone.
  root.add(prism(m.graphite, [size - 0.16, 0.03, size - 0.16], [x, POST_CAP_TOP - 0.015, z],
    { chamfer: size * 0.24, fillet: 0.014, bevel: 0.011 }))

  for (const yaw of options.faces) {
    const face = wallFace([x, 0, z], yaw)
    const mid = (base + top) / 2 + 0.16
    const channelHeight = top - base - 1.0
    facePrism(root, face, m.ink, [size * 0.34, channelHeight, 0.07], 0, mid, half - 0.02,
      { fillet: 0.016, bevel: 0.013 })
    for (const side of [-1, 1]) {
      facePrism(root, face, m.steel, [size * 0.07, channelHeight - 0.1, 0.04], side * size * 0.32, mid, half + 0.008,
        { fillet: 0.01, bevel: 0.008 })
    }
    facePrism(root, face, m.steel, [size * 0.42, 0.07, 0.05], 0, top - 0.24, half + 0.008,
      { fillet: 0.014, bevel: 0.011 })
    // Manufacturing seams up the trunk, at the same rhythm as the wall courses.
    for (const y of [base + 1.02, base + 1.94]) {
      panelLine(root, face, m, size - 0.14, 0, y, half, true, 0.04, 0.022)
    }
    if (options.accent === 'cyan') {
      facePrism(root, face, m.cyan, [0.06, channelHeight * 0.55, 0.035], 0, mid, half + 0.01,
        { fillet: 0.012, bevel: 0.01 })
    } else {
      facePrism(root, face, m.amber, [0.085, 0.13, 0.035], 0, base + 1.9, half + 0.01,
        { fillet: 0.014, bevel: 0.011 })
    }
  }

  for (const yaw of options.gussets ?? []) {
    const face = wallFace([x, 0, z], yaw)
    for (const side of [-1, 1]) {
      facePrism(root, face, m.graphite, [0.22, 0.22, 0.1], side * (half + 0.08), top - 0.5, half - 0.16,
        { fillet: 0.018, bevel: 0.014, roll: side * Math.PI / 4 })
    }
  }
}

/**
 * The perimeter ring beam. Its cross-section is one convex profile swept along
 * the run, so the outer fascia, the top face and both chamfers share a single
 * continuous edge instead of restarting at every stacked box.
 */
export function ringBeam(
  root: Group, face: WallFace, m: KitMaterials, u0: number, u1: number,
  options: { inset?: number } = {},
): void {
  const inset = options.inset ?? 0
  // Overhangs the pale cassettes by 75 mm, so the beam casts a real shadow line
  // across the top of every wall instead of sitting flush with the panels.
  const outer = 0.31 - inset
  const inner = -0.2 - inset
  const { beamBottom: b, beamTop: t } = KIT_BUILD
  const section: Vec2[] = [
    [inner, b], [outer, b], [outer, t - 0.12], [outer - 0.055, t], [inner + 0.06, t], [inner, t - 0.1],
  ]
  const length = u1 - u0
  const centre = (u0 + u1) / 2
  // Swept along u: the profile plane is (outward, up), so the beam's steps show
  // on every elevation and only its hidden ends are cut.
  root.add(extrudeProfile(m.graphite, section.map(([a, c]): Vec2 => [a, c - (b + t) / 2]), length,
    facePoint(face, centre, (b + t) / 2, 0), {
      fillet: 0.024, bevel: 0.02, rotation: [0, face.yaw - Math.PI / 2, 0],
    }))
  // Raised upper rail and the recessed grooves that separate it from the fascia.
  facePrism(root, face, m.graphite, [length - 0.06, 0.07, 0.1], centre, t - 0.02, outer - 0.08,
    { fillet: 0.018, bevel: 0.014 })
  panelLine(root, face, m, length - 0.12, centre, t - 0.2, outer, true, 0.05, 0.026)
  panelLine(root, face, m, length - 0.12, centre, b + 0.12, outer, true, 0.055, 0.028)
  // Modular seams across the fascia, and one long channel on the top face.
  const bays = Math.max(1, Math.round(length / 1.8))
  for (let i = 1; i < bays; i += 1) {
    panelLine(root, face, m, t - b - 0.12, u0 + (length * i) / bays, (b + t) / 2, outer, false, 0.04, 0.022)
  }
  root.add(groove(m.ink, length - 0.12, 0.05, 0.024, facePoint(face, centre, t + GROOVE_LIFT, (outer + inner) / 2 - 0.06),
    [-Math.PI / 2, 0, face.yaw - Math.PI / 2]))
  // Inner ledge overlooking the room: its own seam keeps the top from reading flat.
  panelLine(root, face, m, length - 0.12, centre, t - 0.14, inner, true, 0.04, 0.02)
}

/** A horizontal slab with clipped plan corners: plinth steps, floors, sills. */
export function slab(
  root: Group, material: MeshPhysicalMaterial, width: number, depth: number, height: number,
  centre: Vec3, chamfer: number | Corners, options: { fillet?: number; bevel?: number } = {},
): void {
  root.add(prism(material, [width, depth, height], centre, {
    chamfer, fillet: options.fillet ?? 0.045, bevel: options.bevel ?? 0.035,
    rotation: [Math.PI / 2, 0, 0],
  }))
}

/** Shallow tile grooves on a floor bay. Cheap, and they read at every angle. */
export function tileGrid(
  root: Group, m: KitMaterials, x0: number, x1: number, z0: number, z1: number, y: number, pitch: number,
): void {
  const columns = Math.max(1, Math.round((x1 - x0) / pitch))
  const rows = Math.max(1, Math.round((z1 - z0) / pitch))
  // A groove opens downward from its own rim plane, so the rim has to clear the
  // host surface. Sunk level with it, the cut is buried and its rim z-fights the
  // floor instead of reading as a joint.
  const rim = y + GROOVE_LIFT
  for (let i = 1; i < columns; i += 1) {
    const x = x0 + ((x1 - x0) * i) / columns
    root.add(groove(m.ink, z1 - z0 - 0.05, 0.05, 0.026, [x, rim, (z0 + z1) / 2], [-Math.PI / 2, 0, 0]))
  }
  for (let i = 1; i < rows; i += 1) {
    const z = z0 + ((z1 - z0) * i) / rows
    root.add(groove(m.ink, x1 - x0 - 0.05, 0.05, 0.026, [(x0 + x1) / 2, rim, z], [-Math.PI / 2, 0, Math.PI / 2]))
  }
}

/** Clearance that puts a cut's rim just proud of the surface it is cut into. */
export const GROOVE_LIFT = 0.004

/**
 * A panel line on a wall face, authored in the same (u, y, w) frame as
 * everything else. `horizontal` runs along u; otherwise the cut runs vertically.
 *
 * These are what make the kit read as manufactured rather than extruded: the
 * reference puts a seam wherever two modules meet, and each one is a real
 * six-triangle channel with two opposed walls, not a dark quad.
 */
export function panelLine(
  root: Group, face: WallFace, m: KitMaterials, length: number, u: number, y: number, w: number,
  horizontal = true, width = 0.045, depth = 0.022,
): void {
  if (length < 0.1) return
  // The sign of w picks the face being cut, so an interior seam opens into the
  // room rather than burying its walls in the wall core.
  const side = w < 0 ? -1 : 1
  const yaw = side < 0 ? face.yaw + Math.PI : face.yaw
  root.add(groove(m.ink, length, width, depth, facePoint(face, u, y, w + side * GROOVE_LIFT),
    [0, yaw, horizontal ? -Math.PI / 2 : 0]))
}

/** Small recessed fastener, used sparingly on frames and pedestals. */
export function bolt(root: Group, m: KitMaterials, face: WallFace, u: number, y: number, w: number): void {
  // Euler XYZ applies Z first, so the yaw has to ride in the roll slot for the
  // barrel to end up along the face normal rather than along world +z.
  root.add(cylinder(m.steel, 0.028, 0.03, facePoint(face, u, y, w), [Math.PI / 2, 0, -face.yaw], 8))
}
