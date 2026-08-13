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
import { atlasSizeFor, compileAssetFor } from './topology.ts'
import { formationOf } from './field.ts'
import { createInstanceFromCompiled, type OutcropConfig } from './model.ts'

interface Placement {
  seed: number
  position: [number, number, number]
  /** Non-uniform scale. The object-space normal bake stays correct under it. */
  scale: [number, number, number]
  yaw: number
  roll?: number
  hero?: boolean
  lod?: 0 | 1 | 2
  lichen?: number
  wetness?: number
}

/**
 * An alpine outcrop assembled around genuinely different field massings.  The
 * arch, tor, prow, bench, monolith, and erratic remain individually legible; no
 * rear row is allowed to collapse them back into one rectangular facade.
 */
const PLACEMENTS: Placement[] = [
  // Hero window with daylight through it, backed only by distant offset masses.
  { seed: 3, position: [0.1, 0, -2.3], scale: [2.25, 2.15, 1.55], yaw: 0.08, hero: true, lichen: 0.14 },
  // Castellated residual tor and low glacial bench.
  { seed: 4, position: [-4.4, 0, -3.9], scale: [1.7, 1.65, 1.55], yaw: 0.62, hero: true, lichen: 0.18 },
  { seed: 5, position: [4.5, 0, -3.5], scale: [1.7, 1.35, 1.55], yaw: 5.55, hero: true, lichen: 0.2 },
  // A narrow monolith and asymmetric prow establish a second silhouette tier.
  { seed: 6, position: [6.8, 0, -5.6], scale: [1.25, 2.1, 1.25], yaw: 0.42, lichen: 0.1 },
  { seed: 2, position: [-7.1, 0, -5.5], scale: [1.55, 1.7, 1.45], yaw: 5.72, lichen: 0.12 },
  // One transported erratic overlaps the tor's foot without forming a wall.
  { seed: 1, position: [-3.0, 0, -0.8], scale: [1.05, 0.9, 1.0], yaw: 2.4, hero: true, lichen: 0.24 },

  // Foot scree: same recipe, small and tumbled.
  { seed: 2, position: [-0.6, 0, 1.7], scale: [0.5, 0.42, 0.46], yaw: 2.2, roll: 0.5, lod: 1, wetness: 0.3 },
  { seed: 5, position: [1.9, 0, 2.4], scale: [0.38, 0.3, 0.36], yaw: 4.4, roll: -0.7, lod: 1, wetness: 0.34 },
  { seed: 3, position: [-3.4, 0, 2.1], scale: [0.42, 0.34, 0.4], yaw: 1.1, roll: 0.3, lod: 1, wetness: 0.28 },
  { seed: 7, position: [4.4, 0, 1.6], scale: [0.34, 0.28, 0.32], yaw: 5.6, roll: 0.9, lod: 2, wetness: 0.3 },
  { seed: 4, position: [3.0, 0, 3.4], scale: [0.26, 0.22, 0.25], yaw: 0.4, roll: -0.4, lod: 2, wetness: 0.36 },
  { seed: 6, position: [-1.9, 0, 3.6], scale: [0.22, 0.18, 0.21], yaw: 3.9, roll: 0.6, lod: 2, wetness: 0.38 },
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
 * Nominal LOD0 surface area at unit scale, in square metres, used to pick an
 * atlas before the mesh exists. Scaling by the mean of the pairwise scale
 * products approximates how area grows under non-uniform scale.
 */
const NOMINAL_UNIT_AREA = 16.5

function estimatedArea(scale: readonly [number, number, number]): number {
  const [x, y, z] = scale
  return NOMINAL_UNIT_AREA * ((x * y + y * z + z * x) / 3)
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
  scene.name = 'fractured granite / cliff assembly'
  scene.background = new Color(0x2a3946)
  scene.fog = new Fog(0x2a3946, 16, 46)

  const root = new Group()
  root.name = 'cliff assembly'
  const disposers: Array<() => void> = []
  const instances: Array<ReturnType<typeof createInstanceFromCompiled>> = []
  const compiled = new Map<string, Awaited<ReturnType<typeof loadInstance>>>()
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
      snow: 0,
      wetness: placement.wetness ?? 0.12,
      lichen: placement.lichen ?? 0.16,
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
    instance.root.userData.formation = formationOf(placement.seed)
    // Bed each block slightly into the ground so nothing floats on its contact.
    instance.root.position.y -= 0.08 * placement.scale[1]
    root.add(instance.root)
    instances.push(instance)
    disposers.push(instance.dispose)
  }
  scene.add(root)

  const groundGeometry = new PlaneGeometry(90, 90)
  const groundMaterial = new MeshPhysicalMaterial({
    name: 'cliff / alpine floor',
    color: 0x3b4038,
    roughness: 0.97,
    metalness: 0,
  })
  const ground = new Mesh(groundGeometry, groundMaterial)
  ground.rotation.x = -Math.PI / 2
  ground.position.y = -0.02
  ground.receiveShadow = true
  ground.userData.excludeFromExport = true
  scene.add(ground)

  // Same budget discipline as the single-asset preview: total intensity stays
  // near unit irradiance so granite albedo is not clipped by the ACES curve.
  const ambient = new AmbientLight(0x9fb4c2, 0.14)
  const hemisphere = new HemisphereLight(0xc6d9e4, 0x1c221f, 0.34)
  const key = new DirectionalLight(0xfff0d8, 1.95)
  key.position.set(-9, 11, 7)
  key.castShadow = true
  const rim = new DirectionalLight(0xb9d2e4, 0.5)
  rim.position.set(7, 5, -9)
  scene.add(ambient, hemisphere, key, rim)

  const camera = new PerspectiveCamera(38, options.aspect ?? 1.6, 0.05, 200)
  const yaw = ((options.yaw ?? 0) * Math.PI) / 180
  const radius = 17.5
  camera.position.set(Math.sin(yaw) * radius, 5.1, Math.cos(yaw) * radius + 1.5)
  camera.lookAt(0, 2.25, -2.8)
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
    update: (deltaSeconds: number) => {
      for (const instance of instances) instance.update(deltaSeconds, camera)
    },
    dispose: () => {
      for (const dispose of disposers) dispose()
      groundGeometry.dispose()
      groundMaterial.dispose()
    },
  }
}

export const createPreview = (options: { aspect?: number } = {}) => createCliffScene(options)
export const createHeroPreview = (options: { aspect?: number } = {}) => createCliffScene({ ...options, quality: 'hero' })
export const createCliffLeft = (options: { aspect?: number } = {}) => createCliffScene({ ...options, yaw: -32 })
export const createCliffRight = (options: { aspect?: number } = {}) => createCliffScene({ ...options, yaw: 34 })
export default createPreview
