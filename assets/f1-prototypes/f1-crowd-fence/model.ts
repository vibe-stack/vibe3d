// f1-crowd-fence — ~1.1 m pedestrian barrier. Not f1-catch-fence (car debris, 5 m).

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

type Slot = 'post' | 'rail'

export interface F1CrowdFenceConfig {
  length: number
}

export interface F1CrowdFenceOptions extends Partial<F1CrowdFenceConfig> {
  materials?: Partial<Record<Slot, Material>>
}

export interface F1CrowdFenceInstance {
  readonly root: Group
  readonly parts: { posts: Group; rails: Group }
  readonly materials: Readonly<Record<Slot, Material>>
  getConfig(): Readonly<F1CrowdFenceConfig>
  configure(patch: Partial<F1CrowdFenceConfig>): void
  setMaterial(slot: Slot, material: Material): void
  update(deltaSeconds: number): void
  dispose(): void
}

const defaults: F1CrowdFenceConfig = { length: 8 }
const HEIGHT = 1.1
const PITCH = 2.0

export function createModel(options: F1CrowdFenceOptions = {}): F1CrowdFenceInstance {
  const config: F1CrowdFenceConfig = {
    length: Math.max(PITCH, options.length ?? defaults.length),
  }

  const bundle = acquireF1Materials()
  const kit = bundle.materials
  const materialSlots: Record<Slot, Material> = {
    post: options.materials?.post ?? kit.graphite,
    rail: options.materials?.rail ?? kit.shell,
  }

  const root = new Group()
  root.name = 'f1-crowd-fence'
  const posts = new Group(); posts.name = 'posts'
  const rails = new Group(); rails.name = 'rails'
  root.add(posts, rails)

  const generated: BufferGeometry[] = []
  const meshesBySlot: Record<Slot, Mesh[]> = { post: [], rail: [] }

  const releaseGenerated = (): void => {
    posts.clear(); rails.clear()
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
    const length = config.length
    const bays = Math.max(1, Math.round(length / PITCH))
    const span = bays * PITCH
    const half = span / 2
    const postParts: BufferGeometry[] = []
    for (let i = 0; i <= bays; i++) {
      const x = -half + i * PITCH
      postParts.push(tubeSection(0.022, HEIGHT, [x, HEIGHT / 2, 0], AXIS_Y, 10))
      const foot = bevelBox(0.12, 0.04, 0.12, 0.006)
      foot.translate(x, 0.02, 0)
      postParts.push(foot)
    }
    emit('post', mergeParts(postParts, 'posts'), posts, 'posts')
    const railParts: BufferGeometry[] = []
    for (const y of [0.38, 0.72, HEIGHT - 0.04]) {
      const rail = bevelBox(span + 0.04, 0.03, 0.03, 0.004)
      rail.translate(0, y, 0)
      railParts.push(rail)
    }
    emit('rail', mergeParts(railParts, 'rails'), rails, 'rails')
  }
  rebuild()

  return {
    root,
    parts: { posts, rails },
    materials: materialSlots,
    getConfig: () => ({ ...config }),
    configure(patch) {
      if (patch.length !== undefined) config.length = Math.max(PITCH, patch.length)
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
  return createF1Preview(createModel({ length: 6 }), {
    aspect,
    target: [0, 0.55, 0],
    distance: 7.2,
    fov: 28,
    yaw: -1.05,
    pitch: 0.14,
  })
}
