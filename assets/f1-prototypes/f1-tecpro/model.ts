// f1-tecpro — a modern energy-absorbing barrier: stacked foam blocks in a plastic wrap,
// cinched with straps. Invented for the kit — the racing game has Armco and tyre walls, not TecPro.

import {
  BufferGeometry,
  Group,
  Mesh,
  type Material,
} from 'three/webgpu'

import {
  acquireF1Materials,
  bevelBox,
  createF1Preview,
  disposeF1Materials,
  mergeParts,
  wrapStrap,
} from '../f1-kit-core/index.ts'

type Slot = 'block' | 'wrap' | 'strap'

export interface F1TecproConfig {
  /** Blocks along local +X. */
  columns: number
  /** Courses high. */
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
const BW = 0.85
const BH = 0.52
const BD = 0.48

export function createModel(options: F1TecproOptions = {}): F1TecproInstance {
  const config: F1TecproConfig = {
    columns: Math.max(1, Math.round(options.columns ?? defaults.columns)),
    rows: Math.max(1, Math.round(options.rows ?? defaults.rows)),
  }

  const bundle = acquireF1Materials()
  const kit = bundle.materials
  const materialSlots: Record<Slot, Material> = {
    block: options.materials?.block ?? kit.orange,
    wrap: options.materials?.wrap ?? kit.shell,
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
    const blockParts: BufferGeometry[] = []
    const wrapParts: BufferGeometry[] = []
    const strapParts: BufferGeometry[] = []
    const half = ((columns - 1) * BW) / 2

    for (let c = 0; c < columns; c++) {
      for (let r = 0; r < rows; r++) {
        const x = -half + c * BW
        const y = BH / 2 + r * BH
        const foam = bevelBox(BW - 0.04, BH - 0.03, BD - 0.06, 0.04)
        foam.translate(x, y, 0)
        blockParts.push(foam)
        const sleeve = bevelBox(BW - 0.01, BH - 0.01, BD, 0.02)
        sleeve.translate(x, y, 0)
        wrapParts.push(sleeve)
        strapParts.push(wrapStrap(Math.max(BW, BH) * 0.38, [x, y, BD / 2 - 0.02], 0.045, 0.012, 24))
      }
    }

    emit('block', mergeParts(blockParts, 'foam'), blocks, 'foam')
    emit('wrap', mergeParts(wrapParts, 'wrap'), blocks, 'wrap')
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
      disposeF1Materials(bundle)
      root.removeFromParent()
    },
  }
}

export function createPreview({ aspect }: { aspect: number; time?: number }) {
  return createF1Preview(createModel(), { aspect, target: [0, 0.55, 0], distance: 5.4, fov: 32 })
}
