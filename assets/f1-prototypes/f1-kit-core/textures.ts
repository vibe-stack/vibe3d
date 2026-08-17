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
      const grain = hash(x * 0.37, y * 0.41) * 0.08
      const dirt = hash(x * 0.09, y * 0.11) * 0.12
      const edge = Math.min(u, v, 1 - u, 1 - v)
      const stain = (1 - Math.min(1, edge * 8)) * 0.16
      const panel = Math.abs(Math.sin(u * Math.PI * 4)) < 0.04 ? 0.07 : 0
      const k = 1 - grain - dirt - stain - panel
      put(
        data, n, x, y,
        Math.round(217 * k + 40),
        Math.round(230 * k + 36),
        Math.round(233 * k + 32),
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

const GLYPH: Record<string, number[]> = {
  '1': [0, 1, 0, 1, 1, 0, 0, 1, 0, 0, 1, 0, 1, 1, 1],
  '2': [1, 1, 1, 0, 0, 1, 1, 1, 1, 1, 0, 0, 1, 1, 1],
}

function fillRect(
  data: Uint8Array, w: number, x0: number, y0: number, rw: number, rh: number,
  r: number, g: number, b: number,
): void {
  for (let y = y0; y < y0 + rh; y++) {
    for (let x = x0; x < x0 + rw; x++) put(data, w, x, y, r, g, b)
  }
}

/** Track-post number plate — white field, graphite digits. */
export function marshalPlateTexture(text = '12'): DataTexture {
  const w = 96
  const h = 64
  const data = new Uint8Array(w * h * 4)
  fillRect(data, w, 0, 0, w, h, 18, 28, 36)
  fillRect(data, w, 4, 4, w - 8, h - 8, 242, 248, 250)
  const cell = 8
  for (let i = 0; i < text.length; i++) {
    const cells = GLYPH[text[i]!]
    if (!cells) continue
    const ox = 14 + i * 40
    const oy = 10
    for (let gy = 0; gy < 5; gy++) {
      for (let gx = 0; gx < 3; gx++) {
        if (!cells[gy * 3 + gx]) continue
        fillRect(data, w, ox + gx * cell, oy + gy * cell, cell - 1, cell - 1, 18, 28, 36)
      }
    }
  }
  const tex = new DataTexture(data, w, h, RGBAFormat, UnsignedByteType)
  tex.colorSpace = SRGBColorSpace
  tex.magFilter = LinearFilter
  tex.minFilter = LinearFilter
  tex.flipY = true
  tex.needsUpdate = true
  return tex
}
