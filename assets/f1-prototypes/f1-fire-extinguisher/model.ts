// f1-fire-extinguisher — a domed-top cylinder body (lathe revolve) with a valve/handle head and a curved
// hose sweeping down to a nozzle. Static garage-dressing prop (no animation). The safety-red body color is
// a universal fire-equipment convention (not team branding) and is kept as the default, but is still exposed
// as the `body` material slot for recoloring. Ported from a private racing project's pit-garage prop set.

import {
  BoxGeometry,
  BufferGeometry,
  CylinderGeometry,
  DirectionalLight,
  Group,
  HemisphereLight,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  Scene,
  Vector3,
  type Material,
} from 'three/webgpu'

import { revolve, taperedTube } from '../f1-kit-core/sculpt.ts'
import { ResourceBag } from '../f1-kit-core/resourceBag.ts'

export interface F1FireExtinguisherConfig {}

export interface F1FireExtinguisherOptions extends Partial<F1FireExtinguisherConfig> {
  materials?: Partial<Record<'body' | 'hardware' | 'hose', Material>>
}

export interface F1FireExtinguisherInstance {
  readonly root: Group
  readonly parts: { body: Group; hose: Group }
  readonly materials: Readonly<Record<'body' | 'hardware' | 'hose', Material>>
  getConfig(): Readonly<F1FireExtinguisherConfig>
  configure(patch: Partial<F1FireExtinguisherConfig>): void
  setMaterial(slot: 'body' | 'hardware' | 'hose', material: Material): void
  update(deltaSeconds: number): void
  dispose(): void
}

export function createModel(options: F1FireExtinguisherOptions = {}): F1FireExtinguisherInstance {
  const config: F1FireExtinguisherConfig = {}

  const bag = new ResourceBag()
  // Safety-equipment red — universal fire-extinguisher convention, not team branding.
  const body = (options.materials?.body ?? bag.mat(new MeshStandardMaterial({ color: 0xcc1417, roughness: 0.45, metalness: 0.25 }))) as Material
  const hardware = (options.materials?.hardware ?? bag.mat(new MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.55, metalness: 0.45 }))) as Material
  const hose = (options.materials?.hose ?? bag.mat(new MeshStandardMaterial({ color: 0x0d0d0d, roughness: 0.8, metalness: 0 }))) as Material
  const materialSlots: Record<'body' | 'hardware' | 'hose', Material> = { body, hardware, hose }

  const root = new Group()
  root.name = 'f1-fire-extinguisher'
  const bodyGroup = new Group(); bodyGroup.name = 'body'
  const hoseGroup = new Group(); hoseGroup.name = 'hose'
  root.add(bodyGroup, hoseGroup)

  // Track every mesh that uses a given material slot, so setMaterial can reassign all of them at once.
  const meshesBySlot: Record<'body' | 'hardware' | 'hose', Mesh[]> = { body: [], hardware: [], hose: [] }
  const meshOf = (slot: keyof typeof meshesBySlot, geometry: BufferGeometry, group: Group): Mesh => {
    const mesh = new Mesh(geometry, materialSlots[slot])
    meshesBySlot[slot].push(mesh)
    group.add(mesh)
    return mesh
  }

  // Cylinder body with a domed top, revolved from a half-profile.
  const cylinder = meshOf(
    'body',
    bag.geo(
      revolve(
        [[0, 0.0], [0.03, 0.13], [0.08, 0.15], [0.8, 0.15], [0.9, 0.13], [0.97, 0.07], [1, 0.05]],
        { yBot: 0, yTop: 0.62, segments: 32 },
      ),
    ),
    bodyGroup,
  )
  cylinder.castShadow = true
  cylinder.receiveShadow = true

  const neck = meshOf('hardware', bag.geo(new CylinderGeometry(0.045, 0.05, 0.085, 16)), bodyGroup)
  neck.position.y = 0.652 // the neck bites up into the valve rather than meeting its underside coplanar
  neck.castShadow = true

  const valve = meshOf('hardware', bag.geo(new BoxGeometry(0.13, 0.08, 0.09)), bodyGroup)
  valve.position.y = 0.72
  valve.castShadow = true

  const handle = meshOf('hardware', bag.geo(new BoxGeometry(0.17, 0.025, 0.05)), bodyGroup)
  handle.position.set(0.02, 0.79, 0)
  handle.rotation.z = 0.12
  handle.castShadow = true

  const hoseMesh = meshOf(
    'hose',
    bag.geo(
      taperedTube(
        [
          new Vector3(0.06, 0.74, 0.02),
          new Vector3(0.2, 0.62, 0.06),
          new Vector3(0.19, 0.36, -0.04),
          new Vector3(0.1, 0.2, 0.05),
        ],
        0.02,
        8,
      ),
    ),
    hoseGroup,
  )
  hoseMesh.castShadow = true

  const nozzle = meshOf('hardware', bag.geo(new CylinderGeometry(0.02, 0.03, 0.12, 10)), hoseGroup)
  nozzle.position.set(0.1, 0.185, 0.05) // meet the hose terminus instead of hanging 0.06 below it
  nozzle.rotation.x = 0.5
  nozzle.castShadow = true

  return {
    root,
    parts: { body: bodyGroup, hose: hoseGroup },
    materials: materialSlots,
    getConfig: () => ({ ...config }),
    configure() {},
    setMaterial(slot, material) {
      materialSlots[slot] = material
      for (const mesh of meshesBySlot[slot]) mesh.material = material
    },
    update: () => {},
    dispose() {
      bag.dispose()
      root.removeFromParent()
    },
  }
}

export function createPreview({ aspect }: { aspect: number; time?: number }) {
  const model = createModel()
  const scene = new Scene()
  scene.add(model.root, new HemisphereLight(0x8ea3b2, 0x0a0c10, 0.6))
  const key = new DirectionalLight(0xfff2e2, 1.2)
  key.position.set(-2, 3, 2.5)
  scene.add(key)
  const camera = new PerspectiveCamera(30, aspect, 0.02, 20)
  camera.position.set(0.95, 0.65, 0.95)
  camera.lookAt(0.05, 0.35, 0)
  scene.add(camera)
  return { scene, root: model.root, camera, update: model.update, dispose: model.dispose }
}
