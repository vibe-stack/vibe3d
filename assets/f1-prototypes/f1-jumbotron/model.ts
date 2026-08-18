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
  fillGlyphRect,
  member,
  mergeParts,
  writeGlyphWord,
} from '../f1-kit-core/index.ts'

type Slot = 'frame' | 'screen' | 'leg'

/** One timing-sheet row. `code` is a short alphanumeric — never a driver or team name. */
export interface F1JumbotronEntry {
  p: number
  code?: string
  lap: number | string
  time: string
}

export interface F1JumbotronConfig {
  width: number
  entries: readonly F1JumbotronEntry[]
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

const DEFAULT_ENTRIES: readonly F1JumbotronEntry[] = [
  { p: 1, code: 'A1', lap: 14, time: '1:22.4' },
  { p: 2, code: 'B2', lap: 14, time: '1:22.7' },
  { p: 3, code: 'C3', lap: 14, time: '1:23.1' },
  { p: 4, code: 'D4', lap: 13, time: '1:23.4' },
]

const defaults: F1JumbotronConfig = { width: 8, entries: DEFAULT_ENTRIES }

function sanitizeCode(code: string | undefined): string | undefined {
  if (!code) return undefined
  const next = code.replace(/[^0-9A-Za-z-]/g, '').slice(0, 4).toUpperCase()
  return next || undefined
}

function normalizeEntries(entries: readonly F1JumbotronEntry[]): F1JumbotronEntry[] {
  const rows = entries.slice(0, 8).map((entry, i) => ({
    p: Math.max(1, Math.round(entry.p || i + 1)),
    code: sanitizeCode(entry.code),
    lap: entry.lap,
    time: String(entry.time ?? ''),
  }))
  return rows.length > 0 ? rows : [...DEFAULT_ENTRIES]
}

function timingSheet(entries: readonly F1JumbotronEntry[]): DataTexture {
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
  fillGlyphRect(data, w, 0, 0, w, h, ink)
  fillGlyphRect(data, w, 0, 0, w, 72, accent)
  fillGlyphRect(data, w, 0, h - 28, w, 28, accent)
  writeGlyphWord(data, w, 16, 8, 'P', paper, 14)
  writeGlyphWord(data, w, 120, 8, 'LAP', paper, 14)
  writeGlyphWord(data, w, 300, 8, 'TIME', paper, 14)
  const n = Math.max(1, entries.length)
  const rowH = Math.max(22, Math.floor((h - 84 - 28) / n))
  for (let row = 0; row < n; row++) {
    const entry = entries[row]!
    const y = 84 + row * rowH
    if (row % 2 === 1) fillGlyphRect(data, w, 0, y, w, rowH, [12, 16, 22])
    writeGlyphWord(data, w, 18, y + 6, String(entry.p), paper, 6)
    if (entry.code) {
      writeGlyphWord(data, w, 70, y + 6, entry.code, cyan, 6)
    } else {
      fillGlyphRect(data, w, 70, y + 8, 90, 20, cyan)
    }
    writeGlyphWord(data, w, 220, y + 6, String(entry.lap), paper, 6)
    writeGlyphWord(data, w, 310, y + 6, entry.time, paper, 6)
  }
  const tex = new DataTexture(data, w, h, RGBAFormat, UnsignedByteType)
  tex.minFilter = NearestFilter
  tex.magFilter = NearestFilter
  tex.needsUpdate = true
  tex.flipY = true
  return tex
}

export function createModel(options: F1JumbotronOptions = {}): F1JumbotronInstance {
  const config: F1JumbotronConfig = {
    width: Math.max(3, options.width ?? defaults.width),
    entries: normalizeEntries(options.entries ?? defaults.entries),
  }

  const bundle = acquireF1Materials()
  const kit = bundle.materials
  const extras: Material[] = []
  const textures: DataTexture[] = []
  const own = (material: Material): Material => {
    extras.push(material)
    return material
  }
  const ownsScreen = options.materials?.screen === undefined
  let tex = timingSheet(config.entries)
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

  const applySheet = (): void => {
    const next = timingSheet(config.entries)
    const previous = textures.pop()
    previous?.dispose()
    textures.push(next)
    tex = next
    if (ownsScreen) {
      const material = screenMat as MeshBasicMaterial
      material.map = next
      material.needsUpdate = true
    }
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

    // LED face carries P/LAP/TIME — no second 3D glyph layer (that clipped the header bar).
    const panel = new PlaneGeometry(w, h)
    panel.translate(0, y, 0.18)
    emit('screen', panel, screen, 'panel')
  }
  rebuild()

  return {
    root,
    parts: { frame, screen },
    materials: materialSlots,
    getConfig: () => ({ width: config.width, entries: config.entries.map((entry) => ({ ...entry })) }),
    configure(patch) {
      let dirtyGeo = false
      let dirtySheet = false
      if (patch.width !== undefined) {
        config.width = Math.max(3, patch.width)
        dirtyGeo = true
      }
      if (patch.entries !== undefined) {
        config.entries = normalizeEntries(patch.entries)
        dirtySheet = true
      }
      if (dirtySheet) applySheet()
      if (dirtyGeo) rebuild()
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
