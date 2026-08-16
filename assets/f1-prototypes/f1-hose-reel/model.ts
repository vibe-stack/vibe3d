// f1-hose-reel — an air-hose reel: a drum (two round side plates + wound hose rings) on an A-frame
// stand, with a lead hose sweeping down to the floor. Static garage-dressing prop (no animation). The
// amber side plates are a generic hazard-equipment color, not team branding, and are kept as the default
// while still exposed as the `accent` material slot. Ported from a private racing project's pit-garage
// prop set.

import {
  BufferGeometry,
  CylinderGeometry,
  DirectionalLight,
  Group,
  HemisphereLight,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  Scene,
  TorusGeometry,
  Vector3,
  type Material,
} from 'three/webgpu'

import { taperedTube } from '../f1-kit-core/sculpt.ts'
import { ResourceBag } from '../f1-kit-core/resourceBag.ts'

export interface F1HoseReelConfig {}

export interface F1HoseReelOptions extends Partial<F1HoseReelConfig> {
  materials?: Partial<Record<'accent' | 'stand' | 'hose', Material>>
}

export interface F1HoseReelInstance {
  readonly root: Group
  readonly parts: { drum: Group; stand: Group; hose: Group }
  readonly materials: Readonly<Record<'accent' | 'stand' | 'hose', Material>>
  getConfig(): Readonly<F1HoseReelConfig>
  configure(patch: Partial<F1HoseReelConfig>): void
  setMaterial(slot: 'accent' | 'stand' | 'hose', material: Material): void
  update(deltaSeconds: number): void
  dispose(): void
}

export function createModel(options: F1HoseReelOptions = {}): F1HoseReelInstance {
  const config: F1HoseReelConfig = {}

  const bag = new ResourceBag()
  // Amber side plates — generic hazard-equipment color, not team branding.
  const accent = (options.materials?.accent ?? bag.mat(new MeshStandardMaterial({ color: 0xffb300, roughness: 0.5, metalness: 0.3 }))) as Material
  const stand = (options.materials?.stand ?? bag.mat(new MeshStandardMaterial({ color: 0x33383d, roughness: 0.5, metalness: 0.6 }))) as Material
  const hose = (options.materials?.hose ?? bag.mat(new MeshStandardMaterial({ color: 0x1c1c1c, roughness: 0.85, metalness: 0 }))) as Material
  const materialSlots: Record<'accent' | 'stand' | 'hose', Material> = { accent, stand, hose }

  const root = new Group()
  root.name = 'f1-hose-reel'
  const drum = new Group(); drum.name = 'drum'
  const standGroup = new Group(); standGroup.name = 'stand'
  const hoseGroup = new Group(); hoseGroup.name = 'hose'
  root.add(drum, standGroup, hoseGroup)

  // Track every mesh that uses a given material slot, so setMaterial can reassign all of them at once.
  const meshesBySlot: Record<'accent' | 'stand' | 'hose', Mesh[]> = { accent: [], stand: [], hose: [] }
  const meshOf = (slot: keyof typeof meshesBySlot, geometry: BufferGeometry, group: Group): Mesh => {
    const mesh = new Mesh(geometry, materialSlots[slot])
    meshesBySlot[slot].push(mesh)
    group.add(mesh)
    return mesh
  }

  // Drum: two round side plates plus wound hose (torus rings).
  for (const sx of [-1, 1] as const) {
    const plate = meshOf('accent', bag.geo(new CylinderGeometry(0.34, 0.34, 0.03, 28)), drum)
    plate.geometry.rotateZ(Math.PI / 2)
    plate.position.set(sx * 0.16, 0.55, 0)
    plate.castShadow = true
    plate.receiveShadow = true
  }
  for (let i = 0; i < 5; i++) {
    const r = 0.12 + i * 0.04
    const ring = meshOf('hose', bag.geo(new TorusGeometry(r, 0.03, 8, 24)), drum)
    ring.geometry.rotateY(Math.PI / 2)
    ring.position.y = 0.55
    ring.castShadow = true
  }

  // A-frame stand legs.
  for (const sx of [-1, 1] as const) {
    const leg = meshOf(
      'stand',
      bag.geo(
        taperedTube(
          [
            new Vector3(sx * 0.28, 0, 0.2),
            new Vector3(sx * 0.16, 0.55, 0),
            new Vector3(sx * 0.28, 0, -0.2),
          ],
          0.03,
          8,
        ),
      ),
      standGroup,
    )
    leg.castShadow = true
  }

  // Lead hose sweeping down to the floor.
  const lead = meshOf(
    'hose',
    bag.geo(
      taperedTube(
        [new Vector3(0.32, 0.55, 0), new Vector3(0.5, 0.3, 0.15), new Vector3(0.7, 0.04, 0.4)],
        0.028,
        8,
      ),
    ),
    hoseGroup,
  )
  lead.castShadow = true

  return {
    root,
    parts: { drum, stand: standGroup, hose: hoseGroup },
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
  camera.position.set(1.3, 0.85, 1.3)
  camera.lookAt(0.1, 0.35, 0)
  scene.add(camera)
  return { scene, root: model.root, camera, update: model.update, dispose: model.dispose }
}
