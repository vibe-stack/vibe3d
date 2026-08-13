import { Group, Object3D } from 'three/webgpu'

import { cylinder, extrudeProfile, type Vec2, type Vec3 } from '../../../src/asset-forge/generator/index.ts'
import {
  AXIS_X,
  AXIS_Y,
  acquireCargoMaterials,
  box,
  containerDoorFrame,
  containerDoorLeaf,
  containerMetrics,
  containerShell,
  createCargoPreview,
  finishModel,
  socket,
  type CargoMaterialBundle,
  type CargoMaterials,
  type CargoPreview,
  type CargoPreviewOptions,
  type ContainerMetrics,
  type ContainerShellOptions,
} from '../axiom-cargo-kit/index.ts'

/**
 * Axiom Relay wrecked freight container.
 *
 * Damage is authored as a *cause*, not as noise. This unit was dropped on its
 * front-left corner: the casting is driven up into the post, the roof sags along
 * the line between the two undamaged corners, the near side wall has buckled
 * into a fold running back from the impact, and one door leaf has torn its top
 * hinge and hangs on the bottom one. Every mark traces back to that single
 * event, which is what separates believable destruction from a dirt pass.
 *
 * The undamaged half is left completely intact on purpose. A container that is
 * uniformly wrecked reads as a texture; one that is half pristine reads as an
 * accident.
 */

const SPEC: ContainerShellOptions = {
  length: 6.06,
  width: 2.44,
  height: 2.59,
  ownership: false,
  // The roof is authored here instead: a sag plate laid inside an intact deck
  // shares its plane, so the drop never reads and the two surfaces mottle each
  // other from every angle that sees the top.
  roof: false,
  variant: 90,
}

/** The wreck sits down on its crushed corner: a lift and two small tilts. */
const LIFT = 0.05
const TILT_X = 0.014
const TILT_Z = -0.038

/**
 * The shell-space height that puts a part's underside on the ground.
 *
 * Every loose piece around this container hangs off a root that is lifted and
 * tilted, so debris authored at y = 0 lands up to 170 mm in the air at the aft
 * end. Both tilts are small enough that their cosines are 1 to within a tenth
 * of a millimetre over the container's length, so the correction is linear.
 */
function groundY(x: number, z: number, half: number): number {
  return half - LIFT - Math.sin(TILT_Z) * x + Math.sin(TILT_X) * z
}

/** The axis a cylinder lands on for an XYZ Euler of `[tilt, 0, spin]`. */
function lean(tilt: number, spin: number): Vec3 {
  return [-Math.sin(spin), Math.cos(spin) * Math.cos(tilt), Math.cos(spin) * Math.sin(tilt)]
}

interface DamagedContainerSockets {
  impact_corner: Object3D
  breach: Object3D
  hanging_door: Object3D
  interior: Object3D
}

export interface DamagedContainerController {
  root: Group
  parts: { shell: Group; doorLeft: Group; doorRight: Group }
  sockets: DamagedContainerSockets
  update(deltaSeconds: number): void
  dispose(): void
}

/** A buckled panel: two plates folded along a shared crease. */
function fold(
  shell: Group,
  m: CargoMaterials,
  centre: [number, number, number],
  length: number,
  height: number,
  depth: number,
  tilt: number,
): void {
  // Each half is placed from its own inner edge, which the rotation has already
  // pulled `cos(tilt)` of a quarter-length toward the crease, and then laps the
  // other by 30 mm. Offset by a flat quarter-length instead, the two halves
  // pivoted about their own centres and left a 38 mm slit down the crease.
  const reach = length * 0.25 * Math.cos(tilt) - 0.03
  for (const sign of [-1, 1]) {
    box(shell, m.shellShade, [length * 0.5, height, 0.05], [
      centre[0] + sign * reach,
      centre[1],
      centre[2] - depth * 0.5,
    ], {
      chamfer: 0.03, fillet: 0.012, bevel: 0.012,
      rotation: [0, sign * tilt, 0],
    })
  }
}

/**
 * The roof deck, creased along the line running back from the impact corner.
 *
 * Owned here because {@link SPEC} turns the kit's flat deck off: the sag has to
 * be the deck, not a plate laid on top of one.
 */
function sagRoof(shell: Group, m: CargoMaterials, k: ContainerMetrics): void {
  const deck = SPEC.height - 0.11
  const span = SPEC.length - k.casting * 2 + 0.05
  const crease = SPEC.length * 0.16
  const sag = 0.12
  for (const [from, to] of [[-span * 0.5, crease], [crease, span * 0.5]] as const) {
    const run = to - from
    // Each half runs downhill to the crease, so the rake takes the sign of the
    // end that drops.
    const rake = Math.atan2(sag, run) * (to === crease ? -1 : 1)
    const length = Math.hypot(run, sag)
    const centre: Vec3 = [(from + to) * 0.5, deck - sag * 0.5, 0]
    box(shell, m.shellLight, [length, 0.13, SPEC.width - 0.16], centre, {
      chamfer: 0.05, fillet: 0.018, bevel: 0.018, rotation: [0, 0, rake],
    })
    // The stiffeners ride the plate's own normal, biting 20 mm into it.
    for (let index = 0; index < 5; index += 1) {
      box(shell, m.shellShade, [length - 0.14, 0.05, 0.1], [
        centre[0] - Math.sin(rake) * 0.07,
        centre[1] + Math.cos(rake) * 0.07,
        (index / 4 - 0.5) * (SPEC.width - 0.62),
      ], { chamfer: 0.028, fillet: 0.01, bevel: 0.009, rotation: [0, 0, rake] })
    }
  }
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const x = sx * (SPEC.length * 0.5 - k.casting * 1.5)
      const reach = x < crease ? crease + span * 0.5 : span * 0.5 - crease
      const top = deck + 0.065 - sag * (1 - Math.abs(x - crease) / reach)
      const z = sz * (SPEC.width * 0.5 - 0.44)
      box(shell, m.steel, [0.22, 0.05, 0.16], [x, top + 0.005, z], { chamfer: 0.03, fillet: 0.01, bevel: 0.01 })
      shell.add(cylinder(m.ink, 0.035, 0.06, [x, top + 0.05, z], AXIS_Y, 8))
    }
  }
}

/** A torn opening: a ragged rim with the dark interior visible behind it. */
function breach(shell: Group, m: CargoMaterials, x: number, y: number, z: number): void {
  const rim: Vec2[] = [
    [-0.44, 0.3], [-0.18, 0.4], [0.1, 0.33], [0.4, 0.38],
    [0.46, 0.02], [0.3, -0.26], [0.02, -0.34], [-0.26, -0.24], [-0.46, 0.0],
  ]
  const inner: Vec2[] = rim.map(([px, py]): Vec2 => [px * 0.68, py * 0.66])
  shell.add(extrudeProfile(m.ironOxide, rim, 0.06, [x, y, z], {
    holes: [inner], fillet: 0.02, bevel: 0.014,
  }))
  // The dark behind the tear fills the rim's own bore and is wider than it, so
  // its edges are covered by the ring. Set back at `z - 0.14` it sat behind the
  // intact wall skin, and the hole read as a rust outline on an unbroken panel.
  box(shell, m.ink, [0.68, 0.56, 0.16], [x, y, z - 0.1], { chamfer: 0.08, fillet: 0.024, bevel: 0.012 })
  // Two petals of skin folded outward at the tear, which is how thin plate fails.
  for (const sign of [-1, 1]) {
    box(shell, m.shellShade, [0.16, 0.3, 0.03], [x + sign * 0.3, y + 0.08, z + 0.06], {
      chamfer: 0.02, fillet: 0.008, bevel: 0.007, rotation: [0, sign * 0.7, sign * 0.2],
    })
  }
}

function damage(shell: Group, m: CargoMaterials, k: ReturnType<typeof containerMetrics>): void {
  const cornerX = SPEC.length * 0.5 - k.casting * 0.5
  const cornerZ = SPEC.width * 0.5 - k.casting * 0.5

  // Impact corner: the casting driven up and rotated into the post. It has to
  // swallow the pristine casting under it, which stands to 0.3; at 0.8 of a
  // casting height the crush topped out at 0.222 and 78 mm of undamaged block
  // came back out through it.
  box(shell, m.ironOxide, [k.casting * 1.1, k.casting * 1.2, k.casting * 1.1], [cornerX - 0.04, k.casting * 0.5, cornerZ - 0.03], {
    chamfer: 0.07, fillet: 0.02, bevel: 0.014, rotation: [0.12, 0.18, -0.16],
  })
  box(shell, m.graphiteEdge, [0.24, 0.5, 0.24], [cornerX - 0.06, 0.62, cornerZ - 0.05], {
    chamfer: 0.06, fillet: 0.018, bevel: 0.013, rotation: [0.05, 0, -0.09],
  })

  // Buckle running back from the impact along the +Z flank.
  fold(shell, m, [SPEC.length * 0.22, 1.36, SPEC.width * 0.5 + 0.02], 1.7, 1.5, 0.16, 0.3)
  fold(shell, m, [SPEC.length * 0.02, 1.6, SPEC.width * 0.5 + 0.02], 1.1, 0.9, 0.1, 0.2)
  breach(shell, m, -SPEC.length * 0.2, 1.3, SPEC.width * 0.5 + 0.04)

  // Oxide bloom where the coating is gone: bands rather than a wash, because
  // rust runs from a source and streaks downward.
  //
  // Each band sits on a rib's outer face, which is both where a coating fails
  // first and the only surface at that z. Held out at `width*0.5 + 0.084` they
  // stood 68 mm off the flank and read as bars hanging in front of it; dropped
  // into a corrugation valley instead they would float 26 mm.
  const ribX = (index: number): number => ((index + 0.5) / k.ribCount - 0.5) * (SPEC.length - k.casting * 2 - 0.16)
  const ribZ = SPEC.width * 0.5 - 0.075 + k.ribFace
  for (const [index, y, height] of [[1, 0.95, 1.1], [2, 0.7, 0.7], [9, 1.5, 0.8]] as const) {
    box(shell, m.ironOxide, [0.11, height, 0.02], [ribX(index), y, ribZ], {
      chamfer: 0.02, fillet: 0.008, bevel: 0.006,
    })
  }

  // A bent lashing bar left leaning against the flank, kinked into two lengths.
  // The lower length leans in to the wall - drawn with a positive X rotation it
  // leaned away from it - and the upper one is placed from the lower one's head
  // rather than typed, so the two meet. Authored independently their ends were
  // 0.57 m apart and the bar read as two loose sticks.
  const lowerLean: Vec3 = [-0.3, 0, 0.22]
  const upperLean: Vec3 = [0.9, 0, 0.5]
  const foot: Vec3 = [2.1, 0.74, SPEC.width * 0.5 + 0.22]
  const lower = lean(lowerLean[0], lowerLean[2])
  const upper = lean(upperLean[0], upperLean[2])
  shell.add(cylinder(m.ironOxide, 0.032, 1.5, foot, lowerLean, 8))
  shell.add(cylinder(m.ironOxide, 0.032, 0.5, [
    foot[0] + lower[0] * 0.75 + upper[0] * 0.21,
    foot[1] + lower[1] * 0.75 + upper[1] * 0.21,
    foot[2] + lower[2] * 0.75 + upper[2] * 0.21,
  ], upperLean, 8))

  // Debris on the deck, placed in the ground's frame rather than the wreck's.
  box(shell, m.ironOxide, [0.3, 0.05, 0.3], [-2.4, groundY(-2.4, SPEC.width * 0.5 + 0.4, 0.034), SPEC.width * 0.5 + 0.4], {
    chamfer: 0.06, fillet: 0.02, bevel: 0.008, rotation: [0, 0.4, 0.06],
  })
  shell.add(cylinder(m.ink, 0.16, 0.05, [-1.6, groundY(-1.6, SPEC.width * 0.5 + 0.5, 0.025), SPEC.width * 0.5 + 0.5], AXIS_Y, 10))
}

function build(): {
  root: Group
  shell: Group
  doorLeft: Group
  doorRight: Group
  sockets: DamagedContainerSockets
  bundle: CargoMaterialBundle
} {
  const bundle = acquireCargoMaterials(57_200, { condition: 1 })
  const m = bundle.materials
  const k = containerMetrics(SPEC)

  const root = new Group()
  root.name = 'AXR_CARGO_DAMAGED-CONTAINER_ROOT_WRECKED'
  // The unit sits down on its crushed corner. This single rotation does more
  // for the read than any amount of surface damage: a box that is out of level
  // is broken before the viewer has resolved a single dent.
  root.rotation.set(TILT_X, 0, TILT_Z)
  root.position.y = LIFT
  const shell = new Group()
  shell.name = 'AXR_CARGO_DAMAGED-CONTAINER_PART_SHELL_WRECKED'
  const doorLeft = new Group()
  doorLeft.name = 'AXR_CARGO_DAMAGED-CONTAINER_PART_DOOR-LEFT_HANGING'
  const doorRight = new Group()
  doorRight.name = 'AXR_CARGO_DAMAGED-CONTAINER_PART_DOOR-RIGHT_CLOSED'
  root.add(shell, doorLeft, doorRight)

  containerShell(shell, m, bundle, SPEC)
  containerDoorFrame(shell, m, SPEC)
  sagRoof(shell, m, k)
  damage(shell, m, k)

  // A dark interior plane, so the hanging door does not open onto daylight.
  box(shell, m.ink, [0.08, SPEC.height - 0.7, SPEC.width - 0.6], [SPEC.length * 0.5 - 0.36, SPEC.height * 0.5, 0], {
    chamfer: 0.05, fillet: 0.018, bevel: 0.01,
  })

  const hinge = SPEC.width * 0.5 - k.casting - 0.02
  // The leaves hang behind the door frame's head and sill bars, whose inboard
  // face is at `length*0.5 - 0.24`. Set 130 mm further forward the 0.1-thick
  // skins ran straight through both bars for the full width of the opening.
  doorLeft.position.set(SPEC.length * 0.5 - 0.285, 0, -hinge)
  doorRight.position.set(SPEC.length * 0.5 - 0.285, 0, hinge)
  containerDoorLeaf(doorLeft, m, bundle, { ...SPEC, side: 1 })
  containerDoorLeaf(doorRight, m, bundle, { ...SPEC, side: -1 })
  // Each leaf is half the clear opening, so a shut pair meets on a mathematical
  // point and the 0.1 taken out for clearance is a 60 mm slit. The leaf that
  // shuts second carries a closing strip behind the joint, lapping both skins
  // by 40 mm - here it goes with the torn leaf and shows on its back edge.
  const leaf = (SPEC.width - k.casting * 2 - 0.1) * 0.5
  box(doorLeft, m.shell, [0.06, SPEC.height - 0.62, (hinge - leaf) * 2 + 0.08], [-0.06, (SPEC.height - 0.5) * 0.5 + 0.24, hinge], {
    chamfer: 0.02, fillet: 0.008, bevel: 0.007,
  })
  // Torn top hinge: the leaf swings open and leans out of plumb on the survivor.
  doorLeft.rotation.set(0, -1.34, 0)
  doorLeft.rotateZ(-0.075)
  shell.add(cylinder(m.ironOxide, 0.05, 0.3, [SPEC.length * 0.5 - 0.14, SPEC.height - 0.5, -hinge], AXIS_X, 8))

  const sockets: DamagedContainerSockets = {
    impact_corner: socket('impact_corner', [SPEC.length * 0.5 - k.casting * 0.5, k.casting * 0.5, SPEC.width * 0.5 - k.casting * 0.5]),
    breach: socket('breach', [-SPEC.length * 0.2, 1.3, SPEC.width * 0.5 + 0.14]),
    hanging_door: socket('hanging_door', [SPEC.length * 0.5 - 0.22, SPEC.height * 0.5, -hinge]),
    interior: socket('interior', [SPEC.length * 0.25, 0.4, 0]),
  }
  return { root, shell, doorLeft, doorRight, sockets, bundle }
}

export function createModel(): DamagedContainerController {
  const { root, shell, doorLeft, doorRight, sockets, bundle } = build()
  const finished = finishModel(root, bundle, {
    name: 'damaged-container',
    assemblies: [doorLeft, doorRight],
    reach: 0.34,
    sockets: Object.values(sockets),
  })
  let elapsed = 0
  // A wreck is unpowered: the lamps are dead and stay dead.
  bundle.materials.amber.emissiveIntensity = 0
  bundle.materials.cyan.emissiveIntensity = 0
  return {
    root,
    parts: { shell, doorLeft, doorRight },
    sockets,
    update: (deltaSeconds: number) => {
      elapsed += Math.min(Math.max(deltaSeconds, 0), 0.05)
      // One surviving lamp on the door frame, failing intermittently.
      const flicker = Math.sin(elapsed * 11) * Math.sin(elapsed * 2.3)
      bundle.materials.amber.emissiveIntensity = flicker > 0.55 ? 1.4 : 0
    },
    dispose: finished.dispose,
  }
}

export const createPreview = (options: CargoPreviewOptions = {}): CargoPreview =>
  createCargoPreview(createModel(), {
    target: [0, SPEC.height * 0.48, 0],
    distance: 12.6,
    yaw: 0.78,
    pitch: 0.3,
    fov: 30,
    ...options,
  })
