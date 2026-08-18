/**
 * Shared 3×5 bitmap glyphs for kit DataTextures (marshal plate, timing pylon,
 * jumbotron sheet). Headless Dawn has no canvas, so every digit is this atlas.
 *
 * Cells are row-major 3×5 (15 entries, 1 = ink).
 */

export const GLYPH_COLS = 3
export const GLYPH_ROWS = 5

/** 3×5 pixel font: 0–9, A–Z, and the punctuation a timing sheet needs. */
export const GLYPH_3X5: Readonly<Record<string, readonly number[]>> = {
  '0': [1, 1, 1, 1, 0, 1, 1, 0, 1, 1, 0, 1, 1, 1, 1],
  '1': [0, 1, 0, 1, 1, 0, 0, 1, 0, 0, 1, 0, 1, 1, 1],
  '2': [1, 1, 1, 0, 0, 1, 1, 1, 1, 1, 0, 0, 1, 1, 1],
  '3': [1, 1, 1, 0, 0, 1, 1, 1, 1, 0, 0, 1, 1, 1, 1],
  '4': [1, 0, 1, 1, 0, 1, 1, 1, 1, 0, 0, 1, 0, 0, 1],
  '5': [1, 1, 1, 1, 0, 0, 1, 1, 1, 0, 0, 1, 1, 1, 1],
  '6': [1, 1, 1, 1, 0, 0, 1, 1, 1, 1, 0, 1, 1, 1, 1],
  '7': [1, 1, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1],
  '8': [1, 1, 1, 1, 0, 1, 1, 1, 1, 1, 0, 1, 1, 1, 1],
  '9': [1, 1, 1, 1, 0, 1, 1, 1, 1, 0, 0, 1, 1, 1, 1],
  A: [1, 1, 1, 1, 0, 1, 1, 1, 1, 1, 0, 1, 1, 0, 1],
  B: [1, 1, 0, 1, 0, 1, 1, 1, 0, 1, 0, 1, 1, 1, 0],
  C: [1, 1, 1, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 1, 1],
  D: [1, 1, 0, 1, 0, 1, 1, 0, 1, 1, 0, 1, 1, 1, 0],
  E: [1, 1, 1, 1, 0, 0, 1, 1, 1, 1, 0, 0, 1, 1, 1],
  F: [1, 1, 1, 1, 0, 0, 1, 1, 1, 1, 0, 0, 1, 0, 0],
  G: [1, 1, 1, 1, 0, 0, 1, 0, 1, 1, 0, 1, 1, 1, 1],
  H: [1, 0, 1, 1, 0, 1, 1, 1, 1, 1, 0, 1, 1, 0, 1],
  I: [1, 1, 1, 0, 1, 0, 0, 1, 0, 0, 1, 0, 1, 1, 1],
  J: [0, 0, 1, 0, 0, 1, 0, 0, 1, 1, 0, 1, 1, 1, 1],
  K: [1, 0, 1, 1, 0, 1, 1, 1, 0, 1, 0, 1, 1, 0, 1],
  L: [1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 1, 1],
  M: [1, 0, 1, 1, 1, 1, 1, 0, 1, 1, 0, 1, 1, 0, 1],
  N: [1, 0, 1, 1, 1, 1, 1, 1, 1, 1, 0, 1, 1, 0, 1],
  O: [1, 1, 1, 1, 0, 1, 1, 0, 1, 1, 0, 1, 1, 1, 1],
  P: [1, 1, 1, 1, 0, 1, 1, 1, 1, 1, 0, 0, 1, 0, 0],
  Q: [1, 1, 1, 1, 0, 1, 1, 0, 1, 1, 1, 1, 0, 0, 1],
  R: [1, 1, 1, 1, 0, 1, 1, 1, 1, 1, 1, 0, 1, 0, 1],
  S: [1, 1, 1, 1, 0, 0, 1, 1, 1, 0, 0, 1, 1, 1, 1],
  T: [1, 1, 1, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0],
  U: [1, 0, 1, 1, 0, 1, 1, 0, 1, 1, 0, 1, 1, 1, 1],
  V: [1, 0, 1, 1, 0, 1, 1, 0, 1, 1, 0, 1, 0, 1, 0],
  W: [1, 0, 1, 1, 0, 1, 1, 0, 1, 1, 1, 1, 1, 0, 1],
  X: [1, 0, 1, 1, 0, 1, 0, 1, 0, 1, 0, 1, 1, 0, 1],
  Y: [1, 0, 1, 1, 0, 1, 0, 1, 0, 0, 1, 0, 0, 1, 0],
  Z: [1, 1, 1, 0, 0, 1, 0, 1, 0, 1, 0, 0, 1, 1, 1],
  ' ': [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  ':': [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0],
  '.': [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0],
  '-': [0, 0, 0, 0, 0, 0, 1, 1, 1, 0, 0, 0, 0, 0, 0],
  '+': [0, 1, 0, 0, 1, 0, 1, 1, 1, 0, 1, 0, 0, 1, 0],
}

export function glyphCells(ch: string): readonly number[] | undefined {
  if (!ch) return undefined
  return GLYPH_3X5[ch] ?? GLYPH_3X5[ch.toUpperCase()]
}

export function glyphAdvance(cell: number): number {
  return cell * GLYPH_COLS + Math.max(4, Math.round(cell * 0.4))
}

function putRgb(
  data: Uint8Array,
  w: number,
  x: number,
  y: number,
  rgb: readonly [number, number, number],
  a = 255,
): void {
  if (x < 0 || y < 0 || x >= w) return
  const i = (y * w + x) * 4
  if (i + 3 >= data.length) return
  data[i] = rgb[0]
  data[i + 1] = rgb[1]
  data[i + 2] = rgb[2]
  data[i + 3] = a
}

export function fillGlyphRect(
  data: Uint8Array,
  w: number,
  x0: number,
  y0: number,
  rw: number,
  rh: number,
  rgb: readonly [number, number, number],
): void {
  for (let y = y0; y < y0 + rh; y++) {
    for (let x = x0; x < x0 + rw; x++) putRgb(data, w, x, y, rgb)
  }
}

/** Stamp one 3×5 glyph at `(ox, oy)` in pixel space. */
export function writeGlyph3x5(
  data: Uint8Array,
  w: number,
  ox: number,
  oy: number,
  cells: readonly number[],
  rgb: readonly [number, number, number],
  cell: number,
): void {
  for (let gy = 0; gy < GLYPH_ROWS; gy++) {
    for (let gx = 0; gx < GLYPH_COLS; gx++) {
      if (!cells[gy * GLYPH_COLS + gx]) continue
      fillGlyphRect(data, w, ox + gx * cell, oy + gy * cell, cell - 1, cell - 1, rgb)
    }
  }
}

/** Write `word` left-to-right. Unknown characters are skipped (no advance). */
export function writeGlyphWord(
  data: Uint8Array,
  w: number,
  ox: number,
  oy: number,
  word: string,
  rgb: readonly [number, number, number],
  cell: number,
): void {
  const advance = glyphAdvance(cell)
  let i = 0
  for (const ch of word) {
    const cells = glyphCells(ch)
    if (!cells) continue
    writeGlyph3x5(data, w, ox + i * advance, oy, cells, rgb, cell)
    i++
  }
}
