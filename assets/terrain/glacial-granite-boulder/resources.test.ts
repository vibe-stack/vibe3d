import { describe, expect, test } from 'bun:test'
import {
  COMPILED_SURFACE_BAKE_FORMAT,
  COMPILED_TOPOLOGY_FORMAT,
  type CompiledSurfaceBake,
  type CompiledTopology,
} from '../../../packages/terrain/src/index.ts'
import { createModel, disposeGraniteDetail, GraniteResourcePool } from './model.ts'

const identity = {
  assetId: 'glacial-granite-boulder',
  topologyKey: 'test-three-lod-archetype',
  recipeHash: 'recipe',
  compilerHash: 'compiler',
  profile: 'game',
}

const topology: CompiledTopology = {
  ...identity,
  format: COMPILED_TOPOLOGY_FORMAT,
  strategy: 'chunked-dual-contour',
  domainCoordinates: new Float32Array([
    -1, 0, 0, -0.5, 1, 0, 0, 0, 0,
    -1, 0, 0, -0.5, 1, 0, 0, 0, 0,
    -1, 0, 0, -0.5, 1, 0, 0, 0, 0,
  ]),
  indices: new Uint32Array([0, 1, 2]),
  stableVertexIds: new Uint32Array([0, 1, 2, 3, 4, 5, 6, 7, 8]),
  bakeUvs: new Float32Array([
    0, 0, 0.5, 1, 1, 0,
    0, 0, 0.5, 1, 1, 0,
    0, 0, 0.5, 1, 1, 0,
  ]),
  lods: [
    { level: 1, maxGeometricError: 0.1, indices: new Uint32Array([3, 4, 5]) },
    { level: 2, maxGeometricError: 0.2, indices: new Uint32Array([6, 7, 8]) },
  ],
  collisionIndices: new Uint32Array([0, 1, 2]),
  claims: {
    boundaryMode: 'declared-open',
    manifold: true,
    consistentWinding: true,
    lodTransitionsValidated: true,
    collisionValidated: true,
    deformationValidatedSeeds: 1,
    maximumDisplacement: 0,
    minimumDomainTriangleArea: 0.01,
  },
}

const bake: CompiledSurfaceBake = {
  ...identity,
  format: COMPILED_SURFACE_BAKE_FORMAT,
  domain: 'uv-atlas',
  width: 1,
  height: 1,
  channels: [
    { semantic: 'normal-object', components: 3, encoding: 'unorm8', data: new Uint8Array([128, 128, 255]) },
    { semantic: 'height', components: 1, encoding: 'unorm8', data: new Uint8Array([127]) },
    { semantic: 'ambient-occlusion', components: 1, encoding: 'unorm8', data: new Uint8Array([241]) },
    { semantic: 'curvature', components: 1, encoding: 'unorm8', data: new Uint8Array([132]) },
  ],
}

describe('granite runtime resource pool', () => {
  test('uploads one compact geometry and packed bake per shared archetype', () => {
    const pool = new GraniteResourcePool()
    const first = pool.acquire(topology, 1, bake)
    const second = pool.acquire(topology, 1, bake)

    expect(first.geometries).toBe(second.geometries)
    expect(first.bakeTextures).toBe(second.bakeTextures)
    expect(pool.stats()).toEqual({
      archetypes: 1,
      references: 2,
      // Three isolated three-vertex LODs: position + UV + computed normal + u16 index.
      geometryBytes: 306,
      // normal+AO RGBA8 plus height+curvature RG8.
      textureBaseBytes: 6,
      textureBytesWithMipmaps: 8,
    })

    first.release()
    expect(pool.stats().references).toBe(1)
    second.release()
    expect(pool.stats().archetypes).toBe(0)
  })

  test('keeps a coarse baked surface on LOD1 and uses complementary dithering', async () => {
    const model = await createModel({ lod: 1 })
    const materials = model.root.children.map((child) => {
      return (child as unknown as { material: {
        alphaHash: boolean
        alphaTestNode: unknown
        opacityNode: unknown
        userData: Record<string, unknown>
      } }).material
    })

    expect(materials[0]!.userData.graniteSurfaceBake).toEqual({
      enabled: true,
      mipBias: 0,
      effectiveMaximumSize: 2048,
    })
    expect(materials[1]!.userData.graniteSurfaceBake).toEqual({
      enabled: true,
      mipBias: 2,
      effectiveMaximumSize: 512,
    })
    expect(materials[2]!.userData.graniteSurfaceBake).toEqual({
      enabled: false,
      mipBias: 0,
      effectiveMaximumSize: 2048,
    })
    for (const material of materials) {
      expect(material.alphaHash).toBe(false)
      expect(material.alphaTestNode).not.toBeNull()
      expect(material.opacityNode).not.toBeNull()
    }

    model.dispose()
    disposeGraniteDetail()
  })
})
