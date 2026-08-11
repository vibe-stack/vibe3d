import { Box3, Vector3, type Group } from 'three/webgpu'

import {
  MODULE_SPECS,
  snapKitAsset,
  socketWorldNormal,
  socketWorldPosition,
  validateKitMetadata,
  type KitMetadata,
  type KitModuleId,
} from '../assets/prototypes/axiom-modular-kit/contract.ts'

interface ModelController {
  root: Group
  update(deltaSeconds: number): void
  dispose(): void
}

interface ModelModule {
  createModel(): ModelController
}

interface AuditResult {
  moduleId: KitModuleId
  bounds: { min: number[]; max: number[] }
  sockets: number
  errors: string[]
}

interface AssemblyAuditResult {
  name: string
  errors: string[]
  placements: Record<string, number[]>
}

// Modular seams should never rely on a visibly forgiving envelope. This only
// permits small bevel/rounding overshoot at the authored outer boundary.
const POSITION_TOLERANCE = 0.0125
const NORMAL_TOLERANCE = 1e-6

function near(actual: number, expected: number, tolerance = POSITION_TOLERANCE): boolean {
  return Math.abs(actual - expected) <= tolerance
}

function checkAxisNormal(normal: readonly [number, number, number]): boolean {
  const length = Math.hypot(...normal)
  if (Math.abs(length - 1) > NORMAL_TOLERANCE) return false
  return normal.filter((value) => Math.abs(value) > NORMAL_TOLERANCE).length === 1
}

function checkBounds(moduleId: KitModuleId, bounds: Box3, errors: string[]): void {
  const spec = MODULE_SPECS[moduleId]
  const expected = {
    min: new Vector3(0, 0, -spec.depth),
    max: new Vector3(spec.width, spec.height, 0),
  }
  const checks = [
    ['minX', bounds.min.x, expected.min.x],
    ['minY', bounds.min.y, expected.min.y],
    ['minZ', bounds.min.z, expected.min.z],
    ['maxX', bounds.max.x, expected.max.x],
    ['maxY', bounds.max.y, expected.max.y],
    ['maxZ', bounds.max.z, expected.max.z],
  ] as const
  for (const [label, actual, target] of checks) {
    if (!near(actual, target)) errors.push(`${label} ${actual.toFixed(4)} != contract ${target.toFixed(4)}`)
  }
}

function checkMetadata(metadata: KitMetadata, errors: string[]): void {
  const names = new Set<string>()
  for (const socket of metadata.sockets) {
    if (names.has(socket.name)) errors.push(`duplicate socket name ${socket.name}`)
    names.add(socket.name)
    if (socket.position.some((value) => !Number.isFinite(value))) errors.push(`${socket.name} has non-finite position`)
    if (!checkAxisNormal(socket.normal)) errors.push(`${socket.name} normal must be unit axis-aligned`)
  }
  if (metadata.sockets.length === 0) errors.push('no modular sockets declared')
}

async function auditModule(moduleId: KitModuleId): Promise<AuditResult> {
  const errors: string[] = []
  const modelUrl = new URL(`../assets/prototypes/${moduleId}/model.ts`, import.meta.url)
  let controller: ModelController | undefined
  let bounds = new Box3()
  let socketCount = 0
  try {
    const module = await import(modelUrl.href) as ModelModule
    if (typeof module.createModel !== 'function') throw new Error('missing createModel export')
    controller = module.createModel()
    if (!controller.root?.isGroup) throw new Error('createModel did not return a Group root')
    if (controller.root.position.lengthSq() > 1e-12) errors.push('root transform must remain at the authored pivot')
    controller.root.updateMatrixWorld(true)
    bounds = new Box3().setFromObject(controller.root, true)
    if (bounds.isEmpty()) errors.push('empty render bounds')
    else checkBounds(moduleId, bounds, errors)
    const metadata = validateKitMetadata(controller.root)
    socketCount = metadata.sockets.length
    checkMetadata(metadata, errors)
    controller.update(1 / 60)
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error))
  } finally {
    controller?.dispose()
  }
  return {
    moduleId,
    bounds: { min: bounds.min.toArray(), max: bounds.max.toArray() },
    sockets: socketCount,
    errors,
  }
}

async function loadController(moduleId: KitModuleId): Promise<ModelController> {
  const modelUrl = new URL(`../assets/prototypes/${moduleId}/model.ts`, import.meta.url)
  const module = await import(modelUrl.href) as ModelModule
  return module.createModel()
}

function checkSocketClosure(
  a: Group,
  aSocket: string,
  b: Group,
  bSocket: string,
  label: string,
  errors: string[],
): void {
  const distance = socketWorldPosition(a, aSocket).distanceTo(socketWorldPosition(b, bSocket))
  const normalDot = socketWorldNormal(a, aSocket).dot(socketWorldNormal(b, bSocket))
  if (distance > 1e-6) errors.push(`${label} socket gap ${distance}`)
  if (normalDot > -0.999999) errors.push(`${label} normals are not opposed (${normalDot})`)
}

async function auditAssemblies(): Promise<AssemblyAuditResult[]> {
  const output: AssemblyAuditResult[] = []

  {
    const name = 'wall run: corner + door + raised window + end cap'
    const errors: string[] = []
    const controllers = await Promise.all([
      loadController('exterior-wall-corner'),
      loadController('door-bay'),
      loadController('window-bay'),
      loadController('wall-end-cap'),
    ])
    const [corner, door, window, cap] = controllers.map((controller) => controller.root)
    try {
      snapKitAsset(door!, 'wall_snap_left', corner!, 'wall-east')
      snapKitAsset(window!, 'wall_snap_left', door!, 'wall_snap_right')
      snapKitAsset(cap!, 'wall-west', window!, 'wall_snap_right')
      checkSocketClosure(corner!, 'wall-east', door!, 'wall_snap_left', 'corner/door', errors)
      checkSocketClosure(door!, 'wall_snap_right', window!, 'wall_snap_left', 'door/window', errors)
      checkSocketClosure(window!, 'wall_snap_right', cap!, 'wall-west', 'window/cap', errors)
      if (!near(window!.position.y, 0)) errors.push(`full-height window bay must share the common wall datum; got ${window!.position.y}`)
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error))
    }
    output.push({ name, errors, placements: { door: door!.position.toArray(), window: window!.position.toArray(), cap: cap!.position.toArray() } })
    controllers.forEach((controller) => controller.dispose())
  }

  {
    const name = 'foundation + floor and two-tile floor seam'
    const errors: string[] = []
    const controllers = await Promise.all([
      loadController('foundation-interface'),
      loadController('floor-slab-tile'),
      loadController('floor-slab-tile'),
    ])
    const [foundation, floorA, floorB] = controllers.map((controller) => controller.root)
    try {
      snapKitAsset(floorA!, 'foundation_mount_center', foundation!, 'floor_mount_center')
      snapKitAsset(floorB!, 'floor_snap_w', floorA!, 'floor_snap_e')
      checkSocketClosure(foundation!, 'floor_mount_center', floorA!, 'foundation_mount_center', 'foundation/floor', errors)
      checkSocketClosure(floorA!, 'floor_snap_e', floorB!, 'floor_snap_w', 'floor seam', errors)
      const foundationBounds = new Box3().setFromObject(foundation!)
      const floorBounds = new Box3().setFromObject(floorA!)
      if (!near(foundationBounds.max.y, floorBounds.min.y)) errors.push(`floor does not seat on foundation top (${foundationBounds.max.y} vs ${floorBounds.min.y})`)
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error))
    }
    output.push({ name, errors, placements: { floorA: floorA!.position.toArray(), floorB: floorB!.position.toArray() } })
    controllers.forEach((controller) => controller.dispose())
  }

  {
    const name = 'door bay + threshold insert'
    const errors: string[] = []
    const controllers = await Promise.all([
      loadController('door-bay'),
      loadController('building-threshold'),
    ])
    const [door, threshold] = controllers.map((controller) => controller.root)
    try {
      snapKitAsset(threshold!, 'door_bay_center', door!, 'threshold_center')
      checkSocketClosure(door!, 'threshold_center', threshold!, 'door_bay_center', 'door/threshold', errors)
      if (!near(threshold!.position.y, 0)) errors.push(`threshold must remain on the ground datum; got ${threshold!.position.y}`)
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error))
    }
    output.push({ name, errors, placements: { threshold: threshold!.position.toArray() } })
    controllers.forEach((controller) => controller.dispose())
  }

  {
    const name = 'ceiling slab + roof edge seat'
    const errors: string[] = []
    const controllers = await Promise.all([
      loadController('ceiling-slab-panel'),
      loadController('roof-floor-edge-module'),
    ])
    const [ceiling, edge] = controllers.map((controller) => controller.root)
    try {
      snapKitAsset(edge!, 'roof_snap_center', ceiling!, 'roof_mount_center')
      checkSocketClosure(ceiling!, 'roof_mount_center', edge!, 'roof_snap_center', 'ceiling/roof edge', errors)
      if (!near(edge!.position.y, MODULE_SPECS['ceiling-slab-panel'].height)) {
        errors.push(`roof edge must seat on the ceiling top; got ${edge!.position.y}`)
      }
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error))
    }
    output.push({ name, errors, placements: { edge: edge!.position.toArray() } })
    controllers.forEach((controller) => controller.dispose())
  }

  {
    const name = 'gate pair + lintel + mirrored returns'
    const errors: string[] = []
    const controllers = await Promise.all([
      loadController('gate-post-pair'),
      loadController('gate-lintel'),
      loadController('gate-wall-return'),
      loadController('gate-wall-return'),
    ])
    const [posts, lintel, leftReturn, rightReturn] = controllers.map((controller) => controller.root)
    try {
      snapKitAsset(lintel!, 'post-left-seat', posts!, 'lintel-left')
      snapKitAsset(leftReturn!, 'gate-post', posts!, 'return-left')
      snapKitAsset(rightReturn!, 'gate-post', posts!, 'return-right')
      checkSocketClosure(posts!, 'lintel-left', lintel!, 'post-left-seat', 'left lintel seat', errors)
      checkSocketClosure(posts!, 'lintel-right', lintel!, 'post-right-seat', 'right lintel seat', errors)
      checkSocketClosure(posts!, 'return-left', leftReturn!, 'gate-post', 'left return', errors)
      checkSocketClosure(posts!, 'return-right', rightReturn!, 'gate-post', 'right return', errors)
      const lintelBounds = new Box3().setFromObject(lintel!)
      if (!near(lintelBounds.max.y, 4)) errors.push(`gate lintel top ${lintelBounds.max.y} does not close the 4 m gate datum`)
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error))
    }
    output.push({
      name,
      errors,
      placements: {
        lintel: lintel!.position.toArray(),
        leftReturn: leftReturn!.position.toArray(),
        rightReturn: rightReturn!.position.toArray(),
      },
    })
    controllers.forEach((controller) => controller.dispose())
  }

  {
    const name = 'small building + reusable front door/window inserts'
    const errors: string[] = []
    const controllers = await Promise.all([
      loadController('small-building-shell'),
      loadController('door-bay'),
      loadController('window-bay'),
    ])
    const [building, door, window] = controllers.map((controller) => controller.root)
    try {
      snapKitAsset(door!, 'prefab_mount_back', building!, 'door_bay_h_0_0')
      snapKitAsset(window!, 'prefab_mount_back', building!, 'window_bay_h_1_0')
      checkSocketClosure(building!, 'door_bay_h_0_0', door!, 'prefab_mount_back', 'small-building/door', errors)
      checkSocketClosure(building!, 'window_bay_h_1_0', window!, 'prefab_mount_back', 'small-building/window', errors)
      // The shell's openings are now derived from its layout grid rather than
      // pinned to a hand-placed 2 m bay, so the fit test is that each insert
      // lands centred on the socket it snapped to and spans a whole bay width.
      const doorBounds = new Box3().setFromObject(door!)
      const windowBounds = new Box3().setFromObject(window!)
      const doorSocket = socketWorldPosition(building!, 'door_bay_h_0_0')
      const windowSocket = socketWorldPosition(building!, 'window_bay_h_1_0')
      if (!near((doorBounds.min.x + doorBounds.max.x) / 2, doorSocket.x, 0.02)) errors.push(`door insert is not centred on its bay socket: ${(doorBounds.min.x + doorBounds.max.x) / 2} vs ${doorSocket.x}`)
      if (!near((windowBounds.min.x + windowBounds.max.x) / 2, windowSocket.x, 0.02)) errors.push(`window insert is not centred on its bay socket: ${(windowBounds.min.x + windowBounds.max.x) / 2} vs ${windowSocket.x}`)
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error))
    }
    output.push({ name, errors, placements: { door: door!.position.toArray(), window: window!.position.toArray() } })
    controllers.forEach((controller) => controller.dispose())
  }

  {
    const name = 'storefront + reusable center door and side windows'
    const errors: string[] = []
    const controllers = await Promise.all([
      loadController('storefront-facade-shell'),
      loadController('door-bay'),
      loadController('window-bay'),
      loadController('window-bay'),
    ])
    const [storefront, door, leftWindow, rightWindow] = controllers.map((controller) => controller.root)
    try {
      snapKitAsset(door!, 'prefab_mount_back', storefront!, 'door_bay_center')
      snapKitAsset(leftWindow!, 'prefab_mount_back', storefront!, 'window_bay_left')
      snapKitAsset(rightWindow!, 'prefab_mount_back', storefront!, 'window_bay_right')
      checkSocketClosure(storefront!, 'door_bay_center', door!, 'prefab_mount_back', 'storefront/door', errors)
      checkSocketClosure(storefront!, 'window_bay_left', leftWindow!, 'prefab_mount_back', 'storefront/left window', errors)
      checkSocketClosure(storefront!, 'window_bay_right', rightWindow!, 'prefab_mount_back', 'storefront/right window', errors)
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error))
    }
    output.push({
      name,
      errors,
      placements: {
        door: door!.position.toArray(),
        leftWindow: leftWindow!.position.toArray(),
        rightWindow: rightWindow!.position.toArray(),
      },
    })
    controllers.forEach((controller) => controller.dispose())
  }

  return output
}

const moduleIds = Object.keys(MODULE_SPECS) as KitModuleId[]
const results: AuditResult[] = []
for (const moduleId of moduleIds) results.push(await auditModule(moduleId))

const failed = results.filter((result) => result.errors.length > 0)
let assemblies: AssemblyAuditResult[] = []
try {
  assemblies = await auditAssemblies()
} catch (error) {
  assemblies = [{ name: 'assembly audit bootstrap', errors: [error instanceof Error ? error.message : String(error)], placements: {} }]
}
const failedAssemblies = assemblies.filter((assembly) => assembly.errors.length > 0)
console.log(JSON.stringify({
  contract: 'Axiom modular kit v1',
  passed: results.length - failed.length,
  failed: failed.length,
  assemblyPassed: assemblies.length - failedAssemblies.length,
  assemblyFailed: failedAssemblies.length,
  assemblies,
  results,
}, null, 2))

if (failed.length > 0 || failedAssemblies.length > 0) process.exitCode = 1
