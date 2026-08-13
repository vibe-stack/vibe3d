import {
  AmbientLight,
  BufferAttribute,
  BufferGeometry,
  ClampToEdgeWrapping,
  Color,
  DataTexture,
  DirectionalLight,
  Float32BufferAttribute,
  Group,
  HemisphereLight,
  LinearFilter,
  LinearMipmapLinearFilter,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  MeshStandardNodeMaterial,
  NoColorSpace,
  PerspectiveCamera,
  PlaneGeometry,
  RGFormat,
  RGBAFormat,
  Scene,
  UnsignedByteType,
  Vector3,
} from 'three/webgpu'
import {
  cameraViewMatrix,
  clamp,
  color,
  hash,
  mix,
  mx_noise_float,
  mx_noise_vec3,
  mx_worley_noise_vec2,
  normalLocal,
  normalWorldGeometry,
  normalize as tslNormalize,
  oneMinus,
  positionWorld,
  smoothstep,
  texture,
  transformNormalToView,
  uniform,
  uv,
  varying,
  vec2,
  vec3,
  vec4,
  viewportCoordinate,
} from 'three/tsl'
import {
  createTerrainAsset,
  decodeCompiledSurfaceBake,
  decodeCompiledTopology,
  type CompiledSurfaceBake,
  type CompiledTopology,
  type TerrainRepresentationPath,
} from '../../../packages/terrain/src/index.ts'
import {
  ASSET_ID,
  COMPILER_HASH,
  PROFILE,
  RECIPE_HASH,
  SOURCE_GRID_CELLS,
  compileStats,
  compileSurfaceBakeFor,
  compileTopology,
  materializePositions,
  topologyKeyFor,
} from './topology.ts'
import {
  createGraniteDetailTextures,
  disposeGraniteDetailTextures,
  graniteDetailSurface,
  loadGraniteDetailBake,
  type GraniteDetailTextures,
} from './detail.ts'
import {
  drawableLodWeights,
  projectedErrorPixels,
  settleLodWeights,
  targetLodWeights,
  type LodWeights,
} from './lod.ts'

export interface OutcropConfig {
  snow: number
  wetness: number
  lichen: number
  moss: number
  detailStrength: number
  /** Material-only diversity. It never changes topology or the high-to-low bake. */
  surfaceSeed?: number
  /**
   * Linear world scale this instance is placed at. The procedural bands are
   * evaluated in world space and hold their physical size, so the scale does not
   * change what they look like - but it does change how many triangles are
   * available to describe them, which decides whether a band can ride the vertex
   * stage or has to be paid for per fragment.
   */
  placementScale?: number
  lod: 0 | 1 | 2
  diagnostic: 'beauty' | 'wireframe' | 'normal' | 'ao' | 'uv'
}

export interface OutcropOptions extends Partial<OutcropConfig> {
  seed?: number
  path?: TerrainRepresentationPath
}

export interface OutcropInstance {
  root: Group
  topology: CompiledTopology
  representation: 'compiled' | 'source'
  configure(patch: Partial<Pick<OutcropConfig, 'snow' | 'wetness' | 'lichen' | 'moss' | 'detailStrength' | 'surfaceSeed'>>): void
  update(deltaSeconds: number, camera?: PerspectiveCamera, viewportHeight?: number): void
  dispose(): void
}

export interface OutcropPreview extends OutcropInstance {
  scene: Scene
  camera: PerspectiveCamera
}

const DEFAULT_CONFIG: OutcropConfig = {
  snow: 0.0,
  wetness: 0.12,
  lichen: 0.16,
  moss: 0.06,
  detailStrength: 0.72,
  lod: 0,
  diagnostic: 'beauty',
}

/**
 * The micro-detail tile is one shared physical-scale texture, not a per-archetype
 * bake, so it is held once for the process rather than in the topology-keyed
 * resource pool. Ten cliff placements across six archetypes upload it exactly
 * once between them.
 */
let sharedDetailTextures: GraniteDetailTextures | undefined

/** Load and upload the shared detail tile. Idempotent; safe to call per scene. */
export async function ensureGraniteDetail(): Promise<GraniteDetailTextures> {
  sharedDetailTextures ??= createGraniteDetailTextures(await loadGraniteDetailBake())
  return sharedDetailTextures
}

function requireGraniteDetail(): GraniteDetailTextures {
  if (!sharedDetailTextures) {
    throw new Error('granite detail tile is not loaded; await ensureGraniteDetail() before materializing')
  }
  return sharedDetailTextures
}

/** Bytes the shared tile occupies on the GPU, mipmaps included. */
export function graniteDetailBytes(): number {
  if (!sharedDetailTextures) return 0
  return Math.ceil((sharedDetailTextures.bytes * 4) / 3)
}

export function disposeGraniteDetail(): void {
  if (!sharedDetailTextures) return
  disposeGraniteDetailTextures(sharedDetailTextures)
  sharedDetailTextures = undefined
}

let compiledPromise: Promise<CompiledTopology> | undefined
let compiledSurfaceBakePromise: Promise<CompiledSurfaceBake> | undefined

async function readArtifact(url: URL): Promise<Uint8Array> {
  if (url.protocol === 'file:') {
    const [{ readFile }, { fileURLToPath }] = await Promise.all([
      import(/* @vite-ignore */ 'node:fs/promises'),
      import(/* @vite-ignore */ 'node:url'),
    ])
    return readFile(fileURLToPath(url))
  }
  const response = await fetch(url)
  if (!response.ok) throw new Error(`Unable to load ${url.pathname}: ${response.status}`)
  return new Uint8Array(await response.arrayBuffer())
}

async function loadCompiledTopology(): Promise<CompiledTopology> {
  compiledPromise ??= readArtifact(new URL('./glacial-granite-boulder.vtopo', import.meta.url))
    .then(decodeCompiledTopology)
  return compiledPromise
}

async function loadCompiledSurfaceBake(): Promise<CompiledSurfaceBake> {
  compiledSurfaceBakePromise ??= readArtifact(new URL('./glacial-granite-boulder.vbake', import.meta.url))
    .then(decodeCompiledSurfaceBake)
  return compiledSurfaceBakePromise
}

function indicesFor(topology: CompiledTopology, lod: OutcropConfig['lod']): Uint32Array {
  if (lod === 0) return topology.indices
  return topology.lods.find((candidate) => candidate.level === lod)?.indices ?? topology.indices
}

interface GraniteBakeTextures {
  normalAo: DataTexture
  heightCurvature: DataTexture
}

interface GraniteBiomeUniforms {
  snow: { value: number }
  wetness: { value: number }
  lichen: { value: number }
  moss: { value: number }
  detailStrength: { value: number }
  surfaceSeed: { value: number }
}

type GraniteGeometrySet = [BufferGeometry, BufferGeometry, BufferGeometry]

interface SharedGraniteResources {
  geometries: GraniteGeometrySet
  bakeTextures?: GraniteBakeTextures
  release(): void
}

export interface GraniteResourceStats {
  archetypes: number
  references: number
  geometryBytes: number
  textureBaseBytes: number
  textureBytesWithMipmaps: number
}

interface GraniteResourceEntry {
  references: number
  geometries: GraniteGeometrySet
  bakeTextures?: GraniteBakeTextures
  geometryBytes: number
  textureBaseBytes: number
}

function disposeBakeTextures(textures: GraniteBakeTextures | undefined): void {
  textures?.normalAo.dispose()
  textures?.heightCurvature.dispose()
}

function geometryBytes(geometries: GraniteGeometrySet): number {
  let bytes = 0
  for (const geometry of geometries) {
    for (const attribute of Object.values(geometry.attributes)) bytes += attribute.array.byteLength
    if (geometry.index) bytes += geometry.index.array.byteLength
  }
  return bytes
}

/**
 * Scene-scoped GPU resource ownership. Compiled bytes were already reused by
 * the cliff loader, but without this pool every placement uploaded another copy
 * of the same geometry and bake. The last user disposes each archetype exactly
 * once, so sharing remains safe for independently disposable terrain instances.
 */
export class GraniteResourcePool {
  private readonly entries = new Map<string, GraniteResourceEntry>()

  acquire(
    topology: CompiledTopology,
    seed: number,
    surfaceBake?: CompiledSurfaceBake,
  ): SharedGraniteResources {
    const key = topology.topologyKey
    let entry = this.entries.get(key)
    if (!entry) {
      const geometries = createGeometries(topology, seed)
      const bakeTextures = surfaceBake ? createPackedBakeTextures(surfaceBake) : undefined
      entry = {
        references: 0,
        geometries,
        bakeTextures,
        geometryBytes: geometryBytes(geometries),
        textureBaseBytes: surfaceBake ? surfaceBake.width * surfaceBake.height * 6 : 0,
      }
      this.entries.set(key, entry)
    } else if (!entry.bakeTextures && surfaceBake) {
      entry.bakeTextures = createPackedBakeTextures(surfaceBake)
      entry.textureBaseBytes = surfaceBake.width * surfaceBake.height * 6
    }
    entry.references += 1
    let released = false
    return {
      geometries: entry.geometries,
      bakeTextures: entry.bakeTextures,
      release: () => {
        if (released) return
        released = true
        entry!.references -= 1
        if (entry!.references > 0) return
        for (const geometry of entry!.geometries) geometry.dispose()
        disposeBakeTextures(entry!.bakeTextures)
        this.entries.delete(key)
      },
    }
  }

  stats(): GraniteResourceStats {
    let references = 0
    let geometryTotal = 0
    let textureBase = 0
    for (const entry of this.entries.values()) {
      references += entry.references
      geometryTotal += entry.geometryBytes
      textureBase += entry.textureBaseBytes
    }
    return {
      archetypes: this.entries.size,
      references,
      geometryBytes: geometryTotal,
      textureBaseBytes: textureBase,
      textureBytesWithMipmaps: Math.ceil(textureBase * 4 / 3),
    }
  }

  dispose(): void {
    for (const entry of this.entries.values()) {
      for (const geometry of entry.geometries) geometry.dispose()
      disposeBakeTextures(entry.bakeTextures)
    }
    this.entries.clear()
  }
}

/**
 * Atlas channels are sampled with UVs, not projected. A triplanar projection
 * cannot carry a high-to-low bake: the bake is defined per atlas texel against a
 * specific surface point, so reading it by world position would decouple the
 * detail from the geometry it was measured on.
 */
function runtimeBakeTexture(
  data: Uint8Array,
  bake: CompiledSurfaceBake,
  format: typeof RGFormat | typeof RGBAFormat,
  name: string,
): DataTexture {
  const result = new DataTexture(data, bake.width, bake.height, format, UnsignedByteType)
  result.name = `${ASSET_ID} / ${name} / packed high-to-low bake`
  result.colorSpace = NoColorSpace
  result.wrapS = ClampToEdgeWrapping
  result.wrapT = ClampToEdgeWrapping
  result.magFilter = LinearFilter
  result.minFilter = LinearMipmapLinearFilter
  result.generateMipmaps = true
  result.anisotropy = 8
  result.flipY = false
  result.needsUpdate = true
  return result
}

function requiredBakeChannel(
  bake: CompiledSurfaceBake,
  semantic: CompiledSurfaceBake['channels'][number]['semantic'],
  components: number,
) {
  const channel = bake.channels.find((candidate) => candidate.semantic === semantic)
  if (!channel || channel.components !== components) {
    throw new Error(`${semantic} must contain ${components} component(s) for the granite runtime`)
  }
  return channel
}

/**
 * Lossless runtime packing: normal RGB's previously unused alpha stores AO;
 * height and curvature occupy RG. Every source byte survives unchanged while
 * four texture allocations and seven bytes/texel become two and six.
 */
function createPackedBakeTextures(bake: CompiledSurfaceBake): GraniteBakeTextures {
  const normal = requiredBakeChannel(bake, 'normal-object', 3).data
  const height = requiredBakeChannel(bake, 'height', 1).data
  const ao = requiredBakeChannel(bake, 'ambient-occlusion', 1).data
  const curvature = requiredBakeChannel(bake, 'curvature', 1).data
  const texels = bake.width * bake.height
  const normalAo = new Uint8Array(texels * 4)
  const heightCurvature = new Uint8Array(texels * 2)
  for (let texel = 0; texel < texels; texel += 1) {
    normalAo[texel * 4] = normal[texel * 3]!
    normalAo[texel * 4 + 1] = normal[texel * 3 + 1]!
    normalAo[texel * 4 + 2] = normal[texel * 3 + 2]!
    normalAo[texel * 4 + 3] = ao[texel]!
    heightCurvature[texel * 2] = height[texel]!
    heightCurvature[texel * 2 + 1] = curvature[texel]!
  }
  return {
    normalAo: runtimeBakeTexture(normalAo, bake, RGBAFormat, 'object-normal + ambient-occlusion'),
    heightCurvature: runtimeBakeTexture(heightCurvature, bake, RGFormat, 'height + curvature'),
  }
}

/**
 * World-space procedural field helpers, shared by both granite materials.
 *
 * The two rules encoded here are the ones that decide whether a surface layer
 * survives the trip from shader to screen at an affordable cost.
 */
/**
 * LOD0 triangle edge at unit scale: 7816 triangles over 11.4 m2 of surface. The
 * coarse LODs re-extract at 30 and 20 grid cells against 44, so their edges grow
 * roughly in proportion.
 */
const LOD0_TRIANGLE_METRES = 0.054
const LOD_TRIANGLE_FACTOR = [1, 1.49, 2.23] as const

function graniteWorldFields(
  surfaceSeed: ReturnType<typeof uniform>,
  /**
   * Linear world scale of the placement, and the reason this is a parameter at
   * all. The cliff assembly scales single blocks by 14 to 30, which scales their
   * triangles with them: a 5.4 cm edge on the hero boulder is a 1.5 m edge on a
   * crown block. Every threshold below is relative to the instance, not to the
   * mesh as authored.
   */
  placementScale = 1,
  lodLevel: OutcropConfig['lod'] = 0,
) {
  const p = positionWorld
  const worldNoise = (frequency: number, phase: number, offset?: ReturnType<typeof vec3>) =>
    mx_noise_float(
      (offset ? p.add(offset) : p).mul(frequency).add(surfaceSeed.mul(0.29).add(phase)),
    )
  const worldField = (frequency: number, phase: number) =>
    worldNoise(frequency, phase).mul(0.5).add(0.5)
  /** Six samples finite-differenced into a true gradient. Vertex stage only. */
  const worldGradient = (frequency: number, step: number, phase: number) => vec3(
    worldNoise(frequency, phase, vec3(step, 0, 0))
      .sub(worldNoise(frequency, phase, vec3(-step, 0, 0))),
    worldNoise(frequency, phase, vec3(0, step, 0))
      .sub(worldNoise(frequency, phase, vec3(0, -step, 0))),
    worldNoise(frequency, phase, vec3(0, 0, step))
      .sub(worldNoise(frequency, phase, vec3(0, 0, -step))),
  )
  /**
   * A vector of noise used directly as a surface perturbation instead of six
   * scalar samples differenced into a gradient. It is not the gradient of any
   * height field, so it is only correct where the eye cannot follow the phase -
   * fine fuzz, crust, wind texture - never a form. All three components share
   * one lattice setup, so it costs about one and a half noise evaluations where
   * the gradient costs six, which is what makes it affordable per fragment.
   */
  const worldBump = (frequency: number, phase: number) =>
    mx_noise_vec3(p.mul(frequency).add(surfaceSeed.mul(0.29).add(phase)))
  /**
   * Vertex-stage evaluation where the mesh can carry it, per fragment where it
   * cannot. Declare the field's frequency and the helper picks the stage.
   *
   * A varying is linearly interpolated across a triangle, so a feature finer
   * than about two triangles is not approximated, it is deleted. On the hero
   * boulder that limit sits near 9 cycles/m and every broad band rides the
   * vertex stage for free. On a cliff block scaled 28x the same mesh has 1.5 m
   * triangles and the limit collapses to roughly 0.3 cycles/m, so the identical
   * declaration moves to the fragment stage instead of quietly evaporating.
   * That is the whole difference between the hero rock and the assembly: the
   * blocks were not missing bands, they were interpolating them away, and the
   * only visible symptom was that a 30 m cliff looked smoother than a 3 m rock.
   *
   * Cellular fields are excluded by kind at every frequency. A Worley value is
   * a distance to a cell site and its entire content is the ridge where two
   * cells meet; interpolating that ridge across a triangle averages it away and
   * leaves a soft blob, which is the difference between a lichen crust with a
   * hard margin and a green stain.
   */
  const triangleMetres = LOD0_TRIANGLE_METRES * LOD_TRIANGLE_FACTOR[lodLevel] * placementScale
  // Two triangles per cycle is the coarsest a varying can be and still describe
  // a feature rather than average it.
  const varyingLimitCyclesPerMetre = 0.5 / triangleMetres
  const coarseVarying = <T>(maxCyclesPerMetre: number, node: T): T =>
    (maxCyclesPerMetre <= varyingLimitCyclesPerMetre ? varying(node) : node) as T
  /**
   * Keep a perturbation tangential so it tilts the surface without pulling the
   * normal off the face it belongs to, then rotate it into view space. Rotated
   * with an explicit multiply, never transformDirection, which normalises its
   * result and would let any offset swamp the normal it is meant to nudge.
   */
  const viewOffset = (worldVector: ReturnType<typeof vec3>) => cameraViewMatrix.mul(vec4(
    worldVector.sub(normalWorldGeometry.mul(worldVector.dot(normalWorldGeometry))),
    0,
  )).xyz
  return { worldNoise, worldField, worldGradient, worldBump, coarseVarying, viewOffset }
}

/**
 * Game/recorder material. Close-ups cover most of the viewport, so the runtime
 * graph deliberately spends fragment work only on the measured atlas and the
 * physical-scale detail tile. Broad weathering is evaluated at vertices and
 * interpolated; its wavelength is far larger than the reduced triangles.
 */
function createGraniteMaterial(
  config: OutcropConfig,
  seed: number,
  bakeTextures: GraniteBakeTextures,
  lodLevel: OutcropConfig['lod'] = 0,
): MeshStandardNodeMaterial {
  const material = new MeshStandardNodeMaterial({
    name: 'fractured granite / realtime high-to-low surface',
    roughness: 0.82,
    metalness: 0.02,
  })
  const biomeUniforms = {
    snow: uniform(config.snow),
    wetness: uniform(config.wetness),
    lichen: uniform(config.lichen),
    moss: uniform(config.moss),
    detailStrength: uniform(config.detailStrength),
    surfaceSeed: uniform(config.surfaceSeed ?? seed),
  }
  material.userData.graniteBiomeUniforms = biomeUniforms

  const atlas = uv()
  const usesBakedSurface = lodLevel <= 1
  // LOD1 keeps the measured high-to-low surface, but reads two mips coarser.
  // The 1024 atlas already owns this mip chain, so this behaves like a dedicated
  // 256 bake without another upload or another six bytes per source texel.
  const surfaceBakeMipBias = lodLevel === 1 ? 2 : 0
  const normalAo = texture(bakeTextures.normalAo, atlas).bias(surfaceBakeMipBias)
  const heightCurvature = texture(bakeTextures.heightCurvature, atlas).bias(surfaceBakeMipBias)
  const bakedHeight = heightCurvature.r.mul(2).sub(1)
  const bakedCurvature = heightCurvature.g.mul(2).sub(1)
  const bakedAo = normalAo.a
  material.userData.graniteSurfaceBake = {
    enabled: usesBakedSurface,
    mipBias: surfaceBakeMipBias,
    effectiveMaximumSize: Math.max(
      1,
      bakeTextures.normalAo.image.width / (2 ** surfaceBakeMipBias),
    ),
  }

  if (config.diagnostic === 'normal') {
    material.colorNode = normalAo.xyz
    return material
  }
  if (config.diagnostic === 'ao') {
    material.colorNode = vec3(bakedAo, bakedAo, bakedAo)
    return material
  }
  if (config.diagnostic === 'uv') {
    material.colorNode = vec3(atlas.x, atlas.y, 0.2)
    return material
  }

  const p = positionWorld
  const surfaceSeed = biomeUniforms.surfaceSeed
  const { worldNoise, worldField, worldGradient, worldBump, coarseVarying, viewOffset } =
    graniteWorldFields(surfaceSeed, config.placementScale ?? 1, lodLevel)
  const macro = coarseVarying(6.4, vec4(
    mx_noise_float(vec3(p.x.mul(0.72), p.y.mul(1.05), p.z.mul(0.72))
      .add(surfaceSeed.mul(0.13))).mul(0.5).add(0.5),
    mx_noise_float(p.mul(2.8).add(surfaceSeed.mul(0.31))).mul(0.5).add(0.5),
    mx_noise_float(p.mul(0.82).add(surfaceSeed.mul(0.73))).mul(0.5).add(0.5),
    mx_noise_float(p.mul(6.4).add(surfaceSeed.mul(1.17))).mul(0.5).add(0.5),
  ))
  const detail = graniteDetailSurface(requireGraniteDetail(), {
    strength: lodLevel === 0 ? 1.05 : lodLevel === 1 ? 0.82 : 0.42,
  })

  const cavity = color(0x302f29)
  const darkGranite = color(0x42423d)
  const granite = color(0x5b5851)
  const paleGranite = color(0x8d887f)
  const feldspar = color(0x9c8b78)
  const biotite = color(0x24251f)
  const wetGranite = color(0x29302e)
  const mossDeep = color(0x222c14)
  const mossBody = color(0x41501f)
  const mossTip = color(0x64743a)
  const lichenBody = color(0x7f8768)
  const lichenCentre = color(0x99a07e)
  const lichenMargin = color(0xb4b6a1)
  const lichenFissure = color(0x4b4e3a)
  const lichenRustBody = color(0x8a6a34)
  const lichenRustCentre = color(0xa88f49)
  const snowShade = color(0x9fafc0)
  const snowLit = color(0xe1e6ea)

  let stone = mix(darkGranite, granite, smoothstep(0.18, 0.86, macro.x))
  stone = mix(stone, paleGranite, smoothstep(0.62, 0.94, macro.y).mul(0.16))
  stone = mix(stone, biotite, oneMinus(smoothstep(0.08, 0.32, detail.albedo)).mul(0.22))
  stone = mix(stone, feldspar, smoothstep(0.62, 0.9, detail.albedo).mul(0.17))
  if (usesBakedSurface) {
    stone = mix(stone, paleGranite, smoothstep(0.2, 0.82, bakedCurvature).mul(0.18))
    stone = mix(stone, cavity, oneMinus(bakedAo).mul(0.28))
    stone = mix(stone, cavity, oneMinus(smoothstep(-0.72, -0.08, bakedHeight)).mul(0.11))
  }

  const upward = smoothstep(0.28, 0.86, normalWorldGeometry.y)
  const upwardBroad = smoothstep(-0.14, 0.62, normalWorldGeometry.y)
  const shelter = usesBakedSurface
    ? clamp(oneMinus(bakedAo).mul(0.72)
      .add(oneMinus(smoothstep(-0.62, 0.02, bakedCurvature)).mul(0.28)), 0, 1)
    : oneMinus(macro.y)

  const wetDistribution = clamp(shelter.mul(0.72)
    .add(oneMinus(upward).mul(macro.w).mul(0.58)), 0, 1)
  const wetMask = clamp(
    biomeUniforms.wetness.mul(1.55).sub(oneMinus(wetDistribution).mul(0.88)),
    0, 1,
  )
  // Water pools in hollows and drains off crests, so the film has depth even
  // when coverage is total. That gradient is most of what separates wet rock
  // from rock that has merely been darkened.
  const drainsOff = usesBakedSurface
    ? smoothstep(-0.25, 0.7, bakedHeight).mul(0.55).add(detail.height.mul(0.22).add(0.5).mul(0.45))
    : detail.height.mul(0.5).add(0.5)
  const filmDepth = clamp(wetMask.mul(oneMinus(drainsOff).mul(0.4).add(0.8)), 0, 1)

  // One fine vector-noise sample serves both the moss shoots and the snow
  // crust. They never share a fragment - snow buries moss - so the two layers
  // can draw their millimetre band from the same call, which is the difference
  // between paying for this structure once and paying for it twice.
  // Held in a variable, not re-derived. Every additional reference to a bare
  // node expression re-emits the call it came from, so a noise sample read in
  // six places is six noise evaluations - which is how a 1.2 ms sample turned
  // into 20 ms of frame time the moment lichen started reading from it too.
  const microBump = (lodLevel === 0 ? worldBump(56, 31.7) : vec3(0, 0, 0)).toVar()
  const microRelief = lodLevel === 0
    ? clamp(microBump.y.mul(0.55).add(detail.height.mul(0.14)).add(0.5), 0, 1)
    : clamp(detail.height.mul(0.5).add(0.5), 0, 1)

  // Moss. A volume with its own clumped surface, whose colour has to follow its
  // own height and never the stone's grain: reading pigment from detail.albedo
  // paints rock texture onto a plant, and with no relief of its own the layer
  // has nothing left but colour, which is the definition of green paint.
  const mossClump = coarseVarying(8.5, worldField(8.5, 5.1))
  const mossClumpGradient = coarseVarying(8.5, worldGradient(8.5, 0.03, 5.1).mul(0.6))
  const mossHabitat = clamp(shelter.mul(0.7).add(upward.mul(0.3)).add(wetMask.mul(0.22)), 0, 1)
  const mossPotential = macro.z.mul(0.45).add(0.55).mul(mossHabitat)
    .mul(biomeUniforms.moss.mul(3.4))
  // The boundary is cut out of the clump field, so it breaks into tufts at the
  // clump scale instead of fading uniformly. A feathered edge is the second
  // strongest procedural tell after even distribution.
  // A mat thins over several centimetres rather than ending at a line, so the
  // colony ramp is wide - but widening the ramp alone just composites half-
  // strength moss over a large area, which is a green tint, not a soft edge.
  // The transition is therefore dithered with the shoot field: locally the
  // surface is still either moss or rock, and what fades across the boundary is
  // how much of it is moss. That is also what a real edge does - the shoots get
  // sparser and the stone shows between them - so it reads soft from across the
  // scene and stays legible with the camera against it.
  const mossColony = smoothstep(0, 0.6, mossPotential.mul(1.25).sub(oneMinus(mossClump).mul(0.7)))
  const mossMask = smoothstep(
    0.28, 0.72,
    mossColony.mul(1.5).sub(0.25).sub(oneMinus(microRelief).mul(0.45)),
  )
  // A mat is close to one colour; what varies is how far light gets into it.
  let mossColor = mix(mossBody, mossDeep, oneMinus(smoothstep(0.15, 0.6, microRelief)).mul(0.45))
  mossColor = mix(mossColor, mossTip,
    smoothstep(0.7, 0.98, microRelief).mul(smoothstep(0.55, 0.92, mossClump)).mul(0.35))
  mossColor = mix(mossColor, mossDeep, wetMask.mul(0.3))

  // Crustose lichen. Discrete thalli with a hard margin, a pale growing rim and
  // an areolate interior. A smoothstep on a noise field has none of the three -
  // it can only make soft blobs, and a crust that fades out at its edge reads as
  // a stain, because a crust grows outward from a centre and stops.
  const lichenHabitat = upwardBroad.mul(oneMinus(shelter.mul(0.65))).mul(oneMinus(mossMask))
  //
  // Growing thalli outward from cell centres is what a 3D Worley lattice is for,
  // and it is unaffordable here: the 3D form searches a 27-cell neighbourhood
  // per fragment and measured 4 ms per call at 1280x960, three times the cost of
  // everything else in this material combined. A narrow threshold on a smooth
  // field buys the one property that actually separates a crust from a stain -
  // the hard margin - for a single noise evaluation. What it gives up is the
  // radial growth from a centre, so the outlines are irregular rather than
  // disc-like; the fine sample already taken for moss and snow crinkles the
  // margin, which is what keeps them from reading as round blobs.
  const lichenField = clamp(
    worldNoise(7, 11.6).mul(0.5).add(0.5).add(microBump.z.mul(0.07)),
    0, 1,
  )
  const lichenPotential = clamp(
    macro.w.mul(lichenHabitat).mul(biomeUniforms.lichen.mul(1.9)),
    0, 1,
  )
  // Colonies differ in size across the outcrop; that variation is coarse enough
  // to ride the vertex stage and therefore costs a fragment nothing.
  const thallusThreshold = oneMinus(lichenPotential).mul(0.5)
    .add(coarseVarying(1.6, worldField(1.6, 2.7)).mul(0.12))
    .add(0.24)
  const inside = lichenField.sub(thallusThreshold)
  // Crisper than moss, because a crust really does stop at a margin - but not a
  // single-fragment cut, which is what reads as a decal rather than as growth.
  const thallus = smoothstep(-0.04, 0.045, inside.add(microBump.x.mul(0.012)))
  // The growing rim is a band just inside the margin, not the margin itself.
  const growthMargin = smoothstep(0.13, 0.02, inside).mul(thallus)
  // Areolate interior: the absolute value of a noise field near zero is a network
  // of ridges, which is the cheapest honest crack network there is - and at
  // 1.8 cm the sample already in hand is the right scale for it.
  const areolaFissure = lodLevel === 0
    ? oneMinus(smoothstep(0.015, 0.085, microBump.z.abs()))
    : uniform(0)
  const areolaTone = clamp(microBump.z.mul(0.5).add(0.5), 0, 1)
  // A crust is a fraction of a millimetre thick and grows into what it is on:
  // it thins over exposed grain and over convex arrises, and old plates break up
  // and drop out. Coverage that ignores the substrate reads as a sticker however
  // good the outline is, because nothing underneath is interacting with it.
  const lichenGrip = clamp(
    oneMinus(detail.height.mul(0.5).add(0.5)).mul(0.5).add(0.62)
      .sub(usesBakedSurface ? smoothstep(0.35, 0.9, bakedCurvature).mul(0.3) : uniform(0)),
    0, 1,
  )
  // Old plates break up and drop out, letting the substrate back through the
  // middle of a colony while its margin keeps growing.
  const lichenDieback = smoothstep(0.46, 0.74, coarseVarying(4.2, worldField(4.2, 27.8)))
  const lichenMask = thallus
    .mul(lichenGrip)
    .mul(oneMinus(lichenDieback.mul(oneMinus(growthMargin)).mul(0.5)))
  const lichenSpecies = smoothstep(0.52, 0.68, coarseVarying(2.1, worldField(2.1, 19.4)))
  let lichenColor = mix(lichenBody, lichenCentre, areolaTone)
  lichenColor = mix(lichenColor, mix(lichenRustBody, lichenRustCentre, areolaTone),
    lichenSpecies.mul(0.72))
  lichenColor = mix(lichenColor, lichenFissure, areolaFissure.mul(0.55))
  lichenColor = mix(lichenColor, lichenMargin, growthMargin.mul(0.5))

  // Snow as a depth field. Coverage is depth minus local height, so a thin fall
  // settles into pits and joint lines first and leaves the ridges bare. That
  // competition with the rock's own relief is the entire effect; a mask keyed to
  // face angle knows nothing about the surface and can only paint it white.
  const relief = (usesBakedSurface ? bakedHeight.mul(0.44) : uniform(0))
    .add(detail.height.mul(0.08))
    // Granulate the edge with the sample already in hand. A snow line follows
    // the rock at centimetre scale, and without this band the coverage boundary
    // is as smooth as the fields feeding it, which cuts the drift out with
    // scissors.
    .add(microBump.x.mul(0.22))
  const snowDepth = upward.mul(0.92)
    // Shelter only helps where the face is not pointing down: a hollow catches
    // drift, the same hollow on an underside catches nothing.
    .add(shelter.mul(upwardBroad).mul(0.38))
    .mul(macro.z.mul(0.32).add(0.78))
    .mul(biomeUniforms.snow.mul(1.8))
  const snowMask = smoothstep(0.12, 0.38, snowDepth.sub(relief.mul(0.35).add(0.3)))
  // Drifts have their own surface, an order coarser than anything in the rock.
  const driftGradient = coarseVarying(5.5, worldGradient(5.5, 0.05, 4.2).mul(0.17))
  const snowColor = mix(snowShade, snowLit, smoothstep(0.1, 0.72, snowDepth))
    .mul(microBump.x.mul(0.05).add(0.98))

  // Composite in the order the layers physically sit: water into the stone, then
  // lichen on the rock, then moss over both, then snow over everything.
  //
  // Wet rock is the same rock, darker and cooler - not a grey wash. Multiplying
  // keeps the mineral variation legible under the film, and seeing the grain
  // through the water is what identifies it as water.
  stone = stone.mul(mix(vec3(1, 1, 1), vec3(0.38, 0.41, 0.44), filmDepth))
  stone = mix(stone, wetGranite, wetMask.mul(0.18))
  // Colonies differ in how far along they are, and a crust is thin enough to be
  // slightly translucent, so opacity varies between them.
  stone = mix(stone, lichenColor, lichenMask.mul(macro.z.mul(0.3).add(0.62)))
  stone = mix(stone, mossColor, mossMask)
  // Meltwater ring: snow too thin to cover still wets the rock around it, and
  // that dark rim is most of what stops a snow edge looking cut out.
  stone = mix(stone, wetGranite, smoothstep(0.02, 0.32, snowDepth).mul(oneMinus(snowMask)).mul(0.5))
  stone = mix(stone, snowColor, snowMask)
  material.colorNode = stone

  const decoded = usesBakedSurface
    ? tslNormalize(mix(normalLocal, normalAo.xyz.mul(2).sub(1), biomeUniforms.detailStrength))
    : normalLocal
  // What each layer buries. Snow lies over the rock and hides it almost
  // entirely; moss hides it completely where the mat is thick; lichen is a crust
  // a fraction of a millimetre thick, so it fills the finest grain and leaves the
  // rest; a water film fills the pits, which is why wet stone loses its
  // micro-sparkle before it loses its shape. Without this the layers are
  // transparent to the surface underneath and granite grain shows through snow.
  const covered = clamp(
    snowMask.mul(0.92).add(mossMask.mul(0.82)).add(lichenMask.mul(0.3)).add(filmDepth.mul(0.3)),
    0, 1,
  )
  // Meso undulation, 12 cm. Carried at the vertex stage, so it varies linearly
  // across a triangle rather than within one - it softens the read of a planar
  // joint face without being able to break it up, which is the honest limit of
  // a free band on a 7816-triangle mesh.
  const mesoView = viewOffset(coarseVarying(8, worldGradient(8, 0.032, 3.7).mul(0.2)))
  const mesoBuried = oneMinus(clamp(snowMask.mul(0.8).add(mossMask.mul(0.75)), 0, 1))
  material.normalNode = tslNormalize(
    transformNormalToView(decoded)
      .add(mesoView.mul(mesoBuried))
      .add(detail.viewNormalOffset
        .mul(oneMinus(covered))
        .mul(biomeUniforms.detailStrength.mul(0.65).add(0.35)))
      // Each layer supplies its own surface where it covers.
      .add(viewOffset(mossClumpGradient.add(microBump.mul(0.22))).mul(mossMask))
      .add(viewOffset(driftGradient.add(microBump.mul(0.07))).mul(snowMask)),
  )

  const macroAo = usesBakedSurface ? mix(0.7, 1, bakedAo) : uniform(1)
  let ao = macroAo
    .mul(mix(0.78, 1, detail.ambientOcclusion))
    // Moss occludes itself between its shoots and its clumps, which is where a
    // mat gets its depth: lit uniformly it reads as felt.
    .mul(oneMinus(mossMask.mul(oneMinus(microRelief)).mul(0.5)))
    .mul(oneMinus(mossMask.mul(oneMinus(mossClump)).mul(0.28)))
    // Lichen occludes only in its own fissures and just inside its margin.
    .mul(oneMinus(lichenMask.mul(areolaFissure).mul(0.38)))
  // Snow forward-scatters, so a drift is not occluded the way rock is. Lifting
  // occlusion back towards white is what stops thick snow from wearing the
  // shadow pattern of the stone buried underneath it.
  ao = mix(ao, uniform(1), snowMask.mul(0.7))
  material.aoNode = ao

  let roughness = mix(0.91, 0.55, wetMask)
  roughness = roughness.add(detail.roughness.sub(0.5).mul(0.18))
  // Standing water is smooth whatever lies beneath it, so the film gloss lands
  // after the per-crystal roughness rather than being averaged into it.
  roughness = mix(roughness, 0.11, filmDepth.mul(filmDepth).mul(biomeUniforms.wetness))
  // Each layer then takes over the specular response where it covers, so the
  // mineral speckle stops at the edge of a colony instead of glinting through it.
  roughness = mix(roughness, 0.94, lichenMask)
  roughness = mix(roughness, 0.92, mossMask)
  roughness = mix(roughness, 0.86, snowMask)
  // Crystal glint. The detail tile resolves 0.25 mm, the right scale for snow
  // facets, so its tone gives a specular break-up nothing else here can reach.
  roughness = roughness.sub(smoothstep(0.8, 0.97, detail.albedo).mul(snowMask).mul(0.4))
  material.roughnessNode = clamp(roughness, 0.06, 1)
  return material
}

/**
 * High-cost procedural reference retained for material authoring and future
 * offline baking. It is intentionally not used by the interactive runtime.
 */
function createProceduralReferenceMaterial(
  config: OutcropConfig,
  seed: number,
  bakeTextures: GraniteBakeTextures,
  lodLevel: OutcropConfig['lod'] = 0,
): MeshStandardNodeMaterial {
  const material = new MeshStandardNodeMaterial({
    name: 'fractured granite / high-to-low surface',
    roughness: 0.82,
    metalness: 0.02,
  })
  const biomeUniforms = {
    snow: uniform(config.snow),
    wetness: uniform(config.wetness),
    lichen: uniform(config.lichen),
    moss: uniform(config.moss),
    detailStrength: uniform(config.detailStrength),
    surfaceSeed: uniform(config.surfaceSeed ?? seed),
  }
  material.userData.graniteBiomeUniforms = biomeUniforms

  const detailTextures = requireGraniteDetail()
  const atlas = uv()
  const normalAo = texture(bakeTextures.normalAo, atlas)
  const heightCurvature = texture(bakeTextures.heightCurvature, atlas)
  const bakedHeight = heightCurvature.r.mul(2).sub(1)
  const bakedAo = normalAo.a
  const bakedCurvature = heightCurvature.g.mul(2).sub(1)

  if (config.diagnostic === 'normal') {
    material.colorNode = normalAo.xyz
    return material
  }
  if (config.diagnostic === 'ao') {
    material.colorNode = vec3(bakedAo, bakedAo, bakedAo)
    return material
  }
  if (config.diagnostic === 'uv') {
    material.colorNode = vec3(atlas.x, atlas.y, 0.2)
    return material
  }

  // Macro pigment only. Everything below roughly 3 cm now comes from the shared
  // detail tile, because the atlas resolves 6.5 mm per texel and no shader noise
  // band here ran finer than 24 mm wavelength - which is why the surface read as
  // mush from close range no matter how many octaves were stacked on it.
  const p = positionWorld
  const surfaceSeed = biomeUniforms.surfaceSeed

  // World-space scalar field and its gradient, from one definition so that a
  // layer's shading normal is guaranteed to be the gradient of the same height
  // the layer's own pigment is read from. Deriving the two from separate noise
  // calls is what makes an overlay light as though it were painted on a surface
  // that is not the one it appears to have.
  const worldNoise = (frequency: number, phase: number, offset?: ReturnType<typeof vec3>) =>
    mx_noise_float(
      (offset ? p.add(offset) : p).mul(frequency).add(surfaceSeed.mul(0.29).add(phase)),
    )
  const worldField = (frequency: number, phase: number) =>
    worldNoise(frequency, phase).mul(0.5).add(0.5)
  const worldGradient = (frequency: number, step: number, phase: number) => vec3(
    worldNoise(frequency, phase, vec3(step, 0, 0))
      .sub(worldNoise(frequency, phase, vec3(-step, 0, 0))),
    worldNoise(frequency, phase, vec3(0, step, 0))
      .sub(worldNoise(frequency, phase, vec3(0, -step, 0))),
    worldNoise(frequency, phase, vec3(0, 0, step))
      .sub(worldNoise(frequency, phase, vec3(0, 0, -step))),
  )
  // A vector of noise used directly as a surface perturbation instead of six
  // scalar samples finite-differenced into a true gradient. It is not the
  // gradient of any height field, so it is only correct where the eye cannot
  // follow the phase - fine fuzz, crust and wind texture, never a form. It
  // shares one lattice setup across all three components, so it costs about one
  // and a half noise evaluations where the gradient costs six.
  const worldBump = (frequency: number, phase: number) =>
    mx_noise_vec3(p.mul(frequency).add(surfaceSeed.mul(0.29).add(phase)))

  // Vertex-stage evaluation, which is enormously cheaper per fragment and sound
  // only below the mesh's own sampling rate. LOD0 carries 7816 triangles over
  // 11.4 m2, so an edge is about 5.4 cm and a varying can only hold features of
  // roughly 11 cm and up; anything finer is linearly interpolated across a
  // triangle, which is to say deleted. The limit is enforced rather than
  // documented because a field that is silently averaged away does not look
  // broken, it looks flat - a moss mat that has lost its shoots is simply
  // uniform green, with nothing to point at.
  const VARYING_CYCLES_PER_METRE = 9
  const coarseVarying = <T>(maxCyclesPerMetre: number, node: T): T => {
    if (maxCyclesPerMetre > VARYING_CYCLES_PER_METRE) {
      throw new Error(
        `granite material: ${maxCyclesPerMetre} cycles/m exceeds the ${VARYING_CYCLES_PER_METRE} cycles/m a varying can carry on this mesh`,
      )
    }
    return varying(node) as T
  }

  // Keep a perturbation tangential so it tilts the surface without pulling the
  // normal off the face it belongs to, then rotate it into view space. Rotated
  // with an explicit multiply, never transformDirection, which normalises its
  // result and would let any offset swamp the normal it is meant to nudge.
  const viewOffset = (worldVector: ReturnType<typeof vec3>) => cameraViewMatrix.mul(vec4(
    worldVector.sub(normalWorldGeometry.mul(worldVector.dot(normalWorldGeometry))),
    0,
  )).xyz

  // Weathering varies over centimetres or metres, so evaluating it once per
  // vertex is both faithful to its scale and dramatically cheaper than running
  // the full procedural graph for every close-up fragment. Pack related fields
  // into one varying to stay comfortably inside WebGPU's varying budget.
  const macroFields = coarseVarying(7.5, vec4(
    mx_noise_float(vec3(
      p.x.mul(0.72),
      p.y.mul(1.05),
      p.z.mul(0.72),
    ).add(surfaceSeed.mul(0.13))).mul(0.5).add(0.5),
    mx_noise_float(vec3(
      p.x.mul(2.8),
      p.y.mul(2.1),
      p.z.mul(2.8),
    ).add(surfaceSeed.mul(0.31))).mul(0.5).add(0.5),
    mx_noise_float(normalWorldGeometry.mul(7.4).add(surfaceSeed.mul(0.71)))
      .mul(0.5).add(0.5),
    mx_noise_float(vec3(
      p.x.mul(7.5),
      p.y.mul(0.85),
      p.z.mul(7.5),
    ).add(surfaceSeed.mul(0.44))).mul(0.5).add(0.5),
  ))
  const faceWeathering = macroFields.x
  const mottling = macroFields.y
  const faceIdentity = macroFields.z
  const seepStreak = macroFields.w

  // Crystal mosaic, projected at true physical size. Mineral identity, grain
  // relief and per-grain roughness all come from one cellular structure, so a
  // dark biotite fleck is simultaneously darker, rougher and slightly recessed -
  // the correlation between channels is most of what separates a scan from three
  // unrelated noise fields.
  // Strength is well under 1 on purpose. The tile's normals carry a true physical
  // slope over 0.62 mm of relief, which is correct for the surface and far too
  // much to apply at full weight under a rim light: every crystal returns its own
  // highlight and the rock reads as crusted rather than grained.
  const detail = graniteDetailSurface(detailTextures, {
    strength: lodLevel === 0 ? 1.15 : lodLevel === 1 ? 0.8 : 0.45,
  })
  const grainTone = detail.height.mul(0.5).add(0.5)

  // Dry alpine granite lives in a warm neutral range. The old blue-black
  // palette topped out around sRGB 65 and then received AO twice, which made
  // valid baked relief collapse into ink-black streaks under neutral light.
  const cavityDirt = color(0x302f29)
  const deepGranite = color(0x42423d)
  const granite = color(0x5b5851)
  const paleGranite = color(0x7b756c)
  const feldspar = color(0x8d7c6b)
  const plagioclase = color(0xb3aea3)
  const biotite = color(0x24251f)
  const wetGranite = color(0x2b302e)
  // Overlay palettes. Each layer needs a range rather than a single colour,
  // because on a scan the tonal variation inside a colony is what identifies it:
  // moss reads by light dying between its clumps, crustose lichen by the pale
  // growing margin against the darker areolate centre, snow by a warm lit face
  // against a distinctly blue shaded one.
  const mossDeep = color(0x222c14)
  const mossBody = color(0x41501f)
  const mossTip = color(0x64743a)
  const lichenBody = color(0x7f8768)
  const lichenCentre = color(0x99a07e)
  const lichenMargin = color(0xb4b6a1)
  const lichenFissure = color(0x4b4e3a)
  const lichenRustBody = color(0x8a6a34)
  const lichenRustCentre = color(0xa88f49)
  const snowLit = color(0xdee4ea)
  const snowShade = color(0x9aabbe)
  // Two ends of the weathering range that the previous single warm-neutral band
  // could not reach. Jointed rock exposes faces of very different ages: a fresh
  // spall is cool grey, a face that has drained for decades is iron-stained.
  const ironStain = color(0x6d5740)
  const bleached = color(0x9fa3a0)

  let stone = mix(deepGranite, granite, smoothstep(0.22, 0.82, faceWeathering))
  stone = mix(stone, paleGranite, smoothstep(0.58, 0.9, mottling).mul(0.2))

  // Per-face identity. The geometric normal is near-constant across a joint face
  // and jumps at every arris, so hashing it gives each face its own weathering
  // age for free - which is what makes adjacent planes read as different rock
  // rather than as one rock under different lighting.
  // Frequency matters more than amplitude here. The normal is a unit vector, so
  // a low frequency over the normal sphere resolves to two or three enormous
  // zones - which paints half the outcrop one colour instead of giving each
  // joint face its own weathering age.
  const stainedFace = smoothstep(0.52, 0.86, faceIdentity)
    .mul(smoothstep(0.3, 0.8, faceWeathering).mul(0.55).add(0.45))
  const bleachedFace = oneMinus(smoothstep(0.14, 0.46, faceIdentity))
    .mul(smoothstep(0.25, 0.75, mottling).mul(0.4).add(0.6))
  // Weathering shifts a face's hue; it does not repaint it. Above roughly 0.15
  // the stain stops reading as age and starts reading as two different rocks.
  stone = mix(stone, ironStain, stainedFace.mul(0.13))
  stone = mix(stone, bleached, bleachedFace.mul(0.1))

  // Mineral pigment, keyed to the tile's grain classes rather than to three more
  // noise thresholds. Weights sum to 1 across the four classes, so this is a
  // selection between crystals, not an accumulation of tints.
  // A ramp, not four masks. The tile's tone channel is continuous, so crystals
  // vary within a mineral and within themselves; tinting through the ends of the
  // ramp keeps the per-crystal contrast well below what a texture viewer
  // suggests, which is where a photogrammetry granite actually sits.
  stone = mix(stone, biotite, oneMinus(smoothstep(0.06, 0.3, detail.albedo)).mul(0.24))
  stone = mix(stone, feldspar, smoothstep(0.46, 0.68, detail.albedo).mul(0.14))
  stone = mix(stone, plagioclase, smoothstep(0.7, 0.9, detail.albedo).mul(0.18))

  if (lodLevel === 0) {
    // Let measured relief affect pigment as it does on a scan: exposed grain
    // catches pale abrasion while pinholes retain dark mineral fines.
    const reliefCrest = smoothstep(0.12, 0.62, bakedHeight)
      .mul(smoothstep(0.42, 0.78, grainTone).mul(0.45).add(0.55))
    const reliefPit = oneMinus(smoothstep(-0.62, -0.1, bakedHeight))
    stone = mix(stone, paleGranite, reliefCrest.mul(0.12))
    stone = mix(stone, cavityDirt, reliefPit.mul(0.17))
  }

  // Exposed arrises abrade pale. Recess pigment is deliberately subtle because
  // ambient occlusion below already supplies the physical light loss.
  const abrasionMask = lodLevel === 0
    ? smoothstep(0.18, 0.82, bakedCurvature)
      .mul(smoothstep(0.28, 0.88, mottling).mul(0.35).add(0.65))
    : smoothstep(0.68, 0.92, mottling).mul(0.35)
  const cavityMask = lodLevel === 0
    ? oneMinus(bakedAo).mul(0.7)
      .add(oneMinus(smoothstep(-0.72, -0.08, bakedCurvature)).mul(0.3))
    : smoothstep(0.8, 0.96, oneMinus(mottling)).mul(0.12)
  const surfaceAo = lodLevel === 0 ? bakedAo : uniform(1)
  stone = mix(stone, paleGranite, abrasionMask.mul(0.22))
  stone = mix(stone, cavityDirt, cavityMask.mul(0.2))
  if (lodLevel > 0) {
    // Coarse connectivity cannot safely interpolate the LOD0 atlas across its
    // larger triangles, so retain distant face definition procedurally.
    stone = mix(stone, deepGranite, oneMinus(mottling).mul(0.13))
    stone = mix(stone, paleGranite, mottling.mul(0.08))
  }

  // Centimetre-scale fracture network.
  //
  // The tile's grain boundaries are 3 to 6 mm and so are sub-pixel beyond about
  // a metre. That is correct - forcing them to survive mipping only aliases them
  // - but it leaves the asset with no crack the eye can find at normal viewing
  // distance. Fractures that read at that range are one to two orders larger and
  // are a different feature entirely: frost-driven hairline joints, not crystal
  // contacts. They are evaluated in world space rather than baked into the tile,
  // because a 16 cm feature inside a 25.6 cm tile repeats as a visible grid.
  // Evaluated per fragment, unlike the low-frequency weathering above. A Worley
  // field is a distance to a cell site and its whole value is the ridge where
  // two cells meet; interpolating it across a triangle averages the ridge away
  // and leaves a smooth blob. That holds at any frequency, so cellular fields
  // are excluded from the varying budget by kind rather than by wavelength.
  const crackCells = mx_worley_noise_vec2(p.mul(6.2).add(surfaceSeed.mul(0.37)), 1)
  const crackEdge = oneMinus(smoothstep(0, 0.05, crackCells.y.sub(crackCells.x)))
  // The hairline tier is 6 cm and gone by a couple of metres, so the coarse LODs
  // do not pay for it.
  const hairlineEdge = lodLevel === 0
    ? oneMinus(smoothstep(0, 0.07, (() => {
      const cells = mx_worley_noise_vec2(p.mul(15.5).add(surfaceSeed.mul(0.53)), 1)
      return cells.y.sub(cells.x)
    })()))
    : uniform(0)
  // Fractures run in patches along the joint sets. An even network over every
  // face is the crazed-glaze failure again, one scale up.
  // Reuse the macro fields as independent fracture gates. This keeps the same
  // patch/run hierarchy without spending another interpolator on two more
  // low-frequency noise evaluations.
  const crackRegion = smoothstep(0.34, 0.66, faceWeathering)
  // Break the network along its length. A complete Voronoi web reads as crazing
  // because real fractures terminate: they run, die out, and resume offset.
  const crackRun = smoothstep(0.36, 0.68, mottling)
  const crack = crackEdge.mul(crackRun)
    .add(hairlineEdge.mul(oneMinus(crackRun).mul(0.7).add(0.3)).mul(0.5))
    .mul(crackRegion).mul(0.9)
  stone = mix(stone, cavityDirt, crack.mul(0.6))

  // ---------------------------------------------------------------------------
  // Surface overlays.
  //
  // Each of these is a physical layer, not a tint: it has a coverage field, its
  // own shading normal, its own roughness, and it occludes the stone beneath it
  // so the grain stops showing through where it sits. The previous version mixed
  // three colours into the albedo and left normal, roughness and occlusion
  // untouched, which is precisely the definition of paint - the specular
  // response and the relief still belong to bare rock, and the eye reads that
  // contradiction long before it reads the colour.
  //
  // All three are gated by an independent low-frequency region field. Even
  // coverage across every eligible face is the strongest procedural tell in the
  // reference photographs: real colonies are patchy and leave large clean areas
  // of rock between them.
  const upward = smoothstep(0.35, 0.85, normalWorldGeometry.y)
  const upwardBroad = smoothstep(-0.1, 0.62, normalWorldGeometry.y)
  const overhang = smoothstep(0.12, 0.72, normalWorldGeometry.y.negate())
  // Concavity, from the measured atlas occlusion at LOD0 and from the same
  // procedural stand-in the cavity pigment uses beyond it, so colonies localise
  // identically at every LOD instead of redistributing as the mesh coarsens.
  const shelter = clamp(cavityMask.mul(1.25).add(oneMinus(surfaceAo).mul(0.55)), 0, 1)

  // Wetness. Water runs down faces, gathers in shelter and wicks along cracks.
  // The old mask keyed damp to absolute world Y, which drew one horizontal band
  // across a whole scene of independently placed rocks regardless of their
  // shape - the giveaway being that it ignored the geometry entirely.
  const runoff = clamp(
    oneMinus(upward).mul(smoothstep(0.42, 0.86, seepStreak)).mul(0.65)
      .add(shelter.mul(0.7))
      .add(crack.mul(0.45)),
    0, 1,
  )
  // The drainage pattern decides the order surfaces wet in; at full wetness it
  // has to be gone entirely, because a soaked rock is soaked everywhere. Scaling
  // the pattern by the knob instead only ever darkens the same stencil, so 100%
  // reads as a strong version of "damp in the usual places" rather than as rain.
  const wetMask = clamp(biomeUniforms.wetness.mul(1.6).sub(oneMinus(runoff).mul(0.95)), 0, 1)
  // Water still drains off crests and stands in hollows, so the film has depth
  // even once coverage is total. That gradient is most of what separates wet
  // rock from rock that has simply been made darker.
  const drainsOff = lodLevel === 0
    ? smoothstep(-0.25, 0.7, bakedHeight).mul(0.55).add(detail.height.mul(0.22).add(0.5).mul(0.45))
    : detail.height.mul(0.5).add(0.5)
  const filmDepth = clamp(wetMask.mul(oneMinus(drainsOff).mul(0.4).add(0.8)), 0, 1)

  // Moss. A volume with its own soft clumped surface: light scatters off the
  // tops of the clumps and dies in the gaps, so every tonal cue has to follow
  // the moss's own height field. Reading its colour from the stone's grain, as
  // the previous version did, paints rock texture onto a plant.
  //
  // The structure that identifies a moss mat is an order finer than its clumps:
  // individual shoots a few millimetres across, read entirely as shadow between
  // them. Without that band the layer has nothing between 5 cm clumps and the
  // rock's own grain, so all its variation has to come out of the albedo - and
  // colour variation with no matching relief is the definition of green paint.
  // This is the same argument that made the rock need a 0.25 mm detail tile,
  // applied to the thing growing on it.
  // The clump form is 12 cm and its gradient is a real gradient, so both ride
  // the vertex stage. The shoots cannot: at 1 cm they are far below the triangle
  // edge, and they are the entire reason a mat reads as a mat.
  const mossFields = coarseVarying(8.5, vec4(
    worldNoise(8.5, 5.1).mul(0.34).add(0.5),
    worldField(0.8, 1.9),
    worldField(2.3, 33.1),
    0,
  ))
  const mossClump = clamp(mossFields.x, 0, 1)
  const mossClumpGradient = coarseVarying(8.5, worldGradient(8.5, 0.03, 5.1).mul(0.62))
  // One vector-noise call per fragment carries both the shoot relief and the
  // shading it produces, and the two are therefore in phase. The tile supplies
  // the sub-millimetre end, which no procedural band on this mesh can reach.
  const mossShootBump = lodLevel === 0 ? worldBump(56, 31.7) : vec3(0, 0, 0)
  const mossShoots = lodLevel === 0
    ? clamp(mossShootBump.y.mul(0.55).add(detail.height.mul(0.14)).add(0.5), 0, 1)
    : clamp(detail.height.mul(0.5).add(0.5), 0, 1)
  const mossRegion = smoothstep(0.42, 0.72, mossFields.y)
  const mossHabitat = clamp(
    shelter.mul(0.6).add(upward.mul(0.28)).add(wetMask.mul(0.3))
      .sub(overhang.mul(0.4)),
    0, 1,
  )
  const mossPotential = mossRegion.mul(mossHabitat.mul(0.85).add(0.15))
    .mul(biomeUniforms.moss.mul(2.2))
  // The boundary is cut out of the clump field itself, so it breaks into tufts
  // at the clump scale rather than fading out uniformly. A feathered edge is the
  // second-strongest procedural tell after even distribution.
  const mossMask = smoothstep(0.12, 0.34, mossPotential.mul(1.35).sub(oneMinus(mossClump).mul(0.95)))
  // A mat is close to one colour. What varies is how much light reaches into it,
  // which is carried by the normal and the occlusion below, not here: the pigment
  // stays near the body tone and only the extremes of the shoot field move it.
  let mossColor = mix(mossBody, mossDeep, oneMinus(smoothstep(0.15, 0.6, mossShoots)).mul(0.45))
  mossColor = mix(mossColor, mossTip, smoothstep(0.7, 0.98, mossShoots).mul(smoothstep(0.55, 0.9, mossClump)).mul(0.35))
  mossColor = mix(mossColor, mossDeep, wetMask.mul(0.35))

  // Crustose lichen. Discrete thalli with a hard edge, a pale growing margin and
  // an areolate - cracked-plate - interior. A smoothstep on a noise field, which
  // is what this was, has none of those three: it can only make soft blobs, and
  // a soft-edged lichen is recognisably wrong at any distance because a crust
  // grows outward from a centre and stops.
  // The cell lattice is warped before the distance is taken, which is what turns
  // circular discs into lobed outlines. An unwarped Worley thallus is a perfect
  // circle, and a field of perfect circles reads as decals however good the
  // interior is.
  const lichenWarp = worldBump(19, 3.2)
  // Per fragment for the same reason as the fracture network, and more acutely:
  // the hard margin is the single feature that distinguishes a crust from a
  // stain, and it exists only in the discontinuity of the distance field.
  const lichenCells = mx_worley_noise_vec2(
    p.mul(7.2).add(lichenWarp.mul(0.17)).add(surfaceSeed.mul(1.17)),
    1,
  )
  // Colonies differ in size and some cells carry none at all, so the thallus
  // radius is a field rather than a constant - and it varies at the scale of a
  // single colony as well as across the outcrop, so neighbours differ.
  const lichenFields = coarseVarying(2.7, vec3(
    worldField(1.6, 2.7),
    worldField(1.05, 11.6),
    worldField(2.1, 19.4),
  ))
  // Radius varies across the outcrop from the vertex stage and within a single
  // colony from the warp already sampled for the outline, so neighbouring
  // thalli differ in size at no additional cost.
  const thallusRadius = lichenFields.x.mul(0.26).add(lichenWarp.z.mul(0.08)).add(0.2)
  const thallusEdge = lichenCells.x.sub(thallusRadius)
  const thallus = oneMinus(smoothstep(-0.035, 0.012, thallusEdge))
  const growthMargin = smoothstep(-0.09, -0.02, thallusEdge).mul(thallus)
  // Areolae are 2.6 cm and invisible past a metre or so, so only LOD0 pays.
  const areolaCells = lodLevel === 0
    ? mx_worley_noise_vec2(p.mul(38).add(surfaceSeed.mul(0.83)), 1)
    : vec2(0.5, 0.9)
  const areolaFissure = oneMinus(smoothstep(0, 0.1, areolaCells.y.sub(areolaCells.x)))
  const areolaTone = smoothstep(0.08, 0.55, areolaCells.x)
  const lichenRegion = smoothstep(0.34, 0.72, lichenFields.y)
  // Lichen wants light and air, which puts it on exactly the faces moss is not
  // on. Making the two compete rather than distributing them independently is
  // what stops them overlapping into a uniform mottle.
  const lichenHabitat = clamp(
    upwardBroad.mul(0.45).add(0.55)
      .mul(oneMinus(shelter.mul(0.7)))
      .mul(oneMinus(wetMask.mul(0.55))),
    0, 1,
  )
  const lichenPotential = lichenRegion.mul(lichenHabitat).mul(biomeUniforms.lichen.mul(1.8))
  // A crust is a fraction of a millimetre thick and grows into the rock it is
  // on: it thins over exposed grain and holds in the hollows, and old centres
  // die back and let the substrate through. Coverage that ignores the surface
  // beneath it is what makes lichen read as a sticker - the outline can be
  // perfect and it will still look applied, because nothing under it is
  // interacting with it.
  const lichenGrip = clamp(
    oneMinus(detail.height.mul(0.5).add(0.5)).mul(0.5).add(0.62)
      .sub(lodLevel === 0 ? smoothstep(0.35, 0.9, bakedCurvature).mul(0.3) : uniform(0)),
    0, 1,
  )
  // Dieback keys off the areolate structure that is already sampled: plates
  // break up and drop out, so the two are physically the same process and the
  // correlation costs nothing.
  const lichenDieback = smoothstep(0.25, 0.6, areolaCells.x)
  const lichenMask = thallus
    .mul(smoothstep(0.22, 0.7, lichenPotential))
    .mul(lichenGrip)
    .mul(oneMinus(lichenDieback.mul(smoothstep(0.1, 0.35, thallusEdge.negate())).mul(0.55)))
    .mul(oneMinus(mossMask))
  const lichenSpecies = smoothstep(0.52, 0.68, lichenFields.z)
  let lichenColor = mix(lichenBody, lichenCentre, areolaTone)
  lichenColor = mix(
    lichenColor,
    mix(lichenRustBody, lichenRustCentre, areolaTone),
    lichenSpecies.mul(0.72),
  )
  lichenColor = mix(lichenColor, lichenFissure, areolaFissure.mul(0.6))
  lichenColor = mix(lichenColor, lichenMargin, growthMargin.mul(0.5))

  // Snow as a depth field rather than a coverage mask.
  //
  // Depth accumulates on upward faces and in concavities, then competes with the
  // stone's own relief: the surface is covered only where depth exceeds the
  // local height, so a thin fall settles into pits and joint lines first and
  // leaves the ridges bare. That competition is the whole effect. A mask keyed
  // to face angle alone, which is what this was, can only ever produce white
  // paint with a soft edge, because nothing in it knows what the rock is doing.
  const snowFields = coarseVarying(3.4, vec3(
    worldNoise(1.7, 13.9),
    worldNoise(3.4, 6.6),
    worldField(1.3, 4.2),
  ))
  // Wind crust: 1.5 cm, so it has to be per fragment, and one call serves both
  // the surface it makes and the tone break-up that comes with it. Without it
  // snow renders as moulded plastic.
  const snowCrust = lodLevel === 0 ? worldBump(64, 51.4) : vec3(0, 0, 0)
  const reliefHeight = (lodLevel === 0 ? bakedHeight.mul(0.5) : uniform(0))
    .add(detail.height.mul(0.06))
    .add(snowFields.x.mul(0.3))
    .add(snowFields.y.mul(0.24))
  const snowResistance = clamp(reliefHeight.mul(0.4).add(0.36), 0.06, 1)
  const driftRegion = snowFields.z
  const snowDepth = clamp(
    // Shelter only helps where the face is not pointing down: a hollow catches
    // drift, but the same hollow on an underside catches nothing, and without
    // this the accumulation term hangs snow off the overhangs.
    upward.mul(0.95).add(shelter.mul(0.5).mul(upwardBroad))
      .mul(driftRegion.mul(0.5).add(0.5))
      .sub(overhang.mul(0.55))
      .mul(biomeUniforms.snow.mul(1.9)),
    0, 1.4,
  )
  const snowMask = smoothstep(0, 0.3, snowDepth.sub(snowResistance))
  // Drifts have their own smooth surface, an order coarser than anything in the
  // rock. Below it the stone's normal is suppressed, so accumulation reads as
  // something lying on the rock rather than as the rock changing colour.
  const driftGradient = coarseVarying(5.5, worldGradient(5.5, 0.05, 4.2).mul(0.17))
  const snowColor = mix(snowShade, snowLit, smoothstep(0.1, 0.72, snowDepth))
    .mul(snowCrust.x.mul(0.05).add(0.98))

  // Composite in the order the layers physically sit: water into the stone,
  // then lichen on the rock, then moss over both, then snow over everything.
  // Wet rock is the same rock, darker and cooler - not a grey wash. Multiplying
  // keeps the mineral variation legible under the film, and seeing the grain
  // through the water is what identifies it as water. Mixing towards a flat
  // colour erases the very detail the film is supposed to be lying on, which is
  // why the old version stopped looking wetter and just looked greyer.
  stone = stone.mul(mix(vec3(1, 1, 1), vec3(0.38, 0.41, 0.44), filmDepth))
  stone = mix(stone, wetGranite, wetMask.mul(0.18))
  // A crust is thin enough to be slightly translucent, and colonies differ in
  // how far along they are, so opacity varies between them. Compositing every
  // thallus at full strength is the last thing that keeps them looking applied.
  const lichenOpacity = mossFields.z.mul(0.3).add(0.62)
  stone = mix(stone, lichenColor, lichenMask.mul(lichenOpacity))
  stone = mix(stone, mossColor, mossMask)
  // Meltwater ring. Snow that is thin enough not to cover still wets the rock
  // immediately around it, and that dark rim is most of what stops a snow edge
  // looking cut out.
  const meltRing = smoothstep(0.02, 0.32, snowDepth).mul(oneMinus(snowMask))
  stone = mix(stone, wetGranite, meltRing.mul(0.5))
  stone = mix(stone, snowColor, snowMask)
  material.colorNode = stone

  // The whole point of the pipeline: the object-space bake supplies the shading
  // normal, so relief the reduction removed still lights correctly on 9k
  // triangles. Object space avoids any tangent-basis agreement with the baker.
  {
    // The high-to-low normal remains dominant, but retaining a little of the
    // reduced mesh normal prevents near-tangent bake texels from turning broad
    // faces into black brush strokes under a raking light.
    const decoded = lodLevel === 0
      ? tslNormalize(mix(normalLocal, normalAo.xyz.mul(2).sub(1), biomeUniforms.detailStrength))
      : normalLocal

    // The macro normal is transformed by the normal matrix, which is the only
    // transform correct under the cliff scene's non-uniform placement scales.
    // The detail perturbation is a world-space difference rotated into view by
    // the view matrix, which is exact because that matrix carries no scale - so
    // the two compose without either one being evaluated in the wrong space.
    const macroView = transformNormalToView(decoded)

    // What each overlay buries. Snow lies over the rock and hides it almost
    // entirely; moss hides it completely where the mat is thick; lichen is a
    // crust a fraction of a millimetre thick, so it fills the finest grain
    // relief and leaves the rest. Without this term the layers are transparent
    // to the surface underneath, and granite grain visibly shows through snow.
    const buried = oneMinus(clamp(
      // A water film fills the finest pits, which is why wet stone loses its
      // micro-sparkle before it loses its shape.
      snowMask.mul(0.9).add(mossMask.mul(0.85)).add(lichenMask.mul(0.3))
        .add(filmDepth.mul(0.3)),
      0, 1,
    ))
    // Meso band: 4 to 10 cm undulation, a few millimetres deep. This is the band
    // that hides the fact that a joint face is planar, and it is the one band a
    // varying can never carry - a field interpolated across a triangle is linear
    // over that triangle, which is exactly the flatness it exists to break up.
    // The coarse octave is a true gradient from the vertex stage; the fine one
    // is vector noise, which is affordable per fragment and indistinguishable
    // here because there is no form for the eye to follow at 4 cm.
    const mesoStrength = lodLevel === 0 ? 1 : lodLevel === 1 ? 0.8 : 0.55
    const mesoView = viewOffset(
      coarseVarying(8, worldGradient(8, 0.032, 3.7).mul(0.22))
        .add(worldBump(24, 11.2).mul(0.1))
        .mul(mesoStrength),
    )
    // Meso undulation survives under lichen and thin snow - a crust follows the
    // form it grows on - but not under a moss mat, which has its own form.
    const mesoBuried = oneMinus(clamp(snowMask.mul(0.8).add(mossMask.mul(0.75)), 0, 1))
    const perturbed = tslNormalize(
      macroView
        .add(mesoView.mul(mesoBuried))
        .add(detail.viewNormalOffset.mul(buried))
        .add(viewOffset(mossClumpGradient.add(mossShootBump.mul(0.22))).mul(mossMask))
        .add(viewOffset(driftGradient.add(snowCrust.mul(0.07))).mul(snowMask)),
    )
    material.normalNode = perturbed
  }
  // Preserve contact/cavity depth without multiplying the darkest bake texels
  // all the way to black. Albedo already carries a small amount of recess dirt.
  // The tile's own occlusion supplies the contact shadow inside grain boundaries
  // and pits, which is far below the atlas's 6.5 mm texel and cannot be baked.
  const macroAo = lodLevel === 0 ? mix(0.68, 1, bakedAo) : uniform(1)
  // The stone's own fine occlusion is covered by whatever lies on top of it.
  const stoneCovered = clamp(snowMask.add(mossMask).add(lichenMask.mul(0.6)), 0, 1)
  let aoNode = macroAo
    .mul(mix(1, detail.ambientOcclusion, oneMinus(stoneCovered).mul(0.35)))
    .mul(oneMinus(crack.mul(0.55).mul(oneMinus(stoneCovered))))
    // Moss occludes itself between the clumps, which is where its depth comes
    // from: a mat lit uniformly reads as green felt.
    .mul(oneMinus(mossMask.mul(oneMinus(mossShoots)).mul(0.55)))
    .mul(oneMinus(mossMask.mul(oneMinus(mossClump)).mul(0.3)))
    // Lichen occludes only in its own fissures and just inside its margin.
    .mul(oneMinus(lichenMask.mul(areolaFissure).mul(0.4)))
    .mul(oneMinus(lichenMask.mul(growthMargin).mul(0.12)))
  // Snow is strongly forward-scattering, so a drift is not occluded the way rock
  // is. Lifting occlusion back towards white under cover is what keeps thick
  // snow from taking on the shadow pattern of the stone buried beneath it.
  aoNode = mix(aoNode, aoNode.mul(0.3).add(0.7), snowMask)
  material.aoNode = aoNode

  let roughnessNode = mix(0.93, 0.52, wetMask)
  // Per-grain roughness around a nominal 0.5: quartz reads glassier, biotite and
  // boundary cracks read matte. This is what produces a mineral speckle in the
  // highlight instead of one uniform sheen across the whole face.
  roughnessNode = roughnessNode.add(detail.roughness.sub(0.5).mul(0.2))
  roughnessNode = roughnessNode.sub(abrasionMask.mul(0.045)).add(crack.mul(0.05))
  if (lodLevel === 0) roughnessNode = roughnessNode.add(bakedHeight.mul(0.025))
  // Each layer takes over the specular response completely where it covers, so
  // the mineral speckle above stops at the edge of the colony rather than
  // glinting through it. Lichen is chalky, moss is the most diffuse surface on
  // the rock, snow is smoother than either.
  // Standing water is smooth regardless of the grain beneath it, so this lands
  // after the per-crystal roughness rather than being averaged with it.
  roughnessNode = mix(
    roughnessNode,
    0.11,
    filmDepth.mul(filmDepth).mul(biomeUniforms.wetness),
  )
  roughnessNode = mix(roughnessNode, 0.94, lichenMask)
  roughnessNode = mix(roughnessNode, 0.92, mossMask)
  roughnessNode = mix(roughnessNode, 0.86, snowMask)
  // Crystal glint. The detail tile resolves 0.25 mm, which is the right scale
  // for individual snow facets, so reusing its tone as a sparkle mask gives snow
  // a specular break-up no noise band in this material is fine enough to supply.
  roughnessNode = roughnessNode.sub(
    smoothstep(0.8, 0.97, detail.albedo).mul(snowMask).mul(0.4),
  )
  material.roughnessNode = clamp(roughnessNode, 0.05, 1)
  return material
}

function createGeometries(
  topology: CompiledTopology,
  seed: number,
): GraniteGeometrySet {
  const allPositions = materializePositions(topology, seed)
  const allUvs = topology.bakeUvs
  const vertexCount = allPositions.length / 3
  const create = (lod: OutcropConfig['lod']) => {
    const sourceIndices = indicesFor(topology, lod)
    const remap = new Int32Array(vertexCount).fill(-1)
    let compactVertexCount = 0
    for (const sourceIndex of sourceIndices) {
      if (remap[sourceIndex] !== -1) continue
      remap[sourceIndex] = compactVertexCount
      compactVertexCount += 1
    }

    const positions = new Float32Array(compactVertexCount * 3)
    const bakeUvs = allUvs ? new Float32Array(compactVertexCount * 2) : undefined
    for (let sourceIndex = 0; sourceIndex < vertexCount; sourceIndex += 1) {
      const targetIndex = remap[sourceIndex]!
      if (targetIndex < 0) continue
      positions[targetIndex * 3] = allPositions[sourceIndex * 3]!
      positions[targetIndex * 3 + 1] = allPositions[sourceIndex * 3 + 1]!
      positions[targetIndex * 3 + 2] = allPositions[sourceIndex * 3 + 2]!
      if (bakeUvs && allUvs) {
        bakeUvs[targetIndex * 2] = allUvs[sourceIndex * 2]!
        bakeUvs[targetIndex * 2 + 1] = allUvs[sourceIndex * 2 + 1]!
      }
    }
    const localIndices = compactVertexCount <= 0xffff
      ? new Uint16Array(sourceIndices.length)
      : new Uint32Array(sourceIndices.length)
    for (let index = 0; index < sourceIndices.length; index += 1) {
      localIndices[index] = remap[sourceIndices[index]!]!
    }

    const geometry = new BufferGeometry()
    geometry.name = `${ASSET_ID} / compact LOD${lod}`
    geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
    if (bakeUvs) geometry.setAttribute('uv', new Float32BufferAttribute(bakeUvs, 2))
    geometry.setIndex(new BufferAttribute(localIndices, 1))
    geometry.computeVertexNormals()
    geometry.computeBoundingBox()
    geometry.computeBoundingSphere()
    return geometry
  }
  return [create(0), create(1), create(2)]
}

function materialize(
  topology: CompiledTopology,
  config: OutcropConfig,
  seed: number,
  representation: OutcropInstance['representation'],
  surfaceBake?: CompiledSurfaceBake,
  resourcePool?: GraniteResourcePool,
): OutcropInstance {
  const root = new Group()
  root.name = 'fractured granite outcrop'
  root.userData.terrain = {
    assetId: ASSET_ID,
    topologyKey: topology.topologyKey,
    recipeHash: topology.recipeHash,
    compilerHash: topology.compilerHash,
    seed,
    representation,
    lodWeights: config.lod === 0 ? [1, 0, 0] : config.lod === 1 ? [0, 1, 0] : [0, 0, 1],
  }
  const wantsBake = config.diagnostic !== 'wireframe' && Boolean(surfaceBake)
  const resources: SharedGraniteResources = resourcePool
    ? resourcePool.acquire(topology, seed, wantsBake ? surfaceBake : undefined)
    : (() => {
        const geometries = createGeometries(topology, seed)
        const bakeTextures = wantsBake ? createPackedBakeTextures(surfaceBake!) : undefined
        let released = false
        return {
          geometries,
          bakeTextures,
          release: () => {
            if (released) return
            released = true
            for (const geometry of geometries) geometry.dispose()
            disposeBakeTextures(bakeTextures)
          },
        }
      })()
  const geometries = resources.geometries
  const graniteMaterials = resources.bakeTextures
    ? geometries.map((_, level) => createGraniteMaterial(
        config,
        seed,
        resources.bakeTextures!,
        level as OutcropConfig['lod'],
      ))
    : undefined
  const materials = graniteMaterials ?? geometries.map(() => new MeshBasicMaterial({
    color: 0xb7d2d9,
    wireframe: config.diagnostic === 'wireframe',
  }))
  const initialWeights: LodWeights = config.lod === 0
    ? [1, 0, 0]
    : config.lod === 1
      ? [0, 1, 0]
      : [0, 0, 1]
  const ditherBoundaries = graniteMaterials
    ? [uniform(initialWeights[0]), uniform(initialWeights[0] + initialWeights[1])] as const
    : undefined
  if (graniteMaterials && ditherBoundaries) {
    // A single screen-space sample partitions each pixel between the three LODs.
    // Independent alphaHash calls use each mesh's different local position and
    // can therefore reject both meshes in the same pixel during a handoff.
    const screenHash = hash(viewportCoordinate.x.add(viewportCoordinate.y.mul(8192)))
    for (let level = 0; level < graniteMaterials.length; level += 1) {
      const coverage = level === 0
        ? screenHash.lessThan(ditherBoundaries[0])
        : level === 1
          ? screenHash.greaterThanEqual(ditherBoundaries[0])
            .and(screenHash.lessThan(ditherBoundaries[1]))
          : screenHash.greaterThanEqual(ditherBoundaries[1])
      const material = graniteMaterials[level]!
      material.opacityNode = coverage.select(1, 0)
      material.alphaTestNode = uniform(0.5)
      material.alphaHash = false
    }
  }
  const meshes = geometries.map((geometry, level) => {
    const mesh = new Mesh(geometry, materials[level]!)
    mesh.name = `reduced outcrop / LOD${level} / high-to-low materialized`
    mesh.castShadow = true
    mesh.receiveShadow = true
    mesh.visible = level === config.lod
    mesh.renderOrder = level
    root.add(mesh)
    return mesh
  })

  const lod1Error = topology.lods.find((candidate) => candidate.level === 1)?.maxGeometricError ?? 0
  const lod2Error = topology.lods.find((candidate) => candidate.level === 2)?.maxGeometricError ?? 0
  let weights: LodWeights = initialWeights
  const worldPosition = new Vector3()
  const cameraPosition = new Vector3()
  const worldScale = new Vector3()
  const applyWeights = (next: LodWeights) => {
    // Drop negligible layers, then renormalise the drawable partition. Without
    // this, the hidden layer would still own a thin interval of the dither and
    // leave actual holes even though the shader partition itself is complementary.
    const visibleWeights = drawableLodWeights(next)
    for (let level = 0; level < 3; level += 1) {
      const weight = visibleWeights[level]!
      meshes[level]!.visible = weight > 0.002
      materials[level]!.opacity = graniteMaterials ? 1 : weight
    }
    if (ditherBoundaries) {
      ditherBoundaries[0].value = visibleWeights[0]!
      ditherBoundaries[1].value = visibleWeights[0]! + visibleWeights[1]!
    }
  }
  applyWeights(weights)

  const updateLod = (
    deltaSeconds: number,
    camera: PerspectiveCamera,
    viewportHeight?: number,
  ) => {
    if (config.diagnostic !== 'beauty') return
    root.updateWorldMatrix(true, false)
    camera.updateWorldMatrix(true, false)
    root.getWorldPosition(worldPosition)
    camera.getWorldPosition(cameraPosition)
    root.getWorldScale(worldScale)
    const maximumInstanceScale = Math.max(Math.abs(worldScale.x), Math.abs(worldScale.y), Math.abs(worldScale.z))
    const distance = worldPosition.distanceTo(cameraPosition)
    const pixels = viewportHeight
      ?? (globalThis as { innerHeight?: number }).innerHeight
      ?? 1080
    const fov = camera.getEffectiveFOV()
    // maxGeometricError is in normalized domain units; 1.7m is the largest
    // materialization axis and therefore the conservative projection scale.
    const lod1Pixels = projectedErrorPixels(lod1Error * 1.7 * maximumInstanceScale, distance, fov, pixels)
    const lod2Pixels = projectedErrorPixels(lod2Error * 1.7 * maximumInstanceScale, distance, fov, pixels)
    const target = targetLodWeights(lod1Pixels, lod2Pixels, config.lod)
    weights = settleLodWeights(weights, target, Math.min(0.1, deltaSeconds))
    applyWeights(weights)
    root.userData.terrain.lodWeights = [...weights]
    root.userData.terrain.projectedErrors = [lod1Pixels, lod2Pixels]
  }

  let lastRenderFrame = -1
  let lastRenderTime = performance.now()
  for (const mesh of meshes) {
    mesh.onBeforeRender = (renderer, _scene, renderCamera) => {
      if (!(renderCamera as PerspectiveCamera).isPerspectiveCamera) return
      const frame = (renderer.info as unknown as { render: { frame: number } }).render.frame
      if (frame === lastRenderFrame) return
      lastRenderFrame = frame
      const now = performance.now()
      const deltaSeconds = Math.min(0.1, Math.max(0, (now - lastRenderTime) / 1_000))
      lastRenderTime = now
      const height = renderer.domElement.height || undefined
      updateLod(deltaSeconds, renderCamera as PerspectiveCamera, height)
    }
  }

  let disposed = false
  const configure: OutcropInstance['configure'] = (patch) => {
    const clamp01 = (value: number) => Math.min(1, Math.max(0, value))
    if (patch.snow !== undefined) config.snow = clamp01(patch.snow)
    if (patch.wetness !== undefined) config.wetness = clamp01(patch.wetness)
    if (patch.lichen !== undefined) config.lichen = clamp01(patch.lichen)
    if (patch.moss !== undefined) config.moss = clamp01(patch.moss)
    if (patch.detailStrength !== undefined) config.detailStrength = clamp01(patch.detailStrength)
    if (patch.surfaceSeed !== undefined && Number.isFinite(patch.surfaceSeed)) {
      config.surfaceSeed = patch.surfaceSeed
    }
    for (const material of materials) {
      const nodes = material.userData.graniteBiomeUniforms as GraniteBiomeUniforms | undefined
      if (!nodes) continue
      nodes.snow.value = config.snow
      nodes.wetness.value = config.wetness
      nodes.lichen.value = config.lichen
      nodes.moss.value = config.moss
      nodes.detailStrength.value = config.detailStrength
      nodes.surfaceSeed.value = config.surfaceSeed ?? seed
    }
    root.userData.terrain.biome = {
      snow: config.snow,
      wetness: config.wetness,
      lichen: config.lichen,
      moss: config.moss,
      detailStrength: config.detailStrength,
      surfaceSeed: config.surfaceSeed ?? seed,
    }
  }
  configure(config)
  return {
    root,
    topology,
    representation,
    configure,
    update: (deltaSeconds, camera, viewportHeight) => {
      if (camera) updateLod(deltaSeconds, camera, viewportHeight)
    },
    dispose: () => {
      if (disposed) return
      disposed = true
      for (const material of materials) material.dispose()
      resources.release()
    },
  }
}

export { materialize as createInstanceFromCompiled }

export async function createModel(options: OutcropOptions = {}): Promise<OutcropInstance> {
  const seed = Math.max(1, Math.floor(options.seed ?? 1))
  const config: OutcropConfig = {
    snow: Math.min(1, Math.max(0, options.snow ?? DEFAULT_CONFIG.snow)),
    wetness: Math.min(1, Math.max(0, options.wetness ?? DEFAULT_CONFIG.wetness)),
    lichen: Math.min(1, Math.max(0, options.lichen ?? DEFAULT_CONFIG.lichen)),
    moss: Math.min(1, Math.max(0, options.moss ?? DEFAULT_CONFIG.moss)),
    detailStrength: Math.min(1, Math.max(0, options.detailStrength ?? DEFAULT_CONFIG.detailStrength)),
    surfaceSeed: Number.isFinite(options.surfaceSeed) ? options.surfaceSeed : seed,
    lod: options.lod ?? DEFAULT_CONFIG.lod,
    diagnostic: options.diagnostic ?? DEFAULT_CONFIG.diagnostic,
  }
  const [compiled, compiledSurfaceBake] = await Promise.all([
    loadCompiledTopology(),
    loadCompiledSurfaceBake(),
    ensureGraniteDetail(),
  ])
  let representation: OutcropInstance['representation'] = 'compiled'
  const asset = createTerrainAsset<OutcropConfig, OutcropInstance>({
    assetId: ASSET_ID,
    recipeHash: RECIPE_HASH,
    compilerHash: COMPILER_HASH,
    defaultProfile: PROFILE,
    identify: (_config, _profile, request) => ({ topologyKey: topologyKeyFor(request.seed) }),
    compiled: [compiled],
    compiledSurfaceBakes: [compiledSurfaceBake],
    source: {
      build: async (request) => {
        const topology = compileTopology(request.seed, SOURCE_GRID_CELLS)
        const surfaceBake = compileSurfaceBakeFor(request.seed, SOURCE_GRID_CELLS)
        representation = 'source'
        return {
          instance: materialize(topology, request.config, request.seed, 'source', surfaceBake),
          compiled: topology,
          surfaceBake,
        }
      },
    },
    materialize: async (topology, request, surfaceBake) => materialize(
      topology,
      request.config,
      request.seed,
      representation,
      surfaceBake,
    ),
  })
  return asset.create({ config, seed, path: options.path ?? 'auto' })
}

async function preview(
  options: { aspect?: number; yaw?: number } = {},
  modelOptions: OutcropOptions = {},
): Promise<OutcropPreview> {
  const model = await createModel(modelOptions)
  // Recorder presentation scale only: topology, compiled artifacts, bake
  // identity, and public model dimensions remain unchanged.
  model.root.scale.setScalar(1.45)
  const scene = new Scene()
  scene.name = 'fractured granite outcrop / alpine preview'
  scene.background = new Color(0x1b2328)
  scene.add(model.root)

  const floorGeometry = new PlaneGeometry(20, 20)
  const floorMaterial = new MeshPhysicalMaterial({
    name: 'preview / alpine ground',
    color: 0x3a423d,
    roughness: 0.96,
    metalness: 0,
  })
  const floor = new Mesh(floorGeometry, floorMaterial)
  floor.name = 'preview / ground'
  floor.rotation.x = -Math.PI / 2
  floor.position.y = -0.012
  floor.receiveShadow = true
  floor.userData.excludeFromExport = true
  scene.add(floor)

  // Hard raking key light. Rock reads through relief, so the preview must not
  // wash the surface out with ambient the way the previous flat lighting did.
  // Budgeted for the shared ACES tonemap at exposure 1.15. The previous setup
  // summed to ~6.8 in light intensity, which clipped granite albedo into the
  // highlight rolloff and made every colour change invisible.
  const ambient = new AmbientLight(0xa8bcc6, 0.12)
  const hemisphere = new HemisphereLight(0xcfe0e6, 0x1d2420, 0.3)
  const key = new DirectionalLight(0xfff2dd, 1.9)
  key.position.set(-5.2, 5.4, 4.6)
  key.castShadow = true
  const fill = new DirectionalLight(0x8fb2c6, 0.3)
  fill.position.set(6.2, 2.4, 4.2)
  const rim = new DirectionalLight(0xc2d6e0, 0.55)
  rim.position.set(4.4, 4.2, -6.4)
  scene.add(ambient, hemisphere, key, fill, rim)

  // Orbitable, because a single fixed angle hid detached shells and holes on the
  // far side for several iterations.
  const camera = new PerspectiveCamera(33, options.aspect ?? 1, 0.05, 260)
  const yaw = ((options.yaw ?? 0) * Math.PI) / 180
  const radius = 5.8
  camera.position.set(Math.sin(yaw + 0.69) * radius, 2.35, Math.cos(yaw + 0.69) * radius)
  camera.lookAt(0, 0.95, 0)
  scene.add(camera)

  return {
    ...model,
    scene,
    camera,
    update: (deltaSeconds: number) => model.update(deltaSeconds, camera),
    dispose: () => {
      floorGeometry.dispose()
      floorMaterial.dispose()
      model.dispose()
    },
  }
}

function requestedPreviewOptions(): OutcropOptions {
  if (typeof window === 'undefined') return { seed: 1 }
  const params = new URLSearchParams(window.location.search)
  const requestedSeed = Number(params.get('seed') ?? 1)
  const requestedLod = Number(params.get('lod') ?? 0)
  const requestedPath = params.get('path')
  const view = params.get('view')
  return {
    seed: Number.isFinite(requestedSeed) ? Math.max(1, Math.floor(requestedSeed)) : 1,
    lod: requestedLod === 1 || requestedLod === 2 ? requestedLod : 0,
    diagnostic: view === 'wireframe' || view === 'normal' || view === 'ao' || view === 'uv'
      ? view
      : 'beauty',
    path: requestedPath === 'source' || requestedPath === 'compiled' ? requestedPath : 'auto',
  }
}

type RecorderPreviewOptions = OutcropOptions & { aspect?: number; yaw?: number; time?: number }

function recorderModelOptions(options: RecorderPreviewOptions): OutcropOptions {
  const result: OutcropOptions = {}
  const keys = [
    'seed', 'snow', 'wetness', 'lichen', 'moss', 'detailStrength', 'surfaceSeed', 'lod', 'diagnostic', 'path',
  ] as const
  for (const key of keys) {
    const value = options[key]
    if (value !== undefined) Object.assign(result, { [key]: value })
  }
  return result
}

export { compileStats }
export const createPreview = (options: RecorderPreviewOptions = {}) => preview(
  options,
  { ...requestedPreviewOptions(), ...recorderModelOptions(options) },
)
export const createBackPreview = (options: { aspect?: number } = {}) => preview({ ...options, yaw: 180 }, { seed: 1 })
export const createLeftPreview = (options: { aspect?: number } = {}) => preview({ ...options, yaw: 90 }, { seed: 1 })
export const createRightPreview = (options: { aspect?: number } = {}) => preview({ ...options, yaw: 270 }, { seed: 1 })
export const createSeed2Preview = (options: { aspect?: number } = {}) => preview(options, { seed: 2 })
export const createSeed3Preview = (options: { aspect?: number } = {}) => preview(options, { seed: 3 })
export const createSourcePreview = (options: { aspect?: number } = {}) => preview(options, { seed: 1, path: 'source' })
export const createWireframePreview = (options: { aspect?: number } = {}) => preview(options, { seed: 1, diagnostic: 'wireframe' })
export const createNormalPreview = (options: { aspect?: number } = {}) => preview(options, { seed: 1, diagnostic: 'normal' })
export const createAoPreview = (options: { aspect?: number } = {}) => preview(options, { seed: 1, diagnostic: 'ao' })
export const createLod1Preview = (options: { aspect?: number } = {}) => preview(options, { seed: 1, lod: 1 })
export const createLod2Preview = (options: { aspect?: number } = {}) => preview(options, { seed: 1, lod: 2 })
export const createSnowPreview = (options: { aspect?: number } = {}) => preview(options, {
  seed: 1,
  snow: 0.82,
  wetness: 0.08,
  moss: 0.04,
  lichen: 0.08,
})
export const createMossPreview = (options: { aspect?: number } = {}) => preview(options, {
  seed: 1,
  snow: 0,
  wetness: 0.48,
  moss: 0.88,
  lichen: 0.24,
  surfaceSeed: 7,
})
export const createLichenPreview = (options: { aspect?: number } = {}) => preview(options, {
  seed: 1,
  snow: 0,
  wetness: 0.1,
  moss: 0.1,
  lichen: 0.85,
  surfaceSeed: 3,
})
export const createWetPreview = (options: { aspect?: number } = {}) => preview(options, {
  seed: 1,
  snow: 0,
  wetness: 1,
  moss: 0.05,
  lichen: 0.1,
})
export const createDampPreview = (options: { aspect?: number } = {}) => preview(options, {
  seed: 1,
  snow: 0,
  wetness: 0.45,
  moss: 0.05,
  lichen: 0.1,
})
export const createOverlayClosePreview = async (options: { aspect?: number } = {}) => {
  const result = await preview(options, {
    seed: 1,
    surfaceSeed: 5,
    snow: 0.34,
    wetness: 0.22,
    moss: 0.6,
    lichen: 0.55,
  })
  result.camera.position.set(3.35, 2.05, 3.85)
  result.camera.lookAt(0, 0.95, 0)
  result.camera.updateProjectionMatrix()
  return result
}
export const createClosePreview = async (options: { aspect?: number } = {}) => {
  const result = await preview(options, { seed: 1, surfaceSeed: 1 })
  result.camera.position.set(2.45, 1.72, 2.95)
  result.camera.lookAt(0, 0.95, 0)
  result.camera.updateProjectionMatrix()
  return result
}
