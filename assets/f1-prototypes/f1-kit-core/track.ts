/**
 * Shared circuit-furniture joints so wall-adjacent props (gates, crash cushions, fence
 * sockets) agree on height and thickness instead of each inventing a section.
 *
 * `fits` is the host a gate or end-terminal mates to. Glyph `kind` values are the FIA
 * plate payloads for `f1-circuit-sign` — one prop, not seven boards.
 */

export const WALL_FITS = ['armco', 'concrete', 'jersey'] as const
export type WallFit = (typeof WALL_FITS)[number]

export interface WallEnd {
  /** Outer face height, metres. */
  readonly height: number
  /** Thickness along Z (track-to-runoff), metres. */
  readonly depth: number
  /** Repeat pitch along X, metres. */
  readonly pitch: number
}

/** Nominal end dimensions for a run of each wall family. */
export const WALL_END: Readonly<Record<WallFit, WallEnd>> = {
  armco: { height: 1.24, depth: 0.14, pitch: 2.0 },
  concrete: { height: 1.0, depth: 0.25, pitch: 2.5 },
  jersey: { height: 0.81, depth: 0.61, pitch: 3.0 },
}

/** One F1 garage / pit-wall bay along X. Hosts instance `count` of these. */
export const GARAGE_BAY_PITCH = 7.0

export const CIRCUIT_SIGN_KINDS = [
  'DRS',
  'PIT ENTRY',
  'PIT EXIT',
  '80',
  'T-n',
  'SC',
  'VSC',
] as const
export type CircuitSignKind = (typeof CIRCUIT_SIGN_KINDS)[number]

export function isWallFit(value: string): value is WallFit {
  return (WALL_FITS as readonly string[]).includes(value)
}

export function isCircuitSignKind(value: string): value is CircuitSignKind {
  return (CIRCUIT_SIGN_KINDS as readonly string[]).includes(value)
}
