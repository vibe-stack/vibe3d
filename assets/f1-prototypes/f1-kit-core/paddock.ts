/**
 * Shared 1:1 paddock / logistics datums. EU 96/53 for the rigid truck envelope;
 * EUR-pallet stillage. Props import these instead of inventing a second size.
 */

export const TRUCK_KINDS = ['box', 'curtainside', 'reefer'] as const
export type TruckKind = (typeof TRUCK_KINDS)[number]

export function isTruckKind(value: string): value is TruckKind {
  return (TRUCK_KINDS as readonly string[]).includes(value)
}

/**
 * EU 96/53 cab-over rigid (the F1 paddock delivery class).
 * Width 2.55 m, height 4.00 m, length ≤ 12.00 m. Cab ~2.3 m.
 * Tyre: 315/80R22.5 overall diameter ≈ 1.076 m.
 */
export const TRUCK = {
  width: 2.55,
  height: 4.0,
  length: 12.0,
  cab: 2.3,
  gap: 0.3,
  wheelbase: 5.5,
  boxLength: 9.4,
  tyreOd: 1.08,
  axles: 2,
} as const

/** EUR pallet footprint (ISO 6780 / EUR 1). */
export const STILLAGE = { width: 1.20, depth: 0.80, height: 1.00 } as const

/** Sack truck overall height, standing. */
export const HAND_TROLLEY = { height: 1.15 } as const

/** Hose/cable protector across a paddock road. */
export const CABLE_RAMP = { width: 0.90, height: 0.055 } as const
