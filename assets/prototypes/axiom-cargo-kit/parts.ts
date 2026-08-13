import { Group, Mesh, MeshPhysicalMaterial, Object3D, PlaneGeometry } from 'three/webgpu'

import {
  cylinder,
  extrudeProfile,
  flatPlate,
  groove,
  prism,
  type PrismOptions,
  type Vec2,
  type Vec3,
} from '../../../src/asset-forge/generator/index.ts'
import type { CargoMaterials } from './materials.ts'

/**
 * The construction vocabulary shared by the cargo, storage, and logistics wave.
 *
 * These are the details that recur on almost every prop in a depot: a corner
 * casting, a fork pocket, a louvred vent, a recessed grab handle, an over-centre
 * latch, a seated plaque. Authoring them once is what makes fifty separate props
 * read as one manufacturer's catalogue - and it means a correction to how a
 * latch is built lands on all of them at once instead of on whichever ones get
 * revisited.
 *
 * Every helper takes explicit world-unit sizes. Nothing scales a bolt or a bevel
 * as a percentage of its host, because a fastener is a physical object that is
 * the same size on a crate and on a container.
 */

/** Rotation putting a cylinder's axis along world X. */
export const AXIS_X: Vec3 = [0, 0, Math.PI / 2]
/** Rotation putting a cylinder's axis along world Z - the kit's "faces front". */
export const AXIS_Z: Vec3 = [Math.PI / 2, 0, 0]
/** Cylinder default axis, along world Y. */
export const AXIS_Y: Vec3 = [0, 0, 0]

/** Minimum clearance between a host face and an applied layer, in metres. */
export const LAYER_CLEARANCE = 0.016

export type Face = 'front' | 'back' | 'left' | 'right' | 'top' | 'bottom'

const FACE_ROTATION: Record<Face, Vec3> = {
  front: [0, 0, 0],
  back: [0, Math.PI, 0],
  right: [0, Math.PI / 2, 0],
  left: [0, -Math.PI / 2, 0],
  top: [-Math.PI / 2, 0, 0],
  bottom: [Math.PI / 2, 0, 0],
}

/** Outward normal of each face, for lifting an applied layer off its host. */
export const FACE_NORMAL: Record<Face, Vec3> = {
  front: [0, 0, 1],
  back: [0, 0, -1],
  right: [1, 0, 0],
  left: [-1, 0, 0],
  top: [0, 1, 0],
  bottom: [0, -1, 0],
}

export function faceRotation(face: Face): Vec3 {
  return FACE_ROTATION[face]
}

/** Moves a point along a face normal by `distance`. */
export function lift(position: Vec3, face: Face, distance: number): Vec3 {
  const normal = FACE_NORMAL[face]
  return [
    position[0] + normal[0] * distance,
    position[1] + normal[1] * distance,
    position[2] + normal[2] * distance,
  ]
}

/** Regular hexagon ring, flat-topped, for castings and lift sockets. */
export function hexagon(radius: number): Vec2[] {
  const points: Vec2[] = []
  for (let index = 0; index < 6; index += 1) {
    const angle = (Math.PI / 3) * index + Math.PI / 6
    points.push([Math.cos(angle) * radius, Math.sin(angle) * radius])
  }
  return points
}

/** Axis-aligned rounded rectangle ring, for openings and plaque outlines. */
export function slot(halfWidth: number, halfHeight: number, clip: number): Vec2[] {
  return [
    [halfWidth, halfHeight - clip], [halfWidth - clip, halfHeight],
    [-halfWidth + clip, halfHeight], [-halfWidth, halfHeight - clip],
    [-halfWidth, -halfHeight + clip], [-halfWidth + clip, -halfHeight],
    [halfWidth - clip, -halfHeight], [halfWidth, -halfHeight + clip],
  ]
}

/** The kit's default chamfered block. */
export function box(
  parent: Group,
  material: MeshPhysicalMaterial,
  size: Vec3,
  position: Vec3,
  options: PrismOptions = {},
): Mesh {
  const smallest = Math.min(...size)
  const mesh = prism(material, size, position, {
    chamfer: options.chamfer ?? Math.min(0.06, smallest * 0.22),
    fillet: options.fillet ?? Math.min(0.02, smallest * 0.1),
    bevel: options.bevel ?? Math.min(0.018, smallest * 0.14),
    ...options,
  })
  parent.add(mesh)
  return mesh
}

/** A proud hex-head fastener. */
export function bolt(
  parent: Group,
  material: MeshPhysicalMaterial,
  position: Vec3,
  radius = 0.022,
  face: Face = 'front',
): Mesh {
  const rotation = face === 'top' || face === 'bottom'
    ? AXIS_Y
    : face === 'left' || face === 'right' ? AXIS_X : AXIS_Z
  const mesh = cylinder(material, radius, 0.03, lift(position, face, 0.008), rotation, 6)
  parent.add(mesh)
  return mesh
}

/** Evenly spaced fasteners along one axis of a face. */
export function boltRun(
  parent: Group,
  material: MeshPhysicalMaterial,
  from: Vec3,
  to: Vec3,
  count: number,
  radius = 0.022,
  face: Face = 'front',
): void {
  for (let index = 0; index < count; index += 1) {
    const t = count === 1 ? 0.5 : index / (count - 1)
    bolt(parent, material, [
      from[0] + (to[0] - from[0]) * t,
      from[1] + (to[1] - from[1]) * t,
      from[2] + (to[2] - from[2]) * t,
    ], radius, face)
  }
}

/**
 * Rotation that orients a detail onto `face` and then spins it within that
 * face's plane.
 *
 * Three.js composes an XYZ Euler as Rx·Ry·Rz, and every face rotation in this
 * kit leaves its Z term at zero, so folding the spin into Z applies it *before*
 * the part is stood up on its face - which is exactly "rotate the decal on the
 * panel", not "rotate the panel".
 */
export function faceSpin(face: Face, spin: number): Vec3 {
  const rotation = FACE_ROTATION[face]
  return [rotation[0], rotation[1], rotation[2] + spin]
}

/** A seam's run direction within its face. `across` is the default long axis. */
export type SeamRun = 'along' | 'across'

/**
 * A real cut panel line. Takes the host's outer surface position, not its
 * centre, so a seam is placed where it is seen.
 *
 * `run` picks the cut direction in the face plane: `across` is the face's
 * horizontal (world X for the side faces, world X for the roof), `along` is its
 * vertical. Getting this wrong is how a five-metre panel line ends up running
 * straight up through the roof, so it is an argument rather than a convention.
 */
export function seam(
  parent: Group,
  material: MeshPhysicalMaterial,
  length: number,
  position: Vec3,
  face: Face = 'front',
  run: SeamRun = 'across',
  width = 0.026,
  depth = 0.018,
): Mesh {
  const rotation = faceSpin(face, run === 'across' ? Math.PI / 2 : 0)
  const mesh = groove(material, length, width, depth, lift(position, face, 0.002), rotation)
  parent.add(mesh)
  return mesh
}

/** A run of parallel seams: the kit's corrugation and rib cadence. */
export function seamRun(
  parent: Group,
  material: MeshPhysicalMaterial,
  length: number,
  from: Vec3,
  to: Vec3,
  count: number,
  face: Face = 'front',
  run: SeamRun = 'across',
  width = 0.026,
  depth = 0.018,
): void {
  for (let index = 0; index < count; index += 1) {
    const t = count === 1 ? 0.5 : index / (count - 1)
    seam(parent, material, length, [
      from[0] + (to[0] - from[0]) * t,
      from[1] + (to[1] - from[1]) * t,
      from[2] + (to[2] - from[2]) * t,
    ], face, run, width, depth)
  }
}

/**
 * The pack's structural corner block: a chamfered casting with a real hex lift
 * socket bored through it.
 *
 * The socket is a hole in the profile rather than a dark disc laid on the face,
 * because a lift point is the one detail a rigger's eye goes to and a painted
 * one falls apart the moment the camera moves off axis.
 */
export function cornerCasting(
  parent: Group,
  m: CargoMaterials,
  size: Vec3,
  position: Vec3,
  socketRadius = 0.055,
  axis: 'x' | 'y' | 'z' = 'z',
  // Castings default dark. They were defaulting to the kit's *lightest*
  // material, which put eight near-white blocks on every container - and the
  // corner casting is the one part every reference sheet draws as the darkest
  // thing on the prop, because it is raw unpainted steel.
  plate: MeshPhysicalMaterial = m.graphiteEdge,
): Group {
  const casting = new Group()
  casting.name = 'axiom-cargo-kit / corner casting'
  parent.add(casting)

  // The profile plane is chosen so the bore runs along the requested axis.
  const rotation: Vec3 = axis === 'x' ? [0, Math.PI / 2, 0] : axis === 'y' ? [Math.PI / 2, 0, 0] : [0, 0, 0]
  const [width, height, depth] = axis === 'x'
    ? [size[2], size[1], size[0]] as Vec3
    : axis === 'y' ? [size[0], size[2], size[1]] as Vec3 : size

  const clip = Math.min(width, height) * 0.26
  casting.add(prism(plate, [width, height, depth], position, {
    chamfer: clip,
    fillet: clip * 0.3,
    bevel: 0.016,
    capChamfer: Math.min(0.05, depth * 0.2),
    holes: [hexagon(socketRadius)],
    rotation,
  }))
  // A dark plug set back inside the bore. Without it the socket is a hole
  // straight through the silhouette, and against a black backdrop that reads as
  // a missing chunk of the casting rather than as a recess.
  // Centred and short, so both mouths of the bore keep a visible lip of depth
  // and the part needs no knowledge of which corner it was placed at.
  casting.add(extrudeProfile(m.ink, hexagon(socketRadius * 0.99), depth * 0.5, position, {
    fillet: socketRadius * 0.16,
    bevel: 0.006,
    rotation,
  }))
  return casting
}

/**
 * A fork pocket: a rectangular tunnel mouth with a wear-plate lip.
 *
 * The mouth is subtracted from a real front plate so the opening has walls;
 * a black quad here is the single most common tell of a procedural crate.
 */
export function forkPocket(
  parent: Group,
  m: CargoMaterials,
  size: Vec2,
  depth: number,
  position: Vec3,
  face: Face = 'front',
): void {
  const [width, height] = size
  const rotation = faceRotation(face)
  const clip = Math.min(width, height) * 0.18
  parent.add(prism(m.graphiteEdge, [width + 0.13, height + 0.11, 0.05], lift(position, face, 0.012), {
    chamfer: 0.03,
    fillet: 0.012,
    bevel: 0.01,
    holes: [slot(width * 0.5, height * 0.5, clip)],
    rotation,
  }))
  parent.add(prism(m.ink, [width + 0.02, height + 0.02, depth], lift(position, face, -depth * 0.5), {
    chamfer: clip,
    fillet: 0.01,
    bevel: 0.008,
    rotation,
  }))
}

/**
 * A louvred vent: a sunk dark well with real slat bars across it.
 *
 * Slats are separate proud bars rather than stripes on a texture, so the vent
 * self-shadows and keeps its depth read at grazing angles.
 */
export function louvreVent(
  parent: Group,
  m: CargoMaterials,
  size: Vec2,
  position: Vec3,
  slats = 5,
  face: Face = 'front',
): Group {
  const vent = new Group()
  vent.name = 'axiom-cargo-kit / louvre vent'
  parent.add(vent)
  const [width, height] = size
  const rotation = faceRotation(face)

  vent.add(prism(m.graphite, [width + 0.075, height + 0.075, 0.045], lift(position, face, 0.01), {
    chamfer: 0.028,
    fillet: 0.012,
    bevel: 0.009,
    rotation,
  }))
  vent.add(prism(m.ink, [width, height, 0.05], lift(position, face, 0.032), {
    chamfer: 0.022,
    fillet: 0.009,
    bevel: 0.007,
    rotation,
  }))
  const pitch = height / (slats + 0.35)
  const normal = FACE_NORMAL[face]
  const across: Vec3 = face === 'top' || face === 'bottom' ? [0, 0, 1] : [0, 1, 0]
  for (let index = 0; index < slats; index += 1) {
    const offset = (index - (slats - 1) * 0.5) * pitch
    const centre: Vec3 = [
      position[0] + across[0] * offset + normal[0] * 0.05,
      position[1] + across[1] * offset + normal[1] * 0.05,
      position[2] + across[2] * offset + normal[2] * 0.05,
    ]
    vent.add(prism(m.graphiteEdge, [width - 0.03, pitch * 0.5, 0.032], centre, {
      chamfer: pitch * 0.14,
      fillet: 0.005,
      bevel: 0.005,
      rotation,
    }))
  }
  return vent
}

/**
 * A recessed grab handle: a dark well with a proud bar spanning it, so a hand
 * has somewhere to go and the silhouette stays flush.
 */
export function recessedHandle(
  parent: Group,
  m: CargoMaterials,
  size: Vec2,
  position: Vec3,
  face: Face = 'front',
  barMaterial: MeshPhysicalMaterial = m.steel,
): void {
  const [width, height] = size
  const rotation = faceRotation(face)
  parent.add(prism(m.ink, [width, height, 0.055], lift(position, face, -0.005), {
    chamfer: Math.min(width, height) * 0.2,
    fillet: 0.01,
    bevel: 0.008,
    rotation,
  }))
  parent.add(prism(barMaterial, [width - 0.06, height * 0.32, 0.038], lift(position, face, 0.026), {
    chamfer: height * 0.1,
    fillet: 0.008,
    bevel: 0.007,
    rotation,
  }))
}

/**
 * An over-centre toggle latch in painted safety colour: keeper, lever, and pin.
 * The lever overlaps the keeper so the pair reads as engaged from any angle.
 */
export function toggleLatch(
  parent: Group,
  m: CargoMaterials,
  position: Vec3,
  scale = 1,
  face: Face = 'front',
  paint: MeshPhysicalMaterial = m.amberPaint,
): Group {
  const latch = new Group()
  latch.name = 'axiom-cargo-kit / toggle latch'
  parent.add(latch)
  const rotation = faceRotation(face)
  const s = scale

  latch.add(prism(m.graphite, [0.14 * s, 0.2 * s, 0.05 * s], lift(position, face, 0.012 * s), {
    chamfer: 0.03 * s, fillet: 0.008 * s, bevel: 0.007 * s, rotation,
  }))
  latch.add(prism(paint, [0.11 * s, 0.15 * s, 0.055 * s], lift(position, face, 0.045 * s), {
    chamfer: 0.026 * s, fillet: 0.007 * s, bevel: 0.006 * s, rotation,
  }))
  latch.add(prism(m.steel, [0.045 * s, 0.13 * s, 0.03 * s], lift(position, face, 0.075 * s), {
    chamfer: 0.012 * s, fillet: 0.004 * s, bevel: 0.004 * s, rotation,
  }))
  const pinAxis = face === 'left' || face === 'right' ? AXIS_Z : AXIS_X
  latch.add(cylinder(m.steel, 0.014 * s, 0.17 * s, lift(position, face, 0.05 * s), pinAxis, 8))
  return latch
}

/**
 * A status lamp seated in a bezel. Emission never touches an unexplained
 * surface: the lit element is inside an ink recess with a chamfered rim.
 */
export function statusLens(
  parent: Group,
  m: CargoMaterials,
  size: Vec2,
  position: Vec3,
  lamp: MeshPhysicalMaterial = m.amber,
  face: Face = 'front',
): void {
  const [width, height] = size
  const rotation = faceRotation(face)
  parent.add(prism(m.ink, [width + 0.05, height + 0.05, 0.04], lift(position, face, 0.01), {
    chamfer: Math.min(width, height) * 0.3,
    fillet: 0.008,
    bevel: 0.007,
    rotation,
  }))
  parent.add(prism(lamp, [width, height, 0.026], lift(position, face, 0.032), {
    chamfer: Math.min(width, height) * 0.26,
    fillet: 0.005,
    bevel: 0.004,
    rotation,
  }))
}

/**
 * A seated graphic: a shallow plaque with the decal mapped onto its face.
 *
 * The plaque exists so the graphic inherits a physical edge and a shadow. A
 * decal plane alone lights identically to its host and reads as a sticker
 * printed on air.
 */
export function plaque(
  parent: Group,
  m: CargoMaterials,
  decal: MeshPhysicalMaterial,
  size: Vec2,
  position: Vec3,
  face: Face = 'front',
  plate: MeshPhysicalMaterial = m.shellShade,
): Mesh {
  const [width, height] = size
  const rotation = faceRotation(face)
  parent.add(prism(plate, [width + 0.04, height + 0.04, 0.022], lift(position, face, 0.008), {
    chamfer: Math.min(width, height) * 0.16,
    fillet: 0.006,
    bevel: 0.005,
    rotation,
  }))
  const mesh = new Mesh(new PlaneGeometry(width, height), decal)
  mesh.name = 'axiom-cargo-kit / seated decal'
  const placed = lift(position, face, 0.0205)
  mesh.position.set(...placed)
  mesh.rotation.set(...rotation)
  parent.add(mesh)
  return mesh
}

/**
 * A painted mark built as thin proud geometry rather than as a texture.
 *
 * A decal quad keeps its own albedo and roughness and therefore never collects
 * the grime, edge rub, or cavity shading its host does - which is exactly why a
 * stencilled hull number on a procedural asset always looks like a sticker.
 * Paint is 1 to 2 mm of material; modelling it that way costs a handful of
 * triangles and buys a mark that ages with the panel under it.
 */
export function paintMark(
  parent: Group,
  material: MeshPhysicalMaterial,
  profile: Vec2[],
  position: Vec3,
  face: Face = 'front',
  thickness = 0.014,
  spin = 0,
): Mesh {
  const mesh = extrudeProfile(material, profile, thickness, lift(position, face, thickness * 0.36), {
    fillet: thickness * 0.5,
    bevel: thickness * 0.3,
    rotation: faceSpin(face, spin),
  })
  parent.add(mesh)
  return mesh
}

/**
 * A leaning parallelogram bar - the stroke the pack's ownership chevrons,
 * direction arrows, and speed marks are all drawn from.
 */
export function slashProfile(width: number, height: number, lean: number): Vec2[] {
  const shift = height * lean * 0.5
  return [
    [width * 0.5 + shift, height * 0.5],
    [-width * 0.5 + shift, height * 0.5],
    [-width * 0.5 - shift, -height * 0.5],
    [width * 0.5 - shift, -height * 0.5],
  ]
}

/**
 * A seated graphic on a cylindrical flank, tangent at `angle` around +Y.
 *
 * The axis-aligned {@link plaque} only knows the six box faces, and every drum,
 * tank, and silo in this wave needs its markings placed around a curve. Keeping
 * this as its own helper is what stops each of those models from hand-rolling
 * its own trigonometry and getting the decal's facing subtly wrong.
 */
export function radialPlaque(
  parent: Group,
  m: CargoMaterials,
  decal: MeshPhysicalMaterial,
  size: Vec2,
  radius: number,
  height: number,
  angle: number,
  plate: MeshPhysicalMaterial = m.ink,
): Mesh {
  const [width, tall] = size
  const place = (out: number): Vec3 => [
    Math.sin(angle) * (radius + out),
    height,
    Math.cos(angle) * (radius + out),
  ]
  parent.add(prism(plate, [width + 0.05, tall + 0.04, 0.02], place(0.006), {
    chamfer: Math.min(width, tall) * 0.16,
    fillet: 0.007,
    bevel: 0.006,
    rotation: [0, angle, 0],
  }))
  const mesh = new Mesh(new PlaneGeometry(width, tall), decal)
  mesh.name = 'axiom-cargo-kit / radial decal'
  mesh.position.set(...place(0.019))
  mesh.rotation.set(0, angle, 0)
  parent.add(mesh)
  return mesh
}

/** A painted stencil laid directly on a shell face, with no plaque behind it. */
export function stencil(
  parent: Group,
  decal: MeshPhysicalMaterial,
  size: Vec2,
  position: Vec3,
  face: Face = 'front',
): Mesh {
  const mesh = new Mesh(new PlaneGeometry(size[0], size[1]), decal)
  mesh.name = 'axiom-cargo-kit / painted stencil'
  mesh.position.set(...lift(position, face, 0.004))
  mesh.rotation.set(...faceRotation(face))
  parent.add(mesh)
  return mesh
}

/** A short engraved tick used for index marks, arrows, and level graduations. */
export function tick(
  parent: Group,
  material: MeshPhysicalMaterial,
  size: Vec2,
  position: Vec3,
  face: Face = 'front',
  spin = 0,
): Mesh {
  const mesh = flatPlate(material, size, lift(position, face, 0.003), faceSpin(face, spin))
  parent.add(mesh)
  return mesh
}

/**
 * A swivel castor: fork, axle, tyre, and a top mounting plate. Used across the
 * carts, trolleys, and mobile racks so they all roll on the same hardware.
 */
export function castor(
  parent: Group,
  m: CargoMaterials,
  position: Vec3,
  radius = 0.085,
  swivel = 0,
): Group {
  const wheel = new Group()
  wheel.name = 'axiom-cargo-kit / castor'
  wheel.position.set(...position)
  wheel.rotation.y = swivel
  parent.add(wheel)

  wheel.add(prism(m.graphite, [0.13, 0.035, 0.13], [0, radius * 1.85, 0], {
    chamfer: 0.02, fillet: 0.008, bevel: 0.006,
  }))
  wheel.add(cylinder(m.steel, 0.028, 0.06, [0, radius * 1.55, 0], AXIS_Y, 10))
  for (const side of [-1, 1]) {
    wheel.add(prism(m.graphiteEdge, [0.03, radius * 1.5, 0.075], [side * 0.055, radius * 0.75, 0], {
      chamfer: 0.012, fillet: 0.006, bevel: 0.005,
    }))
  }
  wheel.add(cylinder(m.rubber, radius, 0.062, [0, 0, 0], AXIS_X, 16))
  wheel.add(cylinder(m.steel, radius * 0.44, 0.07, [0, 0, 0], AXIS_X, 12))
  wheel.add(cylinder(m.ink, radius * 0.16, 0.085, [0, 0, 0], AXIS_X, 8))
  return wheel
}

/**
 * A straight structural member between two points in the XY plane. Keeps frame
 * bracing honest: one part, one bevel, correct length by construction.
 */
export function member(
  parent: Group,
  material: MeshPhysicalMaterial,
  from: Vec3,
  to: Vec3,
  width: number,
  depth: number,
  chamfer = Math.min(0.04, width * 0.24),
): Mesh {
  const dx = to[0] - from[0]
  const dy = to[1] - from[1]
  const length = Math.hypot(dx, dy)
  const mesh = prism(material, [length, width, depth], [
    (from[0] + to[0]) * 0.5,
    (from[1] + to[1]) * 0.5,
    (from[2] + to[2]) * 0.5,
  ], {
    chamfer,
    fillet: Math.min(0.014, width * 0.12),
    bevel: Math.min(0.014, depth * 0.14),
    rotation: [0, 0, Math.atan2(dy, dx)],
  })
  parent.add(mesh)
  return mesh
}

/**
 * A closed rectangular tube profile - the section every rack upright, cart
 * frame, and trailer chassis in this wave is built from.
 */
export function tubeSection(
  parent: Group,
  material: MeshPhysicalMaterial,
  outer: Vec2,
  wall: number,
  length: number,
  position: Vec3,
  rotation: Vec3 = [0, 0, 0],
): Mesh {
  const [width, height] = outer
  const clip = Math.min(width, height) * 0.22
  const mesh = extrudeProfile(
    material,
    slot(width * 0.5, height * 0.5, clip),
    length,
    position,
    {
      holes: [slot(width * 0.5 - wall, height * 0.5 - wall, Math.max(0.006, clip - wall))],
      fillet: 0.008,
      bevel: 0.008,
      rotation,
    },
  )
  parent.add(mesh)
  return mesh
}

export interface DrumOptions {
  /** Radial facets. 20 is the pack's default read for a metre-class drum. */
  readonly segments?: number
  /** Rolling hoop heights as fractions of the body, measured from the base. */
  readonly hoops?: readonly number[]
  /** Chime (rim) overhang beyond the body radius, in metres. */
  readonly chime?: number
  /** Body material override. */
  readonly body?: MeshPhysicalMaterial
  /** Hoop and chime material override. */
  readonly band?: MeshPhysicalMaterial
}

/**
 * The pack's drum shell: a faceted body with real rolling hoops and top and
 * bottom chimes.
 *
 * A drum's entire silhouette read is those three rings. Model it as a plain
 * cylinder and it becomes a can; the hoops are what tell you it can be tipped
 * onto its edge and walked, which is the only way anyone actually moves one.
 */
export function drum(
  parent: Group,
  m: CargoMaterials,
  radius: number,
  height: number,
  position: Vec3,
  options: DrumOptions = {},
): Group {
  const shell = new Group()
  shell.name = 'axiom-cargo-kit / drum shell'
  shell.position.set(...position)
  parent.add(shell)

  const segments = options.segments ?? 20
  const chime = options.chime ?? 0.022
  const body = options.body ?? m.shell
  // Hoops and chimes default to the dark tier, not the lifted one. A drum's
  // whole weight read comes from being bracketed top and bottom in near-black;
  // banding it in mid slate is what makes a procedural drum look like a can.
  const band = options.band ?? m.graphite

  shell.add(cylinder(body, radius, height, [0, height * 0.5, 0], AXIS_Y, segments))
  for (const y of [0.035, height - 0.035]) {
    shell.add(cylinder(band, radius + chime, 0.07, [0, y, 0], AXIS_Y, segments))
    shell.add(cylinder(band, radius + chime * 0.45, 0.09, [0, y, 0], AXIS_Y, segments))
  }
  for (const fraction of options.hoops ?? [0.36, 0.66]) {
    shell.add(cylinder(band, radius + chime * 0.8, 0.052, [0, height * fraction, 0], AXIS_Y, segments))
  }
  return shell
}

/**
 * The kit's forged lifting hook, as an extrusion profile.
 *
 * One concave ring rather than an arc primitive, because the whole read of a
 * hook is the *open throat*: a torus section gives a closed ring, and a stack of
 * boxes gives a staircase where the load-bearing curve should be. The heel is
 * broad, the tip turns up, and the neck is straight where a shackle sits.
 *
 * Shared between every lifting prop in the wave so a hoist hook and a crane hook
 * are recognisably the same part at two sizes.
 */
export function hookProfile(scale = 1): Vec2[] {
  const points: Vec2[] = [
    [0.12, 0.76], [0.32, 0.76], [0.4, 0.54], [0.46, 0.34],
    [0.52, 0.1], [0.48, -0.2], [0.34, -0.45], [0.1, -0.6],
    [-0.18, -0.56], [-0.4, -0.4], [-0.55, -0.15], [-0.57, 0.12],
    [-0.5, 0.35], [-0.38, 0.58], [-0.32, 0.48], [-0.38, 0.31],
    [-0.39, 0.12], [-0.34, -0.08], [-0.2, -0.27], [0, -0.36],
    [0.16, -0.3], [0.27, -0.15], [0.3, 0.05], [0.27, 0.23],
    [0.18, 0.36], [0.12, 0.48],
  ]
  return points.map(([x, y]): Vec2 => [x * scale, y * scale])
}

/**
 * A complete hook block: shackle ears, a cross pin, a swivel nut, and the forged
 * hook itself, hung from `position` with the pin at that height.
 */
export function hookBlock(
  parent: Group,
  m: CargoMaterials,
  position: Vec3,
  scale = 1,
  latch = true,
): Group {
  const block = new Group()
  block.name = 'axiom-cargo-kit / hook block'
  block.position.set(...position)
  parent.add(block)

  const s = scale
  for (const sz of [-1, 1]) {
    block.add(prism(m.graphiteEdge, [0.1 * s, 0.34 * s, 0.07 * s], [0, -0.14 * s, sz * 0.08 * s], {
      chamfer: 0.03 * s, fillet: 0.01 * s, bevel: 0.008 * s,
    }))
  }
  block.add(cylinder(m.steel, 0.035 * s, 0.26 * s, [0, 0, 0], AXIS_Z, 10))
  block.add(cylinder(m.ink, 0.016 * s, 0.3 * s, [0, 0, 0], AXIS_Z, 8))
  block.add(cylinder(m.graphiteEdge, 0.09 * s, 0.08 * s, [0, -0.33 * s, 0], AXIS_Y, 12))
  block.add(cylinder(m.steel, 0.055 * s, 0.07 * s, [0, -0.39 * s, 0], AXIS_Y, 10))

  // Extruded at 0.31 of its profile width, which is the proportion the older
  // wave's crane hook uses. At the previous 0.21 the same silhouette read as a
  // laser-cut plate rather than a forging - the profile was never the problem.
  block.add(extrudeProfile(m.steel, hookProfile(0.62 * s), 0.21 * s, [0, -0.86 * s, 0], {
    fillet: 0.03 * s, bevel: 0.022 * s, capChamfer: 0.02 * s,
  }))
  if (latch) {
    // A safety latch is a short sprung flap hinged along one jaw, not a bar
    // across the mouth. Bridging the throat turns the hook into a closed
    // shackle and throws away the open-throat silhouette the profile exists for.
    block.add(prism(m.amberPaint, [0.13 * s, 0.03 * s, 0.045 * s], [-0.12 * s, -1.02 * s, 0.07 * s], {
      chamfer: 0.01 * s, fillet: 0.004 * s, bevel: 0.004 * s, rotation: [0, 0, -0.9],
    }))
    block.add(cylinder(m.steel, 0.014 * s, 0.08 * s, [-0.16 * s, -0.95 * s, 0.07 * s], AXIS_Z, 8))
  }
  return block
}

/** A named, empty anchor for consumers to attach to. */
export function socket(name: string, position: Vec3): Object3D {
  const anchor = new Object3D()
  anchor.name = name
  anchor.position.set(...position)
  return anchor
}
