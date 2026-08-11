import {
  Color,
  DirectionalLight,
  Group,
  HemisphereLight,
  PerspectiveCamera,
  Scene,
} from 'three/webgpu'

import { MODULE_SPECS, type KitModuleId, type KitSocket } from './contract.ts'
import { finishPrefab, type PrefabController, type PrefabPreview } from './prefab.ts'
import { createKitMaterials, type KitMaterials } from './parts.ts'

/** Finish a loose kit component with the same materials, wear and ownership as a layout prefab. */
export function createAxiomComponent(
  moduleId: KitModuleId,
  sockets: readonly KitSocket[],
  author: (root: Group, materials: KitMaterials) => void,
): PrefabController {
  const acquired = createKitMaterials()
  const root = new Group()
  author(root, acquired.materials)
  return finishPrefab(moduleId, root, sockets, acquired)
}

export function createAxiomComponentPreview(
  options: { aspect: number },
  moduleId: KitModuleId,
  factory: () => PrefabController,
): PrefabPreview {
  const controller = factory()
  const spec = MODULE_SPECS[moduleId]
  const scene = new Scene()
  scene.name = `${moduleId} / Axiom component preview`
  scene.background = new Color(0x000000)
  scene.add(controller.root, new HemisphereLight(0x8ea3b2, 0x0a0c10, 0.28))
  const key = new DirectionalLight(0xfff2e2, 1.2)
  key.position.set(-5, 8, 7)
  const fill = new DirectionalLight(0x87a6c4, 0.34)
  fill.position.set(8, 4, 5)
  const rim = new DirectionalLight(0x9fb8cc, 0.4)
  rim.position.set(4, 7, -9)
  scene.add(key, fill, rim)
  const aspect = Number.isFinite(options.aspect) && options.aspect > 0 ? options.aspect : 1
  const reach = Math.max(spec.width, spec.height, spec.depth)
  const camera = new PerspectiveCamera(28, aspect, 0.05, 80)
  camera.position.set(spec.width + reach * 1.35, spec.height * 0.72, reach * 1.9)
  camera.lookAt(spec.width / 2, spec.height * 0.5, -spec.depth / 2)
  scene.add(camera)
  return {
    scene,
    root: controller.root,
    camera,
    update: controller.update,
    dispose: () => { scene.remove(controller.root); controller.dispose() },
  }
}
