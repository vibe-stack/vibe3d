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
 * A gorge cut into a plateau: two continuous walls facing each other across a
 * sandy floor, with talus at their feet and buttes standing behind the rim.
 *
 * Three rules make this read as a canyon rather than as a row of rocks, and the
 * first assembly broke all three.
 *
 * Segments overlap. A wall is 12m of frontage placed every 8.4m, so consecutive
 * segments interpenetrate by about a third and the joins are inside solid rock. The
 * previous layout spaced instances several metres apart, which is why it read as
 * "disconnected meshes placed spaced from each other" - the gaps *were* the
 * silhouette.
 *
 * The rim is level. Beds are cut at fixed domain heights and the top bed is hard,
 * so every wall segment at the same Y scale carries its plateau surface at the same
 * world height. That shared skyline is what makes the two runs read as one
 * formation with a gorge cut through it.
 *
 * The walls face each other. A wall's broad carved faces are its +/-Z faces, so a
 * segment is yawed a quarter turn to present that face across the gorge, and the
 * two runs are yawed oppositely.
 */
const RIM = 0
const WALL_STEP = 8.4
const GORGE_HALF_WIDTH = 7.2
const QUARTER = Math.PI / 2

function wallRun(side: -1 | 1, seeds: number[]): Placement[] {
  return seeds.map((seed, index) => {
    const jitter = ((index * 37) % 11) / 11 - 0.5
    return {
      seed,
      // Depth jitter only. Pulling a segment along its own run would open a gap,
      // so the variation is in how far it stands out into the gorge.
      position: [side * (GORGE_HALF_WIDTH + jitter * 1.1), RIM, -18 + index * WALL_STEP],
      scale: [1, 1, 1 + jitter * 0.12],
      yaw: side * QUARTER + jitter * 0.06,
      hero: index < 3,
      lod: index > 3 ? 1 : 0,
      varnish: 0.5 + jitter * 0.16,
    } satisfies Placement
  })
}

const PLACEMENTS: Placement[] = [
  ...wallRun(-1, [1, 2, 3, 4, 1]),
  ...wallRun(1, [3, 4, 1, 2, 4]),

  // Buttes set back behind the rim, so the skyline is not a flat line and the
  // formation continues past the gorge.
  { seed: 5, position: [-15.5, RIM, -9], scale: [1.1, 1.05, 1.1], yaw: 0.8, lod: 1, varnish: 0.4, dust: 0.26 },
  { seed: 6, position: [16.5, RIM, -2], scale: [0.95, 1.2, 0.95], yaw: 2.4, lod: 1, varnish: 0.36, dust: 0.28 },
  { seed: 7, position: [-17, RIM, 6], scale: [1.2, 0.9, 1.2], yaw: 4.6, lod: 2, varnish: 0.3, dust: 0.32 },
  { seed: 5, position: [14, RIM, 12], scale: [1, 0.85, 1], yaw: 1.5, lod: 2, varnish: 0.34, dust: 0.3 },

  // Talus at the foot of each wall: blocks that fell from the face above, so they
  // sit against the wall rather than out in the middle of the floor. Rolled, which
  // tilts their bedding - the cue that separates a fallen block from a small
  // standing outcrop.
  { seed: 8, position: [-5.6, RIM, -12], scale: [1.3, 1.2, 1.25], yaw: 1.1, roll: 0.24, lod: 1, varnish: 0.18, dust: 0.36 },
  { seed: 9, position: [5.2, RIM, -6.5], scale: [1.1, 1, 1.05], yaw: 4.2, roll: -0.31, lod: 1, varnish: 0.16, dust: 0.4 },
  { seed: 10, position: [-4.9, RIM, -1], scale: [0.85, 0.8, 0.85], yaw: 2.7, roll: 0.18, lod: 1, varnish: 0.2, dust: 0.34 },
  { seed: 8, position: [4.6, RIM, 4], scale: [0.7, 0.62, 0.68], yaw: 5.4, roll: -0.42, lod: 2, varnish: 0.14, dust: 0.44 },
  { seed: 9, position: [-3.2, RIM, 8], scale: [0.55, 0.5, 0.55], yaw: 0.4, roll: 0.36, lod: 2, varnish: 0.12, dust: 0.48 },
  { seed: 10, position: [1.4, RIM, -3.5], scale: [0.42, 0.38, 0.42], yaw: 3.3, roll: -0.2, lod: 2, varnish: 0.12, dust: 0.5 },
]

/**
 * Quality tiers. `preview` exists because the recorder would otherwise compile
 * this assembly live in the browser: at hero settings that is minutes of ray
 * marching per seed and the tab appears hung.
 */
const QUALITY = {
  preview: { heroCells: 96, backgroundCells: 96, maximumAtlas: 512 },
  hero: { heroCells: 192, backgroundCells: 128, maximumAtlas: 1024 },
} as const

export type CanyonQuality = keyof typeof QUALITY

/**
 * Nominal LOD0 world area per formation, in square metres, measured from a
 * compile. Needed to choose an atlas *before* the mesh exists.
 */
const NOMINAL_AREA = { wall: 144, butte: 58, block: 12 } as const

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
  scene.background = new Color(0x9a7a68)
  scene.fog = new Fog(0x9a7a68, 22, 78)

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

  const groundGeometry = new PlaneGeometry(220, 220)
  const groundMaterial = new MeshPhysicalMaterial({
    name: 'canyon / sand floor',
    color: 0x8a6248,
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
  const ambient = new AmbientLight(0xa8bed4, 0.16)
  const hemisphere = new HemisphereLight(0xdce8f4, 0x5a3a28, 0.36)
  const sun = new DirectionalLight(0xffe0b0, 1.9)
  sun.position.set(-11, 20, 9)
  sun.castShadow = true
  // Warm bounce off the sunlit wall, from low down. This is what stops the shaded
  // wall from reading as black and is the most characteristic canyon light effect.
  const bounce = new DirectionalLight(0xc87a4a, 0.5)
  bounce.position.set(12, -3, 6)
  scene.add(ambient, hemisphere, sun, bounce)

  // Looking into the gorge from near the rim, which is the view the formation is
  // built for: the plateau surface reads as a surface, both walls are visible at
  // once, and the floor recedes between them.
  const camera = new PerspectiveCamera(44, options.aspect ?? 1.6, 0.05, 400)
  const yaw = ((options.yaw ?? 0) * Math.PI) / 180
  const radius = 26
  camera.position.set(Math.sin(yaw) * radius * 0.4 - 1.5, 11.5, Math.cos(yaw) * radius + 4)
  camera.lookAt(0, 3.4, -9)
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
