// f1-start-gantry — the start/finish overhead: two posts, a box beam, and a blank banner.

import {
  BufferGeometry,
  Group,
  Mesh,
  Vector3,
  type Material,
} from 'three/webgpu'

import {
  acquireF1Materials,
  bevelBox,
  createF1Preview,
  disposeF1Materials,
  member,
  mergeParts,
} from '../f1-kit-core/index.ts'

type Slot = 'post' | 'beam' | 'banner'

export interface F1StartGantryConfig {
  span: number
  height: number
}

export interface F1StartGantryOptions extends Partial<F1StartGantryConfig> {
  materials?: Partial<Record<Slot, Material>>
}

export interface F1StartGantryInstance {
  readonly root: Group
  readonly parts: { posts: Group; beam: Group; banner: Group }
  readonly materials: Readonly<Record<Slot, Material>>
  getConfig(): Readonly<F1StartGantryConfig>
  configure(patch: Partial<F1StartGantryConfig>): void
  setMaterial(slot: Slot, material: Material): void
  update(deltaSeconds: number): void
  dispose(): void
}

const defaults: F1StartGantryConfig = { span: 14, height: 7.2 }

export function createModel(options: F1StartGantryOptions = {}): F1StartGantryInstance {
  const config: F1StartGantryConfig = {
    span: Math.max(6, options.span ?? defaults.span),
    height: Math.max(4, options.height ?? defaults.height),
  }

  const bundle = acquireF1Materials()
  const kit = bundle.materials
  const materialSlots: Record<Slot, Material> = {
    post: options.materials?.post ?? kit.graphite,
    beam: options.materials?.beam ?? kit.slate,
    banner: options.materials?.banner ?? kit.shell,
  }

  const root = new Group()
  root.name = 'f1-start-gantry'
  const posts = new Group(); posts.name = 'posts'
  const beam = new Group(); beam.name = 'beam'
  const banner = new Group(); banner.name = 'banner'
  root.add(posts, beam, banner)

  const generated: BufferGeometry[] = []
  const meshesBySlot: Record<Slot, Mesh[]> = { post: [], beam: [], banner: [] }

  const releaseGenerated = (): void => {
    for (const group of [posts, beam, banner]) group.clear()
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
    const { span, height } = config
    const half = span / 2
    const postParts: BufferGeometry[] = []
    for (const sx of [-1, 1] as const) {
      postParts.push(member(new Vector3(sx * half, 0, 0), new Vector3(sx * half, height, 0), 0.14, 10))
      const plate = bevelBox(0.7, 0.08, 0.7, 0.015)
      plate.translate(sx * half, 0.04, 0)
      postParts.push(plate)
    }
    emit('post', mergeParts(postParts, 'posts'), posts, 'posts')
    const spanBeam = bevelBox(span + 0.4, 0.45, 0.55, 0.04)
    spanBeam.translate(0, height + 0.1, 0)
    emit('beam', spanBeam, beam, 'beam')
    const panel = bevelBox(span * 0.72, 0.9, 0.06, 0.012)
    panel.translate(0, height - 0.65, 0.12)
    emit('banner', panel, banner, 'banner')
  }
  rebuild()

  return {
    root,
    parts: { posts, beam, banner },
    materials: materialSlots,
    getConfig: () => ({ ...config }),
    configure(patch) {
      if (patch.span !== undefined) config.span = Math.max(6, patch.span)
      if (patch.height !== undefined) config.height = Math.max(4, patch.height)
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
  return createF1Preview(createModel(), { aspect, target: [0, 4.2, 0], distance: 22, fov: 36 })
}
