import {
  Color, DirectionalLight, Group, HemisphereLight, PerspectiveCamera, PointLight, Scene,
  type Vector3Tuple,
} from 'three/webgpu'
import { cylinder, groove, rect } from '../../../src/asset-forge/generator/index.ts'
import type { KitSocket } from '../axiom-modular-kit/contract.ts'
import { createAxiomComponent } from '../axiom-modular-kit/component.ts'
import type { PrefabController, PrefabPreview } from '../axiom-modular-kit/prefab.ts'
import {
  GROOVE_LIFT, facePrism, faceProfile, panelLine, slab, tileGrid, wallFace,
  type KitMaterials, type WallFace,
} from '../axiom-modular-kit/parts.ts'
import { CLINIC, crossProfile } from '../clinic-facade-module/model.ts'

/**
 * The clinic pod's fit-out, authored in the pod's own coordinates.
 *
 * This is a real registry asset in its own right - a lined treatment room with
 * a berth, wall stores and cove lighting - but it is also literally what the
 * Lifeline Clinic contains: the assembly calls `buildTreatmentRoom` and adds
 * nothing of its own inside the shell. Keeping the interior here rather than
 * inline in the clinic is what lets the same room be dropped into a different
 * shell later without re-deriving a single dimension.
 *
 * The lining rides *inward* off the structural wall plane on the same layered
 * depths the exterior uses outward, so a jamb seen through the open front shows
 * core, backing and cassette in the correct order.
 */

/** Pod plan. Wall centrelines form a 4 m square inset 0.5 m into the envelope. */
export const ROOM = Object.freeze({
  envelope: 5,
  /** Inner face of the structural core on every side. */
  inner: 0.5 + CLINIC.core / 2,
  /** Clear span between opposing linings' host planes. */
  clear: CLINIC.span - CLINIC.core,
  floor: CLINIC.skirtTop,
  ceiling: 2.8,
  ceilingTop: 3,
} as const)

const { inner: IN, clear: CLEAR, floor: FLOOR, ceiling: CEIL } = ROOM

/**
 * Clear width of the front portal, and the pier the lining leaves beside it.
 * The assembly cuts its opening to the same number, so the jamb the player sees
 * through the door is the one the fit-out was authored against.
 */
export const PORTAL_CLEAR = 2.4
/**
 * The lining runs 30 mm past the jamb and tucks behind the portal reveal. Ended
 * exactly on the aperture line it shares a plane with the reveal, and the two
 * batches fight down the full height of both jambs.
 */
const PIER = (CLEAR - PORTAL_CLEAR) / 2 + 0.03

/** Room-facing frames for the four walls. u always runs 0..CLEAR. */
export const ROOM_FACES = {
  rear: (): WallFace => wallFace([IN, 0, -(ROOM.envelope - IN)], 0),
  left: (): WallFace => wallFace([IN, 0, -IN], Math.PI / 2),
  right: (): WallFace => wallFace([ROOM.envelope - IN, 0, -(ROOM.envelope - IN)], -Math.PI / 2),
  front: (): WallFace => wallFace([ROOM.envelope - IN, 0, -IN], Math.PI),
} as const

/* --------------------------------------------------------------- lining -- */

interface LiningOptions {
  readonly u0?: number
  readonly u1?: number
  /** The cove light stops short of an opening; piers get no cove at all. */
  readonly cove?: boolean
}

/**
 * One lined wall: dark backing, pale cassettes, a scuff-height kick band, and
 * the cobalt cove that does all the ambient work in the reference.
 */
export function clinicLining(root: Group, m: KitMaterials, face: WallFace, options: LiningOptions = {}): void {
  const u0 = options.u0 ?? 0
  const u1 = options.u1 ?? CLEAR
  const span = u1 - u0
  if (span < 0.15) return
  const mid = (u0 + u1) / 2

  facePrism(root, face, m.graphite, [span, CEIL - FLOOR, 0.04], mid, (FLOOR + CEIL) / 2, 0.02,
    { fillet: 0.016, bevel: 0.013 })
  facePrism(root, face, m.deck, [span - 0.04, 0.3, 0.05], mid, FLOOR + 0.15, 0.045,
    { fillet: 0.016, bevel: 0.013 })

  const count = Math.max(1, Math.round(span / 1.25))
  const gap = 0.04
  const panel = (span - 0.06 - gap * (count - 1)) / count
  const top = CEIL - 0.24
  const base = FLOOR + 0.32
  if (panel > 0.16) {
    for (let i = 0; i < count; i += 1) {
      const centre = u0 + 0.03 + panel / 2 + i * (panel + gap)
      facePrism(root, face, m.porcelain, [panel, top - base, 0.06], centre, (base + top) / 2, 0.07,
        { chamfer: 0.06, fillet: 0.024, bevel: 0.02 })
      panelLine(root, face, m, panel - 0.14, centre, top - 0.42, 0.1, true, 0.035, 0.018)
    }
  }

  if (options.cove ?? true) {
    facePrism(root, face, m.graphite, [span - 0.12, 0.16, 0.1], mid, CEIL - 0.11, 0.06,
      { chamfer: 0.04, fillet: 0.02, bevel: 0.016 })
    // The tube laps 20 mm into its housing. Butted against its face instead, the
    // two share a plane and the cove flickers along its whole length.
    facePrism(root, face, m.cobalt, [span - 0.3, 0.06, 0.06], mid, CEIL - 0.13, 0.12,
      { fillet: 0.014, bevel: 0.011 })
  }
}

/* ----------------------------------------------------------- wall stores -- */

/** Two-door supply press with a recessed handle rail and a small badge. */
function addWallStores(root: Group, m: KitMaterials, face: WallFace, u: number): void {
  const y = 1.86
  facePrism(root, face, m.graphite, [1.44, 1.16, 0.08], u, y, 0.11,
    { chamfer: 0.1, fillet: 0.022, bevel: 0.018, holes: [rect(0.63, 0.5)] })
  facePrism(root, face, m.ink, [1.3, 1.04, 0.05], u, y, 0.1, { fillet: 0.018, bevel: 0.014 })
  for (const side of [-1, 1] as const) {
    facePrism(root, face, m.porcelain, [0.6, 0.98, 0.06], u + side * 0.32, y, 0.14,
      { chamfer: 0.06, fillet: 0.022, bevel: 0.018 })
    facePrism(root, face, m.steel, [0.05, 0.4, 0.035], u + side * 0.05, y - 0.06, 0.18,
      { fillet: 0.01, bevel: 0.008 })
  }
  facePrism(root, face, m.cobalt, [0.16, 0.05, 0.025], u - 0.32, y + 0.36, 0.18, { fillet: 0.01, bevel: 0.008 })
  // Instrument shelf under the press.
  facePrism(root, face, m.porcelain, [1.5, 0.09, 0.3], u, 1.2, 0.16, { chamfer: 0.05, fillet: 0.022, bevel: 0.018 })
  facePrism(root, face, m.graphite, [1.3, 0.16, 0.14], u, 1.09, 0.1, { fillet: 0.018, bevel: 0.014 })
}

/** Screen niche: a bezel with a real aperture and a cyan panel set back in it. */
function addMonitor(root: Group, m: KitMaterials, face: WallFace, u: number, y: number): void {
  facePrism(root, face, m.graphite, [0.78, 0.58, 0.07], u, y, 0.105,
    { chamfer: 0.07, fillet: 0.02, bevel: 0.016, holes: [rect(0.3, 0.2)] })
  facePrism(root, face, m.ink, [0.66, 0.46, 0.04], u, y, 0.095, { fillet: 0.016, bevel: 0.013 })
  facePrism(root, face, m.cyan, [0.56, 0.36, 0.02], u, y, 0.122, { fillet: 0.012, bevel: 0.01 })
  facePrism(root, face, m.steel, [0.2, 0.04, 0.03], u + 0.24, y - 0.36, 0.14, { fillet: 0.01, bevel: 0.008 })
}

/**
 * Interior cross marker: a plaque and a cross standing proud of it.
 *
 * Deliberately not the exterior badge. That part is a deep housing with an
 * aperture and a recessed well, and at interior scale its layers pack into a
 * few centimetres where the cross's own faces start landing on the frame's -
 * a sign on a wall does not need the depth a landmark plate does.
 */
function addWallMarker(root: Group, m: KitMaterials, face: WallFace, u: number, y: number): void {
  facePrism(root, face, m.graphite, [0.54, 0.54, 0.05], u, y, 0.115, { chamfer: 0.15, fillet: 0.02, bevel: 0.016 })
  facePrism(root, face, m.ink, [0.42, 0.42, 0.035], u, y, 0.1475, { chamfer: 0.11, fillet: 0.016, bevel: 0.013 })
  // Lapped well into the plaque. Seated on its face, the two share a plane.
  faceProfile(root, face, m.cobalt, crossProfile(u, y, 0.29, 0.098), 0.045, 0.1665, { fillet: 0.013, bevel: 0.011 })
}

/** Louvred service return, so one wall is plant and not more white panel. */
function addReturnGrille(root: Group, m: KitMaterials, face: WallFace, u: number, y: number): void {
  facePrism(root, face, m.graphite, [0.62, 0.86, 0.07], u, y, 0.1, { chamfer: 0.07, fillet: 0.02, bevel: 0.016 })
  for (let i = 0; i < 7; i += 1) {
    facePrism(root, face, m.ink, [0.48, 0.045, 0.05], u, y - 0.33 + i * 0.11, 0.135, { fillet: 0.01, bevel: 0.008 })
  }
}

/* ------------------------------------------------------------- fittings -- */

/**
 * The examination berth. Its mass is a stack of clipped plan slabs, so the
 * chassis, the shadow gap under the mattress and the mattress itself each keep
 * their own silhouette instead of merging into one block.
 */
export function addBerth(root: Group, m: KitMaterials, x: number, z: number): void {
  slab(root, m.graphite, 0.86, 0.56, 0.34, [x, FLOOR + 0.17, z], 0.14, { fillet: 0.026, bevel: 0.028 })
  slab(root, m.steel, 0.62, 0.4, 0.06, [x, FLOOR + 0.03, z], 0.1, { fillet: 0.016, bevel: 0.014 })
  slab(root, m.porcelain, 1.02, 2.02, 0.24, [x, FLOOR + 0.46, z], 0.18, { fillet: 0.03, bevel: 0.03 })
  // Under-chassis glow, outboard of the pedestal on both flanks. A single strip
  // the pedestal's own width sits inside it: buried, and sharing its side faces.
  for (const side of [-1, 1] as const) {
    slab(root, m.cobalt, 0.05, 1.84, 0.03, [x + side * 0.47, FLOOR + 0.33, z], 0.02, { fillet: 0.012, bevel: 0.01 })
  }
  // Shadow reveal between chassis and mattress: proud of the chassis on both
  // sides, and lapped by the mattress rather than stacked flush against it.
  slab(root, m.ink, 0.94, 1.94, 0.06, [x, FLOOR + 0.61, z], 0.16, { fillet: 0.016, bevel: 0.014 })
  slab(root, m.accent, 0.9, 1.86, 0.16, [x, FLOOR + 0.7, z], 0.16, { fillet: 0.03, bevel: 0.03 })
  // Raised head end, tipped back the way an examination table actually sits.
  slab(root, m.porcelain, 0.94, 0.6, 0.1, [x, FLOOR + 0.83, z - 0.66], 0.14, { fillet: 0.024, bevel: 0.022 })
  slab(root, m.accent, 0.84, 0.5, 0.14, [x, FLOOR + 0.94, z - 0.66], 0.14, { fillet: 0.028, bevel: 0.026 })
  // Control plate on the foot end.
  const foot = wallFace([x, 0, z + 1.01], 0)
  facePrism(root, foot, m.ink, [0.34, 0.1, 0.04], 0, FLOOR + 0.46, 0.02, { fillet: 0.012, bevel: 0.01 })
  facePrism(root, foot, m.cyan, [0.22, 0.04, 0.025], 0, FLOOR + 0.46, 0.045, { fillet: 0.01, bevel: 0.008 })
  for (const side of [-1, 1] as const) {
    slab(root, m.steel, 0.05, 1.5, 0.05, [x + side * 0.55, FLOOR + 0.52, z], 0.02, { fillet: 0.014, bevel: 0.012 })
  }
}

/** Three-drawer supply unit; the white box that reads first through the door. */
export function addSupplyUnit(root: Group, m: KitMaterials, x: number, z: number): void {
  slab(root, m.graphite, 0.78, 0.6, 0.1, [x, FLOOR + 0.05, z], 0.08, { fillet: 0.02, bevel: 0.02 })
  slab(root, m.porcelain, 0.84, 0.64, 0.82, [x, FLOOR + 0.51, z], 0.09, { fillet: 0.03, bevel: 0.03 })
  slab(root, m.graphite, 0.88, 0.68, 0.06, [x, FLOOR + 0.95, z], 0.1, { fillet: 0.022, bevel: 0.02 })
  const front = wallFace([x, 0, z + 0.32], 0)
  for (let i = 0; i < 3; i += 1) {
    const y = FLOOR + 0.21 + i * 0.26
    facePrism(root, front, m.porcelain, [0.74, 0.22, 0.04], 0, y, 0.02, { chamfer: 0.03, fillet: 0.016, bevel: 0.013 })
    facePrism(root, front, m.steel, [0.3, 0.035, 0.03], 0, y + 0.07, 0.05, { fillet: 0.01, bevel: 0.008 })
  }
  facePrism(root, front, m.cobalt, [0.12, 0.04, 0.02], 0.28, FLOOR + 0.84, 0.075, { fillet: 0.008, bevel: 0.007 })
}

/** The corner lamp column: a cyan tube in an open graphite cradle. */
export function addLampColumn(root: Group, m: KitMaterials, x: number, z: number): void {
  slab(root, m.graphite, 0.3, 0.3, 0.16, [x, FLOOR + 0.08, z], 0.08, { fillet: 0.022, bevel: 0.02 })
  root.add(cylinder(m.graphite, 0.15, 0.16, [x, FLOOR + 0.24, z], [0, 0, 0], 12))
  root.add(cylinder(m.cyan, 0.1, 1.86, [x, FLOOR + 1.22, z], [0, 0, 0], 14))
  root.add(cylinder(m.graphite, 0.16, 0.18, [x, FLOOR + 2.24, z], [0, 0, 0], 12))
  root.add(cylinder(m.steel, 0.055, 0.24, [x, FLOOR + 2.38, z], [0, 0, 0], 8))
  // Cradle staves, on the wall side only: the tube has to stay open to the room
  // or the one soft light source in here is boxed in and reads as a black post.
  for (const angle of [2.5, 3.14, 3.78]) {
    root.add(cylinder(m.graphite, 0.03, 1.9, [x + Math.cos(angle) * 0.13, FLOOR + 1.22, z + Math.sin(angle) * 0.13],
      [0, 0, 0], 6))
  }
}

/* --------------------------------------------------------- shell and lid -- */

function addFloor(root: Group, m: KitMaterials): void {
  const span = CLEAR + CLINIC.core
  slab(root, m.deck, span, span, 0.26, [ROOM.envelope / 2, FLOOR - 0.13, -ROOM.envelope / 2], 0.16,
    { fillet: 0.026, bevel: 0.026 })
  tileGrid(root, m, IN, ROOM.envelope - IN, -(ROOM.envelope - IN), -IN, FLOOR, 0.915)
  // Drainage channel down the centreline: this is a room that gets hosed out.
  root.add(groove(m.ink, CLEAR - 0.3, 0.09, 0.04,
    [ROOM.envelope / 2, FLOOR + GROOVE_LIFT, -ROOM.envelope / 2], [-Math.PI / 2, 0, Math.PI / 2]))
}

function addCeiling(root: Group, m: KitMaterials): void {
  const span = CLEAR + 0.1
  const centre = ROOM.envelope / 2
  slab(root, m.porcelain, span, span, ROOM.ceilingTop - CEIL, [centre, (CEIL + ROOM.ceilingTop) / 2, -centre], 0.24,
    { fillet: 0.028, bevel: 0.026 })
  for (const z of [-centre + 0.85, -centre - 0.85]) {
    slab(root, m.graphite, 2.4, 0.34, 0.07, [centre, CEIL - 0.035, z], 0.1, { fillet: 0.02, bevel: 0.018 })
    slab(root, m.cobalt, 2.16, 0.16, 0.05, [centre, CEIL - 0.075, z], 0.06, { fillet: 0.014, bevel: 0.012 })
  }
  // Service pan between the light runs, so the lid is not one flat plane.
  slab(root, m.graphite, 1.0, 0.6, 0.05, [centre, CEIL - 0.025, -centre], 0.12, { fillet: 0.018, bevel: 0.016 })
  for (let i = 0; i < 4; i += 1) {
    slab(root, m.ink, 0.78, 0.05, 0.03, [centre, CEIL - 0.055, -centre - 0.18 + i * 0.12], 0.02,
      { fillet: 0.01, bevel: 0.009 })
  }
}

/* ---------------------------------------------------------------- build -- */

/** The whole fit-out. The clinic assembly calls exactly this and nothing more. */
export function buildTreatmentRoom(root: Group, m: KitMaterials): void {
  addFloor(root, m)
  addCeiling(root, m)

  const rear = ROOM_FACES.rear()
  const left = ROOM_FACES.left()
  const right = ROOM_FACES.right()
  const front = ROOM_FACES.front()

  clinicLining(root, m, rear)
  clinicLining(root, m, left)
  clinicLining(root, m, right)
  // The front wall is mostly the portal; only its two piers are lined, and the
  // cove stops there because there is no ceiling edge above an opening.
  clinicLining(root, m, front, { u0: 0, u1: PIER, cove: false })
  clinicLining(root, m, front, { u0: CLEAR - PIER, u1: CLEAR, cove: false })

  addWallStores(root, m, rear, 2.32)
  addReturnGrille(root, m, rear, 0.72, 1.72)
  addWallMarker(root, m, rear, 0.72, 2.34)
  addMonitor(root, m, right, 1.28, 1.86)
  addMonitor(root, m, left, 2.42, 1.78)

  addBerth(root, m, 2.98, -2.72)
  addSupplyUnit(root, m, 1.16, -1.5)
  addLampColumn(root, m, 1.02, -3.92)
}

/* --------------------------------------------------------------- module -- */

const E = ROOM.envelope

const SOCKETS = [
  { name: 'floor_center', kind: 'floor', position: [E / 2, FLOOR, -E / 2], normal: [0, 1, 0] },
  { name: 'foundation_center', kind: 'foundation', position: [E / 2, 0, -E / 2], normal: [0, -1, 0] },
  { name: 'ceiling_center', kind: 'ceiling', position: [E / 2, ROOM.ceilingTop, -E / 2], normal: [0, 1, 0] },
  { name: 'wall_rear', kind: 'wall', position: [E / 2, 1.6, -(E - IN)], normal: [0, 0, -1] },
  { name: 'wall_left', kind: 'wall', position: [IN, 1.6, -E / 2], normal: [-1, 0, 0] },
  { name: 'wall_right', kind: 'wall', position: [E - IN, 1.6, -E / 2], normal: [1, 0, 0] },
  { name: 'door_front_center', kind: 'door', position: [E / 2, FLOOR, -IN], normal: [0, 0, 1], up: [0, 1, 0] },
  { name: 'berth_head', kind: 'dressing', position: [2.98, 1.16, -3.38], normal: [0, 1, 0] },
  { name: 'stores_rear', kind: 'service', position: [IN + 2.32, 1.86, -(E - IN) + 0.16], normal: [0, 0, 1] },
] as const satisfies readonly KitSocket[]

export function createModel() {
  return createAxiomComponent('treatment-rooms', SOCKETS, (root, m) => {
    // Standalone, the fit-out needs a pad to stand on and a lid that reaches its
    // declared height. Inside a pod both belong to the shell, so
    // `buildTreatmentRoom` never authors them.
    slab(root, m.graphite, E, E, 0.2, [E / 2, 0.1, -E / 2], 0.44, { fillet: 0.026, bevel: 0.03 })
    slab(root, m.graphite, CLEAR + CLINIC.core + 0.3, CLEAR + CLINIC.core + 0.3, ROOM.ceilingTop - CEIL - 0.1,
      [E / 2, (CEIL + 0.1 + ROOM.ceilingTop) / 2, -E / 2], 0.4, { fillet: 0.026, bevel: 0.028 })
    buildTreatmentRoom(root, m)
  })
}

/**
 * A lit room, not a lit box.
 *
 * The cove and ceiling runs are emissive geometry, which paints itself but casts
 * nothing, so a shell interior rendered under exterior keys alone reads as a
 * black hole - exactly the failure the reference does not have. The preview adds
 * practicals standing in for those fittings. They are scenery: they never enter
 * the model root, and they are excluded from export.
 */
export function addRoomPracticals(scene: Scene, centre: Vector3Tuple = [E / 2, 0, -E / 2]): void {
  for (const [dz, intensity] of [[0.95, 5.4], [-0.95, 4.2]] as const) {
    const lamp = new PointLight(0xdfe9ff, intensity, 7.5, 2)
    lamp.position.set(centre[0], CEIL - 0.22, centre[2] + dz)
    lamp.userData.excludeFromExport = true
    scene.add(lamp)
  }
  const cove = new PointLight(0x4d7bff, 2.6, 6.5, 2)
  cove.position.set(centre[0], CEIL - 0.4, centre[2] - 1.5)
  cove.userData.excludeFromExport = true
  scene.add(cove)
}

export function createRoomPreview(
  options: { aspect: number },
  factory: () => PrefabController,
  name: string,
  cameraPosition: Vector3Tuple,
  target: Vector3Tuple,
  fov: number,
  practicalCentre?: Vector3Tuple,
): PrefabPreview {
  const controller = factory()
  const scene = new Scene()
  scene.name = `${name} / clinic preview`
  scene.background = new Color(0x000000)
  scene.add(controller.root, new HemisphereLight(0x8ea3b2, 0x0a0c10, 0.3))
  const key = new DirectionalLight(0xfff2e2, 1.25)
  key.position.set(-6, 11, 9)
  const fill = new DirectionalLight(0x87a6c4, 0.36)
  fill.position.set(10, 5, 7)
  const rim = new DirectionalLight(0x9fb8cc, 0.42)
  rim.position.set(5, 8, -11)
  scene.add(key, fill, rim)
  addRoomPracticals(scene, practicalCentre)

  const aspect = Number.isFinite(options.aspect) && options.aspect > 0 ? options.aspect : 1
  const camera = new PerspectiveCamera(fov, aspect, 0.05, 90)
  camera.position.set(...cameraPosition)
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

export function createPreview(options: { aspect: number }) {
  return createRoomPreview(options, createModel, 'treatment-rooms', [6.4, 3.9, 7.1], [2.5, 1.35, -2.7], 36)
}

export function createSidePreview(options: { aspect: number }) {
  return createRoomPreview(options, createModel, 'treatment-rooms', [2.6, 2.4, 5.6], [2.5, 1.3, -3.1], 34)
}

export const createRearPreview = createPreview

export function createLowPreview(options: { aspect: number }) {
  return createRoomPreview(options, createModel, 'treatment-rooms', [3.9, 1.1, 4.4], [2.6, 1.1, -3.2], 36)
}
