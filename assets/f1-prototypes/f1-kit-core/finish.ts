import { Group, Mesh, type BufferGeometry, type Object3D } from 'three/webgpu'

import { disposeF1Materials, type F1MaterialBundle } from './materials.ts'

/**
 * The shared close-out pass every prop runs before it hands back its instance.
 *
 * It sets the shadow flags, names the batches so a consumer inspecting the scene graph sees the kit's
 * naming rather than `Mesh_017`, attaches the prop's sockets last so nothing can drop them, and wires a
 * single `dispose` that frees the generated geometry and the material bundle together.
 *
 * Authoring this per prop is how the kit ended up with meshes that cast shadows on some props and not
 * others, and with two props that freed their geometry twice.
 */
export interface FinishOptions {
  /** Model id, used to name the batches. */
  readonly name: string
  /** The geometry this build generated. Freed by `dispose`. */
  readonly geometries: readonly BufferGeometry[]
  /** Anchors added to the root last, so nothing can drop them. */
  readonly sockets?: readonly Object3D[]
  /** Meshes that should not receive shadows — thin signage and lamps. */
  readonly unlit?: readonly Mesh[]
}

export interface FinishedModel {
  readonly meshes: Mesh[]
  dispose(): void
}

export function finishModel(
  root: Group,
  bundle: F1MaterialBundle,
  options: FinishOptions,
): FinishedModel {
  const meshes = meshesOf(root)
  const unlit = new Set(options.unlit ?? [])
  for (const mesh of meshes) {
    mesh.castShadow = true
    mesh.receiveShadow = !unlit.has(mesh)
    if (!mesh.name) mesh.name = `${options.name} / batch`
    else if (!mesh.name.startsWith(options.name)) mesh.name = `${options.name} / ${mesh.name}`
  }
  if (options.sockets?.length) root.add(...options.sockets)

  return {
    meshes,
    dispose() {
      for (const geometry of options.geometries) geometry.dispose()
      disposeF1Materials(bundle)
      root.removeFromParent()
    },
  }
}

/** Collects every mesh below a root; handy for state passes after the build. */
export function meshesOf(root: Group): Mesh[] {
  const meshes: Mesh[] = []
  root.traverse((object) => {
    if (object instanceof Mesh) meshes.push(object)
  })
  return meshes
}
