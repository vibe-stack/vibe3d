export const COMPILED_TOPOLOGY_FORMAT = 'vibe3d-topology@1' as const
export const COMPILED_TOPOLOGY_MEDIA_TYPE = 'application/vnd.vibe3d.compiled-topology+json;version=1'

export type TopologyStrategy =
  | 'deformable-shell'
  | 'heightfield-patch'
  | 'chunked-dual-contour'
  | 'swept-volume'
  | 'instanced-scatter'

export interface TopologyIdentity {
  assetId: string
  topologyKey: string
  recipeHash: string
  compilerHash: string
  profile: string
}

export interface TopologyLod {
  level: number
  maxGeometricError: number
  indices: Uint32Array
}

export interface GameReadyClaims {
  boundaryMode: 'closed' | 'declared-open' | 'chunk-stitched'
  manifold: boolean
  consistentWinding: boolean
  lodTransitionsValidated: boolean
  collisionValidated: boolean
  deformationValidatedSeeds: number
  maximumDisplacement: number
  minimumDomainTriangleArea: number
}

export interface CompiledTopology extends TopologyIdentity {
  format: typeof COMPILED_TOPOLOGY_FORMAT
  strategy: TopologyStrategy
  domainCoordinates: Float32Array
  indices: Uint32Array
  stableVertexIds: Uint32Array
  adjacency?: Int32Array
  lods: TopologyLod[]
  collisionIndices: Uint32Array
  claims: GameReadyClaims
}

export interface TopologyValidationResult {
  valid: boolean
  errors: string[]
  vertexCount: number
  triangleCount: number
}

export class CompiledTopologyValidationError extends Error {
  readonly errors: string[]

  constructor(errors: string[]) {
    super(`Compiled topology is not game ready:\n- ${errors.join('\n- ')}`)
    this.name = 'CompiledTopologyValidationError'
    this.errors = errors
  }
}

function validateIndices(
  label: string,
  indices: Uint32Array,
  vertexCount: number,
  errors: string[],
): void {
  if (indices.length === 0 || indices.length % 3 !== 0) {
    errors.push(`${label} must contain a non-empty triangle index buffer`)
    return
  }
  for (let index = 0; index < indices.length; index += 3) {
    const a = indices[index]!
    const b = indices[index + 1]!
    const c = indices[index + 2]!
    if (a >= vertexCount || b >= vertexCount || c >= vertexCount) {
      errors.push(`${label} triangle ${index / 3} references a missing vertex`)
      return
    }
    if (a === b || b === c || a === c) {
      errors.push(`${label} triangle ${index / 3} repeats a vertex`)
      return
    }
  }
}

function triangleAreaSquared(domain: Float32Array, a: number, b: number, c: number): number {
  const ax = domain[a * 3]!
  const ay = domain[a * 3 + 1]!
  const az = domain[a * 3 + 2]!
  const abx = domain[b * 3]! - ax
  const aby = domain[b * 3 + 1]! - ay
  const abz = domain[b * 3 + 2]! - az
  const acx = domain[c * 3]! - ax
  const acy = domain[c * 3 + 1]! - ay
  const acz = domain[c * 3 + 2]! - az
  const x = aby * acz - abz * acy
  const y = abz * acx - abx * acz
  const z = abx * acy - aby * acx
  return (x * x + y * y + z * z) * 0.25
}

export function validateCompiledTopology(topology: CompiledTopology): TopologyValidationResult {
  const errors: string[] = []
  const allowedKeys = new Set([
    'format', 'assetId', 'topologyKey', 'recipeHash', 'compilerHash', 'profile',
    'strategy', 'domainCoordinates', 'indices', 'stableVertexIds', 'adjacency',
    'lods', 'collisionIndices', 'claims',
  ])
  for (const key of Object.keys(topology)) {
    if (!allowedKeys.has(key)) errors.push(`compiled topology contains forbidden field: ${key}`)
  }
  const vertexCount = topology.domainCoordinates.length / 3
  const triangleCount = topology.indices.length / 3

  if (topology.format !== COMPILED_TOPOLOGY_FORMAT) errors.push(`Unsupported format: ${topology.format}`)
  if (![
    'deformable-shell',
    'heightfield-patch',
    'chunked-dual-contour',
    'swept-volume',
    'instanced-scatter',
  ].includes(topology.strategy)) errors.push(`Unsupported topology strategy: ${topology.strategy}`)
  for (const [label, value] of Object.entries({
    assetId: topology.assetId,
    topologyKey: topology.topologyKey,
    recipeHash: topology.recipeHash,
    compilerHash: topology.compilerHash,
    profile: topology.profile,
  })) {
    if (!value) errors.push(`${label} must not be empty`)
  }
  if (!Number.isInteger(vertexCount) || vertexCount < 3) {
    errors.push('domainCoordinates must contain at least three XYZ vertices')
  }
  for (const value of topology.domainCoordinates) {
    if (!Number.isFinite(value)) {
      errors.push('domainCoordinates contains a non-finite value')
      break
    }
    if (value < -1 || value > 1) {
      errors.push('domainCoordinates must stay inside the normalized [-1, 1] domain')
      break
    }
  }
  if (topology.stableVertexIds.length !== vertexCount) {
    errors.push('stableVertexIds must contain one ID per vertex')
  } else if (new Set(topology.stableVertexIds).size !== topology.stableVertexIds.length) {
    errors.push('stableVertexIds must be unique')
  }

  validateIndices('indices', topology.indices, vertexCount, errors)
  validateIndices('collisionIndices', topology.collisionIndices, vertexCount, errors)

  const lodLevels = new Set<number>()
  if (topology.lods.length === 0) errors.push('at least one game-ready LOD is required')
  for (const lod of topology.lods) {
    if (!Number.isInteger(lod.level) || lod.level < 1 || lodLevels.has(lod.level)) {
      errors.push('LOD levels must be unique positive integers')
    }
    lodLevels.add(lod.level)
    if (!Number.isFinite(lod.maxGeometricError) || lod.maxGeometricError < 0) {
      errors.push(`LOD ${lod.level} has an invalid geometric error`)
    }
    validateIndices(`LOD ${lod.level}`, lod.indices, vertexCount, errors)
  }

  if (topology.adjacency && topology.adjacency.length !== topology.indices.length) {
    errors.push('adjacency must contain one neighbor per triangle edge')
  } else if (topology.adjacency) {
    for (const neighbor of topology.adjacency) {
      if (neighbor < -1 || neighbor >= triangleCount) {
        errors.push('adjacency references a missing triangle')
        break
      }
    }
  }

  const claims = topology.claims
  if (!['closed', 'declared-open', 'chunk-stitched'].includes(claims.boundaryMode)) {
    errors.push(`Unsupported boundary mode: ${claims.boundaryMode}`)
  }
  if (!claims.manifold) errors.push('topology is not declared manifold')
  if (!claims.consistentWinding) errors.push('topology winding is not validated')
  if (!claims.lodTransitionsValidated) errors.push('LOD transitions are not validated')
  if (!claims.collisionValidated) errors.push('collision topology is not validated')
  if (!Number.isInteger(claims.deformationValidatedSeeds) || claims.deformationValidatedSeeds < 1) {
    errors.push('the deformation envelope must be tested against at least one seed')
  }
  if (!Number.isFinite(claims.maximumDisplacement) || claims.maximumDisplacement < 0) {
    errors.push('maximumDisplacement must be finite and non-negative')
  }
  if (!Number.isFinite(claims.minimumDomainTriangleArea) || claims.minimumDomainTriangleArea <= 0) {
    errors.push('minimumDomainTriangleArea must be finite and positive')
  } else if (topology.indices.length % 3 === 0 && Number.isInteger(vertexCount)) {
    const minimumSquared = claims.minimumDomainTriangleArea ** 2
    for (let index = 0; index < topology.indices.length; index += 3) {
      if (triangleAreaSquared(
        topology.domainCoordinates,
        topology.indices[index]!,
        topology.indices[index + 1]!,
        topology.indices[index + 2]!,
      ) < minimumSquared) {
        errors.push(`domain triangle ${index / 3} is below minimumDomainTriangleArea`)
        break
      }
    }
  }

  return { valid: errors.length === 0, errors, vertexCount, triangleCount }
}

export function assertCompiledTopology(topology: CompiledTopology): void {
  const result = validateCompiledTopology(topology)
  if (!result.valid) throw new CompiledTopologyValidationError(result.errors)
}

interface SerializedTopology extends Omit<CompiledTopology, 'domainCoordinates' | 'indices' | 'stableVertexIds' | 'adjacency' | 'lods' | 'collisionIndices'> {
  domainCoordinates: number[]
  indices: number[]
  stableVertexIds: number[]
  adjacency?: number[]
  lods: Array<Omit<TopologyLod, 'indices'> & { indices: number[] }>
  collisionIndices: number[]
}

export function encodeCompiledTopology(topology: CompiledTopology): Uint8Array {
  assertCompiledTopology(topology)
  const serialized: SerializedTopology = {
    ...topology,
    domainCoordinates: [...topology.domainCoordinates],
    indices: [...topology.indices],
    stableVertexIds: [...topology.stableVertexIds],
    adjacency: topology.adjacency ? [...topology.adjacency] : undefined,
    lods: topology.lods.map((lod) => ({ ...lod, indices: [...lod.indices] })),
    collisionIndices: [...topology.collisionIndices],
  }
  return new TextEncoder().encode(JSON.stringify(serialized))
}

function finiteNumbers(value: unknown, label: string): number[] {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== 'number' || !Number.isFinite(entry))) {
    throw new Error(`${label} must be an array of finite numbers`)
  }
  return value
}

function unsignedIntegers(value: unknown, label: string): number[] {
  const numbers = finiteNumbers(value, label)
  if (numbers.some((entry) => !Number.isInteger(entry) || entry < 0 || entry > 0xffffffff)) {
    throw new Error(`${label} must contain unsigned 32-bit integers`)
  }
  return numbers
}

function signedIntegers(value: unknown, label: string): number[] {
  const numbers = finiteNumbers(value, label)
  if (numbers.some((entry) => !Number.isInteger(entry) || entry < -0x80000000 || entry > 0x7fffffff)) {
    throw new Error(`${label} must contain signed 32-bit integers`)
  }
  return numbers
}

function stringValue(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.length === 0) throw new Error(`${label} must be a non-empty string`)
  return value
}

function finiteNumber(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`${label} must be a finite number`)
  return value
}

function booleanValue(value: unknown, label: string): boolean {
  if (typeof value !== 'boolean') throw new Error(`${label} must be a boolean`)
  return value
}

export function decodeCompiledTopology(content: Uint8Array): CompiledTopology {
  const value = JSON.parse(new TextDecoder().decode(content)) as Record<string, unknown>
  if (!value || typeof value !== 'object') throw new Error('Compiled topology payload must be an object')
  const lods = value.lods
  if (!Array.isArray(lods)) throw new Error('lods must be an array')
  const claims = value.claims
  if (!claims || typeof claims !== 'object') throw new Error('claims must be an object')
  const claimRecord = claims as Record<string, unknown>
  const topology: CompiledTopology = {
    format: stringValue(value.format, 'format') as typeof COMPILED_TOPOLOGY_FORMAT,
    assetId: stringValue(value.assetId, 'assetId'),
    topologyKey: stringValue(value.topologyKey, 'topologyKey'),
    recipeHash: stringValue(value.recipeHash, 'recipeHash'),
    compilerHash: stringValue(value.compilerHash, 'compilerHash'),
    profile: stringValue(value.profile, 'profile'),
    strategy: stringValue(value.strategy, 'strategy') as TopologyStrategy,
    domainCoordinates: new Float32Array(finiteNumbers(value.domainCoordinates, 'domainCoordinates')),
    indices: new Uint32Array(unsignedIntegers(value.indices, 'indices')),
    stableVertexIds: new Uint32Array(unsignedIntegers(value.stableVertexIds, 'stableVertexIds')),
    adjacency: value.adjacency === undefined
      ? undefined
      : new Int32Array(signedIntegers(value.adjacency, 'adjacency')),
    lods: lods.map((lod, index) => {
      if (!lod || typeof lod !== 'object') throw new Error(`LOD ${index} must be an object`)
      const record = lod as Record<string, unknown>
      return {
        level: record.level as number,
        maxGeometricError: record.maxGeometricError as number,
        indices: new Uint32Array(unsignedIntegers(record.indices, `LOD ${index} indices`)),
      }
    }),
    collisionIndices: new Uint32Array(unsignedIntegers(value.collisionIndices, 'collisionIndices')),
    claims: {
      boundaryMode: stringValue(claimRecord.boundaryMode, 'claims.boundaryMode') as GameReadyClaims['boundaryMode'],
      manifold: booleanValue(claimRecord.manifold, 'claims.manifold'),
      consistentWinding: booleanValue(claimRecord.consistentWinding, 'claims.consistentWinding'),
      lodTransitionsValidated: booleanValue(claimRecord.lodTransitionsValidated, 'claims.lodTransitionsValidated'),
      collisionValidated: booleanValue(claimRecord.collisionValidated, 'claims.collisionValidated'),
      deformationValidatedSeeds: finiteNumber(claimRecord.deformationValidatedSeeds, 'claims.deformationValidatedSeeds'),
      maximumDisplacement: finiteNumber(claimRecord.maximumDisplacement, 'claims.maximumDisplacement'),
      minimumDomainTriangleArea: finiteNumber(claimRecord.minimumDomainTriangleArea, 'claims.minimumDomainTriangleArea'),
    },
  }
  const allowedInputKeys = new Set(Object.keys(topology))
  for (const key of Object.keys(value)) {
    if (!allowedInputKeys.has(key)) throw new Error(`Compiled topology payload contains forbidden field: ${key}`)
  }
  assertCompiledTopology(topology)
  return topology
}

export interface TerrainCacheStore {
  get(key: string): Promise<CompiledTopology | undefined>
  put(key: string, topology: CompiledTopology): Promise<void>
}

export class MemoryTerrainCacheStore implements TerrainCacheStore {
  readonly #entries = new Map<string, CompiledTopology>()

  async get(key: string): Promise<CompiledTopology | undefined> {
    return this.#entries.get(key)
  }

  async put(key: string, topology: CompiledTopology): Promise<void> {
    assertCompiledTopology(topology)
    this.#entries.set(key, topology)
  }
}

export type TerrainRepresentationPath = 'auto' | 'compiled' | 'source'
export type TerrainCacheMode = 'use' | 'refresh' | 'bypass'

export interface TerrainCreateOptions<Config> {
  config: Config
  seed: number
  profile?: string
  path?: TerrainRepresentationPath
  cache?: TerrainCacheMode
}

export interface TerrainBuildResult<Instance> {
  instance: Instance
  compiled?: CompiledTopology
}

export interface TerrainAssetDefinition<Config, Instance> {
  assetId: string
  recipeHash: string
  compilerHash: string
  defaultProfile: string
  identify(config: Readonly<Config>, profile: string): Pick<TopologyIdentity, 'topologyKey'>
  source: {
    build(options: TerrainCreateOptions<Config>): Promise<TerrainBuildResult<Instance>>
  }
  materialize(topology: CompiledTopology, options: TerrainCreateOptions<Config>): Promise<Instance>
  compiled?: readonly CompiledTopology[]
  cacheStore?: TerrainCacheStore
}

export interface TerrainAsset<Config, Instance> {
  create(options: TerrainCreateOptions<Config>): Promise<Instance>
}

export function topologyCacheKey(identity: TopologyIdentity): string {
  return [identity.assetId, identity.topologyKey, identity.recipeHash, identity.compilerHash, identity.profile]
    .map((value) => encodeURIComponent(value))
    .join('/')
}

function matchesIdentity(topology: CompiledTopology, identity: TopologyIdentity): boolean {
  return topology.assetId === identity.assetId
    && topology.topologyKey === identity.topologyKey
    && topology.recipeHash === identity.recipeHash
    && topology.compilerHash === identity.compilerHash
    && topology.profile === identity.profile
}

export function createTerrainAsset<Config, Instance>(
  definition: TerrainAssetDefinition<Config, Instance>,
): TerrainAsset<Config, Instance> {
  return {
    async create(options): Promise<Instance> {
      const profile = options.profile ?? definition.defaultProfile
      const request = { ...options, profile }
      const identity: TopologyIdentity = {
        assetId: definition.assetId,
        recipeHash: definition.recipeHash,
        compilerHash: definition.compilerHash,
        profile,
        ...definition.identify(options.config, profile),
      }
      const path = options.path ?? 'auto'
      const cacheMode = options.cache ?? 'use'
      const key = topologyCacheKey(identity)

      if (path !== 'source' && cacheMode !== 'bypass' && cacheMode !== 'refresh') {
        const bundled = definition.compiled?.find((topology) => matchesIdentity(topology, identity))
        const cached = bundled ?? await definition.cacheStore?.get(key)
        if (cached) {
          try {
            assertCompiledTopology(cached)
            if (!matchesIdentity(cached, identity)) throw new Error('Compiled topology fingerprint does not match the request')
            return await definition.materialize(cached, request)
          } catch (error) {
            if (path === 'compiled') throw error
          }
        }
      }

      if (path === 'compiled') {
        throw new Error(`No compatible compiled topology for ${definition.assetId} (${identity.topologyKey})`)
      }

      const result = await definition.source.build(request)
      if (result.compiled && cacheMode !== 'bypass') {
        assertCompiledTopology(result.compiled)
        if (!matchesIdentity(result.compiled, identity)) {
          throw new Error('Source compiler returned topology with a mismatched fingerprint')
        }
        await definition.cacheStore?.put(key, result.compiled)
      }
      return result.instance
    },
  }
}
