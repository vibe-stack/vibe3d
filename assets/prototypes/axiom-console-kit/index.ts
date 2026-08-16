import { Group, Object3D, type MeshPhysicalMaterial } from 'three/webgpu'

import { MaterialLibrary, cylinder, tuneMaterial, type Vec3 } from '../../../src/asset-forge/generator/index.ts'
import {
  AXIS_Y,
  TOKEN,
  acquireCargoMaterials,
  box,
  createCargoPreview,
  finishModel,
  shade,
  socket,
  statusLens,
  type CargoMaterialBundle,
  type CargoMaterials,
  type CargoPreview,
  type CargoPreviewOptions,
} from '../axiom-cargo-kit/index.ts'

/**
 * The industrial interiors group: the fit-out of a control room.
 *
 * These are the first modules in the library authored to *human* dimensions
 * rather than to the building grid, and that is the constraint the kit encodes.
 * A desk is 0.74 m high because that is where forearms go; a seat is 0.46 m
 * because that is where knees bend; a screen's centre is 1.15 m above the floor
 * because that is eye height for someone sitting at that desk. Those three
 * numbers are shared here rather than chosen per model, which is what stops a
 * chair, a desk and a monitor from the same library looking like they came from
 * three different ones.
 */
export const CONSOLE = Object.freeze({
  /** Working surface height. */
  desk: 0.74,
  /** Seat pan height, and the footring below it. */
  seat: 0.46,
  footring: 0.21,
  /** Seated eye height above the floor; screen centres land here. */
  eye: 1.15,
  /** Standard equipment rack width and its 1U pitch. */
  rackWidth: 0.6,
  rackUnit: 0.0445,
  /** Castor radius, shared by everything that rolls. */
  castor: 0.045,
  front: '+Z',
  pivot: 'floor-centre',
} as const)

const library = new MaterialLibrary()

export type ScreenToken = 'CYAN-400' | 'AMBER-400' | 'LIME-400' | 'RED-500'

const TOKEN_VALUE: Record<ScreenToken, number> = {
  'CYAN-400': TOKEN.CYAN_400,
  'AMBER-400': TOKEN.AMBER_400,
  'LIME-400': TOKEN.LIME_400,
  'RED-500': TOKEN.RED_500,
}

/**
 * A lit display surface.
 *
 * Dimmer than the cargo wave's lens tier, and for the same reason the doors and
 * windows kits are: a screen is a large emissive area seen from a metre away,
 * where a crate's lens is a 70 mm spot seen from five. At the cargo tier a
 * monitor is a white rectangle, which is the one thing a monitor must not be.
 */
export function screenSurface(
  bundle: CargoMaterialBundle,
  token: ScreenToken,
  seed = 5_500,
  emissive = 0.62,
): MeshPhysicalMaterial {
  const handle = library.acquire({ recipeId: 'MAT-09', palette: token, condition: 'maintained', seed })
  bundle.handles.push(handle)
  return tuneMaterial(handle, shade(TOKEN_VALUE[token], -0.3), 0.22, 0.03, { emissive })
}

/** A screen: bezel, lit face, and the dark surround that gives it an edge. */
export function screen(
  parent: Group,
  m: CargoMaterials,
  face: MeshPhysicalMaterial,
  size: readonly [number, number],
  position: Vec3,
  rotation?: Vec3,
): void {
  const [w, h] = size
  box(parent, m.graphite, [w + 0.05, h + 0.05, 0.045], position, {
    chamfer: 0.016, fillet: 0.006, bevel: 0.006, ...(rotation ? { rotation } : {}),
  })
  // The dark surround and the lit face need *different* stand-offs. Given the
  // same one they are coplanar, the surround is the larger of the two, and it
  // wins the depth test across most of the panel — which renders every screen in
  // the group as a black rectangle with a thin lit border.
  const seat = (lift: number): Vec3 => rotation
    ? [
        position[0] + Math.sin(rotation[1] ?? 0) * lift,
        position[1] - Math.sin(rotation[0] ?? 0) * lift,
        position[2] + Math.cos(rotation[1] ?? 0) * Math.cos(rotation[0] ?? 0) * lift,
      ]
    : [position[0], position[1], position[2] + lift]
  box(parent, m.ink, [w + 0.014, h + 0.014, 0.016], seat(0.022), {
    chamfer: 0.008, fillet: 0.004, bevel: 0.003, ...(rotation ? { rotation } : {}),
  })
  box(parent, face, [w, h, 0.012], seat(0.034), {
    chamfer: 0.006, fillet: 0.003, bevel: 0.002, ...(rotation ? { rotation } : {}),
  })
}

/** A braked castor on its stem: everything in this group that rolls uses it. */
export function castorLeg(parent: Group, m: CargoMaterials, position: Vec3): void {
  const [x, , z] = position
  parent.add(cylinder(m.graphite, 0.028, 0.06, [x, CONSOLE.castor + 0.05, z], AXIS_Y, 8))
  parent.add(cylinder(m.rubber, CONSOLE.castor, 0.036, [x, CONSOLE.castor, z], [0, 0, Math.PI / 2], 12))
  box(parent, m.graphite, [0.05, 0.05, 0.07], [x, CONSOLE.castor + 0.03, z], {
    chamfer: 0.012, fillet: 0.005, bevel: 0.004,
  })
}

/** A gas-strut column with its five-star base — the seat family's shared stand. */
export function chairColumn(parent: Group, m: CargoMaterials, height: number): void {
  parent.add(cylinder(m.steel, 0.032, height - CONSOLE.castor - 0.04, [0, (height + CONSOLE.castor) * 0.5, 0], AXIS_Y, 12))
  parent.add(cylinder(m.graphite, 0.055, 0.16, [0, CONSOLE.castor + 0.14, 0], AXIS_Y, 12))
  for (let index = 0; index < 5; index += 1) {
    const angle = (index / 5) * Math.PI * 2
    const reach = 0.27
    box(parent, m.graphite, [0.07, 0.05, reach], [
      Math.sin(angle) * reach * 0.5,
      CONSOLE.castor + 0.06,
      Math.cos(angle) * reach * 0.5,
    ], { chamfer: 0.016, fillet: 0.006, bevel: 0.005, rotation: [0, angle, 0] })
    castorLeg(parent, m, [Math.sin(angle) * reach, 0, Math.cos(angle) * reach])
  }
}

export interface ConsoleModel {
  readonly root: Group
  readonly parts: Record<string, Group>
  readonly sockets: Record<string, Object3D>
  update(deltaSeconds: number): void
  dispose(): void
}

export interface ConsoleBuild {
  readonly id: string
  readonly condition?: number
  readonly envelope: { width: number; depth: number; height: number }
  build(context: {
    root: Group
    m: CargoMaterials
    bundle: CargoMaterialBundle
    part(name: string): Group
  }): {
    readonly assemblies?: readonly Group[]
    readonly sockets?: Readonly<Record<string, readonly [number, number, number]>>
    readonly tick?: (elapsed: number) => void
  } | void
}

export function createConsoleModel(spec: ConsoleBuild): ConsoleModel {
  const bundle = acquireCargoMaterials(31_900 + spec.id.length * 227, { condition: spec.condition ?? 0.4 })
  const m = bundle.materials
  const tag = spec.id.toUpperCase()

  const root = new Group()
  root.name = `AXR_INT_${tag}_ROOT_DEFAULT`
  const parts: Record<string, Group> = {}
  const part = (name: string): Group => {
    const existing = parts[name]
    if (existing) return existing
    const group = new Group()
    group.name = `AXR_INT_${tag}_PART_${name.toUpperCase()}_DEFAULT`
    parts[name] = group
    root.add(group)
    return group
  }

  const built = spec.build({ root, m, bundle, part })
  root.userData.consoleKit = {
    version: 1,
    moduleId: spec.id,
    pivot: CONSOLE.pivot,
    front: CONSOLE.front,
    envelope: spec.envelope,
    desk: CONSOLE.desk,
    seat: CONSOLE.seat,
  }

  const sockets: Record<string, Object3D> = {}
  const shared: Record<string, readonly [number, number, number]> = {
    mount_floor: [0, 0, 0],
    dressing_top: [0, spec.envelope.height, 0],
  }
  for (const [name, position] of Object.entries({ ...shared, ...(built?.sockets ?? {}) })) {
    sockets[name] = socket(name, [...position] as [number, number, number])
  }

  const finished = finishModel(root, bundle, {
    name: spec.id,
    assemblies: built?.assemblies,
    reach: 0.14,
    sockets: Object.values(sockets),
  })

  let elapsed = 0
  return {
    root,
    parts,
    sockets,
    update: (deltaSeconds: number) => {
      elapsed += Math.min(Math.max(deltaSeconds, 0), 0.05)
      built?.tick?.(elapsed)
    },
    dispose: finished.dispose,
  }
}

/**
 * The group's shared capture framing, pitched to seated eye height rather than
 * to the object's own centre. Furniture read from above looks like a floor plan.
 */
export function createConsolePreview(
  model: ConsoleModel,
  envelope: { width: number; depth: number; height: number },
  options: CargoPreviewOptions = {},
): CargoPreview {
  const span = Math.max(envelope.width, envelope.depth, envelope.height)
  return createCargoPreview(model, {
    target: [0, Math.min(envelope.height * 0.52, CONSOLE.eye * 0.72), 0],
    distance: span * 1.9 + 0.9,
    yaw: -0.68,
    pitch: 0.24,
    fov: 32,
    ...options,
  })
}

export { statusLens, box, type CargoMaterials, type CargoPreview, type CargoPreviewOptions } from '../axiom-cargo-kit/index.ts'
