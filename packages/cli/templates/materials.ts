import type { Material } from 'three'

export interface MaterialRequest {
  readonly slot: string
  readonly model: string
  readonly variant?: string
}

export interface MaterialHandle<T extends Material = Material> {
  readonly material: T
  release(): void
}

export interface MaterialSource {
  acquire(request: MaterialRequest): MaterialHandle
}

export function borrowedMaterial<T extends Material>(material: T): MaterialHandle<T> {
  return { material, release: () => undefined }
}
