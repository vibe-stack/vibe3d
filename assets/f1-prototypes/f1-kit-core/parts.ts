/**
 * The kit's hardware vocabulary: the small parts that recur across every pit-lane prop.
 *
 * A bolt circle, a foot pad, a frame member and a wrap strap were each hand-rolled three or four times
 * across this kit before this file existed, and they drifted every time — different proud heights,
 * different chamfers, different clearances. Centralising them means a fix lands once, which is the same
 * reason the cargo wave keeps `parts.ts`.
 */

import * as THREE from 'three/webgpu'

import { bevelBox, bevelPrism } from './bevel.ts'
import { mergeParts } from './merge.ts'

export type Vec3 = readonly [number, number, number]

export const AXIS_X: Vec3 = [1, 0, 0]
export const AXIS_Y: Vec3 = [0, 1, 0]
export const AXIS_Z: Vec3 = [0, 0, 1]

/**
 * How far an applied detail embeds into the face it sits on.
 *
 * Every face-applied helper below already stands its own front cap proud and buries its own back cap by
 * this much, so what a caller passes is the host's *outer face* and nothing else. The ad-hoc `+ 0.002`
 * a caller reaches for to "make sure it clears" is exactly what turns a designed embed into a float, and
 * a float is what the clearance audit fails on.
 */
export const FACE_CLEARANCE = 0.004

/** The step between successive layers of applied detail. Count layers rather than inventing offsets. */
export const LAYER_CLEARANCE = 0.006

/** Position for stacked surface detail. `n` = 1 for the first layer on a face. */
export function layer(hostFace: number, n = 1): number {
  return hostFace + LAYER_CLEARANCE * (n - 1)
}

/** Corrects a radius so an `segments`-sided polygon still touches the intended circle at its flats. */
export function facetRadius(radius: number, segments = 20): number {
  return radius / Math.cos(Math.PI / segments)
}

/** A regular hexagon outline, for nuts, sockets and fasteners. */
export function hexagon(radius: number): Array<readonly [number, number]> {
  const points: Array<readonly [number, number]> = []
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + Math.PI / 6
    points.push([Math.cos(a) * radius, Math.sin(a) * radius])
  }
  return points
}

/** A cylinder laid along an arbitrary axis, centred at `position`. */
export function tubeSection(
  radius: number, length: number, position: Vec3, axis: Vec3 = AXIS_Y, radial = 16,
): THREE.BufferGeometry {
  const geo = new THREE.CylinderGeometry(radius, radius, Math.max(1e-4, length), radial)
  const direction = new THREE.Vector3(...axis).normalize()
  const quaternion = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction)
  geo.applyMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(quaternion))
  geo.translate(...position)
  return geo
}

/** A straight structural member running between two points. */
export function member(
  from: THREE.Vector3, to: THREE.Vector3, radius: number, radial = 8,
): THREE.BufferGeometry {
  const delta = new THREE.Vector3().subVectors(to, from)
  const geo = new THREE.CylinderGeometry(radius, radius, Math.max(1e-4, delta.length()), radial)
  const quaternion = new THREE.Quaternion()
    .setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.clone().normalize())
  geo.applyMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(quaternion))
  geo.translate((from.x + to.x) / 2, (from.y + to.y) / 2, (from.z + to.z) / 2)
  return geo
}

/** A hex fastener standing `proud` of the face it is driven into, along `axis`. */
export function bolt(
  position: Vec3, radius = 0.012, proud = 0.016, axis: Vec3 = AXIS_Y,
): THREE.BufferGeometry {
  const geo = bevelPrism(hexagon(radius), proud + FACE_CLEARANCE * 2, Math.min(0.0025, radius * 0.2))
  const direction = new THREE.Vector3(...axis).normalize()
  const quaternion = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), direction)
  geo.applyMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(quaternion))
  geo.translate(...position)
  return geo
}

/** A ring of `count` bolts about `axis`, centred on `centre` at `radius`. Returns one merged geometry. */
export function boltRun(
  centre: Vec3, radius: number, count: number, boltRadius = 0.012, proud = 0.016,
  axis: Vec3 = AXIS_Y, phase = 0,
): THREE.BufferGeometry {
  const direction = new THREE.Vector3(...axis).normalize()
  const spin = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), direction)
  const parts: THREE.BufferGeometry[] = []
  for (let i = 0; i < count; i++) {
    const a = ((i + phase) / count) * Math.PI * 2
    const offset = new THREE.Vector3(Math.cos(a) * radius, Math.sin(a) * radius, 0)
      .applyQuaternion(spin)
    parts.push(bolt([centre[0] + offset.x, centre[1] + offset.y, centre[2] + offset.z],
      boltRadius, proud, axis))
  }
  return mergeParts(parts, 'boltRun')
}

/** A chamfered foot pad seated on the floor under a leg. */
export function groundPad(
  size: readonly [number, number], sole: Vec3, thickness = 0.02,
): THREE.BufferGeometry {
  const geo = bevelBox(size[0], thickness, size[1], Math.min(0.005, thickness * 0.25))
  geo.translate(sole[0], sole[1] + thickness / 2, sole[2])
  return geo
}

/** A swivel castor: wheel, fork and mounting boss, merged. */
export function castor(position: Vec3, radius = 0.055, swivel = 0): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = []
  const wheel = new THREE.CylinderGeometry(radius, radius, radius * 0.52, 18)
  wheel.rotateZ(Math.PI / 2)
  parts.push(wheel)
  for (const side of [-1, 1] as const) {
    const cheek = bevelBox(radius * 0.24, radius * 1.9, radius * 0.14, 0.004)
    cheek.rotateY(Math.PI / 2)
    cheek.translate(side * radius * 0.42, radius * 0.45, 0)
    parts.push(cheek)
  }
  const crown = bevelBox(radius * 1.1, radius * 0.22, radius * 1.1, 0.005)
  crown.translate(0, radius * 1.32, 0)
  parts.push(crown)
  const stem = new THREE.CylinderGeometry(radius * 0.22, radius * 0.22, radius * 0.6, 12)
  stem.translate(0, radius * 1.6, 0)
  parts.push(stem)

  const geo = mergeParts(parts, 'castor')
  geo.rotateY(swivel)
  geo.translate(position[0], position[1] + radius, position[2])
  return geo
}

/** A strap wrapped around a cylindrical body, standing proud of it. */
export function wrapStrap(
  radius: number, centre: Vec3, width = 0.05, proud = 0.014, segments = 40,
): THREE.BufferGeometry {
  const profile = [
    new THREE.Vector2(radius, -width / 2),
    new THREE.Vector2(radius + proud, -width / 2 + proud * 0.4),
    new THREE.Vector2(radius + proud, width / 2 - proud * 0.4),
    new THREE.Vector2(radius, width / 2),
    new THREE.Vector2(radius, -width / 2),
  ]
  const geo = new THREE.LatheGeometry(profile, segments)
  geo.translate(...centre)
  return geo
}

/** A named, empty anchor for consumers to attach to. */
export function socket(name: string, position: Vec3): THREE.Object3D {
  const anchor = new THREE.Object3D()
  anchor.name = name
  anchor.position.set(...position)
  return anchor
}
