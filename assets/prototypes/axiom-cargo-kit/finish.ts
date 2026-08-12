import { Group, Mesh, MeshPhysicalMaterial, Object3D, type BufferGeometry } from 'three/webgpu'

import {
  WEAR_ATTRIBUTES,
  bakeOcclusion,
  bakeSurfaceAttributes,
  createWearMaterial,
  mergeStaticByMaterial,
} from '../../../src/asset-forge/generator/index.ts'
import { disposeCargoMaterials, type CargoMaterialBundle } from './materials.ts'

/**
 * The shared close-out pass: bake cavity occlusion, bake per-surface identity
 * into vertex attributes, swap the authored materials for the single wear
 * material, and collapse everything to a handful of draw calls.
 *
 * Every prop in the wave runs this, which is what keeps their surfaces
 * consistent. Authoring wear per prop would give fifty different answers to
 * "how dirty is a depot", and the eye reads that inconsistency long before it
 * reads any individual model.
 */
export interface FinishOptions {
  /** Model id, used to name the merged batches. */
  readonly name: string
  /**
   * Articulated sub-assemblies to batch independently, so each keeps its own
   * transform and stays animatable after the merge.
   *
   * They are detached *after* the bake and re-attached after the merge. Doing it
   * in that order matters: occlusion and surface identity have to be sampled
   * with the prop whole, or a door leaf bakes as if it were floating in space -
   * and, worse, a detached mesh never receives the wear attributes its batch
   * mates carry, which fails the merge outright.
   */
  readonly assemblies?: readonly Group[]
  /** Occlusion ray reach, in metres. Scale it with the prop. */
  readonly reach?: number
  /** Anchors added to the root after the merge, so batching cannot drop them. */
  readonly sockets?: readonly Object3D[]
}

export interface FinishedModel {
  readonly geometries: BufferGeometry[]
  readonly wearMaterial: MeshPhysicalMaterial
  dispose(): void
}

export function finishModel(
  root: Group,
  bundle: CargoMaterialBundle,
  options: FinishOptions,
): FinishedModel {
  bakeOcclusion(root, { reach: options.reach ?? 0.12 })
  bakeSurfaceAttributes(root, bundle.wearProfiles)

  const wearMaterial = createWearMaterial({
    name: `${options.name} / worn depot surfaces`,
    clearcoat: 0.14,
    clearcoatRoughness: 0.46,
  })
  const worn = new Set(bundle.wearProfiles.keys())

  const articulated = (options.assemblies ?? []).filter((assembly) => assembly !== root)
  const reattach = articulated.map((assembly) => {
    const parent = assembly.parent
    parent?.remove(assembly)
    return { assembly, parent }
  })

  const batchOptions = {
    resolveMaterial: (source: MeshPhysicalMaterial) => worn.has(source) ? wearMaterial : source,
    retainedAttributes: (resolved: unknown) => resolved === wearMaterial ? WEAR_ATTRIBUTES : [],
    meshName: (material: { name?: string }) => `${options.name} / ${material.name || 'batch'}`,
  } as Parameters<typeof mergeStaticByMaterial>[1]

  const geometries: BufferGeometry[] = [...mergeStaticByMaterial(root, batchOptions)]
  for (const { assembly } of reattach) geometries.push(...mergeStaticByMaterial(assembly, batchOptions))
  for (const { assembly, parent } of reattach) parent?.add(assembly)
  if (options.sockets?.length) root.add(...options.sockets)

  return {
    geometries,
    wearMaterial,
    dispose() {
      for (const geometry of geometries) geometry.dispose()
      wearMaterial.dispose()
      disposeCargoMaterials(bundle)
    },
  }
}

/** Collects every mesh below a root; handy for state passes after the merge. */
export function meshesOf(root: Group): Mesh[] {
  const meshes: Mesh[] = []
  root.traverse((object) => {
    if (object instanceof Mesh) meshes.push(object)
  })
  return meshes
}
