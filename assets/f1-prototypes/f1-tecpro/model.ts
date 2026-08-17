// f1-tecpro — stacked polyethylene energy-absorbing barriers. Each block is a lofted stadium section
// with a recessed front handle — the interlocking TecPro silhouette, not a cube.
// configure({ columns, rows }). Default wrap is amber (the common yellow TecPro), foam is shell.

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
  loftAlongX,
  mergeParts,
  tubeSection,
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
const BW = 1.05
const BH = 0.52
const BD = 0.48

function blockProfile(): Array<readonly [number, number]> {
  const h = BH - 0.04
  const d = BD / 2
  return [
    [-d + 0.04, 0],
    [-d, 0.06],
    [-d - 0.03, h * 0.45],
    [-d, h - 0.06],
    [-d + 0.04, h],
    [d - 0.04, h],
    [d, h - 0.06],
    [d, 0.06],
    [d - 0.04, 0],
  ]
}

export function createModel(options: F1TecproOptions = {}): F1TecproInstance {
  const config: F1TecproConfig = {
    columns: Math.max(1, Math.round(options.columns ?? defaults.columns)),
    rows: Math.max(1, Math.round(options.rows ?? defaults.rows)),
  }

  const bundle = acquireF1Materials()
  const kit = bundle.materials
  const materialSlots: Record<Slot, Material> = {
    block: options.materials?.block ?? kit.shell,
    wrap: options.materials?.wrap ?? kit.amber,
    strap: options.materials?.strap ?? kit.graphite,
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
    const foam: BufferGeometry[] = []
    const wrap: BufferGeometry[] = []
    const handles: BufferGeometry[] = []
    const half = ((columns - 1) * BW) / 2
    const profile = blockProfile()

    for (let c = 0; c < columns; c++) {
      for (let r = 0; r < rows; r++) {
        const x = -half + c * BW
        const y = 0.02 + r * BH
        const body = loftAlongX(profile, BW - 0.06, { closed: true })
        body.translate(x, y, 0)
        wrap.push(body)
        const core = loftAlongX(
          profile.map(([z, py]) => [z * 0.82, py * 0.82 + 0.04] as const),
          BW - 0.14,
          { closed: true },
        )
        core.translate(x, y, 0)
        foam.push(core)
        const recess = bevelBox(0.22, 0.1, 0.06, 0.008)
        recess.translate(x, y + BH * 0.55, BD / 2 - 0.02)
        handles.push(recess)
        handles.push(tubeSection(0.018, 0.28, [x, y + BH * 0.55, BD / 2 + 0.04], [1, 0, 0], 8))
      }
    }

    emit('wrap', mergeParts(wrap, 'wrap'), blocks, 'wrap')
    emit('block', mergeParts(foam, 'foam'), blocks, 'foam')
    emit('strap', mergeParts(handles, 'handles'), straps, 'handles')
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
  return createF1Preview(createModel(), { aspect, target: [0, 0.55, 0.1], distance: 5.8, fov: 30 })
}
