import { Group, Object3D } from 'three/webgpu'

import { cylinder, extrudeProfile, type Vec2 } from '../../../src/asset-forge/generator/index.ts'
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
  variant: 90,
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
  for (const sign of [-1, 1]) {
    box(shell, m.shellShade, [length * 0.5, height, 0.05], [
      centre[0] + sign * length * 0.25,
      centre[1],
      centre[2] - depth * 0.5,
    ], {
      chamfer: 0.03, fillet: 0.012, bevel: 0.012,
      rotation: [0, sign * tilt, 0],
    })
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
  box(shell, m.ink, [0.62, 0.5, 0.05], [x, y, z - 0.14], { chamfer: 0.08, fillet: 0.024, bevel: 0.012 })
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

  // Impact corner: the casting driven up and rotated into the post.
  box(shell, m.ironOxide, [k.casting * 1.1, k.casting * 0.8, k.casting * 1.1], [cornerX - 0.04, k.casting * 0.34, cornerZ - 0.03], {
    chamfer: 0.07, fillet: 0.02, bevel: 0.014, rotation: [0.12, 0.18, -0.16],
  })
  box(shell, m.graphiteEdge, [0.24, 0.5, 0.24], [cornerX - 0.06, 0.62, cornerZ - 0.05], {
    chamfer: 0.06, fillet: 0.018, bevel: 0.013, rotation: [0.05, 0, -0.09],
  })
  // Sagging roof line between the two surviving corners.
  box(shell, m.shellShade, [SPEC.length * 0.5, 0.09, SPEC.width - 0.5], [SPEC.length * 0.16, SPEC.height - 0.14, 0], {
    chamfer: 0.05, fillet: 0.018, bevel: 0.012, rotation: [0, 0, -0.045],
  })

  // Buckle running back from the impact along the +Z flank.
  fold(shell, m, [SPEC.length * 0.22, 1.36, SPEC.width * 0.5 + 0.02], 1.7, 1.5, 0.16, 0.3)
  fold(shell, m, [SPEC.length * 0.02, 1.6, SPEC.width * 0.5 + 0.02], 1.1, 0.9, 0.1, 0.2)
  breach(shell, m, -SPEC.length * 0.2, 1.3, SPEC.width * 0.5 + 0.04)

  // Oxide bloom where the coating is gone: bands rather than a wash, because
  // rust runs from a source and streaks downward.
  for (const [x, y, height] of [[-1.9, 0.95, 1.1], [-1.5, 0.7, 0.7], [1.1, 1.5, 0.8]] as const) {
    box(shell, m.ironOxide, [0.11, height, 0.02], [x, y, SPEC.width * 0.5 + 0.084], {
      chamfer: 0.02, fillet: 0.008, bevel: 0.006,
    })
  }
  // A bent lashing bar left leaning against the flank.
  shell.add(cylinder(m.ironOxide, 0.032, 1.5, [2.1, 0.74, SPEC.width * 0.5 + 0.24], [0.3, 0, 0.22], 8))
  shell.add(cylinder(m.ironOxide, 0.032, 0.5, [2.32, 1.44, SPEC.width * 0.5 + 0.4], [0.9, 0, 0.5], 8))
  box(shell, m.ironOxide, [0.3, 0.05, 0.3], [-2.4, 0.03, SPEC.width * 0.5 + 0.4], {
    chamfer: 0.06, fillet: 0.02, bevel: 0.008, rotation: [0, 0.4, 0.06],
  })
  shell.add(cylinder(m.ink, 0.16, 0.05, [-1.6, 0.025, SPEC.width * 0.5 + 0.5], AXIS_Y, 10))
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
  root.rotation.set(0.014, 0, -0.038)
  root.position.y = 0.05
  const shell = new Group()
  shell.name = 'AXR_CARGO_DAMAGED-CONTAINER_PART_SHELL_WRECKED'
  const doorLeft = new Group()
  doorLeft.name = 'AXR_CARGO_DAMAGED-CONTAINER_PART_DOOR-LEFT_HANGING'
  const doorRight = new Group()
  doorRight.name = 'AXR_CARGO_DAMAGED-CONTAINER_PART_DOOR-RIGHT_CLOSED'
  root.add(shell, doorLeft, doorRight)

  containerShell(shell, m, bundle, SPEC)
  containerDoorFrame(shell, m, SPEC)
  damage(shell, m, k)

  // A dark interior plane, so the hanging door does not open onto daylight.
  box(shell, m.ink, [0.08, SPEC.height - 0.7, SPEC.width - 0.6], [SPEC.length * 0.5 - 0.36, SPEC.height * 0.5, 0], {
    chamfer: 0.05, fillet: 0.018, bevel: 0.01,
  })

  const hinge = SPEC.width * 0.5 - k.casting - 0.02
  doorLeft.position.set(SPEC.length * 0.5 - 0.22, 0, -hinge)
  doorRight.position.set(SPEC.length * 0.5 - 0.22, 0, hinge)
  containerDoorLeaf(doorLeft, m, bundle, { ...SPEC, side: 1 })
  containerDoorLeaf(doorRight, m, bundle, { ...SPEC, side: -1 })
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
