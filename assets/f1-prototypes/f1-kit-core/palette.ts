/**
 * Canonical colour tokens for the F1 pit-lane kit.
 *
 * The hexes are copied verbatim from `docs/world/color-system.md`. Nothing here invents a near-match:
 * every extra value a prop needs is *derived* from a token with {@link shade}, so a whole family of
 * housings still traces back to one approved colour instead of drifting into a dozen hand-picked greys.
 *
 * A pit garage is an **Industrial / thermal** place family, so per that doc's application table the base
 * neutrals are `INK-950`, `GRAPHITE-800` and `SLATE-650`, with `AMBER-400`, `ORANGE-500` and `CYAN-400`
 * as the permitted signals — two signals only where systems genuinely overlap.
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
 * Moves a token along its own value ramp. Positive lifts toward white, negative sinks toward black, and
 * hue is preserved because each channel is interpolated against the same endpoint.
 *
 * A panel break, a shadowed return, or a second-tier housing is the *same* material seen at a different
 * value, so deriving it is more honest than picking a neighbouring hex — and it stays correct if the
 * token is ever retuned.
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

/** Blends two tokens; used for tinted glass, lenses, and stained substrates. */
export function mixToken(a: number, b: number, amount: number): number {
  const mix = Math.min(1, Math.max(0, amount))
  const channel = (shift: number): number => {
    const from = (a >> shift) & 0xff
    const to = (b >> shift) & 0xff
    return Math.round(from + (to - from) * mix)
  }
  return (channel(16) << 16) | (channel(8) << 8) | channel(0)
}

/**
 * The sport's tyre-compound grading key, expressed in canonical tokens.
 *
 * The real-world key is a colour *ordering* — white, yellow, red across the slicks, then green and blue
 * for the wets — and every one of those roles already has a token that carries the same meaning in this
 * world's language: the hard is a clean shell, the medium is caution, the soft is critical, the
 * intermediate is field-operations, the wet is navigation. Using the tokens keeps the key readable while
 * keeping the kit inside the palette, which is why this is a mapping and not an exception.
 */
export const COMPOUND_TOKEN = {
  hard: TOKEN.SHELL_050,
  medium: TOKEN.AMBER_400,
  soft: TOKEN.RED_500,
  intermediate: TOKEN.FIELD_500,
  wet: TOKEN.COBALT_500,
} as const

export type Compound = keyof typeof COMPOUND_TOKEN
