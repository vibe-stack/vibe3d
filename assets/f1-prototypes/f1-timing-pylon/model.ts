// f1-timing-pylon — a tall scoring tower: steel frame, stacked LED cabinets, one digit
// per cabinet from a DataTexture (no floating 3D blocks that spill the bezel).
// configure({ height, positions }).

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
  fillGlyphRect,
  glyphCells,
  mergeParts,
  tubeSection,
  writeGlyph3x5,
  LAYER_CLEARANCE,
} from '../f1-kit-core/index.ts'

type Slot = 'frame' | 'screen'

export interface F1TimingPylonConfig {
  height: number
  /** One integer 0–9 per cabinet, top to bottom. */
  positions: readonly number[]
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

const defaults: F1TimingPylonConfig = { height: 9, positions: [1, 2, 3] }
const CAB_W = 1.15
const CAB_D = 0.14
const MAST_W = 0.72
const MAST_D = 0.42

function normalizePositions(positions: readonly number[]): number[] {
  const digits = positions
    .slice(0, 6)
    .map((n) => ((Math.abs(Math.round(n)) % 10) + 10) % 10)
  return digits.length > 0 ? digits : [...defaults.positions]
}

function cabinetTexture(digit: number): DataTexture {
  const w = 128
  const h = 128
  const data = new Uint8Array(w * h * 4)
  const ink: [number, number, number] = [6, 10, 16]
  const cyan: [number, number, number] = [
    (TOKEN.CYAN_400 >> 16) & 0xff,
    (TOKEN.CYAN_400 >> 8) & 0xff,
    TOKEN.CYAN_400 & 0xff,
  ]
  const paper: [number, number, number] = [242, 248, 252]
  fillGlyphRect(data, w, 0, 0, w, h, ink)
  fillGlyphRect(data, w, 8, 8, w - 16, h - 16, [10, 14, 20])
  const cells = glyphCells(String(digit)) ?? glyphCells('0')!
  writeGlyph3x5(data, w, 22, 28, cells, paper, 12)
  fillGlyphRect(data, w, 78, 40, 34, 48, cyan)
  const tex = new DataTexture(data, w, h, RGBAFormat, UnsignedByteType)
  tex.minFilter = NearestFilter
  tex.magFilter = NearestFilter
  tex.needsUpdate = true
  tex.flipY = true
  return tex
}

export function createModel(options: F1TimingPylonOptions = {}): F1TimingPylonInstance {
  const config: F1TimingPylonConfig = {
    height: Math.max(5, options.height ?? defaults.height),
    positions: normalizePositions(options.positions ?? defaults.positions),
  }

  const bundle = acquireF1Materials()
  const kit = bundle.materials
  const extras: Material[] = []
  const textures: DataTexture[] = []
  const ownsScreen = options.materials?.screen === undefined
  let slotMats: Material[] = []

  const releaseScreens = (): void => {
    for (const texture of textures) texture.dispose()
    textures.length = 0
    if (ownsScreen) {
      for (const material of extras) material.dispose()
    }
    extras.length = 0
    slotMats = []
  }

  const buildScreens = (): void => {
    releaseScreens()
    if (!ownsScreen) {
      slotMats = config.positions.map(() => options.materials!.screen!)
      return
    }
    slotMats = config.positions.map((digit, i) => {
      const tex = cabinetTexture(digit)
      textures.push(tex)
      const material = new MeshBasicMaterial({
        name: `f1-kit / timing-pylon slot ${i}`,
        map: tex,
        toneMapped: false,
      })
      extras.push(material)
      return material
    })
  }
  buildScreens()

  const screenMat = options.materials?.screen ?? slotMats[0]!

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
    const count = config.positions.length
    const parts: BufferGeometry[] = []
    const mast = bevelBox(MAST_W, height, MAST_D, 0.02)
    mast.translate(0, height / 2, 0)
    parts.push(mast)
    const pad = bevelBox(1.35, 0.12, 1.1, 0.015)
    pad.translate(0, 0.06, 0)
    parts.push(pad)
    const cap = bevelBox(0.85, 0.16, 0.55, 0.015)
    cap.translate(0, height + 0.06, 0)
    parts.push(cap)
    parts.push(tubeSection(0.045, 0.55, [0, height + 0.42, 0], [0, 1, 0], 8))
    emit('frame', mergeParts(parts, 'frame'), frame, 'frame')

    const panelH = height * 0.18 * (3 / Math.max(3, count))
    const gap = height * 0.04
    const stack = count * panelH + Math.max(0, count - 1) * gap
    const y0 = (height - stack) / 2 + panelH / 2
    const faceZ = MAST_D / 2 + CAB_D / 2 + LAYER_CLEARANCE
    const screenZ = faceZ + CAB_D / 2 + LAYER_CLEARANCE

    const bezels: BufferGeometry[] = []
    for (let i = 0; i < count; i++) {
      const y = y0 + i * (panelH + gap)
      const bezel = bevelBox(CAB_W, panelH + 0.08, CAB_D, 0.012)
      bezel.translate(0, y, faceZ)
      bezels.push(bezel)

      const panel = new PlaneGeometry(CAB_W - 0.16, panelH - 0.06)
      panel.translate(0, y, screenZ)
      emit('screen', panel, screens, `slot-${i}`, slotMats[i] ?? materialSlots.screen)
    }
    emit('frame', mergeParts(bezels, 'bezels'), frame, 'bezels')
  }
  rebuild()

  return {
    root,
    parts: { frame, screens },
    materials: materialSlots,
    getConfig: () => ({ height: config.height, positions: [...config.positions] }),
    configure(patch) {
      let dirtyScreens = false
      if (patch.height !== undefined) config.height = Math.max(5, patch.height)
      if (patch.positions !== undefined) {
        config.positions = normalizePositions(patch.positions)
        dirtyScreens = true
      }
      if (dirtyScreens) {
        buildScreens()
        if (ownsScreen && slotMats[0]) materialSlots.screen = slotMats[0]
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
      releaseScreens()
      disposeF1Materials(bundle)
      root.removeFromParent()
    },
  }
}

export function createPreview({ aspect }: { aspect: number; time?: number }) {
  return createF1Preview(createModel(), {
    aspect,
    target: [0, 4.5, 0.35],
    distance: 7.2,
    fov: 26,
    pitch: 0.06,
    yaw: -0.55,
  })
}
