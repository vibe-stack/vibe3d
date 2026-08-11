import type { BufferGeometry, Material, Texture } from 'three'

export class ResourceScope {
  readonly #geometries = new Set<BufferGeometry>()
  readonly #materials = new Set<Material>()
  readonly #textures = new Set<Texture>()
  #disposed = false

  ownGeometry<T extends BufferGeometry>(geometry: T): T {
    this.#geometries.add(geometry)
    return geometry
  }

  ownMaterial<T extends Material>(material: T): T {
    this.#materials.add(material)
    return material
  }

  ownTexture<T extends Texture>(texture: T): T {
    this.#textures.add(texture)
    return texture
  }

  dispose(): void {
    if (this.#disposed) return
    this.#disposed = true
    for (const texture of this.#textures) texture.dispose()
    for (const material of this.#materials) material.dispose()
    for (const geometry of this.#geometries) geometry.dispose()
  }
}
