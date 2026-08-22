/**
 * Shared 1:1 ceremony / display datums. Sizes follow FIA Appendix 5, Grade 1
 * LED installs, and photographed Dutch GP / Zandvoort objects — not invented
 * hospitality filler.
 */

import { CIRCUIT_SIGN_PLATE } from './track.ts'

/**
 * Winner's cup: Studio Piet Boon / Royal Delft Zandvoort silhouette (1939 cup
 * redesigned 2021–, photographed on the 2024–2025 Dutch GP podium). Height sits
 * in FIA Appendix 5 winner band (0.50–0.65 m). P2 / P3 / constructors use the
 * same ceramic silhouette with different paint — one id, not three trophies.
 * Unbranded cobalt disc only; no floral / lion / artist IP.
 */
export const TROPHY_CUP = { height: 0.60, bowlR: 0.13, footR: 0.09 } as const

/** 1.5 L magnum. Typical glass + punt + muselet ~0.35 m (standard magnum envelope). */
export const CHAMPAGNE = { height: 0.35, bodyR: 0.048, neckR: 0.014, foilH: 0.08 } as const

/**
 * Stainless presentation bucket on the trophy table. Magnum ice buckets are
 * ~300 mm rim, ~380 mm overall with rolled lip.
 */
export const ICE_BUCKET = { height: 0.38, rimR: 0.15, baseR: 0.11, lip: 0.012 } as const

/** Draped table to the side of the podium (Appendix 5: trophies not on the dais). */
export const TROPHY_TABLE = { width: 2.0, depth: 0.8, height: 0.75, clothDrop: 0.18 } as const

/** FOM cooldown / press wall. Truss-framed step-and-repeat, fascia via setMaterial. */
export const INTERVIEW_BACKDROP = { width: 4.0, height: 2.4, depth: 0.18, truss: 0.06 } as const

/** Cooldown name/position plate — FIA yellow-board class, handheld / stand. */
export const COOLDOWN_BOARD = {
  width: CIRCUIT_SIGN_PLATE.width,
  height: CIRCUIT_SIGN_PLATE.height,
  poleH: 1.15,
} as const

/**
 * Trackside LED advertising cabinet. Common Grade 1 ribbon: 1.20 m face,
 * 8.0 m module, shallow cabinet on feet — not a glowing slab.
 */
export const LED_RIBBON = { length: 8.0, height: 1.2, depth: 0.22, footH: 0.12, louver: 0.04 } as const

/** Trackside sector-time cabinet — same Grade 1 language as the MYLAPS panel. */
export const SECTOR_BOARD = { width: 1.2, height: 0.8, depth: 0.18 } as const

/** Pit-wall driver name plate. Width tiles on GARAGE_BAY_PITCH. */
export const NAMEBOARD = { width: 1.8, height: 0.42, depth: 0.06 } as const
