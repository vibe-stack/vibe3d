import { readFile } from 'node:fs/promises'
import { Matrix4 } from 'three/webgpu'
import { register } from 'tsx/esm/api'

/**
 * Finds the surfaces in the cargo wave that share a plane with another surface
 * facing the same way, which is what the flicker in the recorder actually is.
 *
 * The playbook (§3) settles the question of what to hunt for: one depth-buffer
 * step is 0.17 mm at the far end of a container hero shot, so nothing in this
 * pack flickers because of depth precision. It flickers because two faces are
 * at the same coordinate and the rasteriser has no basis to choose between
 * them. That makes this a geometry question, not a rendering question, and a
 * geometry question can be answered exactly - which is the point of this tool.
 * Fifty people looking at fifty QA sheets produce fifty opinions; the triangles
 * produce one answer.
 *
 * The 3 mm floor below is the playbook's derived safe separation. Anything
 * closer than that between two same-facing, overlapping surfaces is reported.
 *
 * Three things are deliberately *not* reported, because each is a legitimate
 * construction the pack uses everywhere and reporting them would bury the real
 * findings:
 *
 * - Faces that point in opposite directions. The back-to-back caps of a thin
 *   plate, and every butt joint in the pack, are pairs at 0 mm that render
 *   correctly because backface culling only ever draws one of them.
 * - Triangles that share a plane but not any area. Two halves of a quad, a
 *   triangle fan across a cap, and the strips a fillet is built from all meet
 *   edge to edge; only genuine area overlap can fight.
 * - Surfaces with no line of sight out of the prop. A liner sized to its
 *   cavity or a divider inside a solid block is a real modelling defect, but it
 *   is a class 2 defect (R4a), not this one - it never reaches the rasteriser.
 *   These are counted and set aside rather than dropped silently.
 *
 * The models arrive through `createModel`, i.e. after `finishModel` has merged
 * everything to one mesh per material. That is the geometry the renderer sees,
 * so it is the geometry to measure, and it costs nothing: part identity is
 * recovered afterwards from the connected components of the merged buffers.
 *
 * Usage:
 *   node scripts/z-fight-audit.mjs                 audit the whole wave
 *   node scripts/z-fight-audit.mjs <model> [...]   audit named models only
 *   node scripts/z-fight-audit.mjs --json          machine-readable findings
 *   node scripts/z-fight-audit.mjs --calibrate     re-run the ground-truth gate
 *
 * Exits non-zero when anything is found, so it can gate a branch later.
 */

// The models are TypeScript, so the loader has to be live before the first
// dynamic import below. Registering it here keeps the tool a plain `node`
// invocation, like the pack's other .mjs scripts.
register()

const REPO = new URL('../', import.meta.url)

/** The playbook's hard floor: below this a same-facing pair is a defect. */
const SAFE_SEPARATION = 0.003
/** Two triangles are on one plane if their offsets agree to a fifth of a mm. */
const PLANE_TOLERANCE = 0.0002
/** Half a degree. Tighter than any authored bevel, looser than float error. */
const NORMAL_TOLERANCE = Math.cos((0.5 * Math.PI) / 180)
/** Below a square millimetre an "overlap" is a clipping artefact on a shared edge. */
const MIN_PAIR_AREA = 1e-6
/** A site has to be big enough to see: 10 mm², a 3 mm square. */
const MIN_SITE_AREA = 1e-5
/**
 * ...and wide enough to see. Two chamfer facets that graze each other produce a
 * strip a tenth of a millimetre across and a hundred long, which passes the area
 * test and is narrower than a pixel at any framing the pack is shot at.
 */
const MIN_SITE_WIDTH = 0.001
/** Overlaps further apart than this are separate details, not one site. */
const SITE_GAP = 0.03

/**
 * The ten defects the user picked out of the recorder by raycast, in the model
 * root's frame. They live in the tool rather than beside it because a detector
 * whose thresholds nobody can re-check is a detector nobody should trust: any
 * change to the constants above has to keep answering these ten.
 */
const GROUND_TRUTH = [
  { model: 'armored-cargo-crate', point: [0.374, 0.093, 0.530], normal: [0, 0, 1] },
  { model: 'armored-cargo-crate', point: [-0.435, 0.075, 0.530], normal: [0, 0, 1] },
  { model: 'cargo-crate-large', point: [0.539, 0.180, 0.750], normal: [0, 0, 1] },
  { model: 'cargo-crate-large', point: [-0.460, 0.175, 0.750], normal: [0, 0, 1] },
  { model: 'cargo-crate-large', point: [-0.535, 0.195, -0.750], normal: [0, 0, -1] },
  { model: 'cargo-crate-large', point: [0.484, 0.142, -0.750], normal: [0, 0, -1] },
  { model: 'container-door', point: [0.220, 2.340, 1.134], normal: [1, 0, 0] },
  { model: 'container-door', point: [0.220, 2.332, -1.059], normal: [1, 0, 0] },
  { model: 'container-door', point: [0.220, 0.236, -1.101], normal: [1, 0, 0] },
  { model: 'container-door', point: [0.220, 0.258, 1.102], normal: [1, 0, 0] },
]

/**
 * A raycast hit is wherever the user's cursor happened to be on the offending
 * surface, not the centroid of the overlap, so a hit counts as matched when it
 * lands on the site's footprint with a hand's width of slack.
 */
const GROUND_TRUTH_SLACK = 0.06

function dot(a, b) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
}

function cross(a, b) {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
}

function normalise(v) {
  const length = Math.hypot(v[0], v[1], v[2])
  return length > 0 ? [v[0] / length, v[1] / length, v[2] / length] : [0, 0, 0]
}

/**
 * A repeatable in-plane basis. It has to be a function of the normal alone, or
 * two runs of the tool put the same overlap at two different 2D coordinates and
 * the report stops being diffable.
 */
function planeBasis(n) {
  const absolute = [Math.abs(n[0]), Math.abs(n[1]), Math.abs(n[2])]
  const smallest = absolute[0] <= absolute[1] && absolute[0] <= absolute[2] ? [1, 0, 0]
    : absolute[1] <= absolute[2] ? [0, 1, 0] : [0, 0, 1]
  const u = normalise(cross(n, smallest))
  return [u, cross(n, u)]
}

function signedArea(points) {
  let sum = 0
  for (let i = 0; i < points.length; i += 2) {
    const nextX = points[(i + 2) % points.length]
    const nextY = points[(i + 3) % points.length]
    sum += points[i] * nextY - nextX * points[i + 1]
  }
  return sum * 0.5
}

/**
 * Sutherland-Hodgman. Both polygons are convex triangles, so the clip is exact
 * and needs no general polygon library.
 */
function clipPolygon(subject, clip) {
  let polygon = subject
  for (let edge = 0; edge < 3; edge += 1) {
    if (polygon.length === 0) return []
    const ax = clip[edge * 2]
    const ay = clip[edge * 2 + 1]
    const bx = clip[((edge + 1) % 3) * 2]
    const by = clip[((edge + 1) % 3) * 2 + 1]
    const edgeX = bx - ax
    const edgeY = by - ay
    const next = []
    let previousX = polygon[polygon.length - 2]
    let previousY = polygon[polygon.length - 1]
    let previousSide = edgeX * (previousY - ay) - edgeY * (previousX - ax)
    for (let i = 0; i < polygon.length; i += 2) {
      const currentX = polygon[i]
      const currentY = polygon[i + 1]
      const currentSide = edgeX * (currentY - ay) - edgeY * (currentX - ax)
      if (currentSide >= 0) {
        if (previousSide < 0) {
          const t = previousSide / (previousSide - currentSide)
          next.push(previousX + (currentX - previousX) * t, previousY + (currentY - previousY) * t)
        }
        next.push(currentX, currentY)
      } else if (previousSide >= 0) {
        const t = previousSide / (previousSide - currentSide)
        next.push(previousX + (currentX - previousX) * t, previousY + (currentY - previousY) * t)
      }
      previousX = currentX
      previousY = currentY
      previousSide = currentSide
    }
    polygon = next
  }
  return polygon
}

/**
 * Connected components of a merged batch, which is how a part gets some of its
 * identity back after `mergeStaticByMaterial` has thrown the object tree away.
 *
 * Vertices are joined by position as well as by triangle, and that second pass
 * is what makes this useful. The merge re-indexes with `mergeVertices`, which
 * hashes the normal along with everything else, so a hard edge is never welded
 * and a plain box arrives as six unconnected quads. Joining coincident
 * positions puts the box back together while leaving a plaque plate, a decal
 * plane or a bolt head - none of which share a vertex with the panel they sit
 * on - as parts in their own right.
 *
 * It does over-merge where two solids genuinely meet corner to corner, so an
 * island is treated as a hint about what a surface belongs to, never as
 * evidence for or against a finding.
 */
function islandsOf(geometry) {
  const position = geometry.getAttribute('position')
  const index = geometry.getIndex()
  const count = position.count
  const parent = new Int32Array(count)
  for (let i = 0; i < count; i += 1) parent[i] = i
  const find = (i) => {
    let root = i
    while (parent[root] !== root) root = parent[root]
    while (parent[i] !== root) {
      const next = parent[i]
      parent[i] = root
      i = next
    }
    return root
  }
  const union = (a, b) => {
    const rootA = find(a)
    const rootB = find(b)
    if (rootA !== rootB) parent[Math.max(rootA, rootB)] = Math.min(rootA, rootB)
  }
  const triangles = index ? index.count / 3 : count / 3
  for (let t = 0; t < triangles; t += 1) {
    const a = index ? index.getX(t * 3) : t * 3
    const b = index ? index.getX(t * 3 + 1) : t * 3 + 1
    const c = index ? index.getX(t * 3 + 2) : t * 3 + 2
    union(a, b)
    union(a, c)
  }
  const byPosition = new Map()
  for (let v = 0; v < count; v += 1) {
    const key = `${Math.round(position.getX(v) * 1e5)},${Math.round(position.getY(v) * 1e5)},${Math.round(position.getZ(v) * 1e5)}`
    const first = byPosition.get(key)
    if (first === undefined) byPosition.set(key, v)
    else union(first, v)
  }
  return { find, index, triangles }
}

/**
 * Every triangle in the model root's frame, tagged with the batch it was drawn
 * in and the island it belongs to.
 */
function collectTriangles(root) {
  root.updateMatrixWorld(true)
  const toRoot = new Matrix4().copy(root.matrixWorld).invert()
  const local = new Matrix4()
  const triangles = []
  const islands = new Map()
  root.traverse((object) => {
    if (!object.isMesh || Array.isArray(object.material)) return
    const geometry = object.geometry
    const position = geometry.getAttribute('position')
    if (!position) return
    const colour = geometry.getAttribute('aColor')
    local.copy(toRoot).multiply(object.matrixWorld)
    const m = local.elements
    const at = (i) => {
      const x = position.getX(i)
      const y = position.getY(i)
      const z = position.getZ(i)
      return [
        m[0] * x + m[4] * y + m[8] * z + m[12],
        m[1] * x + m[5] * y + m[9] * z + m[13],
        m[2] * x + m[6] * y + m[10] * z + m[14],
      ]
    }
    const batch = object.name || object.material?.name || '<unnamed batch>'
    const { find, index, triangles: count } = islandsOf(geometry)
    for (let t = 0; t < count; t += 1) {
      const ia = index ? index.getX(t * 3) : t * 3
      const ib = index ? index.getX(t * 3 + 1) : t * 3 + 1
      const ic = index ? index.getX(t * 3 + 2) : t * 3 + 2
      const a = at(ia)
      const b = at(ib)
      const c = at(ic)
      const edge1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]]
      const edge2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]]
      const raw = cross(edge1, edge2)
      const twiceArea = Math.hypot(raw[0], raw[1], raw[2])
      if (twiceArea < 1e-12) continue
      const n = [raw[0] / twiceArea, raw[1] / twiceArea, raw[2] / twiceArea]
      const centroid = [(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3, (a[2] + b[2] + c[2]) / 3]
      const islandKey = `${batch}#${find(ia)}`
      let island = islands.get(islandKey)
      if (!island) {
        island = {
          key: islandKey,
          batch,
          triangles: 0,
          min: [Infinity, Infinity, Infinity],
          max: [-Infinity, -Infinity, -Infinity],
          colour: colour ? [colour.getX(ia), colour.getY(ia), colour.getZ(ia)] : undefined,
        }
        islands.set(islandKey, island)
      }
      island.triangles += 1
      for (const point of [a, b, c]) {
        for (let axis = 0; axis < 3; axis += 1) {
          if (point[axis] < island.min[axis]) island.min[axis] = point[axis]
          if (point[axis] > island.max[axis]) island.max[axis] = point[axis]
        }
      }
      triangles.push({ a, b, c, n, d: dot(n, centroid), centroid, area: twiceArea * 0.5, batch, island })
    }
  })
  return { triangles, islands: [...islands.values()] }
}

/**
 * Groups triangles into planes. Two same-facing surfaces at exactly 0 mm land
 * in one plane rather than two, which is why the pair search below also has to
 * look inside a plane: 0 mm is the case the user is actually seeing.
 */
function buildPlanes(triangles) {
  const cell = 0.02
  const buckets = new Map()
  const planes = []
  for (const triangle of triangles) {
    const gx = Math.round(triangle.n[0] / cell)
    const gy = Math.round(triangle.n[1] / cell)
    const gz = Math.round(triangle.n[2] / cell)
    let found
    for (let dx = -1; dx <= 1 && !found; dx += 1) {
      for (let dy = -1; dy <= 1 && !found; dy += 1) {
        for (let dz = -1; dz <= 1 && !found; dz += 1) {
          for (const candidate of buckets.get(`${gx + dx},${gy + dy},${gz + dz}`) ?? []) {
            if (dot(candidate.n, triangle.n) < NORMAL_TOLERANCE) continue
            if (Math.abs(candidate.d - triangle.d) > PLANE_TOLERANCE) continue
            found = candidate
            break
          }
        }
      }
    }
    if (!found) {
      found = { id: planes.length, n: triangle.n, d: triangle.d, triangles: [] }
      planes.push(found)
      const key = `${gx},${gy},${gz}`
      const bucket = buckets.get(key)
      if (bucket) bucket.push(found)
      else buckets.set(key, [found])
    }
    found.triangles.push(triangle)
  }
  return planes
}

/**
 * Plane pairs that are parallel, face the same way and sit closer than the
 * safe floor - including a plane against itself, which is the exact-coincidence
 * case.
 */
function candidatePairs(planes) {
  const cell = 0.02
  const buckets = new Map()
  for (const plane of planes) {
    const key = [
      Math.round(plane.n[0] / cell),
      Math.round(plane.n[1] / cell),
      Math.round(plane.n[2] / cell),
      Math.floor(plane.d / SAFE_SEPARATION),
    ].join(',')
    const bucket = buckets.get(key)
    if (bucket) bucket.push(plane)
    else buckets.set(key, [plane])
  }
  const pairs = []
  for (const plane of planes) {
    pairs.push([plane, plane])
    const gx = Math.round(plane.n[0] / cell)
    const gy = Math.round(plane.n[1] / cell)
    const gz = Math.round(plane.n[2] / cell)
    const gd = Math.floor(plane.d / SAFE_SEPARATION)
    for (let dx = -1; dx <= 1; dx += 1) {
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dz = -1; dz <= 1; dz += 1) {
          for (let dd = -1; dd <= 1; dd += 1) {
            for (const other of buckets.get([gx + dx, gy + dy, gz + dz, gd + dd].join(',')) ?? []) {
              if (other.id <= plane.id) continue
              if (dot(plane.n, other.n) < NORMAL_TOLERANCE) continue
              if (Math.abs(plane.d - other.d) >= SAFE_SEPARATION) continue
              pairs.push([plane, other])
            }
          }
        }
      }
    }
  }
  return pairs
}

/** Projects a plane's triangles into its own 2D frame once, for reuse. */
function projected(plane, u, v) {
  if (plane.projection && plane.projection.u === u) return plane.projection.list
  const list = plane.triangles.map((triangle, id) => {
    const points = [
      dot(triangle.a, u), dot(triangle.a, v),
      dot(triangle.b, u), dot(triangle.b, v),
      dot(triangle.c, u), dot(triangle.c, v),
    ]
    if (signedArea(points) < 0) {
      points.splice(2, 4, points[4], points[5], points[2], points[3])
    }
    return {
      id,
      triangle,
      points,
      minX: Math.min(points[0], points[2], points[4]),
      minY: Math.min(points[1], points[3], points[5]),
      maxX: Math.max(points[0], points[2], points[4]),
      maxY: Math.max(points[1], points[3], points[5]),
    }
  })
  plane.projection = { u, list }
  return list
}

/** Finds every overlapping triangle pair between (or inside) two planes. */
function overlaps(planeA, planeB) {
  const [u, v] = planeBasis(planeA.n)
  const listA = projected(planeA, u, v)
  const listB = planeA === planeB ? listA : projected(planeB, u, v)
  const cellSize = 0.05
  const grid = new Map()
  for (const item of listA) {
    for (let x = Math.floor(item.minX / cellSize); x <= Math.floor(item.maxX / cellSize); x += 1) {
      for (let y = Math.floor(item.minY / cellSize); y <= Math.floor(item.maxY / cellSize); y += 1) {
        const key = `${x},${y}`
        const bucket = grid.get(key)
        if (bucket) bucket.push(item)
        else grid.set(key, [item])
      }
    }
  }
  const found = []
  // A triangle sits in every grid cell its bounding box touches, so the same
  // pair turns up several times over. Left undeduplicated the overlap areas
  // add up to more than the surfaces they were measured on.
  const seen = new Set()
  for (const b of listB) {
    for (let x = Math.floor(b.minX / cellSize); x <= Math.floor(b.maxX / cellSize); x += 1) {
      for (let y = Math.floor(b.minY / cellSize); y <= Math.floor(b.maxY / cellSize); y += 1) {
        for (const a of grid.get(`${x},${y}`) ?? []) {
          if (planeA === planeB && a.id >= b.id) continue
          const key = `${a.id},${b.id}`
          if (seen.has(key)) continue
          seen.add(key)
          if (a.maxX <= b.minX || b.maxX <= a.minX || a.maxY <= b.minY || b.maxY <= a.minY) continue
          const clipped = clipPolygon(a.points, b.points)
          if (clipped.length < 6) continue
          const area = Math.abs(signedArea(clipped))
          if (area < MIN_PAIR_AREA) continue
          let cx = 0
          let cy = 0
          for (let i = 0; i < clipped.length; i += 2) {
            cx += clipped[i]
            cy += clipped[i + 1]
          }
          cx /= clipped.length / 2
          cy /= clipped.length / 2
          const separation = Math.abs(dot(planeA.n, a.triangle.centroid) - dot(planeA.n, b.triangle.centroid))
          if (separation >= SAFE_SEPARATION) continue
          const bounds = [Infinity, Infinity, -Infinity, -Infinity]
          for (let i = 0; i < clipped.length; i += 2) {
            bounds[0] = Math.min(bounds[0], clipped[i])
            bounds[1] = Math.min(bounds[1], clipped[i + 1])
            bounds[2] = Math.max(bounds[2], clipped[i])
            bounds[3] = Math.max(bounds[3], clipped[i + 1])
          }
          found.push({ a: a.triangle, b: b.triangle, area, cx, cy, bounds, separation, u, v, n: planeA.n })
        }
      }
    }
  }
  return found
}

/**
 * Merges raw triangle-pair overlaps into the details a fixer can act on. Two
 * bolt heads on one panel are two sites; the forty triangle pairs inside one
 * bolt head are one.
 */
function toSites(records) {
  const groups = new Map()
  for (const record of records) {
    const [first, second] = record.a.island.key <= record.b.island.key
      ? [record.a, record.b] : [record.b, record.a]
    const key = `${first.island.key}|${second.island.key}|${record.n.map((c) => c.toFixed(4)).join(',')}`
    const group = groups.get(key)
    if (group) group.push(record)
    else groups.set(key, [record])
  }
  const sites = []
  for (const group of groups.values()) {
    // Single-linkage on the overlap footprints in the plane's own 2D frame. It
    // has to be footprints rather than centres, or one large coincident panel
    // reports once per triangle pair its two triangulations happen to make.
    const parent = group.map((_, i) => i)
    const find = (i) => {
      while (parent[i] !== i) i = parent[i] = parent[parent[i]]
      return i
    }
    for (let i = 0; i < group.length; i += 1) {
      for (let j = i + 1; j < group.length; j += 1) {
        const a = group[i].bounds
        const b = group[j].bounds
        if (a[2] + SITE_GAP < b[0] || b[2] + SITE_GAP < a[0]) continue
        if (a[3] + SITE_GAP < b[1] || b[3] + SITE_GAP < a[1]) continue
        const rootI = find(i)
        const rootJ = find(j)
        if (rootI !== rootJ) parent[Math.max(rootI, rootJ)] = Math.min(rootI, rootJ)
      }
    }
    const clusters = new Map()
    for (let i = 0; i < group.length; i += 1) {
      const root = find(i)
      const cluster = clusters.get(root)
      if (cluster) cluster.push(group[i])
      else clusters.set(root, [group[i]])
    }
    for (const cluster of clusters.values()) {
      let area = 0
      let cx = 0
      let cy = 0
      let separation = Infinity
      let minX = Infinity
      let minY = Infinity
      let maxX = -Infinity
      let maxY = -Infinity
      for (const record of cluster) {
        area += record.area
        cx += record.cx * record.area
        cy += record.cy * record.area
        separation = Math.min(separation, record.separation)
        minX = Math.min(minX, record.bounds[0])
        minY = Math.min(minY, record.bounds[1])
        maxX = Math.max(maxX, record.bounds[2])
        maxY = Math.max(maxY, record.bounds[3])
      }
      if (area < MIN_SITE_AREA) continue
      if (Math.min(maxX - minX, maxY - minY) < MIN_SITE_WIDTH) continue
      cx /= area
      cy /= area
      const sample = cluster[0]
      // The two sides are named by depth: whichever surface is further along
      // the shared normal is the one drawn on top, i.e. the applied layer.
      const front = dot(sample.n, sample.a.centroid) >= dot(sample.n, sample.b.centroid) ? sample.a : sample.b
      const back = front === sample.a ? sample.b : sample.a
      const plane = (dot(sample.n, sample.a.centroid) + dot(sample.n, sample.b.centroid)) / 2
      const point = [0, 1, 2].map((axis) => sample.u[axis] * cx + sample.v[axis] * cy + sample.n[axis] * plane)
      sites.push({
        point,
        normal: sample.n,
        separation,
        area,
        pairs: cluster.length,
        front,
        back,
        extent: [maxX - minX, maxY - minY],
        basis: { u: sample.u, v: sample.v, plane },
      })
    }
  }
  return sites
}

/** Möller-Trumbore, front and back faces alike: any geometry occludes. */
function rayHits(triangles, origin, direction, minDistance) {
  for (const triangle of triangles) {
    const edge1 = [
      triangle.b[0] - triangle.a[0], triangle.b[1] - triangle.a[1], triangle.b[2] - triangle.a[2],
    ]
    const edge2 = [
      triangle.c[0] - triangle.a[0], triangle.c[1] - triangle.a[1], triangle.c[2] - triangle.a[2],
    ]
    const pv = cross(direction, edge2)
    const determinant = dot(edge1, pv)
    if (Math.abs(determinant) < 1e-12) continue
    const inverse = 1 / determinant
    const tv = [origin[0] - triangle.a[0], origin[1] - triangle.a[1], origin[2] - triangle.a[2]]
    const u = dot(tv, pv) * inverse
    if (u < 0 || u > 1) continue
    const qv = cross(tv, edge1)
    const v = dot(direction, qv) * inverse
    if (v < 0 || u + v > 1) continue
    const distance = dot(edge2, qv) * inverse
    if (distance > minDistance) return true
  }
  return false
}

/**
 * Whether a site can be seen at all. A surface sealed inside solid geometry
 * cannot fight with anything, and the wave ships several of those; they belong
 * in the class 2 "part is only invisible once" bucket, not this report.
 *
 * A single escaping ray is enough to call a site visible. Erring that way costs
 * a few sites a fixer will judge harmless; erring the other way would drop real
 * defects, and this tool is calibrated against defects the user can see.
 */
function isVisible(triangles, site) {
  const [u, v] = planeBasis(site.normal)
  const origin = [0, 1, 2].map((axis) => site.point[axis] + site.normal[axis] * 0.0015)
  for (const theta of [0, (35 * Math.PI) / 180, (60 * Math.PI) / 180]) {
    const along = Math.cos(theta)
    const across = Math.sin(theta)
    const azimuths = theta === 0 ? [0] : [0, 1, 2, 3, 4, 5].map((i) => (i * Math.PI) / 3)
    for (const phi of azimuths) {
      const direction = [0, 1, 2].map((axis) =>
        site.normal[axis] * along + (u[axis] * Math.cos(phi) + v[axis] * Math.sin(phi)) * across)
      // Ignore the first few millimetres: the site's own coincident partner and
      // the shell it is printed on are both within that, and neither hides it.
      if (!rayHits(triangles, origin, direction, 0.004)) return true
    }
  }
  return false
}

/**
 * The kit's own material slots, keyed by the linear colour that `tuneMaterial`
 * bakes into `aColor`. Everything the wear pass touches merges into one batch
 * called "worn depot surfaces", so the batch name alone cannot tell a shell
 * panel from a graphite skirt from a painted latch - and knowing which of those
 * a finding sits on is most of knowing which line of the model to look at.
 */
const kit = await import(new URL('assets/prototypes/axiom-cargo-kit/index.ts', REPO).href)
const paletteBundle = kit.acquireCargoMaterials(0)
const PALETTE = Object.entries(paletteBundle.materials)
  .map(([name, material]) => ({ name, rgb: [material.color.r, material.color.g, material.color.b] }))
kit.disposeCargoMaterials(paletteBundle)

function slotName(colour) {
  if (!colour) return undefined
  let best
  let bestDistance = Infinity
  for (const entry of PALETTE) {
    const distance = Math.hypot(...[0, 1, 2].map((i) => entry.rgb[i] - colour[i]))
    if (distance < bestDistance) {
      bestDistance = distance
      best = entry.name
    }
  }
  // A model may override the shell token, so an unrecognised colour is reported
  // as a colour rather than as the nearest thing that happens to be closest.
  return bestDistance < 0.02 ? best : undefined
}

/** The material family a batch was drawn from, for a batch the wear pass left alone. */
function family(batch) {
  if (/decal|stencil/i.test(batch)) return 'decal'
  if (batch.includes('INK-950')) return 'ink'
  if (batch.includes('INK-900')) return 'rubber'
  if (batch.includes('MAT-09')) return 'lamp'
  if (batch.includes('MAT-08')) return 'glass'
  if (batch.includes('MAT-03')) return 'steel'
  if (batch.includes('MAT-04')) return 'ironOxide'
  if (batch.includes('MAT-16')) return 'timber'
  if (batch.includes('MAT-10')) return 'fabric'
  return undefined
}

function surfaceOf(island) {
  return slotName(island.colour) ?? family(island.batch) ?? island.batch.replace(/^.*?\/\s*/, '')
}

/**
 * The tool's best guess at *which detail* this is, from the island's material,
 * thickness and footprint. The merge has thrown the part names away, so this is
 * inference - but the kit's helpers each build to a fixed thickness (playbook
 * §1.1), and a thickness plus a material is usually enough to name the helper
 * that produced the part and therefore the call site to go and read.
 */
function describe(island) {
  const size = [0, 1, 2].map((axis) => island.max[axis] - island.min[axis])
  const [thin, middle, long] = [...size].sort((a, b) => a - b)
  const dimensions = size.map((value) => value.toFixed(3)).join('×')
  const surface = surfaceOf(island)
  const near = (value, target) => Math.abs(value - target) < 0.0025
  if (/decal/i.test(island.batch)) {
    // No dimensions: every decal of one kind merges into a single batch, and
    // planes that happen to meet at a corner then share an island, so the
    // island's box says nothing about the graphic that is actually fighting.
    const kind = /hazard/i.test(island.batch) ? 'hazard band'
      : /chevron/i.test(island.batch) ? 'ownership chevron' : 'manifest plaque'
    return `${kind} decal plane`
  }
  if (thin < 0.0005) return `bare plane (stencil or tick) ${dimensions} m`
  if (surface === 'ink' && near(thin, 0.055)) return `recessed-handle well, ink, ${dimensions} m`
  if (surface === 'ink' && near(thin, 0.05)) return `louvre-vent well, ink, ${dimensions} m`
  if (surface === 'ink' && thin > 0.06) return `fork-pocket tunnel or cavity well, ink, ${dimensions} m`
  // A long thin run is tested before the plate thicknesses, or a pallet's
  // 1.2 m deck board is reported as a plaque because it happens to be 22 mm.
  if (long > 6 * middle && long > 0.3) return `board, batten, rib, band or member, ${surface}, ${dimensions} m`
  // Each helper's own material is part of its signature. Without it, 32 mm and
  // 50 mm are common enough thicknesses that half the wave gets called a louvre.
  if (surface === 'graphite' && near(thin, 0.045) && middle < 0.4) return `louvre-vent surround, graphite, ${dimensions} m`
  if (surface === 'graphiteEdge' && near(thin, 0.032) && middle < 0.4) return `louvre slat, graphiteEdge, ${dimensions} m`
  if (surface === 'graphiteEdge' && thin > 0.1 && long < 0.5 && long < 2.2 * thin) {
    return `corner casting or block, graphiteEdge, ${dimensions} m`
  }
  if (near(thin, 0.022) && middle > 0.06 && long < 0.6) return `plaque plate (t 0.022), ${surface}, ${dimensions} m`
  if (near(thin, 0.014) || near(thin, 0.013)) return `paint mark / radial mark stroke, ${surface}, ${dimensions} m`
  if (island.triangles <= 60 && long < 0.09) return `bolt head or pin, ${surface}, ${dimensions} m`
  if (long > 1) return `shell panel or structural mass, ${surface}, ${dimensions} m`
  return `part, ${surface}, ${dimensions} m`
}

/**
 * Collapses sites that are copies of one another into one defect.
 *
 * A model that mirrors a detail across two axes and repeats it down a wall
 * produces twenty-four identical findings, and a fixer edits one line to clear
 * all of them. Reporting per site makes the wave look twenty-four times worse
 * than it is and gives nobody a shorter list to work through, so the instances
 * are kept but carried under one heading. The signature deliberately ignores
 * the normal's sign, because a mirrored pair is one call site.
 */
function groupDefects(findings) {
  const groups = new Map()
  for (const finding of findings) {
    const key = [
      finding.separationMm.toFixed(2),
      finding.front.detail,
      finding.back.detail,
      finding.overlapAreaM2.toPrecision(2),
      finding.contact,
    ].join('|')
    const group = groups.get(key)
    if (group) group.instances.push(finding)
    else {
      groups.set(key, {
        separationMm: finding.separationMm,
        overlapAreaM2: finding.overlapAreaM2,
        extentMm: finding.extentMm,
        front: finding.front,
        back: finding.back,
        contact: finding.contact,
        instances: [finding],
      })
    }
  }
  return [...groups.values()].sort((a, b) => Number(a.contact) - Number(b.contact)
    || a.separationMm - b.separationMm
    || b.overlapAreaM2 * b.instances.length - a.overlapAreaM2 * a.instances.length)
}

async function auditModel(model) {
  const module = await import(new URL(`assets/prototypes/${model}/model.ts`, REPO).href)
  const controller = module.createModel()
  try {
    const { triangles } = collectTriangles(controller.root)
    const records = []
    for (const [planeA, planeB] of candidatePairs(buildPlanes(triangles))) {
      records.push(...overlaps(planeA, planeB))
    }
    const findings = []
    let hidden = 0
    for (const site of toSites(records)) {
      if (!isVisible(triangles, site)) {
        hidden += 1
        continue
      }
      findings.push({
        model,
        point: site.point.map((value) => Number(value.toFixed(4))),
        normal: site.normal.map((value) => Number(value.toFixed(4))),
        separationMm: Number((site.separation * 1000).toFixed(3)),
        overlapAreaM2: Number(site.area.toFixed(6)),
        extentMm: site.extent.map((value) => Number((value * 1000).toFixed(1))),
        front: { material: surfaceOf(site.front.island), detail: describe(site.front.island) },
        back: { material: surfaceOf(site.back.island), detail: describe(site.back.island) },
        // A downward face on the deck plane is a real shared plane, but it is
        // the one the prop stands on, so it is called out separately rather
        // than ranked against a decal on a container's flank.
        contact: site.normal[1] < -0.95 && site.point[1] < 0.002,
        pairs: site.pairs,
      })
    }
    findings.sort((a, b) => a.separationMm - b.separationMm
      || b.overlapAreaM2 - a.overlapAreaM2
      || a.point[0] - b.point[0] || a.point[1] - b.point[1] || a.point[2] - b.point[2])
    return { model, triangles: triangles.length, findings, defects: groupDefects(findings), hidden }
  } finally {
    controller.dispose?.()
  }
}

/**
 * A ground-truth hit matches a finding when it lands on the same plane, facing
 * the same way, within the site's footprint plus slack.
 */
function matches(finding, truth) {
  if (dot(finding.normal, truth.normal) < 0.99) return false
  const delta = [0, 1, 2].map((axis) => truth.point[axis] - finding.point[axis])
  if (Math.abs(dot(finding.normal, delta)) > 0.01) return false
  const inPlane = Math.hypot(...delta) ** 2 - dot(finding.normal, delta) ** 2
  const radius = Math.hypot(finding.extentMm[0], finding.extentMm[1]) / 2000 + GROUND_TRUTH_SLACK
  return Math.sqrt(Math.max(0, inPlane)) <= radius
}

const argv = process.argv.slice(2)
const json = argv.includes('--json')
const calibrate = argv.includes('--calibrate')
const named = argv.filter((value) => !value.startsWith('--'))
const wave = (await readFile(new URL('renders/qa/wave-assets.txt', REPO), 'utf8'))
  .split('\n').map((line) => line.trim()).filter(Boolean)
const models = named.length > 0 ? named
  : calibrate ? [...new Set(GROUND_TRUTH.map((truth) => truth.model))].sort()
    : wave

const results = []
for (const model of models) results.push(await auditModel(model))

if (calibrate) {
  const findings = results.flatMap((result) => result.findings)
  let hits = 0
  for (const [i, truth] of GROUND_TRUTH.entries()) {
    const match = findings.find((finding) => finding.model === truth.model && matches(finding, truth))
    if (match) hits += 1
    console.log(`${String(i + 1).padStart(2)}  ${match ? 'HIT ' : 'MISS'}  ${truth.model}`
      + `  [${truth.point.join(', ')}]`
      + (match ? `  -> ${match.separationMm} mm, ${match.front.detail} over ${match.back.detail}` : ''))
  }
  console.log(`calibration: ${hits}/${GROUND_TRUTH.length}`)
  process.exitCode = hits === GROUND_TRUTH.length ? 0 : 1
} else if (json) {
  console.log(JSON.stringify({ safeSeparationMm: SAFE_SEPARATION * 1000, results }, null, 2))
} else {
  for (const result of results) {
    if (result.findings.length === 0) {
      console.log(`${result.model}  clean  (${result.triangles} triangles, ${result.hidden} hidden set aside)`)
      continue
    }
    console.log(`${result.model}  ${result.defects.length} defect(s) / ${result.findings.length} site(s)`
      + `  (${result.triangles} triangles, ${result.hidden} hidden set aside)`)
    for (const defect of result.defects) {
      console.log(`  ${defect.separationMm.toFixed(2)} mm  ×${defect.instances.length}`
        + `  ${(defect.overlapAreaM2 * 1e4).toFixed(1)} cm² each  ${defect.extentMm.join('×')} mm`
        + (defect.contact ? '  [ground-contact plane]' : ''))
      console.log(`      front  ${defect.front.detail}`)
      console.log(`      back   ${defect.back.detail}`)
      for (const instance of defect.instances) {
        console.log(`      at  [${instance.point.join(', ')}]  n=[${instance.normal.join(',')}]`)
      }
    }
  }
  const sites = results.reduce((sum, result) => sum + result.findings.length, 0)
  const defects = results.reduce((sum, result) => sum + result.defects.length, 0)
  console.log(`\n${defects} defect(s) / ${sites} site(s) across ${results.length} model(s);`
    + ` ${results.filter((result) => result.findings.length > 0).length} affected`)
  process.exitCode = sites > 0 ? 1 : 0
}
