import { describe, expect, test } from 'bun:test'
import { projectedErrorPixels, settleLodWeights, targetLodWeights } from './lod.ts'

describe('granite screen-space LOD', () => {
  test('keeps LOD0 while coarse geometry error is visible', () => {
    expect(targetLodWeights(4, 6)).toEqual([1, 0, 0])
  })

  test('cross-fades through LOD1 before LOD2', () => {
    const middle = targetLodWeights(1, 2)
    expect(middle[0]).toBe(0)
    expect(middle[1]).toBe(1)
    expect(middle[2]).toBe(0)
    expect(targetLodWeights(0.2, 0.3)).toEqual([0, 0, 1])
  })

  test('always returns normalized temporally settled weights', () => {
    const next = settleLodWeights([1, 0, 0], [0, 0, 1], 1 / 60)
    expect(next[0]).toBeGreaterThan(0)
    expect(next[2]).toBeGreaterThan(0)
    expect(next[0] + next[1] + next[2]).toBeCloseTo(1, 10)
  })

  test('projected error decreases continuously with distance', () => {
    const near = projectedErrorPixels(0.1, 10, 40, 1080)
    const far = projectedErrorPixels(0.1, 20, 40, 1080)
    expect(near).toBeCloseTo(far * 2, 10)
  })
})
