// f1-tecpro — stacked polyethylene energy-absorbing barriers. Each block is a lofted stadium section
// with interlocking end teeth and a recessed front handle — not a cube.
// configure({ columns, rows }). Default wrap is amber (the common yellow TecPro), foam is shell.

import {
  BufferGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  type Material,
} from 'three/webgpu'

import {
  acquireF1Materials,
  bevelBox,
  createF1Preview,
  disposeF1Materials,
  mergeParts,
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
      name: 'f1-kit / TecPro polymer shadow', color: 0xd2d4d1, roughness: 0.82, metalness: 0,
    })),
    wrap: options.materials?.wrap ?? own(new MeshStandardMaterial({
      name: 'f1-kit / TecPro polymer', color: 0xe7e8e5, roughness: 0.78, metalness: 0,
    })),
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
    const wrap: BufferGeometry[] = []
    const shadow: BufferGeometry[] = []
    const strapParts: BufferGeometry[] = []
    const half = ((columns - 1) * BW) / 2
    const moduleH = BH / 3
    const seam = 0.018

    for (let c = 0; c < columns; c++) {
      for (let r = 0; r < rows; r++) {
        const x = -half + c * BW
        const y = 0.02 + r * BH
        for (let module = 0; module < 3; module++) {
          const centreY = y + module * moduleH + moduleH / 2
          const bodyParts = module === 1 ? shadow : wrap
          const body = bevelBox(BW - BD / 2, moduleH - seam, BD, 0.045)
          body.translate(x + BD / 4, centreY, 0)
          bodyParts.push(body)
          const nose = new CylinderGeometry(BD / 2, BD / 2, moduleH - seam, 24, 1, false, Math.PI, Math.PI)
          nose.translate(x - BW / 2 + BD / 2, centreY, 0)
          bodyParts.push(nose)
        }
        for (let band = 1; band < 3; band++) {
          const bandY = y + band * moduleH
          for (const dx of [-0.20, 0.20] as const) {
            const strap = bevelBox(0.20, 0.032, 0.026, 0.006)
            strap.translate(x + dx, bandY, BD / 2 + 0.016)
            strapParts.push(strap)
          }
        }
        const buckle = bevelBox(0.035, 0.16, 0.03, 0.005)
        buckle.translate(x - 0.20, y + BH / 2, BD / 2 + 0.02)
        strapParts.push(buckle)
      }
    }

    if (wrap.length) emit('wrap', mergeParts(wrap, 'wrap'), blocks, 'wrap')
    if (shadow.length) emit('block', mergeParts(shadow, 'shadow'), blocks, 'shadow')
    if (strapParts.length) emit('strap', mergeParts(strapParts, 'straps'), straps, 'straps')
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
  return createF1Preview(createModel({ columns: 1, rows: 1 }), {
    aspect,
    target: [0, 0.62, 0.12],
    distance: 4.8,
    fov: 28,
    yaw: -0.85,
    pitch: 0.22,
  })
}
