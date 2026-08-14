/**
 * UV atlas unwrap, shared by every terrain recipe.
 *
 * Charts are grown over edge-adjacent triangles inside a normal cone, projected
 * to their best-fit plane at one shared texel density, and shelf-packed into a
 * single atlas. That atlas is what makes a genuine high-to-low bake possible.
 *
 * This module previously also held a cluster-based reduction that solved a QEF
 * per cluster. It was removed: welding vertices across a coarse grid joins
 * separate sheets of the surface, which produced ~750 non-manifold fins and ~700
 * boundary edges at the target triangle budget. Re-extracting the field at a
 * coarser grid (see any recipe's `topology.ts`) is watertight by construction and
 * measured an order of magnitude cleaner, so LOD chains use that instead.
 */

import type { Vec3 } from './noise.ts'

export interface ReducedSurface {
  positions: Float64Array
  vertexCount: number
  indices: Uint32Array
  normals: Float64Array
}

// --- UV unwrap ----------------------------------------------------------------

export interface UnwrapResult {
  /** Seam-split vertex positions in domain units. */
  positions: Float64Array
  normals: Float64Array
  uvs: Float32Array
  indices: Uint32Array
  vertexCount: number
  chartCount: number
  /** Fraction of the atlas covered by chart bounding boxes. */
  packingEfficiency: number
  /**
   * Smallest chart dimension in texels, and how many charts are narrower than the
   * padding plus dilation needs.
   *
   * These are the numbers that decide whether an atlas bake is usable at all. A
   * chart only a few texels wide is consumed entirely by seam padding and dilation,
   * so it carries no measured data - it renders as a smeared, wavy stripe. Chart
   * count alone does not reveal this, which is why it is reported separately.
   */
  smallestChartTexels: number
  degenerateCharts: number
}

interface Chart {
  triangles: number[]
  normal: Vec3
  tangent: Vec3
  bitangent: Vec3
  /** Projected coordinates per triangle corner, in domain units. */
  minU: number
  minV: number
  width: number
  height: number
  offsetU: number
  offsetV: number
  /**
   * Texels per domain unit for this chart specifically.
   *
   * Density is per chart, not global. One shared density is only viable when charts
   * have comparable extents, and a boolean-built surface guarantees they do not: a
   * ledge strip can be a thousandth the width of a wall face. Under one density the
   * strip packs to a fraction of a texel and carries nothing, so thin charts are
   * boosted to a floor instead. Varying density across charts is normal for an
   * atlas; charts with no usable texels are not.
   */
  scale: number
}

function triangleNormal(positions: Float64Array, a: number, b: number, c: number): Vec3 {
  const ax = positions[a * 3]!; const ay = positions[a * 3 + 1]!; const az = positions[a * 3 + 2]!
  const abx = positions[b * 3]! - ax
  const aby = positions[b * 3 + 1]! - ay
  const abz = positions[b * 3 + 2]! - az
  const acx = positions[c * 3]! - ax
  const acy = positions[c * 3 + 1]! - ay
  const acz = positions[c * 3 + 2]! - az
  const nx = aby * acz - abz * acy
  const ny = abz * acx - abx * acz
  const nz = abx * acy - aby * acx
  const length = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1
  return [nx / length, ny / length, nz / length]
}

function basisFor(normal: Vec3): { tangent: Vec3; bitangent: Vec3 } {
  const up: Vec3 = Math.abs(normal[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0]
  let tx = up[1] * normal[2] - up[2] * normal[1]
  let ty = up[2] * normal[0] - up[0] * normal[2]
  let tz = up[0] * normal[1] - up[1] * normal[0]
  const length = Math.sqrt(tx * tx + ty * ty + tz * tz) || 1
  tx /= length; ty /= length; tz /= length
  return {
    tangent: [tx, ty, tz],
    bitangent: [
      normal[1] * tz - normal[2] * ty,
      normal[2] * tx - normal[0] * tz,
      normal[0] * ty - normal[1] * tx,
    ],
  }
}

/**
 * How triangles are grouped into charts.
 *
 * `cone` grows charts over edge-adjacent triangles while the normal stays inside
 * a cone around the chart's running average.
 *
 * `axis` assigns every triangle to whichever of the six signed axes its normal is
 * closest to, then takes connected components within each axis group. Prefer it
 * for surfaces built from booleans - jointed, bedded or otherwise boxy geometry -
 * for two reasons. Distortion is bounded by construction: a triangle is at most
 * 54.7 degrees from its assigned axis, so stretch cannot exceed 1.73, whereas a
 * grown chart's running average drifts and can end up projecting triangles nearly
 * edge-on where stretch approaches infinity. And it produces far fewer charts: on
 * a bedded canyon wall, cone growth fragmented into 2,792 charts because every
 * ledge step interrupts it, and chart seams were already the most visible
 * artefact on the granite assembly at 411.
 */
export type ChartMode = 'cone' | 'axis'

const AXES: ReadonlyArray<Vec3> = [
  [1, 0, 0], [-1, 0, 0],
  [0, 1, 0], [0, -1, 0],
  [0, 0, 1], [0, 0, -1],
]

export function unwrap(
  surface: ReducedSurface,
  options: {
    atlasSize: number
    padding: number
    coneDegrees?: number
    mode?: ChartMode
  },
): UnwrapResult {
  const triangleCount = surface.indices.length / 3
  const mode: ChartMode = options.mode ?? 'cone'
  const coneCosine = Math.cos(((options.coneDegrees ?? 62) * Math.PI) / 180)

  // Edge adjacency over the reduced mesh.
  const edgeMap = new Map<number, number[]>()
  for (let triangle = 0; triangle < triangleCount; triangle += 1) {
    for (let edge = 0; edge < 3; edge += 1) {
      const a = surface.indices[triangle * 3 + edge]!
      const b = surface.indices[triangle * 3 + ((edge + 1) % 3)]!
      const key = a < b ? a * 1000003 + b : b * 1000003 + a
      const bucket = edgeMap.get(key)
      if (bucket) bucket.push(triangle)
      else edgeMap.set(key, [triangle])
    }
  }

  const normals: Vec3[] = []
  for (let triangle = 0; triangle < triangleCount; triangle += 1) {
    normals.push(triangleNormal(
      surface.positions,
      surface.indices[triangle * 3]!,
      surface.indices[triangle * 3 + 1]!,
      surface.indices[triangle * 3 + 2]!,
    ))
  }

  // Seed from the largest triangles so charts grow from stable interiors
  // outward, rather than from whatever triangle happens to be index 0.
  const areaOrder = new Int32Array(triangleCount)
  for (let triangle = 0; triangle < triangleCount; triangle += 1) areaOrder[triangle] = triangle
  const areaOf = new Float64Array(triangleCount)
  for (let triangle = 0; triangle < triangleCount; triangle += 1) {
    const a = surface.indices[triangle * 3]!
    const b = surface.indices[triangle * 3 + 1]!
    const c = surface.indices[triangle * 3 + 2]!
    const ax = surface.positions[a * 3]!
    const ay = surface.positions[a * 3 + 1]!
    const az = surface.positions[a * 3 + 2]!
    const abx = surface.positions[b * 3]! - ax
    const aby = surface.positions[b * 3 + 1]! - ay
    const abz = surface.positions[b * 3 + 2]! - az
    const acx = surface.positions[c * 3]! - ax
    const acy = surface.positions[c * 3 + 1]! - ay
    const acz = surface.positions[c * 3 + 2]! - az
    const cx = aby * acz - abz * acy
    const cy = abz * acx - abx * acz
    const cz = abx * acy - aby * acx
    areaOf[triangle] = cx * cx + cy * cy + cz * cz
  }
  const sortedSeeds = Array.from(areaOrder).sort((left, right) => areaOf[right]! - areaOf[left]!)

  const chartOf = new Int32Array(triangleCount).fill(-1)
  const charts: Chart[] = []

  // Axis mode: group by dominant signed axis, then split each group into
  // edge-connected components. The projection basis is the axis itself, so unlike
  // a grown chart there is no running average to drift.
  const axisOf = new Int32Array(triangleCount)
  if (mode === 'axis') {
    for (let triangle = 0; triangle < triangleCount; triangle += 1) {
      const normal = normals[triangle]!
      let best = -Infinity
      let bestAxis = 0
      for (let axis = 0; axis < AXES.length; axis += 1) {
        const candidate = AXES[axis]!
        const dot = normal[0] * candidate[0] + normal[1] * candidate[1] + normal[2] * candidate[2]
        if (dot > best) { best = dot; bestAxis = axis }
      }
      axisOf[triangle] = bestAxis
    }

    // Relax the assignment toward agreement with neighbours.
    //
    // Pure argmax assignment is unusable on its own: a fluted wall's normals
    // wander across the 45-degree line between two axes, so adjacent triangles
    // flip back and forth and each flip starts a new connected component. Measured
    // on a canyon wall, raw assignment gave 2,068 charts - worse than the cone
    // growth it was meant to replace.
    //
    // This is a few sweeps of a Potts relaxation: a triangle adopts a neighbour's
    // axis when the agreement bonus outweighs the loss in projection alignment.
    // The `dot > 0.1` floor is what keeps it honest - a triangle is never dragged
    // onto an axis it faces nearly edge-on, which is the failure the axis mode
    // exists to prevent in the first place.
    // The agreement bonus has to be large. At 0.38 a fluted canyon wall still
    // fragmented into 693 charts, which packed to a smallest chart of a few texels
    // - entirely consumed by padding and dilation, so those charts rendered as
    // smeared wavy stripes rather than as baked detail. Chart *size* is the
    // constraint that matters, and it is bought by being aggressive here.
    //
    // The floor is what keeps it safe: a triangle is never pulled onto an axis it
    // faces more than 70 degrees away from, bounding projection stretch at 1/0.34,
    // just under 3x. That is a real cost, paid knowingly, and it is far cheaper
    // than a chart with no usable texels at all.
    const agreementBonus = 1.15
    const alignmentFloor = 0.34
    const neighbourAxes = new Int32Array(AXES.length)
    for (let pass = 0; pass < 10; pass += 1) {
      let changed = 0
      for (let triangle = 0; triangle < triangleCount; triangle += 1) {
        neighbourAxes.fill(0)
        for (let edge = 0; edge < 3; edge += 1) {
          const a = surface.indices[triangle * 3 + edge]!
          const b = surface.indices[triangle * 3 + ((edge + 1) % 3)]!
          const key = a < b ? a * 1000003 + b : b * 1000003 + a
          for (const neighbor of edgeMap.get(key) ?? []) {
            if (neighbor === triangle) continue
            neighbourAxes[axisOf[neighbor]!] += 1
          }
        }
        const normal = normals[triangle]!
        let best = -Infinity
        let bestAxis = axisOf[triangle]!
        for (let axis = 0; axis < AXES.length; axis += 1) {
          const candidate = AXES[axis]!
          const dot = normal[0] * candidate[0] + normal[1] * candidate[1] + normal[2] * candidate[2]
          if (dot < alignmentFloor) continue
          const score = dot + agreementBonus * (neighbourAxes[axis]! / 3)
          if (score > best) { best = score; bestAxis = axis }
        }
        if (bestAxis !== axisOf[triangle]) { axisOf[triangle] = bestAxis; changed += 1 }
      }
      if (changed === 0) break
    }

    for (const seed of sortedSeeds) {
      if (chartOf[seed] !== -1) continue
      const chartIndex = charts.length
      const axis = axisOf[seed]!
      const triangles: number[] = [seed]
      chartOf[seed] = chartIndex
      const queue = [seed]
      let cursor = 0
      while (cursor < queue.length) {
        const current = queue[cursor]!
        cursor += 1
        for (let edge = 0; edge < 3; edge += 1) {
          const a = surface.indices[current * 3 + edge]!
          const b = surface.indices[current * 3 + ((edge + 1) % 3)]!
          const key = a < b ? a * 1000003 + b : b * 1000003 + a
          for (const neighbor of edgeMap.get(key) ?? []) {
            if (neighbor === current || chartOf[neighbor] !== -1) continue
            if (axisOf[neighbor] !== axis) continue
            chartOf[neighbor] = chartIndex
            triangles.push(neighbor)
            queue.push(neighbor)
          }
        }
      }
      const chartNormal = AXES[axis]!
      const { tangent, bitangent } = basisFor(chartNormal)
      charts.push({
        triangles,
        normal: chartNormal,
        tangent,
        bitangent,
        minU: 0, minV: 0, width: 0, height: 0, offsetU: 0, offsetV: 0, scale: 1,
      })
    }
  }

  for (const seed of mode === 'axis' ? [] : sortedSeeds) {
    if (chartOf[seed] !== -1) continue
    const chartIndex = charts.length
    const seedNormal = normals[seed]!
    let sumX = seedNormal[0]; let sumY = seedNormal[1]; let sumZ = seedNormal[2]
    const triangles: number[] = [seed]
    chartOf[seed] = chartIndex
    const queue = [seed]
    let cursor = 0
    while (cursor < queue.length) {
      const current = queue[cursor]!
      cursor += 1
      for (let edge = 0; edge < 3; edge += 1) {
        const a = surface.indices[current * 3 + edge]!
        const b = surface.indices[current * 3 + ((edge + 1) % 3)]!
        const key = a < b ? a * 1000003 + b : b * 1000003 + a
        for (const neighbor of edgeMap.get(key) ?? []) {
          if (neighbor === current || chartOf[neighbor] !== -1) continue
          const normal = normals[neighbor]!
          const length = Math.sqrt(sumX * sumX + sumY * sumY + sumZ * sumZ) || 1
          const dot = (normal[0] * sumX + normal[1] * sumY + normal[2] * sumZ) / length
          if (dot < coneCosine) continue
          // Hard cap against the seed normal as well. The running average drifts
          // as a chart grows, so an average-only test lets a chart wrap most of
          // the way around the mass. Projecting that planar leaves triangles
          // nearly edge-on to the projection plane, where stretch approaches
          // infinity and the baked normals smear into directional streaks.
          if (normal[0] * seedNormal[0] + normal[1] * seedNormal[1] + normal[2] * seedNormal[2] < 0.52) continue
          chartOf[neighbor] = chartIndex
          triangles.push(neighbor)
          sumX += normal[0]; sumY += normal[1]; sumZ += normal[2]
          queue.push(neighbor)
        }
      }
    }
    const length = Math.sqrt(sumX * sumX + sumY * sumY + sumZ * sumZ) || 1
    const chartNormal: Vec3 = [sumX / length, sumY / length, sumZ / length]
    const { tangent, bitangent } = basisFor(chartNormal)
    charts.push({
      triangles,
      normal: chartNormal,
      tangent,
      bitangent,
      minU: 0, minV: 0, width: 0, height: 0, offsetU: 0, offsetV: 0, scale: 1,
    })
  }

  // Absorb slivers. A chart of one or two triangles costs a padded atlas slot
  // and a seam for almost no area, so it is folded into the largest adjacent
  // chart even though that raises local projection distortion.
  /**
   * Absorb slivers into the best-aligned adjacent chart.
   *
   * This runs in both modes, and the threshold is high. It was originally skipped
   * in axis mode on the theory that a cross-axis merge costs the distortion bound
   * while a stray sliver only costs an atlas slot. Measurement said otherwise: on a
   * canyon wall, 554 of 571 charts packed smaller than their own padding and
   * dilation footprint, the smallest at 0.2 texels. Such a chart contains no
   * measured data whatsoever - it is pure smeared dilation, and it is what produced
   * the wavy striped patches visible on both assets.
   *
   * So the trade is the other way round. A chart projected up to 3x stretched still
   * carries real baked detail; a two-texel chart cannot carry anything. Neighbours
   * are chosen by alignment rather than by size, and only a near-opposite facing is
   * refused, since welding a face to its own back would fold the projection.
   */
  const minimumChartTriangles = mode === 'axis' ? 40 : 6
  for (let pass = 0; pass < 6; pass += 1) {
    let merged = 0
    for (let chartIndex = 0; chartIndex < charts.length; chartIndex += 1) {
      const chart = charts[chartIndex]!
      if (chart.triangles.length === 0 || chart.triangles.length >= minimumChartTriangles) continue
      let bestChart = -1
      let bestAlignment = -2
      for (const triangle of chart.triangles) {
        for (let edge = 0; edge < 3; edge += 1) {
          const a = surface.indices[triangle * 3 + edge]!
          const b = surface.indices[triangle * 3 + ((edge + 1) % 3)]!
          const key = a < b ? a * 1000003 + b : b * 1000003 + a
          for (const neighbor of edgeMap.get(key) ?? []) {
            const other = chartOf[neighbor]!
            if (other === chartIndex || other < 0) continue
            const target = charts[other]!
            if (target.triangles.length === 0) continue
            const alignment = target.normal[0] * chart.normal[0]
              + target.normal[1] * chart.normal[1]
              + target.normal[2] * chart.normal[2]
            if (alignment < -0.2) continue
            if (alignment > bestAlignment) { bestAlignment = alignment; bestChart = other }
          }
        }
      }
      if (bestChart < 0) continue
      const target = charts[bestChart]!
      for (const triangle of chart.triangles) {
        chartOf[triangle] = bestChart
        target.triangles.push(triangle)
      }
      chart.triangles = []
      merged += 1
    }
    if (merged === 0) break
  }
  const liveCharts = charts.filter((chart) => chart.triangles.length > 0)
  charts.length = 0
  charts.push(...liveCharts)
  for (let chartIndex = 0; chartIndex < charts.length; chartIndex += 1) {
    for (const triangle of charts[chartIndex]!.triangles) chartOf[triangle] = chartIndex
  }

  // Refit each projection plane to what the chart actually holds now. Merging
  // moved triangles in, so a chart left on its seed axis would be projecting
  // absorbed content against a plane chosen before that content arrived - which is
  // the avoidable part of the merge's distortion cost.
  for (const chart of charts) {
    let sumX = 0
    let sumY = 0
    let sumZ = 0
    for (const triangle of chart.triangles) {
      const normal = normals[triangle]!
      // Area weighted, so a fringe of slivers cannot tilt the plane away from the
      // face that carries the chart's actual surface.
      const weight = Math.sqrt(areaOf[triangle]!)
      sumX += normal[0] * weight
      sumY += normal[1] * weight
      sumZ += normal[2] * weight
    }
    const length = Math.sqrt(sumX * sumX + sumY * sumY + sumZ * sumZ)
    if (length < 1e-9) continue
    chart.normal = [sumX / length, sumY / length, sumZ / length]
    const refit = basisFor(chart.normal)
    chart.tangent = refit.tangent
    chart.bitangent = refit.bitangent
  }

  // Chart extents in projected domain units.
  for (const chart of charts) {
    let minU = Infinity; let maxU = -Infinity
    let minV = Infinity; let maxV = -Infinity
    for (const triangle of chart.triangles) {
      for (let corner = 0; corner < 3; corner += 1) {
        const vertex = surface.indices[triangle * 3 + corner]!
        const px = surface.positions[vertex * 3]!
        const py = surface.positions[vertex * 3 + 1]!
        const pz = surface.positions[vertex * 3 + 2]!
        const u = px * chart.tangent[0] + py * chart.tangent[1] + pz * chart.tangent[2]
        const v = px * chart.bitangent[0] + py * chart.bitangent[1] + pz * chart.bitangent[2]
        if (u < minU) minU = u
        if (u > maxU) maxU = u
        if (v < minV) minV = v
        if (v > maxV) maxV = v
      }
    }
    chart.minU = minU
    chart.minV = minV
    chart.width = Math.max(maxU - minU, 1e-6)
    chart.height = Math.max(maxV - minV, 1e-6)
  }

  // Shelf-pack at a single texel density. The density is solved by bisection so
  // the charts fill the atlas without overflowing it.
  const padding = options.padding / options.atlasSize
  const order = [...charts].sort((left, right) => right.height - left.height)

  // Every chart needs at least this many texels across its narrow dimension before
  // seam padding and dilation have eaten it. A chart below the floor gets a higher
  // density of its own rather than being packed into nothing; the boost is capped
  // so one sliver cannot claim the atlas.
  const minimumTexels = options.padding * 2 + 10
  const maximumBoost = 24

  const tryPack = (scale: number): boolean => {
    let shelfV = padding
    let shelfHeight = 0
    let cursorU = padding
    for (const chart of order) {
      const narrow = Math.min(chart.width, chart.height)
      const needed = minimumTexels / (narrow * options.atlasSize)
      chart.scale = Math.min(Math.max(scale, needed), scale * maximumBoost)
      const width = chart.width * chart.scale
      const height = chart.height * chart.scale
      if (width + padding * 2 > 1 || height + padding * 2 > 1) return false
      if (cursorU + width + padding > 1) {
        shelfV += shelfHeight + padding
        shelfHeight = 0
        cursorU = padding
      }
      if (shelfV + height + padding > 1) return false
      chart.offsetU = cursorU
      chart.offsetV = shelfV
      cursorU += width + padding
      if (height > shelfHeight) shelfHeight = height
    }
    return true
  }
  let low = 0
  let high = 4
  for (let iteration = 0; iteration < 40; iteration += 1) {
    const middle = (low + high) / 2
    if (tryPack(middle)) low = middle
    else high = middle
  }
  const scale = low
  tryPack(scale)

  // Seam-split: a vertex shared by several charts gets one copy per chart.
  const positions: number[] = []
  const outNormals: number[] = []
  const uvs: number[] = []
  const indices = new Uint32Array(surface.indices.length)
  const splitMap = new Map<number, number>()
  let coveredArea = 0
  for (const chart of charts) {
    coveredArea += (chart.width * chart.scale + padding) * (chart.height * chart.scale + padding)
    for (const triangle of chart.triangles) {
      for (let corner = 0; corner < 3; corner += 1) {
        const vertex = surface.indices[triangle * 3 + corner]!
        const chartIndex = chartOf[triangle]!
        const splitKey = vertex * 100003 + chartIndex
        let target = splitMap.get(splitKey)
        if (target === undefined) {
          const px = surface.positions[vertex * 3]!
          const py = surface.positions[vertex * 3 + 1]!
          const pz = surface.positions[vertex * 3 + 2]!
          const u = px * chart.tangent[0] + py * chart.tangent[1] + pz * chart.tangent[2]
          const v = px * chart.bitangent[0] + py * chart.bitangent[1] + pz * chart.bitangent[2]
          target = positions.length / 3
          positions.push(px, py, pz)
          outNormals.push(
            surface.normals[vertex * 3]!,
            surface.normals[vertex * 3 + 1]!,
            surface.normals[vertex * 3 + 2]!,
          )
          uvs.push(
            Math.min(1, Math.max(0, chart.offsetU + (u - chart.minU) * chart.scale)),
            Math.min(1, Math.max(0, chart.offsetV + (v - chart.minV) * chart.scale)),
          )
          splitMap.set(splitKey, target)
        }
        indices[triangle * 3 + corner] = target
      }
    }
  }

  let smallestChartTexels = Infinity
  let degenerateCharts = 0
  // Padding is applied on both sides and dilation grows 4 texels outward, so a
  // chart needs roughly this much before any of it is genuinely measured data.
  const usableTexels = options.padding * 2 + 8
  for (const chart of charts) {
    const smallest = Math.min(chart.width, chart.height) * chart.scale * options.atlasSize
    if (smallest < smallestChartTexels) smallestChartTexels = smallest
    if (smallest < usableTexels) degenerateCharts += 1
  }

  return {
    positions: new Float64Array(positions),
    normals: new Float64Array(outNormals),
    uvs: new Float32Array(uvs),
    indices,
    vertexCount: positions.length / 3,
    chartCount: charts.length,
    packingEfficiency: coveredArea,
    smallestChartTexels: smallestChartTexels === Infinity ? 0 : smallestChartTexels,
    degenerateCharts,
  }
}
