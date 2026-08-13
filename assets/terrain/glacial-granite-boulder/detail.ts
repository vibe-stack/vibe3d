/**
 * Runtime side of the shared granite micro-detail tile.
 *
 * The tile is projected triplanar from world position, not sampled through the
 * atlas UVs, for the reason the cliff scene makes unavoidable: placements carry
 * non-uniform scales up to 30x. Anything driven by atlas UVs stretches with the
 * instance, so a 30 m monolith would show 30 m crystals. World-space projection
 * pins the grain to a real physical size no matter how the instance is scaled,
 * which is the whole point of separating this band from the atlas.
 */

import {
  DataTexture,
  LinearFilter,
  LinearMipmapLinearFilter,
  NoColorSpace,
  RGBAFormat,
  RepeatWrapping,
  UnsignedByteType,
} from 'three/webgpu'
import {
  abs,
  cameraViewMatrix,
  float,
  max as tslMax,
  normalWorld,
  normalize as tslNormalize,
  positionWorld,
  pow,
  sign,
  sqrt,
  texture,
  vec2,
  vec3,
  vec4,
} from 'three/tsl'
import {
  decodeCompiledSurfaceBake,
  type CompiledSurfaceBake,
} from '../../../packages/terrain/src/index.ts'
import {
  DETAIL_TILE_METRES,
  type DetailBakeIdentity,
} from '../shared/detail-bake.ts'

export const DETAIL_SEED = 1

/**
 * The detail tile is shared, so its identity is its own rather than any one
 * outcrop's. `topologyKey` is a constant because the tile is not derived from a
 * topology at all - it is a material input, and rebuilding a mesh must not
 * invalidate it.
 */
export const DETAIL_IDENTITY: DetailBakeIdentity = {
  assetId: 'granite-detail',
  topologyKey: 'granite-detail-tile',
  recipeHash: 'granite-crystal-mosaic-detail-v1',
  compilerHash: 'periodic-cellular-mosaic-bake-v1',
  profile: 'game',
}

export interface GraniteDetailTextures {
  /** normal.xy + height + ambient occlusion. */
  normalHeightAo: DataTexture
  bytes: number
}

let detailBakePromise: Promise<CompiledSurfaceBake> | undefined

async function readDetailArtifact(): Promise<Uint8Array> {
  const url = new URL('./granite-detail.vbake', import.meta.url)
  if (url.protocol === 'file:') {
    const [{ readFile }, { fileURLToPath }] = await Promise.all([
      import(/* @vite-ignore */ 'node:fs/promises'),
      import(/* @vite-ignore */ 'node:url'),
    ])
    return readFile(fileURLToPath(url))
  }
  const response = await fetch(url)
  if (!response.ok) throw new Error(`Unable to load the granite detail tile: ${response.status}`)
  return new Uint8Array(await response.arrayBuffer())
}

export async function loadGraniteDetailBake(): Promise<CompiledSurfaceBake> {
  detailBakePromise ??= readDetailArtifact().then(decodeCompiledSurfaceBake)
  return detailBakePromise
}

function detailChannel(
  bake: CompiledSurfaceBake,
  semantic: CompiledSurfaceBake['channels'][number]['semantic'],
  components: number,
): Uint8Array {
  const channel = bake.channels.find((candidate) => candidate.semantic === semantic)
  if (!channel || channel.components !== components) {
    throw new Error(`granite detail tile must carry ${semantic} with ${components} component(s)`)
  }
  return channel.data
}

function detailTexture(
  data: Uint8Array,
  size: number,
  format: typeof RGBAFormat,
  name: string,
): DataTexture {
  const result = new DataTexture(data, size, size, format, UnsignedByteType)
  result.name = `granite detail / ${name}`
  result.colorSpace = NoColorSpace
  // The whole tile exists to be repeated; clamping it would put a seam every
  // 256 mm instead of the seamless wrap it was generated for.
  result.wrapS = RepeatWrapping
  result.wrapT = RepeatWrapping
  result.magFilter = LinearFilter
  result.minFilter = LinearMipmapLinearFilter
  result.generateMipmaps = true
  // Eight samples preserve grazing-angle grain without doubling the cost of
  // every close-up texture lookup on the recorder's full-screen terrain pass.
  result.anisotropy = 8
  result.flipY = false
  result.needsUpdate = true
  return result
}

/** Pack all runtime detail into one texture; normal z is reconstructed. */
export function createGraniteDetailTextures(bake: CompiledSurfaceBake): GraniteDetailTextures {
  if (bake.domain !== 'triplanar') {
    throw new Error(`granite detail tile must be a triplanar bake, not ${bake.domain}`)
  }
  if (bake.width !== bake.height) throw new Error('granite detail tile must be square')
  const normal = detailChannel(bake, 'normal-tangent', 3)
  const height = detailChannel(bake, 'height', 1)
  const occlusion = detailChannel(bake, 'ambient-occlusion', 1)
  const texels = bake.width * bake.height

  const normalHeightAo = new Uint8Array(texels * 4)
  for (let texel = 0; texel < texels; texel += 1) {
    normalHeightAo[texel * 4] = normal[texel * 3]!
    normalHeightAo[texel * 4 + 1] = normal[texel * 3 + 1]!
    normalHeightAo[texel * 4 + 2] = height[texel]!
    normalHeightAo[texel * 4 + 3] = occlusion[texel]!
  }
  return {
    normalHeightAo: detailTexture(normalHeightAo, bake.width, RGBAFormat, 'normal.xy + height + ao'),
    bytes: texels * 4,
  }
}

export function disposeGraniteDetailTextures(textures: GraniteDetailTextures): void {
  textures.normalHeightAo.dispose()
}

type Node = ReturnType<typeof vec3>

export interface GraniteDetailNodes {
  /** Perturbation to add to the base view-space normal before renormalising. */
  viewNormalOffset: Node
  /** Grain relief, -1 at a boundary crack to +1 on a proud quartz crystal. */
  height: Node
  /** Ambient occlusion: 1 on open crystal faces, lower inside boundary cracks and pits. */
  ambientOcclusion: Node
  /** Continuous crystal tone, 0 at biotite through to 1 at pale plagioclase. */
  albedo: Node
  /** Per-grain roughness, 0..1 around a nominal 0.5. */
  roughness: Node
}

/**
 * Reconstruct a unit normal from the stored xy. z is always positive for a
 * height-field normal, so the sign is never ambiguous.
 */
function unpackNormal(sample: ReturnType<typeof texture>): Node {
  const xy = sample.xy.mul(2).sub(1)
  const z = sqrt(tslMax(0, float(1).sub(xy.x.mul(xy.x)).sub(xy.y.mul(xy.y))))
  return vec3(xy.x, xy.y, z)
}

/**
 * Build the triplanar detail nodes.
 *
 * Blending uses the whiteout construction rather than simply averaging three
 * tangent-space normals: averaging flattens detail wherever two projections
 * contribute, so every 45-degree face on the outcrop would lose its grain exactly
 * where the fracture faces are.
 */
export function graniteDetailSurface(
  textures: GraniteDetailTextures,
  options: { strength?: number; tileMetres?: number } = {},
): GraniteDetailNodes {
  const strength = options.strength ?? 1
  const tile = options.tileMetres ?? DETAIL_TILE_METRES
  const frequency = 1 / tile

  const worldNormal = normalWorld
  const axisWeight = pow(abs(worldNormal), 5)
  const weightSum = axisWeight.x.add(axisWeight.y).add(axisWeight.z)
  const blend = axisWeight.div(weightSum)
  const axisSign = sign(worldNormal)

  const projected = () => {
    const p = positionWorld.mul(frequency)
    // Each plane's UVs are flipped by the facing sign so opposite faces are not
    // mirror images of one another, which reads as a fold line along the silhouette.
    const uvX = vec2(p.z.mul(axisSign.x), p.y)
    const uvY = vec2(p.x, p.z.mul(axisSign.y))
    const uvZ = vec2(p.x.mul(axisSign.z.negate()), p.y)
    const sampleX = texture(textures.normalHeightAo, uvX)
    const sampleY = texture(textures.normalHeightAo, uvY)
    const sampleZ = texture(textures.normalHeightAo, uvZ)
    const normalX = unpackNormal(sampleX)
    const normalY = unpackNormal(sampleY)
    const normalZ = unpackNormal(sampleZ)
    // Whiteout blend: add the world normal's off-axis components into the
    // tangent normal, then swizzle each result back into world orientation.
    const worldX = vec3(
      normalX.z.mul(axisSign.x),
      normalX.y.add(worldNormal.y),
      normalX.x.add(worldNormal.z),
    )
    const worldY = vec3(
      normalY.x.add(worldNormal.x),
      normalY.z.mul(axisSign.y),
      normalY.y.add(worldNormal.z),
    )
    const worldZ = vec3(
      normalZ.x.add(worldNormal.x),
      normalZ.y.add(worldNormal.y),
      normalZ.z.mul(axisSign.z),
    )
    const combinedNormal = worldX.mul(blend.x).add(worldY.mul(blend.y)).add(worldZ.mul(blend.z))
    const combinedHeight = sampleX.b.mul(blend.x).add(sampleY.b.mul(blend.y)).add(sampleZ.b.mul(blend.z))
    const combinedAo = sampleX.a.mul(blend.x).add(sampleY.a.mul(blend.y)).add(sampleZ.a.mul(blend.z))
    return { normal: combinedNormal, height: combinedHeight, ambientOcclusion: combinedAo }
  }

  // One physical-scale triplanar projection is sufficient here. The old second
  // projection plus a separate mineral projection multiplied the close-up path
  // to nine anisotropic texture fetches per pixel, even though all of the useful
  // relief was already present in this packed sample.
  const detail = projected()
  const detailNormal = tslNormalize(detail.normal)
  // The offset is the tangential difference from the geometric normal. Rotating
  // that difference into view space is exact - the view matrix has no scale - so
  // the detail composes correctly onto a bake normal that had to be transformed
  // by a normal matrix under the cliff scene's non-uniform placement scales.
  const worldOffset = detailNormal.sub(worldNormal).mul(strength)
  // Rotate, do not re-normalise. transformDirection() mirrors Vector3's version
  // and normalises its result, which would turn this small tangential offset
  // into a full unit vector and let it swamp the normal it is meant to nudge -
  // with the side effect that `strength` stops doing anything at all.
  const viewNormalOffset = cameraViewMatrix.mul(vec4(worldOffset, 0)).xyz

  const height = detail.height.mul(2).sub(1)
  const ambientOcclusion = detail.ambientOcclusion

  // Pigment and roughness stay correlated with the crystal relief while sharing
  // its already-fetched channels. Proud, open crystals trend pale and smoother;
  // pits and boundaries trend dark and rough. This retains the scan-like cue
  // without three additional mineral texture samples.
  const albedo = detail.height.mul(0.62).add(ambientOcclusion.mul(0.38))
  const roughness = ambientOcclusion.mul(-0.28).add(detail.height.mul(-0.12)).add(0.7)

  return { viewNormalOffset, height, ambientOcclusion, albedo, roughness }
}
