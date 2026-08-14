/**
 * Compound canyon corridor.
 *
 * Purpose is evaluation, not shipping. A single wall panel cannot show whether
 * the seed family reads as one stratigraphy, and stratigraphy is the thing that
 * has to survive assembly: real canyon beds are *continuous* across a view, so if
 * neighbouring instances put their ledges at unrelated heights the assembly reads
 * as a pile of unrelated rocks rather than as one cut through one formation.
 *
 * That constraint drives the layout below. Instances that share a wall run share a
 * seed and a Y scale so their beds line up, and only their yaw, lateral position
 * and depth vary. Blocks on the floor are the deliberate exception: a collapsed
 * block has left its bed, so it is rolled to tilt its bedding, which is what makes
 * it read as fallen rather than as a small wall.
 */

import {
  AmbientLight,
  Color,
  DirectionalLight,
  Fog,
  Group,
  HemisphereLight,
  Mesh,
  MeshPhysicalMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
} from 'three/webgpu'
import {
  decodeCompiledSurfaceBake,
  decodeCompiledTopology,
  type CompiledSurfaceBake,
  type CompiledTopology,
} from '../../../packages/terrain/src/index.ts'
import { artifactSource, canCompileInline } from '../shared/artifacts.ts'
import { atlasSizeFor, compileAssetFor, worldScaleFor } from './topology.ts'
import { createInstanceFromCompiled, type CanyonConfig } from './model.ts'
import { formationOf } from './field.ts'

interface Placement {
  seed: number
  position: [number, number, number]
  /** Non-uniform scale. The object-space normal bake stays correct under it. */
  scale: [number, number, number]
  yaw: number
  /** Roll, for collapsed blocks whose bedding is no longer horizontal. */
  roll?: number
  hero?: boolean
  lod?: 0 | 1 | 2
  varnish?: number
  dust?: number
  wetness?: number
}

/**
 * A human-scale slot canyon: the scene is the narrow negative space between two
 * thick, overlapping sandstone masses. The camera lives inside that space. It
 * should never be possible to read the walls as freestanding facade panels.
 */
const RIM = 0
const GORGE_HALF_WIDTH = 5.65

/**
 * Centreline of a real bend rather than a straight gallery.  Adjacent wall
 * segments are oriented to the path tangent and overlap by at least 3.5m of
 * frontage, keeping joins buried inside rock even on the outside of the bend.
 */
const PATH: ReadonlyArray<readonly [number, number]> = [
  [-0.2, 22],
  [-0.9, 15.5],
  [-1.8, 9],
  [-1.35, 2.5],
  [-0.1, -4],
  [1.25, -10.5],
  [0.55, -17],
  [-1.1, -23.5],
]

function wallRun(side: -1 | 1, seeds: number[]): Placement[] {
  return PATH.map(([centerX, z], index) => {
    const previous = PATH[Math.max(0, index - 1)]!
    const next = PATH[Math.min(PATH.length - 1, index + 1)]!
    const txRaw = next[0] - previous[0]
    const tzRaw = next[1] - previous[1]
    const length = Math.sqrt(txRaw * txRaw + tzRaw * tzRaw) || 1
    const tx = txRaw / length
    const tz = tzRaw / length
    const nx = -tz
    const nz = tx
    // Independent wall retreat changes the passage from 2.4m pinches to 4.6m
    // chambers. That variation is the composition: a slot is not a constant-width
    // hallway, and the opposed bulges must almost interlock in projection.
    const erosion = (((index * 43 + (side > 0 ? 5 : 0)) % 13) / 13 - 0.5) * 0.82
    const seed = seeds[index % seeds.length]!
    return {
      seed,
      position: [
        centerX + nx * (side * GORGE_HALF_WIDTH + erosion),
        RIM,
        z + nz * (side * GORGE_HALF_WIDTH + erosion),
      ],
      // Scale the frontage (local X), not the thickness.  The former version
      // varied local Z after a quarter-turn and therefore changed wall depth
      // while leaving the join overlap unchanged.
      scale: [1.02 + (index % 3) * 0.035, 0.96 + (index % 2) * 0.055, 0.96 + Math.abs(erosion) * 0.035],
      yaw: Math.atan2(-tz, tx),
      hero: index < 6,
      lod: index > 5 ? 1 : 0,
      varnish: 0.22 + ((index * 7) % 5) * 0.025,
      dust: 0.12 + (index % 3) * 0.025,
    } satisfies Placement
  })
}

const PLACEMENTS: Placement[] = [
  ...wallRun(-1, [1, 2, 3, 4]),
  ...wallRun(1, [3, 4, 1, 2]),

  // Sparse flood debris stays against the feet. The walking channel remains
  // legible and narrow; freestanding buttes belong outside this camera volume.
  { seed: 8, position: [-2.5, RIM, 6.5], scale: [0.72, 0.62, 0.7], yaw: 1.1, roll: 0.2, lod: 1, varnish: 0.12, dust: 0.28 },
  { seed: 9, position: [2.2, RIM, -2.5], scale: [0.58, 0.5, 0.56], yaw: 4.2, roll: -0.24, lod: 1, varnish: 0.1, dust: 0.3 },
  { seed: 10, position: [-2, RIM, -12], scale: [0.46, 0.4, 0.45], yaw: 2.7, roll: 0.16, lod: 2, varnish: 0.1, dust: 0.34 },
]

/**
 * Quality tiers. `preview` exists because the recorder would otherwise compile
 * this assembly live in the browser: at hero settings that is minutes of ray
 * marching per seed and the tab appears hung.
 */
const QUALITY = {
  preview: { heroCells: 96, backgroundCells: 96, maximumAtlas: 1024 },
  hero: { heroCells: 192, backgroundCells: 128, maximumAtlas: 2048 },
} as const

export type CanyonQuality = keyof typeof QUALITY

/**
 * Nominal LOD0 world area per formation, in square metres, measured from a
 * compile. Needed to choose an atlas *before* the mesh exists.
 */
const NOMINAL_AREA = { wall: 330, butte: 58, block: 12, arch: 72 } as const

function estimatedArea(seed: number, scale: readonly [number, number, number]): number {
  const [x, y, z] = scale
  // Area grows with the mean of the pairwise scale products under non-uniform
  // scale, which is exact for a box and close enough for anything convex-ish.
  return NOMINAL_AREA[formationOf(seed)] * ((x * y + y * z + z * x) / 3)
}

export interface CanyonInstanceRequest {
  seed: number
  cells: number
  atlas: number
}

/** Artifact basename for one instance. Shared by the compiler and the loader. */
export function canyonArtifactName(request: CanyonInstanceRequest): string {
  return `canyon-seed${request.seed}-c${request.cells}-a${request.atlas}`
}

function requestFor(placement: Placement, qualityName: CanyonQuality): CanyonInstanceRequest {
  const quality = QUALITY[qualityName]
  return {
    seed: placement.seed,
    cells: placement.hero ? quality.heroCells : quality.backgroundCells,
    atlas: Math.min(
      quality.maximumAtlas,
      atlasSizeFor(estimatedArea(placement.seed, placement.scale)),
    ),
  }
}

/** The distinct compiles this scene needs at a given quality. */
export function canyonInstanceRequests(
  qualityName: CanyonQuality = 'preview',
): CanyonInstanceRequest[] {
  const unique = new Map<string, CanyonInstanceRequest>()
  for (const placement of PLACEMENTS) {
    const request = requestFor(placement, qualityName)
    unique.set(canyonArtifactName(request), request)
  }
  return [...unique.values()]
}

/**
 * Statically registered artifact URLs.
 *
 * The glob has to appear literally in this module - Vite rewrites it in place -
 * and it must be eager, because the scene needs the URL map before it starts
 * loading. Wrapped in a try/catch for Node, where `import.meta.glob` is undefined.
 */
const ARTIFACT_URLS: Record<string, string> | undefined = (() => {
  try {
    return (import.meta as unknown as {
      glob(pattern: string, options: Record<string, unknown>): Record<string, string>
    }).glob('./canyon/*.{vtopo,vbake}', { query: '?url', import: 'default', eager: true })
  } catch {
    return undefined
  }
})()

const ARTIFACTS = artifactSource(
  ARTIFACT_URLS,
  new URL('./canyon/', import.meta.url),
  '/__terrain-artifacts__/red-sandstone-canyon/canyon/',
)

/**
 * Load one instance from its compiled artifacts.
 *
 * In Node a cache miss falls back to compiling from source, which is slow but
 * correct. In the browser it throws instead: a source compile there is minutes of
 * ray marching on the main thread, and a clear error naming the compiler script is
 * far more useful than a tab that appears to hang.
 */
async function loadInstance(
  request: CanyonInstanceRequest,
): Promise<{ topology: CompiledTopology; surfaceBake: CompiledSurfaceBake; cached: boolean }> {
  const name = canyonArtifactName(request)
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
          `Cached canyon artifact ${name} could not be decoded (${(error as Error).message}). `
          + 'Recompile with `node --import tsx assets/terrain/red-sandstone-canyon/compile-canyon.ts`.',
        )
      }
      // Node: fingerprint or format drift, so rebuild from source below.
    }
  } else if (!canCompileInline) {
    throw new Error(
      `Canyon artifact ${name} is not cached (${ARTIFACTS.count} artifact file(s) visible). `
      + 'Run `node --import tsx assets/terrain/red-sandstone-canyon/compile-canyon.ts` first: '
      + 'compiling this assembly in the browser takes minutes.',
    )
  }
  const built = compileAssetFor(request.seed, request.cells, request.atlas, { diagnostics: false })
  return { topology: built.topology, surfaceBake: built.surfaceBake, cached: false }
}

export async function createCanyonScene(
  options: { aspect?: number; yaw?: number; quality?: CanyonQuality } = {},
) {
  const scene = new Scene()
  scene.name = 'red sandstone canyon / corridor assembly'
  // Warm haze rather than blue: light bouncing between two sunlit red walls is
  // what fills a canyon, so the aerial perspective is warm and the far end of the
  // corridor should glow rather than go grey.
  scene.background = new Color(0xd3a17e)
  scene.fog = new Fog(0xd3a17e, 20, 62)

  const root = new Group()
  root.name = 'canyon assembly'
  const disposers: Array<() => void> = []
  const compiled = new Map<string, Awaited<ReturnType<typeof loadInstance>>>()
  let cachedCount = 0
  let builtCount = 0

  for (const placement of PLACEMENTS) {
    const request = requestFor(placement, options.quality ?? 'preview')
    const key = canyonArtifactName(request)
    let asset = compiled.get(key)
    if (!asset) {
      asset = await loadInstance(request)
      compiled.set(key, asset)
      if (asset.cached) cachedCount += 1
      else builtCount += 1
    }
    const config: CanyonConfig = {
      varnish: placement.varnish ?? 0.5,
      dust: placement.dust ?? 0.18,
      wetness: placement.wetness ?? 0.05,
      lod: placement.lod ?? 0,
      diagnostic: 'beauty',
    }
    const instance = createInstanceFromCompiled(
      asset.topology,
      config,
      placement.seed,
      'compiled',
      asset.surfaceBake,
    )
    instance.root.position.set(...placement.position)
    instance.root.scale.set(...placement.scale)
    instance.root.rotation.set(placement.roll ?? 0, placement.yaw, 0)
    // Bed each formation slightly into the ground so nothing floats on its
    // contact. Scaled by the formation's own height, since the same absolute sink
    // that seats a block would bury it.
    const height = worldScaleFor(placement.seed)[1] * placement.scale[1]
    instance.root.position.y -= 0.02 * height
    root.add(instance.root)
    disposers.push(instance.dispose)
  }
  scene.add(root)

  const groundGeometry = new PlaneGeometry(90, 90)
  const groundMaterial = new MeshPhysicalMaterial({
    name: 'canyon / sand floor',
    color: 0xa96643,
    roughness: 0.99,
    metalness: 0,
  })
  const ground = new Mesh(groundGeometry, groundMaterial)
  ground.rotation.x = -Math.PI / 2
  ground.position.y = -0.02
  ground.receiveShadow = true
  ground.userData.excludeFromExport = true
  scene.add(ground)

  // Same budget discipline as the single-asset preview: the total stays near unit
  // irradiance so iron-oxide reds are not clipped into orange by the ACES curve.
  // High sun, because a canyon is lit by a narrow strip of sky.
  const ambient = new AmbientLight(0xc99579, 0.1)
  const hemisphere = new HemisphereLight(0xffd6ad, 0x4a2019, 0.24)
  const sun = new DirectionalLight(0xffd2a0, 2.2)
  sun.position.set(-7, 24, 5)
  sun.castShadow = true
  // Warm bounce off the sunlit wall, from low down. This is what stops the shaded
  // wall from reading as black and is the most characteristic canyon light effect.
  const bounce = new DirectionalLight(0xd66f43, 0.42)
  bounce.position.set(8, 1, 5)
  scene.add(ambient, hemisphere, sun, bounce)

  // Human eye level inside the slot. The upward look exposes the narrow sky cut,
  // opposed overhangs, and receding pinches that establish scale in the reference.
  const camera = new PerspectiveCamera(50, options.aspect ?? 1.6, 0.05, 240)
  const yaw = ((options.yaw ?? 0) * Math.PI) / 180
  camera.position.set(Math.sin(yaw) * 1.1 - 0.25, 1.72, Math.cos(yaw) * 2.2 + 18.8)
  camera.lookAt(-0.7, 4.25, -10.5)
  scene.add(camera)

  if (builtCount > 0) {
    console.warn(
      `canyon assembly: ${cachedCount} instance(s) from cache, ${builtCount} compiled from source. `
      + 'Run `node --import tsx assets/terrain/red-sandstone-canyon/compile-canyon.ts` to cache them.',
    )
  }

  return {
    scene,
    camera,
    root,
    update: () => undefined,
    dispose: () => {
      for (const dispose of disposers) dispose()
      groundGeometry.dispose()
      groundMaterial.dispose()
    },
  }
}

export const createPreview = (options: { aspect?: number } = {}) => createCanyonScene(options)
export const createHeroPreview = (options: { aspect?: number } = {}) => createCanyonScene({ ...options, quality: 'hero' })
export const createCanyonLeft = (options: { aspect?: number } = {}) => createCanyonScene({ ...options, yaw: -28 })
export const createCanyonRight = (options: { aspect?: number } = {}) => createCanyonScene({ ...options, yaw: 30 })
export default createPreview
