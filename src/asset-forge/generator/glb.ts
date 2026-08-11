import {
  BufferGeometry,
  Color,
  DataTexture,
  Float32BufferAttribute,
  Group,
  InstancedMesh,
  LinearFilter,
  LinearMipmapLinearFilter,
  Matrix4,
  Mesh,
  MeshPhysicalMaterial,
  RepeatWrapping,
  RGBAFormat,
  SRGBColorSpace,
  Texture,
  UnsignedByteType,
  type BufferAttribute,
  type InterleavedBufferAttribute,
  type Object3D,
} from 'three/webgpu'
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js'

export interface StaticGlbOptions {
  /** Resolution of each embedded baked wear texture. */
  readonly textureSize?: number
  /** Additional objects to omit from the static snapshot. */
  readonly exclude?: (object: Object3D) => boolean
}

export interface StaticGlbSnapshot {
  readonly root: Object3D
  dispose(): void
}

interface SurfaceProfile {
  readonly colour: readonly [number, number, number]
  readonly roughness: number
  readonly metalness: number
  readonly rub: number
  readonly grime: number
  readonly scratch: number
}

interface GeometryBucket {
  readonly profile: SurfaceProfile
  readonly positions: number[]
  readonly normals: number[]
  readonly uvs: number[]
  readonly colours: number[]
}

interface BakeContext {
  readonly textureSize: number
  readonly materials: Map<string, MeshPhysicalMaterial>
  readonly standardMaterials: Map<MeshPhysicalMaterial, MeshPhysicalMaterial>
  readonly ownedGeometries: Set<BufferGeometry>
  readonly ownedMaterials: Set<MeshPhysicalMaterial>
  readonly ownedTextures: Set<Texture>
  readonly geometryVariants: Map<BufferGeometry, Map<string, BufferGeometry>>
  readonly preparedNormalMaterials: Set<MeshPhysicalMaterial>
}

type ReadableAttribute = BufferAttribute | InterleavedBufferAttribute

const WEAR_ATTRIBUTE_NAMES = ['aMask', 'aColor', 'aSurface', 'aWearDir'] as const

/**
 * Clones a model into a static, glTF-safe hierarchy. Preview-only node
 * materials are replaced without mutating the live model.
 */
export function createStaticGlbSnapshot(
  source: Object3D,
  options: StaticGlbOptions = {},
): StaticGlbSnapshot {
  const root = source.clone(true)
  root.name = source.name || 'static-model'
  root.userData = {
    ...root.userData,
    staticGlb: true,
    animations: 'omitted',
    proceduralWear: 'baked to vertex colors and PBR textures',
  }

  const context: BakeContext = {
    textureSize: Math.max(32, Math.round(options.textureSize ?? 512)),
    materials: new Map(),
    standardMaterials: new Map(),
    ownedGeometries: new Set(),
    ownedMaterials: new Set(),
    ownedTextures: new Set(),
    geometryVariants: new Map(),
    preparedNormalMaterials: new Set(),
  }

  const excluded: Object3D[] = []
  const wornMeshes: Mesh[] = []
  root.traverse((object) => {
    if (object !== root && (object.userData.excludeFromExport === true || options.exclude?.(object))) {
      excluded.push(object)
      return
    }
    if (object instanceof Mesh && hasWearAttributes(object.geometry)) wornMeshes.push(object)
  })
  for (const object of excluded) object.removeFromParent()
  expandInstancedMeshes(root)

  for (const mesh of wornMeshes) {
    if (!mesh.parent) continue
    const replacement = bakeWearMesh(mesh, context)
    mesh.parent.add(replacement)
    mesh.removeFromParent()
  }
  prepareStandardMaterials(root, context)
  prepareGeometryForExport(root, context)

  return {
    root,
    dispose: () => {
      for (const geometry of context.ownedGeometries) geometry.dispose()
      for (const material of context.ownedMaterials) material.dispose()
      for (const texture of context.ownedTextures) texture.dispose()
    },
  }
}

function prepareStandardMaterials(root: Object3D, context: BakeContext): void {
  root.traverse((object) => {
    if (!(object instanceof Mesh)) return
    const sources = Array.isArray(object.material) ? object.material : [object.material]
    const materials = sources.map((source) => {
      if (!(source instanceof MeshPhysicalMaterial) || context.ownedMaterials.has(source)) return source
      const existing = context.standardMaterials.get(source)
      if (existing) return existing
      const material = source.clone()
      packDataTextureOrm(material, context)
      context.standardMaterials.set(source, material)
      context.ownedMaterials.add(material)
      return material
    })
    object.material = Array.isArray(object.material) ? materials : materials[0]!
  })
}

function expandInstancedMeshes(root: Object3D): void {
  const instances: InstancedMesh[] = []
  root.traverse((object) => {
    if (object instanceof InstancedMesh) instances.push(object)
  })
  const matrix = new Matrix4()
  for (const source of instances) {
    if (!source.parent) continue
    const group = new Group()
    group.name = source.name
    group.position.copy(source.position)
    group.quaternion.copy(source.quaternion)
    group.scale.copy(source.scale)
    group.visible = source.visible
    group.userData = { ...source.userData, gpuInstances: 'expanded for portable glTF' }
    for (let index = 0; index < source.count; index += 1) {
      source.getMatrixAt(index, matrix)
      const mesh = new Mesh(source.geometry, source.material)
      mesh.name = `${source.name} / instance ${String(index + 1).padStart(2, '0')}`
      matrix.decompose(mesh.position, mesh.quaternion, mesh.scale)
      mesh.castShadow = source.castShadow
      mesh.receiveShadow = source.receiveShadow
      group.add(mesh)
    }
    source.parent.add(group)
    source.removeFromParent()
  }
}

function prepareGeometryForExport(root: Object3D, context: BakeContext): void {
  root.traverse((object) => {
    if (!(object instanceof Mesh)) return
    const materials = Array.isArray(object.material) ? object.material : [object.material]
    const usesUv = materials.some(materialUsesUv)
    const usesNormalMap = materials.some((material) => (
      material instanceof MeshPhysicalMaterial && material.normalMap !== null
    ))
    const variantKey = `${usesUv ? 'uv' : 'no-uv'}/${usesNormalMap ? 'tangent' : 'no-tangent'}`
    object.geometry = geometryVariant(object.geometry, variantKey, context, (geometry) => {
      stripNonGltfAttributes(geometry)
      if (!usesUv) geometry.deleteAttribute('uv')
      if (usesNormalMap) {
        if (!geometry.getAttribute('uv')) {
          throw new Error(`Cannot export normal-mapped mesh without UVs: ${object.name}`)
        }
        computePortableTangents(geometry)
      } else {
        geometry.deleteAttribute('tangent')
      }
      geometry.computeBoundingSphere()
    })
    for (const material of materials) {
      if (!(material instanceof MeshPhysicalMaterial) || context.preparedNormalMaterials.has(material)) continue
      prepareDataTextureNormal(material, usesNormalMap, context)
      context.preparedNormalMaterials.add(material)
    }
  })
}

/**
 * Computes explicit glTF tangent frames and supplies a normalized fallback
 * when a triangle's UVs collapse to a point or line. Three's built-in tangent
 * builder leaves those vertices at (0, 0, 0), which glTF correctly rejects.
 */
function computePortableTangents(geometry: BufferGeometry): void {
  const position = geometry.getAttribute('position')
  const normal = geometry.getAttribute('normal')
  const uv = geometry.getAttribute('uv')
  const index = geometry.index
  const tangentSum = new Float64Array(position.count * 3)
  const bitangentSum = new Float64Array(position.count * 3)
  const triangleIndices = index?.count ?? position.count

  for (let offset = 0; offset < triangleIndices; offset += 3) {
    const ia = index?.getX(offset) ?? offset
    const ib = index?.getX(offset + 1) ?? offset + 1
    const ic = index?.getX(offset + 2) ?? offset + 2
    const edge1: [number, number, number] = [
      position.getX(ib) - position.getX(ia),
      position.getY(ib) - position.getY(ia),
      position.getZ(ib) - position.getZ(ia),
    ]
    const edge2: [number, number, number] = [
      position.getX(ic) - position.getX(ia),
      position.getY(ic) - position.getY(ia),
      position.getZ(ic) - position.getZ(ia),
    ]
    const du1 = uv.getX(ib) - uv.getX(ia)
    const dv1 = uv.getY(ib) - uv.getY(ia)
    const du2 = uv.getX(ic) - uv.getX(ia)
    const dv2 = uv.getY(ic) - uv.getY(ia)
    const determinant = du1 * dv2 - du2 * dv1
    let tangent: [number, number, number]
    let bitangent: [number, number, number]

    if (Number.isFinite(determinant) && Math.abs(determinant) > 1e-10) {
      const inverse = 1 / determinant
      tangent = [
        (edge1[0] * dv2 - edge2[0] * dv1) * inverse,
        (edge1[1] * dv2 - edge2[1] * dv1) * inverse,
        (edge1[2] * dv2 - edge2[2] * dv1) * inverse,
      ]
      bitangent = [
        (edge2[0] * du1 - edge1[0] * du2) * inverse,
        (edge2[1] * du1 - edge1[1] * du2) * inverse,
        (edge2[2] * du1 - edge1[2] * du2) * inverse,
      ]
    } else {
      tangent = squaredLength(edge1) >= squaredLength(edge2) ? edge1 : edge2
      const averageNormal = normalize3([
        normal.getX(ia) + normal.getX(ib) + normal.getX(ic),
        normal.getY(ia) + normal.getY(ib) + normal.getY(ic),
        normal.getZ(ia) + normal.getZ(ib) + normal.getZ(ic),
      ], [0, 1, 0])
      tangent = orthogonalize(tangent, averageNormal)
      if (squaredLength(tangent) < 1e-20) tangent = fallbackTangent(averageNormal)
      bitangent = cross3(averageNormal, tangent)
    }

    for (const vertex of [ia, ib, ic]) {
      const target = vertex * 3
      tangentSum[target] += tangent[0]
      tangentSum[target + 1] += tangent[1]
      tangentSum[target + 2] += tangent[2]
      bitangentSum[target] += bitangent[0]
      bitangentSum[target + 1] += bitangent[1]
      bitangentSum[target + 2] += bitangent[2]
    }
  }

  const tangents = new Float32Array(position.count * 4)
  for (let vertex = 0; vertex < position.count; vertex += 1) {
    const source = vertex * 3
    const target = vertex * 4
    const n = normalize3([
      normal.getX(vertex),
      normal.getY(vertex),
      normal.getZ(vertex),
    ], [0, 1, 0])
    let tangent = orthogonalize([
      tangentSum[source],
      tangentSum[source + 1],
      tangentSum[source + 2],
    ], n)
    tangent = normalize3(tangent, fallbackTangent(n))
    const bitangent: [number, number, number] = [
      bitangentSum[source],
      bitangentSum[source + 1],
      bitangentSum[source + 2],
    ]
    const handedness = dot3(cross3(n, tangent), bitangent) < 0 ? -1 : 1
    tangents[target] = tangent[0]
    tangents[target + 1] = tangent[1]
    tangents[target + 2] = tangent[2]
    tangents[target + 3] = handedness
  }
  geometry.setAttribute('tangent', new Float32BufferAttribute(tangents, 4))
}

function orthogonalize(
  vector: [number, number, number],
  normal: [number, number, number],
): [number, number, number] {
  const projection = dot3(vector, normal)
  return [
    vector[0] - normal[0] * projection,
    vector[1] - normal[1] * projection,
    vector[2] - normal[2] * projection,
  ]
}

function fallbackTangent(normal: [number, number, number]): [number, number, number] {
  const absolute = normal.map(Math.abs)
  const helper: [number, number, number] = absolute[0] <= absolute[1] && absolute[0] <= absolute[2]
    ? [1, 0, 0]
    : absolute[1] <= absolute[2]
      ? [0, 1, 0]
      : [0, 0, 1]
  return normalize3(cross3(helper, normal), [1, 0, 0])
}

function normalize3(
  vector: [number, number, number],
  fallback: [number, number, number],
): [number, number, number] {
  const length = Math.sqrt(squaredLength(vector))
  return Number.isFinite(length) && length > 1e-10
    ? [vector[0] / length, vector[1] / length, vector[2] / length]
    : fallback
}

function cross3(
  left: [number, number, number],
  right: [number, number, number],
): [number, number, number] {
  return [
    left[1] * right[2] - left[2] * right[1],
    left[2] * right[0] - left[0] * right[2],
    left[0] * right[1] - left[1] * right[0],
  ]
}

function dot3(left: [number, number, number], right: [number, number, number]): number {
  return left[0] * right[0] + left[1] * right[1] + left[2] * right[2]
}

function squaredLength(vector: [number, number, number]): number {
  return dot3(vector, vector)
}

function geometryVariant(
  source: BufferGeometry,
  key: string,
  context: BakeContext,
  prepare: (geometry: BufferGeometry) => void,
): BufferGeometry {
  if (context.ownedGeometries.has(source)) {
    prepare(source)
    return source
  }
  const variants = context.geometryVariants.get(source) ?? new Map<string, BufferGeometry>()
  const existing = variants.get(key)
  if (existing) return existing
  const geometry = source.clone()
  prepare(geometry)
  variants.set(key, geometry)
  context.geometryVariants.set(source, variants)
  context.ownedGeometries.add(geometry)
  return geometry
}

const GLTF_ATTRIBUTES = new Set([
  'position',
  'normal',
  'tangent',
  'uv',
  'uv1',
  'color',
  'skinIndex',
  'skinWeight',
])

function stripNonGltfAttributes(geometry: BufferGeometry): void {
  for (const name of Object.keys(geometry.attributes)) {
    if (!GLTF_ATTRIBUTES.has(name)) geometry.deleteAttribute(name)
  }
}

const UV_TEXTURE_PROPERTIES = [
  'map',
  'normalMap',
  'roughnessMap',
  'metalnessMap',
  'aoMap',
  'emissiveMap',
  'alphaMap',
  'lightMap',
  'bumpMap',
  'displacementMap',
  'clearcoatMap',
  'clearcoatNormalMap',
  'clearcoatRoughnessMap',
  'sheenColorMap',
  'sheenRoughnessMap',
  'transmissionMap',
  'thicknessMap',
] as const

function materialUsesUv(material: unknown): boolean {
  if (typeof material !== 'object' || material === null) return false
  const values = material as Record<string, unknown>
  return UV_TEXTURE_PROPERTIES.some((property) => values[property] instanceof Texture)
}

function prepareDataTextureNormal(
  material: MeshPhysicalMaterial,
  hasTangents: boolean,
  context: BakeContext,
): void {
  const normal = material.normalMap
  if (!isDataTexture(normal)) return
  const flipX = material.normalScale.x < 0
  const flipY = hasTangents ? material.normalScale.y < 0 : material.normalScale.y > 0
  if (flipX || flipY) {
    const width = normal.image.width
    const height = normal.image.height
    const output = new Uint8Array(width * height * 4)
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const offset = (y * width + x) * 4
        const red = sampleTextureChannel(normal, x, y, width, height, 0, 128)
        const green = sampleTextureChannel(normal, x, y, width, height, 1, 128)
        output[offset] = flipX ? 255 - red : red
        output[offset + 1] = flipY ? 255 - green : green
        output[offset + 2] = sampleTextureChannel(normal, x, y, width, height, 2, 255)
        output[offset + 3] = sampleTextureChannel(normal, x, y, width, height, 3, 255)
      }
    }
    const prepared = dataTexture(output, width, height, false, `${material.name} / gltf normal`)
    material.normalMap = prepared
    context.ownedTextures.add(prepared)
  }
  material.normalScale.set(Math.abs(material.normalScale.x), hasTangents
    ? Math.abs(material.normalScale.y)
    : -Math.abs(material.normalScale.y))
}

function packDataTextureOrm(material: MeshPhysicalMaterial, context: BakeContext): void {
  if (material.metalnessMap === material.roughnessMap) return
  const metalness = material.metalnessMap
  const roughness = material.roughnessMap
  if (!isDataTexture(metalness) && !isDataTexture(roughness)) return
  const width = Math.max(textureWidth(metalness), textureWidth(roughness), 1)
  const height = Math.max(textureHeight(metalness), textureHeight(roughness), 1)
  const packed = new Uint8Array(width * height * 4)
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4
      packed[offset] = 255
      packed[offset + 1] = sampleTextureChannel(roughness, x, y, width, height, 1, 255)
      packed[offset + 2] = sampleTextureChannel(metalness, x, y, width, height, 2, 255)
      packed[offset + 3] = 255
    }
  }
  const orm = dataTexture(packed, width, height, false, `${material.name} / packed orm`)
  material.roughnessMap = orm
  material.metalnessMap = orm
  context.ownedTextures.add(orm)
}

function isDataTexture(texture: Texture | null): texture is DataTexture {
  return texture instanceof DataTexture && texture.image?.data !== undefined
}

function textureWidth(texture: Texture | null): number {
  return isDataTexture(texture) ? texture.image.width : 0
}

function textureHeight(texture: Texture | null): number {
  return isDataTexture(texture) ? texture.image.height : 0
}

function sampleTextureChannel(
  texture: Texture | null,
  x: number,
  y: number,
  width: number,
  height: number,
  channel: number,
  fallback: number,
): number {
  if (!isDataTexture(texture)) return fallback
  const sourceX = Math.min(texture.image.width - 1, Math.floor(x * texture.image.width / width))
  const sourceY = Math.min(texture.image.height - 1, Math.floor(y * texture.image.height / height))
  const source = texture.image.data as ArrayLike<number>
  const channels = Math.max(1, Math.round(source.length / (texture.image.width * texture.image.height)))
  return source[(sourceY * texture.image.width + sourceX) * channels + Math.min(channel, channels - 1)] ?? fallback
}

/** Exports one binary, animation-free GLB with all textures embedded. */
export async function exportStaticGlb(
  source: Object3D,
  options: StaticGlbOptions = {},
): Promise<Blob> {
  const snapshot = createStaticGlbSnapshot(source, options)
  try {
    const output = await new GLTFExporter().parseAsync(snapshot.root, {
      binary: true,
      animations: [],
      onlyVisible: false,
      includeCustomExtensions: true,
      maxTextureSize: options.textureSize ?? 512,
    })
    if (!(output instanceof ArrayBuffer)) throw new Error('GLTFExporter did not return binary GLB data')
    assertPortableGlb(output)
    return new Blob([output], { type: 'model/gltf-binary' })
  } finally {
    snapshot.dispose()
  }
}

interface GltfJson {
  readonly accessors?: readonly {
    readonly bufferView?: number
    readonly byteOffset?: number
    readonly componentType?: number
    readonly count?: number
    readonly type?: string
  }[]
  readonly animations?: readonly unknown[]
  readonly bufferViews?: readonly {
    readonly byteOffset?: number
    readonly byteStride?: number
  }[]
  readonly extensionsUsed?: readonly string[]
  readonly materials?: readonly Record<string, unknown>[]
  readonly meshes?: readonly {
    readonly primitives?: readonly {
      readonly attributes?: Readonly<Record<string, number>>
      readonly indices?: number
      readonly material?: number
    }[]
  }[]
}

function assertPortableGlb(buffer: ArrayBuffer): void {
  const view = new DataView(buffer)
  if (view.getUint32(0, true) !== 0x46546c67 || view.getUint32(4, true) !== 2) {
    throw new Error('GLTFExporter returned an invalid GLB header')
  }
  const jsonLength = view.getUint32(12, true)
  const jsonType = view.getUint32(16, true)
  if (jsonType !== 0x4e4f534a) throw new Error('GLB does not begin with a JSON chunk')
  const json = JSON.parse(
    new TextDecoder().decode(new Uint8Array(buffer, 20, jsonLength)).trim(),
  ) as GltfJson
  const binaryChunkHeader = 20 + jsonLength
  const binaryType = view.getUint32(binaryChunkHeader + 4, true)
  if (binaryType !== 0x004e4942) throw new Error('GLB does not contain a BIN chunk after JSON')
  const binaryDataOffset = binaryChunkHeader + 8
  if (json.extensionsUsed?.includes('EXT_mesh_gpu_instancing')) {
    throw new Error('Portable GLB unexpectedly contains EXT_mesh_gpu_instancing')
  }
  if ((json.animations?.length ?? 0) > 0) {
    throw new Error('Static GLB unexpectedly contains animations')
  }

  const usedAccessors = new Set<number>()
  for (const [meshIndex, mesh] of (json.meshes ?? []).entries()) {
    for (const [primitiveIndex, primitive] of (mesh.primitives ?? []).entries()) {
      const material = primitive.material === undefined ? undefined : json.materials?.[primitive.material]
      const attributes = primitive.attributes ?? {}
      if (material?.normalTexture !== undefined && attributes.TANGENT === undefined) {
        throw new Error(`Normal-mapped primitive ${meshIndex}/${primitiveIndex} has no tangent attribute`)
      }
      if (attributes.TANGENT !== undefined) {
        assertUnitTangents(view, binaryDataOffset, json, attributes.TANGENT, meshIndex, primitiveIndex)
      }
      if (!jsonValueUsesTexture(material) && attributes.TEXCOORD_0 !== undefined) {
        throw new Error(`Untextured primitive ${meshIndex}/${primitiveIndex} contains an unused TEXCOORD_0`)
      }
      for (const accessor of Object.values(attributes)) usedAccessors.add(accessor)
      if (primitive.indices !== undefined) usedAccessors.add(primitive.indices)
    }
  }
  for (let accessor = 0; accessor < (json.accessors?.length ?? 0); accessor += 1) {
    if (!usedAccessors.has(accessor)) throw new Error(`GLB contains unused accessor ${accessor}`)
  }
}

function assertUnitTangents(
  view: DataView,
  binaryDataOffset: number,
  json: GltfJson,
  accessorIndex: number,
  meshIndex: number,
  primitiveIndex: number,
): void {
  const accessor = json.accessors?.[accessorIndex]
  const bufferView = accessor?.bufferView === undefined ? undefined : json.bufferViews?.[accessor.bufferView]
  if (!accessor || !bufferView || accessor.componentType !== 5126 || accessor.type !== 'VEC4') {
    throw new Error(`Tangent accessor ${accessorIndex} is not a float VEC4`)
  }
  const stride = bufferView.byteStride ?? 16
  const start = binaryDataOffset + (bufferView.byteOffset ?? 0) + (accessor.byteOffset ?? 0)
  for (let index = 0; index < (accessor.count ?? 0); index += 1) {
    const offset = start + index * stride
    const x = view.getFloat32(offset, true)
    const y = view.getFloat32(offset + 4, true)
    const z = view.getFloat32(offset + 8, true)
    const w = view.getFloat32(offset + 12, true)
    const length = Math.hypot(x, y, z)
    if (!Number.isFinite(length) || Math.abs(length - 1) > 1e-4 || Math.abs(Math.abs(w) - 1) > 1e-4) {
      throw new Error(
        `Primitive ${meshIndex}/${primitiveIndex} has invalid tangent ${index}: `
        + `[${x}, ${y}, ${z}, ${w}]`,
      )
    }
  }
}

function jsonValueUsesTexture(value: unknown, key = ''): boolean {
  if (value === null || typeof value !== 'object') return false
  if (key.toLowerCase().endsWith('texture')) return true
  return Object.entries(value).some(([childKey, child]) => jsonValueUsesTexture(child, childKey))
}

function hasWearAttributes(geometry: BufferGeometry): boolean {
  return WEAR_ATTRIBUTE_NAMES.every((name) => geometry.getAttribute(name) !== undefined)
}

function bakeWearMesh(source: Mesh, context: BakeContext): Group {
  const geometry = source.geometry.index ? source.geometry.toNonIndexed() : source.geometry
  const position = geometry.getAttribute('position')
  const normal = geometry.getAttribute('normal')
  const uv = geometry.getAttribute('uv')
  const mask = geometry.getAttribute('aMask')
  const colour = geometry.getAttribute('aColor')
  const surface = geometry.getAttribute('aSurface')
  const wearDirection = geometry.getAttribute('aWearDir')
  const buckets = new Map<string, GeometryBucket>()

  for (let triangle = 0; triangle < position.count; triangle += 3) {
    const profile = readProfile(colour, surface, wearDirection, triangle)
    const key = profileKey(profile)
    const bucket = buckets.get(key) ?? {
      profile,
      positions: [],
      normals: [],
      uvs: [],
      colours: [],
    }
    buckets.set(key, bucket)

    for (let corner = 0; corner < 3; corner += 1) {
      const index = triangle + corner
      bucket.positions.push(position.getX(index), position.getY(index), position.getZ(index))
      bucket.normals.push(normal.getX(index), normal.getY(index), normal.getZ(index))
      bucket.uvs.push(uv?.getX(index) ?? 0, uv?.getY(index) ?? 0)
      bucket.colours.push(...bakeVertexColour(position, normal, mask, profile, index))
    }
  }
  if (geometry !== source.geometry) geometry.dispose()

  const group = new Group()
  group.name = source.name
  group.position.copy(source.position)
  group.quaternion.copy(source.quaternion)
  group.scale.copy(source.scale)
  group.visible = source.visible
  group.renderOrder = source.renderOrder
  group.userData = { ...source.userData, surfaceBake: 'standard-pbr' }

  let part = 0
  for (const [key, bucket] of buckets) {
    const bakedGeometry = new BufferGeometry()
    bakedGeometry.setAttribute('position', new Float32BufferAttribute(bucket.positions, 3))
    bakedGeometry.setAttribute('normal', new Float32BufferAttribute(bucket.normals, 3))
    bakedGeometry.setAttribute('uv', new Float32BufferAttribute(bucket.uvs, 2))
    bakedGeometry.setAttribute('color', new Float32BufferAttribute(bucket.colours, 3))
    bakedGeometry.computeBoundingSphere()
    context.ownedGeometries.add(bakedGeometry)

    const baked = new Mesh(bakedGeometry, materialForProfile(key, bucket.profile, context))
    baked.name = `${source.name} / baked surface ${String(part + 1).padStart(2, '0')}`
    baked.castShadow = source.castShadow
    baked.receiveShadow = source.receiveShadow
    group.add(baked)
    part += 1
  }
  return group
}

function readProfile(
  colour: ReadableAttribute,
  surface: ReadableAttribute,
  wearDirection: ReadableAttribute,
  index: number,
): SurfaceProfile {
  return {
    colour: [colour.getX(index), colour.getY(index), colour.getZ(index)],
    roughness: surface.getX(index),
    metalness: surface.getY(index),
    rub: surface.getZ(index),
    grime: surface.getW(index),
    scratch: wearDirection.getX(index),
  }
}

function profileKey(profile: SurfaceProfile): string {
  return [
    ...profile.colour,
    profile.roughness,
    profile.metalness,
    profile.rub,
    profile.grime,
    profile.scratch,
  ].map((value) => value.toFixed(4)).join('/')
}

function bakeVertexColour(
  position: ReadableAttribute,
  normal: ReadableAttribute,
  mask: ReadableAttribute,
  profile: SurfaceProfile,
  index: number,
): [number, number, number] {
  const px = position.getX(index)
  const py = position.getY(index)
  const pz = position.getZ(index)
  const edge = mask.getX(index)
  const occlusion = mask.getY(index)
  const flakeScale = mask.getW(index)
  const flake = smoothstep(0.52, 0.36, valueNoise3(px * flakeScale * 22, py * flakeScale * 22, pz * flakeScale * 22))
  const cluster = smoothstep(0.36, 0.56, valueNoise3(px * flakeScale * 3.4, py * flakeScale * 3.4, pz * flakeScale * 3.4))
  const rub = clamp01(edge ** 3 * flake * cluster * (1 - occlusion * 0.85) * profile.rub)
  const down = clamp01(-normal.getY(index))
  const up = clamp01(normal.getY(index))
  const splash = smoothstep(1.05, 0.12, py)
  const streak = valueNoise3(px * 9, py * 0.9, pz * 9)
  const grime = clamp01(occlusion * 1.15 + down * 0.24 + splash * 0.3)
    * (streak * 0.4 + 0.7) * profile.grime
  const dust = up * 0.26 * (streak * 0.5 + 0.5) * (1 - rub) * profile.grime

  const base = new Color(...profile.colour)
  base.lerp(new Color(0.16, 0.15, 0.13), clamp01(grime * 0.6))
  base.lerp(new Color(0.47, 0.46, 0.42), clamp01(dust * 0.28))
  base.lerp(new Color(0.56, 0.575, 0.59), clamp01(rub * 0.55))
  return [base.r, base.g, base.b]
}

function materialForProfile(
  key: string,
  profile: SurfaceProfile,
  context: BakeContext,
): MeshPhysicalMaterial {
  const existing = context.materials.get(key)
  if (existing) return existing
  const { albedo, orm, normal } = createWearTextureSet(profile, context.textureSize)
  const material = new MeshPhysicalMaterial({
    name: `baked worn surface / ${context.materials.size + 1}`,
    color: 0xffffff,
    vertexColors: true,
    roughness: 1,
    metalness: 1,
    clearcoat: 0.3,
    clearcoatRoughness: 0.3,
    map: albedo,
    roughnessMap: orm,
    metalnessMap: orm,
    normalMap: normal,
  })
  material.normalScale.set(0.42, 0.42)
  material.userData = {
    surfaceBake: 'toolbox-wear-v1',
    baseRoughness: profile.roughness,
    baseMetalness: profile.metalness,
  }
  context.materials.set(key, material)
  context.ownedMaterials.add(material)
  context.ownedTextures.add(albedo)
  context.ownedTextures.add(orm)
  context.ownedTextures.add(normal)
  return material
}

function createWearTextureSet(
  profile: SurfaceProfile,
  size: number,
): { albedo: DataTexture; orm: DataTexture; normal: DataTexture } {
  const albedoData = new Uint8Array(size * size * 4)
  const ormData = new Uint8Array(size * size * 4)
  const normalData = new Uint8Array(size * size * 4)
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const u = x / size
      const v = y / size
      const grain = valueNoise2(u * 18, v * 96)
      const broad = valueNoise2(u * 7, v * 7)
      const primaryPhase = u * 11 + v * 3
      const crossPhase = u * 4 - v * 13
      const primaryDistance = Math.abs(Math.sin(Math.PI * primaryPhase))
      const crossDistance = Math.abs(Math.sin(Math.PI * crossPhase))
      const broken = smoothstep(0.72, 0.94, Math.sin((u * 5 + v * 7) * Math.PI * 2) * 0.5 + 0.5)
      const scratch = clamp01(
        smoothstep(0.09, 0.015, primaryDistance) * broken
        + smoothstep(0.055, 0.012, crossDistance) * (1 - broken) * 0.55,
      ) * profile.scratch
      const chips = smoothstep(0.7, 0.84, broad) * profile.rub
      const dirt = smoothstep(0.38, 0.7, valueNoise2(u * 5 + 2.7, v * 5 - 1.3)) * profile.grime
      const multiplier = clamp01(0.98 + (grain - 0.5) * 0.08 - dirt * 0.16 - scratch * 0.3)
      const roughness = clamp01(profile.roughness + dirt * 0.2 - scratch * 0.34 - chips * 0.12)
      const metalness = clamp01(profile.metalness + (scratch * 0.7 + chips * 0.45) * (1 - profile.metalness))
      const wall = Math.sign(Math.sin(Math.PI * primaryPhase)) * scratch * 0.34
      const wallCross = Math.sign(Math.sin(Math.PI * crossPhase)) * scratch * 0.18
      const nx = -wall * 0.96 - wallCross * 0.3
      const ny = -wall * 0.26 + wallCross * 0.95
      const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny))
      const offset = (y * size + x) * 4
      const albedo = Math.round(multiplier * 255)
      albedoData.set([albedo, albedo, albedo, 255], offset)
      ormData.set([255, Math.round(roughness * 255), Math.round(metalness * 255), 255], offset)
      normalData.set([
        Math.round((nx * 0.5 + 0.5) * 255),
        Math.round((ny * 0.5 + 0.5) * 255),
        Math.round((nz * 0.5 + 0.5) * 255),
        255,
      ], offset)
    }
  }
  return {
    albedo: dataTexture(albedoData, size, true, 'baked wear / albedo'),
    orm: dataTexture(ormData, size, false, 'baked wear / orm'),
    normal: dataTexture(normalData, size, false, 'baked wear / normal'),
  }
}

function dataTexture(data: Uint8Array, size: number, srgb: boolean, name: string): DataTexture
function dataTexture(data: Uint8Array, width: number, height: number, srgb: boolean, name: string): DataTexture
function dataTexture(
  data: Uint8Array,
  width: number,
  heightOrSrgb: number | boolean,
  srgbOrName: boolean | string,
  maybeName?: string,
): DataTexture {
  const height = typeof heightOrSrgb === 'number' ? heightOrSrgb : width
  const srgb = typeof heightOrSrgb === 'boolean' ? heightOrSrgb : srgbOrName as boolean
  const name = typeof heightOrSrgb === 'boolean' ? srgbOrName as string : maybeName!
  const texture = new DataTexture(data, width, height, RGBAFormat, UnsignedByteType)
  texture.name = name
  texture.wrapS = RepeatWrapping
  texture.wrapT = RepeatWrapping
  texture.magFilter = LinearFilter
  texture.minFilter = LinearMipmapLinearFilter
  texture.generateMipmaps = true
  if (srgb) texture.colorSpace = SRGBColorSpace
  texture.needsUpdate = true
  return texture
}

function valueNoise2(x: number, y: number): number {
  const ix = Math.floor(x)
  const iy = Math.floor(y)
  const fx = x - ix
  const fy = y - iy
  const ux = fx * fx * (3 - 2 * fx)
  const uy = fy * fy * (3 - 2 * fy)
  return mix(mix(hash2(ix, iy), hash2(ix + 1, iy), ux), mix(hash2(ix, iy + 1), hash2(ix + 1, iy + 1), ux), uy)
}

function valueNoise3(x: number, y: number, z: number): number {
  const ix = Math.floor(x)
  const iy = Math.floor(y)
  const iz = Math.floor(z)
  const fx = x - ix
  const fy = y - iy
  const fz = z - iz
  const ux = fx * fx * (3 - 2 * fx)
  const uy = fy * fy * (3 - 2 * fy)
  const uz = fz * fz * (3 - 2 * fz)
  const corner = (dx: number, dy: number, dz: number) => hash2(
    ix + dx * 37 + (iz + dz) * 17,
    iy + dy * 53 + (iz + dz) * 29,
  )
  return mix(
    mix(mix(corner(0, 0, 0), corner(1, 0, 0), ux), mix(corner(0, 1, 0), corner(1, 1, 0), ux), uy),
    mix(mix(corner(0, 0, 1), corner(1, 0, 1), ux), mix(corner(0, 1, 1), corner(1, 1, 1), ux), uy),
    uz,
  )
}

function hash2(x: number, y: number): number {
  const value = Math.sin(x * 127.1 + y * 311.7) * 43758.5453
  return value - Math.floor(value)
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = clamp01((value - edge0) / (edge1 - edge0))
  return t * t * (3 - 2 * t)
}

function mix(a: number, b: number, amount: number): number {
  return a * (1 - amount) + b * amount
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value))
}
