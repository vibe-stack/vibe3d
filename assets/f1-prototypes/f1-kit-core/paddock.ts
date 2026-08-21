/**
 * Shared 1:1 paddock / logistics datums.
 *
 * Cab grammar is a DAF XG+ Super Space Cab (high-roof cab-over), unbranded —
 * no DAF or team wordmark. Tractor + box trailer sit inside the EU 96/53
 * articulated envelope (overall ≤ 16.50 m).
 */

export const TRUCK_KINDS = ['box', 'curtainside', 'reefer'] as const
export type TruckKind = (typeof TRUCK_KINDS)[number]

export function isTruckKind(value: string): value is TruckKind {
  return (TRUCK_KINDS as readonly string[]).includes(value)
}

/**
 * DAF XG+ high-roof artic. Width 2.55 m (EU max), roof ~3.95 m.
 * Tractor bumper-to-fifth-wheel 6.20 m, Super Space Cab body 3.70 m,
 * hitch gap 0.45 m, trailer fills the rest of 16.50 m.
 * Trailer bogie defaults to 3 axles. Tyre: 315/80R22.5 OD ≈ 1.08 m.
 */
export const TRUCK = {
  width: 2.55,
  height: 3.95,
  length: 16.5,
  tractor: 6.2,
  cab: 3.7,
  gap: 0.45,
  wheelbase: 3.8,
  boxLength: 9.70,
  tyreOd: 1.08,
  axles: 3,
} as const
