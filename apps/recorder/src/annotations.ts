import { Matrix3, Mesh, Quaternion, Vector3 } from 'three/webgpu'
import type { Intersection, Object3D, PerspectiveCamera } from 'three/webgpu'

/**
 * A defect report written by pointing at the model rather than describing it.
 *
 * The reader is an agent that cannot see the screen, so every field here exists
 * to turn a click into something that maps onto a line of `model.ts`: which
 * object was hit, where the point sits in the model's own frame, and the exact
 * camera it was judged from. "The hook looks wrong" is unactionable; the same
 * note carrying `[0.512, 0.083, -0.441]` and the nearest socket is not.
 */

type Vec3 = [number, number, number]

/** The five numbers the pack's `createPreview` takes to place its camera. */
export interface CameraState {
  target: Vec3
  distance: number
  yaw: number
  pitch: number
  fov: number
}

export interface PinHit {
  /** Ancestor chain from the model root down to the hit object. */
  path: string
  type: string
  material: string | null
  /** Nearest named anchor, which is the only part of a merged mesh with a name. */
  socket: { name: string; millimetres: number } | null
  world: Vec3
  local: Vec3
  /** Face normal in the model root's frame, or null for a hit without a face. */
  normal: Vec3 | null
  camera: CameraState
}

export interface Pin {
  id: string
  note: string
  hit: PinHit
}

/** Pins live under the model they were dropped on, keyed by catalog id. */
export type PinStore = Record<string, Pin[]>

const STORAGE_KEY = 'recorder.annotations.v1'

/** This pack is authored in metres, so millimetres are the meaningful floor. */
const mm = (value: number): number => Math.round(value * 1_000) / 1_000 + 0

const vec = (source: Vector3): Vec3 => [mm(source.x), mm(source.y), mm(source.z)]

const formatVec = (source: Vec3): string => `[${source.map((value) => value.toFixed(3)).join(', ')}]`

/** Drops the trailing zeros `toFixed` leaves, so the camera line reads like source. */
const trim = (value: number): string => String(mm(value))

export function newPinId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

/**
 * Everything the pack's cameras are described by, recovered from a dragged view.
 *
 * `createCargoPreview` places the camera at sin/cos of a yaw about +Z and a
 * pitch above the horizon, so inverting that same expression is what turns an
 * orbit the user happened to stop on back into a call they can paste.
 */
export function readCameraState(camera: PerspectiveCamera, target: Vector3): CameraState {
  const offset = camera.position.clone().sub(target)
  const distance = offset.length()
  return {
    target: vec(target),
    distance: mm(distance),
    yaw: mm(Math.atan2(offset.x, offset.z)),
    pitch: mm(distance === 0 ? 0 : Math.asin(offset.y / distance)),
    fov: mm(camera.fov),
  }
}

/**
 * A label for an object that has no name.
 *
 * The kits merge their static geometry by material, so a click usually lands on
 * a batch rather than on the part that was authored. Where even that batch is
 * anonymous, its type, its place among its siblings, and the size of its
 * bounding box are still enough to pick it out of a scene graph dump.
 */
function labelFor(object: Object3D): string {
  if (object.name) return object.name
  const index = object.parent?.children.indexOf(object) ?? -1
  const position = index >= 0 ? `#${index}` : 'detached'
  if (object instanceof Mesh) {
    const geometry = object.geometry
    if (!geometry.boundingBox) geometry.computeBoundingBox()
    const size = geometry.boundingBox?.getSize(new Vector3())
    if (size) return `<${object.type} ${position} · ${vec(size).map((value) => value.toFixed(3)).join(' × ')} m>`
  }
  return `<${object.type} ${position}>`
}

function pathTo(object: Object3D, root: Object3D): string {
  const chain: string[] = []
  for (let node: Object3D | null = object; node; node = node.parent) {
    chain.unshift(labelFor(node))
    if (node === root) break
  }
  return chain.join(' ▸ ')
}

/**
 * The nearest named empty below the root.
 *
 * Only anchors carry hand-written names once the geometry has been batched, and
 * they are placed on the features an author cares about — hooks, hatches, lamp
 * mounts. Naming the closest one turns a coordinate into a landmark.
 */
function nearestSocket(root: Object3D, point: Vector3): PinHit['socket'] {
  let best: PinHit['socket'] = null
  const world = new Vector3()
  root.traverse((node) => {
    if (node === root || !node.name || node instanceof Mesh || 'isLight' in node) return
    const distance = node.getWorldPosition(world).distanceTo(point)
    if (!best || distance < best.millimetres / 1_000) {
      best = { name: node.name, millimetres: Math.round(distance * 1_000) }
    }
  })
  return best
}

export function describeHit(
  intersection: Intersection,
  root: Object3D,
  camera: PerspectiveCamera,
  target: Vector3,
): PinHit {
  const object = intersection.object
  const world = intersection.point.clone()
  const material = object instanceof Mesh ? object.material : null
  const materialName = Array.isArray(material)
    ? material.map((entry) => entry.name).filter(Boolean).join(', ')
    : material?.name

  // A face normal arrives in the hit object's own space. Rotating it into the
  // root's frame is what makes it comparable with the local point beside it.
  let normal: Vec3 | null = null
  if (intersection.face) {
    const rotated = intersection.face.normal.clone()
      .applyNormalMatrix(new Matrix3().getNormalMatrix(object.matrixWorld))
      .applyQuaternion(root.getWorldQuaternion(new Quaternion()).invert())
      .normalize()
    normal = vec(rotated)
  }

  return {
    path: pathTo(object, root),
    type: object.type,
    material: materialName || null,
    socket: nearestSocket(root, world),
    world: vec(world),
    local: vec(root.worldToLocal(world.clone())),
    normal,
    camera: readCameraState(camera, target),
  }
}

export interface ReportSection {
  id: string
  pins: readonly Pin[]
}

function cameraCall(camera: CameraState): string {
  const target = camera.target.map(trim).join(', ')
  return `createPreview({ target: [${target}], distance: ${trim(camera.distance)}, `
    + `yaw: ${trim(camera.yaw)}, pitch: ${trim(camera.pitch)}, fov: ${trim(camera.fov)} })`
}

function pinLines(pin: Pin, number: number): string[] {
  const lines = [`### ${number} — ${pin.note.trim() || '_no note written_'}`, '']
  lines.push(`- object: \`${pin.hit.path}\` (${pin.hit.type})`)
  if (pin.hit.material) lines.push(`- material: \`${pin.hit.material}\``)
  if (pin.hit.socket) lines.push(`- nearest socket: \`${pin.hit.socket.name}\`, ${pin.hit.socket.millimetres} mm away`)
  lines.push(`- local: \`${formatVec(pin.hit.local)}\``)
  lines.push(`- world: \`${formatVec(pin.hit.world)}\``)
  if (pin.hit.normal) lines.push(`- normal: \`${formatVec(pin.hit.normal)}\``)
  return lines
}

function sectionLines(section: ReportSection): string[] {
  const lines = [
    `## ${section.id} — ${section.pins.length} ${section.pins.length === 1 ? 'note' : 'notes'}`,
    '',
    `- source: \`assets/prototypes/${section.id}/model.ts\``,
    `- coordinates are metres rounded to millimetres; \`local\` is the model root's frame`,
    `- repro: \`node scripts/qa-sheet.mjs ${section.id}\` renders an 8-view orbit sheet to \`renders/qa/${section.id}.png\``,
    '',
  ]
  // Each pin carries its own camera, but the last one placed is the view the
  // review ended on and so the one worth reproducing first.
  const latest = section.pins.at(-1)
  if (latest) {
    lines.push('The view these notes were written from:', '', '```ts', cameraCall(latest.hit.camera), '```', '')
  }
  section.pins.forEach((pin, index) => {
    lines.push(...pinLines(pin, index + 1), '')
  })
  return lines
}

export function formatReport(sections: readonly ReportSection[]): string {
  const total = sections.reduce((count, section) => count + section.pins.length, 0)
  const lines = [
    `# Annotation report — ${total} ${total === 1 ? 'note' : 'notes'}`,
    '',
    'Written by pointing at the model in the recorder. Every coordinate below is a',
    'raycast hit, not an estimate.',
    '',
  ]
  for (const section of sections) lines.push(...sectionLines(section))
  return `${lines.join('\n').trimEnd()}\n`
}

/** A single pin, carrying just enough context to stand on its own. */
export function formatPin(section: ReportSection, pin: Pin, number: number): string {
  const lines = [
    `${section.id} — \`assets/prototypes/${section.id}/model.ts\``,
    '',
    ...pinLines(pin, number),
    `- camera: \`${cameraCall(pin.hit.camera)}\``,
    '',
    `Repro: \`node scripts/qa-sheet.mjs ${section.id}\` renders an 8-view orbit sheet to \`renders/qa/${section.id}.png\`.`,
  ]
  return `${lines.join('\n')}\n`
}

export function readStore(): PinStore {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return {}
    const store: PinStore = {}
    for (const [id, pins] of Object.entries(parsed as Record<string, unknown>)) {
      if (Array.isArray(pins) && pins.length > 0) store[id] = pins as Pin[]
    }
    return store
  } catch {
    // A review in progress is never worth a blank screen, so a store written by
    // an older build is dropped rather than thrown.
    return {}
  }
}

export function writeStore(store: PinStore): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store))
  } catch {
    // Private-mode quota failures leave the in-memory pins working.
  }
}
