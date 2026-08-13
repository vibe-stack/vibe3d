import { Group, Object3D } from 'three/webgpu'

import {
  acquireCargoMaterials,
  containerDoorFrame,
  containerDoorLeaf,
  containerMetrics,
  containerShell,
  createCargoPreview,
  finishModel,
  socket,
  type CargoPreview,
  type CargoPreviewOptions,
  type ContainerShellOptions,
} from '../axiom-cargo-kit/index.ts'

/**
 * Axiom Relay standard freight container.
 *
 * The anchor of the cargo wave. Its corner castings, skirt height, and rib
 * cadence are the measurements every other container variant and most of the
 * crates in this pack are built against, so the chassis itself lives in the kit
 * and this model is the standard-length configuration of it plus its doors.
 */

const SPEC: ContainerShellOptions = {
  length: 6.06,
  width: 2.44,
  height: 2.59,
  variant: 0,
}

interface ContainerSockets {
  lift_top_fore_left: Object3D
  lift_top_fore_right: Object3D
  lift_top_aft_left: Object3D
  lift_top_aft_right: Object3D
  door_threshold: Object3D
  stack_top: Object3D
}

export type ContainerState = 'sealed' | 'open'

export interface ShippingContainerController {
  root: Group
  parts: { shell: Group; doorLeft: Group; doorRight: Group }
  sockets: ContainerSockets
  readonly state: ContainerState
  setState(state: ContainerState): ContainerState
  update(deltaSeconds: number): void
  dispose(): void
}

export function createModel(): ShippingContainerController {
  const bundle = acquireCargoMaterials(51_100, { condition: 0.62 })
  const m = bundle.materials
  const k = containerMetrics(SPEC)

  const root = new Group()
  root.name = 'AXR_CARGO_SHIPPING-CONTAINER-STANDARD_ROOT_SEALED'
  const shell = new Group()
  shell.name = 'AXR_CARGO_SHIPPING-CONTAINER-STANDARD_PART_SHELL_DEFAULT'
  const doorLeft = new Group()
  doorLeft.name = 'AXR_CARGO_SHIPPING-CONTAINER-STANDARD_PART_DOOR-LEFT_CLOSED'
  const doorRight = new Group()
  doorRight.name = 'AXR_CARGO_SHIPPING-CONTAINER-STANDARD_PART_DOOR-RIGHT_CLOSED'
  root.add(shell, doorLeft, doorRight)

  containerShell(shell, m, bundle, SPEC)
  containerDoorFrame(shell, m, SPEC)

  const hinge = SPEC.width * 0.5 - k.casting - 0.02
  // The leaves hang behind the door frame's head and sill bars, whose inboard
  // face is at `length*0.5 - 0.24`. Set 130 mm further forward the 0.1-thick
  // skins ran straight through both bars for the full width of the opening.
  doorLeft.position.set(SPEC.length * 0.5 - 0.285, 0, -hinge)
  doorRight.position.set(SPEC.length * 0.5 - 0.285, 0, hinge)
  containerDoorLeaf(doorLeft, m, bundle, { ...SPEC, side: 1, closingStrip: hinge })
  containerDoorLeaf(doorRight, m, bundle, { ...SPEC, side: -1 })

  const cornerX = SPEC.length * 0.5 - k.casting * 0.5
  const cornerZ = SPEC.width * 0.5 - k.casting * 0.5
  const sockets: ContainerSockets = {
    lift_top_fore_left: socket('lift_top_fore_left', [cornerX, SPEC.height, -cornerZ]),
    lift_top_fore_right: socket('lift_top_fore_right', [cornerX, SPEC.height, cornerZ]),
    lift_top_aft_left: socket('lift_top_aft_left', [-cornerX, SPEC.height, -cornerZ]),
    lift_top_aft_right: socket('lift_top_aft_right', [-cornerX, SPEC.height, cornerZ]),
    door_threshold: socket('door_threshold', [SPEC.length * 0.5, 0.24, 0]),
    stack_top: socket('stack_top', [0, SPEC.height, 0]),
  }

  const finished = finishModel(root, bundle, {
    name: 'shipping-container-standard',
    assemblies: [doorLeft, doorRight],
    reach: 0.32,
    sockets: Object.values(sockets),
  })

  let state: ContainerState = 'sealed'
  let blend = 0
  let elapsed = 0

  const applyBlend = (): void => {
    const angle = blend * 2.25
    doorLeft.rotation.y = -angle
    doorRight.rotation.y = angle
    doorLeft.name = blend > 0.02
      ? 'AXR_CARGO_SHIPPING-CONTAINER-STANDARD_PART_DOOR-LEFT_OPEN'
      : 'AXR_CARGO_SHIPPING-CONTAINER-STANDARD_PART_DOOR-LEFT_CLOSED'
    doorRight.name = doorLeft.name.replace('DOOR-LEFT', 'DOOR-RIGHT')
  }

  return {
    root,
    parts: { shell, doorLeft, doorRight },
    sockets,
    get state() {
      return state
    },
    setState: (next: ContainerState) => {
      state = next
      root.name = next === 'open'
        ? 'AXR_CARGO_SHIPPING-CONTAINER-STANDARD_ROOT_OPEN'
        : 'AXR_CARGO_SHIPPING-CONTAINER-STANDARD_ROOT_SEALED'
      blend = next === 'open' ? 1 : 0
      applyBlend()
      return state
    },
    update: (deltaSeconds: number) => {
      const step = Math.min(Math.max(deltaSeconds, 0), 0.05)
      elapsed += step
      const target = state === 'open' ? 1 : 0
      if (Math.abs(target - blend) > 1e-4) {
        blend += Math.sign(target - blend) * Math.min(Math.abs(target - blend), step * 0.85)
        applyBlend()
      }
      m.amber.emissiveIntensity = 2.05 + Math.sin(elapsed * 1.6) * 0.18
    },
    dispose: finished.dispose,
  }
}

function preview(options: CargoPreviewOptions & { state?: ContainerState } = {}): CargoPreview {
  const model = createModel()
  model.setState(options.state ?? 'sealed')
  return createCargoPreview(model, {
    // A 6 m box seen across its diagonal is 6.5 m wide in frame, and at 12.4 m
    // the door end ran off the right-hand edge. Framing on half the height then
    // left the container low in the frame as well, so the target comes down with
    // the distance going out.
    target: [0, SPEC.height * 0.36, 0],
    distance: 14.2,
    yaw: 0.78,
    pitch: 0.29,
    fov: 30,
    ...options,
  })
}

export const createPreview = (options: CargoPreviewOptions = {}): CargoPreview => preview(options)
export const createOpenPreview = (options: CargoPreviewOptions = {}): CargoPreview =>
  preview({ ...options, state: 'open' })
