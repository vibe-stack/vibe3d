import { describe, expect, test } from 'bun:test'
import {
  DETAIL_MILLIMETRES_PER_TEXEL,
  DETAIL_MINERAL_CLASSES,
  DETAIL_RESOLUTION,
  bakeGraniteDetail,
} from './detail-bake.ts'

const identity = {
  assetId: 'granite-detail',
  topologyKey: 'granite-detail-tile',
  recipeHash: 'recipe',
  compilerHash: 'compiler',
  profile: 'game',
}

const { bake, stats } = bakeGraniteDetail(identity, 1)

function channel(semantic: string): { data: Uint8Array; components: number } {
  const found = bake.channels.find((candidate) => candidate.semantic === semantic)
  if (!found) throw new Error(`missing ${semantic}`)
  return { data: found.data, components: found.components }
}

describe('granite micro-detail tile', () => {
  test('resolves the band the atlas cannot reach', () => {
    // The outcrop atlas measures 6.49 mm per texel. The tile has to be at least
    // an order finer or the fine band is still missing after all this work.
    expect(DETAIL_MILLIMETRES_PER_TEXEL).toBeCloseTo(0.25, 5)
    expect(6.49 / DETAIL_MILLIMETRES_PER_TEXEL).toBeGreaterThan(20)
  })

  test('tiles seamlessly in both axes', () => {
    // A wrapped texture whose opposite edges disagree shows a hard line every
    // 256 mm. The generator wraps its cellular lattices on the same period the
    // texture wraps on, so the seam must be statistically invisible: the mean
    // step across it should match the mean step anywhere inside the tile.
    // Comparing means rather than maxima matters here because the height field
    // is genuinely discontinuous at grain boundaries, so a single large step
    // proves nothing either way.
    const { data } = channel('height')
    const size = DETAIL_RESOLUTION
    let seamTotal = 0
    let interiorTotal = 0
    for (let index = 0; index < size; index += 1) {
      seamTotal += Math.abs(data[index * size]! - data[index * size + size - 1]!)
      seamTotal += Math.abs(data[index]! - data[(size - 1) * size + index]!)
      for (let step = 1; step < size; step += 1) {
        interiorTotal += Math.abs(data[index * size + step]! - data[index * size + step - 1]!)
      }
    }
    const seamMean = seamTotal / (size * 2)
    const interiorMean = interiorTotal / (size * (size - 1))
    expect(seamMean).toBeLessThan(interiorMean * 1.15)
  })

  test('carries every mineral class in plausible modal proportion', () => {
    for (const mineral of DETAIL_MINERAL_CLASSES) {
      expect(stats.mineralFractions[mineral]).toBeGreaterThan(0.08)
      expect(stats.mineralFractions[mineral]).toBeLessThan(0.5)
    }
    const total = DETAIL_MINERAL_CLASSES.reduce(
      (sum, mineral) => sum + stats.mineralFractions[mineral],
      0,
    )
    expect(total).toBeCloseTo(1, 4)
  })

  test('encodes crystal tone as a continuous field, not a handful of classes', () => {
    // Guards the confetti regression. An earlier version stored a four-value
    // mineral class here, which gives no tonal variation inside a crystal and
    // maximum contrast at every boundary - salt and pepper once it is lit.
    const { data, components } = channel('region-mask')
    const seen = new Set<number>()
    for (let texel = 0; texel < DETAIL_RESOLUTION * DETAIL_RESOLUTION; texel += 97) {
      seen.add(data[texel * components]!)
    }
    expect(seen.size).toBeGreaterThan(64)
    expect(stats.albedoDeviation).toBeGreaterThan(0.1)
    expect(stats.albedoDeviation).toBeLessThan(0.35)
  })

  test('holds no structure approaching the tile period', () => {
    // The constraint that governs the whole generator. A repeating texture
    // prints its largest feature as a grid at the repeat interval, so a blob a
    // sizeable fraction of the tile across becomes a camouflage pattern spread
    // over every surface the tile is projected onto. Block means measure exactly
    // that: if low frequencies are absent, averaging over large blocks collapses
    // the variance almost to nothing.
    const { data } = channel('height')
    const size = DETAIL_RESOLUTION
    const block = size / 8
    let total = 0
    let squareTotal = 0
    const blockMeans: number[] = []
    for (let blockY = 0; blockY < 8; blockY += 1) {
      for (let blockX = 0; blockX < 8; blockX += 1) {
        let sum = 0
        for (let y = 0; y < block; y += 1) {
          for (let x = 0; x < block; x += 1) {
            sum += data[(blockY * block + y) * size + blockX * block + x]!
          }
        }
        blockMeans.push(sum / (block * block))
      }
    }
    for (let texel = 0; texel < size * size; texel += 1) {
      total += data[texel]!
      squareTotal += data[texel]! * data[texel]!
    }
    const mean = total / (size * size)
    const overall = Math.sqrt(squareTotal / (size * size) - mean * mean)
    const blockMean = blockMeans.reduce((sum, value) => sum + value, 0) / blockMeans.length
    const blockDeviation = Math.sqrt(
      blockMeans.reduce((sum, value) => sum + (value - blockMean) ** 2, 0) / blockMeans.length,
    )
    // The generator currently measures ~0.10: the residual is the grain-size
    // field at 12.8 mm and the grain lattices themselves, both an order below
    // the tile period. The bound is set above that and well below the version
    // that carried a 128 mm fBm, which is the failure being guarded against.
    expect(blockDeviation / overall).toBeLessThan(0.15)
  })

  test('normals are unit length and face outward', () => {
    const { data, components } = channel('normal-tangent')
    for (let texel = 0; texel < DETAIL_RESOLUTION * DETAIL_RESOLUTION; texel += 1013) {
      const x = (data[texel * components]! / 255) * 2 - 1
      const y = (data[texel * components + 1]! / 255) * 2 - 1
      const z = (data[texel * components + 2]! / 255) * 2 - 1
      expect(z).toBeGreaterThan(0)
      expect(Math.sqrt(x * x + y * y + z * z)).toBeCloseTo(1, 1)
    }
  })

  test('opens a minority of grain boundaries', () => {
    // Cavity occlusion belongs in the cracks, and only in some of them. Opening
    // every boundary evenly is what makes a cellular mosaic read as crazed
    // glaze, and it also double-darkens against the atlas AO.
    expect(stats.openBoundaryFraction).toBeGreaterThan(0.01)
    expect(stats.openBoundaryFraction).toBeLessThan(0.12)
  })
})
