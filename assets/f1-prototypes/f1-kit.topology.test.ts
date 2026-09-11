/**
 * Kit-wide compiled-topology gate. Every registry model.ts compiles a measured
 * CompiledTopology sidecar; claims are probed, not declared.
 */
import { describe, expect, test } from 'bun:test'
import { Box3, Object3D, Vector3 } from 'three/webgpu'
import {
  validateCompiledTopology,
} from '../../packages/terrain/src/index.ts'
import { measureIntegrity } from '../../assets/terrain/shared/diagnose.ts'
import { CATALOG } from './f1-kit-core/catalog.ts'
import { compileCatalogEntry, recipeHashOf } from './f1-kit-core/compile.ts'
import { F1_TOPOLOGY_COMPILER_HASH, worldAabbFromTopologyKey } from './f1-kit-core/topology.ts'

const sizeOf = (root: Object3D) => {
  root.updateMatrixWorld(true)
  const box = new Box3().setFromObject(root as never)
  return { box, size: box.getSize(new Vector3()) }
}

describe('f1-kit compiled topology', () => {
  test('catalog covers every model.ts', async () => {
    const disk = new Bun.Glob('*/model.ts').scan({ cwd: import.meta.dir })
    const ids: string[] = []
    for await (const path of disk) {
      const id = path.split('/')[0]!
      if (id !== 'f1-kit-core') ids.push(id)
    }
    ids.sort()
    expect(CATALOG.map((entry) => entry.id).sort()).toEqual(ids)
    expect(ids).toHaveLength(74)
  })

  for (const entry of CATALOG) {
    test(`${entry.id} compiles a game-ready hull`, async () => {
      const compiled = await compileCatalogEntry(entry)
      try {
        const result = validateCompiledTopology(compiled.topology)
        expect(result.valid).toBe(true)
        if (!result.valid) expect(result.errors).toEqual([])
        const integrity = measureIntegrity(
          compiled.topology.indices,
          compiled.topology.domainCoordinates.length / 3,
        )
        expect(integrity.manifold).toBe(true)
        expect(integrity.nonManifoldEdges).toBe(0)
        expect(compiled.topology.claims.manifold).toBe(true)
        expect(compiled.topology.lods.length).toBeGreaterThanOrEqual(1)
        expect(compiled.topology.collisionIndices.length).toBeGreaterThanOrEqual(3)
        expect(compiled.topology.compilerHash).toBe(F1_TOPOLOGY_COMPILER_HASH)
        expect(compiled.topology.recipeHash).toBe(recipeHashOf(entry))
        const hullBox = worldAabbFromTopologyKey(compiled.topology.topologyKey)
        expect(hullBox).not.toBeNull()
      } finally {
        compiled.dispose()
      }
    }, 120_000)
  }

  test('sausage hull stays inside FIA Type 4 (0.80 × 0.12)', async () => {
    const entry = CATALOG.find((item) => item.id === 'f1-sausage-kerb')!
    const compiled = await compileCatalogEntry(entry)
    try {
      const hull = worldAabbFromTopologyKey(compiled.topology.topologyKey)!
      const size = hull.getSize(new Vector3())
      expect(size.z).toBeCloseTo(0.80, 1)
      expect(hull.max.y).toBeCloseTo(0.12, 1)
    } finally {
      compiled.dispose()
    }
  })

  test('hull AABB is contained by the visual model AABB', async () => {
    const sample = ['f1-sausage-kerb', 'f1-jersey-barrier', 'f1-cone', 'f1-tyre']
    for (const id of sample) {
      const entry = CATALOG.find((item) => item.id === id)!
      const compiled = await compileCatalogEntry(entry)
      try {
        const { createModel } = await import(`./${id}/model.ts`) as {
          createModel: (options?: Record<string, unknown>) => { root: Object3D; dispose: () => void }
        }
        const visual = createModel(entry.config)
        try {
          const { box } = sizeOf(visual.root)
          const hull = worldAabbFromTopologyKey(compiled.topology.topologyKey)!
          const pad = 0.08
          expect(hull.min.x).toBeGreaterThanOrEqual(box.min.x - pad)
          expect(hull.min.y).toBeGreaterThanOrEqual(box.min.y - pad)
          expect(hull.min.z).toBeGreaterThanOrEqual(box.min.z - pad)
          expect(hull.max.x).toBeLessThanOrEqual(box.max.x + pad)
          expect(hull.max.y).toBeLessThanOrEqual(box.max.y + pad)
          expect(hull.max.z).toBeLessThanOrEqual(box.max.z + pad)
        } finally {
          visual.dispose()
        }
      } finally {
        compiled.dispose()
      }
    }
  }, 120_000)
})
