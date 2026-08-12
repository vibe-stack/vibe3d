import { Group, Object3D } from 'three/webgpu'

import { cylinder } from '../../../src/asset-forge/generator/index.ts'
import {
  AXIS_Y,
  acquireCargoMaterials,
  addLabelDecal,
  box,
  boltRun,
  containerDoorFrame,
  containerDoorLeaf,
  cornerCasting,
  createCargoPreview,
  finishModel,
  plaque,
  socket,
  statusLens,
  type CargoMaterialBundle,
  type CargoMaterials,
  type CargoPreview,
  type CargoPreviewOptions,
  type ContainerDimensions,
} from '../axiom-cargo-kit/index.ts'

/**
 * Axiom Relay container door assembly — the door end as a standalone module.
 *
 * Shipped separately from the container because level builders keep needing the
 * *interface* without the box: a container end let into a wall, a hardened
 * storeroom entrance, a bulkhead in a hull. It carries its own portal frame,
 * castings, threshold plate, and a sill ramp, so it stands and reads on its own.
 *
 * The leaves are the identical parts the containers use. That is the point - a
 * door built to look like the container's door is a lookalike; the same door is
 * a kit.
 */

const SPEC: ContainerDimensions = {
  length: 0.44,
  width: 2.44,
  height: 2.59,
}

interface DoorAssemblySockets {
  threshold: Object3D
  hinge_left: Object3D
  hinge_right: Object3D
  frame_head: Object3D
}

export type DoorAssemblyState = 'closed' | 'open'

export interface DoorAssemblyController {
  root: Group
  parts: { frame: Group; doorLeft: Group; doorRight: Group }
  sockets: DoorAssemblySockets
  readonly state: DoorAssemblyState
  setState(state: DoorAssemblyState): DoorAssemblyState
  update(deltaSeconds: number): void
  dispose(): void
}

function portal(frame: Group, m: CargoMaterials, bundle: CargoMaterialBundle): void {
  const casting = 0.3
  const jamb = 0.26

  // Jambs, head, and sill: a closed portal, so the module reads as structural
  // rather than as a door pair floating in space.
  for (const sz of [-1, 1]) {
    const z = sz * (SPEC.width * 0.5 - jamb * 0.5)
    box(frame, m.graphite, [SPEC.length, SPEC.height - casting, jamb], [0, (SPEC.height - casting) * 0.5 + casting * 0.5, z], {
      chamfer: 0.06, fillet: 0.02, bevel: 0.016, capChamfer: 0.04,
    })
    box(frame, m.shellShade, [SPEC.length - 0.14, SPEC.height - 0.9, jamb * 0.5], [0, SPEC.height * 0.5, z + sz * jamb * 0.28], {
      chamfer: 0.03, fillet: 0.012, bevel: 0.01,
    })
    for (const sx of [-1, 1]) {
      cornerCasting(frame, m, [casting, casting, casting], [sx * (SPEC.length * 0.5 - casting * 0.5), casting * 0.5, z], 0.058, 'x')
      cornerCasting(frame, m, [casting, casting, casting], [sx * (SPEC.length * 0.5 - casting * 0.5), SPEC.height - casting * 0.5, z], 0.058, 'x')
    }
    boltRun(frame, m.steel, [SPEC.length * 0.5, 0.6, z], [SPEC.length * 0.5, SPEC.height - 0.6, z], 5, 0.022, 'right')
  }
  box(frame, m.graphite, [SPEC.length, casting, SPEC.width - jamb * 2], [0, SPEC.height - casting * 0.5, 0], {
    chamfer: 0.055, fillet: 0.018, bevel: 0.015,
  })
  box(frame, m.graphite, [SPEC.length, casting, SPEC.width - jamb * 2], [0, casting * 0.5, 0], {
    chamfer: 0.055, fillet: 0.018, bevel: 0.015,
  })

  // Threshold plate and a shallow sill ramp on the outboard side.
  box(frame, m.graphiteEdge, [SPEC.length + 0.05, 0.05, SPEC.width - jamb * 2 - 0.06], [0, casting - 0.01, 0], {
    chamfer: 0.02, fillet: 0.008, bevel: 0.007,
  })
  box(frame, m.ironOxide, [0.34, 0.05, SPEC.width - jamb * 2 - 0.1], [SPEC.length * 0.5 + 0.18, casting * 0.5 - 0.01, 0], {
    chamfer: 0.02, fillet: 0.008, bevel: 0.007, rotation: [0, 0, -0.28],
  })
  for (const sz of [-1, 1]) {
    frame.add(cylinder(m.steel, 0.022, 0.09, [SPEC.length * 0.5 + 0.06, casting + 0.02, sz * 0.6], AXIS_Y, 8))
  }

  const label = addLabelDecal(bundle, { variant: 140 })
  plaque(frame, m, label, [0.3, 0.13], [SPEC.length * 0.5 + 0.006, SPEC.height - 0.34, 0], 'right', m.shellLight)
  statusLens(frame, m, [0.07, 0.07], [SPEC.length * 0.5 + 0.006, SPEC.height - 0.34, -0.62], m.cyan, 'right')
  statusLens(frame, m, [0.07, 0.07], [SPEC.length * 0.5 + 0.006, SPEC.height - 0.34, 0.62], m.amber, 'right')
}

function build(): {
  root: Group
  frame: Group
  doorLeft: Group
  doorRight: Group
  sockets: DoorAssemblySockets
  bundle: CargoMaterialBundle
} {
  const bundle = acquireCargoMaterials(57_600, { condition: 0.58 })
  const m = bundle.materials

  const root = new Group()
  root.name = 'AXR_CARGO_CONTAINER-DOOR_ROOT_CLOSED'
  const frame = new Group()
  frame.name = 'AXR_CARGO_CONTAINER-DOOR_PART_FRAME_DEFAULT'
  const doorLeft = new Group()
  doorLeft.name = 'AXR_CARGO_CONTAINER-DOOR_PART_LEAF-LEFT_CLOSED'
  const doorRight = new Group()
  doorRight.name = 'AXR_CARGO_CONTAINER-DOOR_PART_LEAF-RIGHT_CLOSED'
  root.add(frame, doorLeft, doorRight)

  portal(frame, m, bundle)
  containerDoorFrame(frame, m, SPEC)

  const hinge = SPEC.width * 0.5 - 0.32
  doorLeft.position.set(SPEC.length * 0.5 - 0.22, 0, -hinge)
  doorRight.position.set(SPEC.length * 0.5 - 0.22, 0, hinge)
  containerDoorLeaf(doorLeft, m, bundle, { ...SPEC, side: 1 })
  containerDoorLeaf(doorRight, m, bundle, { ...SPEC, side: -1 })

  const sockets: DoorAssemblySockets = {
    threshold: socket('threshold', [SPEC.length * 0.5, 0.3, 0]),
    hinge_left: socket('hinge_left', [SPEC.length * 0.5 - 0.22, SPEC.height * 0.5, -hinge]),
    hinge_right: socket('hinge_right', [SPEC.length * 0.5 - 0.22, SPEC.height * 0.5, hinge]),
    frame_head: socket('frame_head', [0, SPEC.height, 0]),
  }
  return { root, frame, doorLeft, doorRight, sockets, bundle }
}

export function createModel(): DoorAssemblyController {
  const { root, frame, doorLeft, doorRight, sockets, bundle } = build()
  const finished = finishModel(root, bundle, {
    name: 'container-door',
    assemblies: [doorLeft, doorRight],
    reach: 0.24,
    sockets: Object.values(sockets),
  })

  let state: DoorAssemblyState = 'closed'
  let blend = 0
  let elapsed = 0
  const applyBlend = (): void => {
    doorLeft.rotation.y = -blend * 2.3
    doorRight.rotation.y = blend * 2.3
    doorLeft.name = blend > 0.02
      ? 'AXR_CARGO_CONTAINER-DOOR_PART_LEAF-LEFT_OPEN'
      : 'AXR_CARGO_CONTAINER-DOOR_PART_LEAF-LEFT_CLOSED'
    doorRight.name = doorLeft.name.replace('LEAF-LEFT', 'LEAF-RIGHT')
  }

  return {
    root,
    parts: { frame, doorLeft, doorRight },
    sockets,
    get state() {
      return state
    },
    setState: (next: DoorAssemblyState) => {
      state = next
      root.name = next === 'open'
        ? 'AXR_CARGO_CONTAINER-DOOR_ROOT_OPEN'
        : 'AXR_CARGO_CONTAINER-DOOR_ROOT_CLOSED'
      blend = next === 'open' ? 1 : 0
      applyBlend()
      return state
    },
    update: (deltaSeconds: number) => {
      const step = Math.min(Math.max(deltaSeconds, 0), 0.05)
      elapsed += step
      const target = state === 'open' ? 1 : 0
      if (Math.abs(target - blend) > 1e-4) {
        blend += Math.sign(target - blend) * Math.min(Math.abs(target - blend), step * 0.9)
        applyBlend()
      }
      bundle.materials.amber.emissiveIntensity = 2.0 + Math.sin(elapsed * 1.9) * 0.24
    },
    dispose: finished.dispose,
  }
}

function preview(options: CargoPreviewOptions & { state?: DoorAssemblyState } = {}): CargoPreview {
  const model = createModel()
  model.setState(options.state ?? 'closed')
  return createCargoPreview(model, {
    target: [0, SPEC.height * 0.5, 0],
    distance: 6.4,
    yaw: 1.0,
    pitch: 0.22,
    fov: 30,
    ...options,
  })
}

export const createPreview = (options: CargoPreviewOptions = {}): CargoPreview => preview(options)
export const createOpenPreview = (options: CargoPreviewOptions = {}): CargoPreview =>
  preview({ ...options, state: 'open' })
