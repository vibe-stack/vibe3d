// f1-tecpro — stacked polyethylene energy-absorbing barriers. Each block is a lofted stadium
// section with interlocking end teeth and a recessed front handle — not a cube, not grey.
// configure({ columns, rows }). Wrap is TOKEN.AMBER_400 (the common yellow TecPro).

import { BufferGeometry, Group, Mesh, MeshStandardMaterial, type Material } from 'three/webgpu'

import {
  TOKEN,
  acquireF1Materials,
  bevelBox,
  createF1Preview,
  disposeF1Materials,
  mergeParts,
  shade,
} from '../f1-kit-core/index.ts'

type Slot = 'block' | 'wrap' | 'strap'

export interface F1TecproConfig {
  columns: number
  rows: number
}

export interface F1TecproOptions extends Partial<F1TecproConfig> {
  materials?: Partial<Record<Slot, Material>>
}

export interface F1TecproInstance {
  readonly root: Group
  readonly parts: { blocks: Group; straps: Group }
  readonly materials: Readonly<Record<Slot, Material>>
  getConfig(): Readonly<F1TecproConfig>
  configure(patch: Partial<F1TecproConfig>): void
  setMaterial(slot: Slot, material: Material): void
  update(deltaSeconds: number): void
  dispose(): void
}

const defaults: F1TecproConfig = { columns: 3, rows: 2 }
// TecPro R1 manufacturer dimensions: 150 × 120 × 58 cm.
const BW = 1.50
const BH = 1.20
const BD = 0.58

export function createModel(options: F1TecproOptions = {}): F1TecproInstance {
  const config: F1TecproConfig = {
    columns: Math.max(1, Math.round(options.columns ?? defaults.columns)),
    rows: Math.max(1, Math.round(options.rows ?? defaults.rows)),
  }

  const bundle = acquireF1Materials()
  const kit = bundle.materials
  const extras: Material[] = []
  const own = (material: Material): Material => {
    extras.push(material)
    return material
  }
  const materialSlots: Record<Slot, Material> = {
    block: options.materials?.block ?? own(new MeshStandardMaterial({
      name: 'f1-kit / TecPro polymer shadow',
      color: shade(TOKEN.AMBER_400, -0.22),
      roughness: 0.78,
      metalness: 0,
    })),
    wrap: options.materials?.wrap ?? own(new MeshStandardMaterial({
      name: 'f1-kit / TecPro polymer',
      color: TOKEN.AMBER_400,
      roughness: 0.62,
      metalness: 0.04,
    })),
    strap: options.materials?.strap ?? kit.ink,
  }

  const root = new Group()
  root.name = 'f1-tecpro'
  const blocks = new Group(); blocks.name = 'blocks'
  const straps = new Group(); straps.name = 'straps'
  root.add(blocks, straps)

  const generated: BufferGeometry[] = []
  const meshesBySlot: Record<Slot, Mesh[]> = { block: [], wrap: [], strap: [] }

  const releaseGenerated = (): void => {
    for (const group of [blocks, straps]) group.clear()
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
    const { columns, rows } = config
    const wrap: BufferGeometry[] = []
    const shadow: BufferGeometry[] = []
    const strapParts: BufferGeometry[] = []
    const half = ((columns - 1) * BW) / 2

    for (let c = 0; c < columns; c++) {
      for (let r = 0; r < rows; r++) {
        const x = -half + c * BW
        const y = 0.02 + r * BH
        const shell = bevelBox(BW - 0.04, BH - 0.03, BD, 0.10)
        shell.translate(x, y + BH / 2, 0)
        wrap.push(shell)

        for (let rib = 0; rib < 4; rib++) {
          const groove = bevelBox(BW - 0.18, 0.055, 0.04, 0.008)
          groove.translate(x, y + 0.22 + rib * 0.26, BD / 2 + 0.006)
          shadow.push(groove)
        }

        const handle = bevelBox(0.46, 0.11, 0.07, 0.02)
        handle.translate(x, y + BH * 0.62, BD / 2 + 0.01)
        shadow.push(handle)
        const handleLip = bevelBox(0.52, 0.02, 0.03, 0.004)
        handleLip.translate(x, y + BH * 0.62 + 0.07, BD / 2 + 0.012)
        wrap.push(handleLip)

        for (let t = 0; t < 3; t++) {
          const ty = y + 0.28 + t * 0.32
          const tooth = bevelBox(0.11, 0.16, 0.22, 0.02)
          tooth.translate(x + BW / 2 - 0.02, ty, 0)
          wrap.push(tooth)
          const socket = bevelBox(0.10, 0.14, 0.20, 0.016)
          socket.translate(x - BW / 2 + 0.02, ty, 0)
          shadow.push(socket)
        }

        for (const t of [0.28, 0.72] as const) {
          const strap = bevelBox(0.09, BH * 0.9, 0.022, 0.006)
          strap.translate(x - BW / 2 + t * BW, y + BH / 2, BD / 2 + 0.016)
          strapParts.push(strap)
          const buckle = bevelBox(0.11, 0.08, 0.03, 0.006)
          buckle.translate(x - BW / 2 + t * BW, y + BH * 0.82, BD / 2 + 0.02)
          strapParts.push(buckle)
        }
      }
    }

    emit('wrap', mergeParts(wrap, 'wrap'), blocks, 'wrap')
    emit('block', mergeParts(shadow, 'shadow'), blocks, 'handles')
    emit('strap', mergeParts(strapParts, 'straps'), straps, 'straps')
  }
  rebuild()

  return {
    root,
    parts: { blocks, straps },
    materials: materialSlots,
    getConfig: () => ({ ...config }),
    configure(patch) {
      if (patch.columns !== undefined) config.columns = Math.max(1, Math.round(patch.columns))
      if (patch.rows !== undefined) config.rows = Math.max(1, Math.round(patch.rows))
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
  return createF1Preview(createModel({ columns: 2, rows: 2 }), {
    aspect,
    target: [0, 1.15, 0],
    distance: 6.4,
    fov: 28,
    yaw: -0.55,
    pitch: 0.18,
  })
}
