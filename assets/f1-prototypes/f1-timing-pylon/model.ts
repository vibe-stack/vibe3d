// f1-timing-pylon — a tall scoring tower: steel frame, three stacked LED cabinets, generic DataTexture
// rows with large position glyphs (no names or teams). configure({ height }).

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

type Slot = 'frame' | 'screen'

export interface F1TimingPylonConfig {
  height: number
}

export interface F1TimingPylonOptions extends Partial<F1TimingPylonConfig> {
  materials?: Partial<Record<Slot, Material>>
}

export interface F1TimingPylonInstance {
  readonly root: Group
  readonly parts: { frame: Group; screens: Group }
  readonly materials: Readonly<Record<Slot, Material>>
  getConfig(): Readonly<F1TimingPylonConfig>
  configure(patch: Partial<F1TimingPylonConfig>): void
  setMaterial(slot: Slot, material: Material): void
  update(deltaSeconds: number): void
  dispose(): void
}

const defaults: F1TimingPylonConfig = { height: 9 }

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

function slotTexture(): DataTexture {
  const w = 128
  const h = 256
  const data = new Uint8Array(w * h * 4)
  const ink: [number, number, number] = [6, 10, 16]
  const cyan: [number, number, number] = [
    (TOKEN.CYAN_400 >> 16) & 0xff,
    (TOKEN.CYAN_400 >> 8) & 0xff,
    TOKEN.CYAN_400 & 0xff,
  ]
  const paper: [number, number, number] = [230, 240, 245]
  fillRect(data, w, 0, 0, w, h, ink)
  const digits: number[][] = [
    [0, 1, 0, 1, 1, 0, 0, 1, 0, 0, 1, 0, 1, 1, 1],
    [1, 1, 1, 0, 0, 1, 1, 1, 1, 1, 0, 0, 1, 1, 1],
    [1, 1, 1, 0, 0, 1, 1, 1, 1, 0, 0, 1, 1, 1, 1],
  ]
  for (let slot = 0; slot < 3; slot++) {
    const y0 = 12 + slot * 80
    fillRect(data, w, 8, y0, w - 16, 68, [10, 14, 20])
    glyph3x5(data, w, 16, y0 + 8, digits[slot]!, paper, 10)
    fillRect(data, w, 56, y0 + 18, 56, 32, cyan)
  }
  const tex = new DataTexture(data, w, h, RGBAFormat, UnsignedByteType)
  tex.minFilter = NearestFilter
  tex.magFilter = NearestFilter
  tex.needsUpdate = true
  tex.flipY = true
  return tex
}

export function createModel(options: F1TimingPylonOptions = {}): F1TimingPylonInstance {
  const config: F1TimingPylonConfig = { height: Math.max(5, options.height ?? defaults.height) }

  const bundle = acquireF1Materials()
  const kit = bundle.materials
  const extras: Material[] = []
  const textures: DataTexture[] = []
  const own = (material: Material): Material => {
    extras.push(material)
    return material
  }
  const tex = slotTexture()
  textures.push(tex)
  const screenMat = options.materials?.screen ?? own(new MeshBasicMaterial({
    name: 'f1-kit / timing-pylon screen',
    map: tex,
    toneMapped: false,
  }))

  const materialSlots: Record<Slot, Material> = {
    frame: options.materials?.frame ?? kit.graphite,
    screen: screenMat,
  }

  const root = new Group()
  root.name = 'f1-timing-pylon'
  const frame = new Group(); frame.name = 'frame'
  const screens = new Group(); screens.name = 'screens'
  root.add(frame, screens)

  const generated: BufferGeometry[] = []
  const meshesBySlot: Record<Slot, Mesh[]> = { frame: [], screen: [] }

  const releaseGenerated = (): void => {
    for (const group of [frame, screens]) group.clear()
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
    const { height } = config
    const parts: BufferGeometry[] = []
    const mast = bevelBox(0.55, height, 0.38, 0.02)
    mast.translate(0, height / 2, 0)
    parts.push(mast)
    const pad = bevelBox(1.2, 0.12, 1.0, 0.015)
    pad.translate(0, 0.06, 0)
    parts.push(pad)
    const cap = bevelBox(0.7, 0.16, 0.48, 0.015)
    cap.translate(0, height + 0.06, 0)
    parts.push(cap)
    parts.push(tubeSection(0.045, 0.6, [0, height + 0.45, 0], [0, 1, 0], 8))
    emit('frame', mergeParts(parts, 'frame'), frame, 'frame')

    const bezels: BufferGeometry[] = []
    const panelH = height * 0.2
    for (let i = 0; i < 3; i++) {
      const y = height * (0.28 + i * 0.24)
      const bezel = bevelBox(0.92, panelH + 0.1, 0.1, 0.012)
      bezel.translate(0, y, 0.18)
      bezels.push(bezel)
    }
    emit('frame', mergeParts(bezels, 'bezels'), frame, 'bezels')
    const stackH = panelH * 3 + height * 0.04 * 2
    const panel = new PlaneGeometry(0.78, stackH)
    panel.translate(0, height * 0.52, 0.26)
    emit('screen', panel, screens, 'screens')

    const digits: number[][] = [
      [0, 1, 0, 1, 1, 0, 0, 1, 0, 0, 1, 0, 1, 1, 1],
      [1, 1, 1, 0, 0, 1, 1, 1, 1, 1, 0, 0, 1, 1, 1],
      [1, 1, 1, 0, 0, 1, 1, 1, 1, 0, 0, 1, 1, 1, 1],
    ]
    const labels: BufferGeometry[] = []
    const bit = Math.max(0.07, panelH * 0.14)
    for (let i = 0; i < 3; i++) {
      const y = height * (0.28 + i * 0.24)
      const cells = digits[i]!
      for (let gy = 0; gy < 5; gy++) {
        for (let gx = 0; gx < 3; gx++) {
          if (!cells[gy * 3 + gx]) continue
          const block = bevelBox(bit * 0.88, bit * 0.88, 0.04, 0.006)
          block.translate(-0.22 + (gx - 1) * bit, y + (2 - gy) * bit, 0.3)
          labels.push(block)
        }
      }
    }
    emit('frame', mergeParts(labels, 'labels'), frame, 'labels', kit.shell)
  }
  rebuild()

  return {
    root,
    parts: { frame, screens },
    materials: materialSlots,
    getConfig: () => ({ ...config }),
    configure(patch) {
      if (patch.height !== undefined) config.height = Math.max(5, patch.height)
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
  return createF1Preview(createModel(), {
    aspect,
    target: [0, 4.4, 0.22],
    distance: 8.2,
    fov: 26,
    pitch: 0.04,
    yaw: -0.4,
  })
}
