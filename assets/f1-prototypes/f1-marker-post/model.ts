// f1-marker-post — red/white square distance post in the runoff. Not f1-brake-marker (100/150 boards).

import { BufferGeometry, Group, Mesh, type Material } from 'three/webgpu'

import {
  acquireF1Materials,
  bevelBox,
  createF1Preview,
  disposeF1Materials,
  mergeParts,
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
const SIDE = 0.075
const BAND = 0.12

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
    const white: BufferGeometry[] = []
    const red: BufferGeometry[] = []
    const foot = bevelBox(0.18, 0.04, 0.18, 0.006)
    foot.translate(0, 0.02, 0)
    white.push(foot)
    const socket = bevelBox(0.11, 0.06, 0.11, 0.005)
    socket.translate(0, 0.06, 0)
    white.push(socket)

    let y = 0.09
    let paint = 0
    while (y + 0.02 < h - 0.08) {
      const slice = Math.min(BAND, h - 0.08 - y)
      const block = bevelBox(SIDE, slice, SIDE, 0.004)
      block.translate(0, y + slice / 2, 0)
      ;(paint % 2 === 0 ? white : red).push(block)
      y += slice
      paint++
    }

    const capH = 0.09
    const cap = bevelBox(SIDE + 0.01, 0.03, SIDE + 0.01, 0.004)
    cap.translate(0, h - capH + 0.01, 0)
    red.push(cap)
    const peak = bevelBox(0.042, 0.05, 0.042, 0.004)
    peak.translate(0, h - 0.02, 0)
    red.push(peak)
    const diamond = bevelBox(0.09, 0.018, 0.09, 0.003)
    diamond.rotateY(Math.PI / 4)
    diamond.translate(0, h - 0.055, 0)
    red.push(diamond)

    emit('post', mergeParts(white, 'post'), post, 'stake')
    emit('stripe', mergeParts(red, 'stripes'), stripes, 'stripes')
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
    distance: 2.4,
    fov: 28,
    yaw: -0.75,
    pitch: 0.14,
  })
}
