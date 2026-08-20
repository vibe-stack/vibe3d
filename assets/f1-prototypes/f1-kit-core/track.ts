/**
 * Shared 1:1 circuit datums. FIA-published numbers stay FIA; Grade 1 buildings
 * (Tilke Donington pits, Silverstone Wing area) fill the gaps. Props must import
 * these instead of inventing a second height or thickness.
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

/**
 * Nominal end dimensions for a run of each wall family.
 * Concrete: FIA 3501 envelope 1.0–1.2 m; 0.35 m section (was a thin 0.25 m slab).
 * Jersey: NJ profile scaled so the crown sits at 1.0 m (FIA Grade 1), not US 32 in highway.
 * Armco: existing W-beam stack from wave 2.
 */
export const WALL_END: Readonly<Record<WallFit, WallEnd>> = {
  armco: { height: 1.24, depth: 0.14, pitch: 2.0 },
  concrete: { height: 1.0, depth: 0.35, pitch: 2.5 },
  jersey: { height: 1.0, depth: 0.75, pitch: 3.0 },
}

/** FIA Type 4 combination kerb (sausage): 80 cm wide, 12 cm crown, behind the 800 mm rumble. */
export const SAUSAGE_KERB = { width: 0.80, crown: 0.12, pitch: 0.80 } as const

/** FIA artificial-grass verge. Min install 1.80 m; 2.0 m is the common Grade 1 lay. */
export const ASTROTURF = { width: 2.0, pitch: 1.0, thick: 0.028 } as const

/** FIA grid box from Melbourne 2023 (2.7 m). Length fits a ~5.6 m car plus the nose line. */
export const GRID_BOX = { width: 2.7, length: 8.0 } as const

/** MYLAPS FIA 3504 Grade 1 homologated cabinet (970 × 970 × 180 mm). */
export const FIA_LIGHT_PANEL = { width: 0.97, height: 0.97, depth: 0.18 } as const

/**
 * One F1 garage bay. Pitch is the typical 4–7 m unit (Donington Tilke 6.8 m).
 * Depth / door height follow Donington 17.375 m and Silverstone truck-racing doors.
 */
export const GARAGE = {
  pitch: 7.0,
  width: 6.6,
  depth: 17.0,
  height: 5.0,
  fascia: 1.2,
  wall: 0.18,
} as const

/** FIA signalling envelope (WEC A7.6 grammar): ≤ 2.20 m high, 1.00 m deep. */
export const PIT_WALL = {
  depth: 1.0,
  height: 2.2,
  shelf: 1.1,
  glass: 1.0,
} as const

/** Deck must clear this kit's 5 m catch fence. */
export const SPECTATOR_BRIDGE = { deckHeight: 5.5, width: 2.4 } as const

/** 1:1 GP podium for standing adults. P1 / P2 / P3. */
export const PODIUM_HEIGHTS = [1.00, 0.70, 0.40] as const

/** Timing line is a thin white stripe; ceremonial SF chequer uses 1 m tiles. */
export const START_FINISH = { timing: 0.15, chequer: 1.0 } as const

/** FIA yellow board, ~600–800 mm class. */
export const CIRCUIT_SIGN_PLATE = { width: 0.72, height: 0.56 } as const

/** Grade 1 race-control box (Silverstone RC is 950 m²; this is a compact tower). */
export const RACE_CONTROL = { width: 10, depth: 8, height: 14 } as const

/** One F1 garage / pit-wall bay along X. Hosts instance `count` of these. */
export const GARAGE_BAY_PITCH = GARAGE.pitch

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
