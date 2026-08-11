import { MeshPhysicalMaterial } from 'three/webgpu'

export interface MaterialSourceOptions {
  readonly recipeId?: string
  readonly palette?: string
  readonly condition?: string
  readonly wear?: number
  readonly dirt?: number
  readonly seed?: number
  readonly uvScale?: readonly [number, number]
}

export interface MaterialHandle {
  readonly key: string
  readonly material: MeshPhysicalMaterial
  release(): void
}

export interface MaterialSource {
  acquire(options: MaterialSourceOptions, key: string): MaterialHandle
}

let mountedMaterialSource: MaterialSource | undefined

/**
 * Sets the application-level material source used by subsequently-created
 * libraries. The returned function restores the previous source, which makes
 * kit mounting safe across previews, tests, and hot reloads.
 */
export function mountMaterialSource(source: MaterialSource): () => void {
  const previous = mountedMaterialSource
  mountedMaterialSource = source
  return () => {
    if (mountedMaterialSource === source) mountedMaterialSource = previous
  }
}

/**
 * Tiny ownership helper for model-local PBR materials. It deliberately has no
 * registry, schema, hashing, or compiler dependency; generators can create and
 * release materials without adopting a production pipeline.
 */
export class MaterialLibrary {
  readonly #source: MaterialSource | undefined

  constructor(source: MaterialSource | undefined = mountedMaterialSource) {
    this.#source = source
  }

  acquire(options: MaterialSourceOptions = {}): MaterialHandle {
    const key = [options.recipeId, options.palette, options.seed].filter(Boolean).join('/') || 'material'
    if (this.#source) return this.#source.acquire(options, key)
    const material = new MeshPhysicalMaterial({ name: key })
    material.userData.source = { ...options }
    let released = false
    return {
      key,
      material,
      release() {
        if (released) return
        released = true
        material.dispose()
      },
    }
  }
}

export interface PhysicalMaterialTuning {
  readonly clearcoat?: number
  readonly clearcoatRoughness?: number
  readonly emissive?: number
}

/** Applies generator-local art direction to an owned material handle. */
export function tuneMaterial(
  handle: MaterialHandle,
  hex: number,
  roughness: number,
  metalness: number,
  tuning: PhysicalMaterialTuning = {},
): MeshPhysicalMaterial {
  const material = handle.material as MeshPhysicalMaterial
  material.color.setHex(hex)
  material.roughness = roughness
  material.metalness = metalness
  material.clearcoat = tuning.clearcoat ?? 0
  material.clearcoatRoughness = tuning.clearcoatRoughness ?? 0.3
  if (tuning.emissive !== undefined) {
    material.emissive.setHex(hex)
    material.emissiveIntensity = tuning.emissive
    material.toneMapped = false
  } else {
    material.emissive.setHex(0x000000)
    material.emissiveIntensity = 0
  }
  return material
}
