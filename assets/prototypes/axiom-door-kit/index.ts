import { Group, Object3D } from 'three/webgpu'

import {
  acquireCargoMaterials,
  createCargoPreview,
  finishModel,
  socket,
  type CargoMaterialBundle,
  type CargoMaterials,
  type CargoPreview,
  type CargoPreviewOptions,
} from '../axiom-cargo-kit/index.ts'
import { CLEAR_HALF, DOOR_KIT, DOOR_SOCKETS, type DoorEnvelope, type DoorMetadata } from './contract.ts'

export { CLEAR_HALF, DOOR_KIT, DOOR_SOCKETS } from './contract.ts'
export type { DoorEnvelope, DoorMetadata } from './contract.ts'
export {
  HINGE_X,
  HINGE_Z,
  PLATE_FRONT,
  buildPortal,
  controlPlate,
  headLamp,
  hingeStack,
  jambFeet,
  jambStrips,
  portalPlate,
  rearBracing,
  threshold,
} from './frame.ts'
export type { PortalOptions } from './frame.ts'
export { signalLamp } from './signal.ts'
export type { SignalToken } from './signal.ts'
export {
  LEAF_DEPTH,
  LEAF_HALF,
  LEAF_Z,
  PANEL_FRONT,
  leafHandle,
  leafOutline,
  leafPanel,
  leafRecess,
  leafRibs,
  leafSkin,
  steppedSeam,
  visionPort,
} from './leaf.ts'
export type { LeafOptions } from './leaf.ts'

/**
 * The scaffold every door module in the batch is assembled through.
 *
 * Ten doors that each acquire their own materials, name their own nodes, and
 * pick their own occlusion reach are ten props that merely share a folder. The
 * scaffold fixes all three: one material bundle at one condition, the wave's
 * `AXR_ARCH_<ID>_...` naming, and a reach scaled to the door envelope rather
 * than to whatever each model's author guessed.
 */

export type DoorState = 'closed' | 'open'

export interface DoorModel {
  readonly root: Group
  readonly parts: Record<string, Group>
  readonly sockets: Record<string, Object3D>
  readonly state: DoorState
  setState(state: DoorState): DoorState
  update(deltaSeconds: number): void
  dispose(): void
}

export interface DoorBuild {
  /** Registry model id, e.g. `blast-door`. */
  readonly id: string
  /** Wear condition, 0 factory-fresh to 1 depot-veteran. */
  readonly condition?: number
  /** Public envelope, where a module widens past the shared one. */
  readonly envelope?: DoorEnvelope
  /**
   * Builds the module. Returns the articulated groups, which are batched
   * separately so they survive the merge with their own transforms.
   */
  build(context: {
    root: Group
    m: CargoMaterials
    bundle: CargoMaterialBundle
    part(name: string): Group
  }): {
    /**
     * Articulated groups, batched separately so they keep their transforms.
     *
     * They must be **siblings, not nested**. The batch merge collapses each
     * assembly's descendants into a handful of meshes directly under it, which
     * destroys any intermediate group — so an assembly whose parent is inside
     * another assembly is re-attached to a group that no longer exists in the
     * scene, and it vanishes without an error. A wheel parented to a swinging
     * leaf disappears; the same wheel parented to the swing itself survives.
     */
    readonly assemblies?: readonly Group[]
    /** Applies an open fraction, 0 closed to 1 open. */
    readonly apply?: (blend: number) => void
    /** Extra sockets beyond the family's shared set. */
    readonly sockets?: Readonly<Record<string, readonly [number, number, number]>>
    /** Per-frame work, for pulsing lamps and moving parts. */
    readonly tick?: (elapsed: number) => void
    /** Seconds for a full open or close cycle. */
    readonly cycleSeconds?: number
  }
}

function annotate(root: Group, id: string, envelope: DoorEnvelope): void {
  root.userData.doorKit = {
    version: 1,
    moduleId: id,
    pivot: DOOR_KIT.pivot,
    front: DOOR_KIT.front,
    envelope,
    clear: { width: DOOR_KIT.clearWidth, height: DOOR_KIT.clearHeight },
  } satisfies DoorMetadata
}

export function createDoorModel(spec: DoorBuild): DoorModel {
  const bundle = acquireCargoMaterials(11_400 + spec.id.length * 137, { condition: spec.condition ?? 0.42 })
  const m = bundle.materials
  const envelope = spec.envelope ?? { width: DOOR_KIT.width, depth: DOOR_KIT.depth, height: DOOR_KIT.height }
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
  annotate(root, spec.id, envelope)

  const sockets: Record<string, Object3D> = {}
  for (const [name, position] of Object.entries({ ...DOOR_SOCKETS, ...(built.sockets ?? {}) })) {
    sockets[name] = socket(name, [...position] as [number, number, number])
  }

  const finished = finishModel(root, bundle, {
    name: spec.id,
    assemblies: built.assemblies,
    // Scaled to the opening rather than to the plate: the deepest cavity in the
    // family is the reveal, and its depth is what the bake has to reach across.
    reach: 0.26,
    sockets: Object.values(sockets),
  })

  let state: DoorState = 'closed'
  let blend = 0
  let elapsed = 0
  const cycle = built.cycleSeconds ?? 1.4

  /**
   * Carries the state token on the articulated groups as well as on the root.
   *
   * The wave's node names end in their state, and every animated model already
   * in the library keeps its moving parts in step — a crate's lid becomes
   * `..._LID_OPEN`. Renaming only the root leaves an exported open door full of
   * parts still claiming to be `_CLOSED`, which is worse than not naming them at
   * all, because a consumer reading part names has no way to know they are stale.
   *
   * Only a trailing `_CLOSED` or `_OPEN` is rewritten. The damaged door's leaf is
   * `_JAMMED` and stays that way: it is not a state this controller drives, and
   * overwriting it would claim the door closes.
   */
  const retagAssemblies = (next: DoorState): void => {
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
    setState: (next: DoorState) => {
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

export interface DoorPreviewOptions extends CargoPreviewOptions {
  readonly state?: DoorState
}

/**
 * The family's capture framing. Every door is the same size and is read from
 * the same three-quarter angle, so the framing is shared rather than tuned per
 * model — a catalogue page, not fifty product shots.
 */
export function createDoorPreview(model: DoorModel, options: DoorPreviewOptions = {}): CargoPreview {
  model.setState(options.state ?? 'closed')
  return createCargoPreview(model, {
    target: [0, DOOR_KIT.centreY - 0.08, 0],
    distance: 5.1,
    yaw: -0.62,
    pitch: 0.16,
    fov: 32,
    ...options,
  })
}

/** Height of the clear opening's head, the figure hardware is hung from. */
export const HEAD_Y = DOOR_KIT.centreY + CLEAR_HALF[1]
