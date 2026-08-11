import type {
  BufferGeometry,
  Material,
  Object3D,
  Texture,
} from 'three/webgpu'

function collectTextures(material: Material, textures: Set<Texture>): void {
  for (const value of Object.values(material)) {
    if (value && typeof value === 'object' && 'isTexture' in value) {
      textures.add(value as Texture)
    }
  }
}

/** Dispose a scene graph once, even when geometry and materials are shared. */
export function disposeObjectTree(root: Object3D): void {
  const geometries = new Set<BufferGeometry>()
  const materials = new Set<Material>()
  const textures = new Set<Texture>()

  root.traverse((object) => {
    if (!('isMesh' in object) && !('isLine' in object) && !('isPoints' in object)) {
      return
    }

    const renderable = object as Object3D & {
      geometry?: BufferGeometry
      material?: Material | Material[]
    }

    if (renderable.geometry) geometries.add(renderable.geometry)

    const objectMaterials = Array.isArray(renderable.material)
      ? renderable.material
      : renderable.material
        ? [renderable.material]
        : []

    for (const material of objectMaterials) {
      materials.add(material)
      collectTextures(material, textures)
    }
  })

  for (const texture of textures) texture.dispose()
  for (const material of materials) material.dispose()
  for (const geometry of geometries) geometry.dispose()
}
