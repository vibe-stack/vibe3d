import { describe, expect, test } from 'bun:test'
import {
  drawableLodWeights,
  projectedErrorPixels,
  settleLodWeights,
  targetLodWeights,
} from './lod.ts'

describe('granite screen-space LOD', () => {
  test('keeps LOD0 while coarse geometry error is visible', () => {
    expect(targetLodWeights(16, 12)).toEqual([1, 0, 0])
  })

  test('cross-fades through LOD1 before LOD2', () => {
    const middle = targetLodWeights(5, 10)
    expect(middle[0]).toBe(0)
    expect(middle[1]).toBe(1)
    expect(middle[2]).toBe(0)
    expect(targetLodWeights(2, 3)).toEqual([0, 0, 1])
  })

  test('reaches both coarse levels inside the recorder camera range at high DPI', () => {
    const physicalHeight = 1080 * 1.75
    const maximumScale = 1.45
    const fov = 33
    const lod1At75 = projectedErrorPixels((2 / 30) * 1.7 * maximumScale, 75, fov, physicalHeight)
    const lod2At75 = projectedErrorPixels((2 / 20) * 1.7 * maximumScale, 75, fov, physicalHeight)
    expect(targetLodWeights(lod1At75, lod2At75)).toEqual([0, 1, 0])

    const lod1At200 = projectedErrorPixels((2 / 30) * 1.7 * maximumScale, 200, fov, physicalHeight)
    const lod2At200 = projectedErrorPixels((2 / 20) * 1.7 * maximumScale, 200, fov, physicalHeight)
    expect(targetLodWeights(lod1At200, lod2At200)).toEqual([0, 0, 1])
  })

  test('always returns normalized temporally settled weights', () => {
    const next = settleLodWeights([1, 0, 0], [0, 0, 1], 1 / 60)
    expect(next[0]).toBeGreaterThan(0)
    expect(next[2]).toBeGreaterThan(0)
    expect(next[0] + next[1] + next[2]).toBeCloseTo(1, 10)
  })

  test('reassigns a hidden layer so the drawable dither has no interval gap', () => {
    const drawable = drawableLodWeights([0.001, 0.499, 0.5])
    expect(drawable[0]).toBe(0)
    expect(drawable[1]).toBeCloseTo(0.499 / 0.999, 10)
    expect(drawable[2]).toBeCloseTo(0.5 / 0.999, 10)
    expect(drawable[0] + drawable[1] + drawable[2]).toBeCloseTo(1, 10)
  })

  test('projected error decreases continuously with distance', () => {
    const near = projectedErrorPixels(0.1, 10, 40, 1080)
    const far = projectedErrorPixels(0.1, 20, 40, 1080)
    expect(near).toBeCloseTo(far * 2, 10)
  })
})
