/**
 * CPU-baked DataTextures for kit props. Headless Dawn has no `document`, so these never go through a canvas.
 */

import {
  DataTexture,
  LinearFilter,
  LinearMipmapLinearFilter,
  RepeatWrapping,
  RGBAFormat,
  SRGBColorSpace,
  UnsignedByteType,
} from 'three/webgpu'

import { fillGlyphRect, glyphAdvance, writeGlyphWord } from './glyphs.ts'

function put(data: Uint8Array, w: number, x: number, y: number, r: number, g: number, b: number, a = 255): void {
  if (x < 0 || y < 0 || x >= w) return
  const i = (y * w + x) * 4
  if (i + 3 >= data.length) return
  data[i] = r
  data[i + 1] = g
  data[i + 2] = b
  data[i + 3] = a
}

function hash(x: number, y: number): number {
  const v = Math.sin(x * 127.1 + y * 311.7) * 43758.5453
  return v - Math.floor(v)
}

/** Weathered GRP paint: shell-white with dirt in the grain and darker panel edges. */
export function paintedShellTexture(size = 128): DataTexture {
  const n = Math.max(16, size)
  const data = new Uint8Array(n * n * 4)
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const u = x / n
      const v = y / n
      const grain = hash(x * 0.17, y * 0.19) * 0.04
      const dirt = hash(x * 0.04, y * 0.05) * 0.05
      const edge = Math.min(u, v, 1 - u, 1 - v)
      const stain = (1 - Math.min(1, edge * 6)) * 0.07
      const panel = Math.abs(Math.sin(u * Math.PI * 3)) < 0.015 ? 0.04 : 0
      const k = 1 - grain - dirt - stain - panel
      put(
        data, n, x, y,
        Math.round(210 + 20 * k),
        Math.round(220 + 18 * k),
        Math.round(224 + 16 * k),
      )
    }
  }
  const tex = new DataTexture(data, n, n, RGBAFormat, UnsignedByteType)
  tex.colorSpace = SRGBColorSpace
  tex.wrapS = RepeatWrapping
  tex.wrapT = RepeatWrapping
  tex.magFilter = LinearFilter
  tex.minFilter = LinearMipmapLinearFilter
  tex.generateMipmaps = true
  tex.needsUpdate = true
  return tex
}

/** Zinc roof sheet: cool grey with corrugation-aligned streaks. */
export function roofSheetTexture(size = 128): DataTexture {
  const n = Math.max(16, size)
  const data = new Uint8Array(n * n * 4)
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const streak = hash(x * 0.8, y * 0.05) * 0.18
      const k = 0.62 + streak
      put(data, n, x, y, Math.round(72 * k), Math.round(82 * k), Math.round(88 * k))
    }
  }
  const tex = new DataTexture(data, n, n, RGBAFormat, UnsignedByteType)
  tex.colorSpace = SRGBColorSpace
  tex.wrapS = RepeatWrapping
  tex.wrapT = RepeatWrapping
  tex.magFilter = LinearFilter
  tex.minFilter = LinearMipmapLinearFilter
  tex.generateMipmaps = true
  tex.needsUpdate = true
  return tex
}

/** Track-post number plate — white field, graphite digits from the shared 3×5 atlas. */
export function marshalPlateTexture(text = '12'): DataTexture {
  const w = 96
  const h = 64
  const data = new Uint8Array(w * h * 4)
  const frame: [number, number, number] = [18, 28, 36]
  const paper: [number, number, number] = [242, 248, 250]
  fillGlyphRect(data, w, 0, 0, w, h, frame)
  fillGlyphRect(data, w, 4, 4, w - 8, h - 8, paper)
  const plate = text.replace(/[^0-9A-Za-z]/g, '').slice(0, 3).toUpperCase() || '12'
  const cell = plate.length <= 1 ? 10 : plate.length === 2 ? 8 : 5
  const wordW = plate.length * glyphAdvance(cell) - Math.max(4, Math.round(cell * 0.4))
  const ox = Math.max(8, Math.round((w - wordW) / 2))
  const oy = Math.max(8, Math.round((h - 5 * cell) / 2))
  writeGlyphWord(data, w, ox, oy, plate, frame, cell)
  const tex = new DataTexture(data, w, h, RGBAFormat, UnsignedByteType)
  tex.colorSpace = SRGBColorSpace
  tex.magFilter = LinearFilter
  tex.minFilter = LinearFilter
  tex.flipY = true
  tex.needsUpdate = true
  return tex
}

function unpackRgb(hex: number): readonly [number, number, number] {
  return [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255]
}

export interface LampLensTextureOptions {
  readonly variant: 'on' | 'off'
  /** Lit colour. Defaults to FIA start-light red. */
  readonly color?: number
  readonly size?: number
  /** Multiplier on the baked on-colour (flood lenses run hotter). */
  readonly intensity?: number
  /**
   * Stamp an LED cell grid into the disc. Default on — TSL node materials do not
   * sample DataTextures in Dawn, so the grid has to live in this CPU map.
   */
  readonly grid?: boolean
}

/**
 * Radial lens map for start/flood lamps. Polar UVs (`applyPolarCapUVs`) sample this as a disc.
 * Baked ~18% hot so ACES Filmic in Dawn still reads near the authored FIA red.
 * Optional LED grid is cartesian cells clipped to the disc (not a TSL shader).
 */
export function lampLensTexture(options: LampLensTextureOptions): DataTexture {
  const grid = options.grid !== false
  const n = Math.max(16, options.size ?? (grid ? 96 : 64))
  const data = new Uint8Array(n * n * 4)
  const [br, bg, bb] = unpackRgb(options.color ?? 0xc41820)
  const boost = 1.18 * (options.intensity ?? 1)
  const on = options.variant === 'on'
  const cells = 11
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const u = (x + 0.5) / n - 0.5
      const v = (y + 0.5) / n - 0.5
      const d = Math.min(1, Math.hypot(u, v) * 2)
      const grain = hash(x * 0.31, y * 0.29) * 0.04
      const gx = ((x + 0.5) / n) * cells
      const gy = ((y + 0.5) / n) * cells
      const fx = gx - Math.floor(gx) - 0.5
      const fy = gy - Math.floor(gy) - 0.5
      const led = grid && d < 0.92 && Math.hypot(fx, fy) * 2 < 0.62
      const gap = grid && d < 0.92 && !led
      if (on) {
        const core = Math.max(0, 1 - d / 0.22)
        const rim = Math.max(0, (d - 0.72) / 0.28)
        const k = Math.max(0, 1 - rim) * (0.55 + 0.45 * (1 - d)) + core * 0.55
        const cellBoost = led ? 1.12 : gap ? 0.38 : 1
        put(
          data, n, x, y,
          Math.min(255, Math.round((br * k + 210 * core) * boost * cellBoost * (1 - grain * 0.4))),
          Math.min(255, Math.round((bg * k + 40 * core) * boost * cellBoost * (1 - grain * 0.4))),
          Math.min(255, Math.round((bb * k + 32 * core) * boost * cellBoost * (1 - grain * 0.4))),
        )
      } else {
        const ring = Math.exp(-((d - 0.4) * (d - 0.4)) / 0.012)
        const k = 0.22 + ring * 0.35 + grain * 0.15
        const cellK = led ? 1.15 : gap ? 0.45 : 1
        put(
          data, n, x, y,
          Math.round(br * 0.09 * k * cellK),
          Math.round(bg * 0.09 * k * cellK),
          Math.round(bb * 0.09 * k * cellK),
        )
      }
    }
  }
  const tex = new DataTexture(data, n, n, RGBAFormat, UnsignedByteType)
  tex.colorSpace = SRGBColorSpace
  tex.magFilter = LinearFilter
  tex.minFilter = LinearFilter
  tex.flipY = false
  tex.needsUpdate = true
  return tex
}
