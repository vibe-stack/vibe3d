// f1-parc-ferme — low crowd-fence rectangle enclosure.

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

export interface F1ParcFermeConfig {
  bays: number
}

export interface F1ParcFermeOptions extends Partial<F1ParcFermeConfig> {
  materials?: Partial<Record<Slot, Material>>
}

export interface F1ParcFermeInstance {
  readonly root: Group
  readonly parts: { posts: Group; rails: Group }
  readonly materials: Readonly<Record<Slot, Material>>
  getConfig(): Readonly<F1ParcFermeConfig>
  configure(patch: Partial<F1ParcFermeConfig>): void
  setMaterial(slot: Slot, material: Material): void
  update(deltaSeconds: number): void
  dispose(): void
}

const defaults: F1ParcFermeConfig = { bays: 4 }
const PITCH = 2.0
const HEIGHT = 1.1
const DEPTH = 6.0

export function createModel(options: F1ParcFermeOptions = {}): F1ParcFermeInstance {
  const config: F1ParcFermeConfig = {
    bays: Math.max(2, Math.round(options.bays ?? defaults.bays)),
  }

  const bundle = acquireF1Materials()
  const kit = bundle.materials
  const materialSlots: Record<Slot, Material> = {
    post: options.materials?.post ?? kit.graphite,
    rail: options.materials?.rail ?? kit.shell,
  }

  const root = new Group(); root.name = 'f1-parc-ferme'
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
    const bays = config.bays
    const span = bays * PITCH
    const half = span / 2
    const halfD = DEPTH / 2
    const postParts: BufferGeometry[] = []
    for (let i = 0; i <= bays; i++) {
      const x = -half + i * PITCH
      postParts.push(tubeSection(0.022, HEIGHT, [x, HEIGHT / 2, halfD], AXIS_Y, 10))
      postParts.push(tubeSection(0.022, HEIGHT, [x, HEIGHT / 2, -halfD], AXIS_Y, 10))
    }
    for (let i = 0; i <= Math.round(DEPTH / PITCH); i++) {
      const z = -halfD + i * PITCH
      postParts.push(tubeSection(0.022, HEIGHT, [-half, HEIGHT / 2, z], AXIS_Y, 10))
      postParts.push(tubeSection(0.022, HEIGHT, [half, HEIGHT / 2, z], AXIS_Y, 10))
    }
    emit('post', mergeParts(postParts, 'posts'), posts, 'posts')
    const railParts: BufferGeometry[] = []
    for (const y of [0.35, 0.72, HEIGHT - 0.04]) {
      railParts.push(bevelBox(span + 0.04, 0.03, 0.03, 0.004).translate(0, y, halfD))
      railParts.push(bevelBox(span + 0.04, 0.03, 0.03, 0.004).translate(0, y, -halfD))
      railParts.push(bevelBox(0.03, 0.03, DEPTH + 0.04, 0.004).translate(-half, y, 0))
      railParts.push(bevelBox(0.03, 0.03, DEPTH + 0.04, 0.004).translate(half, y, 0))
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
      if (patch.bays !== undefined) config.bays = Math.max(2, Math.round(patch.bays))
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
  return createF1Preview(createModel({ bays: 3 }), {
    aspect,
    target: [0, 0.55, 0],
    distance: 10,
    fov: 32,
    yaw: -0.8,
    pitch: 0.35,
  })
}
