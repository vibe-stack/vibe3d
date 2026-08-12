import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import {
  COMPILED_TOPOLOGY_FORMAT,
  MemoryTerrainCacheStore,
  createTerrainAsset,
  decodeCompiledTopology,
  encodeCompiledTopology,
  type CompiledTopology,
} from '../src/index.ts'

function triangle(): CompiledTopology {
  return {
    format: COMPILED_TOPOLOGY_FORMAT,
    assetId: 'granite-boulder',
    topologyKey: 'shell-medium',
    recipeHash: 'recipe-1',
    compilerHash: 'compiler-1',
    profile: 'game',
    strategy: 'deformable-shell',
    domainCoordinates: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
    indices: new Uint32Array([0, 1, 2]),
    stableVertexIds: new Uint32Array([10, 11, 12]),
    adjacency: new Int32Array([-1, -1, -1]),
    lods: [{ level: 1, maxGeometricError: 0.1, indices: new Uint32Array([0, 1, 2]) }],
    collisionIndices: new Uint32Array([0, 1, 2]),
    claims: {
      boundaryMode: 'declared-open',
      manifold: true,
      consistentWinding: true,
      lodTransitionsValidated: true,
      collisionValidated: true,
      deformationValidatedSeeds: 32,
      maximumDisplacement: 0.1,
      minimumDomainTriangleArea: 0.25,
    },
  }
}

describe('compiled topology', () => {
  test('round-trips the topology cache format', () => {
    const decoded = decodeCompiledTopology(encodeCompiledTopology(triangle()))
    assert.equal(decoded.assetId, 'granite-boulder')
    assert.deepEqual([...decoded.indices], [0, 1, 2])
    assert.deepEqual([...decoded.domainCoordinates], [0, 0, 0, 1, 0, 0, 0, 1, 0])
  })

  test('rejects final mesh data in a compiled topology payload', () => {
    const encoded = encodeCompiledTopology(triangle())
    const payload = JSON.parse(new TextDecoder().decode(encoded)) as Record<string, unknown>
    payload.finalPositions = [0, 0, 0]
    assert.throws(
      () => decodeCompiledTopology(new TextEncoder().encode(JSON.stringify(payload))),
      /forbidden field: finalPositions/,
    )
  })

  test('uses compatible compiled topology and falls back to source', async () => {
    const store = new MemoryTerrainCacheStore()
    let builds = 0
    let materializations = 0
    const asset = createTerrainAsset({
      assetId: 'granite-boulder',
      recipeHash: 'recipe-1',
      compilerHash: 'compiler-1',
      defaultProfile: 'game',
      identify: () => ({ topologyKey: 'shell-medium' }),
      cacheStore: store,
      source: {
        build: async () => {
          builds += 1
          return { instance: `source-${builds}`, compiled: triangle() }
        },
      },
      materialize: async () => {
        materializations += 1
        return `compiled-${materializations}`
      },
    })

    assert.equal(await asset.create({ config: {}, seed: 1 }), 'source-1')
    assert.equal(await asset.create({ config: {}, seed: 2 }), 'compiled-1')
    assert.equal(builds, 1)
  })
})
