/**
 * Canonical Axiom Relay colour tokens for the cargo, storage, and logistics
 * wave.
 *
 * The hexes are copied verbatim from `docs/world/color-system.md`. Nothing here
 * invents a near-match: every extra value a prop needs is *derived* from a token
 * with {@link shade}, so a whole family of panel breaks still traces back to one
 * approved colour instead of drifting into fifty hand-picked greys.
 */

export const TOKEN = {
  INK_950: 0x071019,
  INK_900: 0x111820,
  GRAPHITE_800: 0x182633,
  SLATE_650: 0x4a5963,
  SHELL_200: 0xd9e6e9,
  SHELL_050: 0xf5fbfb,
  PAPER_000: 0xffffff,
  COBALT_500: 0x3e6cff,
  CYAN_400: 0x24dfff,
  VIOLET_500: 0x8b6cff,
  MAGENTA_400: 0xff4fc8,
  LIME_400: 0xb8e95b,
  AMBER_400: 0xf3b33d,
  ORANGE_500: 0xff7a3d,
  RED_500: 0xeb514e,
  RUST_500: 0xb85c43,
  FIELD_500: 0x57b57a,
  DUST_300: 0xc9b99e,
  ICE_300: 0xa9d5e5,
} as const

export type Token = keyof typeof TOKEN

/**
 * Moves a token along its own value ramp. Positive lifts toward white, negative
 * sinks toward black, and hue is preserved because each channel is interpolated
 * against the same endpoint.
 *
 * A panel break, a shadowed return, or a second-tier housing is the *same*
 * material seen at a different value, so deriving it is more honest than picking
 * a neighbouring hex - and it stays correct if the token is ever retuned.
 */
export function shade(hex: number, amount: number): number {
  const target = amount >= 0 ? 255 : 0
  const mix = Math.min(1, Math.abs(amount))
  const channel = (shift: number): number => {
    const value = (hex >> shift) & 0xff
    return Math.round(value + (target - value) * mix)
  }
  return (channel(16) << 16) | (channel(8) << 8) | channel(0)
}

/** Blends two tokens; used for tinted glass, liquid, and stained substrates. */
export function mixToken(a: number, b: number, amount: number): number {
  const mix = Math.min(1, Math.max(0, amount))
  const channel = (shift: number): number => {
    const from = (a >> shift) & 0xff
    const to = (b >> shift) & 0xff
    return Math.round(from + (to - from) * mix)
  }
  return (channel(16) << 16) | (channel(8) << 8) | channel(0)
}
