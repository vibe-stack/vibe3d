/**
 * Compound cliff assembly.
 *
 * Purpose is evaluation, not shipping: a single rock cannot show whether the
 * recipe's seed family reads as one material, whether instances repeat visibly,
 * or whether the baked detail holds up at the scales an assembly actually uses.
 *
 * Background instances compile at a coarser grid and smaller atlas than the hero
 * blocks, since a hero-quality compile is ~70s per seed.
 */

import {
  AmbientLight,
  Color,
  CylinderGeometry,
  DirectionalLight,
  DoubleSide,
  Fog,
  Float32BufferAttribute,
  Group,
  HemisphereLight,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  Vector3,
  Scene,
  Shape,
  ShapeGeometry,
} from 'three/webgpu'
import {
  decodeCompiledSurfaceBake,
  decodeCompiledTopology,
  type CompiledSurfaceBake,
  type CompiledTopology,
} from '../../../packages/terrain/src/index.ts'
import { artifactSource, canCompileInline } from '../shared/artifacts.ts'
import { atlasSizeFor, compileAssetFor } from './topology.ts'
import { formationOf } from './field.ts'
import {
  GraniteResourcePool,
  createInstanceFromCompiled,
  ensureGraniteDetail,
  graniteDetailBytes,
  type OutcropConfig,
} from './model.ts'

interface Placement {
  seed: number
  position: [number, number, number]
  /** Non-uniform scale. The object-space normal bake stays correct under it. */
  scale: [number, number, number]
  yaw: number
  roll?: number
  hero?: boolean
  lod?: 0 | 1 | 2
  surfaceSeed?: number
  lichen?: number
  wetness?: number
}

/**
 * A monumental frost-fractured cliff facade. Large blocks deliberately overlap
 * in depth and height: the authored unit formations are geological building
 * blocks here, not individually displayed boulders. The only primary negative
 * space is the seed-3 cave portal at the foot of the wall.
 */
const PLACEMENTS: Placement[] = [
  // The cave is the intentional void between two basal monoliths. These are
  // cliff chunks (roughly 16-20m across), not enlarged hand rocks.
  { seed: 4, surfaceSeed: 42, position: [-20.0, 0, -12.0], scale: [14.5, 14.0, 5.8], yaw: 0.08, hero: true, wetness: 0.18, lichen: 0.14 },
  { seed: 5, surfaceSeed: 54, position: [20.0, 0, -12.1], scale: [14.5, 20.0, 5.9], yaw: 6.18, hero: true, wetness: 0.2, lichen: 0.15 },
  { seed: 2, surfaceSeed: 27, position: [-31.0, 0, -14.2], scale: [14.0, 14.5, 6.4], yaw: 5.98, wetness: 0.15, lichen: 0.12 },
  { seed: 6, surfaceSeed: 65, position: [31.0, 0, -14.4], scale: [14.0, 14.8, 6.4], yaw: 0.26, wetness: 0.17, lichen: 0.1 },

  // One enormous slab bridges the portal. Its underside is kept above eye level;
  // there is no second row of arch-shaped pieces competing with the entrance.
  { seed: 5, surfaceSeed: 105, position: [-0.6, 11.0, -11.0], scale: [20.0, 8.0, 6.2], yaw: 0.03, hero: true, wetness: 0.28, lichen: 0.08 },

  // Three 35-40m crown masses overlap into a single upper escarpment. Their
  // bottoms stay above the overhang so the cave remains a true void.
  { seed: 1, surfaceSeed: 161, position: [-24.0, 19.0, -19.0], scale: [28.0, 24.0, 8.4], yaw: 0.28, hero: true, lichen: 0.19 },
  { seed: 4, surfaceSeed: 184, position: [0, 19.6, -18.2], scale: [30.0, 24.0, 8.2], yaw: 5.92, hero: true, lichen: 0.16 },
  { seed: 6, surfaceSeed: 193, position: [24.0, 19.0, -19.1], scale: [28.0, 24.0, 8.5], yaw: 0.34, lichen: 0.2 },

  // Two car-sized failures sell scale without turning the apron into scatter.
  { seed: 4, surfaceSeed: 401, position: [-12.0, 0, -3.4], scale: [2.1, 1.6, 1.8], yaw: 2.4, roll: 0.35, lod: 1, wetness: 0.3 },
  { seed: 7, surfaceSeed: 417, position: [12.2, 0, -3.7], scale: [2.0, 1.5, 1.75], yaw: 5.1, roll: -0.48, lod: 1, wetness: 0.32 },
]

/**
 * Quality tiers. `preview` exists because the recorder compiles this scene live
 * in the browser: at hero settings that is several minutes of ray marching per
 * seed and the tab appears hung.
 */
const QUALITY = {
  preview: { heroCells: 96, backgroundCells: 80, maximumAtlas: 1024 },
  hero: { heroCells: 192, backgroundCells: 128, maximumAtlas: 2048 },
} as const

export type CliffQuality = keyof typeof QUALITY

/**
 * Assembly baseline the per-placement values above are authored against, and the
 * origin the recorder's controls move from. Kept in step with the control
 * defaults in the recorder catalogue.
 */
const BASE_BIOME = { snow: 0, wetness: 0.12, lichen: 0.16, moss: 0.04 } as const

/**
 * Nominal LOD0 surface area at unit scale, in square metres, used to pick an
 * atlas before the mesh exists. Scaling by the mean of the pairwise scale
 * products approximates how area grows under non-uniform scale.
 */
const NOMINAL_UNIT_AREA = 16.5

/**
 * Linear scale of a placement, as the geometric mean of its three components.
 * This is what the material needs: triangles grow with it, so it decides which
 * procedural bands the mesh can still describe at the vertex stage.
 */
function linearScale(scale: readonly [number, number, number]): number {
  return Math.cbrt(scale[0] * scale[1] * scale[2])
}

function estimatedArea(scale: readonly [number, number, number]): number {
  const [x, y, z] = scale
  return NOMINAL_UNIT_AREA * ((x * y + y * z + z * x) / 3)
}

/** Low-frequency alpine apron; open ground needs no arbitrary-SDF topology. */
function alpineGroundHeight(x: number, z: number): number {
  const slope = -0.018 * z
  const broadRoll = Math.sin(x * 0.17 + z * 0.05) * 0.085
    + Math.sin(z * 0.24 - x * 0.08) * 0.055
  const talusBank = Math.exp(-(((z + 1.8) / 8.5) ** 2))
    * Math.exp(-((x / 28) ** 4))
    * 0.18
  const drainage = -Math.exp(-((x / 5.5) ** 2) - ((z - 4.5) / 11) ** 2) * 0.14
  return -0.12 + slope + broadRoll + talusBank + drainage
}

function createAlpineGround(): {
  mesh: Mesh
  geometry: PlaneGeometry
  material: MeshPhysicalMaterial
} {
  const geometry = new PlaneGeometry(110, 90, 96, 72)
  geometry.rotateX(-Math.PI / 2)
  const positions = geometry.getAttribute('position')
  const colors = new Float32Array(positions.count * 3)
  const stone = new Color(0x5c594f)
  const scree = new Color(0x767064)
  const turf = new Color(0x3d4338)
  const sample = new Color()
  for (let index = 0; index < positions.count; index += 1) {
    const x = positions.getX(index)
    const z = positions.getZ(index)
    const height = alpineGroundHeight(x, z)
    positions.setY(index, height)
    const talus = Math.exp(-(((z + 0.8) / 8) ** 2)) * Math.exp(-((x / 30) ** 4))
    const moisture = Math.max(0, Math.min(1, 0.45 - height + Math.sin(x * 0.31) * 0.08))
    sample.copy(stone).lerp(scree, talus * 0.58).lerp(turf, moisture * 0.28)
    colors[index * 3] = sample.r
    colors[index * 3 + 1] = sample.g
    colors[index * 3 + 2] = sample.b
  }
  positions.needsUpdate = true
  geometry.setAttribute('color', new Float32BufferAttribute(colors, 3))
  geometry.computeVertexNormals()
  geometry.computeBoundingBox()
  geometry.computeBoundingSphere()
  const material = new MeshPhysicalMaterial({
    name: 'cliff / alpine talus apron',
    vertexColors: true,
    roughness: 0.98,
    metalness: 0,
  })
  const mesh = new Mesh(geometry, material)
  mesh.name = 'alpine talus apron / heightfield'
  mesh.receiveShadow = true
  mesh.userData.excludeFromExport = true
  return { mesh, geometry, material }
}

function createCliffCore(): {
  group: Group
  geometries: PlaneGeometry[]
  material: MeshPhysicalMaterial
} {
  const group = new Group()
  group.name = 'continuous recessed cliff core'
  const geometries: PlaneGeometry[] = []
  const material = new MeshPhysicalMaterial({
    name: 'cliff / recessed weathered granite',
    vertexColors: true,
    roughness: 1,
    metalness: 0,
  })
  const base = new Color(0x3d423f)
  const light = new Color(0x565a54)
  const damp = new Color(0x303633)
  const sample = new Color()
  const normal = new Vector3()

  const addPanel = (width: number, height: number, cx: number, cy: number) => {
    const geometry = new PlaneGeometry(width, height, Math.ceil(width * 2), Math.ceil(height * 2))
    const positions = geometry.getAttribute('position')
    const colors = new Float32Array(positions.count * 3)
    for (let index = 0; index < positions.count; index += 1) {
      const x = positions.getX(index) + cx
      const y = positions.getY(index) + cy
      const broad = Math.sin(x * 0.19 + y * 0.07) * 0.65
        + Math.sin(y * 0.33 - x * 0.11) * 0.38
        + Math.sin((x + y) * 0.71) * 0.12
      const ledge = Math.floor((y + Math.sin(x * 0.12) * 1.4) / 4.2) * 0.09
      positions.setZ(index, broad + ledge)
      const weathering = Math.max(0, Math.min(1, 0.48 + broad * 0.22 + Math.sin(x * 0.37) * 0.12))
      const dampness = Math.max(0, Math.min(1, 0.35 - y * 0.012 + Math.sin(x * 0.16 + y * 0.08) * 0.15))
      sample.copy(base).lerp(light, weathering).lerp(damp, dampness * 0.3)
      colors[index * 3] = sample.r
      colors[index * 3 + 1] = sample.g
      colors[index * 3 + 2] = sample.b
    }
    positions.needsUpdate = true
    geometry.setAttribute('color', new Float32BufferAttribute(colors, 3))
    geometry.computeVertexNormals()
    const mesh = new Mesh(geometry, material)
    mesh.position.set(cx, cy, -22)
    mesh.receiveShadow = true
    group.add(mesh)
    geometries.push(geometry)
  }

  // Side panels stop at the cave jambs; the upper panel bridges them. Together
  // they are one recessed escarpment with a genuine 10m-wide opening, not a
  // backdrop placed across the cave mouth.
  addPanel(30, 42, -25, 20)
  addPanel(30, 42, 25, 20)
  addPanel(36, 29, 0, 27.5)
  normal.set(0, 0, 1)
  group.userData.nominalNormal = normal.toArray()
  return { group, geometries, material }
}

/**
 * The seed-3 portal supplies the real irregular entrance topology. This recessed
 * shell gives that opening enough parallax and darkness to read as a cave rather
 * than daylight through an arch; it starts behind the rock and never masks the
 * baked entrance silhouette from the camera.
 */
function createCaveInterior(): {
  group: Group
  geometries: Array<PlaneGeometry | ShapeGeometry | CylinderGeometry>
  materials: Array<MeshBasicMaterial | MeshPhysicalMaterial>
} {
  const group = new Group()
  group.name = 'cave entrance / recessed interior'

  const shellGeometry = new CylinderGeometry(9.5, 10.0, 25, 20, 3, true)
  const shellMaterial = new MeshPhysicalMaterial({
    name: 'cave / unlit rock throat',
    color: 0x0b0d0c,
    roughness: 1,
    metalness: 0,
    side: DoubleSide,
  })
  const shell = new Mesh(shellGeometry, shellMaterial)
  shell.name = 'cave throat / 17m depth'
  shell.rotation.x = Math.PI / 2
  shell.scale.set(1, 1, 0.56)
  shell.position.set(0, 4.1, -23.5)
  shell.receiveShadow = true
  group.add(shell)

  const floorGeometry = new PlaneGeometry(19.5, 30, 1, 12)
  floorGeometry.rotateX(-Math.PI / 2)
  const floorMaterial = new MeshPhysicalMaterial({
    name: 'cave / damp floor',
    color: 0x11130f,
    roughness: 1,
    metalness: 0,
  })
  const floor = new Mesh(floorGeometry, floorMaterial)
  floor.name = 'cave floor / approach continuation'
  floor.position.set(0, alpineGroundHeight(0, -8.2) + 0.015, -20)
  floor.receiveShadow = true
  group.add(floor)

  const backShape = new Shape()
  backShape.moveTo(-9.6, 0)
  backShape.lineTo(-9.4, 4.8)
  backShape.lineTo(-7.4, 9.1)
  backShape.lineTo(-4.1, 11.5)
  backShape.lineTo(0.1, 12.2)
  backShape.lineTo(4.8, 11.25)
  backShape.lineTo(7.9, 8.6)
  backShape.lineTo(9.5, 4.1)
  backShape.lineTo(9.5, 0)
  backShape.closePath()
  const backGeometry = new ShapeGeometry(backShape)
  const backMaterial = new MeshBasicMaterial({
    name: 'cave / terminal darkness',
    color: 0x010202,
    side: DoubleSide,
    fog: false,
    toneMapped: false,
  })
  const back = new Mesh(backGeometry, backMaterial)
  back.name = 'cave terminal darkness'
  // Real caves lose direct skylight within a few metres. Keeping this mask just
  // behind the threshold avoids a visibly open tunnel while the shell and floor
  // still provide parallax around its irregular edge in oblique views.
  back.position.set(0, alpineGroundHeight(0, -8.2), -16.5)
  group.add(back)

  return {
    group,
    geometries: [shellGeometry, floorGeometry, backGeometry],
    materials: [shellMaterial, floorMaterial, backMaterial],
  }
}

export interface CliffInstanceRequest {
  seed: number
  cells: number
  atlas: number
}

/** Artifact basename for one instance. Shared by the compiler and the loader. */
export function cliffArtifactName(request: CliffInstanceRequest): string {
  return `cliff-seed${request.seed}-c${request.cells}-a${request.atlas}`
}

function cliffInstanceRequestMap(
  qualityName: CliffQuality,
): Map<number, CliffInstanceRequest> {
  const quality = QUALITY[qualityName]
  const requests = new Map<number, CliffInstanceRequest>()
  for (const placement of PLACEMENTS) {
    const candidate: CliffInstanceRequest = {
      seed: placement.seed,
      cells: placement.hero ? quality.heroCells : quality.backgroundCells,
      atlas: Math.min(quality.maximumAtlas, atlasSizeFor(estimatedArea(placement.scale))),
    }
    const current = requests.get(candidate.seed)
    if (!current) {
      requests.set(candidate.seed, candidate)
      continue
    }
    // One seed has one authoritative formation. Reuse its highest-quality
    // artifact everywhere it appears instead of compiling a second, lower
    // resolution copy for scree. This removes duplicate work and improves the
    // smaller placement; neither topology nor baked detail is discarded.
    current.cells = Math.max(current.cells, candidate.cells)
    current.atlas = Math.max(current.atlas, candidate.atlas)
  }
  return requests
}

/** The distinct compiles this scene needs at a given quality. */
export function cliffInstanceRequests(
  qualityName: CliffQuality = 'preview',
): CliffInstanceRequest[] {
  return [...cliffInstanceRequestMap(qualityName).values()]
}

/**
 * Statically registered artifact URLs.
 *
 * The glob has to appear literally in this module - Vite rewrites it in place -
 * and eagerly, because the scene needs the URL map before it starts loading.
 *
 * This replaced a `new URL(\`./cliff/${name}.vtopo\`, import.meta.url)` lookup,
 * which worked in Node and silently failed in the browser: Vite cannot statically
 * analyse a template literal, so the artifacts were never served and every
 * instance fell through to an in-browser source compile.
 */
const ARTIFACT_URLS: Record<string, string> | undefined = (() => {
  try {
    return (import.meta as unknown as {
      glob(pattern: string, options: Record<string, unknown>): Record<string, string>
    }).glob('./cliff/*.{vtopo,vbake}', { query: '?url', import: 'default', eager: true })
  } catch {
    return undefined
  }
})()

const ARTIFACTS = artifactSource(
  ARTIFACT_URLS,
  new URL('./cliff/', import.meta.url),
  '/__terrain-artifacts__/glacial-granite-boulder/cliff/',
)

/**
 * Load one instance from its compiled artifacts.
 *
 * In Node a cache miss falls back to compiling from source. In the browser it
 * throws: a source compile there is minutes of ray marching on the main thread,
 * and a clear error naming the compiler script beats a tab that appears to hang.
 */
async function loadInstance(
  request: CliffInstanceRequest,
): Promise<{ topology: CompiledTopology; surfaceBake: CompiledSurfaceBake; cached: boolean }> {
  const name = cliffArtifactName(request)
  const [topologyBytes, bakeBytes] = await Promise.all([
    ARTIFACTS.read(name, 'vtopo'),
    ARTIFACTS.read(name, 'vbake'),
  ])
  if (topologyBytes && bakeBytes) {
    try {
      return {
        topology: decodeCompiledTopology(topologyBytes),
        surfaceBake: decodeCompiledSurfaceBake(bakeBytes),
        cached: true,
      }
    } catch (error) {
      if (!canCompileInline) {
        throw new Error(
          `Cached cliff artifact ${name} could not be decoded (${(error as Error).message}). `
          + 'Recompile with `node --import tsx assets/terrain/glacial-granite-boulder/compile-cliff.ts`.',
        )
      }
      // Node: fingerprint or format drift, so rebuild from source below.
    }
  } else if (!canCompileInline) {
    throw new Error(
      `Cliff artifact ${name} is not cached (${ARTIFACTS.count} artifact file(s) visible). `
      + 'Run `node --import tsx assets/terrain/glacial-granite-boulder/compile-cliff.ts` first: '
      + 'compiling this assembly in the browser takes minutes.',
    )
  }
  const built = compileAssetFor(request.seed, request.cells, request.atlas, { diagnostics: false })
  return { topology: built.topology, surfaceBake: built.surfaceBake, cached: false }
}

export async function createCliffScene(
  options: { aspect?: number; yaw?: number; quality?: CliffQuality } = {},
) {
  const qualityName = options.quality ?? 'preview'
  const requests = cliffInstanceRequestMap(qualityName)
  const scene = new Scene()
  scene.name = 'fractured granite / monumental cave cliff'
  scene.background = new Color(0x536a73)
  scene.fog = new Fog(0x536a73, 72, 145)

  const root = new Group()
  root.name = 'monumental cave cliff assembly'
  const disposers: Array<() => void> = []
  const instances: Array<ReturnType<typeof createInstanceFromCompiled>> = []
  /**
   * What each placement was authored to differ by, relative to the assembly
   * baseline below. The controls move the baseline; these deltas ride on top, so
   * turning the scene wet does not erase the fact that the basal blocks were
   * authored wetter than the crown. Flattening every instance to one value is
   * the obvious implementation and it makes ten rocks look like one rock.
   */
  const biomeDeltas: Array<{
    instance: ReturnType<typeof createInstanceFromCompiled>
    wetness: number
    lichen: number
    surfaceSeed: number
  }> = []
  const compiled = new Map<string, Awaited<ReturnType<typeof loadInstance>>>()
  const resourcePool = new GraniteResourcePool()
  // One upload for the whole assembly. The tile is physical-scale and projected
  // from world position, so every archetype and every placement scale shares it.
  await ensureGraniteDetail()
  let cachedCount = 0
  let builtCount = 0

  for (const placement of PLACEMENTS) {
    const request = requests.get(placement.seed)!
    const key = cliffArtifactName(request)
    let asset = compiled.get(key)
    if (!asset) {
      asset = await loadInstance(request)
      compiled.set(key, asset)
      if (asset.cached) cachedCount += 1
      else builtCount += 1
    }
    const config: OutcropConfig = {
      snow: BASE_BIOME.snow,
      wetness: placement.wetness ?? BASE_BIOME.wetness,
      lichen: placement.lichen ?? BASE_BIOME.lichen,
      moss: BASE_BIOME.moss,
      detailStrength: 0.72,
      surfaceSeed: placement.surfaceSeed,
      placementScale: linearScale(placement.scale),
      lod: placement.lod ?? 0,
      diagnostic: 'beauty',
    }
    const instance = createInstanceFromCompiled(
      asset.topology,
      config,
      placement.seed,
      'compiled',
      asset.surfaceBake,
      resourcePool,
    )
    instance.root.position.set(...placement.position)
    instance.root.scale.set(...placement.scale)
    instance.root.rotation.set(placement.roll ?? 0, placement.yaw, 0)
    instance.root.userData.formation = formationOf(placement.seed)
    // Bed each block into the local apron height so the large scene has no
    // floating contacts even though the ground is no longer a flat preview plane.
    instance.root.position.y = alpineGroundHeight(placement.position[0], placement.position[2])
      + placement.position[1]
      - 0.13 * placement.scale[1]
    root.add(instance.root)
    instances.push(instance)
    biomeDeltas.push({
      instance,
      wetness: (placement.wetness ?? BASE_BIOME.wetness) - BASE_BIOME.wetness,
      lichen: (placement.lichen ?? BASE_BIOME.lichen) - BASE_BIOME.lichen,
      surfaceSeed: placement.surfaceSeed ?? placement.seed,
    })
    disposers.push(instance.dispose)
  }
  root.userData.runtimeResources = {
    ...resourcePool.stats(),
    sharedDetailTileBytesWithMipmaps: graniteDetailBytes(),
  }
  root.userData.placementCount = PLACEMENTS.length
  root.userData.uniqueFormationCount = compiled.size
  scene.add(root)

  const ground = createAlpineGround()
  scene.add(ground.mesh)
  const cliffCore = createCliffCore()
  scene.add(cliffCore.group)
  const cave = createCaveInterior()
  scene.add(cave.group)

  // Same budget discipline as the single-asset preview: total intensity stays
  // near unit irradiance so granite albedo is not clipped by the ACES curve.
  const ambient = new AmbientLight(0xaebec2, 0.13)
  const hemisphere = new HemisphereLight(0xd0dadd, 0x252720, 0.38)
  const key = new DirectionalLight(0xfff0d8, 2.1)
  key.position.set(-18, 25, 16)
  key.castShadow = true
  const rim = new DirectionalLight(0xaec6d0, 0.42)
  rim.position.set(20, 12, -18)
  scene.add(ambient, hemisphere, key, rim)

  const camera = new PerspectiveCamera(42, options.aspect ?? 1.6, 0.05, 260)
  const yaw = ((options.yaw ?? 0) * Math.PI) / 180
  const radius = Math.abs(options.yaw ?? 0) > 1 ? 57 : 53
  camera.position.set(Math.sin(yaw) * radius, 2.35, Math.cos(yaw) * radius + 2)
  camera.lookAt(0, 13.8, -15.5)
  scene.add(camera)

  if (builtCount > 0) {
    console.warn(
      `cliff assembly: ${cachedCount} instance(s) from cache, ${builtCount} compiled from source. `
      + 'Run `node --import tsx assets/terrain/glacial-granite-boulder/compile-cliff.ts` to cache them.',
    )
  }

  return {
    scene,
    camera,
    root,
    /**
     * Scene-wide biome controls. Every granite instance in the assembly takes
     * the patch, including the two apron boulders, so the panel drives the whole
     * cliff rather than a single hero block.
     *
     * Nothing is applied absolutely. Each placement was authored with its own
     * wetness, lichen and surface seed, and the controls move that authored set
     * as a whole: the basal blocks stay wetter than the crown, and every block
     * keeps a distinct surface seed. Assigning one value to all ten is the
     * obvious implementation and it makes an assembly read as ten copies of the
     * same rock - which is the one thing this scene exists to detect.
     */
    configure: (patch: Record<string, number>) => {
      for (const entry of biomeDeltas) {
        const shifted: Record<string, number> = {}
        for (const [key, value] of Object.entries(patch)) {
          if (key === 'surfaceSeed') {
            // Offset, not assignment: the slider revariates the whole family
            // while the placements stay different from each other.
            shifted[key] = entry.surfaceSeed + Math.round(value) - 1
            continue
          }
          const delta = key === 'wetness' ? entry.wetness : key === 'lichen' ? entry.lichen : 0
          shifted[key] = Math.min(1, Math.max(0, value + delta))
        }
        entry.instance.configure(shifted)
      }
    },
    update: (deltaSeconds: number) => {
      for (const instance of instances) instance.update(deltaSeconds, camera)
    },
    dispose: () => {
      for (const dispose of disposers) dispose()
      resourcePool.dispose()
      ground.geometry.dispose()
      ground.material.dispose()
      for (const geometry of cliffCore.geometries) geometry.dispose()
      cliffCore.material.dispose()
      for (const geometry of cave.geometries) geometry.dispose()
      for (const material of cave.materials) material.dispose()
    },
  }
}

export const createPreview = (options: { aspect?: number } = {}) => createCliffScene(options)
export const createHeroPreview = (options: { aspect?: number } = {}) => createCliffScene({ ...options, quality: 'hero' })
export const createCliffLeft = (options: { aspect?: number } = {}) => createCliffScene({ ...options, yaw: -18 })
export const createCliffRight = (options: { aspect?: number } = {}) => createCliffScene({ ...options, yaw: 18 })
export default createPreview
