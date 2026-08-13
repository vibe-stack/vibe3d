/**
 * Runtime for red sandstone canyon rock.
 *
 * The material's job is narrow and specific: carry the baked relief, and band the
 * colour in register with the geometry. Sandstone reads as sandstone mostly
 * through stratigraphy, so the albedo is driven by the `region-mask` channel -
 * bed hardness sampled at the traced surface point during the bake - rather than
 * by world Y. Re-deriving the bands from Y in the shader cannot land on the same
 * boundaries the beds were cut at, and the colour then visibly slides off the
 * ledges it belongs to.
 */

import {
  AmbientLight,
  BufferAttribute,
  BufferGeometry,
  Color,
  DataTexture,
  DirectionalLight,
  Float32BufferAttribute,
  Group,
  HemisphereLight,
  LinearFilter,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  MeshStandardNodeMaterial,
  NoColorSpace,
  PerspectiveCamera,
  PlaneGeometry,
  RGBAFormat,
  RedFormat,
  RepeatWrapping,
  Scene,
  UnsignedByteType,
  Uint32BufferAttribute,
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
import { formationOf } from './field.ts'

export interface CanyonConfig {
  /** Manganese-oxide streaking below ledge lips. The canyon signature. */
  varnish: number
  /** Wind-blown sand dusting on upward faces, paler and desaturated. */
  dust: number
  wetness: number
  lod: 0 | 1 | 2
  diagnostic: 'beauty' | 'wireframe' | 'normal' | 'ao' | 'uv' | 'strata'
}

export interface CanyonOptions extends Partial<CanyonConfig> {
  seed?: number
  path?: TerrainRepresentationPath
}

export interface CanyonInstance {
  root: Group
  topology: CompiledTopology
  representation: 'compiled' | 'source'
  update(deltaSeconds: number): void
  dispose(): void
}

export interface CanyonPreview extends CanyonInstance {
  scene: Scene
  camera: PerspectiveCamera
}

const DEFAULT_CONFIG: CanyonConfig = {
  varnish: 0.28,
  dust: 0.12,
  wetness: 0.05,
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
  compiledPromise ??= readArtifact(new URL('./red-sandstone-canyon.vtopo', import.meta.url))
    .then(decodeCompiledTopology)
  return compiledPromise
}

async function loadCompiledSurfaceBake(): Promise<CompiledSurfaceBake> {
  compiledSurfaceBakePromise ??= readArtifact(new URL('./red-sandstone-canyon.vbake', import.meta.url))
    .then(decodeCompiledSurfaceBake)
  return compiledSurfaceBakePromise
}

function indicesFor(topology: CompiledTopology, lod: CanyonConfig['lod']): Uint32Array {
  if (lod === 0) return topology.indices
  return topology.lods.find((candidate) => candidate.level === lod)?.indices ?? topology.indices
}

interface SandstoneMaterialResult {
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
  result.wrapS = RepeatWrapping
  result.wrapT = RepeatWrapping
  result.magFilter = LinearFilter
  result.minFilter = LinearFilter
  result.flipY = false
  result.needsUpdate = true
  return result
}

function createSandstoneMaterial(
  config: CanyonConfig,
  seed: number,
  bake: CompiledSurfaceBake,
): SandstoneMaterialResult {
  const normalBake = bakeTexture(bake, 'normal-object')
  const heightBake = bakeTexture(bake, 'height')
  const aoBake = bakeTexture(bake, 'ambient-occlusion')
  const curvatureBake = bakeTexture(bake, 'curvature')
  const strataBake = bakeTexture(bake, 'region-mask')
  const textures = [normalBake, heightBake, aoBake, curvatureBake, strataBake]
    .filter((value): value is DataTexture => Boolean(value))

  const material = new MeshStandardNodeMaterial({
    name: 'red sandstone / high-to-low surface',
    roughness: 0.9,
    metalness: 0,
  })

  const atlas = uv()
  const bakedHeight = heightBake ? texture(heightBake, atlas).r.mul(2).sub(1) : undefined
  const bakedAo = aoBake ? texture(aoBake, atlas).r : undefined
  const bakedCurvature = curvatureBake ? texture(curvatureBake, atlas).r.mul(2).sub(1) : undefined
  // Bed hardness in [0, 1], in exact register with the geometry.
  const hardness = strataBake ? texture(strataBake, atlas).r : undefined

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
  if (config.diagnostic === 'strata' && hardness) {
    material.colorNode = vec3(hardness, oneMinus(hardness), 0.25)
    return { material, textures }
  }

  const p = positionWorld

  // Iron-oxide palette, deliberately narrow in both value and hue.
  //
  // This is the correction to a real mistake. The first version spanned 0x5c2a1c to
  // 0xb08a63 - nearly 3x in luminance - and then stacked occlusion, curvature and
  // varnish darkening on top of it, which read as alternating bright and near-black
  // bands and looked nothing like rock. Sandstone albedo barely varies: a bed that
  // looks dark in a photograph is dark because it is shadowed or recessed, not
  // because its pigment differs. So the entire palette sits inside one warm band and
  // every darkening term below is a fraction of what it was, leaving contrast to the
  // lighting where it belongs.
  const deepIron = color(0x6d2d20)
  const rustIron = color(0xa84f31)
  const paleSand = color(0xc87349)
  const bleached = color(0xe0a06b)
  // Grey-brown, not black. Desert varnish is a thin mineral glaze; it darkens and
  // desaturates a face, it does not blacken it.
  const varnishTone = color(0x4e2924)
  const dustTone = color(0xd39a6b)

  // Broad colour drift follows the wall instead of producing isotropic cloudy
  // patches. Cross-bedding is strongly anisotropic and sheared: fine laminae cut
  // diagonally through the larger horizontal bed packages, as in aeolian dunes.
  const mottle = mx_noise_float(vec3(
    p.x.mul(0.72),
    p.y.mul(0.16),
    p.z.mul(0.72),
  ).add(seed * 0.31)).mul(0.5).add(0.5)
  const lamina = mx_noise_float(vec3(
    p.x.mul(1.1),
    p.y.mul(13).add(p.x.mul(2.8)).add(p.z.mul(0.65)),
    p.z.mul(1.1),
  ).add(seed * 0.67)).mul(0.5).add(0.5)
  const laminaFine = mx_noise_float(vec3(
    p.x.mul(1.8),
    p.y.mul(31).sub(p.x.mul(5.2)).add(p.z.mul(1.4)),
    p.z.mul(1.8),
  ).add(seed * 0.43)).mul(0.5).add(0.5)
  const laminaLine = smoothstep(0.52, 0.68, lamina)
    .mul(oneMinus(smoothstep(0.68, 0.82, lamina)))
  const fineLine = smoothstep(0.58, 0.72, laminaFine)
    .mul(oneMinus(smoothstep(0.72, 0.86, laminaFine)))

  let stone = mix(deepIron, rustIron, smoothstep(0.24, 0.78, mottle))
  if (hardness) {
    // The stratigraphy itself, at a fraction of its original strength. Hard beds
    // are the paler resistant ledge formers, soft beds the slightly deeper
    // recessive ones - a suggestion, not a stripe.
    stone = mix(stone, paleSand, smoothstep(0.35, 0.85, hardness).mul(0.28))
    stone = mix(stone, bleached, smoothstep(0.8, 1, hardness).mul(0.12))
    // A thin paler rind at each bed contact reads as the calcite seam that often
    // marks one. It lands correctly only because the mask came from the bake rather
    // than from world Y.
    const contact = smoothstep(0.42, 0.5, hardness).mul(oneMinus(smoothstep(0.5, 0.58, hardness)))
    stone = mix(stone, bleached, contact.mul(0.1))
  }
  stone = mix(stone, paleSand, laminaLine.mul(0.24).add(fineLine.mul(0.12)))

  if (bakedCurvature) {
    // Exposed arrises abrade paler; recesses hold a little more oxide. Both are
    // now small: relief is the normal map's job, not the albedo's.
    stone = mix(stone, bleached, smoothstep(0.2, 0.85, bakedCurvature).mul(0.12))
    stone = mix(stone, deepIron, smoothstep(-0.15, -0.7, bakedCurvature).mul(0.16))
  }
  // Occlusion belongs in `aoNode`, where the renderer applies it to incoming light.
  // Baking it into albedo as well - at 0.6 toward the darkest tone, as this did -
  // double-counts it and is most of what made the recesses read as black holes.
  if (bakedAo) stone = mix(stone, deepIron, oneMinus(bakedAo).mul(0.08))

  // Desert varnish: manganese and iron oxides deposited by water running down the
  // face, leaving near-black vertical streaks that begin under ledge lips and fade
  // downward. This is the single most recognisable canyon-wall marking, and it is
  // directional - so it is built from noise stretched hard in Y, in world space,
  // and gated to downward-facing-or-vertical surfaces where water would actually
  // track. An isotropic dark mask here would just read as dirt.
  const streak = mx_noise_float(vec3(p.x.mul(7.5), p.y.mul(0.55), p.z.mul(7.5)).add(seed * 0.83))
    .mul(0.5).add(0.5)
  const streakFine = mx_noise_float(vec3(p.x.mul(19), p.y.mul(1.1), p.z.mul(19)).add(seed * 0.47))
    .mul(0.5).add(0.5)
  const vertical = oneMinus(normalWorldGeometry.y.abs())
  const varnishMask = smoothstep(0.5, 0.9, streak.mul(0.7).add(streakFine.mul(0.3)))
    .mul(vertical)
    .mul(config.varnish)
    .mul(bakedAo ? mix(0.55, 1, bakedAo) : 1)
  // A glaze, at 0.3 rather than 0.8. Varnish should be legible as streaking on a
  // face that is still plainly sandstone, not as dark paint over it.
  stone = mix(stone, varnishTone, varnishMask.mul(0.22))

  // Wind-blown sand collects on upward faces - ledge tops - and mutes them.
  const upward = smoothstep(0.45, 0.9, normalWorldGeometry.y)
  const dustMask = upward
    .mul(smoothstep(0.35, 0.8, mx_noise_float(p.mul(4.2).add(seed * 0.19)).mul(0.5).add(0.5)))
    .mul(config.dust)
  stone = mix(stone, dustTone, dustMask)

  const wetMask = oneMinus(smoothstep(0.05, 0.55, p.y)).mul(config.wetness)
  stone = mix(stone, deepIron, wetMask.mul(0.3))
  material.colorNode = stone

  // The point of the pipeline: the object-space bake supplies the shading normal,
  // so relief the reduction removed still lights correctly. Object space avoids
  // any tangent-basis agreement with the baker.
  if (normalBake) {
    const decoded = tslNormalize(texture(normalBake, atlas).xyz.mul(2).sub(1))

    // Relief below the atlas's reach is added here in world space, across three
    // octaves rather than one.
    //
    // This is forced by arithmetic, not preference. A 12m wall has ~880 square
    // metres of surface; a 1024 atlas covering it resolves about 90mm per texel, so
    // the bake's own Nyquist limit is around 180mm. One shader octave at 3cm left
    // everything between 3cm and 18cm unrepresented by either the bake or the
    // shader, and that band is precisely where rock reads as rock - so a large wall
    // came out smooth while a small block looked detailed.
    //
    // Because these are world-space frequencies they hold their real-world size at
    // any instance scale, which is the same reason the finest octave was moved out
    // of the atlas in the first place.
    const octaves: Array<[number, number]> = [
      // frequency (cycles/metre), amplitude
      [3.2, 0.3],
      [9.5, 0.22],
      [31, 0.16],
    ]
    let perturbed = decoded
    for (const [frequency, amplitude] of octaves) {
      const step = 0.28 / frequency
      const at = (offset: ReturnType<typeof vec3>) =>
        mx_noise_float(p.add(offset).mul(frequency).add(seed * 0.29 + frequency))
      const gradient = vec3(
        at(vec3(step, 0, 0)).sub(at(vec3(-step, 0, 0))),
        at(vec3(0, step, 0)).sub(at(vec3(0, -step, 0))),
        at(vec3(0, 0, step)).sub(at(vec3(0, 0, -step))),
      )
      // Remove the component along the normal so each octave only tilts the
      // surface rather than inflating or deflating it.
      const tangential = gradient.sub(perturbed.mul(gradient.dot(perturbed)))
      perturbed = tslNormalize(perturbed.sub(tangential.mul(amplitude)))
    }
    material.normalNode = transformNormalToView(perturbed)
  }
  if (bakedAo) material.aoNode = bakedAo

  // Varnish is a mineral glaze and is genuinely less rough than raw sandstone;
  // dust is more. Both are visible enough to be worth the two extra mixes.
  let roughnessNode = mix(0.94, 0.72, varnishMask)
  roughnessNode = mix(roughnessNode, 0.98, dustMask)
  if (bakedCurvature) roughnessNode = roughnessNode.sub(bakedCurvature.mul(0.08))
  if (bakedHeight) roughnessNode = roughnessNode.add(bakedHeight.mul(0.04))
  material.roughnessNode = roughnessNode
  return { material, textures }
}

function createGeometry(
  topology: CompiledTopology,
  config: CanyonConfig,
  seed: number,
): BufferGeometry {
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(materializePositions(topology, seed), 3))
  geometry.setAttribute('terrainDomain', new Float32BufferAttribute(topology.domainCoordinates.slice(), 3))
  geometry.setAttribute('terrainStableVertexId', new Uint32BufferAttribute(topology.stableVertexIds.slice(), 1))
  if (topology.bakeUvs) {
    geometry.setAttribute('uv', new Float32BufferAttribute(topology.bakeUvs.slice(), 2))
  }
  geometry.setIndex(new BufferAttribute(indicesFor(topology, config.lod).slice(), 1))
  geometry.computeVertexNormals()
  geometry.computeBoundingBox()
  geometry.computeBoundingSphere()
  return geometry
}

function materialize(
  topology: CompiledTopology,
  config: CanyonConfig,
  seed: number,
  representation: CanyonInstance['representation'],
  surfaceBake?: CompiledSurfaceBake,
): CanyonInstance {
  const root = new Group()
  root.name = `red sandstone canyon / ${formationOf(seed)}`
  root.userData.terrain = {
    assetId: ASSET_ID,
    topologyKey: topology.topologyKey,
    recipeHash: topology.recipeHash,
    compilerHash: topology.compilerHash,
    seed,
    formation: formationOf(seed),
    representation,
  }
  const geometry = createGeometry(topology, config, seed)
  const sandstone = config.diagnostic === 'wireframe' || !surfaceBake
    ? undefined
    : createSandstoneMaterial(config, seed, surfaceBake)
  const material = sandstone?.material ?? new MeshBasicMaterial({
    color: 0xd8a882,
    wireframe: config.diagnostic === 'wireframe',
  })
  const mesh = new Mesh(geometry, material)
  mesh.name = 'canyon rock / high-to-low materialized'
  mesh.castShadow = true
  mesh.receiveShadow = true
  root.add(mesh)

  let disposed = false
  return {
    root,
    topology,
    representation,
    update: () => undefined,
    dispose: () => {
      if (disposed) return
      disposed = true
      geometry.dispose()
      material.dispose()
      for (const entry of sandstone?.textures ?? []) entry.dispose()
    },
  }
}

export { materialize as createInstanceFromCompiled }

export async function createModel(options: CanyonOptions = {}): Promise<CanyonInstance> {
  const seed = Math.max(1, Math.floor(options.seed ?? 1))
  const config: CanyonConfig = {
    varnish: Math.min(1, Math.max(0, options.varnish ?? DEFAULT_CONFIG.varnish)),
    dust: Math.min(1, Math.max(0, options.dust ?? DEFAULT_CONFIG.dust)),
    wetness: Math.min(1, Math.max(0, options.wetness ?? DEFAULT_CONFIG.wetness)),
    lod: options.lod ?? DEFAULT_CONFIG.lod,
    diagnostic: options.diagnostic ?? DEFAULT_CONFIG.diagnostic,
  }
  const [compiled, compiledSurfaceBake] = await Promise.all([
    loadCompiledTopology(),
    loadCompiledSurfaceBake(),
  ])
  let representation: CanyonInstance['representation'] = 'compiled'
  const asset = createTerrainAsset<CanyonConfig, CanyonInstance>({
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
  modelOptions: CanyonOptions = {},
): Promise<CanyonPreview> {
  const model = await createModel(modelOptions)
  const seed = Math.max(1, Math.floor(modelOptions.seed ?? 1))
  const formation = formationOf(seed)
  const scene = new Scene()
  scene.name = `red sandstone canyon / ${formation} preview`
  scene.background = new Color(0x3a4a5c)
  scene.add(model.root)

  const floorGeometry = new PlaneGeometry(80, 80)
  const floorMaterial = new MeshPhysicalMaterial({
    name: 'preview / canyon floor',
    color: 0x6b4a35,
    roughness: 0.98,
    metalness: 0,
  })
  const floor = new Mesh(floorGeometry, floorMaterial)
  floor.name = 'preview / ground'
  floor.rotation.x = -Math.PI / 2
  floor.position.y = -0.015
  floor.receiveShadow = true
  floor.userData.excludeFromExport = true
  scene.add(floor)

  // Low, warm, raking key: canyon rock is read through relief and through the
  // vertical streaking, and both need a light that grazes the face. Budgeted
  // against the shared ACES tonemap at exposure 1.15 - the total here stays near
  // unit irradiance so the iron-oxide reds are not clipped into orange.
  const ambient = new AmbientLight(0xa9bcd0, 0.14)
  const hemisphere = new HemisphereLight(0xd8e2ee, 0x4a3428, 0.32)
  const key = new DirectionalLight(0xffd9a8, 1.95)
  key.position.set(-7.5, 5.2, 6.4)
  key.castShadow = true
  // Bounce off a sunlit opposite wall: warm, from below, and the reason canyon
  // interiors glow rather than going black in shadow.
  const bounce = new DirectionalLight(0xd08050, 0.42)
  bounce.position.set(5.5, -1.6, 4.5)
  const rim = new DirectionalLight(0xa8c4e0, 0.4)
  rim.position.set(6.2, 4.4, -7.2)
  scene.add(ambient, hemisphere, key, bounce, rim)

  // Framing follows the formation: a 10m wall and a 2m block cannot share a
  // camera. Orbitable, because a single fixed angle hid detached shells and holes
  // on the far side of the granite asset for several iterations.
  const height = formation === 'wall' ? 10.4 : formation === 'butte' ? 7.2 : 1.8
  const radius = height * 1.35
  const camera = new PerspectiveCamera(38, options.aspect ?? 1, 0.05, 200)
  const yaw = ((options.yaw ?? 0) * Math.PI) / 180
  camera.position.set(Math.sin(yaw + 0.45) * radius, height * 0.55, Math.cos(yaw + 0.45) * radius)
  camera.lookAt(0, height * 0.42, 0)
  scene.add(camera)

  return {
    ...model,
    scene,
    camera,
    dispose: () => {
      floorGeometry.dispose()
      floorMaterial.dispose()
      model.dispose()
    },
  }
}

function requestedPreviewOptions(): CanyonOptions {
  if (typeof window === 'undefined') return { seed: 1 }
  const params = new URLSearchParams(window.location.search)
  const requestedSeed = Number(params.get('seed') ?? 1)
  const requestedLod = Number(params.get('lod') ?? 0)
  const requestedPath = params.get('path')
  const view = params.get('view')
  return {
    seed: Number.isFinite(requestedSeed) ? Math.max(1, Math.floor(requestedSeed)) : 1,
    lod: requestedLod === 1 || requestedLod === 2 ? requestedLod : 0,
    diagnostic: view === 'wireframe' || view === 'normal' || view === 'ao' || view === 'uv' || view === 'strata'
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
export const createWireframePreview = (options: { aspect?: number } = {}) => preview(options, { seed: 1, diagnostic: 'wireframe' })
export const createNormalPreview = (options: { aspect?: number } = {}) => preview(options, { seed: 1, diagnostic: 'normal' })
export const createAoPreview = (options: { aspect?: number } = {}) => preview(options, { seed: 1, diagnostic: 'ao' })
export const createStrataPreview = (options: { aspect?: number } = {}) => preview(options, { seed: 1, diagnostic: 'strata' })
export const createUvPreview = (options: { aspect?: number } = {}) => preview(options, { seed: 1, diagnostic: 'uv' })
export const createLod1Preview = (options: { aspect?: number } = {}) => preview(options, { seed: 1, lod: 1 })
export const createLod2Preview = (options: { aspect?: number } = {}) => preview(options, { seed: 1, lod: 2 })
