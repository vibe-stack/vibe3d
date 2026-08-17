// f1-timing-pylon — a tall scoring tower with a generic LED board (no driver names).

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
  acquireF1Materials,
  bevelBox,
  createF1Preview,
  disposeF1Materials,
  mergeParts,
} from '../f1-kit-core/index.ts'
import { TOKEN } from '../f1-kit-core/index.ts'

type Slot = 'mast' | 'board' | 'lamp'

export interface F1TimingPylonConfig {
  height: number
}

export interface F1TimingPylonOptions extends Partial<F1TimingPylonConfig> {
  materials?: Partial<Record<Slot, Material>>
}

export interface F1TimingPylonInstance {
  readonly root: Group
  readonly parts: { mast: Group; board: Group }
  readonly materials: Readonly<Record<Slot, Material>>
  getConfig(): Readonly<F1TimingPylonConfig>
  configure(patch: Partial<F1TimingPylonConfig>): void
  setMaterial(slot: Slot, material: Material): void
  update(deltaSeconds: number): void
  dispose(): void
}

const defaults: F1TimingPylonConfig = { height: 9 }

function boardTexture(): DataTexture {
  const w = 128
  const h = 256
  const data = new Uint8Array(w * h * 4)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4
      const row = Math.floor(y / 18)
      const onRow = y % 18 > 3 && y % 18 < 15
      const onCol = x > 12 && x < w - 12
      const lit = onRow && onCol && row % 2 === 0
      data[i] = lit ? 36 : 8
      data[i + 1] = lit ? 220 : 10
      data[i + 2] = lit ? 255 : 14
      data[i + 3] = 255
    }
  }
  const tex = new DataTexture(data, w, h, RGBAFormat, UnsignedByteType)
  tex.minFilter = LinearFilter
  tex.magFilter = LinearFilter
  tex.needsUpdate = true
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

  const tex = boardTexture()
  textures.push(tex)
  const boardMat = options.materials?.board ?? own(new MeshStandardMaterial({
    name: 'f1-kit / timing board',
    map: tex,
    color: TOKEN.INK_950,
    roughness: 0.4,
    metalness: 0.1,
    emissive: TOKEN.CYAN_400,
    emissiveIntensity: 0.15,
    toneMapped: false,
  }))

  const materialSlots: Record<Slot, Material> = {
    mast: options.materials?.mast ?? kit.graphite,
    board: boardMat,
    lamp: options.materials?.lamp ?? kit.cyan,
  }

  const root = new Group()
  root.name = 'f1-timing-pylon'
  const mast = new Group(); mast.name = 'mast'
  const board = new Group(); board.name = 'board'
  root.add(mast, board)

  const generated: BufferGeometry[] = []
  const meshesBySlot: Record<Slot, Mesh[]> = { mast: [], board: [], lamp: [] }

  const releaseGenerated = (): void => {
    for (const group of [mast, board]) group.clear()
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
    const mastParts: BufferGeometry[] = []
    const base = bevelBox(1.1, 0.18, 1.1, 0.03)
    base.translate(0, 0.09, 0)
    mastParts.push(base)
    const lower = bevelBox(0.55, height * 0.55, 0.55, 0.03)
    lower.translate(0, height * 0.28, 0)
    mastParts.push(lower)
    const upper = bevelBox(0.38, height * 0.4, 0.38, 0.025)
    upper.translate(0, height * 0.72, 0)
    mastParts.push(upper)
    emit('mast', mergeParts(mastParts, 'mast'), mast, 'mast')

    const screen = bevelBox(1.65, height * 0.42, 0.12, 0.02)
    screen.translate(0, height * 0.62, 0.28)
    emit('board', screen, board, 'screen')
    const cap = bevelBox(0.22, 0.12, 0.22, 0.02)
    cap.translate(0, height + 0.08, 0)
    emit('lamp', cap, mast, 'beacon')
  }
  rebuild()

  return {
    root,
    parts: { mast, board },
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
  return createF1Preview(createModel(), { aspect, target: [0, 4.4, 0], distance: 16, fov: 32 })
}
