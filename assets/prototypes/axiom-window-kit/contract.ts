/**
 * The datums every Axiom Relay window module is built on.
 *
 * The windows brief gives the whole group one envelope — 1.5 m wide, 0.20 m
 * deep, 1.4 m tall — and says long and curtain variants tile it on the 1 m
 * grid. That last clause is the important one: it means the module is not a
 * fixed prop but a *bay*, and anything wider has to be an exact number of bays
 * rather than a stretched copy.
 *
 * The two figures do not agree on their own. The bay is 1.5 m because the brief
 * fixes the envelope, but `production-rules.md` requires modular architecture to
 * *terminate* on the 1 m grid, and a run of 1.5 m bays only lands there on an
 * even bay count. Rather than pick one rule and break the other, the pitch stays
 * at the brief's 1.5 m and tiled runs are constrained to even counts — which is
 * why `long-horizontal-window` is four bays at 6 m and not three at 4.5 m. Use
 * {@link tiledWidth} rather than multiplying the pitch by hand.
 *
 * The aperture is centred on the plate for the same reason the doors' opening
 * is: a symmetric plate can be cut as one prism with one centred octagonal hole,
 * and the reference sheets show a symmetric plate. Sill asymmetry is restored by
 * the drip and the cill board, which are the parts that actually read.
 */
export const WINDOW_KIT = Object.freeze({
  width: 1.5,
  height: 1.4,
  depth: 0.2,
  /** Clear glazed aperture. */
  clearWidth: 0.98,
  clearHeight: 0.86,
  /** Aperture centre; also the plate's centre. */
  centreY: 0.7,
  clip: 0.16,
  outerClip: 0.2,
  /** Shell frame plate depth; the graphite reveal runs deeper behind it. */
  platePitch: 0.16,
  /**
   * Tiling pitch for long and curtain variants. Equal to the module width: a
   * bay is the module, not a subdivision of it.
   */
  bayPitch: 1.5,
  front: '+Z',
  pivot: 'sill-centre',
} as const)

/**
 * Width of a tiled run, and the guard that keeps it on the 1 m grid.
 *
 * Throws rather than rounding. A run that silently became 4.5 m wide would place
 * every module downstream of it a half metre off the grid, and the failure would
 * surface as a seam in a level rather than as an error here.
 */
export function tiledWidth(bays: number): number {
  if (!Number.isInteger(bays) || bays < 1) {
    throw new Error(`Bay count must be a positive integer, received ${bays}`)
  }
  if (bays > 1 && bays % 2 !== 0) {
    throw new Error(
      `A ${bays}-bay run at the ${WINDOW_KIT.bayPitch} m pitch is ${bays * WINDOW_KIT.bayPitch} m wide, `
      + 'which does not terminate on the 1 m grid. Tiled runs take an even bay count.',
    )
  }
  return bays * WINDOW_KIT.bayPitch
}

export const APERTURE_HALF: readonly [number, number] = [
  WINDOW_KIT.clearWidth * 0.5,
  WINDOW_KIT.clearHeight * 0.5,
]

/** Frame plate front face; glazing and hardware are placed against it. */
export const PLATE_FRONT = WINDOW_KIT.platePitch * 0.5

export interface WindowEnvelope {
  readonly width: number
  readonly depth: number
  readonly height: number
}

export interface WindowMetadata {
  readonly version: 1
  readonly moduleId: string
  readonly pivot: typeof WINDOW_KIT.pivot
  readonly front: typeof WINDOW_KIT.front
  readonly envelope: WindowEnvelope
  readonly clear: { readonly width: number; readonly height: number }
  readonly bays: number
}
