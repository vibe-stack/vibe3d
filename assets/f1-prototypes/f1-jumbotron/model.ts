// f1-jumbotron — trackside LED screen on a steel truss: lattice legs, hood, walkway, speakers,
// and a generic timing-sheet DataTexture (P / LAP / TIME blocks — no names, no teams).

import {
  BufferGeometry,
  DataTexture,
  Group,
  LinearFilter,
  Mesh,
  MeshStandardMaterial,
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

function timingSheet(): DataTexture {
  const w = 256
  const h = 144
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
  fillRect(data, w, 0, 0, w, 22, accent)
  fillRect(data, w, 0, h - 18, w, 18, accent)
  // Header / footer bars as solid colour — no typeface. Body: 8 timing rows of blocks.
  for (let row = 0; row < 8; row++) {
    const y = 28 + row * 12
    if (row % 2 === 1) fillRect(data, w, 0, y, w, 12, [12, 16, 22])
    fillRect(data, w, 6, y + 3, 10, 7, paper)
    fillRect(data, w, 22, y + 3, 70, 7, cyan)
    fillRect(data, w, 100, y + 4, 40, 5, [160, 170, 180])
    fillRect(data, w, 200, y + 3, 48, 7, paper)
  }
  const tex = new DataTexture(data, w, h, RGBAFormat, UnsignedByteType)
  tex.minFilter = LinearFilter
  tex.magFilter = LinearFilter
  tex.needsUpdate = true
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
  const screenMat = options.materials?.screen ?? own(new MeshStandardMaterial({
    name: 'f1-kit / jumbotron screen',
    map: tex,
    color: 0x000000,
    emissive: 0xffffff,
    emissiveIntensity: 0.55,
    emissiveMap: tex,
    roughness: 0.35,
    metalness: 0,
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
      for (let i = 0; i < 4; i++) {
        const y0 = (i / 4) * elev
        const y1 = ((i + 1) / 4) * elev
        legs.push(member(new Vector3(x, y0, -0.35), new Vector3(x, y1, 0.15), 0.03, 6))
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

    const panel = bevelBox(w, h, 0.06, 0.008)
    panel.translate(0, y, 0.14)
    emit('screen', panel, screen, 'panel')
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
    target: [0, 4.4, 0.1],
    distance: 13,
    fov: 32,
  })
}
