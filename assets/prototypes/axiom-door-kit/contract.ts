import type { Vec3 } from '../../../src/asset-forge/generator/index.ts'

/**
 * The one set of datums every Axiom Relay door module is built on.
 *
 * The doors brief gives each leaf the same public envelope — 1.6 m wide, 0.30 m
 * deep, 2.6 m tall — and that only buys interchangeability if the *opening*
 * inside it is shared too. A hangar door and a laboratory door authored to
 * private clear dimensions are two props that happen to be the same size on the
 * outside; authored to these numbers they are the same doorway wearing two
 * leaves, which is what a kit is.
 *
 * The opening is centred on the plate on purpose. A head band deeper than the
 * sill band is how real doors are built, but it also means the frame can no
 * longer be cut as one symmetric plate with one centred octagonal hole, and the
 * reference sheets show a symmetric plate. Symmetry wins: the sill band carries
 * a threshold plate on top of it, which restores the asymmetry where it reads.
 */
export const DOOR_KIT = Object.freeze({
  /** Public envelope from the doors brief. */
  width: 1.6,
  height: 2.6,
  depth: 0.3,
  /** Clear structural opening, centred on the plate. */
  clearWidth: 1.06,
  clearHeight: 2,
  /** Opening centre height; also the plate's own centre. */
  centreY: 1.3,
  /** Corner clip on the opening, and the larger one on the outer edge. */
  clip: 0.2,
  outerClip: 0.26,
  /** Depth of the shell frame plate; the graphite reveal runs deeper behind it. */
  platePitch: 0.24,
  /** Face the operational side points at, per the brief's orientation rule. */
  front: '+Z',
  /** Ground contact, centred in width, on the wall plane. */
  pivot: 'ground-centre',
  /** Double-leaf variants widen to this. */
  doubleWidth: 2.8,
} as const)

export interface DoorEnvelope {
  readonly width: number
  readonly depth: number
  readonly height: number
}

export interface DoorMetadata {
  readonly version: 1
  readonly moduleId: string
  readonly pivot: typeof DOOR_KIT.pivot
  readonly front: typeof DOOR_KIT.front
  readonly envelope: DoorEnvelope
  readonly clear: { readonly width: number; readonly height: number }
}

/** Half-extents of the clear opening, the figure most builders actually want. */
export const CLEAR_HALF: readonly [number, number] = [
  DOOR_KIT.clearWidth * 0.5,
  DOOR_KIT.clearHeight * 0.5,
]

/** Socket positions shared by every module in the family. */
export const DOOR_SOCKETS: Readonly<Record<string, Vec3>> = Object.freeze({
  door_threshold: [0, 0.06, 0],
  door_head: [0, DOOR_KIT.centreY + CLEAR_HALF[1], 0],
  mount_left: [-DOOR_KIT.width * 0.5, DOOR_KIT.centreY, 0],
  mount_right: [DOOR_KIT.width * 0.5, DOOR_KIT.centreY, 0],
  power_head: [DOOR_KIT.width * 0.5 - 0.14, DOOR_KIT.height - 0.18, -DOOR_KIT.depth * 0.4],
})
