// f1-catch-fence — a straight run of ~5 m debris catch-fencing: steel posts with base plates,
// top + mid rails, stay cables, and a chain-link band. Mesh is a DataTexture (headless preview
// has no document / canvas).

import {
  BufferGeometry,
  DataTexture,
  DoubleSide,
  Group,
  LinearFilter,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  RepeatWrapping,
  RGBAFormat,
  UnsignedByteType,
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
  tubeSection,
} from '../f1-kit-core/index.ts'

type Slot = 'post' | 'mesh' | 'rail'

export interface F1CatchFenceConfig {
  length: number
  height: number
}

export interface F1CatchFenceOptions extends Partial<F1CatchFenceConfig> {
  materials?: Partial<Record<Slot, Material>>
}

export interface F1CatchFenceInstance {
  readonly root: Group
  readonly parts: { posts: Group; mesh: Group }
  readonly materials: Readonly<Record<Slot, Material>>
  getConfig(): Readonly<F1CatchFenceConfig>
  configure(patch: Partial<F1CatchFenceConfig>): void
  setMaterial(slot: Slot, material: Material): void
  update(deltaSeconds: number): void
  dispose(): void
}

const defaults: F1CatchFenceConfig = { length: 12, height: 5 }

function chainLinkTexture(): DataTexture {
  const n = 64
  const data = new Uint8Array(n * n * 4)
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const i = (y * n + x) * 4
      const d1 = Math.abs(((x + y) % 10) - 5)
      const d2 = Math.abs(((x - y + n * 4) % 10) - 5)
      const on = d1 < 1.2 || d2 < 1.2
      data[i] = on ? 170 : 0
      data[i + 1] = on ? 178 : 0
      data[i + 2] = on ? 186 : 0
      data[i + 3] = on ? 230 : 0
    }
  }
  const tex = new DataTexture(data, n, n, RGBAFormat, UnsignedByteType)
  tex.wrapS = RepeatWrapping
  tex.wrapT = RepeatWrapping
  tex.minFilter = LinearFilter
  tex.magFilter = LinearFilter
  tex.needsUpdate = true
  return tex
}

export function createModel(options: F1CatchFenceOptions = {}): F1CatchFenceInstance {
  const config: F1CatchFenceConfig = {
    length: Math.max(2, options.length ?? defaults.length),
    height: Math.max(2, options.height ?? defaults.height),
  }

  const bundle = acquireF1Materials()
  const kit = bundle.materials
  const extras: Material[] = []
  const textures: DataTexture[] = []
  const own = (material: Material): Material => {
    extras.push(material)
    return material
  }

  const tex = chainLinkTexture()
  textures.push(tex)
  const meshMat = options.materials?.mesh ?? own(new MeshStandardMaterial({
    name: 'f1-kit / catch-fence mesh',
    map: tex,
    transparent: true,
    alphaTest: 0.15,
    roughness: 0.72,
    metalness: 0.45,
    side: DoubleSide,
  }))

  const materialSlots: Record<Slot, Material> = {
    post: options.materials?.post ?? kit.graphite,
    mesh: meshMat,
    rail: options.materials?.rail ?? kit.steel,
  }

  const root = new Group()
  root.name = 'f1-catch-fence'
  const posts = new Group(); posts.name = 'posts'
  const meshGroup = new Group(); meshGroup.name = 'mesh'
  root.add(posts, meshGroup)

  const generated: BufferGeometry[] = []
  const meshesBySlot: Record<Slot, Mesh[]> = { post: [], mesh: [], rail: [] }

  const releaseGenerated = (): void => {
    for (const group of [posts, meshGroup]) group.clear()
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
    const { length, height } = config
    const spacing = 3
    const count = Math.max(2, Math.round(length / spacing) + 1)
    const half = length / 2

    const postParts: BufferGeometry[] = []
    const railParts: BufferGeometry[] = []
    for (let i = 0; i < count; i++) {
      const x = -half + (i / (count - 1)) * length
      postParts.push(tubeSection(0.05, height + 0.16, [x, (height + 0.16) / 2, 0], [0, 1, 0], 12))
      const base = bevelBox(0.28, 0.08, 0.28, 0.01)
      base.translate(x, 0.04, 0)
      postParts.push(base)
      const cap = bevelBox(0.14, 0.05, 0.14, 0.006)
      cap.translate(x, height + 0.1, 0)
      railParts.push(cap)
      // Stay cable back from the post top to a ground anchor.
      railParts.push(member(
        new Vector3(x, height + 0.02, 0),
        new Vector3(x, 0.08, -0.85),
        0.012,
        6,
      ))
    }
    const top = bevelBox(length + 0.1, 0.055, 0.07, 0.006)
    top.translate(0, height + 0.02, 0)
    railParts.push(top)
    const mid = bevelBox(length + 0.1, 0.04, 0.05, 0.005)
    mid.translate(0, height * 0.52, 0)
    railParts.push(mid)
    const bottom = bevelBox(length + 0.1, 0.04, 0.05, 0.005)
    bottom.translate(0, 0.18, 0)
    railParts.push(bottom)
    emit('post', mergeParts(postParts, 'posts'), posts, 'posts')
    emit('rail', mergeParts(railParts, 'rails'), posts, 'rails')

    const panel = new PlaneGeometry(length, height - 0.2, 1, 1)
    panel.translate(0, height / 2, 0.02)
    const repeats = Math.max(1, length / 0.32)
    tex.repeat.set(repeats, height / 0.32)
    tex.needsUpdate = true
    emit('mesh', panel, meshGroup, 'chain-link')
  }
  rebuild()

  return {
    root,
    parts: { posts, mesh: meshGroup },
    materials: materialSlots,
    getConfig: () => ({ ...config }),
    configure(patch) {
      if (patch.length !== undefined) config.length = Math.max(2, patch.length)
      if (patch.height !== undefined) config.height = Math.max(2, patch.height)
      rebuild()
    },
    setMaterial(slot, material) {
      materialSlots[slot] = material
      for (const mesh of meshesBySlot[slot]) mesh.material = material
    },
    update: () => {},
    dispose() {
      releaseGenerated()
      for (const texture of textures) texture.dispose()
      for (const material of extras) material.dispose()
      disposeF1Materials(bundle)
      root.removeFromParent()
    },
  }
}

export function createPreview({ aspect }: { aspect: number; time?: number }) {
  return createF1Preview(createModel({ length: 9, height: 4.2 }), {
    aspect,
    target: [0, 2.1, -0.2],
    distance: 12,
    fov: 32,
  })
}
