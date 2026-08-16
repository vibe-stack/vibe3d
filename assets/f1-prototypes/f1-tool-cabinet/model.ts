// f1-tool-cabinet — a rolling drawer chest: a rounded body on four casters, a work-surface top, and a
// stack of drawer faces with pull handles. Static garage-dressing prop (no animation). `configure({ width })`
// rebuilds the cabinet at a new width; drawer rows and caster spacing stay proportional. Ported from a
// private racing project's pit-garage prop set — the original defaulted the body to a team-branded red;
// this port defaults to a neutral industrial teal instead (still fully recolorable via the `body` slot).

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
  type Material,
} from 'three/webgpu'

import { ResourceBag } from '../f1-kit-core/resourceBag.ts'

export interface F1ToolCabinetConfig {
  /** Overall cabinet width (metres). Height and depth stay fixed proportions of the original prop. */
  width: number
}

export interface F1ToolCabinetOptions extends Partial<F1ToolCabinetConfig> {
  materials?: Partial<Record<'body' | 'top' | 'handle' | 'caster', Material>>
}

export interface F1ToolCabinetInstance {
  readonly root: Group
  readonly parts: { body: Group; drawers: Group; casters: Group }
  readonly materials: Readonly<Record<'body' | 'top' | 'handle' | 'caster', Material>>
  getConfig(): Readonly<F1ToolCabinetConfig>
  configure(patch: Partial<F1ToolCabinetConfig>): void
  setMaterial(slot: 'body' | 'top' | 'handle' | 'caster', material: Material): void
  update(deltaSeconds: number): void
  dispose(): void
}

const defaults: F1ToolCabinetConfig = { width: 0.9 }

const H = 1.05 // body height
const D = 0.6 // body depth
const ROWS = 4

export function createModel(options: F1ToolCabinetOptions = {}): F1ToolCabinetInstance {
  const config: F1ToolCabinetConfig = { width: Math.max(0.4, options.width ?? defaults.width) }

  const bag = new ResourceBag()
  // Neutral industrial teal default — the source prop's "Ferrari-ish red" would read as team branding.
  const body = (options.materials?.body ?? bag.mat(new MeshStandardMaterial({ color: 0x1f6f6b, roughness: 0.5, metalness: 0.3 }))) as Material
  const top = (options.materials?.top ?? bag.mat(new MeshStandardMaterial({ color: 0x2b2f34, roughness: 0.4, metalness: 0.6 }))) as Material
  const handle = (options.materials?.handle ?? bag.mat(new MeshStandardMaterial({ color: 0xd6d9dd, roughness: 0.35, metalness: 0.8 }))) as Material
  const caster = (options.materials?.caster ?? bag.mat(new MeshStandardMaterial({ color: 0x15181b, roughness: 0.8, metalness: 0.1 }))) as Material
  const materialSlots: Record<'body' | 'top' | 'handle' | 'caster', Material> = { body, top, handle, caster }

  const root = new Group()
  root.name = 'f1-tool-cabinet'
  const bodyGroup = new Group(); bodyGroup.name = 'body'
  const drawers = new Group(); drawers.name = 'drawers'
  const casters = new Group(); casters.name = 'casters'
  root.add(bodyGroup, drawers, casters)

  // Track every mesh that uses a given material slot, so setMaterial can reassign all of them at once.
  const meshesBySlot: Record<'body' | 'top' | 'handle' | 'caster', Mesh[]> = { body: [], top: [], handle: [], caster: [] }
  const meshOf = (slot: keyof typeof meshesBySlot, geometry: BufferGeometry): Mesh => {
    const mesh = new Mesh(geometry, materialSlots[slot])
    meshesBySlot[slot].push(mesh)
    return mesh
  }

  const clearGenerated = (): void => {
    for (const group of [bodyGroup, drawers, casters]) {
      group.traverse((object) => {
        if (object instanceof Mesh) object.geometry.dispose()
      })
      group.clear()
    }
    for (const key of Object.keys(meshesBySlot) as Array<keyof typeof meshesBySlot>) meshesBySlot[key] = []
  }

  const rebuild = (): void => {
    clearGenerated()
    const W = Math.max(0.4, config.width)

    const cabinet = meshOf('body', bag.geo(new BoxGeometry(W, H, D)))
    cabinet.position.y = H / 2 + 0.06
    cabinet.castShadow = true
    cabinet.receiveShadow = true
    bodyGroup.add(cabinet)

    const workTop = meshOf('top', bag.geo(new BoxGeometry(W + 0.04, 0.04, D + 0.04)))
    workTop.position.y = H + 0.08
    workTop.castShadow = true
    bodyGroup.add(workTop)

    for (let i = 0; i < ROWS; i++) {
      const y = 0.16 + (i * (H - 0.1)) / ROWS
      const face = meshOf('body', bag.geo(new BoxGeometry(W - 0.06, (H - 0.14) / ROWS - 0.03, 0.02)))
      face.position.set(0, y, D / 2 + 0.005)
      face.castShadow = true
      drawers.add(face)
      const pull = meshOf('handle', bag.geo(new BoxGeometry(W * 0.5, 0.03, 0.03)))
      pull.position.set(0, y + 0.06, D / 2 + 0.03)
      pull.castShadow = true
      drawers.add(pull)
    }

    for (const sx of [-1, 1] as const) {
      for (const sz of [-1, 1] as const) {
        const c = meshOf('caster', bag.geo(new CylinderGeometry(0.06, 0.06, 0.05, 12)))
        c.geometry.rotateX(Math.PI / 2)
        c.position.set(sx * (W / 2 - 0.1), 0.06, sz * (D / 2 - 0.1))
        c.castShadow = true
        casters.add(c)
      }
    }
  }
  rebuild()

  return {
    root,
    parts: { body: bodyGroup, drawers, casters },
    materials: materialSlots,
    getConfig: () => ({ ...config }),
    configure(patch) {
      if (patch.width !== undefined) config.width = Math.max(0.4, patch.width)
      rebuild()
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
  key.position.set(-2, 3, 2.5)
  scene.add(key)
  const camera = new PerspectiveCamera(30, aspect, 0.02, 20)
  camera.position.set(1.6, 1.1, 1.6)
  camera.lookAt(0, 0.55, 0)
  scene.add(camera)
  return { scene, root: model.root, camera, update: model.update, dispose: model.dispose }
}
