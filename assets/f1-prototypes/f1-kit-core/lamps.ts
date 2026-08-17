/**
 * Unlit lamp lenses — same contract as timing digits and the brake beacon.
 *
 * MeshPhysicalMaterial picked up specular hot spots from the preview rig's directionals
 * (white pinprick in the center of every disc). MeshBasic + toneMapped:false gives a
 * uniform emissive read with no studio specular.
 *
 * kit.red is painted equipment (extinguishers, Armco). Start/flood lamps that glow use
 * this helper, not the kit.red slot.
 */

import { MeshBasicMaterial } from 'three/webgpu'

export interface F1LampMaterialOptions {
  readonly on: boolean
  /** Lit colour. Defaults to FIA start-light red. */
  readonly color?: number
  readonly name?: string
  /** White flood lenses — kept for API compat; MeshBasic uses color directly. */
  readonly intensity?: number
}

export function createLampMaterial(options: F1LampMaterialOptions): MeshBasicMaterial {
  const color = options.color ?? 0xc41820
  const name = options.name ?? (options.on ? 'f1-kit / lamp on' : 'f1-kit / lamp off')
  if (!options.on) {
    return new MeshBasicMaterial({
      name,
      color: 0x140808,
      toneMapped: false,
    })
  }
  return new MeshBasicMaterial({
    name,
    color,
    toneMapped: false,
  })
}
