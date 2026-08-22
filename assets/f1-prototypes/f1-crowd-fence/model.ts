// f1-crowd-fence — 1.1 m spectator weldmesh. Not f1-catch-fence (car debris, 5 m).
// Identity is the see-through mesh, not a three-rail paddock fence.

import { BufferGeometry, Group, Mesh, Vector3, type Material } from 'three/webgpu'

import {
  acquireF1Materials,
  bevelBox,
  createF1Preview,
  disposeF1Materials,
  member,
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
const MESH = 0.055

export function createModel(options: F1CrowdFenceOptions = {}): F1CrowdFenceInstance {
  const config: F1CrowdFenceConfig = {
    length: Math.max(PITCH, options.length ?? defaults.length),
  }

  const bundle = acquireF1Materials()
  const kit = bundle.materials
  const materialSlots: Record<Slot, Material> = {
    post: options.materials?.post ?? kit.graphite,
    rail: options.materials?.rail ?? kit.steel,
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
    const bays = Math.max(1, Math.round(config.length / PITCH))
    const span = bays * PITCH
    const half = span / 2
    const postParts: BufferGeometry[] = []
    for (let i = 0; i <= bays; i++) {
      const x = -half + i * PITCH
      postParts.push(tubeSection(0.024, HEIGHT, [x, HEIGHT / 2, 0], AXIS_Y, 10))
      const foot = bevelBox(0.14, 0.04, 0.14, 0.006)
      foot.translate(x, 0.02, 0)
      postParts.push(foot)
      const cap = bevelBox(0.06, 0.03, 0.06, 0.004)
      cap.translate(x, HEIGHT + 0.01, 0)
      postParts.push(cap)
    }
    emit('post', mergeParts(postParts, 'posts'), posts, 'posts')

    const railParts: BufferGeometry[] = []
    for (const y of [0.08, HEIGHT - 0.04]) {
      const rail = bevelBox(span + 0.04, 0.032, 0.032, 0.004)
      rail.translate(0, y, 0)
      railParts.push(rail)
    }
    const meshH0 = 0.12
    const meshH1 = HEIGHT - 0.08
    const verts = Math.max(12, Math.round(span / MESH))
    for (let i = 0; i < verts; i++) {
      const x = -half + (i + 0.5) * (span / verts)
      railParts.push(member(
        new Vector3(x, meshH0, 0),
        new Vector3(x, meshH1, 0),
        0.005,
        5,
      ))
    }
    const horiz = Math.max(6, Math.round((meshH1 - meshH0) / MESH))
    for (let j = 0; j < horiz; j++) {
      const y = meshH0 + (j + 0.5) * ((meshH1 - meshH0) / horiz)
      railParts.push(member(
        new Vector3(-half, y, 0),
        new Vector3(half, y, 0),
        0.0045,
        5,
      ))
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
    distance: 6.6,
    fov: 28,
    yaw: -1.05,
    pitch: 0.16,
  })
}
