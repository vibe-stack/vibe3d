import { Group, Mesh, Vector3, type BufferGeometry, type Object3D } from 'three/webgpu'

import { MODULE_SPECS, snapKitAsset, type KitModuleId } from '../assets/prototypes/axiom-modular-kit/contract.ts'

interface ModelController {
  root: Group
  dispose(): void
}

interface ModelModule {
  createModel(): ModelController
}

interface Point2 { x: number; y: number }

interface TriangleSample {
  id: number
  mesh: string
  asset: string
  sourceId: string
  axis: 0 | 1 | 2
  sign: -1 | 1
  normal: [number, number, number]
  normalKey: string
  centroid: [number, number, number]
  plane: number
  points: [Point2, Point2, Point2]
  bounds: [number, number, number, number]
  area: number
}

interface Conflict {
  meshA: string
  meshB: string
  assetA: string
  assetB: string
  sourceA: string
  sourceB: string
  axis: number
  separation: number
  overlapArea: number
  occurrences: number
}

const MAX_SEPARATION = 0.008
// Exact and sub-millimetre same-facing overlaps are hard failures. Wider
// near-coplanar layers remain in the report for mandatory grazing-view review.
const HARD_FAILURE_SEPARATION = 0.001
const PLANE_BUCKET = MAX_SEPARATION
const GRID_CELL = 0.25
const MIN_OVERLAP_AREA = 1e-5
const NORMAL_ALIGNMENT = 0.9999

function signedArea(points: readonly Point2[]): number {
  let sum = 0
  for (let i = 0; i < points.length; i += 1) {
    const a = points[i]!
    const b = points[(i + 1) % points.length]!
    sum += a.x * b.y - b.x * a.y
  }
  return sum * 0.5
}

function lineIntersection(a: Point2, b: Point2, c: Point2, d: Point2): Point2 {
  const abX = b.x - a.x
  const abY = b.y - a.y
  const cdX = d.x - c.x
  const cdY = d.y - c.y
  const denominator = abX * cdY - abY * cdX
  if (Math.abs(denominator) < 1e-12) return { x: b.x, y: b.y }
  const t = ((c.x - a.x) * cdY - (c.y - a.y) * cdX) / denominator
  return { x: a.x + abX * t, y: a.y + abY * t }
}

function inside(point: Point2, edgeA: Point2, edgeB: Point2): boolean {
  return (edgeB.x - edgeA.x) * (point.y - edgeA.y)
    - (edgeB.y - edgeA.y) * (point.x - edgeA.x) >= -1e-10
}

function clippedArea(subject: readonly Point2[], clip: readonly Point2[]): number {
  let polygon = [...subject]
  for (let edge = 0; edge < clip.length; edge += 1) {
    const edgeA = clip[edge]!
    const edgeB = clip[(edge + 1) % clip.length]!
    const input = polygon
    polygon = []
    if (input.length === 0) break
    let previous = input[input.length - 1]!
    for (const current of input) {
      const currentInside = inside(current, edgeA, edgeB)
      const previousInside = inside(previous, edgeA, edgeB)
      if (currentInside) {
        if (!previousInside) polygon.push(lineIntersection(previous, current, edgeA, edgeB))
        polygon.push(current)
      } else if (previousInside) {
        polygon.push(lineIntersection(previous, current, edgeA, edgeB))
      }
      previous = current
    }
  }
  return Math.abs(signedArea(polygon))
}

function projectedPoint(point: Vector3, axis: 0 | 1 | 2): Point2 {
  if (axis === 0) return { x: point.y, y: point.z }
  if (axis === 1) return { x: point.x, y: point.z }
  return { x: point.x, y: point.y }
}

function sourceInfo(object: Object3D, auditRoot: Group): { asset: string; sourceId: string } {
  let current: Object3D | null = object
  while (current) {
    const moduleId = (current.userData.modularKit as { moduleId?: unknown } | undefined)?.moduleId
    if (typeof moduleId === 'string') return { asset: moduleId, sourceId: current.uuid }
    if (current === auditRoot) break
    current = current.parent
  }
  return { asset: auditRoot.name || '<assembly>', sourceId: auditRoot.uuid }
}

function triangleSamples(root: Group): TriangleSample[] {
  const output: TriangleSample[] = []
  const a = new Vector3()
  const b = new Vector3()
  const c = new Vector3()
  const ab = new Vector3()
  const ac = new Vector3()
  const normal = new Vector3()
  root.updateMatrixWorld(true)
  root.traverse((object) => {
    if (!(object instanceof Mesh)) return
    const source = sourceInfo(object, root)
    const geometry = object.geometry as BufferGeometry
    const position = geometry.getAttribute('position')
    if (!position) return
    const index = geometry.getIndex()
    const triangleCount = index ? index.count / 3 : position.count / 3
    for (let triangle = 0; triangle < triangleCount; triangle += 1) {
      const ia = index ? index.getX(triangle * 3) : triangle * 3
      const ib = index ? index.getX(triangle * 3 + 1) : triangle * 3 + 1
      const ic = index ? index.getX(triangle * 3 + 2) : triangle * 3 + 2
      a.fromBufferAttribute(position, ia).applyMatrix4(object.matrixWorld)
      b.fromBufferAttribute(position, ib).applyMatrix4(object.matrixWorld)
      c.fromBufferAttribute(position, ic).applyMatrix4(object.matrixWorld)
      normal.crossVectors(ab.subVectors(b, a), ac.subVectors(c, a)).normalize()
      if (normal.lengthSq() < 0.5) continue
      const components = [Math.abs(normal.x), Math.abs(normal.y), Math.abs(normal.z)] as const
      let axis: 0 | 1 | 2 = 0
      if (components[1] > components[axis]) axis = 1
      if (components[2] > components[axis]) axis = 2
      const signedComponent = axis === 0 ? normal.x : axis === 1 ? normal.y : normal.z
      const sign = (signedComponent < 0 ? -1 : 1) as -1 | 1
      const normalTuple: [number, number, number] = [normal.x, normal.y, normal.z]
      const normalKey = normalTuple.map((value) => Math.round(value * 1000)).join(',')
      const centroid: [number, number, number] = [
        (a.x + b.x + c.x) / 3,
        (a.y + b.y + c.y) / 3,
        (a.z + b.z + c.z) / 3,
      ]
      const projected = [projectedPoint(a, axis), projectedPoint(b, axis), projectedPoint(c, axis)] as [Point2, Point2, Point2]
      if (signedArea(projected) < 0) [projected[1], projected[2]] = [projected[2], projected[1]]
      const area = Math.abs(signedArea(projected))
      if (area < 1e-10) continue
      const xs = projected.map((point) => point.x)
      const ys = projected.map((point) => point.y)
      output.push({
        id: output.length,
        mesh: object.name || '<unnamed mesh>',
        asset: source.asset,
        sourceId: source.sourceId,
        axis,
        sign,
        normal: normalTuple,
        normalKey,
        centroid,
        plane: normal.x * centroid[0] + normal.y * centroid[1] + normal.z * centroid[2],
        points: projected,
        bounds: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)],
        area,
      })
    }
  })
  return output
}

function auditTriangles(samples: TriangleSample[]): Conflict[] {
  const spatial = new Map<string, TriangleSample[]>()
  const compared = new Set<string>()
  const conflicts = new Map<string, Conflict>()
  for (const sample of samples) {
    const planeBucket = Math.floor(sample.plane / PLANE_BUCKET)
    const minCellX = Math.floor(sample.bounds[0] / GRID_CELL)
    const minCellY = Math.floor(sample.bounds[1] / GRID_CELL)
    const maxCellX = Math.floor(sample.bounds[2] / GRID_CELL)
    const maxCellY = Math.floor(sample.bounds[3] / GRID_CELL)
    for (let bucket = planeBucket - 1; bucket <= planeBucket + 1; bucket += 1) {
      for (let cellX = minCellX; cellX <= maxCellX; cellX += 1) {
        for (let cellY = minCellY; cellY <= maxCellY; cellY += 1) {
          const key = `${sample.axis}:${sample.sign}:${sample.normalKey}:${bucket}:${cellX}:${cellY}`
          for (const candidate of spatial.get(key) ?? []) {
            const pairKey = sample.id < candidate.id ? `${sample.id}:${candidate.id}` : `${candidate.id}:${sample.id}`
            if (compared.has(pairKey)) continue
            compared.add(pairKey)
            const normalDot = sample.normal[0] * candidate.normal[0]
              + sample.normal[1] * candidate.normal[1]
              + sample.normal[2] * candidate.normal[2]
            if (normalDot < NORMAL_ALIGNMENT) continue
            const candidatePlane = sample.normal[0] * candidate.centroid[0]
              + sample.normal[1] * candidate.centroid[1]
              + sample.normal[2] * candidate.centroid[2]
            const separation = Math.abs(sample.plane - candidatePlane)
            if (separation >= MAX_SEPARATION) continue
            if (sample.bounds[2] <= candidate.bounds[0] || candidate.bounds[2] <= sample.bounds[0]
              || sample.bounds[3] <= candidate.bounds[1] || candidate.bounds[3] <= sample.bounds[1]) continue
            const overlapArea = clippedArea(sample.points, candidate.points)
            if (overlapArea < Math.max(MIN_OVERLAP_AREA, Math.min(sample.area, candidate.area) * 0.01)) continue
            const sampleKey = `${sample.sourceId}|${sample.mesh}`
            const candidateKey = `${candidate.sourceId}|${candidate.mesh}`
            const sampleFirst = sampleKey < candidateKey
            const meshA = sampleFirst ? sample.mesh : candidate.mesh
            const meshB = sampleFirst ? candidate.mesh : sample.mesh
            const assetA = sampleFirst ? sample.asset : candidate.asset
            const assetB = sampleFirst ? candidate.asset : sample.asset
            const sourceA = sampleFirst ? sample.sourceId : candidate.sourceId
            const sourceB = sampleFirst ? candidate.sourceId : sample.sourceId
            const conflictKey = `${sourceA}|${meshA}|${sourceB}|${meshB}|${sample.axis}|${sample.normalKey}`
            const existing = conflicts.get(conflictKey)
            if (existing) {
              existing.occurrences += 1
              existing.overlapArea += overlapArea
              existing.separation = Math.min(existing.separation, separation)
            } else {
              conflicts.set(conflictKey, { meshA, meshB, assetA, assetB, sourceA, sourceB, axis: sample.axis, separation, overlapArea, occurrences: 1 })
            }
          }
    } } }
    for (let cellX = minCellX; cellX <= maxCellX; cellX += 1) {
      for (let cellY = minCellY; cellY <= maxCellY; cellY += 1) {
        const key = `${sample.axis}:${sample.sign}:${sample.normalKey}:${planeBucket}:${cellX}:${cellY}`
        const list = spatial.get(key)
        if (list) list.push(sample)
        else spatial.set(key, [sample])
      }
    }
  }
  return [...conflicts.values()].sort((a, b) => b.overlapArea - a.overlapArea)
}

async function loadController(moduleId: KitModuleId): Promise<ModelController> {
  const modelUrl = new URL(`../assets/prototypes/${moduleId}/model.ts`, import.meta.url)
  const module = await import(modelUrl.href) as ModelModule
  return module.createModel()
}

async function auditModule(moduleId: KitModuleId): Promise<{ moduleId: string; samples: number; conflicts: Conflict[] }> {
  const controller = await loadController(moduleId)
  try {
    const samples = triangleSamples(controller.root)
    return { moduleId, samples: samples.length, conflicts: auditTriangles(samples).slice(0, 40) }
  } finally {
    controller.dispose()
  }
}

async function auditAssembly(
  moduleId: string,
  moduleIds: KitModuleId[],
  place: (roots: Group[]) => void,
): Promise<{ moduleId: string; samples: number; conflicts: Conflict[] }> {
  const controllers = await Promise.all(moduleIds.map(loadController))
  const root = new Group()
  root.name = moduleId
  root.add(...controllers.map((controller) => controller.root))
  try {
    place(controllers.map((controller) => controller.root))
    root.updateMatrixWorld(true)
    const samples = triangleSamples(root)
    const conflicts = auditTriangles(samples)
      .filter((conflict) => conflict.sourceA !== conflict.sourceB)
      .slice(0, 40)
    return { moduleId, samples: samples.length, conflicts }
  } finally {
    controllers.forEach((controller) => controller.dispose())
  }
}

async function auditAssemblies(): Promise<Array<{ moduleId: string; samples: number; conflicts: Conflict[] }>> {
  return Promise.all([
    auditAssembly('assembly:wall-run', ['exterior-wall-corner', 'door-bay', 'window-bay', 'wall-end-cap'], ([corner, door, window, cap]) => {
      snapKitAsset(door!, 'wall_snap_left', corner!, 'wall-east')
      snapKitAsset(window!, 'wall_snap_left', door!, 'wall_snap_right')
      snapKitAsset(cap!, 'wall-west', window!, 'wall_snap_right')
    }),
    auditAssembly('assembly:slab-stack', ['foundation-interface', 'floor-slab-tile', 'floor-slab-tile'], ([foundation, floorA, floorB]) => {
      snapKitAsset(floorA!, 'foundation_mount_center', foundation!, 'floor_mount_center')
      snapKitAsset(floorB!, 'floor_snap_w', floorA!, 'floor_snap_e')
    }),
    auditAssembly('assembly:door-threshold', ['door-bay', 'building-threshold'], ([door, threshold]) => {
      snapKitAsset(threshold!, 'door_bay_center', door!, 'threshold_center')
    }),
    auditAssembly('assembly:ceiling-edge', ['ceiling-slab-panel', 'roof-floor-edge-module'], ([ceiling, edge]) => {
      snapKitAsset(edge!, 'roof_snap_center', ceiling!, 'roof_mount_center')
    }),
    auditAssembly('assembly:gate', ['gate-post-pair', 'gate-lintel', 'gate-wall-return', 'gate-wall-return'], ([posts, lintel, leftReturn, rightReturn]) => {
      snapKitAsset(lintel!, 'post-left-seat', posts!, 'lintel-left')
      snapKitAsset(leftReturn!, 'gate-post', posts!, 'return-left')
      snapKitAsset(rightReturn!, 'gate-post', posts!, 'return-right')
    }),
    auditAssembly('assembly:small-building-inserts', ['small-building-shell', 'door-bay', 'window-bay'], ([building, door, window]) => {
      snapKitAsset(door!, 'prefab_mount_back', building!, 'door_bay_h_0_0')
      snapKitAsset(window!, 'prefab_mount_back', building!, 'window_bay_h_1_0')
    }),
    auditAssembly('assembly:storefront-inserts', ['storefront-facade-shell', 'door-bay', 'window-bay', 'window-bay'], ([storefront, door, leftWindow, rightWindow]) => {
      snapKitAsset(door!, 'prefab_mount_back', storefront!, 'door_bay_center')
      snapKitAsset(leftWindow!, 'prefab_mount_back', storefront!, 'window_bay_left')
      snapKitAsset(rightWindow!, 'prefab_mount_back', storefront!, 'window_bay_right')
    }),
  ])
}

const moduleFlag = process.argv.indexOf('--module')
const requestedModule = moduleFlag >= 0 ? process.argv[moduleFlag + 1] as KitModuleId | undefined : undefined
if (requestedModule && !(requestedModule in MODULE_SPECS)) throw new Error(`Unknown module: ${requestedModule}`)
const moduleIds = requestedModule ? [requestedModule] : Object.keys(MODULE_SPECS) as KitModuleId[]
const results = []
for (const moduleId of moduleIds) results.push(await auditModule(moduleId))
if (!requestedModule && !process.argv.includes('--modules-only')) results.push(...await auditAssemblies())
const isCrossBatchHard = (conflict: Conflict): boolean => conflict.separation < HARD_FAILURE_SEPARATION
  && (conflict.sourceA !== conflict.sourceB || conflict.meshA !== conflict.meshB)
const failed = results.filter((result) => result.conflicts.some(isCrossBatchHard))
if (process.argv.includes('--summary')) {
  console.log(`z-fight audit: ${results.length - failed.length}/${results.length} cross-batch hard-clean (<${HARD_FAILURE_SEPARATION}m fails; merged self-pairs and <${MAX_SEPARATION}m layers reviewed)`)
  for (const result of results) {
    const totalArea = result.conflicts.reduce((sum, conflict) => sum + conflict.overlapArea, 0)
    const crossHard = result.conflicts.filter(isCrossBatchHard)
    const selfHard = result.conflicts.filter((conflict) => conflict.separation < HARD_FAILURE_SEPARATION
      && conflict.sourceA === conflict.sourceB && conflict.meshA === conflict.meshB)
    const worst = result.conflicts[0]
    console.log([
      result.moduleId,
      `${crossHard.length} cross-hard / ${selfHard.length} merged-self / ${result.conflicts.length} near groups`,
      `${totalArea.toFixed(4)}m2 sampled overlap`,
      worst ? `worst ${worst.overlapArea.toFixed(4)}m2 @ ${(worst.separation * 1000).toFixed(2)}mm` : 'clean',
      worst ? `${worst.assetA}:${worst.meshA} <> ${worst.assetB}:${worst.meshB}` : '',
    ].join('\t'))
  }
} else console.log(JSON.stringify({
  hardFailureThresholdMeters: HARD_FAILURE_SEPARATION,
  reviewThresholdMeters: MAX_SEPARATION,
  passed: results.length - failed.length,
  failed: failed.length,
  results,
}, null, 2))
if (failed.length > 0) process.exitCode = 1
