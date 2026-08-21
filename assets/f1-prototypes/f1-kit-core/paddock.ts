/**
 * Shared 1:1 paddock / logistics datums.
 *
 * The rigid envelope is still EU 96/53 (overall ≤ 12.00 m). The cab grammar is
 * the Tesla Semi day-cab / tractor mass from Dimensions.com — unbranded, no
 * Tesla wordmark. Cargo fills whatever is left inside 12 m.
 */

export const TRUCK_KINDS = ['box', 'curtainside', 'reefer'] as const
export type TruckKind = (typeof TRUCK_KINDS)[number]

export function isTruckKind(value: string): value is TruckKind {
  return (TRUCK_KINDS as readonly string[]).includes(value)
}

/**
 * Electric tractor + box, still a paddock rigid.
 * Width 102 in / 2.59 m, height 13 ft / 3.96 m, tractor 20 ft 9 in / 6.32 m,
 * wheelbase 13 ft / 3.95 m — Dimensions.com Tesla Semi.
 * Overall length ≤ 12.00 m — EU 96/53. Tyre: 315/80R22.5 OD ≈ 1.08 m.
 */
export const TRUCK = {
  width: 2.59,
  height: 3.96,
  length: 12.0,
  tractor: 6.32,
  cab: 6.32,
  gap: 0.02,
  wheelbase: 3.95,
  boxLength: 5.66,
  tyreOd: 1.08,
  axles: 2,
} as const
