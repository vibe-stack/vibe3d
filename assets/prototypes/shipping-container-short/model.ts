import { Group, Object3D } from 'three/webgpu'

import {
  acquireCargoMaterials,
  addLabelDecal,
  box,
  containerDoorFrame,
  containerDoorLeaf,
  containerMetrics,
  containerShell,
  createCargoPreview,
  finishModel,
  plaque,
  socket,
  statusLens,
  type CargoPreview,
  type CargoPreviewOptions,
  type ContainerShellOptions,
} from '../axiom-cargo-kit/index.ts'

/**
 * Axiom Relay short freight container.
 *
 * The half-length unit: same section, same castings, same doors, so it stacks
 * and locks with the standard one. Its own character comes from what fits on a
 * shorter flank - a single power/data interface panel where the standard has an
 * empty run of ribs, which is why a short container in a yard is usually the one
 * being used as a site office or a plant module.
 */

const SPEC: ContainerShellOptions = {
  length: 3.02,
  width: 2.44,
  height: 2.59,
  variant: 60,
}

interface ShortContainerSockets {
  lift_top_fore: Object3D
  lift_top_aft: Object3D
  power_panel: Object3D
  door_threshold: Object3D
  stack_top: Object3D
}

export type ShortContainerState = 'sealed' | 'open'

export interface ShortContainerController {
  root: Group
  parts: { shell: Group; doorLeft: Group; doorRight: Group }
  sockets: ShortContainerSockets
  readonly state: ShortContainerState
  setState(state: ShortContainerState): ShortContainerState
  update(deltaSeconds: number): void
  dispose(): void
}

export function createModel(): ShortContainerController {
  const bundle = acquireCargoMaterials(56_600, { condition: 0.56 })
  const m = bundle.materials
  const k = containerMetrics(SPEC)

  const root = new Group()
  root.name = 'AXR_CARGO_SHIPPING-CONTAINER-SHORT_ROOT_SEALED'
  const shell = new Group()
  shell.name = 'AXR_CARGO_SHIPPING-CONTAINER-SHORT_PART_SHELL_DEFAULT'
  const doorLeft = new Group()
  doorLeft.name = 'AXR_CARGO_SHIPPING-CONTAINER-SHORT_PART_DOOR-LEFT_CLOSED'
  const doorRight = new Group()
  doorRight.name = 'AXR_CARGO_SHIPPING-CONTAINER-SHORT_PART_DOOR-RIGHT_CLOSED'
  root.add(shell, doorLeft, doorRight)

  containerShell(shell, m, bundle, SPEC)
  containerDoorFrame(shell, m, SPEC)

  // Service interface: a bolted panel with an isolator and two feed ports. It
  // sits on the aft third of the -Z flank so the two sides stay asymmetric.
  //
  // The panel is bolted to the corrugation, so its seat is the rib's outer face
  // and not the wall's centre plane: measured from `width*0.5 - 0.02` the 60 mm
  // box stood 4 mm proud of the ribs and the other 56 mm of it was inside them.
  const panelZ = -(SPEC.width * 0.5 - 0.075 + k.ribFace)
  const panelFace = panelZ - 0.03
  const wellFace = panelZ - 0.065
  box(shell, m.graphite, [0.68, 0.62, 0.06], [-0.62, 1.3, panelZ], { chamfer: 0.07, fillet: 0.022, bevel: 0.014 })
  box(shell, m.ink, [0.52, 0.36, 0.05], [-0.62, 1.36, panelZ - 0.04], { chamfer: 0.05, fillet: 0.016, bevel: 0.011 })
  statusLens(shell, m, [0.09, 0.09], [-0.8, 1.44, wellFace], m.cyan, 'back')
  statusLens(shell, m, [0.09, 0.09], [-0.6, 1.44, wellFace], m.amber, 'back')
  box(shell, m.amberPaint, [0.12, 0.1, 0.05], [-0.44, 1.26, panelZ - 0.07], { chamfer: 0.026, fillet: 0.01, bevel: 0.008 })
  const label = addLabelDecal(bundle, { variant: 63 })
  plaque(shell, m, label, [0.3, 0.11], [-0.62, 1.1, panelFace], 'back', m.shellLight)

  const hinge = SPEC.width * 0.5 - k.casting - 0.02
  // The leaves hang behind the door frame's head and sill bars, whose inboard
  // face is at `length*0.5 - 0.24`. Set 130 mm further forward the 0.1-thick
  // skins ran straight through both bars for the full width of the opening.
  doorLeft.position.set(SPEC.length * 0.5 - 0.285, 0, -hinge)
  doorRight.position.set(SPEC.length * 0.5 - 0.285, 0, hinge)
  containerDoorLeaf(doorLeft, m, bundle, { ...SPEC, side: 1, closingStrip: hinge })
  containerDoorLeaf(doorRight, m, bundle, { ...SPEC, side: -1 })

  const cornerX = SPEC.length * 0.5 - k.casting * 0.5
  const sockets: ShortContainerSockets = {
    lift_top_fore: socket('lift_top_fore', [cornerX, SPEC.height, 0]),
    lift_top_aft: socket('lift_top_aft', [-cornerX, SPEC.height, 0]),
    power_panel: socket('power_panel', [-0.62, 1.34, panelZ - 0.14]),
    door_threshold: socket('door_threshold', [SPEC.length * 0.5, 0.24, 0]),
    stack_top: socket('stack_top', [0, SPEC.height, 0]),
  }

  const finished = finishModel(root, bundle, {
    name: 'shipping-container-short',
    assemblies: [doorLeft, doorRight],
    reach: 0.3,
    sockets: Object.values(sockets),
  })

  let state: ShortContainerState = 'sealed'
  let blend = 0
  let elapsed = 0
  const applyBlend = (): void => {
    doorLeft.rotation.y = -blend * 2.25
    doorRight.rotation.y = blend * 2.25
    doorLeft.name = blend > 0.02
      ? 'AXR_CARGO_SHIPPING-CONTAINER-SHORT_PART_DOOR-LEFT_OPEN'
      : 'AXR_CARGO_SHIPPING-CONTAINER-SHORT_PART_DOOR-LEFT_CLOSED'
    doorRight.name = doorLeft.name.replace('DOOR-LEFT', 'DOOR-RIGHT')
  }

  return {
    root,
    parts: { shell, doorLeft, doorRight },
    sockets,
    get state() {
      return state
    },
    setState: (next: ShortContainerState) => {
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
        blend += Math.sign(target - blend) * Math.min(Math.abs(target - blend), step * 0.85)
        applyBlend()
      }
      m.cyan.emissiveIntensity = 1.7 + Math.sin(elapsed * 1.4) * 0.2
    },
    dispose: finished.dispose,
  }
}

function preview(options: CargoPreviewOptions & { state?: ShortContainerState } = {}): CargoPreview {
  const model = createModel()
  model.setState(options.state ?? 'sealed')
  return createCargoPreview(model, {
    target: [0, SPEC.height * 0.5, 0],
    distance: 8.2,
    yaw: 0.82,
    pitch: 0.3,
    fov: 30,
    ...options,
  })
}

export const createPreview = (options: CargoPreviewOptions = {}): CargoPreview => preview(options)
export const createOpenPreview = (options: CargoPreviewOptions = {}): CargoPreview =>
  preview({ ...options, state: 'open' })
