// f1-brake-marker — Silverstone-style 150 / 100 / 50 board: kerb-red plate, chunky 7-seg numerals
// lofted as geometry (a DataTexture never survived a 320 px cell), twin posts, crown beacon.
// configure({ distance }).

import {
  BufferGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
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

/** 7-seg bits: a top, b UR, c LR, d bot, e LL, f UL, g mid. */
const SEG: Record<string, readonly number[]> = {
  '0': [1, 1, 1, 1, 1, 1, 0],
  '1': [0, 1, 1, 0, 0, 0, 0],
  '5': [1, 0, 1, 1, 0, 1, 1],
}

function sevenSeg(digit: string, cx: number, cy: number, cz: number): BufferGeometry[] {
  const W = 0.38
  const H = 0.72
  const T = 0.1
  const D = 0.06
  if (digit === '1') {
    const bar = bevelBox(0.16, H, D, 0.012)
    bar.translate(cx, cy, cz)
    return [bar]
  }
  const segs = SEG[digit]
  if (!segs) return []
  const parts: BufferGeometry[] = []
  const horiz = (on: number, y: number): void => {
    if (!on) return
    const g = bevelBox(W, T, D, 0.012)
    g.translate(cx, cy + y, cz)
    parts.push(g)
  }
  const vert = (on: number, x: number, y: number): void => {
    if (!on) return
    const g = bevelBox(T, H / 2 - T * 0.35, D, 0.012)
    g.translate(cx + x, cy + y, cz)
    parts.push(g)
  }
  horiz(segs[0]!, H / 2)
  vert(segs[1]!, W / 2, H / 4)
  vert(segs[2]!, W / 2, -H / 4)
  horiz(segs[3]!, -H / 2)
  vert(segs[4]!, -W / 2, -H / 4)
  vert(segs[5]!, -W / 2, H / 4)
  horiz(segs[6]!, 0)
  return parts
}

function numeralParts(value: 50 | 100 | 150, cx: number, cy: number, cz: number): BufferGeometry[] {
  const text = String(value)
  const pitch = 0.48
  const origin = cx - ((text.length - 1) * pitch) / 2
  const parts: BufferGeometry[] = []
  for (let i = 0; i < text.length; i++) {
    parts.push(...sevenSeg(text[i]!, origin + i * pitch, cy, cz))
  }
  return parts
}

export function createModel(options: F1BrakeMarkerOptions = {}): F1BrakeMarkerInstance {
  const config: F1BrakeMarkerConfig = { distance: options.distance ?? defaults.distance }

  const bundle = acquireF1Materials()
  const kit = bundle.materials
  const extras: Material[] = []
  const own = (material: Material): Material => {
    extras.push(material)
    return material
  }

  const faceMat = options.materials?.face ?? kit.shell
  const beaconMat = own(new MeshBasicMaterial({
    name: 'f1-kit / brake-marker beacon',
    color: TOKEN.RED_500,
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
    for (const sx of [-0.55, 0.55] as const) {
      postParts.push(tubeSection(0.045, 1.45, [sx, 0.74, 0], [0, 1, 0], 10))
      const pad = bevelBox(0.18, 0.06, 0.18, 0.008)
      pad.translate(sx, 0.03, 0)
      postParts.push(pad)
    }
    emit('post', mergeParts(postParts, 'posts'), posts, 'posts')

    const plate = bevelBox(1.85, 1.28, 0.09, 0.014)
    plate.translate(0, 1.62, 0.04)
    emit('board', plate, board, 'plate')

    const frame: BufferGeometry[] = []
    frame.push(bevelBox(1.85, 0.06, 0.04, 0.006).translate(0, 1.62 + 0.64, 0.1))
    frame.push(bevelBox(1.85, 0.06, 0.04, 0.006).translate(0, 1.62 - 0.64, 0.1))
    frame.push(bevelBox(0.06, 1.28, 0.04, 0.006).translate(-0.9, 1.62, 0.1))
    frame.push(bevelBox(0.06, 1.28, 0.04, 0.006).translate(0.9, 1.62, 0.1))
    emit('face', mergeParts(frame, 'frame'), board, 'frame')

    emit('face', mergeParts(numeralParts(config.distance, 0, 1.62, 0.12), 'numerals'), board, 'numerals')

    const beacon = tubeSection(0.05, 0.16, [0, 2.36, 0.06], [0, 1, 0], 12)
    emit('board', beacon, board, 'beacon', beaconMat)
  }
  rebuild()

  return {
    root,
    parts: { posts, board },
    materials: materialSlots,
    getConfig: () => ({ ...config }),
    configure(patch) {
      if (patch.distance !== undefined) config.distance = patch.distance
      rebuild()
    },
    setMaterial(slot, material) {
      materialSlots[slot] = material
      for (const mesh of meshesBySlot[slot]) mesh.material = material
    },
    update: () => {},
    dispose() {
      releaseGenerated()
      for (const material of extras) material.dispose()
      disposeF1Materials(bundle)
      root.removeFromParent()
    },
  }
}

export function createPreview({ aspect }: { aspect: number; time?: number }) {
  return createF1Preview(createModel(), {
    aspect,
    target: [0, 1.55, 0.12],
    distance: 3.4,
    fov: 26,
    yaw: -0.28,
    pitch: 0.08,
  })
}
