// f1-jumbotron — trackside LED screen on a steel truss: lattice legs, hood, walkway, speakers,
// and a generic timing-sheet DataTexture (P / LAP / TIME blocks — no names, no teams).
// Glyphs are sized to read at a 320 px contact-sheet cell; the LED face is a PlaneGeometry so
// the sheet maps 0–1 instead of smearing across a bevelBox.

import {
  BufferGeometry,
  DataTexture,
  Group,
  Mesh,
  MeshBasicMaterial,
  NearestFilter,
  PlaneGeometry,
  RGBAFormat,
  UnsignedByteType,
  Vector3,
  type Material,
} from 'three/webgpu'

import {
  TOKEN,
  acquireF1Materials,
  bevelBox,
  createF1Preview,
  disposeF1Materials,
  member,
  mergeParts,
} from '../f1-kit-core/index.ts'

type Slot = 'frame' | 'screen' | 'leg'

export interface F1JumbotronConfig {
  width: number
}

export interface F1JumbotronOptions extends Partial<F1JumbotronConfig> {
  materials?: Partial<Record<Slot, Material>>
}

export interface F1JumbotronInstance {
  readonly root: Group
  readonly parts: { frame: Group; screen: Group }
  readonly materials: Readonly<Record<Slot, Material>>
  getConfig(): Readonly<F1JumbotronConfig>
  configure(patch: Partial<F1JumbotronConfig>): void
  setMaterial(slot: Slot, material: Material): void
  update(deltaSeconds: number): void
  dispose(): void
}

const defaults: F1JumbotronConfig = { width: 8 }

function put(data: Uint8Array, w: number, x: number, y: number, rgb: readonly [number, number, number]): void {
  if (x < 0 || y < 0 || x >= w) return
  const i = (y * w + x) * 4
  if (i < 0 || i + 3 >= data.length) return
  data[i] = rgb[0]
  data[i + 1] = rgb[1]
  data[i + 2] = rgb[2]
  data[i + 3] = 255
}

function fillRect(
  data: Uint8Array, w: number, x0: number, y0: number, rw: number, rh: number,
  rgb: readonly [number, number, number],
): void {
  for (let y = y0; y < y0 + rh; y++) {
    for (let x = x0; x < x0 + rw; x++) put(data, w, x, y, rgb)
  }
}

function glyph3x5(
  data: Uint8Array, w: number, ox: number, oy: number, cells: number[],
  rgb: readonly [number, number, number], cell: number,
): void {
  for (let gy = 0; gy < 5; gy++) {
    for (let gx = 0; gx < 3; gx++) {
      if (!cells[gy * 3 + gx]) continue
      fillRect(data, w, ox + gx * cell, oy + gy * cell, cell - 1, cell - 1, rgb)
    }
  }
}

const GLYPH: Record<string, number[]> = {
  P: [1, 1, 1, 1, 0, 1, 1, 1, 1, 1, 0, 0, 1, 0, 0],
  L: [1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 1, 1],
  A: [1, 1, 1, 1, 0, 1, 1, 1, 1, 1, 0, 1, 1, 0, 1],
  T: [1, 1, 1, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0],
  I: [1, 1, 1, 0, 1, 0, 0, 1, 0, 0, 1, 0, 1, 1, 1],
  M: [1, 0, 1, 1, 1, 1, 1, 0, 1, 1, 0, 1, 1, 0, 1],
  E: [1, 1, 1, 1, 0, 0, 1, 1, 1, 1, 0, 0, 1, 1, 1],
  '1': [0, 1, 0, 1, 1, 0, 0, 1, 0, 0, 1, 0, 1, 1, 1],
  '2': [1, 1, 1, 0, 0, 1, 1, 1, 1, 1, 0, 0, 1, 1, 1],
  '3': [1, 1, 1, 0, 0, 1, 1, 1, 1, 0, 0, 1, 1, 1, 1],
  '4': [1, 0, 1, 1, 0, 1, 1, 1, 1, 0, 0, 1, 0, 0, 1],
}

function writeWord(
  data: Uint8Array, w: number, ox: number, oy: number, word: string,
  rgb: readonly [number, number, number], cell: number,
): void {
  const advance = cell * 3 + Math.max(4, Math.round(cell * 0.4))
  for (let i = 0; i < word.length; i++) {
    const cells = GLYPH[word[i]!]
    if (!cells) continue
    glyph3x5(data, w, ox + i * advance, oy, cells, rgb, cell)
  }
}

function timingSheet(): DataTexture {
  const w = 512
  const h = 256
  const data = new Uint8Array(w * h * 4)
  const ink: [number, number, number] = [8, 12, 18]
  const paper: [number, number, number] = [242, 244, 248]
  const accent: [number, number, number] = [
    (TOKEN.COBALT_500 >> 16) & 0xff,
    (TOKEN.COBALT_500 >> 8) & 0xff,
    TOKEN.COBALT_500 & 0xff,
  ]
  const cyan: [number, number, number] = [
    (TOKEN.CYAN_400 >> 16) & 0xff,
    (TOKEN.CYAN_400 >> 8) & 0xff,
    TOKEN.CYAN_400 & 0xff,
  ]
  fillRect(data, w, 0, 0, w, h, ink)
  fillRect(data, w, 0, 0, w, 72, accent)
  fillRect(data, w, 0, h - 28, w, 28, accent)
  writeWord(data, w, 16, 10, 'P', paper, 12)
  writeWord(data, w, 140, 10, 'LAP', paper, 12)
  writeWord(data, w, 340, 10, 'TIME', paper, 12)
  const rowH = 36
  for (let row = 0; row < 4; row++) {
    const y = 84 + row * rowH
    if (row % 2 === 1) fillRect(data, w, 0, y, w, rowH, [12, 16, 22])
    writeWord(data, w, 18, y + 6, String(row + 1), paper, 6)
    fillRect(data, w, 70, y + 8, 220, 20, cyan)
    fillRect(data, w, 310, y + 10, 70, 16, [160, 170, 180])
    fillRect(data, w, 400, y + 8, 96, 20, paper)
  }
  const tex = new DataTexture(data, w, h, RGBAFormat, UnsignedByteType)
  tex.minFilter = NearestFilter
  tex.magFilter = NearestFilter
  tex.needsUpdate = true
  tex.flipY = true
  return tex
}

export function createModel(options: F1JumbotronOptions = {}): F1JumbotronInstance {
  const config: F1JumbotronConfig = { width: Math.max(3, options.width ?? defaults.width) }

  const bundle = acquireF1Materials()
  const kit = bundle.materials
  const extras: Material[] = []
  const textures: DataTexture[] = []
  const own = (material: Material): Material => {
    extras.push(material)
    return material
  }
  const tex = timingSheet()
  textures.push(tex)
  const screenMat = options.materials?.screen ?? own(new MeshBasicMaterial({
    name: 'f1-kit / jumbotron screen',
    map: tex,
    toneMapped: false,
  }))

  const materialSlots: Record<Slot, Material> = {
    frame: options.materials?.frame ?? kit.graphite,
    screen: screenMat,
    leg: options.materials?.leg ?? kit.slate,
  }

  const root = new Group()
  root.name = 'f1-jumbotron'
  const frame = new Group(); frame.name = 'frame'
  const screen = new Group(); screen.name = 'screen'
  root.add(frame, screen)

  const generated: BufferGeometry[] = []
  const meshesBySlot: Record<Slot, Mesh[]> = { frame: [], screen: [], leg: [] }

  const releaseGenerated = (): void => {
    for (const group of [frame, screen]) group.clear()
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
    const w = config.width
    const h = w * 0.48
    const elev = 3.2
    const y = elev + h / 2
    const half = w / 2
    const legs: BufferGeometry[] = []
    for (const sx of [-1, 1] as const) {
      const x = sx * half * 0.78
      legs.push(member(new Vector3(x, 0, -0.35), new Vector3(x, elev + h * 0.15, -0.35), 0.09, 8))
      legs.push(member(new Vector3(x, 0, 0.15), new Vector3(x, elev + h * 0.15, 0.15), 0.07, 8))
      for (let i = 0; i < 6; i++) {
        const y0 = (i / 6) * elev
        const y1 = ((i + 1) / 6) * elev
        legs.push(member(new Vector3(x, y0, -0.35), new Vector3(x, y1, 0.15), 0.028, 6))
        legs.push(member(new Vector3(x, y0, 0.15), new Vector3(x, y1, -0.35), 0.028, 6))
      }
      const pad = bevelBox(0.55, 0.1, 0.55, 0.012)
      pad.translate(x, 0.05, -0.1)
      legs.push(pad)
    }
    emit('leg', mergeParts(legs, 'legs'), frame, 'legs')

    const bezel = bevelBox(w + 0.45, h + 0.45, 0.32, 0.03)
    bezel.translate(0, y, -0.08)
    emit('frame', bezel, frame, 'bezel')
    const hood = bevelBox(w + 0.5, 0.22, 0.7, 0.02)
    hood.translate(0, y + h / 2 + 0.18, 0.12)
    emit('frame', hood, frame, 'hood')
    const walk = bevelBox(w * 0.9, 0.05, 0.55, 0.008)
    walk.translate(0, elev - 0.15, -0.45)
    emit('frame', walk, frame, 'walkway')
    const speakers: BufferGeometry[] = []
    for (const sx of [-1, 1] as const) {
      const can = bevelBox(0.35, 0.45, 0.28, 0.02)
      can.translate(sx * (half + 0.15), y + h * 0.2, 0.05)
      speakers.push(can)
    }
    emit('frame', mergeParts(speakers, 'speakers'), frame, 'speakers')

    const panel = new PlaneGeometry(w, h)
    panel.translate(0, y, 0.18)
    emit('screen', panel, screen, 'panel')

    const bit = Math.max(0.08, w * 0.02)
    const titles: BufferGeometry[] = []
    const stamp = (ch: string, cx: number, cy: number): void => {
      const cells = GLYPH[ch]
      if (!cells) return
      for (let gy = 0; gy < 5; gy++) {
        for (let gx = 0; gx < 3; gx++) {
          if (!cells[gy * 3 + gx]) continue
          const block = bevelBox(bit * 0.88, bit * 0.88, 0.05, 0.008)
          block.translate(cx + (gx - 1) * bit, cy + (2 - gy) * bit, 0.28)
          titles.push(block)
        }
      }
    }
    const topY = y + h * 0.28
    const pitch = bit * 3.6
    stamp('P', -w * 0.36, topY)
    ;(['L', 'A', 'P'] as const).forEach((ch, i) => stamp(ch, -w * 0.08 + i * pitch, topY))
    ;(['T', 'I', 'M', 'E'] as const).forEach((ch, i) => stamp(ch, w * 0.14 + i * pitch, topY))
    emit('frame', mergeParts(titles, 'titles'), frame, 'titles', kit.shell)
  }
  rebuild()

  return {
    root,
    parts: { frame, screen },
    materials: materialSlots,
    getConfig: () => ({ ...config }),
    configure(patch) {
      if (patch.width !== undefined) config.width = Math.max(3, patch.width)
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
  return createF1Preview(createModel({ width: 6 }), {
    aspect,
    target: [0, 4.7, 0.18],
    distance: 9.2,
    fov: 26,
    pitch: 0.06,
    yaw: -0.28,
  })
}
