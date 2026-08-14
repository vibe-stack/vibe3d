import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import {
  COMPILED_TOPOLOGY_FORMAT,
  COMPILED_SURFACE_BAKE_FORMAT,
  MemoryTerrainCacheStore,
  MemoryTerrainSurfaceBakeStore,
  createTerrainAsset,
  decodeCompiledSurfaceBake,
  decodeCompiledTopology,
  encodeCompiledSurfaceBake,
  encodeCompiledTopology,
  type CompiledSurfaceBake,
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

function uvTriangle(): CompiledTopology {
  return { ...triangle(), bakeUvs: new Float32Array([0, 0, 1, 0, 0, 1]) }
}

function surfaceBake(): CompiledSurfaceBake {
  return {
    format: COMPILED_SURFACE_BAKE_FORMAT,
    assetId: 'granite-boulder',
    topologyKey: 'shell-medium',
    recipeHash: 'recipe-1',
    compilerHash: 'compiler-1',
    profile: 'game',
    domain: 'equirectangular',
    width: 2,
    height: 1,
    channels: [
      { semantic: 'normal-tangent', components: 3, encoding: 'unorm8', data: new Uint8Array([128, 128, 255, 128, 128, 255]) },
      { semantic: 'height', components: 1, encoding: 'unorm8', data: new Uint8Array([96, 160]) },
    ],
  }
}

/**
 * Positions and UVs are normalized 16-bit, so equality is asserted against the
 * documented quantization step rather than exactly. `steps` is how many 1/65535
 * increments of the field's own range are tolerated.
 */
function assertQuantized(actual: Float32Array, expected: number[], steps = 2, span = 2): void {
  assert.equal(actual.length, expected.length)
  const tolerance = (span / 0xffff) * steps
  for (let index = 0; index < expected.length; index += 1) {
    const difference = Math.abs(actual[index]! - expected[index]!)
    assert.ok(
      difference <= tolerance,
      `index ${index}: ${actual[index]} is ${difference} from ${expected[index]}, over ${tolerance}`,
    )
  }
}

describe('compiled topology', () => {
  test('round-trips the topology cache format', () => {
    const source = triangle()
    source.fieldSamples = new Float32Array([-0.25, 0.5, 1])
    const decoded = decodeCompiledTopology(encodeCompiledTopology(source))
    assert.equal(decoded.assetId, 'granite-boulder')
    assert.deepEqual([...decoded.indices], [0, 1, 2])
    assert.deepEqual([...decoded.domainCoordinates], [0, 0, 0, 1, 0, 0, 0, 1, 0])
    assert.deepEqual([...decoded.fieldSamples!], [-0.25, 0.5, 1])
    // Non-identity IDs are carried verbatim; the identity case is covered below.
    assert.deepEqual([...decoded.stableVertexIds], [10, 11, 12])
  })

  test('round-trips fingerprinted high-to-low surface bakes separately from topology', () => {
    const decoded = decodeCompiledSurfaceBake(encodeCompiledSurfaceBake(surfaceBake()))
    assert.equal(decoded.domain, 'equirectangular')
    assert.deepEqual([...decoded.channels[0]!.data], [128, 128, 255, 128, 128, 255])
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
    const bakeStore = new MemoryTerrainSurfaceBakeStore()
    let builds = 0
    let materializations = 0
    const asset = createTerrainAsset({
      assetId: 'granite-boulder',
      recipeHash: 'recipe-1',
      compilerHash: 'compiler-1',
      defaultProfile: 'game',
      identify: () => ({ topologyKey: 'shell-medium' }),
      cacheStore: store,
      surfaceBakeStore: bakeStore,
      source: {
        build: async () => {
          builds += 1
          return { instance: `source-${builds}`, compiled: triangle(), surfaceBake: surfaceBake() }
        },
      },
      materialize: async (_topology, _options, bake) => {
        materializations += 1
        assert.equal(bake?.channels.length, 2)
        return `compiled-${materializations}`
      },
    })

    assert.equal(await asset.create({ config: {}, seed: 1 }), 'source-1')
    assert.equal(await asset.create({ config: {}, seed: 2 }), 'compiled-1')
    assert.equal(builds, 1)
  })
})

describe('bake UV atlas coordinates', () => {
  test('survive an encode and decode round trip', () => {
    const decoded = decodeCompiledTopology(encodeCompiledTopology(uvTriangle()))
    assert.ok(decoded.bakeUvs)
    assert.deepEqual([...decoded.bakeUvs!], [0, 0, 1, 0, 0, 1])
  })

  test('stay optional', () => {
    const decoded = decodeCompiledTopology(encodeCompiledTopology(triangle()))
    assert.equal(decoded.bakeUvs, undefined)
  })

  test('are rejected when the count does not match the vertices', () => {
    const topology = { ...triangle(), bakeUvs: new Float32Array([0, 0, 1, 0]) }
    assert.throws(() => encodeCompiledTopology(topology), /one UV pair per vertex/)
  })

  test('are rejected outside the [0, 1] atlas domain', () => {
    const topology = { ...triangle(), bakeUvs: new Float32Array([0, 0, 1, 0, 0, 1.4]) }
    assert.throws(() => encodeCompiledTopology(topology), /\[0, 1\] atlas domain/)
  })
})

describe('topology buffer encoding', () => {
  test('encodes vertex and index buffers as strings, not number arrays', () => {
    const payload = JSON.parse(new TextDecoder().decode(encodeCompiledTopology(uvTriangle())))
    assert.equal(typeof payload.domainCoordinates, 'string')
    assert.equal(typeof payload.indices, 'string')
    assert.equal(typeof payload.bakeUvs, 'string')
    assert.equal(typeof payload.lods[0].indices, 'string')
    assert.equal(payload.bufferEncoding, 'base64')
  })

  test('round trips positions exactly, so sliver triangles survive validation', () => {
    // Positions are deliberately not quantized. These meshes contain slivers with
    // edges near 7e-5 domain units, so a 3e-5 position grid collapsed them and the
    // decoded topology failed its own minimumDomainTriangleArea claim.
    const values = [0.1, -0.7, 1 / 3, 0.9999999, -0.5, 0.25, 0, 1, -1]
    const source = triangle()
    source.domainCoordinates = new Float32Array(values)
    const decoded = decodeCompiledTopology(encodeCompiledTopology(source))
    assert.deepEqual([...decoded.domainCoordinates], [...source.domainCoordinates])
  })

  test('round trips atlas UVs within a hundredth of a texel', () => {
    const uvs = [0, 0, 0.5, 1 / 3, 0.99999, 0.123456]
    const source = { ...triangle(), bakeUvs: new Float32Array(uvs) }
    const decoded = decodeCompiledTopology(encodeCompiledTopology(source))
    // UVs are normalized 16-bit: a step of 1.5e-5, about 1/65th of a texel at 1024.
    assertQuantized(decoded.bakeUvs!, uvs, 1, 1)
    for (let index = 0; index < uvs.length; index += 1) {
      const texels = Math.abs(decoded.bakeUvs![index]! - uvs[index]!) * 1024
      assert.ok(texels < 0.02, `${texels} texels of error at index ${index}`)
    }
  })

  test('omits stable vertex ids when they are the identity map', () => {
    const source = triangle()
    source.stableVertexIds = new Uint32Array([0, 1, 2])
    const payload = JSON.parse(new TextDecoder().decode(encodeCompiledTopology(source)))
    assert.equal(payload.stableVertexIds, undefined)
    const decoded = decodeCompiledTopology(encodeCompiledTopology(source))
    assert.deepEqual([...decoded.stableVertexIds], [0, 1, 2])
  })

  test('does not ship adjacency, which is derived from the indices', () => {
    const payload = JSON.parse(new TextDecoder().decode(encodeCompiledTopology(triangle())))
    assert.equal(payload.adjacency, undefined)
  })

  test('narrows index buffers to 16 bits for small meshes', () => {
    const payload = JSON.parse(new TextDecoder().decode(encodeCompiledTopology(triangle())))
    assert.equal(payload.indexWidth, 16)
    const decoded = decodeCompiledTopology(encodeCompiledTopology(triangle()))
    assert.deepEqual([...decoded.indices], [0, 1, 2])
    assert.deepEqual([...decoded.collisionIndices], [0, 1, 2])
    assert.deepEqual([...decoded.lods[0]!.indices], [0, 1, 2])
  })

  test('is markedly smaller than a JSON number array at mesh scale', () => {
    const vertexCount = 4096
    const positions = new Float32Array(vertexCount * 3)
    for (let index = 0; index < positions.length; index += 1) {
      // Values with full mantissas, which is what a real vertex buffer holds and
      // what makes the decimal form expensive.
      positions[index] = Math.sin(index * 0.37) * 0.9
    }
    const source: CompiledTopology = {
      ...triangle(),
      domainCoordinates: positions,
      // One ID per vertex, or the validator rejects the topology before encoding.
      stableVertexIds: new Uint32Array(vertexCount).map((_, index) => index),
    }
    const encoded = encodeCompiledTopology(source).byteLength
    const asNumbers = new TextEncoder().encode(JSON.stringify([...positions])).byteLength
    assert.ok(
      encoded < asNumbers * 0.45,
      `expected compact encoding, got ${encoded} vs ${asNumbers} for a number array`,
    )
  })

  test('still decodes the legacy number-array form', () => {
    // Artifacts compiled before the compact encoding must keep loading.
    const source = uvTriangle()
    const legacy = {
      ...source,
      domainCoordinates: [...source.domainCoordinates],
      indices: [...source.indices],
      stableVertexIds: [...source.stableVertexIds],
      adjacency: [...source.adjacency!],
      bakeUvs: [...source.bakeUvs!],
      lods: source.lods.map((lod) => ({ ...lod, indices: [...lod.indices] })),
      collisionIndices: [...source.collisionIndices],
    }
    const decoded = decodeCompiledTopology(new TextEncoder().encode(JSON.stringify(legacy)))
    assert.deepEqual([...decoded.domainCoordinates], [0, 0, 0, 1, 0, 0, 0, 1, 0])
    assert.deepEqual([...decoded.stableVertexIds], [10, 11, 12])
    assert.deepEqual([...decoded.bakeUvs!], [0, 0, 1, 0, 0, 1])
  })

  test('rejects a buffer whose byte length is not a whole number of components', () => {
    const payload = JSON.parse(new TextDecoder().decode(encodeCompiledTopology(uvTriangle())))
    // 'AAAA' is three bytes: a valid base64 group, but neither a whole float32
    // (positions) nor a whole 16-bit value (UVs).
    payload.domainCoordinates = 'AAAA'
    assert.throws(
      () => decodeCompiledTopology(new TextEncoder().encode(JSON.stringify(payload))),
      /multiple of 4 bytes/,
    )
    const uvPayload = JSON.parse(new TextDecoder().decode(encodeCompiledTopology(uvTriangle())))
    uvPayload.bakeUvs = 'AAAA'
    assert.throws(
      () => decodeCompiledTopology(new TextEncoder().encode(JSON.stringify(uvPayload))),
      /multiple of 2 bytes/,
    )
  })
})

describe('surface bake channel encoding', () => {
  test('round trips channel bytes through base64', () => {
    const bake = surfaceBake()
    const decoded = decodeCompiledSurfaceBake(encodeCompiledSurfaceBake(bake))
    for (let index = 0; index < bake.channels.length; index += 1) {
      assert.deepEqual(
        [...decoded.channels[index]!.data],
        [...bake.channels[index]!.data],
      )
    }
  })

  test('encodes channel data as a string, not a number array', () => {
    const payload = JSON.parse(new TextDecoder().decode(encodeCompiledSurfaceBake(surfaceBake())))
    assert.equal(typeof payload.channels[0].data, 'string')
  })

  test('is markedly smaller than a JSON number array at texture scale', () => {
    // A realistic payload: the envelope is negligible, so this measures the
    // encoding itself rather than the surrounding identity fields.
    const size = 64
    const rgb = new Uint8Array(size * size * 3)
    for (let index = 0; index < rgb.length; index += 1) rgb[index] = (index * 37) & 0xff
    const bake: CompiledSurfaceBake = {
      ...surfaceBake(),
      width: size,
      height: size,
      channels: [{ semantic: 'normal-object', components: 3, encoding: 'unorm8', data: rgb }],
    }
    const encoded = encodeCompiledSurfaceBake(bake).byteLength
    const asNumbers = new TextEncoder().encode(JSON.stringify([...rgb])).byteLength
    // base64 is ~1.33 bytes per byte; a JSON number array is ~4.
    assert.ok(
      encoded < asNumbers * 0.45,
      `expected compact encoding, got ${encoded} vs ${asNumbers} for a number array`,
    )
    assert.ok(encoded > rgb.length, 'encoding should not be lossy-small')
  })

  test('still decodes the legacy number-array form', () => {
    const legacy = {
      ...surfaceBake(),
      channels: surfaceBake().channels.map((channel) => ({ ...channel, data: [...channel.data] })),
    }
    const decoded = decodeCompiledSurfaceBake(new TextEncoder().encode(JSON.stringify(legacy)))
    assert.deepEqual([...decoded.channels[1]!.data], [96, 160])
  })
})
