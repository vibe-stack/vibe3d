// f1-lollipop-board — the "stop/go" paddle a mechanic holds up at the front of the car during a pit stop:
// a tall pole topped by a flat paddle disc with a rounded rim, built as a lathe revolve. The paddle's
// face colour is the whole point of the prop — teams repaint it, so it's exposed as a real material slot
// rather than a fixed decal. No moving parts, no numeric config; only the two materials vary.
// Ported from a private racing project's pit-stop choreography prop.

import {
  CylinderGeometry,
  DirectionalLight,
  Group,
  HemisphereLight,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  Scene,
  type Material,
} from 'three/webgpu'

import { revolve } from '../f1-kit-core/sculpt.ts'
import { ResourceBag } from '../f1-kit-core/resourceBag.ts'

// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- no numeric params, only materials vary
export interface F1LollipopBoardConfig {}

export interface F1LollipopBoardOptions extends Partial<F1LollipopBoardConfig> {
  materials?: Partial<Record<'pole' | 'paddle', Material>>
}

export interface F1LollipopBoardInstance {
  readonly root: Group
  readonly parts: { pole: Group; paddle: Group }
  readonly materials: Readonly<Record<'pole' | 'paddle', Material>>
  getConfig(): Readonly<F1LollipopBoardConfig>
  configure(patch: Partial<F1LollipopBoardConfig>): void
  setMaterial(slot: 'pole' | 'paddle', material: Material): void
  update(deltaSeconds: number): void
  dispose(): void
}

export function createModel(options: F1LollipopBoardOptions = {}): F1LollipopBoardInstance {
  const config: F1LollipopBoardConfig = {}

  const bag = new ResourceBag()
  const poleMat = (options.materials?.pole ?? bag.mat(new MeshStandardMaterial({ color: 0xdddddd, metalness: 0.3, roughness: 0.5 }))) as Material
  const paddleMat = (options.materials?.paddle ?? bag.mat(new MeshStandardMaterial({ color: 0xf2c018, metalness: 0.0, roughness: 0.6 }))) as Material
  const materialSlots: Record<'pole' | 'paddle', Material> = { pole: poleMat, paddle: paddleMat }

  const root = new Group()
  root.name = 'f1-lollipop-board'
  const pole = new Group(); pole.name = 'pole'
  const paddle = new Group(); paddle.name = 'paddle'
  root.add(pole, paddle)

  // Track every mesh that uses a given material slot, so setMaterial can reassign all of them at once.
  const meshesBySlot: Record<'pole' | 'paddle', Mesh[]> = { pole: [], paddle: [] }

  const poleMesh = new Mesh(bag.geo(new CylinderGeometry(0.03, 0.03, 2.3, 10)), materialSlots.pole)
  poleMesh.position.y = 1.15
  poleMesh.castShadow = true
  meshesBySlot.pole.push(poleMesh)
  pole.add(poleMesh)

  // HERO: the paddle disc — a thin flat lathe revolve with a rounded rim (not a plain flat cylinder).
  const paddleGeo = revolve([[0, 0.32], [0.35, 0.34], [0.65, 0.34], [1, 0.3]], { yBot: 0, yTop: 0.06, segments: 40 })
  const paddleMesh = new Mesh(bag.geo(paddleGeo), materialSlots.paddle)
  paddleMesh.rotation.x = Math.PI / 2
  paddleMesh.position.set(0, 2.35, 0.02)
  paddleMesh.castShadow = true
  meshesBySlot.paddle.push(paddleMesh)
  paddle.add(paddleMesh)

  return {
    root,
    parts: { pole, paddle },
    materials: materialSlots,
    getConfig: () => ({ ...config }),
    configure() {
      // No numeric config — only materials vary on this prop.
    },
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
  key.position.set(-2, 4, 3)
  scene.add(key)
  const camera = new PerspectiveCamera(32, aspect, 0.05, 30)
  camera.position.set(3.2, 1.6, 3.2)
  camera.lookAt(0, 1.3, 0)
  scene.add(camera)
  return { scene, root: model.root, camera, update: model.update, dispose: model.dispose }
}
