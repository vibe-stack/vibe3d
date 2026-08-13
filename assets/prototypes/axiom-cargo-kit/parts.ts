import { Euler, Group, Mesh, MeshPhysicalMaterial, Object3D, PlaneGeometry, Quaternion, Vector3 } from 'three/webgpu'

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

/**
 * How far a surface is set off a plane it would otherwise share, in metres.
 *
 * The playbook's floor is 3 mm - the point at which two same-facing surfaces
 * stop resolving at the far side of the biggest prop in the pack - so this is
 * that floor with a millimetre in hand. It is already the figure the louvre's
 * mouth is cut to and the one the radial plate embeds by; the helpers below now
 * all measure their shared planes from it.
 */
export const FACE_CLEARANCE = 0.004

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

/**
 * Moves a point along the outward normal of a surface whose facing rotation is
 * `orient` - the arbitrary-angle twin of {@link lift}.
 *
 * The six box faces carry their normals in a table. A tank flank, a raked deck,
 * or a yawed sack cap does not, so anything seated by {@link radialFitting} or
 * by a caller's own tilt has to read its lift off the rotation itself.
 */
function liftAlong(position: Vec3, orient: Vec3, distance: number): Vec3 {
  const normal = new Vector3(0, 0, 1).applyEuler(new Euler(...orient))
  return [
    position[0] + normal.x * distance,
    position[1] + normal.y * distance,
    position[2] + normal.z * distance,
  ]
}

/**
 * Rotation standing a cylinder's axis along the outward normal of a surface
 * whose facing rotation is `orient`.
 *
 * A flat part takes that rotation unchanged, because its own +Z is its normal.
 * A cylinder's axis is +Y, so the two differ by a quarter turn about X, and a
 * caller who hands one the other gets a fastener lying along the skin instead
 * of driven into it.
 */
function boreRotation(orient: Vec3): Vec3 {
  const rotation = new Euler().setFromQuaternion(
    new Quaternion().setFromEuler(new Euler(...orient))
      .multiply(new Quaternion().setFromEuler(new Euler(Math.PI / 2, 0, 0))),
  )
  return [rotation.x, rotation.y, rotation.z]
}

/**
 * Position for stacked surface detail. `n` = 1 for the first layer on a face.
 *
 * Every face-applied helper below already embeds its own back cap and stands its
 * own front cap proud, so the position they want is the host's *outer face* and
 * nothing else. The ad-hoc `+ 0.002` / `+ 0.004` a caller reaches for to "make
 * sure it clears" is what turns a designed 3 mm embed into a 1 mm float. When
 * something genuinely sits on top of something else that is already applied,
 * count layers instead: this is the only offset the pack recognises.
 */
export function layer(face: Face, hostFace: Vec3, n = 1): Vec3 {
  return lift(hostFace, face, LAYER_CLEARANCE * (n - 1))
}

/**
 * The radius a faceted cylinder's flat surface actually sits at.
 *
 * `cylinder()` builds N chords, so its visible skin is the inscribed circle, not
 * the nominal one - 4.7 mm inside at the pack's default 20 facets and a metre
 * radius, 13 mm at the silo. Anything seated on a curved flank has to measure
 * from here or it z-fights on the small props and floats on the big ones.
 */
export function facetRadius(radius: number, segments = 20): number {
  return radius * Math.cos(Math.PI / segments)
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

/**
 * A proud hex-head fastener.
 *
 * `proud` is how far the head stands above the face it is driven into, and it
 * belongs to the host rather than to the bolt: the 23 mm a container's seal bolt
 * wants is taller than a pallet board is thick, and seven of them queued along
 * the view axis read as one spike through the deck rather than as nails. The
 * head bites 7 mm into its host, or its whole proud height on anything thinner,
 * so a flush-driven fastener is still seated instead of laid on.
 *
 * `orient` takes the surface rotation {@link radialFitting} or {@link faceSpin}
 * returns, for a fastener on a flank the six box faces cannot describe. Without
 * it a radial bolt has to be hand-rolled as a bare cylinder, which is how the
 * sealed barrel's seam fasteners came out 51 degrees off the shell.
 */
export function bolt(
  parent: Group,
  material: MeshPhysicalMaterial,
  position: Vec3,
  radius = 0.022,
  face: Face = 'front',
  proud = 0.023,
  orient?: Vec3,
): Mesh {
  const bite = Math.min(0.007, proud)
  const rotation = orient
    ? boreRotation(orient)
    : face === 'top' || face === 'bottom'
      ? AXIS_Y
      : face === 'left' || face === 'right' ? AXIS_X : AXIS_Z
  const seat = orient
    ? liftAlong(position, orient, (proud - bite) * 0.5)
    : lift(position, face, (proud - bite) * 0.5)
  const mesh = cylinder(material, radius, proud + bite, seat, rotation, 6)
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
 * A real cut panel line. Takes the host's exact outer surface, not its centre
 * and not that surface plus a margin, so a seam is placed where it is seen.
 *
 * The groove sits at zero lift because it is an open channel: a rim standing
 * proud of the skin shows daylight under its lip at grazing angles, and callers
 * that add their own clearance on top double it. The channel's draft angle is
 * what keeps its walls off the host's plane, so no clearance is needed here.
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
  const mesh = groove(material, length, width, depth, position, rotation)
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
 *
 * `inset` is how far the block is held off each of its own six planes, and it
 * belongs to the casting rather than to the caller because every host that
 * carries one measures it from a dimension the host already owns: a container
 * seats a casting cube at half its own edge, so the bottom cap lands on the
 * under-frame pan's, and the door module hands it the module depth, so both end
 * caps land on the jamb's. Built at exactly the size it is given, the casting is
 * coplanar with its host by construction. Pass 0 where it is deliberately proud
 * of the mass it caps and the shrink would eat that lip instead.
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
  inset = FACE_CLEARANCE,
): Group {
  const casting = new Group()
  casting.name = 'axiom-cargo-kit / corner casting'
  parent.add(casting)

  // The profile plane is chosen so the bore runs along the requested axis.
  const rotation: Vec3 = axis === 'x' ? [0, Math.PI / 2, 0] : axis === 'y' ? [Math.PI / 2, 0, 0] : [0, 0, 0]
  const bore: Vec3 = axis === 'x'
    ? [size[2], size[1], size[0]]
    : axis === 'y' ? [size[0], size[2], size[1]] : size
  const [width, height, depth] = bore.map((extent) => extent - inset * 2) as Vec3

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
  // Centred, so both mouths of the bore keep a visible lip of depth and the part
  // needs no knowledge of which corner it was placed at. At 0.88 of the bore the
  // plug wall clears the bore wall by 6.6 mm; at the 0.99 it was drawn at, the
  // two facing walls were 0.55 mm apart and their fillets interleaved.
  casting.add(extrudeProfile(m.ink, hexagon(socketRadius * 0.88), depth * 0.6, position, {
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
  // The tunnel is sunk a face clearance behind the skin it is let into. Seated
  // at half its own depth its front cap landed on the host's outer face and
  // pointed the same way, and because the lip plate has the mouth cut through
  // it that coincidence was framed rather than covered - the five largest
  // overlaps in the wave, one on every container's skirt band.
  parent.add(prism(m.ink, [width + 0.02, height + 0.02, depth], lift(position, face, -depth * 0.5 - FACE_CLEARANCE), {
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
 *
 * The layering is what makes it a cavity: the surround's rim is the outermost
 * thing, the slats sit level with the host skin, and the well is behind both.
 * Built the other way round - well and slats in front of the rim - the part is
 * arithmetically identical and reads as a proud black brick.
 *
 * Which means the surround has to be a rim and not a slab: with the well set
 * back behind it, a solid surround simply hides the whole vent, so the opening
 * is cut through it the way {@link forkPocket} cuts its mouth.
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
    // The mouth is 4 mm tighter than the well all round, so the rim covers the
    // well's own walls instead of meeting them on a shared plane.
    holes: [slot(width * 0.5 - 0.004, height * 0.5 - 0.004, Math.min(width, height) * 0.16)],
    rotation,
  }))
  vent.add(prism(m.ink, [width, height, 0.05], lift(position, face, 0.004), {
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
      position[0] + across[0] * offset + normal[0] * 0.016,
      position[1] + across[1] * offset + normal[1] * 0.016,
      position[2] + across[2] * offset + normal[2] * 0.016,
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
 *
 * The well is set back so its mouth sits at the host face and only the bar
 * stands proud. A well whose whole depth is ahead of the skin is a black box
 * glued to the panel, which is the opposite of a grab pocket.
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
  parent.add(prism(m.ink, [width, height, 0.055], lift(position, face, -0.026), {
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
 * The barrel hinge every lidded prop in this wave swings on: a continuous pin
 * with knuckles and a strap running out of each one onto both leaves.
 *
 * `position` is the pin itself, and the pin belongs **outside** both leaves.
 * Seven models built this by hand and all seven put the knuckles at a local
 * coordinate inside the lid box, where they render as nothing at all - the case
 * backs in the sheet are smooth, with no hinge anywhere on them. Sit the pin
 * clear of the leaf's back face and the barrel is visible from every angle the
 * lid can be seen from, which is the whole point of modelling it.
 *
 * The straps run **across** the pin rather than fore and aft of it, because a
 * lid hinged along a back edge has its two leaves stacked in y: one strap lands
 * on the body's back face and the other on the lid's. Run fore and aft they
 * reached 120 mm behind the shell into open air on a 320 mm case, and behind the
 * rake on a sloped one, which is why nothing in the wave could use this helper.
 *
 * `reach` is how far each strap runs from the pin onto its leaf - a lid's own
 * height is the size to think in, not the pin's. `seat` is how far the leaves'
 * back faces stand in front of the pin, signed along the horizontal axis the pin
 * does not run in; passing the leaf's own back offset is what lays the straps on
 * the plate they are bolted to instead of leaving them behind it.
 */
export function lidHinge(
  parent: Group,
  m: CargoMaterials,
  span: number,
  position: Vec3,
  axis: 'x' | 'z' = 'x',
  knuckles = 3,
  radius = 0.022,
  reach = radius * 4.5,
  seat = 0,
): Group {
  const hinge = new Group()
  hinge.name = 'axiom-cargo-kit / lid hinge'
  parent.add(hinge)
  const along: Vec3 = axis === 'x' ? [1, 0, 0] : [0, 0, 1]
  const facing: Vec3 = axis === 'x' ? [0, 0, 1] : [1, 0, 0]
  const pinAxis = axis === 'x' ? AXIS_X : AXIS_Z
  const plate = radius * 1.1

  hinge.add(cylinder(m.steel, radius * 0.42, span, position, pinAxis, 8))
  for (let index = 0; index < knuckles; index += 1) {
    const t = knuckles === 1 ? 0.5 : index / (knuckles - 1)
    const offset = (t - 0.5) * (span - radius * 6)
    const centre: Vec3 = [
      position[0] + along[0] * offset,
      position[1] + along[1] * offset,
      position[2] + along[2] * offset,
    ]
    hinge.add(cylinder(m.graphiteEdge, radius, radius * 3.4, centre, pinAxis, 10))
    // The straps run out of the barrel into both leaves rather than stopping at
    // it, because a knuckle floating on a pin is what a hinge looks like when
    // the leaf plates have been left out. Each starts on the pin's own plane, so
    // it emerges from the knuckle instead of butting against it.
    for (const sign of [-1, 1]) {
      const strap: Vec3 = [
        centre[0] + facing[0] * seat,
        centre[1] + sign * reach * 0.5,
        centre[2] + facing[2] * seat,
      ]
      const size: Vec3 = axis === 'x'
        ? [radius * 3, reach, plate]
        : [plate, reach, radius * 3]
      hinge.add(prism(m.graphiteEdge, size, strap, {
        chamfer: radius * 0.3, fillet: radius * 0.12, bevel: radius * 0.1,
      }))
    }
  }
  return hinge
}

/**
 * A status lamp seated in a bezel. Emission never touches an unexplained
 * surface: the lit element is inside an ink recess with a chamfered rim.
 *
 * The bezel margin is a fraction of the lamp, capped at the 50 mm a hand-sized
 * indicator wants. A flat 50 mm all round is right on a container's marker lamp
 * and absurd on a 20 x 12 mm rack lamp, where it produced a 70 x 62 mm bezel
 * that overhung its faceplate and collided with the lamp beside it. The two
 * depths follow the margin for the same reason: a lamp an eighth of the size
 * should not be seated eight times as deep.
 */
export function statusLens(
  parent: Group,
  m: CargoMaterials,
  size: Vec2,
  position: Vec3,
  lamp: MeshPhysicalMaterial = m.amber,
  face: Face = 'front',
  spin = 0,
  orient?: Vec3,
): void {
  const [width, height] = size
  const rotation = orient ?? faceSpin(face, spin)
  const margin = Math.min(0.05, Math.min(width, height) * 0.6)
  const seat = margin / 0.05
  parent.add(prism(m.ink, [width + margin, height + margin, 0.04 * seat], lift(position, face, 0.01 * seat), {
    chamfer: Math.min(width, height) * 0.3,
    fillet: 0.008 * seat,
    bevel: 0.007 * seat,
    rotation,
  }))
  parent.add(prism(lamp, [width, height, 0.026 * seat], lift(position, face, 0.032 * seat), {
    chamfer: Math.min(width, height) * 0.26,
    fillet: 0.005 * seat,
    bevel: 0.004 * seat,
    rotation,
  }))
}

/**
 * A seated graphic: a shallow plaque with the decal mapped onto its face.
 *
 * The plaque exists so the graphic inherits a physical edge and a shadow. A
 * decal plane alone lights identically to its host and reads as a sticker
 * printed on air.
 *
 * The decal sits 5 mm above the plate it is printed on. At the 1.5 mm it was
 * drawn at, the pair is three depth-buffer steps apart at the far end of a
 * container yard and the graphic flickers in and out between frames.
 */
export function plaque(
  parent: Group,
  m: CargoMaterials,
  decal: MeshPhysicalMaterial,
  size: Vec2,
  position: Vec3,
  face: Face = 'front',
  plate: MeshPhysicalMaterial = m.shellShade,
  spin = 0,
  orient?: Vec3,
): Mesh {
  const [width, height] = size
  const rotation = orient ?? faceSpin(face, spin)
  parent.add(prism(plate, [width + 0.04, height + 0.04, 0.022], lift(position, face, 0.008), {
    chamfer: Math.min(width, height) * 0.16,
    fillet: 0.006,
    bevel: 0.005,
    rotation,
  }))
  const mesh = new Mesh(new PlaneGeometry(width, height), decal)
  mesh.name = 'axiom-cargo-kit / seated decal'
  const placed = lift(position, face, 0.024)
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
 *
 * `orient` replaces the face rotation outright, for a host that is not one of
 * the six box faces - a sloped deck, a tilted tank facet, a sack cap turned by
 * its own yaw. The seat follows it, so the mark embeds by the same amount from
 * end to end instead of standing off at one edge and sinking at the other.
 */
export function paintMark(
  parent: Group,
  material: MeshPhysicalMaterial,
  profile: Vec2[],
  position: Vec3,
  face: Face = 'front',
  thickness = 0.014,
  spin = 0,
  orient?: Vec3,
): Mesh {
  // The embed is a fixed depth rather than a share of the thickness. At 0.14 of
  // the default 14 mm it was 1.96 mm, inside the pack's own 3 mm floor, so the
  // back cap sat a depth step from the skin the mark is painted on instead of
  // safely under it. A stroke thinner than twice the clearance keeps half its
  // thickness proud, the way a flush-driven bolt keeps its head.
  const embed = Math.min(FACE_CLEARANCE, thickness * 0.5)
  const seat = orient
    ? liftAlong(position, orient, thickness * 0.5 - embed)
    : lift(position, face, thickness * 0.5 - embed)
  const mesh = extrudeProfile(material, profile, thickness, seat, {
    fillet: thickness * 0.5,
    bevel: thickness * 0.3,
    rotation: orient ?? faceSpin(face, spin),
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
 *
 * `segments` has to match the facet count the body was built with, because the
 * plate seats on the chord the cylinder actually renders, not on the nominal
 * radius. Measured from the nominal radius, the same 4 mm embed is 0.3 mm proud
 * on a 20-facet drum - coplanar, and it z-fights - and 6.7 mm short of a silo.
 *
 * `centre` is the cylinder's axis. It defaults to the group origin because most
 * callers build one tank per model, but a rack of drums has four axes and a
 * label measured about the wrong one ends up inside its neighbour.
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
  segments = 20,
  centre: Vec3 = [0, 0, 0],
): Mesh {
  const facet = facetRadius(radius, segments)
  // A flat plate laid on a curve lifts its corners by the sagitta of its own
  // width, and the plate is only 20 mm thick. Past this width the corners leave
  // the shell entirely - 39 mm on the chemical drum as drawn - so the plate is
  // clamped to the width its embed can carry rather than allowed to peel.
  const width = Math.min(size[0], 2 * Math.sqrt(0.008 * facet) - 0.05)
  const tall = size[1]
  const place = (out: number): Vec3 => [
    centre[0] + Math.sin(angle) * (facet + out),
    centre[1] + height,
    centre[2] + Math.cos(angle) * (facet + out),
  ]
  parent.add(prism(plate, [width + 0.05, tall + 0.04, 0.02], place(0.006), {
    chamfer: Math.min(width, tall) * 0.16,
    fillet: 0.007,
    bevel: 0.006,
    rotation: [0, angle, 0],
  }))
  const mesh = new Mesh(new PlaneGeometry(width, tall), decal)
  mesh.name = 'axiom-cargo-kit / radial decal'
  mesh.position.set(...place(0.024))
  mesh.rotation.set(0, angle, 0)
  parent.add(mesh)
  return mesh
}

/**
 * A painted mark on a cylindrical flank - the curved-body {@link paintMark}.
 *
 * Without this every drum, tank, and silo lays a flat extrusion tangent to its
 * shell and the mark is buried at its centre and clear of the silhouette at its
 * edges, or the reverse. Seated on the facet plane and rotated with it, a
 * chevron on a barrel behaves like a chevron on a panel.
 *
 * `centre` is the cylinder's axis, for the same reason {@link radialPlaque}
 * takes one: a rack of drums has four axes, and a mark measured about the wrong
 * one lands inside the drum next to the one it belongs to.
 */
export function radialMark(
  parent: Group,
  material: MeshPhysicalMaterial,
  profile: Vec2[],
  radius: number,
  height: number,
  angle: number,
  segments = 20,
  thickness = 0.013,
  centre: Vec3 = [0, 0, 0],
): Mesh {
  const facet = facetRadius(radius, segments)
  // A stroke lies exactly flat on the chord it is centred on, and then leaves
  // it: past that facet's own edge each further millimetre of width drops away
  // at the next facet's slope, and all the mark has to give is its embed.
  // Wider than this and the far corners are off the shell, which is why the
  // pressure vessel's chevrons had to be sized to the facet by hand. A stroke
  // that outruns its facet is narrowed rather than left to peel.
  //
  // The embed is the flat {@link paintMark}'s, and for the same reason: 0.14 of
  // a 13 mm stroke is 1.8 mm, and a back cap that close to the shell is a back
  // cap on it.
  const embed = Math.min(FACE_CLEARANCE, thickness * 0.5)
  const step = (Math.PI * 2) / segments
  const reach = facet * Math.tan(step * 0.5) + embed / Math.tan(step)
  const half = Math.max(...profile.map(([x]) => Math.abs(x)))
  const stroke = half > reach ? profile.map(([x, y]): Vec2 => [x * (reach / half), y]) : profile
  const seat = facet + thickness * 0.5 - embed
  const mesh = extrudeProfile(material, stroke, thickness, [
    centre[0] + Math.sin(angle) * seat,
    centre[1] + height,
    centre[2] + Math.cos(angle) * seat,
  ], {
    fillet: thickness * 0.5,
    bevel: thickness * 0.3,
    rotation: [0, angle, 0],
  })
  parent.add(mesh)
  return mesh
}

/**
 * Where a fitting seats on a cylindrical flank: the position and rotation to
 * hand to {@link statusLens}, {@link bolt}, or {@link box}.
 *
 * The flat helpers only know the six box faces, so a model that wants a lamp on
 * a tank picks a corner like `[r*0.72, y, r*0.72]` and gets a part at 45 degrees
 * to the surface. This returns the same pair those helpers would have been given
 * on a flat panel, so nothing else about the call site has to change.
 *
 * `centre` is the cylinder's axis, as on {@link radialPlaque}: without it a
 * model with more than one barrel has to wrap each fitting in its own group to
 * get the trigonometry measured about the right one.
 */
export function radialFitting(
  radius: number,
  height: number,
  angle: number,
  segments = 20,
  centre: Vec3 = [0, 0, 0],
): { position: Vec3; rotation: Vec3 } {
  const facet = facetRadius(radius, segments)
  return {
    position: [
      centre[0] + Math.sin(angle) * facet,
      centre[1] + height,
      centre[2] + Math.cos(angle) * facet,
    ],
    rotation: [0, angle, 0],
  }
}

/**
 * A painted stencil laid directly on a shell face, with no plaque behind it.
 *
 * Lifted half a layer clear rather than the 4 mm it was drawn at: this is a bare
 * plane with no plate under it to hide a near-coincidence, so it is the one
 * graphic in the kit that has nothing but its offset keeping it visible.
 */
export function stencil(
  parent: Group,
  decal: MeshPhysicalMaterial,
  size: Vec2,
  position: Vec3,
  face: Face = 'front',
  spin = 0,
  orient?: Vec3,
): Mesh {
  const mesh = new Mesh(new PlaneGeometry(size[0], size[1]), decal)
  mesh.name = 'axiom-cargo-kit / painted stencil'
  mesh.position.set(...lift(position, face, LAYER_CLEARANCE * 0.5))
  mesh.rotation.set(...(orient ?? faceSpin(face, spin)))
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
  orient?: Vec3,
): Mesh {
  const mesh = flatPlate(material, size, lift(position, face, 0.006), orient ?? faceSpin(face, spin))
  parent.add(mesh)
  return mesh
}

/**
 * How far a castor's mounting plate stands above the axle it is hung from.
 *
 * A chassis underside goes here, not at the wheel centre and not at the ground.
 * Passing the wheel radius as the mount height buries the entire fork inside the
 * floor slab and the prop renders sitting flat on the deck with no wheels at
 * all, which is exactly what the dumpster does.
 */
export function castorMount(radius = 0.085): number {
  return radius * 1.85 + 0.0175
}

/**
 * A swivel castor: fork, axle, tyre, and a top mounting plate. Used across the
 * carts, trolleys, and mobile racks so they all roll on the same hardware.
 *
 * `position` is the **axle**: the tyre bottoms at `y - radius`, so a wheel that
 * touches the ground wants `y = radius`, and whatever it carries sits at
 * `y + castorMount(radius)`.
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
 * A straight structural member between two points. Keeps frame bracing honest:
 * one part, one bevel, correct length by construction.
 *
 * The span is solved in all three axes. It used to take its length from x and y
 * only and rotate about Z, so a diagonal authored across the XZ plane came out
 * as an axis-aligned bar of the wrong length at the midpoint - silently, since
 * there is nothing about the result that looks like an error. A drawbar ended up
 * 305 mm short of its hitch and a set of saddle gussets vanished inside the
 * saddle they were bracing.
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
  const dz = to[2] - from[2]
  const length = Math.hypot(dx, dy, dz)
  // Yaw then pitch, in the order an XYZ Euler composes them, so the bar's long
  // axis lands on the span and its width axis stays as near upright as the
  // pitch allows.
  const mesh = prism(material, [length, width, depth], [
    (from[0] + to[0]) * 0.5,
    (from[1] + to[1]) * 0.5,
    (from[2] + to[2]) * 0.5,
  ], {
    chamfer,
    fillet: Math.min(0.014, width * 0.12),
    bevel: Math.min(0.014, depth * 0.14),
    rotation: [0, Math.atan2(-dz, dx), Math.asin(length === 0 ? 0 : dy / length)],
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

/**
 * The dark inside of a carcass, built as five thin faces around a void rather
 * than as one solid block.
 *
 * The solid-block idiom is the reason three of this wave's cabinets and chests
 * ship shelves, drawer liners, stock boxes and tray dividers that never appear
 * in a single frame: the interior is a `m.ink` box at the cavity's centre, so
 * everything placed in the cavity is inside it. It also puts the block's front
 * face on the same plane as whatever sits at the opening. Five faces cost four
 * extra meshes and make the cavity an actual cavity.
 *
 * `size` is the clear opening, and the walls are built **outside** it: the liner
 * occupies `size + 2 * wall` on every closed axis. So the number to pass is the
 * void the drawers and shelves have to fit in, not the carcass they sit in -
 * size it to the carcass and the walls stand a wall's thickness outside the
 * shell they are meant to line.
 *
 * `open` is the face left out - the one the doors, drawers, or lid cover.
 */
export function cavityLiner(
  parent: Group,
  material: MeshPhysicalMaterial,
  size: Vec3,
  position: Vec3,
  wall = 0.02,
  open: Face = 'front',
): Group {
  const liner = new Group()
  liner.name = 'axiom-cargo-kit / cavity liner'
  parent.add(liner)
  const [width, height, depth] = size
  const half: Vec3 = [width * 0.5, height * 0.5, depth * 0.5]
  const panel = (face: Face): void => {
    if (face === open) return
    const normal = FACE_NORMAL[face]
    const axis = normal[0] !== 0 ? 0 : normal[1] !== 0 ? 1 : 2
    const plate: Vec3 = [width, height, depth]
    plate[axis] = wall
    liner.add(prism(material, plate, [
      position[0] + normal[0] * (half[0] + wall * 0.5),
      position[1] + normal[1] * (half[1] + wall * 0.5),
      position[2] + normal[2] * (half[2] + wall * 0.5),
    ], { chamfer: wall * 0.35, fillet: wall * 0.15, bevel: wall * 0.12 }))
  }
  for (const face of ['front', 'back', 'left', 'right', 'top', 'bottom'] as const) panel(face)
  return liner
}

/**
 * A rubber pad under a foot, base ring, or runner, dropped 1 mm below the sole
 * it is bedded into.
 *
 * The idiom this replaces puts the pad inside the base with both bottom faces at
 * y = 0 - two down-facing planes on the same plane, which is the pack's single
 * most repeated z-fight. Standing the pad slightly proud is also what actually
 * happens: the pad is the part in contact, and the steel above it is not.
 */
export function groundPad(
  parent: Group,
  material: MeshPhysicalMaterial,
  size: Vec2,
  sole: Vec3,
  thickness = 0.02,
): Mesh {
  const mesh = prism(material, [size[0], thickness, size[1]], [
    sole[0],
    sole[1] - 0.001 + thickness * 0.5,
    sole[2],
  ], {
    chamfer: Math.min(0.02, Math.min(size[0], size[1]) * 0.16),
    fillet: 0.006,
    bevel: 0.005,
  })
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

/** What a drum publishes about itself so details can be seated on it. */
export interface DrumShell {
  readonly shell: Group
  /** Facet plane of the body, which is where anything applied has to sit. */
  readonly radius: number
  /** The band of heights the chimes leave clear, measured from the base. */
  readonly clearY: readonly [number, number]
}

/**
 * The pack's drum shell: a faceted body with real rolling hoops and top and
 * bottom chimes.
 *
 * A drum's entire silhouette read is those three rings. Model it as a plain
 * cylinder and it becomes a can; the hoops are what tell you it can be tipped
 * onto its edge and walked, which is the only way anyone actually moves one.
 *
 * `position` is the **base**, so the body spans `y` to `y + height`. The chimes
 * stand proud of the body at both ends, and a band or a bolt placed at the body
 * radius inside those zones disappears inside them - a tamper seal, a catch and
 * three fasteners are lost that way on the sealed barrel alone. `clearY` is the
 * band between them, and `radius` is the facet plane rather than the nominal
 * one, so both figures can be used without further arithmetic.
 */
export function drum(
  parent: Group,
  m: CargoMaterials,
  radius: number,
  height: number,
  position: Vec3,
  options: DrumOptions = {},
): DrumShell {
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
  return { shell, radius: facetRadius(radius, segments), clearY: [0.07, height - 0.07] }
}

/**
 * A strap wrapped round a cylinder, built as a run of chords rather than as one
 * tangent quad.
 *
 * A flat quad laid on a curve touches along a single line and leaves its ends in
 * the air - 160 mm off the tarp roll on the open-top container. Chords follow
 * the surface to whatever tolerance the chord count buys, and they are seated to
 * bite into the shell at their ends so nothing along the run can float.
 *
 * The strap is authored around +Y at the group origin and the group is returned,
 * so a band on a horizontal roll is the same call with the group rotated onto
 * the roll's axis.
 */
export function wrapStrap(
  parent: Group,
  material: MeshPhysicalMaterial,
  radius: number,
  centre: Vec3,
  from: number,
  to: number,
  width = 0.07,
  thickness = 0.014,
  chords = 3,
): Group {
  const strap = new Group()
  strap.name = 'axiom-cargo-kit / wrap strap'
  strap.position.set(...centre)
  parent.add(strap)

  const step = (to - from) / chords
  const seat = (radius - 0.004) * Math.cos(step * 0.5) + thickness * 0.5
  for (let index = 0; index < chords; index += 1) {
    const angle = from + step * (index + 0.5)
    strap.add(prism(material, [2 * seat * Math.tan(step * 0.5), width, thickness], [
      Math.sin(angle) * seat,
      0,
      Math.cos(angle) * seat,
    ], {
      chamfer: thickness * 0.4,
      fillet: thickness * 0.2,
      bevel: thickness * 0.18,
      rotation: [0, angle, 0],
    }))
  }
  return strap
}

/**
 * A pipe branch off a vessel: neck, flange, and a ring of studs round the
 * flange.
 *
 * The studs are the reason this is shared. The local version it replaces decided
 * which plane to lay them in by testing whether the rotation had an X term,
 * which is only right for one of the three axes - on the other two the studs
 * came out strung along the nozzle's own bore instead of round its face, half
 * of them inside the shell and half hanging clear of it. Solving the flange
 * plane from the bore direction is right for any orientation, including the
 * angled ones a real vessel has.
 */
export function nozzle(
  parent: Group,
  m: CargoMaterials,
  position: Vec3,
  rotation: Vec3,
  radius: number,
  reach: number,
  studs = 6,
): void {
  parent.add(cylinder(m.steel, radius, reach, position, rotation, 12))
  parent.add(cylinder(m.graphiteEdge, radius * 1.7, 0.055, position, rotation, 12))

  const bore = new Vector3(0, 1, 0).applyEuler(new Euler(...rotation)).normalize()
  const seed = Math.abs(bore.x) > 0.9 ? new Vector3(0, 0, 1) : new Vector3(1, 0, 0)
  const u = new Vector3().crossVectors(bore, seed).normalize()
  const v = new Vector3().crossVectors(bore, u)
  const offset = radius * 1.4
  for (let index = 0; index < studs; index += 1) {
    const angle = ((Math.PI * 2) / studs) * index
    parent.add(cylinder(m.steel, 0.014, 0.075, [
      position[0] + (u.x * Math.cos(angle) + v.x * Math.sin(angle)) * offset,
      position[1] + (u.y * Math.cos(angle) + v.y * Math.sin(angle)) * offset,
      position[2] + (u.z * Math.cos(angle) + v.z * Math.sin(angle)) * offset,
    ], rotation, 6))
  }
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
 *
 * `position` is the **shackle cross pin** - the ears reach down to `-0.31s`, the
 * swivel nut to `-0.425s`, and the hook body occupies `-0.55s` to `-1.17s`.
 * A rope or a sheave block aimed at the middle of the assembly rather than at
 * the pin misses it by most of a hook length.
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
