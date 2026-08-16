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
  type CargoMaterialBundle,
  type CargoMaterials,
  type CargoPreview,
  type CargoPreviewOptions,
} from '../axiom-cargo-kit/index.ts'

/**
 * The street level: infrastructure, district dressing, and the debris both
 * accumulate.
 *
 * The datums here are pedestrian datums, not building-grid ones. A kerb is
 * 125 mm because that is what a foot steps up; a sign's underside is 2.3 m
 * because that is what a person walks under; a bollard is 900 mm because that is
 * what a hip meets. Sharing those three across a hundred props is what stops a
 * street built from this kit reading as a collection of individually plausible
 * objects that do not belong on the same pavement.
 *
 * Poles are the kit's real backbone. Almost everything on a street is something
 * bolted to a vertical tube, so the tube, its base plate, its holding-down
 * bolts, and the arm that brackets off it are authored once here — which is why
 * a traffic signal, a street lamp and a sign post share a silhouette at a
 * hundred metres, exactly as they do in life.
 */
export const STREET = Object.freeze({
  /** Kerb face height, and the pavement thickness behind it. */
  kerb: 0.125,
  paving: 0.08,
  /** Clear height under anything a pedestrian walks beneath. */
  headroom: 2.3,
  /** Hip-height furniture: bollards, low barriers, planter rims. */
  hip: 0.9,
  /** Standard pole diameters, small to large. */
  pole: { sign: 0.06, signal: 0.09, lamp: 0.11, power: 0.18 },
  /** Lamp and signal mounting heights. */
  lampHead: 5.2,
  signalHead: 2.9,
  /** Road and pavement module pitch, on the 1 m world grid. */
  module: 4,
  front: '+Z',
  pivot: 'ground-centre',
} as const)

const library = new MaterialLibrary()

export type StreetToken = 'CYAN-400' | 'AMBER-400' | 'RED-500' | 'LIME-400' | 'MAGENTA-400' | 'VIOLET-500' | 'ORANGE-500'

const TOKEN_VALUE: Record<StreetToken, number> = {
  'CYAN-400': TOKEN.CYAN_400,
  'AMBER-400': TOKEN.AMBER_400,
  'RED-500': TOKEN.RED_500,
  'LIME-400': TOKEN.LIME_400,
  'MAGENTA-400': TOKEN.MAGENTA_400,
  'VIOLET-500': TOKEN.VIOLET_500,
  'ORANGE-500': TOKEN.ORANGE_500,
}

/**
 * A lit street surface.
 *
 * Two tiers, because a street has two kinds of light: a *signal* is a small
 * lens read at distance and takes the cargo wave's brightness, while a *sign* is
 * a large panel read close up and would clip to white at that level. Passing the
 * wrong one is the difference between neon that glows and neon that is a white
 * rectangle, so the tier is chosen by what the surface is, not per model.
 */
export function streetLamp(
  bundle: CargoMaterialBundle,
  token: StreetToken,
  seed = 7_700,
  tier: 'signal' | 'sign' = 'signal',
): MeshPhysicalMaterial {
  const handle = library.acquire({ recipeId: 'MAT-09', palette: token, condition: 'maintained', seed })
  bundle.handles.push(handle)
  const emissive = tier === 'signal' ? 1.6 : 0.62
  const darken = tier === 'signal' ? -0.05 : -0.28
  return tuneMaterial(handle, shade(TOKEN_VALUE[token], darken), 0.22, 0.03, { emissive })
}

/**
 * Planting green.
 *
 * The cargo palette has no foliage tier — it was authored for a depot, where
 * nothing is alive — so a street tree built from it comes out the colour of
 * sacking. FIELD-500 is the colour system's own vegetation token; this binds it
 * at a leaf's roughness with no clearcoat, because a leaf is the least
 * specular surface on a street.
 */
export function foliage(bundle: CargoMaterialBundle, seed = 7_900, shade_ = -0.18): MeshPhysicalMaterial {
  const handle = library.acquire({ recipeId: 'MAT-16', palette: 'FIELD-500', condition: 'worked', seed })
  bundle.handles.push(handle)
  return tuneMaterial(handle, shade(TOKEN.FIELD_500, shade_), 0.88, 0.02)
}

/** The kit's chamfered block, used for everything that is not a tube. */
export function slab(
  parent: Group,
  material: MeshPhysicalMaterial,
  size: Vec3,
  position: Vec3,
  rotation?: Vec3,
): void {
  const smallest = Math.min(...size)
  box(parent, material, size, position, {
    chamfer: Math.min(0.05, smallest * 0.24),
    fillet: Math.min(0.016, smallest * 0.1),
    bevel: Math.min(0.014, smallest * 0.13),
    ...(rotation ? { rotation } : {}),
  })
}

/**
 * A pole on its base: tube, base plate, holding-down bolts, and the grout pad.
 *
 * The base plate is the part that makes a pole read as *installed* rather than
 * as pushed into the ground. Everything vertical on a street has one, and it is
 * the cheapest possible detail that buys the most credibility.
 */
export function pole(
  parent: Group,
  m: CargoMaterials,
  radius: number,
  height: number,
  centre: readonly [number, number] = [0, 0],
  material: MeshPhysicalMaterial = m.graphite,
): void {
  const [x, z] = centre
  parent.add(cylinder(material, radius, height - 0.1, [x, 0.1 + (height - 0.1) * 0.5, z], AXIS_Y, 12))
  // Grout pad, base plate, and four bolts on the plate's corners.
  slab(parent, m.ink, [radius * 4.6, 0.05, radius * 4.6], [x, 0.025, z])
  slab(parent, m.graphiteEdge, [radius * 4, 0.045, radius * 4], [x, 0.072, z])
  for (const sx of [-1, 1] as const) {
    for (const sz of [-1, 1] as const) {
      parent.add(cylinder(m.steel, radius * 0.28, 0.05, [
        x + sx * radius * 1.5, 0.11, z + sz * radius * 1.5,
      ], AXIS_Y, 6))
    }
  }
  // Collar where the tube meets the plate; a tube landing flat on a plate is
  // the one join that always reads as unwelded.
  parent.add(cylinder(m.graphiteEdge, radius * 1.35, 0.06, [x, 0.12, z], AXIS_Y, 12))
}

/** A bracket arm off a pole, with the gusset that stops it drooping. */
export function poleArm(
  parent: Group,
  m: CargoMaterials,
  from: readonly [number, number, number],
  reach: number,
  radius = 0.05,
): void {
  const [x, y, z] = from
  parent.add(cylinder(m.graphite, radius, reach, [x + reach * 0.5, y, z], [0, 0, Math.PI / 2], 10))
  slab(parent, m.graphiteEdge, [reach * 0.42, 0.05, radius * 1.6], [x + reach * 0.24, y - 0.16, z], [0, 0, -0.62])
}

/**
 * A sign or display panel on its frame: face, dark surround, and the rails that
 * clamp it. The surround is what gives a panel an edge; without it a lit face is
 * a rectangle floating in front of its own post.
 */
export function panel(
  parent: Group,
  m: CargoMaterials,
  face: MeshPhysicalMaterial,
  size: readonly [number, number],
  position: Vec3,
  rotation?: Vec3,
): void {
  const [w, h] = size
  slab(parent, m.graphite, [w + 0.07, h + 0.07, 0.05], position, rotation)
  const lift = 0.032
  const seat: Vec3 = rotation
    ? [
        position[0] + Math.sin(rotation[1] ?? 0) * lift,
        position[1] - Math.sin(rotation[0] ?? 0) * lift,
        position[2] + Math.cos(rotation[1] ?? 0) * Math.cos(rotation[0] ?? 0) * lift,
      ]
    : [position[0], position[1], position[2] + lift]
  slab(parent, m.ink, [w + 0.02, h + 0.02, 0.02], seat, rotation)
  slab(parent, face, [w, h, 0.012], seat, rotation)
}

/** Kerb and pavement for a module-length run: the ground everything stands on. */
export function pavement(parent: Group, m: CargoMaterials, width: number, depth: number): void {
  slab(parent, m.graphiteEdge, [width, STREET.kerb, 0.16], [0, STREET.kerb * 0.5, depth * 0.5 - 0.08])
  slab(parent, m.shellShade, [width, STREET.paving, depth - 0.16], [0, STREET.kerb - STREET.paving * 0.5, -0.08])
  // Slab joints across the paving, on a pedestrian pitch rather than the
  // building grid: paving is laid to what one person can carry.
  const bays = Math.max(2, Math.round(width / 0.9))
  for (let index = 1; index < bays; index += 1) {
    slab(parent, m.ink, [0.02, 0.012, depth - 0.2], [-width / 2 + (index / bays) * width, STREET.kerb + 0.002, -0.08])
  }
}

export interface StreetEnvelope {
  readonly width: number
  readonly depth: number
  readonly height: number
}

export interface StreetModel {
  readonly root: Group
  readonly parts: Record<string, Group>
  readonly sockets: Record<string, Object3D>
  update(deltaSeconds: number): void
  dispose(): void
}

export interface StreetBuild {
  readonly id: string
  readonly condition?: number
  readonly envelope: StreetEnvelope
  build(context: {
    root: Group
    m: CargoMaterials
    bundle: CargoMaterialBundle
    part(name: string): Group
  }): {
    readonly sockets?: Readonly<Record<string, readonly [number, number, number]>>
    readonly tick?: (elapsed: number) => void
  } | void
}

export function createStreetModel(spec: StreetBuild): StreetModel {
  const bundle = acquireCargoMaterials(41_300 + spec.id.length * 233, { condition: spec.condition ?? 0.62 })
  const m = bundle.materials
  const tag = spec.id.toUpperCase()

  const root = new Group()
  root.name = `AXR_STREET_${tag}_ROOT_DEFAULT`
  const parts: Record<string, Group> = {}
  const part = (name: string): Group => {
    const existing = parts[name]
    if (existing) return existing
    const group = new Group()
    group.name = `AXR_STREET_${tag}_PART_${name.toUpperCase()}_DEFAULT`
    parts[name] = group
    root.add(group)
    return group
  }

  const built = spec.build({ root, m, bundle, part })
  root.userData.streetKit = {
    version: 1,
    moduleId: spec.id,
    pivot: STREET.pivot,
    front: STREET.front,
    envelope: spec.envelope,
  }

  const sockets: Record<string, Object3D> = {}
  const shared: Record<string, readonly [number, number, number]> = {
    mount_ground: [0, 0, 0],
    dressing_top: [0, spec.envelope.height, 0],
  }
  for (const [name, position] of Object.entries({ ...shared, ...(built?.sockets ?? {}) })) {
    sockets[name] = socket(name, [...position] as [number, number, number])
  }

  const finished = finishModel(root, bundle, { name: spec.id, reach: 0.16, sockets: Object.values(sockets) })

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
 * The wave's capture framing, pitched at standing eye height rather than at the
 * object's centre. A street prop photographed from above is a plan; these are
 * things you walk past.
 */
export function createStreetPreview(
  model: StreetModel,
  envelope: StreetEnvelope,
  options: CargoPreviewOptions = {},
): CargoPreview {
  const span = Math.max(envelope.width, envelope.depth, envelope.height)
  // Framed on the object's own centre, not on a fixed eye height. Clamping the
  // target to 1.7 m suits a bin and decapitates a lamp column: an 8 m pole
  // framed at hip height puts everything that distinguishes it — the arms, the
  // head, the insulators — above the top of the plate.
  return createCargoPreview(model, {
    target: [0, envelope.height * 0.46, 0],
    distance: span * 1.8 + 1.2,
    yaw: -0.68,
    pitch: 0.18,
    fov: 32,
    ...options,
  })
}

export { box, type CargoMaterials, type CargoPreview, type CargoPreviewOptions } from '../axiom-cargo-kit/index.ts'
