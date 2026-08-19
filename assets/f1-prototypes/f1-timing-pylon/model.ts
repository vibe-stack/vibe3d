// f1-timing-pylon — a tall scoring blade: tapered black frame, near-continuous LED face,
// and dense deterministic position/driver rows. configure({ height, positions }).

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
  GLYPH_3X5,
  mergeParts,
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
const CAB_W = 0.78
const CAB_D = 0.08
const MAST_D = 0.16
const MAX_ROWS = 33
const YELLOW: [number, number, number] = [255, 224, 16]
const GREEN: [number, number, number] = [48, 220, 92]
const PAPER: [number, number, number] = [248, 250, 252]
const INK: [number, number, number] = [4, 6, 8]

function normalizePositions(positions: readonly number[]): number[] {
  const digits = positions
    .slice(0, MAX_ROWS)
    .map((n) => ((Math.abs(Math.round(n)) % 10) + 10) % 10)
  return digits.length > 0 ? digits : [...defaults.positions]
}

function stampTexture(w: number, h: number, paint: (data: Uint8Array) => void): DataTexture {
  const data = new Uint8Array(w * h * 4)
  fillGlyphRect(data, w, 0, 0, w, h, INK)
  paint(data)
  const tex = new DataTexture(data, w, h, RGBAFormat, UnsignedByteType)
  tex.minFilter = NearestFilter
  tex.magFilter = NearestFilter
  tex.needsUpdate = true
  tex.flipY = true
  return tex
}

/** Solid 3×5 blocks — the shared writer leaves 1 px gutters that read as dash grids at tower scale. */
function writeSolidWord(
  data: Uint8Array,
  w: number,
  ox: number,
  oy: number,
  word: string,
  rgb: readonly [number, number, number],
  cell: number,
): void {
  let i = 0
  for (const ch of word) {
    const cells = GLYPH_3X5[ch] ?? GLYPH_3X5[ch.toUpperCase()]
    if (!cells) continue
    for (let gy = 0; gy < 5; gy++) {
      for (let gx = 0; gx < 3; gx++) {
        if (!cells[gy * 3 + gx]) continue
        fillGlyphRect(data, w, ox + i * (cell * 4) + gx * cell, oy + gy * cell, cell, cell, rgb)
      }
    }
    i++
  }
}

function headerTexture(): DataTexture {
  return stampTexture(192, 80, (data) => {
    writeSolidWord(data, 192, 8, 22, 'LAP', PAPER, 7)
    writeSolidWord(data, 192, 92, 8, '16', GREEN, 13)
  })
}

function cabinetTexture(digit: number, row: number): DataTexture {
  return stampTexture(160, 40, (data) => {
    const rank = String(row + 1)
    writeSolidWord(data, 160, 6, 3, rank, row < 9 ? YELLOW : PAPER, 7)
    writeSolidWord(data, 160, 92, 3, String(digit), PAPER, 7)
  })
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
  let headerMat: Material | undefined
  let markerMat: Material | undefined

  const releaseScreens = (): void => {
    for (const texture of textures) texture.dispose()
    textures.length = 0
    if (ownsScreen) {
      for (const material of extras) material.dispose()
    }
    extras.length = 0
    slotMats = []
    headerMat = undefined
    markerMat = undefined
  }

  const buildScreens = (): void => {
    releaseScreens()
    if (!ownsScreen) {
      slotMats = config.positions.map(() => options.materials!.screen!)
      headerMat = options.materials!.screen!
      markerMat = options.materials!.screen!
      return
    }
    slotMats = config.positions.map((digit, i) => {
      const tex = cabinetTexture(digit, i)
      textures.push(tex)
      const material = new MeshBasicMaterial({
        name: `f1-kit / timing-pylon row ${i}`,
        map: tex,
        toneMapped: false,
      })
      extras.push(material)
      return material
    })
    const lap = headerTexture()
    textures.push(lap)
    headerMat = new MeshBasicMaterial({
      name: 'f1-kit / timing-pylon lap header',
      map: lap,
      toneMapped: false,
    })
    extras.push(headerMat)
    markerMat = new MeshBasicMaterial({
      name: 'f1-kit / timing-pylon beacon',
      color: TOKEN.RED_500,
      toneMapped: false,
    })
    extras.push(markerMat)
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
    const bladeBottom = 0.24
    const bladeH = height - bladeBottom
    const blade = bevelBox(CAB_W + 0.12, bladeH, MAST_D, 0.018)
    const bladePosition = blade.getAttribute('position')
    for (let i = 0; i < bladePosition.count; i++) {
      const t = bladePosition.getY(i) / bladeH + 0.5
      bladePosition.setX(i, bladePosition.getX(i) * (1 - t * 0.11))
    }
    bladePosition.needsUpdate = true
    blade.computeVertexNormals()
    blade.translate(0, bladeBottom + bladeH / 2, 0)
    parts.push(blade)
    const rearSpine = bevelBox(0.16, height * 0.9, 0.11, 0.012)
    rearSpine.translate(0, height * 0.47, -0.15)
    parts.push(rearSpine)
    const pad = bevelBox(0.68, 0.07, 0.52, 0.012)
    pad.translate(0, 0.035, 0)
    parts.push(pad)
    const neck = bevelBox(0.32, 0.2, 0.3, 0.018)
    neck.translate(0, 0.14, 0)
    parts.push(neck)
    const crown = bevelBox(CAB_W * 0.82, 0.5, MAST_D + 0.02, 0.035)
    crown.translate(0, height - 0.29, 0.01)
    parts.push(crown)
    emit('frame', mergeParts(parts, 'frame'), frame, 'frame')

    const headerH = 0.95
    const rowsTop = height - headerH - 0.08
    const rowsBottom = 0.38
    const rowH = (rowsTop - rowsBottom) / count
    const screenZ = MAST_D / 2 + LAYER_CLEARANCE
    const header = new PlaneGeometry(CAB_W - 0.08, headerH - 0.08)
    header.translate(0, height - headerH / 2 - 0.12, screenZ)
    emit('screen', header, frame, 'lap-header', headerMat ?? materialSlots.screen)
    for (let i = 0; i < count; i++) {
      const y = rowsTop - (i + 0.5) * rowH
      const panel = new PlaneGeometry(CAB_W - 0.10, rowH - 0.012)
      panel.translate(0, y, screenZ)
      emit('screen', panel, screens, `slot-${i}`, slotMats[i] ?? materialSlots.screen)
    }
    const beacon = bevelBox(0.10, 0.14, 0.10, 0.02)
    beacon.translate(0, height - 0.08, 0.02)
    emit('screen', beacon, frame, 'beacon', markerMat ?? materialSlots.screen)
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
  return createF1Preview(createModel({
    positions: [1, 4, 6, 3, 5, 4, 1, 8, 2, 3, 0, 8, 1, 7, 2, 0, 3, 7, 5, 9, 2, 6, 4, 8, 1, 3, 0, 7, 5, 2, 9, 4, 6],
  }), {
    aspect,
    target: [0, 4.7, 0.12],
    distance: 21.5,
    fov: 32,
    pitch: 0.04,
    yaw: -0.10,
  })
}
