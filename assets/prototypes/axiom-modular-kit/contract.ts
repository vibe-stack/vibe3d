import { Quaternion, Vector3, type Group } from 'three/webgpu'

export const AXIOM_KIT = Object.freeze({
  grid: 1,
  structuralIncrement: 0.25,
  wallThickness: 0.25,
  wallHeight: 3,
  wallSocketY: 1.5,
  wallCenterZ: -0.125,
  floorThickness: 0.2,
  ceilingThickness: 0.18,
  floorSurfaceY: 0.2,
  doorClearWidth: 1.6,
  doorClearHeight: 2.6,
  windowClearWidth: 1.5,
  windowClearHeight: 1.4,
  gateClearWidth: 4,
  previewFront: '+Z',
  pivot: 'front-left-ground',
} as const)

export type KitSocketKind =
  | 'wall'
  | 'floor'
  | 'ceiling'
  | 'foundation'
  | 'door'
  | 'window'
  | 'roof-edge'
  | 'gate-post'
  | 'gate-lintel'
  | 'gate-return'
  | 'service'
  | 'dressing'

export interface KitSocket {
  readonly name: string
  readonly kind: KitSocketKind
  readonly position: readonly [number, number, number]
  readonly normal: readonly [number, number, number]
  readonly up?: readonly [number, number, number]
}

export interface KitEnvelope {
  readonly width: number
  readonly depth: number
  readonly height: number
}

export interface KitModuleSpec extends KitEnvelope {
  readonly label: string
  readonly family: 'connector' | 'gate' | 'prefab'
  readonly reference: string
  readonly notes?: string
}

// Repository-relative so metadata remains portable across worktrees and exports.
const REF = 'docs/assets/reusable/architecture'

export const MODULE_SPECS = {
  'building-threshold': { label: 'Building Threshold', family: 'connector', width: 2, depth: 0.5, height: 0.2, reference: `${REF}/modular-building-connectors/building-threshold.png` },
  'ceiling-slab-panel': { label: 'Ceiling Slab Panel', family: 'connector', width: 2, depth: 2, height: 0.18, reference: `${REF}/modular-building-connectors/ceiling-slab-panel.png` },
  'door-bay': { label: 'Door Bay', family: 'connector', width: 2, depth: 0.3, height: 3, reference: `${REF}/modular-building-connectors/door-bay.png` },
  'exterior-wall-corner': { label: 'Exterior Wall Corner', family: 'connector', width: 2, depth: 2, height: 3, reference: `${REF}/modular-building-connectors/exterior-wall-corner.png` },
  'floor-slab-tile': { label: 'Floor Slab Tile', family: 'connector', width: 2, depth: 2, height: 0.2, reference: `${REF}/modular-building-connectors/floor-slab-tile.png` },
  'foundation-interface': { label: 'Foundation Interface', family: 'connector', width: 2, depth: 2, height: 0.4, reference: `${REF}/modular-building-connectors/foundation-interface.png` },
  'interior-wall-corner': { label: 'Interior Wall Corner', family: 'connector', width: 2, depth: 2, height: 3, reference: `${REF}/modular-building-connectors/interior-wall-corner.png` },
  'roof-floor-edge-module': { label: 'Roof / Floor Edge Module', family: 'connector', width: 2, depth: 0.5, height: 0.35, reference: `${REF}/modular-building-connectors/roof-floor-edge-module.png` },
  'wall-end-cap': { label: 'Wall End Cap', family: 'connector', width: 0.5, depth: 0.25, height: 3, reference: `${REF}/modular-building-connectors/wall-end-cap.png` },
  'wall-return': { label: 'Wall Return', family: 'connector', width: 1, depth: 1, height: 3, reference: `${REF}/modular-building-connectors/wall-return.png` },
  'wall-t-junction': { label: 'Wall T-Junction', family: 'connector', width: 2, depth: 2, height: 3, reference: `${REF}/modular-building-connectors/wall-t-junction.png` },
  'window-bay': { label: 'Window Bay', family: 'connector', width: 2, depth: 0.25, height: 2, reference: `${REF}/modular-building-connectors/window-bay.png` },
  'gate-lintel': { label: 'Gate Lintel', family: 'gate', width: 4, depth: 1, height: 0.75, reference: `${REF}/gate-closure/gate-lintel.png` },
  'gate-post-pair': { label: 'Gate Post Pair', family: 'gate', width: 6, depth: 1, height: 4, reference: `${REF}/gate-closure/gate-post-pair.png`, notes: 'Two 1 m jamb towers separated by the authored 4 m clear span; placement width is therefore 6 m.' },
  'gate-wall-return': { label: 'Gate Wall Return', family: 'gate', width: 2, depth: 1, height: 3, reference: `${REF}/gate-closure/gate-wall-return.png` },
  'checkpoint-gate-assembly': { label: 'Checkpoint Gate Assembly', family: 'prefab', width: 12, depth: 6, height: 4, reference: `${REF}/building-prefab-assemblies/checkpoint-gate-assembly.png` },
  'room-shell': { label: 'Room Shell', family: 'prefab', width: 4, depth: 4, height: 3, reference: `${REF}/building-prefab-assemblies/room-shell.png` },
  'small-building-shell': { label: 'Small Building Shell', family: 'prefab', width: 9, depth: 5, height: 3.5, reference: `${REF}/building-prefab-assemblies/small-building-shell.png`, notes: 'The reference divides a long rectangle into two roughly square 3.8 x 3.9 m bays, so the authored footprint is 9 x 5 m rather than 8 x 6 m.' },
  // Grid-laid prefabs. Each is a room map on the 4 m bay grid plus a plinth
  // projection of 0.5 m on every side, so the envelope is cells * 4 + 1.
  // They share the small building shell's reference plate because they are the
  // same kit of parts in a different plan.
  'compact-outpost-shell': { label: 'Compact Outpost Shell', family: 'prefab', width: 5, depth: 5, height: 3.5, reference: `${REF}/building-prefab-assemblies/small-building-shell.png`, notes: 'Single-bay plan ["A"].' },
  'long-hall-shell': { label: 'Long Hall Shell', family: 'prefab', width: 13, depth: 5, height: 3.5, reference: `${REF}/building-prefab-assemblies/small-building-shell.png`, notes: 'Three-bay undivided plan ["AAA"].' },
  'quad-barracks-shell': { label: 'Quad Barracks Shell', family: 'prefab', width: 9, depth: 9, height: 3.5, reference: `${REF}/building-prefab-assemblies/small-building-shell.png`, notes: 'Four rooms on a 2x2 plan ["AB","CD"].' },
  'l-wing-shell': { label: 'L-Wing Shell', family: 'prefab', width: 13, depth: 9, height: 3.5, reference: `${REF}/building-prefab-assemblies/small-building-shell.png`, notes: 'L-shaped plan ["AAB","..B"] with a re-entrant corner.' },
  'courtyard-compound-shell': { label: 'Courtyard Compound Shell', family: 'prefab', width: 13, depth: 13, height: 3.5, reference: `${REF}/building-prefab-assemblies/small-building-shell.png`, notes: 'Ring plan ["AAA","A.A","AAA"] enclosing an open courtyard.' },
  'storefront-facade-shell': { label: 'Storefront Facade Shell', family: 'prefab', width: 6, depth: 1, height: 4, reference: `${REF}/building-prefab-assemblies/storefront-facade-shell.png` },
  'utility-enclosure': { label: 'Utility Enclosure', family: 'prefab', width: 4, depth: 3, height: 3, reference: `${REF}/building-prefab-assemblies/utility-enclosure.png` },
} as const satisfies Record<string, KitModuleSpec>

export type KitModuleId = keyof typeof MODULE_SPECS

export interface KitMetadata {
  readonly version: 1
  readonly moduleId: KitModuleId
  readonly grid: number
  readonly structuralIncrement: number
  readonly pivot: typeof AXIOM_KIT.pivot
  readonly front: typeof AXIOM_KIT.previewFront
  readonly envelope: KitEnvelope
  readonly sockets: readonly KitSocket[]
}

export function annotateKitAsset(root: Group, moduleId: KitModuleId, sockets: readonly KitSocket[]): void {
  const spec = MODULE_SPECS[moduleId]
  root.name = moduleId
  root.userData.modularKit = {
    version: 1,
    moduleId,
    grid: AXIOM_KIT.grid,
    structuralIncrement: AXIOM_KIT.structuralIncrement,
    pivot: AXIOM_KIT.pivot,
    front: AXIOM_KIT.previewFront,
    envelope: { width: spec.width, depth: spec.depth, height: spec.height },
    sockets,
  } satisfies KitMetadata
}

export function assertQuarterGrid(value: number, label: string): void {
  const units = value / AXIOM_KIT.structuralIncrement
  if (Math.abs(units - Math.round(units)) > 1e-6) {
    throw new Error(`${label} (${value}) is not aligned to the ${AXIOM_KIT.structuralIncrement} m structural grid`)
  }
}

export function validateKitMetadata(root: Group): KitMetadata {
  const metadata = root.userData.modularKit as KitMetadata | undefined
  if (!metadata) throw new Error(`Asset root ${root.name || '<unnamed>'} has no modularKit metadata`)
  const authored = MODULE_SPECS[metadata.moduleId]
  if (metadata.envelope.width !== authored.width
    || metadata.envelope.depth !== authored.depth
    || metadata.envelope.height !== authored.height) {
    throw new Error(`${metadata.moduleId} metadata envelope does not match the authored public contract`)
  }
  for (const socket of metadata.sockets) {
    const [x, y, z] = socket.position
    if (![x, y, z, ...socket.normal].every(Number.isFinite)) {
      throw new Error(`${metadata.moduleId}.${socket.name} contains a non-finite coordinate`)
    }
    const tolerance = 1e-6
    if (x < -tolerance || x > metadata.envelope.width + tolerance
      || y < -tolerance || y > metadata.envelope.height + tolerance
      || z < -metadata.envelope.depth - tolerance || z > tolerance) {
      throw new Error(`${metadata.moduleId}.${socket.name} lies outside its authored envelope`)
    }
  }
  return metadata
}

function socketByName(root: Group, name: string): KitSocket {
  const metadata = validateKitMetadata(root)
  const socket = metadata.sockets.find((candidate) => candidate.name === name)
  if (!socket) throw new Error(`${metadata.moduleId} has no socket named ${name}`)
  return socket
}

export function socketWorldPosition(root: Group, name: string): Vector3 {
  const socket = socketByName(root, name)
  root.updateWorldMatrix(true, false)
  return root.localToWorld(new Vector3(...socket.position))
}

export function socketWorldNormal(root: Group, name: string): Vector3 {
  const socket = socketByName(root, name)
  const worldRotation = new Quaternion()
  root.getWorldQuaternion(worldRotation)
  return new Vector3(...socket.normal).applyQuaternion(worldRotation).normalize()
}

/**
 * Places a module on another module using 90-degree yaw steps. Socket normals
 * must oppose after placement. The moving root may already belong to an
 * identity-transform assembly group; its authored pivot remains untouched in
 * the standalone model factory.
 */
export function snapKitAsset(
  movingRoot: Group,
  movingSocketName: string,
  targetRoot: Group,
  targetSocketName: string,
): { quarterTurns: number; position: Vector3 } {
  const movingSocket = socketByName(movingRoot, movingSocketName)
  const targetSocket = socketByName(targetRoot, targetSocketName)
  const complementaryKinds = new Set([
    'gate-lintel:gate-post',
    'gate-post:gate-lintel',
    'gate-return:gate-post',
    'gate-post:gate-return',
    'floor:foundation',
    'foundation:floor',
    'ceiling:roof-edge',
    'roof-edge:ceiling',
  ])
  if (movingSocket.kind !== targetSocket.kind
    && !complementaryKinds.has(`${movingSocket.kind}:${targetSocket.kind}`)) {
    throw new Error(`Cannot snap ${movingSocket.kind} to ${targetSocket.kind}`)
  }

  const targetNormal = socketWorldNormal(targetRoot, targetSocketName)
  const desiredNormal = targetNormal.clone().multiplyScalar(-1)
  const localNormal = new Vector3(...movingSocket.normal)
  const up = new Vector3(0, 1, 0)
  let bestQuarterTurns = 0
  let bestError = Number.POSITIVE_INFINITY
  for (let quarterTurns = 0; quarterTurns < 4; quarterTurns += 1) {
    const candidate = localNormal.clone().applyAxisAngle(up, quarterTurns * Math.PI / 2)
    const error = candidate.distanceToSquared(desiredNormal)
    if (error < bestError) {
      bestError = error
      bestQuarterTurns = quarterTurns
    }
  }
  if (bestError > 1e-8) throw new Error(`Sockets ${movingSocketName} and ${targetSocketName} cannot oppose with a quarter-turn yaw`)

  movingRoot.rotation.set(0, bestQuarterTurns * Math.PI / 2, 0)
  const localSocketAfterYaw = new Vector3(...movingSocket.position).applyAxisAngle(up, movingRoot.rotation.y)
  const targetWorld = socketWorldPosition(targetRoot, targetSocketName)
  const targetInParent = movingRoot.parent
    ? movingRoot.parent.worldToLocal(targetWorld.clone())
    : targetWorld
  movingRoot.position.copy(targetInParent).sub(localSocketAfterYaw)
  movingRoot.updateWorldMatrix(true, false)

  const residual = socketWorldPosition(movingRoot, movingSocketName).distanceTo(targetWorld)
  if (residual > 1e-6) throw new Error(`Socket placement residual is ${residual}`)
  return { quarterTurns: bestQuarterTurns, position: movingRoot.position.clone() }
}
