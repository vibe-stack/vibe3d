// f1-bollard — yellow PE paddock bollard with reflective rings and a dome cap.
// Not a bare steel stub.

import { BufferGeometry, Group, Mesh, type Material } from 'three/webgpu'

import {
  acquireF1Materials,
  bevelBox,
  bevelDisc,
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
    post: options.materials?.post ?? kit.amber,
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

  const emit = (slot: Slot, geometry: BufferGeometry, group: Group, name: string, material?: Material): void => {
    generated.push(geometry)
    const mesh = new Mesh(geometry, material ?? materialSlots[slot])
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
    parts.push(tubeSection(0.055, h - 0.1, [0, (h - 0.1) / 2 + 0.06, 0], AXIS_Y, 14))
    parts.push(bevelBox(0.2, 0.07, 0.2, 0.01).translate(0, 0.035, 0))
    const cap = bevelDisc(0.058, 0.045, 0.008, 16)
    cap.rotateX(-Math.PI / 2)
    cap.translate(0, h - 0.02, 0)
    parts.push(cap)
    emit('post', mergeParts(parts, 'post'), post, 'post')

    const bands: BufferGeometry[] = []
    for (const t of [0.28, 0.5, 0.72] as const) {
      const band = bevelRing(0.056, 0.072, 0.055, 0.004, 16)
      band.translate(0, h * t, 0)
      bands.push(band)
    }
    emit('ring', mergeParts(bands, 'reflective'), ring, 'reflective')
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
    distance: 2.0,
    fov: 26,
    yaw: -0.45,
    pitch: 0.1,
  })
}
