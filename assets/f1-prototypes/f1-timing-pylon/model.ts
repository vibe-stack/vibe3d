// f1-timing-pylon — a tall scoring tower: steel frame, three stacked LED slots, generic DataTexture
// rows (position bars only — no names or teams). configure({ height }).

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

function slotTexture(): DataTexture {
  const w = 64
  const h = 256
  const data = new Uint8Array(w * h * 4)
  const ink = [6, 10, 16]
  const cyan: [number, number, number] = [
    (TOKEN.CYAN_400 >> 16) & 0xff,
    (TOKEN.CYAN_400 >> 8) & 0xff,
    TOKEN.CYAN_400 & 0xff,
  ]
  const paper: [number, number, number] = [230, 240, 245]
  for (let i = 0; i < w * h; i++) {
    data[i * 4] = ink[0]!
    data[i * 4 + 1] = ink[1]!
    data[i * 4 + 2] = ink[2]!
    data[i * 4 + 3] = 255
  }
  for (let row = 0; row < 12; row++) {
    const y0 = 12 + row * 20
    for (let y = y0; y < y0 + 14; y++) {
      for (let x = 6; x < w - 6; x++) {
        const i = (y * w + x) * 4
        const bar = x < 18
        data[i] = bar ? paper[0] : cyan[0]
        data[i + 1] = bar ? paper[1] : cyan[1]
        data[i + 2] = bar ? paper[2] : cyan[2]
      }
    }
  }
  const tex = new DataTexture(data, w, h, RGBAFormat, UnsignedByteType)
  tex.minFilter = LinearFilter
  tex.magFilter = LinearFilter
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
  const screenMat = options.materials?.screen ?? own(new MeshStandardMaterial({
    name: 'f1-kit / timing-pylon screen',
    map: tex,
    color: 0x000000,
    emissive: 0xffffff,
    emissiveMap: tex,
    emissiveIntensity: 0.7,
    roughness: 0.3,
    metalness: 0,
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
    const { height } = config
    const parts: BufferGeometry[] = []
    const mast = bevelBox(0.42, height, 0.32, 0.02)
    mast.translate(0, height / 2, 0)
    parts.push(mast)
    const pad = bevelBox(1.1, 0.12, 0.9, 0.015)
    pad.translate(0, 0.06, 0)
    parts.push(pad)
    const cap = bevelBox(0.55, 0.14, 0.4, 0.015)
    cap.translate(0, height + 0.05, 0)
    parts.push(cap)
    // Chevrons / arrow fin on top.
    parts.push(tubeSection(0.04, 0.55, [0, height + 0.4, 0], [0, 1, 0], 8))
    emit('frame', mergeParts(parts, 'frame'), frame, 'frame')

    const screensGeo: BufferGeometry[] = []
    for (let i = 0; i < 3; i++) {
      const panel = bevelBox(0.72, height * 0.22, 0.06, 0.008)
      panel.translate(0, height * (0.28 + i * 0.24), 0.2)
      screensGeo.push(panel)
    }
    emit('screen', mergeParts(screensGeo, 'screens'), screens, 'screens')
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
  return createF1Preview(createModel(), { aspect, target: [0, 4.6, 0.15], distance: 12, fov: 30 })
}
