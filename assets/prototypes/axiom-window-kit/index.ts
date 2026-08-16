import { Group, Object3D, type MeshPhysicalMaterial } from 'three/webgpu'

import { MaterialLibrary, extrudeProfile, tuneMaterial } from '../../../src/asset-forge/generator/index.ts'
import {
  TOKEN,
  acquireCargoMaterials,
  box,
  createCargoPreview,
  finishModel,
  shade,
  slot,
  socket,
  type CargoMaterialBundle,
  type CargoMaterials,
  type CargoPreview,
  type CargoPreviewOptions,
} from '../axiom-cargo-kit/index.ts'
import {
  APERTURE_HALF,
  PLATE_FRONT,
  WINDOW_KIT,
  type WindowEnvelope,
  type WindowMetadata,
} from './contract.ts'

export { APERTURE_HALF, PLATE_FRONT, WINDOW_KIT, tiledWidth } from './contract.ts'
export type { WindowEnvelope, WindowMetadata } from './contract.ts'
export {
  actuatorRam,
  apertureLamps,
  bayPlate,
  buildBay,
  cill,
  controlPaddle,
  plateFixings,
  plateStrips,
} from './frame.ts'
export { plateBorder } from './frame.ts'
export type { BayOptions } from './frame.ts'

/**
 * The scaffold every window module in the batch is assembled through: one
 * material bundle at one condition, the wave's `AXR_ARCH_<ID>_...` naming, and
 * an occlusion reach scaled to the bay rather than guessed per model.
 */

const library = new MaterialLibrary()

export type SignalToken = 'AMBER-400' | 'CYAN-400' | 'RED-500' | 'ORANGE-500'

const TOKEN_VALUE: Record<SignalToken, number> = {
  'AMBER-400': TOKEN.AMBER_400,
  'CYAN-400': TOKEN.CYAN_400,
  'RED-500': TOKEN.RED_500,
  'ORANGE-500': TOKEN.ORANGE_500,
}

/**
 * A lit lamp, one emissive tier below the cargo wave's.
 *
 * A crate lights a 70 mm lens; a window lights the full head and cill of its
 * aperture. At the cargo tier that line clips to cream and the module loses the
 * saturated colour the brief asked it to carry — the lit area is what differs
 * between the waves, so the intensity has to differ with it.
 *
 * Built here rather than added to `CargoMaterials` so the source hashes of the
 * models already in the registry are untouched. The handle is pushed onto the
 * caller's bundle, so the existing dispose path releases it.
 */
export function signalLamp(
  bundle: CargoMaterialBundle,
  token: SignalToken,
  seed = 2_400,
  emissive = 0.72,
): MeshPhysicalMaterial {
  const handle = library.acquire({ recipeId: 'MAT-09', palette: token, condition: 'maintained', seed })
  bundle.handles.push(handle)
  return tuneMaterial(handle, shade(TOKEN_VALUE[token], -0.22), 0.24, 0.03, { emissive })
}

/**
 * Glazing for one aperture.
 *
 * A real pane seated into the liner, not a quad floated in the hole: it has
 * thickness, so it catches a highlight on its edge, and it sits behind the
 * reveal so the reveal's inner wall reads in front of it.
 */
export function glazing(
  parent: Group,
  m: CargoMaterials,
  options: { centreX?: number; half?: readonly [number, number]; thickness?: number } = {},
): void {
  const cx = options.centreX ?? 0
  const [hx, hy] = options.half ?? APERTURE_HALF
  parent.add(extrudeProfile(m.glass, slot(hx - 0.006, hy - 0.006, WINDOW_KIT.clip - 0.015), options.thickness ?? 0.018, [
    cx, WINDOW_KIT.centreY, PLATE_FRONT - 0.135,
  ], { fillet: 0.004, bevel: 0.006 }))
}

/** Glazing bars dividing one aperture into a grid. */
export function glazingBars(
  parent: Group,
  m: CargoMaterials,
  columns: number,
  rows: number,
  options: { centreX?: number; half?: readonly [number, number] } = {},
): void {
  const cx = options.centreX ?? 0
  const [hx, hy] = options.half ?? APERTURE_HALF
  const z = PLATE_FRONT - 0.115
  for (let index = 1; index < columns; index += 1) {
    box(parent, m.shellShade, [0.035, hy * 2, 0.04], [cx - hx + (index / columns) * hx * 2, WINDOW_KIT.centreY, z], {
      chamfer: 0.01, fillet: 0.004, bevel: 0.004,
    })
  }
  for (let index = 1; index < rows; index += 1) {
    box(parent, m.shellShade, [hx * 2, 0.035, 0.04], [cx, WINDOW_KIT.centreY - hy + (index / rows) * hy * 2, z], {
      chamfer: 0.01, fillet: 0.004, bevel: 0.004,
    })
  }
}

export type WindowState = 'open' | 'closed'

export interface WindowModel {
  readonly root: Group
  readonly parts: Record<string, Group>
  readonly sockets: Record<string, Object3D>
  readonly state: WindowState
  setState(state: WindowState): WindowState
  update(deltaSeconds: number): void
  dispose(): void
}

export interface WindowBuild {
  readonly id: string
  readonly condition?: number
  readonly envelope?: WindowEnvelope
  /** Bay count, recorded in metadata so a tiled run is self-describing. */
  readonly bays?: number
  build(context: {
    root: Group
    m: CargoMaterials
    bundle: CargoMaterialBundle
    part(name: string): Group
  }): {
    /**
     * Articulated groups, batched separately so they keep their transforms.
     * They must be **siblings, not nested**: the batch merge collapses each
     * assembly's descendants into meshes directly under it, destroying any
     * intermediate group, so a nested assembly is re-attached to something no
     * longer in the scene and vanishes without an error.
     */
    readonly assemblies?: readonly Group[]
    readonly apply?: (blend: number) => void
    readonly sockets?: Readonly<Record<string, readonly [number, number, number]>>
    readonly tick?: (elapsed: number) => void
    readonly cycleSeconds?: number
  }
}

export function createWindowModel(spec: WindowBuild): WindowModel {
  const bundle = acquireCargoMaterials(21_700 + spec.id.length * 211, { condition: spec.condition ?? 0.38 })
  const m = bundle.materials
  const envelope = spec.envelope ?? {
    width: WINDOW_KIT.width,
    depth: WINDOW_KIT.depth,
    height: WINDOW_KIT.height,
  }
  const tag = spec.id.toUpperCase()

  const root = new Group()
  root.name = `AXR_ARCH_${tag}_ROOT_CLOSED`
  const parts: Record<string, Group> = {}
  const part = (name: string): Group => {
    const existing = parts[name]
    if (existing) return existing
    const group = new Group()
    group.name = `AXR_ARCH_${tag}_PART_${name.toUpperCase()}_DEFAULT`
    parts[name] = group
    root.add(group)
    return group
  }

  const built = spec.build({ root, m, bundle, part })
  root.userData.windowKit = {
    version: 1,
    moduleId: spec.id,
    pivot: WINDOW_KIT.pivot,
    front: WINDOW_KIT.front,
    envelope,
    clear: { width: WINDOW_KIT.clearWidth, height: WINDOW_KIT.clearHeight },
    bays: spec.bays ?? 1,
  } satisfies WindowMetadata

  const sockets: Record<string, Object3D> = {}
  const shared: Record<string, readonly [number, number, number]> = {
    window_cill: [0, WINDOW_KIT.centreY - APERTURE_HALF[1] - 0.075, 0],
    window_head: [0, WINDOW_KIT.centreY + APERTURE_HALF[1], 0],
    mount_left: [-envelope.width * 0.5, WINDOW_KIT.centreY, 0],
    mount_right: [envelope.width * 0.5, WINDOW_KIT.centreY, 0],
    cover_glazing: [0, WINDOW_KIT.centreY, PLATE_FRONT - 0.135],
  }
  for (const [name, position] of Object.entries({ ...shared, ...(built.sockets ?? {}) })) {
    sockets[name] = socket(name, [...position] as [number, number, number])
  }

  const finished = finishModel(root, bundle, {
    name: spec.id,
    assemblies: built.assemblies,
    reach: 0.2,
    sockets: Object.values(sockets),
  })

  let state: WindowState = 'closed'
  let blend = 0
  let elapsed = 0
  const cycle = built.cycleSeconds ?? 1.6

  /**
   * Carries the state token on the articulated groups as well as on the root.
   *
   * Every animated model already in the library keeps its moving parts in step —
   * a crate's lid becomes `..._LID_OPEN`. Renaming only the root leaves an
   * exported open blind or drawer full of parts still claiming to be `_CLOSED`,
   * which is worse than not naming them, because a consumer reading part names
   * has no way to know they are stale.
   */
  const retagAssemblies = (next: WindowState): void => {
    const token = next.toUpperCase()
    for (const assembly of built.assemblies ?? []) {
      assembly.name = assembly.name.replace(/_(CLOSED|OPEN)$/, `_${token}`)
    }
  }

  built.apply?.(0)

  return {
    root,
    parts,
    sockets,
    get state() {
      return state
    },
    setState: (next: WindowState) => {
      state = next
      root.name = `AXR_ARCH_${tag}_ROOT_${next.toUpperCase()}`
      retagAssemblies(next)
      blend = next === 'open' ? 1 : 0
      built.apply?.(blend)
      return state
    },
    update: (deltaSeconds: number) => {
      const step = Math.min(Math.max(deltaSeconds, 0), 0.05)
      elapsed += step
      const target = state === 'open' ? 1 : 0
      if (Math.abs(target - blend) > 1e-4) {
        blend += Math.sign(target - blend) * Math.min(Math.abs(target - blend), step / cycle)
        built.apply?.(blend)
        // A part that has started moving is no longer closed, so the name flips
        // on the first frame of travel rather than only at the far end.
        if (blend > 0.02 && state === 'open') retagAssemblies('open')
        else if (blend < 0.98 && state === 'closed') retagAssemblies('closed')
      }
      built.tick?.(elapsed)
    },
    dispose: finished.dispose,
  }
}

export interface WindowPreviewOptions extends CargoPreviewOptions {
  readonly state?: WindowState
}

/** The group's shared capture framing: a catalogue page, not fifty product shots. */
export function createWindowPreview(model: WindowModel, options: WindowPreviewOptions = {}): CargoPreview {
  model.setState(options.state ?? 'closed')
  return createCargoPreview(model, {
    target: [0, WINDOW_KIT.centreY, 0],
    distance: 3.3,
    yaw: -0.62,
    pitch: 0.18,
    fov: 32,
    ...options,
  })
}
