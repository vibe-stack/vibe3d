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
  RGBAFormat,
  RedFormat,
  Scene,
  UnsignedByteType,
  Uint32BufferAttribute,
  Vector3,
} from 'three/webgpu'
import {
  color,
  mix,
  mx_noise_float,
  normalWorldGeometry,
  normalize as tslNormalize,
  oneMinus,
  positionWorld,
  smoothstep,
  texture,
  transformNormalToView,
  uniform,
  uv,
  vec3,
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
  projectedErrorPixels,
  settleLodWeights,
  targetLodWeights,
  type LodWeights,
} from './lod.ts'

export interface OutcropConfig {
  snow: number
  wetness: number
  lichen: number
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
  lod: 0,
  diagnostic: 'beauty',
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

interface GraniteMaterialResult {
  material: MeshStandardNodeMaterial
  textures: DataTexture[]
}

/**
 * Atlas channels are sampled with UVs, not projected. A triplanar projection
 * cannot carry a high-to-low bake: the bake is defined per atlas texel against a
 * specific surface point, so reading it by world position would decouple the
 * detail from the geometry it was measured on.
 */
function bakeTexture(
  bake: CompiledSurfaceBake,
  semantic: CompiledSurfaceBake['channels'][number]['semantic'],
): DataTexture | undefined {
  const channel = bake.channels.find((candidate) => candidate.semantic === semantic)
  if (!channel) return undefined
  let data = channel.data
  let format: typeof RedFormat | typeof RGBAFormat
  if (channel.components === 1) {
    format = RedFormat
  } else if (channel.components === 3) {
    // WebGPU has no three-component byte texture; expand to RGBA once here.
    const expanded = new Uint8Array(bake.width * bake.height * 4)
    for (let texel = 0; texel < bake.width * bake.height; texel += 1) {
      expanded[texel * 4] = channel.data[texel * 3]!
      expanded[texel * 4 + 1] = channel.data[texel * 3 + 1]!
      expanded[texel * 4 + 2] = channel.data[texel * 3 + 2]!
      expanded[texel * 4 + 3] = 255
    }
    data = expanded
    format = RGBAFormat
  } else {
    throw new Error(`${semantic} uses an unsupported runtime component count`)
  }
  const result = new DataTexture(data, bake.width, bake.height, format, UnsignedByteType)
  result.name = `${ASSET_ID} / ${semantic} / high-to-low bake`
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

function createGraniteMaterial(
  config: OutcropConfig,
  seed: number,
  bake: CompiledSurfaceBake,
): GraniteMaterialResult {
  const normalBake = bakeTexture(bake, 'normal-object')
  const heightBake = bakeTexture(bake, 'height')
  const aoBake = bakeTexture(bake, 'ambient-occlusion')
  const curvatureBake = bakeTexture(bake, 'curvature')
  const textures = [normalBake, heightBake, aoBake, curvatureBake]
    .filter((value): value is DataTexture => Boolean(value))

  const material = new MeshStandardNodeMaterial({
    name: 'fractured granite / high-to-low surface',
    roughness: 0.82,
    metalness: 0.02,
  })

  const atlas = uv()
  const bakedHeight = heightBake ? texture(heightBake, atlas).r.mul(2).sub(1) : undefined
  const bakedAo = aoBake ? texture(aoBake, atlas).r : undefined
  const bakedCurvature = curvatureBake ? texture(curvatureBake, atlas).r.mul(2).sub(1) : undefined

  if (config.diagnostic === 'normal' && normalBake) {
    material.colorNode = texture(normalBake, atlas).xyz
    return { material, textures }
  }
  if (config.diagnostic === 'ao' && bakedAo) {
    material.colorNode = vec3(bakedAo, bakedAo, bakedAo)
    return { material, textures }
  }
  if (config.diagnostic === 'uv') {
    material.colorNode = vec3(atlas.x, atlas.y, 0.2)
    return { material, textures }
  }

  // Granite mineral breakup. Kept subordinate to the bake: these are pigment
  // variations, not a substitute for relief, which is the mistake the previous
  // material made when world-space noise was all it had.
  const p = positionWorld
  const mineral = mx_noise_float(p.mul(9.5).add(seed * 0.37)).mul(0.5).add(0.5)
  const grain = mx_noise_float(p.mul(13.5).add(seed * 0.71)).mul(0.5).add(0.5)
  const veins = mx_noise_float(p.mul(2.1).add(seed * 0.13)).mul(0.5).add(0.5)

  const charcoal = color(0x191c1f)
  const granite = color(0x2b2f33)
  const paleGranite = color(0x3d4143)
  const feldspar = color(0x4a4741)
  const biotite = color(0x191d20)
  const lichen = color(0x6a7350)
  const snow = color(0xd2d8d8)

  let stone = mix(granite, paleGranite, smoothstep(0.35, 0.75, veins))
  stone = mix(stone, feldspar, smoothstep(0.58, 0.9, mineral).mul(0.25))
  stone = mix(stone, biotite, smoothstep(0.72, 0.97, grain).mul(0.22))

  if (bakedCurvature) {
    // Exposed arrises abrade pale; recesses hold darker mineral and dirt.
    stone = mix(stone, paleGranite, smoothstep(0.25, 0.85, bakedCurvature).mul(0.18))
    stone = mix(stone, charcoal, smoothstep(-0.15, -0.7, bakedCurvature).mul(0.4))
  }
  if (bakedAo) {
    stone = mix(stone, charcoal, oneMinus(bakedAo).mul(0.65))
  }

  const upward = smoothstep(0.35, 0.85, normalWorldGeometry.y)
  const lichenMask = smoothstep(0.5, 0.78, mx_noise_float(p.mul(5.5).add(seed * 0.91)).mul(0.5).add(0.5))
    .mul(config.lichen)
    .mul(bakedAo ? bakedAo : 1)
  const wetMask = oneMinus(smoothstep(0.1, 0.75, p.y)).mul(config.wetness)

  stone = mix(stone, lichen, lichenMask)
  stone = mix(stone, charcoal, wetMask.mul(0.45))
  if (config.snow > 0) {
    const snowMask = upward.mul(config.snow)
    stone = mix(stone, snow, snowMask)
  }
  material.colorNode = stone

  // The whole point of the pipeline: the object-space bake supplies the shading
  // normal, so relief the reduction removed still lights correctly on 9k
  // triangles. Object space avoids any tangent-basis agreement with the baker.
  if (normalBake) {
    const decoded = tslNormalize(texture(normalBake, atlas).xyz.mul(2).sub(1))

    // Sub-centimetre grain is added here rather than baked. A baked atlas has a
    // fixed texel count per object, so its density falls as 1/scale^2 and the
    // grain drops below the texture's Nyquist limit on large instances - the same
    // failure as the original mudball, moved into the texture domain. Evaluated
    // in world space it holds a constant real-world frequency at any size.
    const detailFrequency = 26
    const step = 0.012
    const grainAt = (offset: ReturnType<typeof vec3>) =>
      mx_noise_float(p.add(offset).mul(detailFrequency).add(seed * 0.29))
    const gradient = vec3(
      grainAt(vec3(step, 0, 0)).sub(grainAt(vec3(step.valueOf() * -1, 0, 0))),
      grainAt(vec3(0, step, 0)).sub(grainAt(vec3(0, step.valueOf() * -1, 0))),
      grainAt(vec3(0, 0, step)).sub(grainAt(vec3(0, 0, step.valueOf() * -1))),
    )
    // Remove the component along the normal so the perturbation is tangential.
    const tangential = gradient.sub(decoded.mul(gradient.dot(decoded)))
    const perturbed = tslNormalize(decoded.sub(tangential.mul(0.32)))
    material.normalNode = transformNormalToView(perturbed)
  }
  if (bakedAo) material.aoNode = bakedAo
  let roughnessNode = mix(0.88, 0.6, wetMask)
  if (bakedCurvature) roughnessNode = roughnessNode.sub(bakedCurvature.mul(0.1))
  if (bakedHeight) roughnessNode = roughnessNode.add(bakedHeight.mul(0.05))
  material.roughnessNode = roughnessNode
  return { material, textures }
}

function createGeometries(
  topology: CompiledTopology,
  seed: number,
): [BufferGeometry, BufferGeometry, BufferGeometry] {
  const position = new Float32BufferAttribute(materializePositions(topology, seed), 3)
  const domain = new Float32BufferAttribute(topology.domainCoordinates.slice(), 3)
  const stableIds = new Uint32BufferAttribute(topology.stableVertexIds.slice(), 1)
  const bakeUvs = topology.bakeUvs
    ? new Float32BufferAttribute(topology.bakeUvs.slice(), 2)
    : undefined
  const create = (lod: OutcropConfig['lod']) => {
    const geometry = new BufferGeometry()
    geometry.setAttribute('position', position)
    geometry.setAttribute('terrainDomain', domain)
    geometry.setAttribute('terrainStableVertexId', stableIds)
    if (bakeUvs) geometry.setAttribute('uv', bakeUvs)
    geometry.setIndex(new BufferAttribute(indicesFor(topology, lod).slice(), 1))
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
  }
  const geometries = createGeometries(topology, seed)
  const granite = config.diagnostic === 'wireframe' || !surfaceBake
    ? undefined
    : createGraniteMaterial(config, seed, surfaceBake)
  const baseMaterial = granite?.material ?? new MeshBasicMaterial({
    color: 0xb7d2d9,
    wireframe: config.diagnostic === 'wireframe',
  })
  const materials = geometries.map((_, level) => level === 0 ? baseMaterial : baseMaterial.clone())
  const fadeNodes = granite
    ? materials.map((material, level) => {
        const fade = uniform(level === config.lod ? 1 : 0)
        ;(material as MeshStandardNodeMaterial).opacityNode = fade
        material.alphaHash = true
        return fade
      })
    : undefined
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
  let weights: LodWeights = config.lod === 0 ? [1, 0, 0] : config.lod === 1 ? [0, 1, 0] : [0, 0, 1]
  const worldPosition = new Vector3()
  const cameraPosition = new Vector3()
  const worldScale = new Vector3()
  const applyWeights = (next: LodWeights) => {
    for (let level = 0; level < 3; level += 1) {
      const weight = next[level]!
      meshes[level]!.visible = weight > 0.002
      materials[level]!.opacity = weight
      if (fadeNodes) fadeNodes[level]!.value = weight
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
  return {
    root,
    topology,
    representation,
    update: (deltaSeconds, camera, viewportHeight) => {
      if (camera) updateLod(deltaSeconds, camera, viewportHeight)
    },
    dispose: () => {
      if (disposed) return
      disposed = true
      for (const geometry of geometries) geometry.dispose()
      for (const material of materials) material.dispose()
      for (const entry of granite?.textures ?? []) entry.dispose()
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
    lod: options.lod ?? DEFAULT_CONFIG.lod,
    diagnostic: options.diagnostic ?? DEFAULT_CONFIG.diagnostic,
  }
  const [compiled, compiledSurfaceBake] = await Promise.all([
    loadCompiledTopology(),
    loadCompiledSurfaceBake(),
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
  const camera = new PerspectiveCamera(33, options.aspect ?? 1, 0.05, 80)
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

export { compileStats }
export const createPreview = (options: { aspect?: number } = {}) => preview(options, requestedPreviewOptions())
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
