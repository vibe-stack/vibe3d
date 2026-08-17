// f1-brake-marker — Silverstone-style 150 / 100 / 50 board: kerb-red plate, bold white numerals,
// twin posts, crown beacon. configure({ distance }).

import {
  BufferGeometry,
  DataTexture,
  Group,
  LinearFilter,
  Mesh,
  MeshStandardMaterial,
  NearestFilter,
  RGBAFormat,
  UnsignedByteType,
  type Material,
} from 'three/webgpu'

import {
  TOKEN,
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

const GLYPHS: Record<string, number[]> = {
  '1': [0, 1, 0, 1, 1, 0, 0, 1, 0, 0, 1, 0, 1, 1, 1],
  '5': [1, 1, 1, 1, 0, 0, 1, 1, 1, 0, 0, 1, 1, 1, 1],
  '0': [1, 1, 1, 1, 0, 1, 1, 0, 1, 1, 0, 1, 1, 1, 1],
}

function numeralTexture(value: 50 | 100 | 150): DataTexture {
  const w = 192
  const h = 128
  const data = new Uint8Array(w * h * 4)
  const red: [number, number, number] = [
    (TOKEN.RED_500 >> 16) & 0xff,
    (TOKEN.RED_500 >> 8) & 0xff,
    TOKEN.RED_500 & 0xff,
  ]
  const paper: [number, number, number] = [245, 251, 251]
  for (let i = 0; i < w * h; i++) {
    data[i * 4] = red[0]
    data[i * 4 + 1] = red[1]
    data[i * 4 + 2] = red[2]
    data[i * 4 + 3] = 255
  }
  // White border.
  const border = 8
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (x < border || y < border || x >= w - border || y >= h - border) {
        const i = (y * w + x) * 4
        data[i] = paper[0]
        data[i + 1] = paper[1]
        data[i + 2] = paper[2]
      }
    }
  }
  const text = String(value)
  const cell = 18
  const originX = Math.floor((w - text.length * (cell * 3 + 10)) / 2)
  const originY = Math.floor((h - cell * 5) / 2)
  for (let gi = 0; gi < text.length; gi++) {
    const g = GLYPHS[text[gi]!] ?? GLYPHS['0']!
    for (let gy = 0; gy < 5; gy++) {
      for (let gx = 0; gx < 3; gx++) {
        if (!g[gy * 3 + gx]) continue
        for (let py = 0; py < cell - 2; py++) {
          for (let px = 0; px < cell - 2; px++) {
            const x = originX + gi * (cell * 3 + 10) + gx * cell + px
            const y = originY + gy * cell + py
            if (x < 0 || x >= w || y < 0 || y >= h) continue
            const i = (y * w + x) * 4
            data[i] = paper[0]
            data[i + 1] = paper[1]
            data[i + 2] = paper[2]
          }
        }
      }
    }
  }
  const tex = new DataTexture(data, w, h, RGBAFormat, UnsignedByteType)
  tex.minFilter = LinearFilter
  tex.magFilter = NearestFilter
  tex.needsUpdate = true
  tex.flipY = true
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
    roughness: 0.65,
    metalness: 0,
  }))
  const beaconMat = own(new MeshStandardMaterial({
    name: 'f1-kit / brake-marker beacon',
    color: 0x000000,
    emissive: TOKEN.RED_500,
    emissiveIntensity: 1.8,
    roughness: 0.3,
    metalness: 0,
    toneMapped: false,
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

  const emit = (
    slot: Slot,
    geometry: BufferGeometry,
    group: Group,
    name: string,
    material?: Material,
  ): void => {
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
    const postParts: BufferGeometry[] = []
    for (const sx of [-0.48, 0.48] as const) {
      postParts.push(tubeSection(0.04, 1.35, [sx, 0.68, 0], [0, 1, 0], 10))
      const pad = bevelBox(0.16, 0.05, 0.16, 0.008)
      pad.translate(sx, 0.03, 0)
      postParts.push(pad)
    }
    emit('post', mergeParts(postParts, 'posts'), posts, 'posts')

    const plate = bevelBox(1.7, 1.15, 0.08, 0.012)
    plate.translate(0, 1.55, 0.05)
    emit('board', plate, board, 'plate')
    const face = bevelBox(1.52, 0.98, 0.03, 0.004)
    face.translate(0, 1.55, 0.1)
    emit('face', face, board, 'face')
    const beacon = tubeSection(0.045, 0.12, [0, 2.2, 0.06], [0, 1, 0], 12)
    emit('board', beacon, board, 'beacon', beaconMat)
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
  return createF1Preview(createModel(), { aspect, target: [0, 1.35, 0.1], distance: 4.2, fov: 30 })
}
