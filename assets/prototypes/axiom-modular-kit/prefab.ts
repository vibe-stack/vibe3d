import { Color, DirectionalLight, Group, HemisphereLight, Mesh, MeshPhysicalMaterial, PerspectiveCamera, Scene } from 'three/webgpu'
import {
  WEAR_ATTRIBUTES, bakeOcclusion, bakeSurfaceAttributes, createWearMaterial, mergeStaticByMaterial,
  type MaterialHandle, type Vec3, type WearProfile,
} from '../../../src/asset-forge/generator/index.ts'
import { MODULE_SPECS, annotateKitAsset, validateKitMetadata, type KitModuleId, type KitSocket } from './contract.ts'
import { buildLayout, layoutEnvelope, layoutSockets, type LayoutSpec } from './layout.ts'
import { createKitMaterials, type KitMaterialSet, type KitMaterials } from './parts.ts'

/**
 * Turns a grid layout into a finished prefab: geometry, baked cavity occlusion,
 * kit metadata, a merged material batch, and the standard preview rig.
 *
 * Every prefab in the kit goes through here, so they all share one exposure,
 * one camera solve and one wear treatment - the differences between them live
 * entirely in the plan.
 */

export interface PrefabController {
  readonly root: Group
  update(deltaSeconds: number): void
  dispose(): void
}

export interface PrefabPreview {
  readonly scene: Scene
  readonly root: Group
  readonly camera: PerspectiveCamera
  update(deltaSeconds: number): void
  dispose(): void
}

export type PrefabView = 'beauty' | 'side' | 'rear' | 'low'

export function createPrefab(moduleId: KitModuleId, spec: LayoutSpec): PrefabController {
  const acquired = createKitMaterials()
  const root = new Group()
  buildLayout(root, acquired.materials, spec)

  const authored = MODULE_SPECS[moduleId]
  const envelope = layoutEnvelope(spec.plan)
  if (envelope.width !== authored.width || envelope.depth !== authored.depth || envelope.height !== authored.height) {
    throw new Error(
      `${moduleId} plan yields a ${envelope.width} x ${envelope.depth} x ${envelope.height} m envelope but its public contract declares ${authored.width} x ${authored.depth} x ${authored.height} m`,
    )
  }
  return finishPrefab(moduleId, root, layoutSockets(spec), acquired)
}

/**
 * Shared tail end of every prefab, whether its geometry came from the layout
 * grid or was authored directly: kit metadata, cavity occlusion, and one merged
 * batch per material. Assets that are not room plans - the checkpoint gate -
 * build their own root and finish here, so they inherit the same surface
 * treatment as the buildings.
 */
export function finishPrefab(
  moduleId: KitModuleId, root: Group, sockets: readonly KitSocket[], acquired: KitMaterialSet,
): PrefabController {
  const m: KitMaterials = acquired.materials
  annotateKitAsset(root, moduleId, sockets)
  validateKitMetadata(root)

  // A nearly clean asset: contact darkening in the seams and recesses does all
  // the work, so every profile is grime and rub free and the bake supplies
  // cavity occlusion only. Ink stays off the wear graph - it only appears
  // inside cut channels, where the procedural flake reads as speckled noise.
  const clean: WearProfile = { rub: 0.03, grime: 0.07, scratch: 0.01 }
  const profiles = new Map<MeshPhysicalMaterial, WearProfile>([
    [m.shell, clean], [m.graphite, clean], [m.deck, clean], [m.steel, clean], [m.accent, clean],
  ])
  root.updateMatrixWorld(true)
  bakeOcclusion(root, { reach: 0.3 })
  bakeSurfaceAttributes(root, profiles)
  const wear = createWearMaterial({ name: `${moduleId} / clean coated surface`, clearcoat: 0.06, clearcoatRoughness: 0.6 })
  root.traverse((object) => {
    if (object instanceof Mesh && !Array.isArray(object.material) && profiles.has(object.material as MeshPhysicalMaterial)) {
      object.material = wear
    }
  })
  const geometries = mergeStaticByMaterial(root, {
    retainedAttributes: (material) => (material === wear ? WEAR_ATTRIBUTES : []),
    meshName: (material) => `${moduleId} / ${material.name}`,
  })

  let elapsed = 0
  return {
    root,
    update: (deltaSeconds: number) => {
      elapsed += Math.min(Math.max(deltaSeconds, 0), 0.05)
      m.amber.emissiveIntensity = 0.82 + Math.sin(elapsed * 1.3) * 0.06
      m.cyan.emissiveIntensity = 0.78 + Math.sin(elapsed * 1.05 + 0.7) * 0.05
    },
    dispose: () => {
      for (const geometry of geometries) geometry.dispose()
      wear.dispose()
      for (const handle of acquired.handles as MaterialHandle[]) handle.release()
    },
  }
}

/**
 * The beauty camera is solved from the footprint rather than hand-placed: an
 * elevated three-quarter on the front-left corner, ~9 degrees off the front
 * normal and 45 degrees down, on a long lens so the bays stay square.
 */
function beautyCamera(aspect: number, width: number, depth: number): PerspectiveCamera {
  const target: Vec3 = [width / 2, 1.45, -depth / 2]
  const reach = Math.hypot(width, depth)
  const distance = reach * 2.9
  const azimuth = 0.16
  const pitch = 0.785
  const camera = new PerspectiveCamera(17, aspect, 0.5, distance * 4)
  camera.position.set(
    target[0] - Math.sin(azimuth) * Math.cos(pitch) * distance,
    target[1] + Math.sin(pitch) * distance,
    target[2] + Math.cos(azimuth) * Math.cos(pitch) * distance,
  )
  camera.lookAt(...target)
  return camera
}

export function createPrefabPreview(
  moduleId: KitModuleId, spec: LayoutSpec, options: { aspect: number }, view: PrefabView = 'beauty',
): PrefabPreview {
  const controller = createPrefab(moduleId, spec)
  const { width, depth } = layoutEnvelope(spec.plan)
  const scene = new Scene()
  scene.background = new Color(0x000000)
  scene.add(controller.root, new HemisphereLight(0x8ea3b2, 0x0a0c10, 0.28))
  const key = new DirectionalLight(0xfff2e2, 1.2)
  key.position.set(-7, 13, 9)
  const fill = new DirectionalLight(0x87a6c4, 0.34)
  fill.position.set(11, 5, 7)
  const rim = new DirectionalLight(0x9fb8cc, 0.4)
  rim.position.set(6, 9, -13)
  scene.add(key, fill, rim)

  const aspect = Number.isFinite(options.aspect) && options.aspect > 0 ? options.aspect : 1
  const reach = Math.hypot(width, depth)
  const target: Vec3 = [width / 2, 1.45, -depth / 2]
  let camera: PerspectiveCamera
  if (view === 'beauty') {
    camera = beautyCamera(aspect, width, depth)
  } else {
    const position: Vec3 = view === 'side'
      ? [width + reach * 1.1, 4.2, -depth / 2]
      : view === 'rear'
        ? [width * 0.7, 7, -depth - reach * 0.9]
        : [-reach * 0.35, 1.2, reach * 0.9]
    camera = new PerspectiveCamera(view === 'low' ? 34 : 26, aspect, 0.4, reach * 8)
    camera.position.set(...position)
    camera.lookAt(...target)
  }
  scene.add(camera)
  return {
    scene,
    root: controller.root,
    camera,
    update: controller.update,
    dispose: () => { scene.remove(controller.root); controller.dispose() },
  }
}

/** The four preview exports every prefab prototype publishes. */
export function prefabExports(moduleId: KitModuleId, spec: LayoutSpec) {
  return {
    createModel: (): PrefabController => createPrefab(moduleId, spec),
    createPreview: (options: { aspect: number }): PrefabPreview => createPrefabPreview(moduleId, spec, options, 'beauty'),
    createSidePreview: (options: { aspect: number }): PrefabPreview => createPrefabPreview(moduleId, spec, options, 'side'),
    createRearPreview: (options: { aspect: number }): PrefabPreview => createPrefabPreview(moduleId, spec, options, 'rear'),
    createLowPreview: (options: { aspect: number }): PrefabPreview => createPrefabPreview(moduleId, spec, options, 'low'),
  }
}
