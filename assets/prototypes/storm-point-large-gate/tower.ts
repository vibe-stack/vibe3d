import {
  Color,
  DirectionalLight,
  Group,
  HemisphereLight,
  PerspectiveCamera,
  PointLight,
  Scene,
} from 'three/webgpu'

import {
  bakeOcclusion,
  bakeSurfaceAttributes,
  cylinder,
  extrudeProfile,
  groove,
  mergeStaticByMaterial,
  prism,
  WEAR_ATTRIBUTES,
  type Vec2,
} from '../../../src/asset-forge/generator/index.ts'
import { acquireGateMaterials, type GateMaterials } from './materials.ts'

/**
 * The Wall's gate tower, authored as one hand-built mass rather than assembled
 * from a grid of boxes.
 *
 * Three rules this file follows, because breaking them is what made the previous
 * pass read as a kit of parts:
 *
 *   1. No mirrored loops. Every plate, cut and fastener has a named position
 *      chosen for that plate. `mirror()` exists only to flip the finished tower
 *      onto the other jamb, never to place detail.
 *   2. No even spacing. Brackets, scribes and bolts sit where something is
 *      actually fixed or joined; large plate fields are left empty on purpose so
 *      the busy areas read as busy.
 *   3. Masses interpenetrate. The buttress starts inside the shaft and the
 *      gusset passes through both, instead of blocks stacking face to face.
 *
 * Profiles are authored for the +x tower in world metres and mirrored as a whole.
 */

export const JAMB_X = 5.7
export const SHAFT_OUT = 11.4
export const FLARE_OUT = 12.5
export const PLINTH_TOP = 3.0
export const TOWER_TOP = 16.4
export const CROWN_TOP = 17.5
export const MAST_TOP = 20
export const TOWER_FRONT = 2.6
export const TOWER_BACK = -2.9

const TOWER_Z = (TOWER_FRONT + TOWER_BACK) * 0.5
const TOWER_D = TOWER_FRONT - TOWER_BACK

/** Flips a profile authored on +x onto -x, reversing it so the ring stays
 *  counter-clockwise and the caps keep facing outward. */
function mirror(points: Vec2[], side: number): Vec2[] {
  return side > 0 ? points : points.map(([x, y]): Vec2 => [-x, y]).reverse()
}

// ---------------------------------------------------------------------------
// Masses
// ---------------------------------------------------------------------------

/**
 * The shaft. One continuous outline from the plinth to the wedge head, so the
 * silhouette is a single edge - the head's two cants are part of this ring, not
 * a separate block sitting on top of it.
 */
const SHAFT: Vec2[] = [
  [JAMB_X, 2.55],
  [SHAFT_OUT, 2.55],
  [SHAFT_OUT, 13.95],
  [10.05, TOWER_TOP],
  [7.75, TOWER_TOP],
  [JAMB_X, 14.55],
]

/**
 * The buttress. Its inner edge is at 9.2, well inside the shaft's 5.7 - the two
 * masses overlap by three metres rather than meeting on a face. That overlap is
 * why the joint reads as cast rather than glued.
 */
const BUTTRESS: Vec2[] = [
  [9.2, 2.4],
  [FLARE_OUT, 2.4],
  [FLARE_OUT, 6.9],
  [10.9, 9.3],
  [9.2, 9.3],
]

/** Load gusset at the shoulder, passing through both masses at an angle. */
const GUSSET: Vec2[] = [
  [10.25, 9.25],
  [12.2, 6.15],
  [12.2, 9.25],
]

/**
 * Main armour plate. Its outline is not the shaft's: the top-outer corner is
 * clipped shallower, the inner edge steps at a different height, and it stops
 * 1.25 m below the head. A plate that exactly tracks the mass behind it reads as
 * a texture; one with its own outline reads as a plate.
 */
const FACE_PLATE: Vec2[] = [
  [7.85, 3.3],
  [10.1, 3.3],
  [11.05, 5.1],
  [11.05, 13.6],
  [10.2, 15.15],
  [8.6, 15.15],
  [7.85, 14.1],
]

/** Narrow inner plate. Deliberately stops at 13.2, short of everything else. */
const INNER_PLATE: Vec2[] = [
  [6.95, 3.1],
  [7.7, 3.1],
  [7.7, 12.7],
  [7.35, 13.2],
  [6.95, 13.2],
]

/** Outer return, carried on its own rotated plane. */
const RETURN_PLATE: Vec2[] = [
  [10.7, 2.9],
  [11.3, 2.9],
  [11.3, 13.7],
  [10.7, 14.9],
]

/** Buttress facing, battered back from the structural outline. */
const BUTTRESS_FACE: Vec2[] = [
  [9.5, 2.75],
  [FLARE_OUT - 0.22, 2.75],
  [FLARE_OUT - 0.22, 6.85],
  [10.75, 9.05],
  [9.5, 9.05],
]

function addMasses(root: Group, m: GateMaterials, side: number): void {
  // Structural core. Everything else is laid over this, and it is the darkness
  // that shows in every groove between plates.
  root.add(extrudeProfile(m.graphite, mirror(SHAFT, side), TOWER_D, [0, 0, TOWER_Z], {
    fillet: 0.14, bevel: 0.34, arcSegments: 2,
  }))
  root.add(extrudeProfile(m.graphite, mirror(BUTTRESS, side), TOWER_D - 0.5, [0, 0, TOWER_Z - 0.1], {
    fillet: 0.12, bevel: 0.3, arcSegments: 2,
  }))
  // The gusset is turned out of plane so it cuts across the shoulder instead of
  // lying flat on it.
  root.add(extrudeProfile(m.graphiteLight, mirror(GUSSET, side), 1.05, [0, 0, TOWER_FRONT - 0.5], {
    rotation: [0, side * -0.22, 0], fillet: 0.08, bevel: 0.16, arcSegments: 2,
  }))

  // Armour. Three plates at three depths, each with its own outline; the gaps
  // between them are the panel lines.
  root.add(extrudeProfile(m.shell, mirror(FACE_PLATE, side), 0.42, [0, 0, TOWER_FRONT + 0.06], {
    fillet: 0.1, bevel: 0.2, arcSegments: 2,
  }))
  root.add(extrudeProfile(m.shellLight, mirror(INNER_PLATE, side), 0.26, [0, 0, TOWER_FRONT + 0.1], {
    fillet: 0.07, bevel: 0.13, arcSegments: 2,
  }))
  root.add(extrudeProfile(m.shell, mirror(RETURN_PLATE, side), 0.3, [side * 0.36, 0, TOWER_FRONT - 0.34], {
    rotation: [0, side * -0.66, 0], fillet: 0.07, bevel: 0.12, arcSegments: 2,
  }))
  root.add(extrudeProfile(m.shellShadow, mirror(RETURN_PLATE, side), TOWER_D - 1.9, [
    side * 0.28, 0, TOWER_Z + 0.35,
  ], { fillet: 0.06, bevel: 0.14 }))
  root.add(extrudeProfile(m.shell, mirror(BUTTRESS_FACE, side), 0.44, [0, 0, TOWER_FRONT + 0.3], {
    fillet: 0.12, bevel: 0.22, arcSegments: 2,
  }))
}

// ---------------------------------------------------------------------------
// Service and signal
// ---------------------------------------------------------------------------

function addChannel(root: Group, m: GateMaterials, side: number): void {
  const x0 = side * (JAMB_X + 0.05)
  const x1 = side * (JAMB_X + 1.28)
  const lo = Math.min(x0, x1)
  const hi = Math.max(x0, x1)

  root.add(prism(m.graphite, [Math.abs(x1 - x0), 12.5, 0.56], [(x0 + x1) * 0.5, 9.0, TOWER_FRONT + 0.42], {
    chamfer: side > 0 ? [0.42, 0.18, 0.18, 0.42] : [0.18, 0.42, 0.42, 0.18],
    fillet: 0.08, bevel: 0.14,
  }))

  // One long run and one short marker. Different lengths, different heights -
  // the pair is instrumentation, not a repeated motif.
  for (const [y0, y1] of [[8.55, 13.05], [4.55, 5.5]] as const) {
    root.add(prism(m.ink, [hi - lo - 0.5, y1 - y0 + 0.26, 0.08], [
      (lo + hi) * 0.5, (y0 + y1) * 0.5, TOWER_FRONT + 0.72,
    ], { chamfer: 0.2, fillet: 0.05, bevel: 0.04 }))
    root.add(prism(m.field, [hi - lo - 0.74, y1 - y0, 0.1], [
      (lo + hi) * 0.5, (y0 + y1) * 0.5, TOWER_FRONT + 0.78,
    ], { chamfer: 0.16, fillet: 0.05, bevel: 0.05 }))
  }

  // Feed bracket under the long run, and clamps at the heights the conduit is
  // actually restrained - 3.9, 7.15 and 12.4 are joints, not a division of the
  // height into equal parts.
  root.add(prism(m.shellLight, [hi - lo - 0.14, 0.62, 0.26], [
    (lo + hi) * 0.5, 8.1, TOWER_FRONT + 0.8,
  ], { chamfer: 0.14, fillet: 0.05, bevel: 0.07 }))
  for (const y of [3.9, 7.15, 12.4]) {
    root.add(prism(m.graphite, [0.62, 0.26, 0.26], [
      side * (JAMB_X + 1.05), y, TOWER_FRONT + 0.86,
    ], { chamfer: 0.08, fillet: 0.04, bevel: 0.05 }))
  }
  root.add(cylinder(m.steel, 0.1, 9.4, [side * (JAMB_X + 1.05), 8.4, TOWER_FRONT + 0.86], [0, 0, 0], 6))
}

function addHead(root: Group, m: GateMaterials, side: number): void {
  // Vent stack on the head, pushed to one side of the face rather than centred.
  const vx = side * 9.35
  root.add(prism(m.graphite, [1.9, 1.15, 0.7], [vx, 15.5, TOWER_FRONT - 0.35], {
    chamfer: side > 0 ? [0.34, 0.16, 0.1, 0.1] : [0.16, 0.34, 0.1, 0.1],
    fillet: 0.06, bevel: 0.1,
  }))
  for (const y of [15.12, 15.44, 15.76]) {
    root.add(prism(m.ink, [1.5, 0.13, 0.06], [vx, y, TOWER_FRONT + 0.02], { fillet: 0.03, bevel: 0.03 }))
  }

  root.add(prism(m.graphite, [4.0, CROWN_TOP - TOWER_TOP + 0.9, 3.1], [
    side * 8.9, (TOWER_TOP - 0.9 + CROWN_TOP) * 0.5, TOWER_Z + 0.3,
  ], {
    chamfer: side > 0 ? [0.8, 0.5, 0, 0] : [0.5, 0.8, 0, 0],
    fillet: 0.1, bevel: 0.26, arcSegments: 2,
  }))
  root.add(prism(m.shellLight, [3.4, 0.42, 2.5], [side * 8.9, CROWN_TOP + 0.21, TOWER_Z + 0.3], {
    chamfer: side > 0 ? [0.44, 0.3, 0, 0] : [0.3, 0.44, 0, 0],
    fillet: 0.08, bevel: 0.16,
  }))

  const mastX = side * 9.9
  root.add(cylinder(m.graphite, 0.15, 0.5, [mastX, CROWN_TOP + 0.62, TOWER_Z + 0.5], [0, 0, 0], 6))
  root.add(cylinder(m.steel, 0.05, MAST_TOP - CROWN_TOP - 0.9, [
    mastX, (MAST_TOP + CROWN_TOP + 0.95) * 0.5, TOWER_Z + 0.5,
  ], [0, 0, 0], 5))
}

// ---------------------------------------------------------------------------
// Cuts and fasteners
// ---------------------------------------------------------------------------

/** A bolt: proud enough to have a lit cap and a shadowed side at this range. */
function bolt(root: Group, m: GateMaterials, x: number, y: number, z: number): void {
  root.add(cylinder(m.steel, 0.14, 0.12, [x, y, z + 0.04], [Math.PI / 2, 0, 0], 6))
}

/** A cut across the face plate. Every one is a different length and stops at a
 *  different distance from the plate edge. */
function cut(root: Group, m: GateMaterials, from: Vec2, to: Vec2, z: number): void {
  const dx = to[0] - from[0]
  const dy = to[1] - from[1]
  root.add(groove(m.shellShadow, Math.hypot(dx, dy), 0.13, 0.07, [
    (from[0] + to[0]) * 0.5, (from[1] + to[1]) * 0.5, z,
  ], [0, 0, Math.atan2(dy, dx) + Math.PI / 2]))
}

function addDetail(root: Group, m: GateMaterials, side: number): void {
  const faceZ = TOWER_FRONT + 0.48
  const at = (x: number) => side * x

  // Two cuts across the main plate, at unequal heights, each stopping short by a
  // different margin. One runs the full width; the other does not reach the
  // outer edge at all, because it is the seam of a smaller panel.
  cut(root, m, [at(8.15), 11.05], [at(10.85), 11.05], faceZ)
  cut(root, m, [at(8.15), 6.35], [at(9.9), 6.35], faceZ)
  // A short vertical closing the second seam into an L, the way a real panel
  // break turns a corner.
  cut(root, m, [at(9.9), 6.35], [at(9.9), 4.1], faceZ)

  // Inspection pocket, placed off-centre and high on the plate.
  const px: [number, number] = side > 0 ? [9.35, 10.8] : [-10.8, -9.35]
  root.add(prism(m.ink, [px[1] - px[0], 1.5, 0.07], [(px[0] + px[1]) * 0.5, 12.55, faceZ - 0.02], {
    chamfer: 0.2, fillet: 0.05, bevel: 0.04,
  }))
  root.add(prism(m.shellShadow, [px[1] - px[0] - 0.2, 1.3, 0.09], [
    (px[0] + px[1]) * 0.5, 12.55, faceZ + 0.01,
  ], { chamfer: 0.14, fillet: 0.05, bevel: 0.05 }))
  bolt(root, m, px[0] + 0.18, 13.14, faceZ + 0.05)
  bolt(root, m, px[1] - 0.18, 13.14, faceZ + 0.05)
  bolt(root, m, px[0] + 0.18, 11.96, faceZ + 0.05)

  // Repair patch: a small plate bolted over the main armour, turned a couple of
  // degrees off square and sitting nowhere in particular. Nothing else on the
  // tower lines up with it, which is the point.
  const patch = new Group()
  patch.position.set(at(9.55), 8.4, faceZ - 0.02)
  patch.rotation.z = side * 0.045
  root.add(patch)
  patch.add(prism(m.shellShadow, [2.1, 1.75, 0.16], [0, 0, 0], {
    chamfer: 0.22, fillet: 0.06, bevel: 0.08,
  }))
  for (const [bx, by] of [[-0.85, 0.68], [0, 0.72], [0.85, 0.68], [-0.85, -0.7], [0.86, -0.66]] as const) {
    bolt(patch, m, bx, by, 0.08)
  }

  // Heat-sink bay, low on the buttress and pushed outboard. One bay only, and
  // the fins run on a 0.3 m physical pitch rather than a share of the opening.
  const bayLo = at(side > 0 ? 10.15 : 12.05)
  const bayHi = at(side > 0 ? 12.05 : 10.15)
  root.add(prism(m.ink, [Math.abs(bayHi - bayLo), 2.4, 0.07], [
    (bayLo + bayHi) * 0.5, 4.75, TOWER_FRONT + 0.72,
  ], { chamfer: 0.18, fillet: 0.05, bevel: 0.04 }))
  for (let y = 3.75; y <= 5.85; y += 0.3) {
    root.add(prism(m.steel, [Math.abs(bayHi - bayLo) - 0.24, 0.14, 0.18], [
      (bayLo + bayHi) * 0.5, y, TOWER_FRONT + 0.8,
    ], { fillet: 0.03, bevel: 0.03 }))
  }
  root.add(prism(m.graphite, [Math.abs(bayHi - bayLo) + 0.26, 0.34, 0.28], [
    (bayLo + bayHi) * 0.5, 6.12, TOWER_FRONT + 0.74,
  ], { chamfer: 0.14, fillet: 0.05, bevel: 0.06 }))

  // Fasteners at the gusset root - the one place on the buttress where two
  // masses are actually bolted together.
  bolt(root, m, at(11.35), 8.7, TOWER_FRONT + 0.52)
  bolt(root, m, at(11.75), 7.9, TOWER_FRONT + 0.52)
  bolt(root, m, at(11.4), 7.15, TOWER_FRONT + 0.52)

  // Hazard chip on the buttress corner, where a vehicle would strike it.
  root.add(prism(m.lime, [1.7, 0.42, 0.5], [at(11.6), 2.95, TOWER_FRONT + 0.5], {
    chamfer: side > 0 ? [0.14, 0.06, 0.06, 0.14] : [0.06, 0.14, 0.14, 0.06],
    fillet: 0.05, bevel: 0.06,
  }))
}

/** Builds one tower on the given jamb. */
export function addTower(root: Group, m: GateMaterials, side: number): void {
  addMasses(root, m, side)
  addChannel(root, m, side)
  addHead(root, m, side)
  addDetail(root, m, side)
}

// ---------------------------------------------------------------------------
// Study preview: one tower, framed tight, for iterating the shape language.
// ---------------------------------------------------------------------------

export function createTowerStudy(
  materials: GateMaterials,
  options: { aspect: number },
): { scene: Scene; root: Group; camera: PerspectiveCamera } {
  const root = new Group()
  root.name = 'storm-point-wall-tower / study'
  addTower(root, materials, 1)

  const scene = new Scene()
  scene.background = new Color(0x000000)
  scene.add(root)
  scene.add(new HemisphereLight(0x93a8bb, 0x070a0d, 0.2))

  const key = new DirectionalLight(0xfff6ec, 2.5)
  key.position.set(-12, 20, 26)
  key.castShadow = true
  key.shadow.mapSize.set(2048, 2048)
  key.shadow.camera.left = -14
  key.shadow.camera.right = 14
  key.shadow.camera.top = 16
  key.shadow.camera.bottom = -6
  key.shadow.camera.near = 6
  key.shadow.camera.far = 70
  key.shadow.bias = -0.0005
  key.shadow.normalBias = 0.04
  scene.add(key)

  const fill = new DirectionalLight(0x8fa9c2, 0.3)
  fill.position.set(22, 8, 12)
  scene.add(fill)
  const bounce = new DirectionalLight(0x76889a, 0.42)
  bounce.position.set(-4, -9, 16)
  scene.add(bounce)
  const rim = new DirectionalLight(0xa9c2d4, 0.42)
  rim.position.set(12, 12, -18)
  scene.add(rim)
  const spill = new PointLight(0x5ad07e, 0.5, 6, 2)
  spill.position.set(JAMB_X + 0.7, 10.8, TOWER_FRONT + 1.4)
  scene.add(spill)

  root.traverse((object) => {
    if ((object as { isMesh?: boolean }).isMesh) {
      object.castShadow = true
      object.receiveShadow = true
    }
  })

  const aspect = Number.isFinite(options.aspect) && options.aspect > 0 ? options.aspect : 0.62
  const camera = new PerspectiveCamera(26, aspect, 2, 160)
  const yaw = (-27 * Math.PI) / 180
  const pitch = (6 * Math.PI) / 180
  const distance = 40
  const target = 9.6
  const horizontal = distance * Math.cos(pitch)
  camera.position.set(
    9 - horizontal * Math.sin(yaw),
    target + distance * Math.sin(pitch),
    horizontal * Math.cos(yaw),
  )
  camera.lookAt(9, target, 0)
  scene.add(camera)

  return { scene, root, camera }
}

/** Entry point for `asset:forge preview` while the tower's shape language is
 *  being settled: one tower, framed tight, batched the same way the gate does. */
export function createPreview(options: { aspect: number }): {
  scene: Scene
  root: Group
  camera: PerspectiveCamera
  dispose: () => void
} {
  const { materials, handles, profiles, wearMaterial } = acquireGateMaterials()
  const study = createTowerStudy(materials, options)

  bakeOcclusion(study.root)
  bakeSurfaceAttributes(study.root, profiles)
  const worn = new Set(profiles.keys())
  const merged = mergeStaticByMaterial(study.root, {
    resolveMaterial: (source) => (worn.has(source) ? wearMaterial : source),
    retainedAttributes: (resolved) => (resolved === wearMaterial ? WEAR_ATTRIBUTES : []),
    meshName: (material) => `storm-point-wall-tower / ${material.name}`,
  })
  study.root.traverse((object) => {
    if ((object as { isMesh?: boolean }).isMesh) {
      object.castShadow = true
      object.receiveShadow = true
    }
  })

  return {
    ...study,
    dispose: () => {
      for (const geometry of merged) geometry.dispose()
      wearMaterial.dispose()
      for (const handle of handles) handle.release()
    },
  }
}
