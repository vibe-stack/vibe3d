import {
  Color,
  DirectionalLight,
  Group,
  HemisphereLight,
  Mesh,
  MeshPhysicalMaterial,
  PerspectiveCamera,
  Scene,
} from 'three/webgpu'

import {
  bakeOcclusion,
  bakeSurfaceAttributes,
  createWearMaterial,
  cylinder,
  MaterialLibrary,
  mergeStaticByMaterial,
  prism,
  tuneMaterial,
  WEAR_ATTRIBUTES,
  type MaterialHandle,
  type Vec3,
  type WearProfile,
} from '../../../src/asset-forge/generator/index.ts'

import {
  annotateKitAsset,
  MODULE_SPECS,
  validateKitMetadata,
  type KitEnvelope,
  type KitModuleId,
  type KitSocket,
} from '../axiom-modular-kit/contract.ts'

export { cylinder, prism }
export type { Vec3, KitSocket }

export interface KitMaterials {
  shell: MeshPhysicalMaterial
  shellShade: MeshPhysicalMaterial
  graphite: MeshPhysicalMaterial
  edge: MeshPhysicalMaterial
  steel: MeshPhysicalMaterial
  amber: MeshPhysicalMaterial
  cyan: MeshPhysicalMaterial
  grime: MeshPhysicalMaterial
}

export interface KitController {
  root: Group
  update: (deltaSeconds: number) => void
  dispose: () => void
}

export interface KitPreview {
  scene: Scene
  root: Group
  camera: PerspectiveCamera
  update: (deltaSeconds: number) => void
  dispose: () => void
}

export type KitView = 'beauty' | 'side' | 'rear' | 'low' | 'underside'

function acquireKitMaterials(label: string): { materials: KitMaterials; handles: MaterialHandle[] } {
  const library = new MaterialLibrary()
  const acquire = (recipeId: string, palette: string, seed: number, wear: number, dirt: number) =>
    library.acquire({ recipeId, palette, condition: 'maintained', wear, dirt, seed, uvScale: [2, 2] })
  const shell = acquire('MAT-02', 'SHELL-200', 3101, 0.05, 0.045)
  const shellShade = acquire('MAT-02', 'SHELL-200', 3102, 0.06, 0.06)
  const graphite = acquire('MAT-06', 'INK-950', 3103, 0.055, 0.08)
  const edge = acquire('MAT-06', 'GRAPHITE-800', 3104, 0.07, 0.065)
  const steel = acquire('MAT-11', 'SHELL-200', 3105, 0.09, 0.055)
  const amber = acquire('MAT-17', 'AMBER-400', 3106, 0.015, 0.01)
  const cyan = acquire('MAT-17', 'CYAN-400', 3107, 0.015, 0.01)
  const grime = acquire('MAT-06', 'INK-950', 3108, 0.02, 0.14)
  const materials = {
    shell: tuneMaterial(shell, 0xaeb5b3, 0.49, 0.3, { clearcoat: 0.1, clearcoatRoughness: 0.5 }),
    shellShade: tuneMaterial(shellShade, 0x6f7a7d, 0.55, 0.46, { clearcoat: 0.06 }),
    graphite: tuneMaterial(graphite, 0x0b1115, 0.59, 0.62),
    edge: tuneMaterial(edge, 0x293238, 0.38, 0.76, { clearcoat: 0.1 }),
    steel: tuneMaterial(steel, 0x768185, 0.27, 0.94, { clearcoat: 0.18 }),
    amber: tuneMaterial(amber, 0xffac26, 0.25, 0.08, { emissive: 1.5 }),
    cyan: tuneMaterial(cyan, 0x50dce3, 0.2, 0.04, { emissive: 1.35 }),
    grime: tuneMaterial(grime, 0x353633, 0.95, 0.08),
  }
  for (const material of Object.values(materials)) material.name = `${label} / ${material.name}`
  return { materials, handles: [shell, shellShade, graphite, edge, steel, amber, cyan, grime] }
}

export function add(parent: Group, ...meshes: Mesh[]): void {
  parent.add(...meshes)
}

export function addFastenerZ(parent: Group, material: MeshPhysicalMaterial, x: number, y: number, z: number, radius = 0.025): void {
  parent.add(cylinder(material, radius, 0.025, [x, y, z], [Math.PI / 2, 0, 0], 8))
}

export function addFastenerY(parent: Group, material: MeshPhysicalMaterial, x: number, y: number, z: number, radius = 0.025): void {
  parent.add(cylinder(material, radius, 0.025, [x, y, z], [0, 0, 0], 8))
}

export function buildKitController(
  moduleId: KitModuleId,
  sockets: readonly KitSocket[],
  author: (root: Group, materials: KitMaterials) => void,
): KitController {
  const { materials, handles } = acquireKitMaterials(moduleId)
  const wearMaterial = createWearMaterial({ name: `${moduleId} / form-aware maintained wear`, clearcoat: 0.1, clearcoatRoughness: 0.48 })
  const profiles = new Map<MeshPhysicalMaterial, WearProfile>([
    [materials.shell, { rub: 0.12, grime: 0.18, scratch: 0.012 }],
    [materials.shellShade, { rub: 0.15, grime: 0.24, scratch: 0.015 }],
  ])
  const root = new Group()
  root.name = moduleId
  author(root, materials)
  root.updateMatrixWorld(true)
  bakeOcclusion(root, { reach: 0.18 })
  bakeSurfaceAttributes(root, profiles)
  const worn = new Set(profiles.keys())
  root.traverse((object) => {
    if (object instanceof Mesh && !Array.isArray(object.material) && worn.has(object.material as MeshPhysicalMaterial)) object.material = wearMaterial
  })
  const mergedGeometries = mergeStaticByMaterial(root, {
    retainedAttributes: (resolved) => resolved === wearMaterial ? WEAR_ATTRIBUTES : [],
    meshName: (material) => `${moduleId} / ${material.name}`,
  })
  annotateKitAsset(root, moduleId, sockets)
  validateKitMetadata(root)
  return {
    root,
    update: () => {},
    dispose: () => {
      for (const geometry of mergedGeometries) geometry.dispose()
      for (const handle of handles) handle.release()
      wearMaterial.dispose()
    },
  }
}

function cameraFor(aspect: number, envelope: KitEnvelope, view: KitView): PerspectiveCamera {
  const c: Vec3 = [envelope.width / 2, envelope.height / 2, -envelope.depth / 2]
  const r = Math.max(envelope.width, envelope.height, envelope.depth)
  // Thin slabs and thresholds need a close grazing diagnostic rather than the
  // long wall-module stand-off, otherwise the depth ledger is unreadable.
  const sideScale = envelope.height < r * 0.35 ? 0.98 : 1.85
  const rearScale = envelope.height < r * 0.35 ? 1.08 : 2.1
  const lowScale = envelope.height < r * 0.35 ? 1.05 : 1.4
  const position: Vec3 = view === 'underside'
    ? [envelope.width + r * 1.2, -r * 1.25, r * 1.45]
    : view === 'side'
    ? [envelope.width + r * sideScale, Math.max(envelope.height * 0.62, r * 0.32), c[2]]
    : view === 'rear'
      ? [c[0], Math.max(envelope.height * 0.7, r * 0.38), -envelope.depth - r * rearScale]
      : view === 'low'
        ? [envelope.width + r * lowScale, Math.max(0.1, envelope.height * 0.16), r * 1.25]
        : [envelope.width + r * 1.25, Math.max(envelope.height + r * 0.65, r * 0.9), r * 1.75]
  const camera = new PerspectiveCamera(view === 'beauty' ? 30 : 32, aspect, 0.02, 80)
  camera.position.set(...position)
  camera.lookAt(...c)
  camera.updateProjectionMatrix()
  return camera
}

export function makeKitPreview(
  options: { aspect: number },
  moduleId: KitModuleId,
  factory: () => KitController,
  view: KitView,
): KitPreview {
  const controller = factory()
  const scene = new Scene()
  scene.name = `${moduleId} / ${view} preview`
  scene.background = new Color(0x000000)
  scene.add(controller.root)
  scene.add(new HemisphereLight(0x93a9b5, 0x05070a, 0.34))
  const key = new DirectionalLight(0xffedda, 2.45)
  key.position.set(6, 9, 10)
  const fill = new DirectionalLight(0x668ca8, 0.58)
  fill.position.set(-7, 5, 7)
  const rim = new DirectionalLight(0xa4bfd0, 0.92)
  rim.position.set(-5, 7, -8)
  scene.add(key, fill, rim)
  if (view === 'underside') {
    const undersideFill = new DirectionalLight(0xd8e5e9, 2.25)
    undersideFill.position.set(4, -8, 6)
    scene.add(undersideFill)
  }
  const camera = cameraFor(Number.isFinite(options.aspect) && options.aspect > 0 ? options.aspect : 1, MODULE_SPECS[moduleId], view)
  scene.add(camera)
  return {
    scene,
    root: controller.root,
    camera,
    update: controller.update,
    dispose: () => { scene.remove(controller.root); controller.dispose() },
  }
}

export function makeAssemblyPreview(
  options: { aspect: number },
  label: string,
  envelope: KitEnvelope,
  factory: () => KitController,
  view: KitView = 'beauty',
): KitPreview {
  const controller = factory()
  const scene = new Scene()
  scene.name = `${label} / ${view} compatibility preview`
  scene.background = new Color(0x000000)
  scene.add(controller.root)
  scene.add(new HemisphereLight(0x93a9b5, 0x05070a, 0.34))
  const key = new DirectionalLight(0xffedda, 2.45)
  key.position.set(6, 9, 10)
  const fill = new DirectionalLight(0x668ca8, 0.58)
  fill.position.set(-7, 5, 7)
  const rim = new DirectionalLight(0xa4bfd0, 0.92)
  rim.position.set(-5, 7, -8)
  scene.add(key, fill, rim)
  const camera = cameraFor(Number.isFinite(options.aspect) && options.aspect > 0 ? options.aspect : 1, envelope, view)
  scene.add(camera)
  return { scene, root: controller.root, camera, update: controller.update, dispose: () => { scene.remove(controller.root); controller.dispose() } }
}
