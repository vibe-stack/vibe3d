// f1-armco — a straight W-beam guardrail run: boxed posts and a three-fold corrugated rail,
// alternating red / shell bays the way a circuit Armco reads at speed.

import {
  BufferGeometry,
  Group,
  Mesh,
  type Material,
} from 'three/webgpu'

import {
  acquireF1Materials,
  bevelBox,
  bolt,
  createF1Preview,
  disposeF1Materials,
  mergeParts,
  AXIS_Y,
} from '../f1-kit-core/index.ts'

type Slot = 'post' | 'rail' | 'stripe'

export interface F1ArmcoConfig {
  /** Number of post-to-post bays. */
  bays: number
}

export interface F1ArmcoOptions extends Partial<F1ArmcoConfig> {
  materials?: Partial<Record<Slot, Material>>
}

export interface F1ArmcoInstance {
  readonly root: Group
  readonly parts: { posts: Group; rail: Group }
  readonly materials: Readonly<Record<Slot, Material>>
  getConfig(): Readonly<F1ArmcoConfig>
  configure(patch: Partial<F1ArmcoConfig>): void
  setMaterial(slot: Slot, material: Material): void
  update(deltaSeconds: number): void
  dispose(): void
}

const defaults: F1ArmcoConfig = { bays: 4 }
const PITCH = 2.0

function wBeam(length: number): BufferGeometry[] {
  const folds: BufferGeometry[] = []
  const parts: Array<{ y: number; z: number; h: number; d: number }> = [
    { y: 0.55, z: 0.00, h: 0.09, d: 0.04 },
    { y: 0.46, z: 0.05, h: 0.08, d: 0.04 },
    { y: 0.37, z: 0.00, h: 0.09, d: 0.04 },
  ]
  for (const fold of parts) {
    const bar = bevelBox(length, fold.h, fold.d, 0.006)
    bar.translate(0, fold.y, fold.z)
    folds.push(bar)
  }
  return folds
}

export function createModel(options: F1ArmcoOptions = {}): F1ArmcoInstance {
  const config: F1ArmcoConfig = { bays: Math.max(1, Math.round(options.bays ?? defaults.bays)) }

  const bundle = acquireF1Materials()
  const kit = bundle.materials
  const materialSlots: Record<Slot, Material> = {
    post: options.materials?.post ?? kit.graphite,
    rail: options.materials?.rail ?? kit.shell,
    stripe: options.materials?.stripe ?? kit.red,
  }

  const root = new Group()
  root.name = 'f1-armco'
  const posts = new Group(); posts.name = 'posts'
  const rail = new Group(); rail.name = 'rail'
  root.add(posts, rail)

  const generated: BufferGeometry[] = []
  const meshesBySlot: Record<Slot, Mesh[]> = { post: [], rail: [], stripe: [] }

  const releaseGenerated = (): void => {
    for (const group of [posts, rail]) group.clear()
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
    const { bays } = config
    const length = bays * PITCH
    const half = length / 2
    const postParts: BufferGeometry[] = []
    const railParts: BufferGeometry[] = []
    const stripeParts: BufferGeometry[] = []

    for (let i = 0; i <= bays; i++) {
      const x = -half + i * PITCH
      const post = bevelBox(0.12, 0.72, 0.10, 0.008)
      post.translate(x, 0.36, -0.08)
      postParts.push(post)
      const plate = bevelBox(0.22, 0.04, 0.20, 0.006)
      plate.translate(x, 0.02, -0.06)
      postParts.push(plate)
      postParts.push(bolt([x, 0.74, -0.04], 0.014, 0.018, AXIS_Y))
    }

    for (let bay = 0; bay < bays; bay++) {
      const x = -half + (bay + 0.5) * PITCH
      const beam = wBeam(PITCH - 0.08)
      for (const part of beam) {
        part.translate(x, 0, 0)
        if (bay % 2 === 0) stripeParts.push(part)
        else railParts.push(part)
      }
    }

    emit('post', mergeParts(postParts, 'posts'), posts, 'posts')
    if (railParts.length > 0) emit('rail', mergeParts(railParts, 'rail'), rail, 'shell-bays')
    if (stripeParts.length > 0) emit('stripe', mergeParts(stripeParts, 'stripe'), rail, 'red-bays')
  }
  rebuild()

  return {
    root,
    parts: { posts, rail },
    materials: materialSlots,
    getConfig: () => ({ ...config }),
    configure(patch) {
      if (patch.bays !== undefined) config.bays = Math.max(1, Math.round(patch.bays))
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
  return createF1Preview(createModel(), { aspect, target: [0, 0.4, 0], distance: 11, fov: 32 })
}
