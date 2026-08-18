// f1-jumbotron — trackside broadcast installation with a continuous LED video wall,
// symmetric braced truss towers, ballast, rear stabilization, speaker arrays, services,
// access equipment, and safety barriers. The video feed remains deterministic and generic.

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
  const h = 288
  const data = new Uint8Array(w * h * 4)
  for (let py = 0; py < h; py++) {
    for (let px = 0; px < w; px++) {
      const x = px / w
      const y = py / h
      const centre = 0.57 + Math.sin(x * 5.2 - 0.9) * 0.12
      const trackDistance = Math.abs(y - centre)
      const horizon = y < 0.42
      const base = horizon ? 12 + Math.floor(y * 22) : 7
      const offset = (py * w + px) * 4
      data[offset] = base
      data[offset + 1] = base + (horizon ? 10 : 4)
      data[offset + 2] = base + (horizon ? 15 : 7)
      if (trackDistance < 0.115) {
        const shade = 42 + Math.floor((0.115 - trackDistance) * 90)
        data[offset] = shade
        data[offset + 1] = shade + 2
        data[offset + 2] = shade + 7
      }
      if (trackDistance > 0.103 && trackDistance < 0.122) {
        const kerb = Math.floor(x * 38) % 2 === 0
        data[offset] = kerb ? 210 : 230
        data[offset + 1] = kerb ? 26 : 230
        data[offset + 2] = kerb ? 34 : 230
      }
      data[offset + 3] = 255
    }
  }
  const pale: [number, number, number] = [224, 233, 240]
  const cyan: [number, number, number] = [42, 190, 224]
  const red: [number, number, number] = [225, 42, 48]
  fillGlyphRect(data, w, 0, 0, 76, 26, [4, 7, 12])
  writeGlyphWord(data, w, 8, 5, 'LIVE', pale, 3)
  fillGlyphRect(data, w, 8, 32, 52, 6, red)
  const carCount = Math.max(3, Math.min(7, entries.length + 1))
  for (let i = 0; i < carCount; i++) {
    const x = 178 + i * 39
    const y = 163 + Math.round(Math.sin((x / w) * 5.2 - 0.9) * h * 0.12)
    fillGlyphRect(data, w, x, y, 18, 7, i % 2 === 0 ? cyan : red)
    fillGlyphRect(data, w, x + 4, y - 4, 10, 4, pale)
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
    color: 0x59636c,
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
    const h = w * 0.5625
    const elev = 2.85
    const y = elev + h / 2
    const half = w / 2
    const towerX = half + 0.58
    const towerTop = elev + h + 0.24
    const legs: BufferGeometry[] = []
    for (const sx of [-1, 1] as const) {
      const x = sx * towerX
      for (const dx of [-0.2, 0.2]) {
        for (const z of [-0.34, 0.34]) {
          legs.push(member(new Vector3(x + dx, 0.12, z), new Vector3(x + dx, towerTop, z), 0.065, 8))
        }
      }
      for (let i = 0; i < 7; i++) {
        const y0 = 0.18 + i * (towerTop - 0.2) / 7
        const y1 = 0.18 + (i + 1) * (towerTop - 0.2) / 7
        for (const z of [-0.34, 0.34]) {
          legs.push(member(new Vector3(x - 0.2, y0, z), new Vector3(x + 0.2, y1, z), 0.028, 6))
          legs.push(member(new Vector3(x + 0.2, y0, z), new Vector3(x - 0.2, y1, z), 0.028, 6))
        }
      }
      for (const dx of [-0.2, 0.2]) {
        legs.push(member(new Vector3(x + dx, 0.25, -0.34), new Vector3(x + dx, 2.2, -1.35), 0.055, 8))
        const ballast = bevelBox(0.52, 0.18, 0.62, 0.025)
        ballast.translate(x + dx, 0.09, -0.05)
        legs.push(ballast)
      }
      const rearBallast = bevelBox(0.72, 0.22, 0.62, 0.025)
      rearBallast.translate(x, 0.11, -1.42)
      legs.push(rearBallast)
    }
    emit('leg', mergeParts(legs, 'truss-towers'), frame, 'truss-towers')

    const installation: BufferGeometry[] = []
    const housing = bevelBox(w + 0.34, h + 0.34, 0.34, 0.025)
    housing.translate(0, y, -0.06)
    installation.push(housing)
    const hood = bevelBox(w + 0.48, 0.16, 0.62, 0.018)
    hood.translate(0, y + h / 2 + 0.16, 0.02)
    installation.push(hood)
    const walk = bevelBox(w + 0.4, 0.07, 0.72, 0.01)
    walk.translate(0, elev - 0.18, -0.43)
    installation.push(walk)
    for (const sx of [-1, 1] as const) {
      const x = sx * (half + 0.38)
      for (let i = 0; i < 4; i++) {
        const speaker = bevelBox(0.38, 0.5, 0.42, 0.025)
        speaker.translate(x, y + 0.72 - i * 0.55, 0.05 + i * 0.018)
        installation.push(speaker)
      }
      const control = bevelBox(0.58, 0.82, 0.4, 0.025)
      control.translate(sx * (towerX - 0.02), 1.18, -0.57)
      installation.push(control)
      for (let cable = 0; cable < 3; cable++) {
        installation.push(member(
          new Vector3(x + sx * cable * 0.035, elev + 0.2, -0.24),
          new Vector3(sx * (towerX - 0.04), 1.52 - cable * 0.12, -0.38),
          0.018,
          6,
        ))
      }
    }
    for (let rung = 0; rung < 9; rung++) {
      const rungY = 0.48 + rung * 0.28
      installation.push(member(new Vector3(towerX - 0.16, rungY, -0.48), new Vector3(towerX + 0.16, rungY, -0.48), 0.018, 6))
    }
    emit('frame', mergeParts(installation, 'broadcast-installation'), frame, 'broadcast-installation')

    const barriers: BufferGeometry[] = []
    for (const z of [0.92, -1.85]) {
      for (const sx of [-1, 1] as const) {
        const start = sx * (half + 1.25)
        const end = sx * 0.55
        barriers.push(member(new Vector3(start, 0.62, z), new Vector3(end, 0.62, z), 0.035, 8))
        for (let i = 0; i < 4; i++) {
          const x = start + (end - start) * i / 3
          barriers.push(member(new Vector3(x, 0.05, z), new Vector3(x, 0.66, z), 0.028, 8))
        }
      }
    }
    emit('leg', mergeParts(barriers, 'safety-barriers'), frame, 'safety-barriers')

    const panel = new PlaneGeometry(w, h)
    panel.translate(0, y, 0.12)
    emit('screen', panel, screen, 'continuous-led-video')
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
    target: [0, 3.15, -0.08],
    distance: 15.2,
    fov: 32,
    pitch: 0.04,
    yaw: -0.22,
  })
}
