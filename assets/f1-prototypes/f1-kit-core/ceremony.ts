/**
 * Shared 1:1 ceremony / display / hospitality datums. Display sizes follow
 * common Grade 1 LED installs and the existing FIA yellow-board plate.
 */

import { CIRCUIT_SIGN_PLATE } from './track.ts'

/**
 * Winner's cup: Studio Piet Boon / Royal Delft Zandvoort silhouette (1939 cup
 * redesigned 2021–, photographed on the 2024 Dutch GP podium). Height sits in
 * FIA Appendix 5 winner/constructor band (0.50–0.65 m). Not a generic two-handle
 * stand-in and not a championship trophy logo.
 */
export const TROPHY_CUP = { height: 0.60, bowlR: 0.13, footR: 0.09 } as const

/** Retired generic bowl — not a GP trophy. Kept for existing ids. */
export const TROPHY_BOWL = { height: 0.45 } as const

/** Retired presentation cube — not a GP trophy. Kept for existing ids. */
export const TROPHY_PLINTH = { width: 0.90, height: 0.90, depth: 0.90 } as const

/** 1.5 L magnum bottle. */
export const CHAMPAGNE = { height: 0.35 } as const

/** Presentation ice bucket. */
export const ICE_BUCKET = { height: 0.40, diameter: 0.32 } as const

/** Draped table to the side of the podium (Appendix 5: trophies not on the dais). */
export const TROPHY_TABLE = { width: 2.0, depth: 0.8, height: 0.75 } as const

/** Cooldown / press interview wall. */
export const INTERVIEW_BACKDROP = { width: 4.0, height: 2.4, depth: 0.12 } as const

/** Press platform riser — same 180 mm as kit stairs. */
export const PRESS_RISER = { width: 3.0, rise: 0.18, steps: 3, tread: 0.28 } as const

/** Name/position board — same FIA yellow-board class as circuit signs. */
export const COOLDOWN_BOARD = {
  width: CIRCUIT_SIGN_PLATE.width,
  height: CIRCUIT_SIGN_PLATE.height,
} as const

/** Trackside LED advertising wall. Common 8 × 1.2 m module. */
export const LED_RIBBON = { length: 8.0, height: 1.2, depth: 0.12 } as const

/** Vertical pit-lane information totem. */
export const PIT_TOTEM = { height: 3.5, width: 0.9, depth: 0.35 } as const

/** Trackside sector-time cabinet. */
export const SECTOR_BOARD = { width: 1.2, height: 0.8, depth: 0.14 } as const

/** Fan-zone LED wall (flat, not the jumbotron hood). */
export const FAN_SCREEN = { width: 4.0, height: 2.5, depth: 0.18 } as const

/** Grid countdown clock face. */
export const START_CLOCK = { size: 1.0, depth: 0.12 } as const

/** Walkway branding gantry. 3.0 m deck — below catch-fence, above a person. */
export const BANNER_BRIDGE = { deckHeight: 3.0, width: 2.0 } as const

/** Sandwich board. */
export const A_FRAME = { height: 1.2, width: 0.7 } as const

/** 3 × 3 m hospitality gazebo. */
export const GAZEBO = { span: 3.0, height: 2.6 } as const

/** Cooler-bank module. */
export const DRINK_WALL = { width: 1.3, height: 2.0, depth: 0.75 } as const

/** Sail / feather flag. */
export const FEATHER_FLAG = { height: 4.5 } as const
