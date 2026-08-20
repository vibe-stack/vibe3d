// f1-bollard — short steel post with a reflective shell ring.

import { BufferGeometry, Group, Mesh, type Material } from 'three/webgpu'

import {
  acquireF1Materials,
  bevelBox,
  bevelRing,
  createF1Preview,
  disposeF1Materials,
  mergeParts,
  tubeSection,
  AXIS_Y,
} from '../f1-kit-core/index.ts'

type Slot = 'post' | 'ring'

export interface F1BollardConfig {
  height: number
}

export interface F1BollardOptions extends Partial<F1BollardConfig> {
  materials?: Partial<Record<Slot, Material>>
}

export interface F1BollardInstance {
  readonly root: Group
  readonly parts: { post: Group; ring: Group }
  readonly materials: Readonly<Record<Slot, Material>>
  getConfig(): Readonly<F1BollardConfig>
  configure(patch: Partial<F1BollardConfig>): void
  setMaterial(slot: Slot, material: Material): void
  update(deltaSeconds: number): void
  dispose(): void
}

const defaults: F1BollardConfig = { height: 0.9 }

export function createModel(options: F1BollardOptions = {}): F1BollardInstance {
  const config: F1BollardConfig = {
    height: Math.max(0.5, options.height ?? defaults.height),
  }

  const bundle = acquireF1Materials()
  const kit = bundle.materials
  const materialSlots: Record<Slot, Material> = {
    post: options.materials?.post ?? kit.steel,
    ring: options.materials?.ring ?? kit.shell,
  }

  const root = new Group(); root.name = 'f1-bollard'
  const post = new Group(); post.name = 'post'
  const ring = new Group(); ring.name = 'ring'
  root.add(post, ring)

  const generated: BufferGeometry[] = []
  const meshesBySlot: Record<Slot, Mesh[]> = { post: [], ring: [] }

  const releaseGenerated = (): void => {
    post.clear(); ring.clear()
    for (const geometry of generated) geometry.dispose()
    generated.length = 0
    for (const slot of Object.keys(meshesBySlot) as Slot[]) meshesBySlot[slot].length = 0
  }

  const emit = (slot: Slot, geometry: BufferGeometry, group: Group, name: string): void => {
    generated.push(geometry)
    const mesh = new Mesh(geometry, materialSlots[slot])
    mesh.name = name
    mesh.castShadow = true
    mesh.receiveShadow = true
    meshesBySlot[slot].push(mesh)
    group.add(mesh)
  }

  const rebuild = (): void => {
    releaseGenerated()
    const h = config.height
    const parts: BufferGeometry[] = []
    parts.push(tubeSection(0.045, h - 0.08, [0, (h - 0.08) / 2 + 0.06, 0], AXIS_Y, 12))
    parts.push(bevelBox(0.16, 0.06, 0.16, 0.008).translate(0, 0.03, 0))
    emit('post', mergeParts(parts, 'post'), post, 'post')
    const band = bevelRing(0.052, 0.068, 0.05, 0.004, 14)
    band.translate(0, h * 0.62, 0)
    emit('ring', band, ring, 'reflective')
  }
  rebuild()

  return {
    root,
    parts: { post, ring },
    materials: materialSlots,
    getConfig: () => ({ ...config }),
    configure(patch) {
      if (patch.height !== undefined) config.height = Math.max(0.5, patch.height)
      rebuild()
    },
    setMaterial(slot, material) {
      materialSlots[slot] = material
      for (const mesh of meshesBySlot[slot]) mesh.material = material
    },
    update: () => {},
    dispose() {
      releaseGenerated()
      disposeF1Materials(bundle)
      root.removeFromParent()
    },
  }
}

export function createPreview({ aspect }: { aspect: number; time?: number }) {
  return createF1Preview(createModel(), {
    aspect,
    target: [0, 0.45, 0],
    distance: 2.2,
    fov: 28,
    yaw: -0.5,
    pitch: 0.08,
  })
}
