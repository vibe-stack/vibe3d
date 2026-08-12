import { Group, Object3D } from 'three/webgpu'

import { cylinder } from '../../../src/asset-forge/generator/index.ts'
import {
  AXIS_X,
  acquireCargoMaterials,
  box,
  containerDoorFrame,
  containerDoorLeaf,
  containerMetrics,
  containerShell,
  createCargoPreview,
  finishModel,
  seam,
  socket,
  statusLens,
  type CargoMaterialBundle,
  type CargoMaterials,
  type CargoPreview,
  type CargoPreviewOptions,
  type ContainerShellOptions,
} from '../axiom-cargo-kit/index.ts'

/**
 * Axiom Relay open-top freight container.
 *
 * Same chassis with the roof deleted, which means the interior is now the
 * subject: a ribbed deck, a liner up each wall, four lashing rings, and a
 * removable header bar across the door end. A tarp sits rolled and strapped
 * along one top rail, because an open-top with no tarp anywhere is a container
 * that lost one.
 *
 * The header bar matters structurally as well as visually - it is what stops the
 * door end from racking once the roof is gone, and leaving it out makes the
 * whole silhouette read as a container with its top sheared off.
 */

const SPEC: ContainerShellOptions = {
  length: 6.06,
  width: 2.44,
  height: 2.59,
  roof: false,
  variant: 70,
}

interface OpenContainerSockets {
  load_centre: Object3D
  lash_fore_left: Object3D
  lash_fore_right: Object3D
  lash_aft_left: Object3D
  lash_aft_right: Object3D
  tarp_roll: Object3D
}

export interface OpenContainerController {
  root: Group
  parts: { shell: Group; doorLeft: Group; doorRight: Group }
  sockets: OpenContainerSockets
  update(deltaSeconds: number): void
  dispose(): void
}

function interior(shell: Group, m: CargoMaterials, floorY: number): void {
  const innerX = SPEC.length * 0.5 - 0.32
  const innerZ = SPEC.width * 0.5 - 0.22

  box(shell, m.graphiteEdge, [innerX * 2, 0.05, innerZ * 2], [0, floorY, 0], {
    chamfer: 0.05, fillet: 0.018, bevel: 0.012,
  })
  // Deck ribs run across the width, the way a real container floor is laid.
  for (let index = 0; index < 13; index += 1) {
    const x = (index / 12 - 0.5) * (innerX * 2 - 0.2)
    box(shell, m.ink, [0.07, 0.022, innerZ * 2 - 0.06], [x, floorY + 0.03, 0], {
      chamfer: 0.008, fillet: 0.004, bevel: 0.004,
    })
  }
  // Wall liners: a plain plane inboard of the corrugation, so the inside does
  // not show the outside's ribs in negative.
  for (const sz of [-1, 1]) {
    box(shell, m.shellShade, [innerX * 2, SPEC.height - floorY - 0.34, 0.04], [0, floorY + (SPEC.height - floorY - 0.34) * 0.5, sz * innerZ], {
      chamfer: 0.04, fillet: 0.014, bevel: 0.012,
    })
  }
  box(shell, m.shellShade, [0.04, SPEC.height - floorY - 0.34, innerZ * 2], [-innerX, floorY + (SPEC.height - floorY - 0.34) * 0.5, 0], {
    chamfer: 0.04, fillet: 0.014, bevel: 0.012,
  })

  // Lashing rings on the bottom side rails.
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const x = sx * innerX * 0.62
      const z = sz * (innerZ - 0.03)
      box(shell, m.graphite, [0.14, 0.1, 0.05], [x, floorY + 0.09, z], { chamfer: 0.026, fillet: 0.01, bevel: 0.008 })
      shell.add(cylinder(m.steel, 0.038, 0.022, [x, floorY + 0.13, z - sz * 0.03], [Math.PI / 2, 0, 0], 10))
    }
  }
}

/** The rolled tarp and its retaining straps along the -Z top rail. */
function tarpRoll(shell: Group, m: CargoMaterials): void {
  const y = SPEC.height - 0.24
  const z = -(SPEC.width * 0.5 - 0.18)
  shell.add(cylinder(m.fabric, 0.14, SPEC.length - 1.0, [0, y, z], AXIS_X, 14))
  shell.add(cylinder(m.shellShade, 0.115, SPEC.length - 0.92, [0, y + 0.02, z], AXIS_X, 14))
  for (const x of [-1.9, -0.6, 0.7, 1.95]) {
    box(shell, m.fabric, [0.06, 0.32, 0.014], [x, y, z + 0.14], { chamfer: 0.005, fillet: 0.003, bevel: 0.003 })
    box(shell, m.amberPaint, [0.07, 0.05, 0.03], [x, y - 0.16, z + 0.145], { chamfer: 0.012, fillet: 0.005, bevel: 0.004 })
  }
  for (const x of [-2.4, 2.4]) {
    shell.add(cylinder(m.graphiteEdge, 0.05, 0.09, [x, y, z], AXIS_X, 10))
  }
}

function build(): {
  root: Group
  shell: Group
  doorLeft: Group
  doorRight: Group
  sockets: OpenContainerSockets
  bundle: CargoMaterialBundle
} {
  const bundle = acquireCargoMaterials(56_800, { condition: 0.68 })
  const m = bundle.materials
  const k = containerMetrics(SPEC)

  const root = new Group()
  root.name = 'AXR_CARGO_SHIPPING-CONTAINER-OPEN_ROOT_DEFAULT'
  const shell = new Group()
  shell.name = 'AXR_CARGO_SHIPPING-CONTAINER-OPEN_PART_SHELL_DEFAULT'
  const doorLeft = new Group()
  doorLeft.name = 'AXR_CARGO_SHIPPING-CONTAINER-OPEN_PART_DOOR-LEFT_CLOSED'
  const doorRight = new Group()
  doorRight.name = 'AXR_CARGO_SHIPPING-CONTAINER-OPEN_PART_DOOR-RIGHT_CLOSED'
  root.add(shell, doorLeft, doorRight)

  containerShell(shell, m, bundle, SPEC)
  containerDoorFrame(shell, m, SPEC)

  const floorY = 0.24
  interior(shell, m, floorY)
  tarpRoll(shell, m)

  // Removable header bar across the door end, with its two lift pins.
  const headerX = SPEC.length * 0.5 - 0.2
  box(shell, m.shell, [0.22, 0.24, SPEC.width - k.casting * 2], [headerX, SPEC.height - 0.2, 0], {
    chamfer: 0.055, fillet: 0.018, bevel: 0.014, capChamfer: 0.04,
  })
  seam(shell, m.shell, SPEC.width - k.casting * 2 - 0.2, [headerX + 0.11, SPEC.height - 0.2, 0], 'right', 'across', 0.028, 0.016)
  for (const sz of [-1, 1]) {
    box(shell, m.graphiteEdge, [0.2, 0.14, 0.16], [headerX, SPEC.height - 0.16, sz * (SPEC.width * 0.5 - 0.28)], {
      chamfer: 0.03, fillet: 0.012, bevel: 0.01,
    })
    shell.add(cylinder(m.steel, 0.028, 0.12, [headerX, SPEC.height - 0.06, sz * (SPEC.width * 0.5 - 0.28)], [0, 0, 0], 8))
  }
  statusLens(shell, m, [0.06, 0.14], [headerX + 0.12, SPEC.height - 0.2, 0.6], m.amber, 'right')

  const hinge = SPEC.width * 0.5 - k.casting - 0.02
  doorLeft.position.set(SPEC.length * 0.5 - 0.22, 0, -hinge)
  doorRight.position.set(SPEC.length * 0.5 - 0.22, 0, hinge)
  containerDoorLeaf(doorLeft, m, bundle, { ...SPEC, side: 1 })
  containerDoorLeaf(doorRight, m, bundle, { ...SPEC, side: -1 })

  const innerX = SPEC.length * 0.5 - 0.32
  const innerZ = SPEC.width * 0.5 - 0.22
  const sockets: OpenContainerSockets = {
    load_centre: socket('load_centre', [0, floorY + 0.05, 0]),
    lash_fore_left: socket('lash_fore_left', [innerX * 0.62, floorY + 0.13, -innerZ]),
    lash_fore_right: socket('lash_fore_right', [innerX * 0.62, floorY + 0.13, innerZ]),
    lash_aft_left: socket('lash_aft_left', [-innerX * 0.62, floorY + 0.13, -innerZ]),
    lash_aft_right: socket('lash_aft_right', [-innerX * 0.62, floorY + 0.13, innerZ]),
    tarp_roll: socket('tarp_roll', [0, SPEC.height - 0.24, -(SPEC.width * 0.5 - 0.18)]),
  }
  return { root, shell, doorLeft, doorRight, sockets, bundle }
}

export function createModel(): OpenContainerController {
  const { root, shell, doorLeft, doorRight, sockets, bundle } = build()
  const finished = finishModel(root, bundle, {
    name: 'shipping-container-open',
    assemblies: [doorLeft, doorRight],
    reach: 0.32,
    sockets: Object.values(sockets),
  })
  let elapsed = 0
  return {
    root,
    parts: { shell, doorLeft, doorRight },
    sockets,
    update: (deltaSeconds: number) => {
      elapsed += Math.min(Math.max(deltaSeconds, 0), 0.05)
      bundle.materials.amber.emissiveIntensity = 2.0 + Math.sin(elapsed * 1.5) * 0.22
    },
    dispose: finished.dispose,
  }
}

export const createPreview = (options: CargoPreviewOptions = {}): CargoPreview =>
  createCargoPreview(createModel(), {
    target: [0, SPEC.height * 0.45, 0],
    distance: 11.6,
    yaw: 0.72,
    pitch: 0.42,
    fov: 30,
    ...options,
  })
