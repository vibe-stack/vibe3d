import { Group, type MeshPhysicalMaterial, type Vector3Tuple } from 'three/webgpu'
import { cylinder, groove, prism, type Corners, type Vec3 } from '../../../src/asset-forge/generator/index.ts'
import type { KitSocket } from '../axiom-modular-kit/contract.ts'
import {
  GROOVE_LIFT, apertureRing, createKitMaterials, facePoint, facePrism, openingRing, slab,
  wallFace, type KitMaterials, type OpeningSpec, type WallFace,
} from '../axiom-modular-kit/parts.ts'
import { finishPrefab, type PrefabController, type PrefabPreview } from '../axiom-modular-kit/prefab.ts'
import { CLINIC, buildClinicFacade, clinicCassettes } from '../clinic-facade-module/model.ts'
import { PORTAL_CLEAR, buildTreatmentRoom, createRoomPreview } from '../treatment-rooms/model.ts'

/**
 * Lifeline Clinic - the Olympus civic pod.
 *
 * The landmark is assembled, not authored: three elevations and four corners
 * come from `clinic-facade-module`, the whole interior comes from
 * `treatment-rooms`, and what is left here is only the things that exist
 * because those parts were put together - the plinth they stand on, the portal
 * cut through the fourth elevation, the roof that closes the box, and the
 * beacon that makes it findable from across the map.
 *
 * Plan. The envelope is 5 x 6.5 m. The pod occupies the rear 5 x 5 m, its wall
 * centrelines forming a 4 m square inset half a metre inside the plinth; the
 * front 1.5 m is the deployed boarding ramp. Height is 3.2 m to the roof cap
 * and 4 m to the top of the beacon.
 */

const WIDTH = 5
const HEIGHT = 4.2
/** The pod's own origin inside the envelope. The ramp owns everything in front. */
const POD_Z = -1.5
/** Wall centrelines, in pod-local coordinates. */
const A = 0.5
const B = A + CLINIC.span
const { skirtTop: SKIRT, wallTop: TOP, eavesTop: EAVES } = CLINIC

const PORTAL: OpeningSpec = {
  centre: CLINIC.columnU + CLINIC.span / 2,
  width: PORTAL_CLEAR,
  sill: SKIRT,
  head: 2.56,
  clip: [0.26, 0.26, 0, 0] as Corners,
}

/** Walking surface of the finished lid. Everything on the roof sits on this. */
const ROOF_TOP = 3.27
const BEACON: Vector3Tuple = [WIDTH / 2, 0, -3.3]

/**
 * The four elevations, as faces whose u axis runs corner to corner with
 * `CLINIC.columnU` sitting on the first corner. Authoring them from one table
 * is what guarantees the pod is square and that every side owns exactly one
 * corner column.
 */
function elevations(): Record<'front' | 'right' | 'rear' | 'left', WallFace> {
  const u = CLINIC.columnU
  return {
    front: wallFace([A - u, 0, -A], 0),
    right: wallFace([B, 0, -A + u], Math.PI / 2),
    rear: wallFace([B + u, 0, -B], Math.PI),
    left: wallFace([A, 0, -B - u], -Math.PI / 2),
  }
}

/* --------------------------------------------------------------- plinth -- */

/** Stepped ground plate with corner buttresses, in the kit's plinth language. */
function addPlinth(root: Group, m: KitMaterials): void {
  const c: Vector3Tuple = [WIDTH / 2, 0, -WIDTH / 2]
  slab(root, m.graphite, WIDTH, WIDTH, 0.18, [c[0], 0.09, c[2]], 0.42, { fillet: 0.024, bevel: 0.03 })
  slab(root, m.graphite, WIDTH - 0.14, WIDTH - 0.14, 0.14, [c[0], 0.25, c[2]], 0.38, { fillet: 0.024, bevel: 0.03 })
  slab(root, m.deck, WIDTH - 0.3, WIDTH - 0.3, 0.12, [c[0], 0.38, c[2]], 0.34, { fillet: 0.022, bevel: 0.028 })

  for (const [x, z] of [[A, -A], [B, -A], [B, -B], [A, -B]] as const) {
    // Splayed foot under every corner column: the load path the reference shows
    // running down out of the corner and onto the apron. Sized to land exactly
    // on the plinth edge rather than hanging off it.
    slab(root, m.graphite, 1.0, 1.0, 0.46, [x, 0.23, z], 0.36, { fillet: 0.026, bevel: 0.03 })
  }
  // Prefabrication seams across the apron, on the elevation module rhythm.
  for (const z of [-0.24, -WIDTH + 0.24]) {
    root.add(groove(m.ink, WIDTH - 1.9, 0.06, 0.03, [WIDTH / 2, 0.44 + GROOVE_LIFT, z], [-Math.PI / 2, 0, Math.PI / 2]))
  }
  for (const x of [0.24, WIDTH - 0.24]) {
    root.add(groove(m.ink, WIDTH - 1.9, 0.06, 0.03, [x, 0.44 + GROOVE_LIFT, -WIDTH / 2], [-Math.PI / 2, 0, 0]))
  }
}

/* --------------------------------------------------------------- portal -- */

/**
 * The open elevation. The wall around the door is a real ring - four bars and
 * four clipped corner pentagons tiling the gap between the aperture and the bay
 * - so the jamb has thickness and the reveal lines it, rather than the opening
 * being a dark rectangle painted on a solid wall.
 */
function addPortal(root: Group, m: KitMaterials, face: WallFace): void {
  const u0 = CLINIC.columnU
  const u1 = u0 + CLINIC.span
  const liner = 0.06
  const cored: OpeningSpec = {
    ...PORTAL,
    width: PORTAL.width + liner * 2,
    // The core reaches the ground behind the base band; the aperture starts at
    // the bay's own floor, so the ring never lays a bar across the threshold.
    sill: CLINIC.wallBase,
    head: PORTAL.head + liner,
  }
  openingRing(root, face, m.graphite, apertureRing(cored, u0, u1, CLINIC.wallBase, TOP), CLINIC.core, 0,
    { fillet: 0.03, bevel: 0.026 })

  const pierL = PORTAL.centre - PORTAL.width / 2 - liner
  const pierR = PORTAL.centre + PORTAL.width / 2 + liner
  clinicCassettes(root, m, face, u0 + 0.16, pierL - 0.14, CLINIC.bandTop + 0.06, TOP - 0.08)
  clinicCassettes(root, m, face, pierR + 0.14, u1 - 0.16, CLINIC.bandTop + 0.06, TOP - 0.08)
  clinicCassettes(root, m, face, pierL, pierR, cored.head + 0.14, TOP - 0.08)

  // Proud outer flange, then the dark reveal lining the jamb right through.
  const flange = (inner: number, outer: number, depth: number, w: number, material = m.graphite): void => {
    const grow = (d: number) => ({
      uL: PORTAL.centre - PORTAL.width / 2 - d,
      uR: PORTAL.centre + PORTAL.width / 2 + d,
      yB: PORTAL.sill - d,
      yT: PORTAL.head + d,
    })
    const a = grow(inner)
    const b = grow(outer)
    openingRing(root, face, material, {
      uL: a.uL, uR: a.uR, yB: a.yB, yT: a.yT, clip: PORTAL.clip,
      // Both bounds are pinned to the sill so no stage emits a bar below the
      // threshold. Grown downward like the other three edges, each ring lays a
      // horizontal face on the floor plane and the doorway z-fights its own step.
      OL: b.uL, OR: b.uR, OB: PORTAL.sill, OT: b.yT, outerClip: PORTAL.clip,
    }, depth, w, { fillet: 0.018, bevel: 0.015 })
  }
  // A thick-walled hatch, not a hole with a rim: three concentric stages step
  // back as they move inboard, the outer two pale so the collar reads as mass
  // from the front and the dark liner only appears once you are looking into it.
  flange(0.16, 0.42, 0.16, 0.32, m.porcelain)
  flange(0.09, 0.2, 0.12, 0.4, m.porcelain)
  flange(0.03, 0.11, 0.09, 0.24)
  // The dark reveal reaches 20 mm past where the wall core stops, so the two
  // overlap instead of meeting on a shared jamb plane.
  flange(0, liner + 0.02, CLINIC.core + 0.06, 0, m.ink)
  // Reveal returns lining the jamb, visible edge-on through the opening.
  for (const side of [-1, 1] as const) {
    facePrism(root, face, m.porcelain, [0.07, PORTAL.head - PORTAL.sill - 0.24, 0.3],
      PORTAL.centre + side * (PORTAL.width / 2 - 0.02), (PORTAL.sill + PORTAL.head) / 2, -0.02,
      { fillet: 0.016, bevel: 0.014 })
  }

  // Head light bar, outside, under the flange: the pod's welcome signal.
  facePrism(root, face, m.graphite, [PORTAL.width + 0.2, 0.17, 0.09], PORTAL.centre, PORTAL.head + 0.42, 0.33,
    { chamfer: 0.05, fillet: 0.02, bevel: 0.016 })
  facePrism(root, face, m.cobalt, [PORTAL.width - 0.06, 0.07, 0.04], PORTAL.centre, PORTAL.head + 0.42, 0.385,
    { fillet: 0.014, bevel: 0.011 })
  // And inside, washing the reveal the way the reference lights its doorway.
  facePrism(root, face, m.cobalt, [PORTAL.width - 0.12, 0.06, 0.03], PORTAL.centre, PORTAL.head - 0.06, -0.05,
    { fillet: 0.012, bevel: 0.01 })

  // Threshold plate and its non-slip channels, inside the plinth apron.
  const sill = facePoint(face, PORTAL.centre, 0, CLINIC.core / 2 + 0.16)
  slab(root, m.graphite, PORTAL.width + 0.3, 0.34, 0.1, [sill[0], SKIRT - 0.05, sill[2]], 0.1,
    { fillet: 0.022, bevel: 0.024 })
  for (const offset of [-0.08, 0.08]) {
    root.add(groove(m.ink, PORTAL.width - 0.1, 0.06, 0.028,
      [sill[0], SKIRT + GROOVE_LIFT, sill[2] + offset], [-Math.PI / 2, 0, Math.PI / 2]))
  }

  // Pier dressing: a control plate on one side, chevrons on the other.
  facePrism(root, face, m.ink, [0.16, 0.7, 0.05], pierR + 0.42, 1.55, 0.29, { fillet: 0.016, bevel: 0.013 })
  facePrism(root, face, m.cyan, [0.06, 0.46, 0.03], pierR + 0.42, 1.62, 0.325, { fillet: 0.012, bevel: 0.01 })
  facePrism(root, face, m.amber, [0.07, 0.07, 0.03], pierR + 0.42, 1.22, 0.325, { fillet: 0.012, bevel: 0.01 })
  for (let i = 0; i < 3; i += 1) {
    facePrism(root, face, m.cyan, [0.22, 0.045, 0.03], pierL - 0.42, 0.86 + i * 0.16, 0.325,
      { fillet: 0.01, bevel: 0.008 })
  }
}

/** Deployment grab handles, standing proud on the two front corner columns. */
function addGrabHandles(root: Group, m: KitMaterials, face: WallFace): void {
  const half = CLINIC.columnSize / 2
  for (const u of [CLINIC.columnU, CLINIC.columnU + CLINIC.span]) {
    for (const y of [1.0, 2.16]) {
      facePrism(root, face, m.graphite, [0.11, 0.11, 0.2], u, y, half + 0.1, { fillet: 0.018, bevel: 0.015 })
    }
    facePrism(root, face, m.graphite, [0.12, 1.4, 0.12], u, 1.58, half + 0.22,
      { chamfer: 0.04, fillet: 0.024, bevel: 0.02 })
    facePrism(root, face, m.steel, [0.05, 1.1, 0.04], u, 1.58, half + 0.29, { fillet: 0.012, bevel: 0.01 })
  }
}

/* ----------------------------------------------------------------- roof -- */

function addRoof(root: Group, m: KitMaterials): void {
  const c = WIDTH / 2
  // The lid is a raised pale cap on a dark shadow reveal. Sinking the deck
  // inside a heavy kerb instead turns the roof into an open tray, which is the
  // one silhouette the reference never reads as.
  slab(root, m.graphite, CLINIC.span + 0.5, CLINIC.span + 0.5, 0.12, [c, EAVES + 0.03, -c], 0.5,
    { fillet: 0.024, bevel: 0.026 })
  slab(root, m.porcelain, CLINIC.span + 0.34, CLINIC.span + 0.34, ROOF_TOP - EAVES - 0.03, [c, (EAVES + ROOF_TOP) / 2 + 0.015, -c], 0.46,
    { fillet: 0.032, bevel: 0.032 })
  // Slim gunmetal edge caps on the front and rear only, so the trim reads as
  // hardware rather than as a frame around every elevation.
  for (const z of [-A + 0.06, -B - 0.06]) {
    slab(root, m.graphite, CLINIC.span + 0.4, 0.22, ROOF_TOP - EAVES + 0.06, [c, (EAVES + ROOF_TOP) / 2 + 0.05, z], 0.1,
      { fillet: 0.02, bevel: 0.022 })
  }
  // Raised centre spine, so the lid has a section rather than one flat plane.
  slab(root, m.porcelain, CLINIC.span - 0.5, 1.5, 0.1, [c, ROOF_TOP + 0.05, -c + 0.25], 0.34,
    { fillet: 0.026, bevel: 0.026 })
  for (const z of [-c + 0.9, -c - 0.42]) {
    root.add(groove(m.ink, CLINIC.span - 0.8, 0.06, 0.03, [c, ROOF_TOP + 0.1 + GROOVE_LIFT, z], [-Math.PI / 2, 0, Math.PI / 2]))
  }
  // Two service pans with louvred lids, offset so the roof is not symmetric.
  for (const [x, z] of [[c - 1.34, -A - 0.62], [c + 1.32, -A - 0.78]] as const) {
    slab(root, m.graphite, 0.86, 1.16, 0.13, [x, ROOF_TOP + 0.065, z], 0.16, { fillet: 0.022, bevel: 0.022 })
    for (let i = 0; i < 6; i += 1) {
      // Sunk a clear 20 mm below the pan's lid. Level with it, the slot's rim and
      // the lid share a plane and the louvre run renders as a flickering decal.
      slab(root, m.ink, 0.68, 0.06, 0.04, [x, ROOF_TOP + 0.09, z - 0.36 + i * 0.145], 0.02,
        { fillet: 0.012, bevel: 0.01 })
    }
  }
  slab(root, m.graphite, 0.8, 0.62, 0.08, [c - 1.32, ROOF_TOP + 0.04, -B + 0.72], 0.2, { fillet: 0.02, bevel: 0.02 })
  slab(root, m.cyan, 0.16, 0.16, 0.03, [c + 1.32, ROOF_TOP + 0.145, -B + 0.7], 0.05, { fillet: 0.012, bevel: 0.01 })
}

/**
 * The beacon. Its lantern is a real cage - a cobalt tube behind four graphite
 * mullions on a stepped pedestal - because a bare emissive cylinder on a roof
 * reads as a bug, not as a fitting.
 */
function addBeacon(root: Group, m: KitMaterials): void {
  const [x, , z] = BEACON
  // Stacked bottom-up to the declared envelope top, so the finial is the asset's
  // highest point by construction rather than by luck.
  slab(root, m.graphite, 0.96, 0.96, 0.12, [x, ROOF_TOP + 0.06, z], 0.26, { fillet: 0.024, bevel: 0.024 })
  slab(root, m.graphite, 0.68, 0.68, 0.16, [x, ROOF_TOP + 0.2, z], 0.19, { fillet: 0.024, bevel: 0.024 })
  root.add(cylinder(m.steel, 0.24, 0.07, [x, ROOF_TOP + 0.315, z], [0, 0, 0], 12))
  root.add(cylinder(m.ink, 0.2, 0.06, [x, ROOF_TOP + 0.36, z], [0, 0, 0], 12))
  const lantern = ROOF_TOP + 0.58
  root.add(cylinder(m.cobalt, 0.175, 0.42, [x, lantern, z], [0, 0, 0], 16))
  for (let i = 0; i < 4; i += 1) {
    const angle = Math.PI / 4 + (i * Math.PI) / 2
    root.add(cylinder(m.graphite, 0.032, 0.44, [x + Math.cos(angle) * 0.175, lantern, z + Math.sin(angle) * 0.175],
      [0, 0, 0], 6))
  }
  root.add(cylinder(m.graphite, 0.21, 0.09, [x, ROOF_TOP + 0.835, z], [0, 0, 0], 12))
  root.add(cylinder(m.steel, 0.05, 0.05, [x, HEIGHT - 0.025, z], [0, 0, 0], 8))
  // Conduit dropping off the pedestal onto the roof deck.
  root.add(cylinder(m.graphite, 0.055, 0.5, [x + 0.42, ROOF_TOP + 0.12, z + 0.16], [0, 0, Math.PI / 2], 8))
}

/* ----------------------------------------------------------------- ramp -- */

/**
 * The deployed boarding ramp: one plate hinged on the plinth edge and lying on
 * the ground 1.4 m out. Every piece is placed and rotated on the same slope, so
 * the tread inlay and the edge kerbs stay parallel to the plate instead of
 * intersecting it.
 */
function addRamp(root: Group, m: KitMaterials): void {
  const zHinge = POD_Z
  // The toe lands on the envelope's front face, and high enough that the plate's
  // own thickness does not push its underside below ground.
  const zToe = 0
  const yHinge = SKIRT - 0.02
  const yToe = 0.14
  const run = zToe - zHinge
  const drop = yHinge - yToe
  // A plan slab is authored with rotation [pi/2, 0, 0]; adding the slope keeps
  // the thickness axis normal to the plate, so every inlay stacks on its face
  // instead of shearing through it.
  const slope = Math.atan2(drop, run)
  const length = Math.hypot(run, drop)
  const rotation: Vec3 = [Math.PI / 2 + slope, 0, 0]
  const up: Vec3 = [0, Math.cos(slope), Math.sin(slope)]
  const mid: Vec3 = [WIDTH / 2, (yHinge + yToe) / 2, (zHinge + zToe) / 2]
  const at = (lift: number, across = 0): Vec3 => [
    mid[0] + across, mid[1] + up[1] * lift, mid[2] + up[2] * lift,
  ]

  const plate = (
    material: MeshPhysicalMaterial, width: number, run_: number, thickness: number,
    lift: number, chamfer: number, across = 0,
  ): void => {
    root.add(prism(material, [width, run_, thickness], at(lift, across),
      { chamfer, fillet: 0.024, bevel: 0.024, rotation }))
  }
  plate(m.graphite, PORTAL.width + 0.34, length, 0.12, -0.06, 0.16)
  plate(m.deck, PORTAL.width - 0.06, length - 0.22, 0.04, 0.015, 0.1)
  plate(m.cobalt, PORTAL.width - 0.5, 0.09, 0.025, 0.062, 0.03)

  // Edge kerbs, and the knuckles the plate folds on.
  for (const side of [-1, 1] as const) {
    plate(m.graphite, 0.13, length - 0.1, 0.08, 0.02, 0.04, side * (PORTAL.width / 2 + 0.11))
    root.add(cylinder(m.steel, 0.075, 0.22, [WIDTH / 2 + side * (PORTAL.width / 2 + 0.02), yHinge - 0.05, zHinge],
      [0, 0, Math.PI / 2], 10))
  }
  // Tread channels across the run, cut into the plate's own plane.
  for (let i = 1; i < 6; i += 1) {
    const t = i / 6 - 0.5
    root.add(groove(m.ink, PORTAL.width - 0.34, 0.055, 0.025,
      [mid[0], mid[1] + up[1] * 0.045 - drop * t, mid[2] + up[2] * 0.045 + run * t],
      [-Math.PI / 2 + slope, 0, Math.PI / 2]))
  }
}

/* -------------------------------------------------------------- sockets -- */

const SOCKETS: readonly KitSocket[] = [
  { name: 'foundation_center', kind: 'foundation', position: [WIDTH / 2, 0, POD_Z - WIDTH / 2], normal: [0, -1, 0] },
  { name: 'floor_center', kind: 'floor', position: [WIDTH / 2, SKIRT, POD_Z - WIDTH / 2], normal: [0, 1, 0] },
  { name: 'door_front_center', kind: 'door', position: [WIDTH / 2, SKIRT, POD_Z - A + CLINIC.core / 2], normal: [0, 0, 1], up: [0, 1, 0] },
  { name: 'ramp_toe_center', kind: 'floor', position: [WIDTH / 2, 0.05, -0.12], normal: [0, 1, 0] },
  { name: 'wall_left', kind: 'wall', position: [A, 1.6, POD_Z - WIDTH / 2], normal: [-1, 0, 0] },
  { name: 'wall_right', kind: 'wall', position: [B, 1.6, POD_Z - WIDTH / 2], normal: [1, 0, 0] },
  { name: 'wall_rear', kind: 'wall', position: [WIDTH / 2, 1.6, POD_Z - B], normal: [0, 0, -1] },
  { name: 'roof_deck_center', kind: 'roof-edge', position: [WIDTH / 2, ROOF_TOP, POD_Z - WIDTH / 2], normal: [0, 1, 0] },
  { name: 'beacon_mount', kind: 'dressing', position: [BEACON[0], ROOF_TOP, POD_Z + BEACON[2]], normal: [0, 1, 0] },
  { name: 'badge_right', kind: 'dressing', position: [B + 0.35, 1.92, POD_Z - WIDTH / 2], normal: [1, 0, 0] },
  { name: 'service_rear', kind: 'service', position: [WIDTH / 2 + 1.12, 1.06, POD_Z - B - 0.35], normal: [0, 0, -1] },
]

/* ---------------------------------------------------------------- build -- */

export function createModel(): PrefabController {
  const acquired = createKitMaterials()
  const m = acquired.materials
  const root = new Group()
  // The pod is built in its own coordinates and shifted back once, so the ramp
  // owns the front of the envelope without every dimension inside carrying an
  // offset. The batcher bakes the transform away.
  const pod = new Group()
  pod.position.z = POD_Z
  root.add(pod)

  const face = elevations()
  addPlinth(pod, m)
  buildTreatmentRoom(pod, m)
  buildClinicFacade(pod, m, face.right, { dress: 'badge', columns: 'left' })
  buildClinicFacade(pod, m, face.rear, { dress: 'window', columns: 'left', service: true })
  buildClinicFacade(pod, m, face.left, { dress: 'window', columns: 'left' })

  // The open elevation reuses the module's skirt and eaves, then replaces its
  // wall field with the portal ring.
  buildClinicFacade(pod, m, face.front, {
    dress: 'plain',
    columns: 'left',
    skipWall: true,
    bandGap: [PORTAL.centre - PORTAL.width / 2 - 0.12, PORTAL.centre + PORTAL.width / 2 + 0.12],
  })
  addPortal(pod, m, face.front)
  addGrabHandles(pod, m, face.front)

  addRoof(pod, m)
  addBeacon(pod, m)
  addRamp(root, m)

  return finishPrefab('lifeline-clinic', root, SOCKETS, acquired)
}

/* -------------------------------------------------------------- preview -- */

const PRACTICALS: Vector3Tuple = [WIDTH / 2, 0, POD_Z - WIDTH / 2]

export function createPreview(options: { aspect: number }): PrefabPreview {
  return createRoomPreview(options, createModel, 'lifeline-clinic',
    [8.6, 5.2, 9.4], [2.5, 1.7, -4.2], 27, PRACTICALS)
}

export function createSidePreview(options: { aspect: number }): PrefabPreview {
  return createRoomPreview(options, createModel, 'lifeline-clinic',
    [14.6, 5.2, -0.4], [2.5, 1.6, -4.0], 30, PRACTICALS)
}

export function createRearPreview(options: { aspect: number }): PrefabPreview {
  return createRoomPreview(options, createModel, 'lifeline-clinic',
    [-6.6, 8.4, -15.8], [2.5, 1.6, -4.0], 30, PRACTICALS)
}

export function createLowPreview(options: { aspect: number }): PrefabPreview {
  return createRoomPreview(options, createModel, 'lifeline-clinic',
    [6.4, 1.0, 6.6], [2.6, 1.5, -3.6], 32, PRACTICALS)
}
