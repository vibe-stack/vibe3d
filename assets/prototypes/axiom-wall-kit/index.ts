import {
  Color,
  DirectionalLight,
  Group,
  HemisphereLight,
  Mesh,
  MeshPhysicalMaterial,
  PerspectiveCamera,
  Scene,
  Vector3,
  type BufferGeometry,
} from 'three/webgpu'

import {
  WEAR_ATTRIBUTES,
  bakeOcclusion,
  bakeSurfaceAttributes,
  createWearMaterial,
  mergeStaticByMaterial,
  type WearProfile,
} from '../../../src/asset-forge/generator/index.ts'
import { KIT_BUILD, createKitMaterials, wallFace, type KitMaterials, type WallFace } from '../axiom-modular-kit/parts.ts'
import { buildWallSection, type WallSectionOptions } from '../axiom-modular-kit/layout.ts'
import { AXIOM_KIT } from '../axiom-modular-kit/contract.ts'

/**
 * The straight-wall family: loose wall runs cut from the same authoring code the
 * prefab shells use.
 *
 * The important decision here is what this kit does *not* own. The Axiom wall —
 * its thickness, its datum heights, its cassette rhythm, its skirt, and the
 * stepped frame around a door or window — already exists in `axiom-modular-kit`
 * and is what the prefab shells are cut from. A wall family that re-authored any
 * of that would produce pieces that look like the shells and do not line up with
 * them, which is worse than having no loose walls at all.
 *
 * So every module in this group is `buildWallSection` called with a length and
 * at most one opening. What this kit adds is only the parts a *loose* run needs
 * and a shell does not: end conditions, a free-standing footing, and the shared
 * capture rig.
 */

export const WALL = Object.freeze({
  thickness: KIT_BUILD.wallThickness,
  base: KIT_BUILD.floorY,
  top: KIT_BUILD.wallTop,
  /** Height above the module's own ground plane. */
  height: KIT_BUILD.wallTop - KIT_BUILD.floorY,
  grid: AXIOM_KIT.grid,
  increment: AXIOM_KIT.structuralIncrement,
  front: '+Z',
  pivot: 'centre-ground',
} as const)

/** Wear tiers matching the modular kit's maintained, clean-condition read. */
const PROFILES = (m: KitMaterials): Map<MeshPhysicalMaterial, WearProfile> => new Map([
  [m.shell, { rub: 0.012, grime: 0.006, scratch: 0 }],
  [m.porcelain, { rub: 0.008, grime: 0.005, scratch: 0 }],
  [m.graphite, { rub: 0.014, grime: 0.012, scratch: 0 }],
  [m.deck, { rub: 0.016, grime: 0.02, scratch: 0 }],
  [m.ink, { rub: 0.012, grime: 0.045, scratch: 0.003 }],
])

export interface WallEnvelope {
  readonly width: number
  readonly depth: number
  readonly height: number
}

export interface WallModel {
  readonly root: Group
  readonly parts: Record<string, Group>
  update(deltaSeconds: number): void
  dispose(): void
}

export interface WallBuild {
  readonly id: string
  readonly envelope: WallEnvelope
  build(context: {
    root: Group
    m: KitMaterials
    part(name: string): Group
    /** A face on the module's own centreline, for a run of the given yaw. */
    face(origin: [number, number, number], yaw: number): WallFace
    /** The canonical wall author, pre-bound to this module's root. */
    section(parent: Group, face: WallFace, u0: number, u1: number, options?: WallSectionOptions): void
  }): { readonly tick?: (elapsed: number) => void } | void
}

export function createWallModel(spec: WallBuild): WallModel {
  const { materials, handles } = createKitMaterials(6_200 + spec.id.length * 173)
  const root = new Group()
  root.name = `AXR_ARCH_${spec.id.toUpperCase()}_ROOT_DEFAULT`

  const parts: Record<string, Group> = {}
  const part = (name: string): Group => {
    const existing = parts[name]
    if (existing) return existing
    const group = new Group()
    group.name = `AXR_ARCH_${spec.id.toUpperCase()}_PART_${name.toUpperCase()}_DEFAULT`
    parts[name] = group
    root.add(group)
    return group
  }

  const built = spec.build({
    root,
    m: materials,
    part,
    face: (origin, yaw) => wallFace(origin, yaw),
    section: (parent, face, u0, u1, options) => buildWallSection(parent, materials, face, u0, u1, options),
  })

  root.userData.wallKit = {
    version: 1,
    moduleId: spec.id,
    pivot: WALL.pivot,
    front: WALL.front,
    envelope: spec.envelope,
    grid: WALL.grid,
    increment: WALL.increment,
  }

  bakeOcclusion(root, { reach: 0.18 })
  const profiles = PROFILES(materials)
  bakeSurfaceAttributes(root, profiles)
  const wearMaterial = createWearMaterial({
    name: `${spec.id} / maintained kit surfaces`,
    clearcoat: 0.1,
    clearcoatRoughness: 0.5,
  })
  const worn = new Set(profiles.keys())
  const geometries: BufferGeometry[] = [...mergeStaticByMaterial(root, {
    resolveMaterial: (source: MeshPhysicalMaterial) => worn.has(source) ? wearMaterial : source,
    retainedAttributes: (resolved: unknown) => resolved === wearMaterial ? WEAR_ATTRIBUTES : [],
    meshName: (material: { name?: string }) => `${spec.id} / ${material.name || 'batch'}`,
  } as Parameters<typeof mergeStaticByMaterial>[1])]

  let elapsed = 0
  return {
    root,
    parts,
    update: (deltaSeconds: number) => {
      elapsed += Math.min(Math.max(deltaSeconds, 0), 0.05)
      built?.tick?.(elapsed)
    },
    dispose: () => {
      for (const geometry of geometries) geometry.dispose()
      wearMaterial.dispose()
      for (const handle of handles) handle.release()
      root.traverse((object) => {
        if (object instanceof Mesh) object.geometry.dispose()
      })
    },
  }
}

export interface WallPreview {
  readonly scene: Scene
  readonly root: Group
  readonly camera: PerspectiveCamera
  update(deltaSeconds: number): void
  dispose(): void
}

/**
 * The group's shared capture rig, matching the modular kit's existing lighting
 * exactly. A wall photographed under its own lights cannot be compared to the
 * shell it is meant to join.
 */
export function createWallPreview(
  model: WallModel,
  envelope: WallEnvelope,
  options: { aspect?: number; distance?: number; yaw?: number; pitch?: number } = {},
): WallPreview {
  const scene = new Scene()
  scene.background = new Color(0x04070a)
  scene.add(model.root)
  scene.add(new HemisphereLight(0xa8bbc5, 0x07090c, 0.86))
  const key = new DirectionalLight(0xffedd6, 2.5)
  key.position.set(-7, 10, 11)
  scene.add(key)
  const fill = new DirectionalLight(0x758bd0, 0.9)
  fill.position.set(9, 5, 6)
  scene.add(fill)
  const rim = new DirectionalLight(0x82aabd, 0.72)
  rim.position.set(6, 8, -9)
  scene.add(rim)

  const span = Math.max(envelope.width, envelope.depth, envelope.height)
  const target = new Vector3(0, envelope.height * 0.48, 0)
  const distance = options.distance ?? span * 1.55 + 2.2
  const yaw = options.yaw ?? -0.66
  const pitch = options.pitch ?? 0.2
  const aspect = Number.isFinite(options.aspect) && (options.aspect ?? 0) > 0 ? options.aspect! : 1

  const camera = new PerspectiveCamera(34, aspect, 0.08, 200)
  camera.position.set(
    target.x + Math.sin(yaw) * Math.cos(pitch) * distance,
    target.y + Math.sin(pitch) * distance,
    target.z + Math.cos(yaw) * Math.cos(pitch) * distance,
  )
  camera.lookAt(target)
  scene.add(camera)

  return {
    scene,
    root: model.root,
    camera,
    update: (deltaSeconds: number) => model.update(deltaSeconds),
    dispose: () => {
      scene.remove(model.root)
      model.dispose()
    },
  }
}

export { KIT_BUILD, type KitMaterials, type WallFace } from '../axiom-modular-kit/parts.ts'
export type { WallSectionOptions } from '../axiom-modular-kit/layout.ts'
