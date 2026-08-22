/**
 * Lamp lenses — radial DataTexture on MeshStandardMaterial (roughness 1, metalness 0) plus
 * emissiveMap so Dawn's MRT bloom picks up lit discs without directional specular pinpricks.
 *
 * kit.red is painted equipment (extinguishers, Armco). Start/flood lamps that glow use
 * this helper, not the kit.red slot.
 */

import { MeshStandardMaterial } from 'three/webgpu'

import { lampLensTexture } from './textures.ts'

export interface F1LampMaterialOptions {
  readonly on: boolean
  /** Lit colour. Defaults to FIA start-light red. */
  readonly color?: number
  readonly name?: string
  /** White flood lenses — scales the baked on-map. */
  readonly intensity?: number
  /** LED cell grid in the CPU lens map. Default on. */
  readonly grid?: boolean
}

export function createLampLensMaterial(options: F1LampMaterialOptions): MeshStandardMaterial {
  const name = options.name ?? (options.on ? 'f1-kit / lamp on' : 'f1-kit / lamp off')
  const tex = lampLensTexture({
    variant: options.on ? 'on' : 'off',
    color: options.color,
    intensity: options.on ? options.intensity : undefined,
    grid: options.grid,
  })
  const material = new MeshStandardMaterial({
    name,
    map: tex,
    color: 0xffffff,
    emissive: options.on ? 0xffffff : 0x000000,
    emissiveMap: options.on ? tex : null,
    emissiveIntensity: options.on ? 1.35 : 0,
    roughness: 1,
    metalness: 0,
    toneMapped: false,
  })

  const disposeMaterial = material.dispose.bind(material)
  material.dispose = () => {
    disposeMaterial()
    tex.dispose()
  }

  return material
}

/** Alias kept for existing call sites. */
export function createLampMaterial(options: F1LampMaterialOptions): MeshStandardMaterial {
  return createLampLensMaterial(options)
}
