import {
  ClampToEdgeWrapping,
  DataTexture,
  LinearFilter,
  RGBAFormat,
  RepeatWrapping,
  SRGBColorSpace,
  UnsignedByteType,
} from 'three/webgpu'

import { TOKEN } from './palette.ts'

/**
 * Procedural decal sheets for the cargo wave.
 *
 * Every graphic in the kit is a real texture on a real seated plaque rather than
 * a coloured quad floated on a shell, because the thing that makes a hazard band
 * read as *painted onto steel* is that it shares the plate's shading while
 * carrying its own albedo. These generators stay deterministic - no noise seeds,
 * no canvas - so two containers built a week apart still stencil identically.
 */

function rgb(hex: number): [number, number, number] {
  return [(hex >> 16) & 0xff, (hex >> 8) & 0xff, hex & 0xff]
}

function texture(pixels: Uint8Array, width: number, height: number, name: string, repeat: boolean): DataTexture {
  const map = new DataTexture(pixels, width, height, RGBAFormat, UnsignedByteType)
  map.name = name
  map.colorSpace = SRGBColorSpace
  map.wrapS = repeat ? RepeatWrapping : ClampToEdgeWrapping
  map.wrapT = ClampToEdgeWrapping
  map.minFilter = LinearFilter
  map.magFilter = LinearFilter
  map.generateMipmaps = false
  map.needsUpdate = true
  return map
}

export interface StripeOptions {
  /** Foreground bar colour; the caution token by default. */
  readonly bar?: number
  /** Ground between bars. */
  readonly ground?: number
  /** Bars per texture width. Higher is a finer, faster-reading cadence. */
  readonly count?: number
  /** Bar lean. 1 leans right, -1 leans left, 0 is a vertical ladder. */
  readonly lean?: number
}

/**
 * The kit's hazard band. Diagonal bars are the one graphic every logistics prop
 * shares, so they are generated once per model and reused across its plaques.
 */
export function createStripeTexture(options: StripeOptions = {}): DataTexture {
  const bar = rgb(options.bar ?? TOKEN.AMBER_400)
  const ground = rgb(options.ground ?? TOKEN.INK_950)
  const count = options.count ?? 5
  const lean = options.lean ?? 1
  const width = 128
  const height = 32
  const period = width / (count * 2)
  const pixels = new Uint8Array(width * height * 4)
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const shifted = x + y * lean * 0.85
      const on = Math.floor(shifted / period) % 2 === 0
      const source = on ? bar : ground
      const offset = (y * width + x) * 4
      pixels[offset] = source[0]
      pixels[offset + 1] = source[1]
      pixels[offset + 2] = source[2]
      pixels[offset + 3] = 255
    }
  }
  return texture(pixels, width, height, 'axiom-cargo-kit / hazard band', true)
}

export interface LabelOptions {
  /** Plate ground. */
  readonly ground?: number
  /** Data block colour. */
  readonly mark?: number
  /** Accent colour for the leading identity block. */
  readonly accent?: number
  /** Deterministic layout selector; different values give different manifests. */
  readonly variant?: number
}

/**
 * A shipping manifest plaque: an identity block, a barcode ladder, and two rows
 * of redacted data blocks.
 *
 * Deliberately not legible type. Legible text on a procedural kit dates the
 * asset, localises it, and invites a reader to check spelling that the geometry
 * cannot support at this texel density; abstract blocks carry the same "this was
 * catalogued by somebody" read at every distance the prop is actually seen from.
 */
export function createLabelTexture(options: LabelOptions = {}): DataTexture {
  const ground = rgb(options.ground ?? TOKEN.SHELL_050)
  const mark = rgb(options.mark ?? TOKEN.INK_950)
  const accent = rgb(options.accent ?? TOKEN.COBALT_500)
  const variant = options.variant ?? 0
  const width = 128
  const height = 64
  const pixels = new Uint8Array(width * height * 4)

  const put = (x: number, y: number, source: [number, number, number]): void => {
    if (x < 0 || y < 0 || x >= width || y >= height) return
    const offset = (y * width + x) * 4
    pixels[offset] = source[0]
    pixels[offset + 1] = source[1]
    pixels[offset + 2] = source[2]
    pixels[offset + 3] = 255
  }
  const fill = (x0: number, y0: number, w: number, h: number, source: [number, number, number]): void => {
    for (let y = y0; y < y0 + h; y += 1) for (let x = x0; x < x0 + w; x += 1) put(x, y, source)
  }

  fill(0, 0, width, height, ground)
  // Keyline, so the plaque still reads as a plaque against a light shell.
  fill(0, 0, width, 3, mark)
  fill(0, height - 3, width, 3, mark)

  // Identity block, then a barcode ladder whose bar widths are driven by a small
  // integer hash of the variant rather than by chance.
  fill(6, 10, 26, 20, accent)
  let cursor = 38
  let state = 0x9e37 + variant * 0x2545
  while (cursor < width - 8) {
    state = (state * 1103515245 + 12345) & 0x7fffffff
    const bar = 1 + ((state >> 7) % 3)
    const gap = 2 + ((state >> 13) % 3)
    fill(cursor, 8, bar, 24, mark)
    cursor += bar + gap
  }
  // Two redacted data rows under the ladder.
  cursor = 6
  for (let row = 0; row < 2; row += 1) {
    let x = cursor
    while (x < width - 8) {
      state = (state * 1103515245 + 12345) & 0x7fffffff
      const run = 4 + ((state >> 9) % 12)
      if ((state >> 5) % 3 !== 0) fill(x, 38 + row * 10, run, 6, mark)
      x += run + 3
    }
  }
  return texture(pixels, width, height, 'axiom-cargo-kit / manifest plaque', false)
}

/**
 * A stencilled ownership mark: one solid chevron wedge with two trailing slashes,
 * matching the painted identity block used across the reference sheets.
 */
export function createChevronTexture(mark = TOKEN.AMBER_400, ground = TOKEN.INK_950): DataTexture {
  const front = rgb(mark)
  const back = rgb(ground)
  const width = 64
  const height = 64
  const pixels = new Uint8Array(width * height * 4)
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      // Wedge: a right-leaning parallelogram, then two thinner trailing bars.
      const lean = x - y * 0.55
      const wedge = lean > 6 && lean < 30
      const slashA = lean > 36 && lean < 43
      const slashB = lean > 48 && lean < 53
      const source = wedge || slashA || slashB ? front : back
      const offset = (y * width + x) * 4
      pixels[offset] = source[0]
      pixels[offset + 1] = source[1]
      pixels[offset + 2] = source[2]
      pixels[offset + 3] = 255
    }
  }
  return texture(pixels, width, height, 'axiom-cargo-kit / ownership chevron', false)
}
