// f1-brake-marker — a 150 / 100 / 50 distance board on twin posts.

import {
  BufferGeometry,
  DataTexture,
  Group,
  LinearFilter,
  Mesh,
  MeshStandardMaterial,
  RGBAFormat,
  UnsignedByteType,
  type Material,
} from 'three/webgpu'

import {
  acquireF1Materials,
  bevelBox,
  createF1Preview,
  disposeF1Materials,
  mergeParts,
  tubeSection,
} from '../f1-kit-core/index.ts'

type Slot = 'post' | 'board' | 'face'

export interface F1BrakeMarkerConfig {
  distance: 50 | 100 | 150
}

export interface F1BrakeMarkerOptions extends Partial<F1BrakeMarkerConfig> {
  materials?: Partial<Record<Slot, Material>>
}

export interface F1BrakeMarkerInstance {
  readonly root: Group
  readonly parts: { posts: Group; board: Group }
  readonly materials: Readonly<Record<Slot, Material>>
  getConfig(): Readonly<F1BrakeMarkerConfig>
  configure(patch: Partial<F1BrakeMarkerConfig>): void
  setMaterial(slot: Slot, material: Material): void
  update(deltaSeconds: number): void
  dispose(): void
}

const defaults: F1BrakeMarkerConfig = { distance: 100 }

function numeralTexture(value: 50 | 100 | 150): DataTexture {
  const glyphs: Record<string, number[]> = {
    '1': [0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0],
    '5': [1, 1, 1, 1, 0, 0, 1, 1, 1, 0, 0, 1, 1, 1, 1],
    '0': [1, 1, 1, 1, 0, 1, 1, 0, 1, 1, 0, 1, 1, 1, 1],
  }
  const text = String(value)
  const w = 96
  const h = 64
  const data = new Uint8Array(w * h * 4)
  data.fill(20)
  for (let i = 3; i < data.length; i += 4) data[i] = 255
  const cell = 14
  const originX = Math.floor((w - text.length * (cell * 3 + 8)) / 2)
  for (let gi = 0; gi < text.length; gi++) {
    const g = glyphs[text[gi]!] ?? glyphs['0']!
    for (let gy = 0; gy < 5; gy++) {
      for (let gx = 0; gx < 3; gx++) {
        if (!g[gy * 3 + gx]) continue
        for (let py = 0; py < cell; py++) {
          for (let px = 0; px < cell; px++) {
            const x = originX + gi * (cell * 3 + 8) + gx * cell + px
            const y = 8 + gy * cell + py
            if (x < 0 || x >= w || y < 0 || y >= h) continue
            const i = (y * w + x) * 4
            data[i] = 245
            data[i + 1] = 251
            data[i + 2] = 251
          }
        }
      }
    }
  }
  const tex = new DataTexture(data, w, h, RGBAFormat, UnsignedByteType)
  tex.minFilter = LinearFilter
  tex.magFilter = LinearFilter
  tex.needsUpdate = true
  return tex
}

export function createModel(options: F1BrakeMarkerOptions = {}): F1BrakeMarkerInstance {
  const config: F1BrakeMarkerConfig = { distance: options.distance ?? defaults.distance }

  const bundle = acquireF1Materials()
  const kit = bundle.materials
  const extras: Material[] = []
  const textures: DataTexture[] = []
  const own = (material: Material): Material => {
    extras.push(material)
    return material
  }

  const tex = numeralTexture(config.distance)
  textures.push(tex)
  const faceMat = options.materials?.face ?? own(new MeshStandardMaterial({
    name: 'f1-kit / brake-marker face',
    map: tex,
    roughness: 0.7,
    metalness: 0,
  }))

  const materialSlots: Record<Slot, Material> = {
    post: options.materials?.post ?? kit.graphite,
    board: options.materials?.board ?? kit.red,
    face: faceMat,
  }

  const root = new Group()
  root.name = 'f1-brake-marker'
  const posts = new Group(); posts.name = 'posts'
  const board = new Group(); board.name = 'board'
  root.add(posts, board)

  const generated: BufferGeometry[] = []
  const meshesBySlot: Record<Slot, Mesh[]> = { post: [], board: [], face: [] }

  const releaseGenerated = (): void => {
    for (const group of [posts, board]) group.clear()
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
    const postParts: BufferGeometry[] = []
    for (const sx of [-0.28, 0.28] as const) {
      postParts.push(tubeSection(0.03, 1.65, [sx, 0.825, 0], [0, 1, 0], 8))
    }
    emit('post', mergeParts(postParts, 'posts'), posts, 'posts')
    const plate = bevelBox(0.95, 0.55, 0.06, 0.01)
    plate.translate(0, 1.45, 0.04)
    emit('board', plate, board, 'plate')
    const face = bevelBox(0.82, 0.42, 0.02, 0.004)
    face.translate(0, 1.45, 0.08)
    emit('face', face, board, 'face')
  }
  rebuild()

  return {
    root,
    parts: { posts, board },
    materials: materialSlots,
    getConfig: () => ({ ...config }),
    configure(patch) {
      if (patch.distance !== undefined) {
        config.distance = patch.distance
        const next = numeralTexture(config.distance)
        textures[0]?.dispose()
        textures[0] = next
        ;(faceMat as MeshStandardMaterial).map = next
      }
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
  return createF1Preview(createModel(), { aspect, target: [0, 1.0, 0], distance: 3.6, fov: 30 })
}
