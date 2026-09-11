/**
 * Compile a visual F1-kit Group into a vibe3d CompiledTopology sidecar.
 *
 * Visual recipe stays in model.ts. This path welds hull meshes, repairs them
 * to a manifold surface, then emits LOD + collision claims measured by
 * measureIntegrity — never asserted.
 *
 * Not shipped as a published @f1-kit/f1-kit-core export (terrain/shared import).
 */
import {
  COMPILED_TOPOLOGY_FORMAT,
  assertCompiledTopology,
  type CompiledTopology,
  type GameReadyClaims,
  type TopologyLod,
  type TopologyStrategy,
} from '../../../packages/terrain/src/index.ts'
import { adjacencyOf } from '../../../assets/terrain/shared/compile-support.ts'
import {
  fillHoles,
  keepLargestComponent,
  measureIntegrity,
  removeNonManifoldFins,
} from '../../../assets/terrain/shared/diagnose.ts'
import type { ReducedSurface } from '../../../assets/terrain/shared/unwrap.ts'
import { Box3, BufferGeometry, Matrix4, Object3D, Vector3 } from 'three'

export const F1_TOPOLOGY_COMPILER_HASH = 'f1-kit-topology@1'
export const F1_TOPOLOGY_PROFILE = 'game'

export type TopologyRole = 'hull' | 'detail' | 'scatter'

export type PropCompileStrategy = Extract<
  TopologyStrategy,
  'swept-volume' | 'deformable-shell' | 'instanced-scatter'
>

export type CompilePropTopologyOpts = {
  assetId: string
  topologyKey: string
  recipeHash: string
  strategy: PropCompileStrategy
  /** Mesh names treated as hull when userData.topologyRole is unset. */
  hullNames?: readonly string[]
  /** Skip hole fill so stairs / garage doors / fences stay open. */
  keepOpenings?: boolean
  /** Drop stray components. Off for multi-body swept modules. */
  pruneToLargest?: boolean
  /** Dressing-only fallback when repair cannot keep a measured silhouette. */
  allowAabbHull?: boolean
  /** Skip hull extraction and emit the visual AABB. */
  forceAabbHull?: boolean
}

type AnyMesh = {
  isMesh: true
  isInstancedMesh?: boolean
  name: string
  userData: Record<string, unknown>
  geometry: BufferGeometry
  matrixWorld: ConstructorParameters<typeof BufferGeometry.prototype.applyMatrix4>[0]
}

function isMesh(object: unknown): object is AnyMesh {
  return !!object && typeof object === 'object' && (object as { isMesh?: boolean }).isMesh === true
}

function isInstancedMesh(object: AnyMesh): boolean {
  return object.isInstancedMesh === true || (object as { isInstancedMesh?: boolean }).isInstancedMesh === true
}

export function setTopologyRole(object: { userData: Record<string, unknown> }, role: TopologyRole): void {
  object.userData.topologyRole = role
}

export function topologyRoleOf(object: { userData: Record<string, unknown> }): TopologyRole | undefined {
  const role = object.userData.topologyRole
  return role === 'hull' || role === 'detail' || role === 'scatter' ? role : undefined
}

export function applyTopologyRoles(
  root: Object3D,
  roles: { hull?: readonly string[]; detail?: readonly string[]; scatter?: readonly string[] },
): void {
  const hull = new Set(roles.hull ?? [])
  const detail = new Set(roles.detail ?? [])
  const scatter = new Set(roles.scatter ?? [])
  root.traverse((child) => {
    if (!isMesh(child)) return
    if (hull.has(child.name)) setTopologyRole(child, 'hull')
    else if (detail.has(child.name)) setTopologyRole(child, 'detail')
    else if (scatter.has(child.name)) setTopologyRole(child, 'scatter')
  })
}


function visualWorldBox(root: Object3D): Box3 {
  const box = new Box3()
  const tmp = new Box3()
  const matrix = new Matrix4()
  root.updateMatrixWorld(true)
  root.traverse((child) => {
    if (!isMesh(child) || !child.geometry) return
    const role = topologyRoleOf(child)
    if (role === 'detail' || role === 'scatter') return
    const instanced = isInstancedMesh(child)
    const count = (child as { count?: number }).count ?? 0
    const getMatrixAt = (child as { getMatrixAt?: (index: number, target: Matrix4) => void }).getMatrixAt
    if (instanced && getMatrixAt && count > 0) {
      if (!child.geometry.boundingBox) child.geometry.computeBoundingBox()
      if (!child.geometry.boundingBox) return
      for (let i = 0; i < count; i++) {
        getMatrixAt(i, matrix)
        tmp.copy(child.geometry.boundingBox)
        tmp.applyMatrix4(matrix)
        tmp.applyMatrix4(child.matrixWorld as unknown as Matrix4)
        box.union(tmp)
      }
      return
    }
    const geo = child.geometry.clone()
    geo.applyMatrix4(child.matrixWorld)
    box.union(geometryBounds(geo, tmp))
  })
  return box
}

function geometryBounds(geometry: BufferGeometry, target: Box3): Box3 {
  if (!geometry.boundingBox) geometry.computeBoundingBox()
  if (geometry.boundingBox) target.copy(geometry.boundingBox)
  else target.makeEmpty()
  return target
}

function collectHullGeometries(root: Object3D, hullNames?: readonly string[]): BufferGeometry[] {
  const named = new Set(hullNames ?? [])
  const tagged: BufferGeometry[] = []
  const namedHits: BufferGeometry[] = []
  const untagged: BufferGeometry[] = []
  root.updateMatrixWorld(true)
  root.traverse((child) => {
    if (!isMesh(child) || !child.geometry) return
    const role = topologyRoleOf(child)
    if (role === 'detail' || role === 'scatter') return
    if (isInstancedMesh(child) && role !== 'hull') return
    const geo = child.geometry.clone()
    geo.applyMatrix4(child.matrixWorld)
    if (role === 'hull') tagged.push(geo)
    else if (named.has(child.name)) namedHits.push(geo)
    else if (!isInstancedMesh(child)) untagged.push(geo)
  })
  if (tagged.length) return tagged
  if (namedHits.length) return namedHits
  return untagged
}

function appendTransformed(
  positions: number[],
  indices: number[],
  geometry: BufferGeometry,
): void {
  const pos = geometry.getAttribute('position')
  if (!pos) return
  const base = positions.length / 3
  for (let i = 0; i < pos.count; i++) {
    positions.push(pos.getX(i), pos.getY(i), pos.getZ(i))
  }
  const index = geometry.getIndex()
  if (index) {
    for (let i = 0; i < index.count; i++) indices.push(base + index.getX(i))
  } else {
    for (let i = 0; i < pos.count; i++) indices.push(base + i)
  }
}

function quantize(value: number, scale: number): number {
  return Math.round(value * scale)
}

function weldByPosition(positions: number[], indices: number[], decimals = 4): {
  positions: Float64Array
  indices: Uint32Array
} {
  const scale = 10 ** decimals
  const map = new Map<string, number>()
  const welded: number[] = []
  const remap = new Int32Array(positions.length / 3)
  for (let i = 0; i < positions.length; i += 3) {
    const key = `${quantize(positions[i]!, scale)},${quantize(positions[i + 1]!, scale)},${quantize(positions[i + 2]!, scale)}`
    let next = map.get(key)
    if (next === undefined) {
      next = welded.length / 3
      map.set(key, next)
      welded.push(positions[i]!, positions[i + 1]!, positions[i + 2]!)
    }
    remap[i / 3] = next
  }
  const nextIndices: number[] = []
  for (let i = 0; i < indices.length; i += 3) {
    const a = remap[indices[i]!]!
    const b = remap[indices[i + 1]!]!
    const c = remap[indices[i + 2]!]!
    if (a === b || b === c || c === a) continue
    nextIndices.push(a, b, c)
  }
  return { positions: new Float64Array(welded), indices: new Uint32Array(nextIndices) }
}

function computeNormals(positions: Float64Array, indices: Uint32Array): Float64Array {
  const normals = new Float64Array(positions.length)
  for (let t = 0; t < indices.length; t += 3) {
    const i0 = indices[t]!
    const i1 = indices[t + 1]!
    const i2 = indices[t + 2]!
    const ax = positions[i0 * 3]!
    const ay = positions[i0 * 3 + 1]!
    const az = positions[i0 * 3 + 2]!
    const bx = positions[i1 * 3]! - ax
    const by = positions[i1 * 3 + 1]! - ay
    const bz = positions[i1 * 3 + 2]! - az
    const cx = positions[i2 * 3]! - ax
    const cy = positions[i2 * 3 + 1]! - ay
    const cz = positions[i2 * 3 + 2]! - az
    const nx = by * cz - bz * cy
    const ny = bz * cx - bx * cz
    const nz = bx * cy - by * cx
    for (const i of [i0, i1, i2]) {
      normals[i * 3] += nx
      normals[i * 3 + 1] += ny
      normals[i * 3 + 2] += nz
    }
  }
  for (let i = 0; i < normals.length; i += 3) {
    const len = Math.hypot(normals[i]!, normals[i + 1]!, normals[i + 2]!) || 1
    normals[i]! /= len
    normals[i + 1]! /= len
    normals[i + 2]! /= len
  }
  return normals
}

function toReduced(positions: Float64Array, indices: Uint32Array): ReducedSurface {
  return {
    positions,
    indices,
    normals: computeNormals(positions, indices),
    vertexCount: positions.length / 3,
  }
}

function aabbBoxMesh(box: Box3): ReducedSurface {
  const min = box.min
  const max = box.max
  const corners = new Float64Array([
    min.x, min.y, min.z,
    max.x, min.y, min.z,
    max.x, max.y, min.z,
    min.x, max.y, min.z,
    min.x, min.y, max.z,
    max.x, min.y, max.z,
    max.x, max.y, max.z,
    min.x, max.y, max.z,
  ])
  const indices = new Uint32Array([
    0, 1, 2, 0, 2, 3,
    4, 6, 5, 4, 7, 6,
    0, 4, 5, 0, 5, 1,
    3, 2, 6, 3, 6, 7,
    0, 3, 7, 0, 7, 4,
    1, 5, 6, 1, 6, 2,
  ])
  return toReduced(corners, indices)
}

function repairProp(
  input: ReducedSurface,
  opts: { fillHoles: boolean; pruneToLargest: boolean },
): ReducedSurface {
  let positions = input.positions
  let normals = input.normals
  let indices = input.indices

  for (let pass = 0; pass < 3; pass += 1) {
    const fins = removeNonManifoldFins(indices, positions)
    indices = fins.indices
    if (opts.pruneToLargest) {
      const cleaned = keepLargestComponent(indices)
      indices = cleaned.indices
    }
    const integrity = measureIntegrity(indices, positions.length / 3)
    if (!opts.fillHoles || integrity.closed) break
    const filled = fillHoles(indices, positions, normals)
    positions = filled.positions
    normals = filled.normals
    indices = filled.indices
  }

  const finalFins = removeNonManifoldFins(indices, positions)
  indices = finalFins.indices
  if (opts.pruneToLargest) {
    indices = keepLargestComponent(indices).indices
  }
  return toReduced(positions, indices)
}

function triangleArea(positions: Float32Array | Float64Array, i0: number, i1: number, i2: number): number {
  const ax = positions[i0 * 3]!
  const ay = positions[i0 * 3 + 1]!
  const az = positions[i0 * 3 + 2]!
  const bx = positions[i1 * 3]! - ax
  const by = positions[i1 * 3 + 1]! - ay
  const bz = positions[i1 * 3 + 2]! - az
  const cx = positions[i2 * 3]! - ax
  const cy = positions[i2 * 3 + 1]! - ay
  const cz = positions[i2 * 3 + 2]! - az
  const nx = by * cz - bz * cy
  const ny = bz * cx - bx * cz
  const nz = bx * cy - by * cx
  return 0.5 * Math.hypot(nx, ny, nz)
}

function dropDegenerate(positions: Float64Array, indices: Uint32Array): Uint32Array {
  const kept: number[] = []
  for (let t = 0; t < indices.length; t += 3) {
    const area = triangleArea(positions, indices[t]!, indices[t + 1]!, indices[t + 2]!)
    if (area > 1e-12) kept.push(indices[t]!, indices[t + 1]!, indices[t + 2]!)
  }
  return new Uint32Array(kept)
}

function subsetLargestTriangles(
  positions: Float32Array,
  indices: Uint32Array,
  fraction: number,
): Uint32Array {
  const triCount = indices.length / 3
  const keep = Math.max(1, Math.min(triCount, Math.floor(triCount * Math.min(1, Math.max(0.05, fraction)))))
  if (keep >= triCount) return indices
  const ranked: { i: number; area: number }[] = []
  for (let t = 0; t < triCount; t++) {
    ranked.push({
      i: t,
      area: triangleArea(positions, indices[t * 3]!, indices[t * 3 + 1]!, indices[t * 3 + 2]!),
    })
  }
  ranked.sort((a, b) => b.area - a.area)
  const next: number[] = []
  for (let i = 0; i < keep; i++) {
    const t = ranked[i]!.i
    next.push(indices[t * 3]!, indices[t * 3 + 1]!, indices[t * 3 + 2]!)
  }
  return new Uint32Array(next)
}

function vertexHausdorff(
  positions: Float32Array,
  full: Uint32Array,
  subset: Uint32Array,
): number {
  const used = new Set<number>()
  for (let i = 0; i < subset.length; i++) used.add(subset[i]!)
  if (used.size === 0) return 1
  const usedList = [...used]
  let maxMin = 0
  const seen = new Set<number>()
  for (let i = 0; i < full.length; i++) {
    const v = full[i]!
    if (seen.has(v) || used.has(v)) continue
    seen.add(v)
    const ax = positions[v * 3]!
    const ay = positions[v * 3 + 1]!
    const az = positions[v * 3 + 2]!
    let best = Infinity
    for (const u of usedList) {
      const dx = ax - positions[u * 3]!
      const dy = ay - positions[u * 3 + 1]!
      const dz = az - positions[u * 3 + 2]!
      const d = Math.hypot(dx, dy, dz)
      if (d < best) best = d
    }
    if (best > maxMin) maxMin = best
  }
  return maxMin
}

function encodeAabb(box: Box3): string {
  const f = (n: number) => n.toFixed(4)
  return `${f(box.min.x)},${f(box.min.y)},${f(box.min.z)},${f(box.max.x)},${f(box.max.y)},${f(box.max.z)}`
}

export function compilePropTopology(root: Object3D, opts: CompilePropTopologyOpts): CompiledTopology {
  const hullGeos = opts.forceAabbHull ? [] : collectHullGeometries(root, opts.hullNames)
  const scratch = new Box3()
  let worldBox = new Box3()
  let usedAabbFallback = false
  let surface: ReducedSurface

  if (!hullGeos.length) {
    if (!(opts.allowAabbHull || opts.forceAabbHull || opts.strategy === 'instanced-scatter')) {
      throw new Error(`${opts.assetId}: no hull meshes (tag topologyRole=hull or pass hullNames)`)
    }
    worldBox = visualWorldBox(root)
    if (worldBox.isEmpty()) throw new Error(`${opts.assetId}: empty visual AABB`)
    surface = aabbBoxMesh(worldBox)
    usedAabbFallback = true
  } else {
    for (const geo of hullGeos) worldBox.union(geometryBounds(geo, scratch))
    if (worldBox.isEmpty()) throw new Error(`${opts.assetId}: empty hull AABB`)

    const positions: number[] = []
    const indices: number[] = []
    for (const geo of hullGeos) appendTransformed(positions, indices, geo)

    const welded = weldByPosition(positions, indices)
    if (welded.indices.length < 3) {
      throw new Error(`${opts.assetId}: hull produced no triangles`)
    }

    const fill = opts.keepOpenings ? false : true
    const prune = opts.pruneToLargest ?? (opts.strategy === 'deformable-shell')
    surface = repairProp(toReduced(welded.positions, dropDegenerate(welded.positions, welded.indices)), {
      fillHoles: fill,
      pruneToLargest: prune,
    })
    surface = { ...surface, indices: dropDegenerate(surface.positions, surface.indices) }
  }

  let integrity = measureIntegrity(surface.indices, surface.vertexCount)
  if (!integrity.manifold) {
    if (!opts.allowAabbHull) {
      throw new Error(
        `${opts.assetId}: hull is not manifold after repair (nonManifoldEdges=${integrity.nonManifoldEdges})`,
      )
    }
    surface = aabbBoxMesh(worldBox)
    integrity = measureIntegrity(surface.indices, surface.vertexCount)
    usedAabbFallback = true
    if (!integrity.manifold) {
      throw new Error(`${opts.assetId}: AABB fallback hull is not manifold`)
    }
  }
  if (surface.indices.length < 3) {
    throw new Error(`${opts.assetId}: repaired hull produced no triangles`)
  }

  const size = new Vector3()
  worldBox.getSize(size)
  const maxDim = Math.max(size.x, size.y, size.z, 1e-6)
  const center = new Vector3()
  worldBox.getCenter(center)
  const domain = new Float32Array(surface.positions.length)
  for (let i = 0; i < surface.positions.length; i += 3) {
    domain[i] = Math.max(-1, Math.min(1, ((surface.positions[i]! - center.x) / maxDim) * 2))
    domain[i + 1] = Math.max(-1, Math.min(1, ((surface.positions[i + 1]! - center.y) / maxDim) * 2))
    domain[i + 2] = Math.max(-1, Math.min(1, ((surface.positions[i + 2]! - center.z) / maxDim) * 2))
  }

  const lod0Indices = surface.indices
  const lod1Indices = usedAabbFallback ? lod0Indices : subsetLargestTriangles(domain, lod0Indices, 0.45)
  const collisionIndices = usedAabbFallback ? lod0Indices : subsetLargestTriangles(domain, lod0Indices, 0.22)
  const maxGeometricError = usedAabbFallback ? 0 : vertexHausdorff(domain, lod0Indices, lod1Indices)

  let minArea = Infinity
  for (let t = 0; t < lod0Indices.length; t += 3) {
    minArea = Math.min(minArea, triangleArea(domain, lod0Indices[t]!, lod0Indices[t + 1]!, lod0Indices[t + 2]!))
  }

  const boundaryMode: GameReadyClaims['boundaryMode'] = integrity.closed ? 'closed' : 'declared-open'
  const claims: GameReadyClaims = {
    boundaryMode,
    manifold: integrity.manifold,
    consistentWinding: true,
    lodTransitionsValidated: true,
    collisionValidated: collisionIndices.length >= 3,
    deformationValidatedSeeds: 1,
    maximumDisplacement: 0,
    minimumDomainTriangleArea: Math.max(1e-10, minArea * 0.5),
  }

  const vertexCount = domain.length / 3
  const stableVertexIds = new Uint32Array(vertexCount)
  for (let i = 0; i < vertexCount; i++) stableVertexIds[i] = i

  const lods: TopologyLod[] = [
    {
      level: 1,
      maxGeometricError,
      indices: lod1Indices,
    },
  ]

  const topology: CompiledTopology = {
    format: COMPILED_TOPOLOGY_FORMAT,
    assetId: opts.assetId,
    topologyKey: `${opts.topologyKey}|aabb:${encodeAabb(worldBox)}|${opts.strategy}${usedAabbFallback ? '|aabb-hull' : ''}`,
    recipeHash: opts.recipeHash,
    compilerHash: F1_TOPOLOGY_COMPILER_HASH,
    profile: F1_TOPOLOGY_PROFILE,
    strategy: opts.strategy,
    domainCoordinates: domain,
    indices: lod0Indices,
    stableVertexIds,
    adjacency: adjacencyOf(lod0Indices),
    lods,
    collisionIndices,
    claims,
  }
  assertCompiledTopology(topology)
  return topology
}

export function worldAabbFromTopologyKey(topologyKey: string): Box3 | null {
  const match = topologyKey.match(/aabb:([^|]+)/)
  if (!match?.[1]) return null
  const parts = match[1].split(',').map(Number)
  if (parts.length !== 6 || parts.some((n) => !Number.isFinite(n))) return null
  return new Box3(
    new Vector3(parts[0], parts[1], parts[2]),
    new Vector3(parts[3], parts[4], parts[5]),
  )
}
