import {
  DataTexture,
  LinearFilter,
  LinearMipmapLinearFilter,
  RepeatWrapping,
  RGBAFormat,
  SRGBColorSpace,
  UnsignedByteType,
} from 'three/webgpu'

const DEFAULT_SMOKE_TEXTURE_SIZE = 48

function smokeSmoothstep(edge0: number, edge1: number, value: number): number {
  const t = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)))
  return t * t * (3 - 2 * t)
}

function smokeEllipse(
  px: number,
  py: number,
  centreX: number,
  centreY: number,
  radiusX: number,
  radiusY: number,
): number {
  const distance = Math.hypot((px - centreX) / radiusX, (py - centreY) / radiusY)
  return 1 - smokeSmoothstep(0.52, 1.05, distance)
}

function smokeWisp(
  px: number,
  py: number,
  phase: number,
  amplitude: number,
  width: number,
): number {
  const lift = (py + 1) * 0.5
  const centreX = Math.sin((py + phase) * 5.2) * amplitude
    + Math.sin((py + phase) * 10.7) * 0.045
  const taper = width * (0.72 + lift * 0.55)
  const lateral = 1 - smokeSmoothstep(0.38, 1.0, Math.abs(px - centreX) / taper)
  const ends = 1 - smokeSmoothstep(0.84, 1.03, Math.abs(py))
  return lateral * ends
}

function smokeHash(x: number, y: number): number {
  const value = Math.sin(x * 127.1 + y * 311.7) * 43758.5453
  return value - Math.floor(value)
}

function smokeValueNoise(u: number, v: number, frequency: number): number {
  const x = u * frequency
  const y = v * frequency
  const x0 = Math.floor(x)
  const y0 = Math.floor(y)
  const x1 = (x0 + 1) % frequency
  const y1 = (y0 + 1) % frequency
  const tx = x - x0
  const ty = y - y0
  const sx = tx * tx * (3 - 2 * tx)
  const sy = ty * ty * (3 - 2 * ty)
  const low = smokeHash(x0, y0) * (1 - sx) + smokeHash(x1, y0) * sx
  const high = smokeHash(x0, y1) * (1 - sx) + smokeHash(x1, y1) * sx
  return low * (1 - sy) + high * sy
}

function tileableFbm(u: number, v: number): number {
  let total = 0
  let amplitude = 0.5
  let weight = 0
  for (const frequency of [3, 6, 12, 24]) {
    total += smokeValueNoise(u, v, frequency) * amplitude
    weight += amplitude
    amplitude *= 0.5
  }
  return total / weight
}

export interface SmokeTextureOptions {
  /** Square texture resolution. Defaults to 48 pixels. */
  readonly size?: number
}

/**
 * CPU-baked once per model, then sampled by every smoke card. DataTexture keeps
 * this usable by the headless asset renderer as well as the browser preview;
 * there is no DOM canvas dependency and no per-frame texture work.
 */
export function createSmokeTexture(options: SmokeTextureOptions = {}): DataTexture {
  const size = Math.max(2, Math.round(options.size ?? DEFAULT_SMOKE_TEXTURE_SIZE))
  const data = new Uint8Array(size * size * 4)
  const centre = (size - 1) * 0.5
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const u = x / size
      const v = y / size
      const px = (x - centre) / centre
      const py = (y - centre) / centre
      const noise = tileableFbm(u, v)
      const fineWisp = smokeWisp(px, py, 0.08, 0.2, 0.24)
      const splitWisp = smokeWisp(px, py, 0.41, -0.16, 0.18) * 0.72
      const highWisp = smokeWisp(px, py, 0.73, 0.12, 0.15) * 0.62
      const billow = Math.max(
        smokeEllipse(px, py, -0.14, -0.18, 0.42, 0.55) * 0.34,
        smokeEllipse(px, py, 0.13, 0.28, 0.36, 0.48) * 0.28,
      )
      const envelope = Math.max(fineWisp, splitWisp, highWisp, billow)
      const density = Math.min(1, Math.max(0, envelope * (0.3 + noise * 0.95) - 0.08))
      const alpha = Math.floor(255 * density ** 1.12)
      const lift = Math.min(1, Math.max(0, 0.52 - px * 0.24 + py * 0.34))
      const shade = Math.floor(150 + (240 - 150) * lift * (1 - density * 0.4))
      const index = (y * size + x) * 4
      data[index] = shade
      data[index + 1] = shade
      data[index + 2] = shade
      data[index + 3] = alpha
    }
  }

  const textureMap = new DataTexture(data, size, size, RGBAFormat, UnsignedByteType)
  textureMap.colorSpace = SRGBColorSpace
  textureMap.wrapS = RepeatWrapping
  textureMap.wrapT = RepeatWrapping
  textureMap.magFilter = LinearFilter
  textureMap.minFilter = LinearMipmapLinearFilter
  textureMap.generateMipmaps = true
  textureMap.needsUpdate = true
  return textureMap
}
