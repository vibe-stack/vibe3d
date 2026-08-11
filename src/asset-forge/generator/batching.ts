import {
  Float32BufferAttribute,
  Matrix4,
  Mesh,
  type BufferGeometry,
  type Group,
  type Material,
} from 'three/webgpu'
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js'

export interface StaticBatchOptions {
  /** Maps a source material to the material used by its merged batch. */
  readonly resolveMaterial?: (source: Material) => Material
  /** Extra vertex attributes to retain for a resolved material. */
  readonly retainedAttributes?: (
    resolved: Material,
    source: Material,
  ) => readonly string[]
  /** Names the merged mesh created for a material batch. */
  readonly meshName?: (material: Material) => string
}

/**
 * Collapses the static meshes below `root` into one mesh per resolved material.
 * Transforms are baked relative to `root`, so the resulting group remains safe
 * to animate as one assembly. Source geometries are disposed after the merge.
 */
export function mergeStaticByMaterial(
  root: Group,
  options: StaticBatchOptions = {},
): BufferGeometry[] {
  root.updateMatrixWorld(true)
  const rootInverse = new Matrix4().copy(root.matrixWorld).invert()
  const batches = new Map<Material, BufferGeometry[]>()
  const sourceGeometries = new Set<BufferGeometry>()

  root.traverse((object) => {
    if (!(object instanceof Mesh) || Array.isArray(object.material)) return
    const source = object.geometry as BufferGeometry
    const sourceMaterial = object.material as Material
    const material = options.resolveMaterial?.(sourceMaterial) ?? sourceMaterial
    const retained = new Set([
      'position',
      'normal',
      'uv',
      ...(options.retainedAttributes?.(material, sourceMaterial) ?? []),
    ])

    sourceGeometries.add(source)
    const geometry = source.index ? source.toNonIndexed() : source.clone()
    geometry.applyMatrix4(object.matrixWorld).applyMatrix4(rootInverse)
    if (!geometry.getAttribute('normal')) geometry.computeVertexNormals()
    if (!geometry.getAttribute('uv')) addPlanarUv(geometry)
    for (const name of Object.keys(geometry.attributes)) {
      if (!retained.has(name)) geometry.deleteAttribute(name)
    }

    const geometries = batches.get(material) ?? []
    geometries.push(geometry)
    batches.set(material, geometries)
  })

  root.clear()
  const mergedGeometries: BufferGeometry[] = []
  for (const [material, geometries] of batches) {
    const merged = mergeGeometries(geometries, false)
    for (const geometry of geometries) geometry.dispose()
    if (!merged) throw new Error(`Failed to merge static batch for material ${material.name || '(unnamed)'}`)
    // Sources are expanded before merging so independently-authored meshes can
    // carry different attribute sets safely. Re-index the finished batch once
    // those attributes have been normalized: mergeVertices hashes every
    // retained attribute (normal, UV, wear data, etc.), so only vertices that
    // are visually identical are shared. This removes the 3-vertices-per-
    // triangle expansion without smoothing hard edges or changing shaders.
    const indexed = mergeVertices(merged, 1e-6)
    merged.dispose()
    indexed.computeBoundingSphere()
    const mesh = new Mesh(indexed, material)
    mesh.name = options.meshName?.(material) ?? material.name
    root.add(mesh)
    mergedGeometries.push(indexed)
  }
  for (const geometry of sourceGeometries) geometry.dispose()
  return mergedGeometries
}

function addPlanarUv(geometry: BufferGeometry): void {
  geometry.computeBoundingBox()
  const bounds = geometry.boundingBox!
  const sizeX = Math.max(bounds.max.x - bounds.min.x, 0.001)
  const sizeY = Math.max(bounds.max.y - bounds.min.y, 0.001)
  const positions = geometry.getAttribute('position')
  const uvs: number[] = []
  for (let index = 0; index < positions.count; index += 1) {
    uvs.push(
      (positions.getX(index) - bounds.min.x) / sizeX,
      (positions.getY(index) - bounds.min.y) / sizeY,
    )
  }
  geometry.setAttribute('uv', new Float32BufferAttribute(uvs, 2))
}
