/**
 * Mesh integrity diagnostics.
 *
 * The compiled topology previously *asserted* `manifold: true` and
 * `boundaryMode: 'closed'` without ever checking either. These functions measure
 * them, so the claims in the artifact are earned rather than declared.
 */

export interface MeshIntegrity {
  triangles: number
  vertices: number
  /** Edges used by exactly one triangle. Non-zero means the surface has holes. */
  boundaryEdges: number
  /** Edges used by three or more triangles. Non-zero means non-manifold. */
  nonManifoldEdges: number
  /** Triangle count of each connected component, largest first. */
  componentSizes: number[]
  /** Triangles outside the largest component: the "flying parts". */
  strayTriangles: number
  closed: boolean
  manifold: boolean
}

export function measureIntegrity(
  indices: Uint32Array | ArrayLike<number>,
  vertexCount: number,
): MeshIntegrity {
  const triangleCount = indices.length / 3
  const edgeUse = new Map<number, number>()
  const edgeTriangles = new Map<number, number[]>()
  for (let triangle = 0; triangle < triangleCount; triangle += 1) {
    for (let edge = 0; edge < 3; edge += 1) {
      const a = indices[triangle * 3 + edge]!
      const b = indices[triangle * 3 + ((edge + 1) % 3)]!
      const key = a < b ? a * 4294967 + b : b * 4294967 + a
      edgeUse.set(key, (edgeUse.get(key) ?? 0) + 1)
      const bucket = edgeTriangles.get(key)
      if (bucket) bucket.push(triangle)
      else edgeTriangles.set(key, [triangle])
    }
  }
  let boundaryEdges = 0
  let nonManifoldEdges = 0
  for (const count of edgeUse.values()) {
    if (count === 1) boundaryEdges += 1
    else if (count > 2) nonManifoldEdges += 1
  }

  // Connected components over edge adjacency.
  const component = new Int32Array(triangleCount).fill(-1)
  const sizes: number[] = []
  for (let seed = 0; seed < triangleCount; seed += 1) {
    if (component[seed] !== -1) continue
    const label = sizes.length
    let size = 0
    const queue = [seed]
    component[seed] = label
    let cursor = 0
    while (cursor < queue.length) {
      const current = queue[cursor]!
      cursor += 1
      size += 1
      for (let edge = 0; edge < 3; edge += 1) {
        const a = indices[current * 3 + edge]!
        const b = indices[current * 3 + ((edge + 1) % 3)]!
        const key = a < b ? a * 4294967 + b : b * 4294967 + a
        for (const neighbor of edgeTriangles.get(key) ?? []) {
          if (component[neighbor] !== -1) continue
          component[neighbor] = label
          queue.push(neighbor)
        }
      }
    }
    sizes.push(size)
  }
  sizes.sort((left, right) => right - left)
  const strayTriangles = sizes.slice(1).reduce((total, size) => total + size, 0)

  return {
    triangles: triangleCount,
    vertices: vertexCount,
    boundaryEdges,
    nonManifoldEdges,
    componentSizes: sizes.slice(0, 8),
    strayTriangles,
    closed: boundaryEdges === 0,
    manifold: nonManifoldEdges === 0,
  }
}

function edgeKey(a: number, b: number): number {
  return a < b ? a * 4294967 + b : b * 4294967 + a
}

/**
 * Drop triangles until every edge is shared by at most two of them.
 *
 * Vertex clustering can collapse two separate sheets of the surface onto shared
 * vertices, which leaves edges with three or more incident triangles. A
 * non-manifold edge has no well-defined surface orientation, so it is not
 * something a runtime can shade or collide against; the extra fins are removed
 * and the resulting gaps are left for the hole filler.
 *
 * Larger triangles are kept in preference to slivers, since the fins introduced
 * by clustering are almost always the degenerate ones.
 */
export function removeNonManifoldFins(
  indices: Uint32Array,
  positions: Float64Array,
): { indices: Uint32Array; removedTriangles: number } {
  const triangleCount = indices.length / 3
  const area = new Float64Array(triangleCount)
  for (let triangle = 0; triangle < triangleCount; triangle += 1) {
    const a = indices[triangle * 3]!
    const b = indices[triangle * 3 + 1]!
    const c = indices[triangle * 3 + 2]!
    const abx = positions[b * 3]! - positions[a * 3]!
    const aby = positions[b * 3 + 1]! - positions[a * 3 + 1]!
    const abz = positions[b * 3 + 2]! - positions[a * 3 + 2]!
    const acx = positions[c * 3]! - positions[a * 3]!
    const acy = positions[c * 3 + 1]! - positions[a * 3 + 1]!
    const acz = positions[c * 3 + 2]! - positions[a * 3 + 2]!
    const cx = aby * acz - abz * acy
    const cy = abz * acx - abx * acz
    const cz = abx * acy - aby * acx
    area[triangle] = Math.sqrt(cx * cx + cy * cy + cz * cz)
  }
  const order = Array.from({ length: triangleCount }, (_, index) => index)
    .sort((left, right) => area[right]! - area[left]!)

  const use = new Map<number, number>()
  const alive = new Uint8Array(triangleCount)
  let removed = 0
  for (const triangle of order) {
    const a = indices[triangle * 3]!
    const b = indices[triangle * 3 + 1]!
    const c = indices[triangle * 3 + 2]!
    const keys = [edgeKey(a, b), edgeKey(b, c), edgeKey(c, a)]
    let admissible = true
    for (const key of keys) {
      if ((use.get(key) ?? 0) >= 2) { admissible = false; break }
    }
    if (!admissible) { removed += 1; continue }
    for (const key of keys) use.set(key, (use.get(key) ?? 0) + 1)
    alive[triangle] = 1
  }

  const kept: number[] = []
  for (let triangle = 0; triangle < triangleCount; triangle += 1) {
    if (!alive[triangle]) continue
    kept.push(indices[triangle * 3]!, indices[triangle * 3 + 1]!, indices[triangle * 3 + 2]!)
  }
  return { indices: new Uint32Array(kept), removedTriangles: removed }
}

/**
 * Fill boundary loops with a fan.
 *
 * Winding matters and is easy to get silently wrong: a mesh triangle traverses a
 * boundary edge a->b, so any triangle filling that gap must traverse b->a. The
 * fan is therefore emitted backward along the loop. Filling with the wrong
 * winding leaves the hole just as visible under front-face rendering while
 * making the mesh *look* closed to an edge count.
 */
export function fillHoles(
  indices: Uint32Array,
  positions: Float64Array,
  normals: Float64Array,
  maximumLoopLength = 256,
): {
  indices: Uint32Array
  positions: Float64Array
  normals: Float64Array
  filledLoops: number
  addedTriangles: number
  skippedLoops: number
} {
  const triangleCount = indices.length / 3
  const use = new Map<number, number>()
  for (let triangle = 0; triangle < triangleCount; triangle += 1) {
    for (let edge = 0; edge < 3; edge += 1) {
      const a = indices[triangle * 3 + edge]!
      const b = indices[triangle * 3 + ((edge + 1) % 3)]!
      const key = edgeKey(a, b)
      use.set(key, (use.get(key) ?? 0) + 1)
    }
  }
  // Directed boundary edges, as they appear in their owning triangle.
  const next = new Map<number, number[]>()
  for (let triangle = 0; triangle < triangleCount; triangle += 1) {
    for (let edge = 0; edge < 3; edge += 1) {
      const a = indices[triangle * 3 + edge]!
      const b = indices[triangle * 3 + ((edge + 1) % 3)]!
      if (use.get(edgeKey(a, b)) !== 1) continue
      const bucket = next.get(a)
      if (bucket) bucket.push(b)
      else next.set(a, [b])
    }
  }

  const vertexCount = positions.length / 3
  const extraPositions: number[] = []
  const extraNormals: number[] = []
  const added: number[] = []
  let filledLoops = 0
  let skippedLoops = 0
  // Consume directed *edges*, not vertices. A pinched boundary visits the same
  // vertex twice, so vertex-based consumption abandons those loops unfilled.
  const usedEdges = new Set<number>()
  const directed: Array<[number, number]> = []
  for (const [from, targets] of next) {
    for (const to of targets) directed.push([from, to])
  }
  const directedKey = (a: number, b: number) => a * 4294967 + b

  for (const [startA, startB] of directed) {
    if (usedEdges.has(directedKey(startA, startB))) continue
    const loop: number[] = [startA]
    usedEdges.add(directedKey(startA, startB))
    let current = startB
    let ok = true
    while (current !== startA) {
      if (loop.length >= maximumLoopLength) { ok = false; break }
      const candidates = next.get(current)
      if (!candidates) { ok = false; break }
      let step = -1
      for (const candidate of candidates) {
        if (!usedEdges.has(directedKey(current, candidate))) { step = candidate; break }
      }
      if (step === -1) { ok = false; break }
      usedEdges.add(directedKey(current, step))
      loop.push(current)
      current = step
    }
    if (!ok || loop.length < 3) { skippedLoops += 1; continue }
    // Fan from a new centroid vertex rather than from loop[0]. A corner fan's
    // chords can coincide with existing edges (which would trade the hole for a
    // non-manifold edge) and it cannot fill a non-convex loop cleanly; every
    // edge of a centroid fan is new by construction.
    let cx = 0; let cy = 0; let cz = 0
    let nx = 0; let ny = 0; let nz = 0
    for (const vertex of loop) {
      cx += positions[vertex * 3]!
      cy += positions[vertex * 3 + 1]!
      cz += positions[vertex * 3 + 2]!
      nx += normals[vertex * 3]!
      ny += normals[vertex * 3 + 1]!
      nz += normals[vertex * 3 + 2]!
    }
    const centroid = vertexCount + extraPositions.length / 3
    extraPositions.push(cx / loop.length, cy / loop.length, cz / loop.length)
    const normalLength = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1
    extraNormals.push(nx / normalLength, ny / normalLength, nz / normalLength)
    for (let index = 0; index < loop.length; index += 1) {
      const a = loop[index]!
      const b = loop[(index + 1) % loop.length]!
      if (a === b) continue
      added.push(centroid, b, a)
      use.set(edgeKey(centroid, a), (use.get(edgeKey(centroid, a)) ?? 0) + 1)
      use.set(edgeKey(centroid, b), (use.get(edgeKey(centroid, b)) ?? 0) + 1)
      use.set(edgeKey(a, b), (use.get(edgeKey(a, b)) ?? 0) + 1)
    }
    filledLoops += 1
  }

  const output = new Uint32Array(indices.length + added.length)
  output.set(indices, 0)
  output.set(added, indices.length)
  const outPositions = new Float64Array(positions.length + extraPositions.length)
  outPositions.set(positions, 0)
  outPositions.set(extraPositions, positions.length)
  const outNormals = new Float64Array(normals.length + extraNormals.length)
  outNormals.set(normals, 0)
  outNormals.set(extraNormals, normals.length)
  return {
    indices: output,
    positions: outPositions,
    normals: outNormals,
    filledLoops,
    addedTriangles: added.length / 3,
    skippedLoops,
  }
}

/**
 * Keep only the largest connected component. Small detached shells are produced
 * where the displacement folds the field, and they read as debris floating
 * beside the rock.
 */
export function keepLargestComponent(
  indices: Uint32Array,
): { indices: Uint32Array; removedTriangles: number; components: number } {
  const triangleCount = indices.length / 3
  const edgeTriangles = new Map<number, number[]>()
  for (let triangle = 0; triangle < triangleCount; triangle += 1) {
    for (let edge = 0; edge < 3; edge += 1) {
      const a = indices[triangle * 3 + edge]!
      const b = indices[triangle * 3 + ((edge + 1) % 3)]!
      const key = a < b ? a * 4294967 + b : b * 4294967 + a
      const bucket = edgeTriangles.get(key)
      if (bucket) bucket.push(triangle)
      else edgeTriangles.set(key, [triangle])
    }
  }
  const component = new Int32Array(triangleCount).fill(-1)
  let bestLabel = -1
  let bestSize = -1
  let labels = 0
  for (let seed = 0; seed < triangleCount; seed += 1) {
    if (component[seed] !== -1) continue
    const label = labels
    labels += 1
    let size = 0
    const queue = [seed]
    component[seed] = label
    let cursor = 0
    while (cursor < queue.length) {
      const current = queue[cursor]!
      cursor += 1
      size += 1
      for (let edge = 0; edge < 3; edge += 1) {
        const a = indices[current * 3 + edge]!
        const b = indices[current * 3 + ((edge + 1) % 3)]!
        const key = a < b ? a * 4294967 + b : b * 4294967 + a
        for (const neighbor of edgeTriangles.get(key) ?? []) {
          if (component[neighbor] !== -1) continue
          component[neighbor] = label
          queue.push(neighbor)
        }
      }
    }
    if (size > bestSize) {
      bestSize = size
      bestLabel = label
    }
  }
  const kept: number[] = []
  for (let triangle = 0; triangle < triangleCount; triangle += 1) {
    if (component[triangle] !== bestLabel) continue
    kept.push(indices[triangle * 3]!, indices[triangle * 3 + 1]!, indices[triangle * 3 + 2]!)
  }
  return {
    indices: new Uint32Array(kept),
    removedTriangles: triangleCount - kept.length / 3,
    components: labels,
  }
}
