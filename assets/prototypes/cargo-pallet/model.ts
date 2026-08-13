import { Group, Object3D } from 'three/webgpu'

import { cylinder, extrudeProfile } from '../../../src/asset-forge/generator/index.ts'
import {
  AXIS_Y,
  acquireCargoMaterials,
  addStripeDecal,
  bolt,
  box,
  createCargoPreview,
  finishModel,
  hexagon,
  paintMark,
  plaque,
  slashProfile,
  socket,
  statusLens,
  type CargoMaterialBundle,
  type CargoMaterials,
  type CargoPreview,
  type CargoPreviewOptions,
} from '../axiom-cargo-kit/index.ts'

/**
 * Axiom Relay cargo pallet — the powered, tagged counterpart to the timber one.
 *
 * Where the timber pallet is a consumable, this is depot infrastructure: a
 * pressed alloy deck on a closed skid frame, with hex locator sockets that mate
 * to the corner castings on the crates and containers in this wave. Those
 * sockets are the reason it exists as a separate asset instead of a colour
 * variant - they are the contract the rest of the pack stacks against.
 */

const LENGTH = 1.24
const WIDTH = 0.86
const DECK = 0.045
const SKID = 0.095
const LOCATOR_X = 0.42
const LOCATOR_Z = 0.26

interface CargoPalletSockets {
  lock_fore_left: Object3D
  lock_fore_right: Object3D
  lock_aft_left: Object3D
  lock_aft_right: Object3D
  deck_centre: Object3D
  fx_status: Object3D
}

export type CargoPalletState = 'idle' | 'locked'

export interface CargoPalletController {
  root: Group
  sockets: CargoPalletSockets
  readonly state: CargoPalletState
  setState(state: CargoPalletState): CargoPalletState
  update(deltaSeconds: number): void
  dispose(): void
}

function deckPlate(root: Group, m: CargoMaterials): void {
  const y = SKID + DECK * 0.5
  box(root, m.shell, [LENGTH, DECK, WIDTH], [0, y, 0], {
    chamfer: 0.075, fillet: 0.026, bevel: 0.014, capChamfer: 0.02,
  })
  // Pressed anti-slip field: two sunk pans, not a texture. The pans also give
  // the deck a reason to have a rim, which is what carries its silhouette.
  for (const sx of [-1, 1]) {
    // The anti-slip pans are the deck's working surface and the reference
    // paints them dark - a light pan on a light deck is one flat plane.
    box(root, m.graphite, [LENGTH * 0.42, 0.016, WIDTH - 0.16], [sx * LENGTH * 0.23, y + DECK * 0.5, 0], {
      chamfer: 0.05, fillet: 0.018, bevel: 0.008,
    })
    for (let index = 0; index < 5; index += 1) {
      const z = (index / 4 - 0.5) * (WIDTH - 0.24)
      box(root, m.graphiteEdge, [LENGTH * 0.36, 0.012, 0.024], [sx * LENGTH * 0.23, y + DECK * 0.5 + 0.008, z], {
        chamfer: 0.006, fillet: 0.003, bevel: 0.003,
      })
    }
  }
}

function locators(root: Group, m: CargoMaterials): void {
  const y = SKID + DECK
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const x = sx * LOCATOR_X
      const z = sz * LOCATOR_Z
      box(root, m.graphite, [0.15, 0.03, 0.15], [x, y + 0.012, z], {
        chamfer: 0.045, fillet: 0.014, bevel: 0.008,
      })
      // The locator itself: a hex spigot that drops into a corner casting.
      root.add(extrudeProfile(m.steel, hexagon(0.048), 0.055, [x, y + 0.05, z], {
        fillet: 0.008, bevel: 0.006, rotation: [Math.PI / 2, 0, 0],
      }))
      root.add(cylinder(m.ink, 0.018, 0.06, [x, y + 0.065, z], AXIS_Y, 8))
    }
  }
}

function skidFrame(root: Group, m: CargoMaterials, bundle: CargoMaterialBundle): void {
  for (const sz of [-1, 0, 1]) {
    const z = sz * (WIDTH * 0.5 - 0.075)
    box(root, m.graphite, [LENGTH - 0.02, SKID, 0.15], [0, SKID * 0.5, z], {
      chamfer: 0.035, fillet: 0.013, bevel: 0.011, capChamfer: 0.025,
    })
    box(root, m.rubber, [LENGTH - 0.12, 0.018, 0.11], [0, 0.009, z], {
      chamfer: 0.02, fillet: 0.008, bevel: 0.006,
    })
  }
  // End beams close the frame, so the fork tunnels are real openings.
  for (const sx of [-1, 1]) {
    box(root, m.graphiteEdge, [0.1, SKID, WIDTH - 0.02], [sx * (LENGTH * 0.5 - 0.05), SKID * 0.5, 0], {
      chamfer: 0.03, fillet: 0.011, bevel: 0.01,
    })
    const stripe = addStripeDecal(bundle, { count: 4, lean: sx })
    plaque(root, m, stripe, [0.42, 0.045], [sx * (LENGTH * 0.5 - 0.05), SKID * 0.55, 0], sx > 0 ? 'right' : 'left', m.ink)
  }
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      bolt(root, m.steel, [sx * (LENGTH * 0.5 - 0.14), SKID * 0.5, sz * (WIDTH * 0.5 - 0.002)], 0.016, sz > 0 ? 'front' : 'back')
    }
  }
}

function build(): { root: Group; sockets: CargoPalletSockets; bundle: CargoMaterialBundle } {
  const bundle = acquireCargoMaterials(55_200, { condition: 0.6 })
  const m = bundle.materials

  const root = new Group()
  root.name = 'AXR_CARGO_CARGO-PALLET_ROOT_IDLE'
  skidFrame(root, m, bundle)
  deckPlate(root, m)
  locators(root, m)

  // Tag reader on one long edge: the pallet's only powered part.
  const readerZ = WIDTH * 0.5 + 0.004
  box(root, m.graphite, [0.2, 0.07, 0.035], [-LENGTH * 0.25, SKID + DECK * 0.5, readerZ], {
    chamfer: 0.022, fillet: 0.008, bevel: 0.007,
  })
  statusLens(root, m, [0.09, 0.028], [-LENGTH * 0.25, SKID + DECK * 0.5, readerZ + 0.018], m.cyan, 'front')
  paintMark(root, m.amberPaint, slashProfile(0.05, 0.05, 0.5), [LENGTH * 0.3, SKID + DECK * 0.5, readerZ], 'front', 0.008)
  paintMark(root, m.amberPaint, slashProfile(0.025, 0.05, 0.5), [LENGTH * 0.36, SKID + DECK * 0.5, readerZ], 'front', 0.008)

  const sockets: CargoPalletSockets = {
    lock_fore_left: socket('lock_fore_left', [-LOCATOR_X, SKID + DECK + 0.08, LOCATOR_Z]),
    lock_fore_right: socket('lock_fore_right', [LOCATOR_X, SKID + DECK + 0.08, LOCATOR_Z]),
    lock_aft_left: socket('lock_aft_left', [-LOCATOR_X, SKID + DECK + 0.08, -LOCATOR_Z]),
    lock_aft_right: socket('lock_aft_right', [LOCATOR_X, SKID + DECK + 0.08, -LOCATOR_Z]),
    deck_centre: socket('deck_centre', [0, SKID + DECK, 0]),
    fx_status: socket('fx_status', [-LENGTH * 0.25, SKID + DECK * 0.5, WIDTH * 0.5 + 0.06]),
  }
  return { root, sockets, bundle }
}

export function createModel(): CargoPalletController {
  const { root, sockets, bundle } = build()
  const finished = finishModel(root, bundle, {
    name: 'cargo-pallet',
    reach: 0.1,
    sockets: Object.values(sockets),
  })

  let state: CargoPalletState = 'idle'
  let elapsed = 0
  return {
    root,
    sockets,
    get state() {
      return state
    },
    setState: (next: CargoPalletState) => {
      state = next
      root.name = next === 'locked'
        ? 'AXR_CARGO_CARGO-PALLET_ROOT_LOCKED'
        : 'AXR_CARGO_CARGO-PALLET_ROOT_IDLE'
      return state
    },
    update: (deltaSeconds: number) => {
      elapsed += Math.min(Math.max(deltaSeconds, 0), 0.05)
      // Locked reads as a steady hold; idle breathes.
      bundle.materials.cyan.emissiveIntensity = state === 'locked'
        ? 2.1
        : 1.35 + Math.sin(elapsed * 1.9) * 0.35
    },
    dispose: finished.dispose,
  }
}

function preview(options: CargoPreviewOptions & { state?: CargoPalletState } = {}): CargoPreview {
  const model = createModel()
  model.setState(options.state ?? 'idle')
  return createCargoPreview(model, {
    target: [0, 0.11, 0],
    distance: 2.4,
    yaw: 0.78,
    pitch: 0.4,
    fov: 30,
    ...options,
  })
}

export const createPreview = (options: CargoPreviewOptions = {}): CargoPreview => preview(options)
export const createLockedPreview = (options: CargoPreviewOptions = {}): CargoPreview =>
  preview({ ...options, state: 'locked' })
