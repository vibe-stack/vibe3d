// resourceBag — the tiny ownership contract every F1 kit prop follows: every geometry and material
// created for a model is tracked here, so `dispose()` frees them all in one call and a consumer can
// discard a prop without poisoning shared caches (no prop in this kit shares geometry/material state
// with another instance).

import type { BufferGeometry, Material } from 'three/webgpu'

export class ResourceBag {
  readonly geometries: BufferGeometry[] = []
  readonly materials: Material[] = []

  geo<G extends BufferGeometry>(g: G): G {
    this.geometries.push(g)
    return g
  }

  mat<M extends Material>(m: M): M {
    this.materials.push(m)
    return m
  }

  dispose(): void {
    for (const g of this.geometries) g.dispose()
    for (const m of this.materials) m.dispose()
  }
}

export const clamp01 = (t: number): number => (t < 0 ? 0 : t > 1 ? 1 : t)
