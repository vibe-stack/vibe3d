/**
 * Emissive lamp glass + the colours used when a prop actually lights the scene.
 *
 * kit.red is painted equipment (extinguishers, Armco). Start/flood lamps that should glow cannot share
 * that slot — ACES turns a MeshBasic red into peach, and a non-emissive Standard disc never spills.
 */

import { MeshPhysicalMaterial } from 'three/webgpu'

import { TOKEN } from './palette.ts'

export interface F1LampMaterialOptions {
  readonly on: boolean
  /** Lit colour. Defaults to FIA start-light red. */
  readonly color?: number
  readonly name?: string
  /** White flood lenses want a hotter emissive than a start lamp. */
  readonly intensity?: number
}

export function createLampMaterial(options: F1LampMaterialOptions): MeshPhysicalMaterial {
  const color = options.color ?? TOKEN.RED_500
  const name = options.name ?? (options.on ? 'f1-kit / lamp on' : 'f1-kit / lamp off')
  if (!options.on) {
    return new MeshPhysicalMaterial({
      name,
      color: 0x140808,
      emissive: 0x000000,
      emissiveIntensity: 0,
      roughness: 0.2,
      metalness: 0.22,
    })
  }
  return new MeshPhysicalMaterial({
    name,
    color: 0x120404,
    emissive: color,
    emissiveIntensity: options.intensity ?? 5.2,
    roughness: 0.18,
    metalness: 0.04,
  })
}
