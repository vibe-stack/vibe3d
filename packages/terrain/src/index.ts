export const COMPILED_TOPOLOGY_FORMAT = 'vibe3d-topology@1' as const
export const COMPILED_TOPOLOGY_MEDIA_TYPE = 'application/vnd.vibe3d.compiled-topology+json;version=1'
export const COMPILED_SURFACE_BAKE_FORMAT = 'vibe3d-surface-bake@1' as const
export const COMPILED_SURFACE_BAKE_MEDIA_TYPE = 'application/vnd.vibe3d.surface-bake+json;version=1'

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
  /** Optional normalized scalar field samples used to materialize final positions. Never final vertex data. */
  fieldSamples?: Float32Array
  indices: Uint32Array
  stableVertexIds: Uint32Array
  adjacency?: Int32Array
  /**
   * Per-vertex UV in a packed atlas, two floats per vertex, for sampling a
   * `uv-atlas` surface bake. Vertices are duplicated along chart seams, so a
   * topology carrying UVs is manifold as a surface but has seam-split entries in
   * its vertex buffer.
   */
  bakeUvs?: Float32Array
  lods: TopologyLod[]
  collisionIndices: Uint32Array
  claims: GameReadyClaims
}

export type SurfaceBakeDomain = 'uv-atlas' | 'equirectangular' | 'triplanar'
export type SurfaceBakeSemantic =
  | 'normal-tangent'
  /**
   * Normal in the asset's object space. Valid for rigid assets and preferred
   * over `normal-tangent` when the baker and the runtime would otherwise have to
   * agree on a tangent basis, since a basis mismatch is silent and hard to see.
   */
  | 'normal-object'
  | 'height'
  | 'ambient-occlusion'
  | 'curvature'
  | 'region-mask'
export type SurfaceBakeEncoding = 'unorm8' | 'snorm8'

export interface CompiledSurfaceBakeChannel {
  semantic: SurfaceBakeSemantic
  components: 1 | 2 | 3 | 4
  encoding: SurfaceBakeEncoding
  /** Decoded value = encoded normalized value * scale + bias. */
  scale?: number
  bias?: number
  data: Uint8Array
}

/** Disposable high-to-low output. The source recipe and dense reference remain authoritative. */
export interface CompiledSurfaceBake extends TopologyIdentity {
  format: typeof COMPILED_SURFACE_BAKE_FORMAT
  domain: SurfaceBakeDomain
  width: number
  height: number
  channels: CompiledSurfaceBakeChannel[]
}

export interface SurfaceBakeValidationResult {
  valid: boolean
  errors: string[]
  texelCount: number
}

export function validateCompiledSurfaceBake(bake: CompiledSurfaceBake): SurfaceBakeValidationResult {
  const errors: string[] = []
  if (bake.format !== COMPILED_SURFACE_BAKE_FORMAT) errors.push(`Unsupported surface bake format: ${bake.format}`)
  if (!['uv-atlas', 'equirectangular', 'triplanar'].includes(bake.domain)) {
    errors.push(`Unsupported surface bake domain: ${bake.domain}`)
  }
  if (!Number.isInteger(bake.width) || bake.width < 1 || !Number.isInteger(bake.height) || bake.height < 1) {
    errors.push('surface bake dimensions must be positive integers')
  }
  for (const [label, value] of Object.entries({
    assetId: bake.assetId,
    topologyKey: bake.topologyKey,
    recipeHash: bake.recipeHash,
    compilerHash: bake.compilerHash,
    profile: bake.profile,
  })) {
    if (!value) errors.push(`${label} must not be empty`)
  }
  if (bake.channels.length === 0) errors.push('surface bake must contain at least one channel')
  const semantics = new Set<SurfaceBakeSemantic>()
  for (const channel of bake.channels) {
    if (semantics.has(channel.semantic)) errors.push(`surface bake repeats channel: ${channel.semantic}`)
    semantics.add(channel.semantic)
    if (![1, 2, 3, 4].includes(channel.components)) errors.push(`${channel.semantic} has invalid component count`)
    if (!['unorm8', 'snorm8'].includes(channel.encoding)) errors.push(`${channel.semantic} has invalid encoding`)
    if (channel.scale !== undefined && !Number.isFinite(channel.scale)) errors.push(`${channel.semantic} has invalid scale`)
    if (channel.bias !== undefined && !Number.isFinite(channel.bias)) errors.push(`${channel.semantic} has invalid bias`)
    const expected = bake.width * bake.height * channel.components
    if (channel.data.length !== expected) {
      errors.push(`${channel.semantic} contains ${channel.data.length} bytes; expected ${expected}`)
    }
  }
  return { valid: errors.length === 0, errors, texelCount: bake.width * bake.height }
}

export function assertCompiledSurfaceBake(bake: CompiledSurfaceBake): void {
  const result = validateCompiledSurfaceBake(bake)
  if (!result.valid) throw new Error(`Compiled surface bake is invalid:\n- ${result.errors.join('\n- ')}`)
}

interface SerializedSurfaceBake extends Omit<CompiledSurfaceBake, 'channels'> {
  channels: Array<Omit<CompiledSurfaceBakeChannel, 'data'> & { data: string; encodingFormat: 'base64' }>
}

const BASE64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

/**
 * Portable base64, avoiding Buffer (Node-only) and btoa (browser-only, and
 * awkward for large inputs). Channel data is bulk texture bytes: serializing it
 * as a JSON number array costs about four characters per byte, which made a
 * single 512x512 bake 6MB and a 13-instance scene 65MB.
 */
function toBase64(bytes: Uint8Array): string {
  let output = ''
  for (let index = 0; index < bytes.length; index += 3) {
    const a = bytes[index]!
    const b = index + 1 < bytes.length ? bytes[index + 1]! : 0
    const c = index + 2 < bytes.length ? bytes[index + 2]! : 0
    const triple = (a << 16) | (b << 8) | c
    output += BASE64_ALPHABET[(triple >> 18) & 63]
    output += BASE64_ALPHABET[(triple >> 12) & 63]
    output += index + 1 < bytes.length ? BASE64_ALPHABET[(triple >> 6) & 63] : '='
    output += index + 2 < bytes.length ? BASE64_ALPHABET[triple & 63] : '='
  }
  return output
}

const BASE64_LOOKUP = (() => {
  const table = new Int16Array(128).fill(-1)
  for (let index = 0; index < BASE64_ALPHABET.length; index += 1) {
    table[BASE64_ALPHABET.charCodeAt(index)] = index
  }
  return table
})()

function fromBase64(text: string, label: string): Uint8Array {
  const clean = text.endsWith('==') ? text.slice(0, -2) : text.endsWith('=') ? text.slice(0, -1) : text
  const padding = text.length - clean.length
  if (text.length % 4 !== 0) throw new Error(`${label} is not valid base64`)
  const output = new Uint8Array((text.length / 4) * 3 - padding)
  let cursor = 0
  let accumulator = 0
  let bits = 0
  for (let index = 0; index < clean.length; index += 1) {
    const code = clean.charCodeAt(index)
    const value = code < 128 ? BASE64_LOOKUP[code]! : -1
    if (value < 0) throw new Error(`${label} is not valid base64`)
    accumulator = (accumulator << 6) | value
    bits += 6
    if (bits >= 8) {
      bits -= 8
      output[cursor] = (accumulator >> bits) & 0xff
      cursor += 1
    }
  }
  return output
}

export function encodeCompiledSurfaceBake(bake: CompiledSurfaceBake): Uint8Array {
  assertCompiledSurfaceBake(bake)
  const value: SerializedSurfaceBake = {
    ...bake,
    channels: bake.channels.map((channel) => ({
      ...channel,
      data: toBase64(channel.data),
      encodingFormat: 'base64' as const,
    })),
  }
  return new TextEncoder().encode(JSON.stringify(value))
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
    'strategy', 'domainCoordinates', 'fieldSamples', 'indices', 'stableVertexIds', 'adjacency',
    'bakeUvs', 'lods', 'collisionIndices', 'claims',
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
  if (topology.fieldSamples) {
    if (topology.fieldSamples.length === 0) errors.push('fieldSamples must not be empty when present')
    for (const value of topology.fieldSamples) {
      if (!Number.isFinite(value)) {
        errors.push('fieldSamples contains a non-finite value')
        break
      }
    }
  }
  if (topology.stableVertexIds.length !== vertexCount) {
    errors.push('stableVertexIds must contain one ID per vertex')
  } else if (new Set(topology.stableVertexIds).size !== topology.stableVertexIds.length) {
    errors.push('stableVertexIds must be unique')
  }

  if (topology.bakeUvs) {
    if (topology.bakeUvs.length !== vertexCount * 2) {
      errors.push('bakeUvs must contain one UV pair per vertex')
    } else {
      for (const value of topology.bakeUvs) {
        if (!Number.isFinite(value)) {
          errors.push('bakeUvs contains a non-finite value')
          break
        }
        if (value < 0 || value > 1) {
          errors.push('bakeUvs must stay inside the [0, 1] atlas domain')
          break
        }
      }
    }
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

/**
 * Vertex and index buffers are base64, not JSON number arrays.
 *
 * A JSON float costs about 19 characters where its four bytes cost 5.33 in
 * base64, so a number-array topology is roughly 3.5x its own payload. Measured on
 * a canyon wall: 2.44MB against 0.7MB for the same data. That is the difference
 * between a previewer that opens and one that appears to hang, so the compact form
 * is the only one written - though number arrays are still accepted on decode, so
 * artifacts compiled before this change keep loading.
 */
function isIdentity(ids: Uint32Array): boolean {
  for (let index = 0; index < ids.length; index += 1) if (ids[index] !== index) return false
  return true
}

interface SerializedTopology extends Omit<CompiledTopology, 'domainCoordinates' | 'fieldSamples' | 'indices' | 'stableVertexIds' | 'adjacency' | 'bakeUvs' | 'lods' | 'collisionIndices'> {
  domainCoordinates: string
  fieldSamples?: string
  indices: string
  stableVertexIds?: string
  adjacency?: string
  bakeUvs?: string
  lods: Array<Omit<TopologyLod, 'indices'> & { indices: string }>
  collisionIndices: string
  bufferEncoding: 'base64'
  /** Bit width of every index buffer in this payload. */
  indexWidth: 16 | 32
  /** Present when atlas UVs are normalized 16-bit rather than float32. */
  uvQuantized: true
}

function encodeBuffer(view: Float32Array | Uint32Array | Int32Array | Uint16Array): string {
  return toBase64(new Uint8Array(view.buffer, view.byteOffset, view.byteLength))
}

/**
 * Index buffers narrow to 16 bits when the mesh has few enough vertices, which is
 * every asset in this repo. Halves the largest remaining field.
 */
function encodeIndices(indices: Uint32Array, vertexCount: number): { data: string; width: 16 | 32 } {
  if (vertexCount > 0xffff) return { data: encodeBuffer(indices), width: 32 }
  return { data: encodeBuffer(new Uint16Array(indices)), width: 16 }
}

function decodeIndices(value: unknown, width: unknown, label: string): Uint32Array {
  if (typeof value === 'string' && width === 16) {
    const raw = fromBase64(value, label)
    if (raw.byteLength % 2 !== 0) throw new Error(`${label} length is not a multiple of 2 bytes`)
    return new Uint32Array(new Uint16Array(raw.buffer, raw.byteOffset, raw.byteLength / 2))
  }
  return decodeUnsigned(value, label)
}

/**
 * Atlas UVs are stored as normalized 16-bit integers. Positions are not.
 *
 * UVs live in [0, 1], so 16 bits gives a step of 1.5e-5 - about a hundredth of a
 * texel at 1024, far below anything the bake can resolve.
 *
 * Positions were quantized here too, over [-1, 1] for a step of 3.1e-5, on the
 * reasoning that the vertices came from a grid with a 38mm voxel anyway. That was
 * wrong, and the validator caught it: these meshes contain sliver triangles with
 * edges around 7e-5 domain units, the same order as the quantization step, so
 * snapping positions collapsed them and the decoded topology failed its own
 * `minimumDomainTriangleArea` claim. Vertex *spacing* is not bounded by voxel size
 * once dual contouring places two vertices near a shared cell corner, so positions
 * stay float32 and only the index and UV savings are taken.
 */
const QUANTIZED_SCALE = 0xffff

function quantize(view: Float32Array, low: number, high: number): string {
  const span = high - low
  const output = new Uint16Array(view.length)
  for (let index = 0; index < view.length; index += 1) {
    const normalized = (view[index]! - low) / span
    const clamped = normalized < 0 ? 0 : normalized > 1 ? 1 : normalized
    output[index] = Math.round(clamped * QUANTIZED_SCALE)
  }
  return encodeBuffer(output)
}

function dequantize(value: unknown, low: number, high: number, label: string): Float32Array {
  if (typeof value !== 'string') return new Float32Array(finiteNumbers(value, label))
  const raw = fromBase64(value, label)
  if (raw.byteLength % 2 !== 0) throw new Error(`${label} length is not a multiple of 2 bytes`)
  const source = new Uint16Array(raw.buffer, raw.byteOffset, raw.byteLength / 2)
  const span = high - low
  const output = new Float32Array(source.length)
  for (let index = 0; index < source.length; index += 1) {
    output[index] = low + (source[index]! / QUANTIZED_SCALE) * span
  }
  return output
}

/**
 * Decode a buffer written either as base64 or as a legacy JSON number array.
 *
 * The validator downstream still checks range and length, so a malformed legacy
 * array fails there rather than being silently accepted here.
 */
function decodeFloats(value: unknown, label: string): Float32Array {
  if (typeof value === 'string') {
    const raw = fromBase64(value, label)
    if (raw.byteLength % 4 !== 0) throw new Error(`${label} length is not a multiple of 4 bytes`)
    return new Float32Array(raw.buffer, raw.byteOffset, raw.byteLength / 4)
  }
  return new Float32Array(finiteNumbers(value, label))
}

function decodeUnsigned(value: unknown, label: string): Uint32Array {
  if (typeof value === 'string') {
    const raw = fromBase64(value, label)
    if (raw.byteLength % 4 !== 0) throw new Error(`${label} length is not a multiple of 4 bytes`)
    return new Uint32Array(raw.buffer, raw.byteOffset, raw.byteLength / 4)
  }
  return new Uint32Array(unsignedIntegers(value, label))
}

function decodeSigned(value: unknown, label: string): Int32Array {
  if (typeof value === 'string') {
    const raw = fromBase64(value, label)
    if (raw.byteLength % 4 !== 0) throw new Error(`${label} length is not a multiple of 4 bytes`)
    return new Int32Array(raw.buffer, raw.byteOffset, raw.byteLength / 4)
  }
  return new Int32Array(signedIntegers(value, label))
}

export function encodeCompiledTopology(topology: CompiledTopology): Uint8Array {
  assertCompiledTopology(topology)
  const vertexCount = topology.domainCoordinates.length / 3
  const indices = encodeIndices(topology.indices, vertexCount)
  const serialized: SerializedTopology = {
    ...topology,
    domainCoordinates: encodeBuffer(topology.domainCoordinates),
    fieldSamples: topology.fieldSamples ? encodeBuffer(topology.fieldSamples) : undefined,
    indices: indices.data,
    indexWidth: indices.width,
    uvQuantized: true,
    // Omitted when it is the identity map, which is what every static asset uses.
    // Storing 0..n-1 explicitly cost 96KB on a canyon wall for no information.
    stableVertexIds: isIdentity(topology.stableVertexIds)
      ? undefined
      : encodeBuffer(topology.stableVertexIds),
    // Deliberately not written. Adjacency is fully derived from `indices`, and no
    // runtime in this repo reads it back, so shipping it was 183KB per wall of
    // data the loader can rebuild in a few milliseconds if it ever needs it.
    adjacency: undefined,
    bakeUvs: topology.bakeUvs ? quantize(topology.bakeUvs, 0, 1) : undefined,
    lods: topology.lods.map((lod) => ({
      ...lod,
      indices: encodeIndices(lod.indices, vertexCount).data,
    })),
    collisionIndices: encodeIndices(topology.collisionIndices, vertexCount).data,
    bufferEncoding: 'base64',
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

function bytes(value: unknown, label: string): number[] {
  const numbers = unsignedIntegers(value, label)
  if (numbers.some((entry) => entry > 0xff)) throw new Error(`${label} must contain unsigned bytes`)
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

export function decodeCompiledSurfaceBake(content: Uint8Array): CompiledSurfaceBake {
  const value = JSON.parse(new TextDecoder().decode(content)) as Record<string, unknown>
  if (!value || typeof value !== 'object') throw new Error('Compiled surface bake payload must be an object')
  const channels = value.channels
  if (!Array.isArray(channels)) throw new Error('surface bake channels must be an array')
  const bake: CompiledSurfaceBake = {
    format: stringValue(value.format, 'format') as typeof COMPILED_SURFACE_BAKE_FORMAT,
    assetId: stringValue(value.assetId, 'assetId'),
    topologyKey: stringValue(value.topologyKey, 'topologyKey'),
    recipeHash: stringValue(value.recipeHash, 'recipeHash'),
    compilerHash: stringValue(value.compilerHash, 'compilerHash'),
    profile: stringValue(value.profile, 'profile'),
    domain: stringValue(value.domain, 'domain') as SurfaceBakeDomain,
    width: finiteNumber(value.width, 'width'),
    height: finiteNumber(value.height, 'height'),
    channels: channels.map((channel, index) => {
      if (!channel || typeof channel !== 'object') throw new Error(`surface bake channel ${index} must be an object`)
      const record = channel as Record<string, unknown>
      return {
        semantic: stringValue(record.semantic, `channel ${index} semantic`) as SurfaceBakeSemantic,
        components: finiteNumber(record.components, `channel ${index} components`) as 1 | 2 | 3 | 4,
        encoding: stringValue(record.encoding, `channel ${index} encoding`) as SurfaceBakeEncoding,
        scale: record.scale === undefined ? undefined : finiteNumber(record.scale, `channel ${index} scale`),
        bias: record.bias === undefined ? undefined : finiteNumber(record.bias, `channel ${index} bias`),
        data: typeof record.data === 'string'
          ? fromBase64(record.data, `channel ${index} data`)
          : new Uint8Array(bytes(record.data, `channel ${index} data`)),
      }
    }),
  }
  const allowedKeys = new Set([
    'format', 'assetId', 'topologyKey', 'recipeHash', 'compilerHash', 'profile',
    'domain', 'width', 'height', 'channels',
  ])
  for (const key of Object.keys(value)) {
    if (!allowedKeys.has(key)) throw new Error(`Compiled surface bake payload contains forbidden field: ${key}`)
  }
  assertCompiledSurfaceBake(bake)
  return bake
}

export function decodeCompiledTopology(content: Uint8Array): CompiledTopology {
  const value = JSON.parse(new TextDecoder().decode(content)) as Record<string, unknown>
  if (!value || typeof value !== 'object') throw new Error('Compiled topology payload must be an object')
  const lods = value.lods
  if (!Array.isArray(lods)) throw new Error('lods must be an array')
  const claims = value.claims
  if (!claims || typeof claims !== 'object') throw new Error('claims must be an object')
  const claimRecord = claims as Record<string, unknown>
  // Decoded first: the vertex count it implies is what an omitted
  // `stableVertexIds` is reconstructed against.
  // Quantized UVs carry a marker; without it every buffer is float32 (or a legacy
  // number array), so older artifacts keep decoding unchanged.
  const uvQuantized = value.uvQuantized === true
  const indexWidth = value.indexWidth
  const domainCoordinates = decodeFloats(value.domainCoordinates, 'domainCoordinates')
  const domainCoordinateCount = domainCoordinates.length
  const topology: CompiledTopology = {
    format: stringValue(value.format, 'format') as typeof COMPILED_TOPOLOGY_FORMAT,
    assetId: stringValue(value.assetId, 'assetId'),
    topologyKey: stringValue(value.topologyKey, 'topologyKey'),
    recipeHash: stringValue(value.recipeHash, 'recipeHash'),
    compilerHash: stringValue(value.compilerHash, 'compilerHash'),
    profile: stringValue(value.profile, 'profile'),
    strategy: stringValue(value.strategy, 'strategy') as TopologyStrategy,
    domainCoordinates,
    fieldSamples: value.fieldSamples === undefined
      ? undefined
      : decodeFloats(value.fieldSamples, 'fieldSamples'),
    indices: decodeIndices(value.indices, indexWidth, 'indices'),
    // Absent means the identity map. Reconstructed rather than defaulted to empty
    // so every consumer still sees one ID per vertex.
    stableVertexIds: value.stableVertexIds === undefined
      ? new Uint32Array(domainCoordinateCount / 3).map((_, index) => index)
      : decodeUnsigned(value.stableVertexIds, 'stableVertexIds'),
    adjacency: value.adjacency === undefined
      ? undefined
      : decodeSigned(value.adjacency, 'adjacency'),
    bakeUvs: value.bakeUvs === undefined
      ? undefined
      : uvQuantized
        ? dequantize(value.bakeUvs, 0, 1, 'bakeUvs')
        : decodeFloats(value.bakeUvs, 'bakeUvs'),
    lods: lods.map((lod, index) => {
      if (!lod || typeof lod !== 'object') throw new Error(`LOD ${index} must be an object`)
      const record = lod as Record<string, unknown>
      return {
        level: record.level as number,
        maxGeometricError: record.maxGeometricError as number,
        indices: decodeIndices(record.indices, indexWidth, `LOD ${index} indices`),
      }
    }),
    collisionIndices: decodeIndices(value.collisionIndices, indexWidth, 'collisionIndices'),
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
  // Describes how the buffers above were written rather than being part of the
  // topology itself, so it has no counterpart on the decoded object.
  allowedInputKeys.add('bufferEncoding')
  allowedInputKeys.add('indexWidth')
  allowedInputKeys.add('uvQuantized')
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

export interface TerrainSurfaceBakeStore {
  get(key: string): Promise<CompiledSurfaceBake | undefined>
  put(key: string, bake: CompiledSurfaceBake): Promise<void>
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

export class MemoryTerrainSurfaceBakeStore implements TerrainSurfaceBakeStore {
  readonly #entries = new Map<string, CompiledSurfaceBake>()

  async get(key: string): Promise<CompiledSurfaceBake | undefined> {
    return this.#entries.get(key)
  }

  async put(key: string, bake: CompiledSurfaceBake): Promise<void> {
    assertCompiledSurfaceBake(bake)
    this.#entries.set(key, bake)
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
  surfaceBake?: CompiledSurfaceBake
}

export interface TerrainAssetDefinition<Config, Instance> {
  assetId: string
  recipeHash: string
  compilerHash: string
  defaultProfile: string
  identify(
    config: Readonly<Config>,
    profile: string,
    options: Readonly<TerrainCreateOptions<Config>>,
  ): Pick<TopologyIdentity, 'topologyKey'>
  source: {
    build(options: TerrainCreateOptions<Config>): Promise<TerrainBuildResult<Instance>>
  }
  materialize(
    topology: CompiledTopology,
    options: TerrainCreateOptions<Config>,
    surfaceBake?: CompiledSurfaceBake,
  ): Promise<Instance>
  compiled?: readonly CompiledTopology[]
  compiledSurfaceBakes?: readonly CompiledSurfaceBake[]
  cacheStore?: TerrainCacheStore
  surfaceBakeStore?: TerrainSurfaceBakeStore
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

function surfaceBakeMatchesIdentity(bake: CompiledSurfaceBake, identity: TopologyIdentity): boolean {
  return bake.assetId === identity.assetId
    && bake.topologyKey === identity.topologyKey
    && bake.recipeHash === identity.recipeHash
    && bake.compilerHash === identity.compilerHash
    && bake.profile === identity.profile
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
        ...definition.identify(options.config, profile, request),
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
            const bundledSurfaceBake = definition.compiledSurfaceBakes
              ?.find((bake) => surfaceBakeMatchesIdentity(bake, identity))
            const surfaceBake = bundledSurfaceBake ?? await definition.surfaceBakeStore?.get(key)
            if (surfaceBake) {
              assertCompiledSurfaceBake(surfaceBake)
              if (!surfaceBakeMatchesIdentity(surfaceBake, identity)) {
                throw new Error('Compiled surface bake fingerprint does not match the request')
              }
            }
            return await definition.materialize(cached, request, surfaceBake)
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
      if (result.surfaceBake && cacheMode !== 'bypass') {
        assertCompiledSurfaceBake(result.surfaceBake)
        if (!surfaceBakeMatchesIdentity(result.surfaceBake, identity)) {
          throw new Error('Source compiler returned a surface bake with a mismatched fingerprint')
        }
        await definition.surfaceBakeStore?.put(key, result.surfaceBake)
      }
      return result.instance
    },
  }
}
