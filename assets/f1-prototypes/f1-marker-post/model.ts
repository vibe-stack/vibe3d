// f1-marker-post — red/white striped stake in the runoff. Not f1-brake-marker (100/150 boards).

import { BufferGeometry, Group, Mesh, type Material } from 'three/webgpu'

import {
  acquireF1Materials,
  bevelBox,
  createF1Preview,
  disposeF1Materials,
  mergeParts,
  tubeSection,
  AXIS_Y,
} from '../f1-kit-core/index.ts'

type Slot = 'post' | 'stripe'

export interface F1MarkerPostConfig {
  height: number
}

export interface F1MarkerPostOptions extends Partial<F1MarkerPostConfig> {
  materials?: Partial<Record<Slot, Material>>
}

export interface F1MarkerPostInstance {
  readonly root: Group
  readonly parts: { post: Group; stripes: Group }
  readonly materials: Readonly<Record<Slot, Material>>
  getConfig(): Readonly<F1MarkerPostConfig>
  configure(patch: Partial<F1MarkerPostConfig>): void
  setMaterial(slot: Slot, material: Material): void
  update(deltaSeconds: number): void
  dispose(): void
}

const defaults: F1MarkerPostConfig = { height: 1.2 }

export function createModel(options: F1MarkerPostOptions = {}): F1MarkerPostInstance {
  const config: F1MarkerPostConfig = {
    height: Math.max(0.6, options.height ?? defaults.height),
  }

  const bundle = acquireF1Materials()
  const kit = bundle.materials
  const materialSlots: Record<Slot, Material> = {
    post: options.materials?.post ?? kit.shell,
    stripe: options.materials?.stripe ?? kit.red,
  }

  const root = new Group()
  root.name = 'f1-marker-post'
  const post = new Group(); post.name = 'post'
  const stripes = new Group(); stripes.name = 'stripes'
  root.add(post, stripes)

  const generated: BufferGeometry[] = []
  const meshesBySlot: Record<Slot, Mesh[]> = { post: [], stripe: [] }

  const releaseGenerated = (): void => {
    post.clear(); stripes.clear()
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
    emit('post', tubeSection(0.04, h, [0, h / 2, 0], AXIS_Y, 12), post, 'stake')
    const bands: BufferGeometry[] = []
    const band = 0.12
    for (let y = band; y < h - 0.08; y += band * 2) {
      const ring = tubeSection(0.046, band - 0.01, [0, y, 0], AXIS_Y, 12)
      bands.push(ring)
    }
    emit('stripe', mergeParts(bands, 'stripes'), stripes, 'stripes')
  }
  rebuild()

  return {
    root,
    parts: { post, stripes },
    materials: materialSlots,
    getConfig: () => ({ ...config }),
    configure(patch) {
      if (patch.height !== undefined) config.height = Math.max(0.6, patch.height)
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
    target: [0, 0.6, 0],
    distance: 2.6,
    fov: 28,
    yaw: -0.7,
    pitch: 0.12,
  })
}
