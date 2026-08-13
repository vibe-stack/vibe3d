import { Group, Object3D } from 'three/webgpu'

import { cylinder } from '../../../src/asset-forge/generator/index.ts'
import {
  AXIS_Y,
  acquireCargoMaterials,
  addLabelDecal,
  box,
  containerDoorFrame,
  containerDoorLeaf,
  containerShell,
  createCargoPreview,
  finishModel,
  louvreVent,
  plaque,
  socket,
  statusLens,
  type CargoPreview,
  type CargoPreviewOptions,
  type ContainerShellOptions,
} from '../axiom-cargo-kit/index.ts'

/**
 * Axiom Relay small container — the quarter module.
 *
 * Short, narrow, and low enough for one operator to walk around, so it drops the
 * fork pockets (it is craned or barrow-moved) and gains a roof canopy with a
 * vent stack, because a module this size is usually powered kit rather than
 * bulk freight.
 *
 * Its half-width means the door leaves come out narrow and tall, which is a
 * proportion the standard unit never shows - and that is exactly what stops a
 * yard of mixed containers from looking like one mesh at three scales.
 */

const SPEC: ContainerShellOptions = {
  length: 2.24,
  width: 1.62,
  height: 1.74,
  casting: 0.22,
  skirt: 0.3,
  forkPockets: false,
  ribPitch: 0.34,
  variant: 80,
}

interface SmallContainerSockets {
  lift_top: Object3D
  vent_stack: Object3D
  door_threshold: Object3D
  stack_top: Object3D
}

export type SmallContainerState = 'sealed' | 'open'

export interface SmallContainerController {
  root: Group
  parts: { shell: Group; doorLeft: Group; doorRight: Group }
  sockets: SmallContainerSockets
  readonly state: SmallContainerState
  setState(state: SmallContainerState): SmallContainerState
  update(deltaSeconds: number): void
  dispose(): void
}

export function createModel(): SmallContainerController {
  const bundle = acquireCargoMaterials(57_000, { condition: 0.5 })
  const m = bundle.materials

  const root = new Group()
  root.name = 'AXR_CARGO_CONTAINER-SMALL_ROOT_SEALED'
  const shell = new Group()
  shell.name = 'AXR_CARGO_CONTAINER-SMALL_PART_SHELL_DEFAULT'
  const doorLeft = new Group()
  doorLeft.name = 'AXR_CARGO_CONTAINER-SMALL_PART_DOOR-LEFT_CLOSED'
  const doorRight = new Group()
  doorRight.name = 'AXR_CARGO_CONTAINER-SMALL_PART_DOOR-RIGHT_CLOSED'
  root.add(shell, doorLeft, doorRight)

  containerShell(shell, m, bundle, SPEC)
  containerDoorFrame(shell, m, SPEC)

  // Roof canopy and vent stack: the module conditions itself.
  //
  // The canopy is bolted down onto the roof deck, whose ribs top out at
  // `height - 0.02`, and laps it by 20 mm. Hung at `height + 0.03` its
  // underside cleared the deck plate by 30 mm and the module wore its roof as a
  // separate floating lid; everything the canopy carries comes down with it.
  const canopyTop = SPEC.height + 0.025
  box(shell, m.graphite, [SPEC.length - 0.5, 0.09, SPEC.width - 0.4], [0, SPEC.height - 0.02, 0], {
    chamfer: 0.06, fillet: 0.02, bevel: 0.014,
  })
  box(shell, m.shellShade, [0.5, 0.26, 0.5], [-0.42, SPEC.height + 0.135, 0], {
    chamfer: 0.09, fillet: 0.03, bevel: 0.016, capChamfer: 0.05,
  })
  shell.add(cylinder(m.graphiteEdge, 0.14, 0.14, [-0.42, SPEC.height + 0.305, 0], AXIS_Y, 14))
  shell.add(cylinder(m.ink, 0.11, 0.1, [-0.42, SPEC.height + 0.365, 0], AXIS_Y, 12))
  // The stack's own +Z face is at 0.25; at 0.36 the vent hung 97.5 mm off it.
  louvreVent(shell, m, [0.3, 0.16], [-0.42, SPEC.height + 0.135, 0.25], 3, 'front')
  for (const sx of [-1, 1]) {
    box(shell, m.steel, [0.16, 0.05, 0.12], [sx * (SPEC.length * 0.5 - 0.42), SPEC.height + 0.03, 0], {
      chamfer: 0.024, fillet: 0.009, bevel: 0.008,
    })
    shell.add(cylinder(m.ink, 0.028, 0.06, [sx * (SPEC.length * 0.5 - 0.42), SPEC.height + 0.05, 0], AXIS_Y, 8))
  }

  const label = addLabelDecal(bundle, { variant: 83 })
  plaque(shell, m, label, [0.3, 0.13], [0.5, canopyTop, 0.3], 'top', m.shellLight)
  statusLens(shell, m, [0.06, 0.05], [0.5, canopyTop, -0.2], m.cyan, 'top')

  const hinge = SPEC.width * 0.5 - (SPEC.casting ?? 0.22) - 0.015
  // The leaves hang behind the door frame's head and sill bars, whose inboard
  // face is at `length*0.5 - 0.24`. Set 85 mm further forward the 0.1-thick
  // skins ran through both bars and the lock rods stood out past the end.
  doorLeft.position.set(SPEC.length * 0.5 - 0.285, 0, -hinge)
  doorRight.position.set(SPEC.length * 0.5 - 0.285, 0, hinge)
  containerDoorLeaf(doorLeft, m, bundle, { ...SPEC, side: 1 })
  containerDoorLeaf(doorRight, m, bundle, { ...SPEC, side: -1 })
  // Each leaf is half the clear opening, so the pair shuts on a mathematical
  // point and the 0.1 taken out for clearance is a 70 mm slit you see the
  // cross members through. The leaf that shuts second carries a closing strip
  // behind the joint, lapping both skins by 40 mm. Hinging the pair in would
  // bring the leaves edge to edge instead, but the lock bars are set out from
  // each leaf's own centre and would then cross the shut line.
  const leaf = (SPEC.width - (SPEC.casting ?? 0.22) * 2 - 0.1) * 0.5
  box(doorLeft, m.shell, [0.06, SPEC.height - 0.62, (hinge - leaf) * 2 + 0.08], [-0.06, (SPEC.height - 0.5) * 0.5 + 0.24, hinge], {
    chamfer: 0.02, fillet: 0.008, bevel: 0.007,
  })

  const sockets: SmallContainerSockets = {
    lift_top: socket('lift_top', [0, canopyTop, 0]),
    vent_stack: socket('vent_stack', [-0.42, SPEC.height + 0.445, 0]),
    door_threshold: socket('door_threshold', [SPEC.length * 0.5, 0.2, 0]),
    stack_top: socket('stack_top', [0, SPEC.height, 0]),
  }

  const finished = finishModel(root, bundle, {
    name: 'container-small',
    assemblies: [doorLeft, doorRight],
    reach: 0.22,
    sockets: Object.values(sockets),
  })

  let state: SmallContainerState = 'sealed'
  let blend = 0
  let elapsed = 0
  const applyBlend = (): void => {
    doorLeft.rotation.y = -blend * 2.3
    doorRight.rotation.y = blend * 2.3
    doorLeft.name = blend > 0.02
      ? 'AXR_CARGO_CONTAINER-SMALL_PART_DOOR-LEFT_OPEN'
      : 'AXR_CARGO_CONTAINER-SMALL_PART_DOOR-LEFT_CLOSED'
    doorRight.name = doorLeft.name.replace('DOOR-LEFT', 'DOOR-RIGHT')
  }

  return {
    root,
    parts: { shell, doorLeft, doorRight },
    sockets,
    get state() {
      return state
    },
    setState: (next: SmallContainerState) => {
      state = next
      blend = next === 'open' ? 1 : 0
      applyBlend()
      return state
    },
    update: (deltaSeconds: number) => {
      const step = Math.min(Math.max(deltaSeconds, 0), 0.05)
      elapsed += step
      const target = state === 'open' ? 1 : 0
      if (Math.abs(target - blend) > 1e-4) {
        blend += Math.sign(target - blend) * Math.min(Math.abs(target - blend), step)
        applyBlend()
      }
      m.cyan.emissiveIntensity = 1.7 + Math.sin(elapsed * 1.8) * 0.24
    },
    dispose: finished.dispose,
  }
}

function preview(options: CargoPreviewOptions & { state?: SmallContainerState } = {}): CargoPreview {
  const model = createModel()
  model.setState(options.state ?? 'sealed')
  return createCargoPreview(model, {
    target: [0, SPEC.height * 0.55, 0],
    distance: 6.0,
    yaw: 0.8,
    pitch: 0.3,
    fov: 30,
    ...options,
  })
}

export const createPreview = (options: CargoPreviewOptions = {}): CargoPreview => preview(options)
export const createOpenPreview = (options: CargoPreviewOptions = {}): CargoPreview =>
  preview({ ...options, state: 'open' })
