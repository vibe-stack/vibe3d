// f1-pa-horn — speaker cluster on a stub mast.

import { BufferGeometry, Group, Mesh, type Material } from 'three/webgpu'

import {
  acquireF1Materials,
  bevelBox,
  createF1Preview,
  disposeF1Materials,
  mergeParts,
  tubeSection,
  AXIS_Y,
} from '../f1-kit-core/index.ts'

type Slot = 'mast' | 'horn'

export interface F1PaHornConfig {
  horns: number
}

export interface F1PaHornOptions extends Partial<F1PaHornConfig> {
  materials?: Partial<Record<Slot, Material>>
}

export interface F1PaHornInstance {
  readonly root: Group
  readonly parts: { mast: Group; horns: Group }
  readonly materials: Readonly<Record<Slot, Material>>
  getConfig(): Readonly<F1PaHornConfig>
  configure(patch: Partial<F1PaHornConfig>): void
  setMaterial(slot: Slot, material: Material): void
  update(deltaSeconds: number): void
  dispose(): void
}

const defaults: F1PaHornConfig = { horns: 4 }

export function createModel(options: F1PaHornOptions = {}): F1PaHornInstance {
  const config: F1PaHornConfig = {
    horns: Math.max(1, Math.round(options.horns ?? defaults.horns)),
  }

  const bundle = acquireF1Materials()
  const kit = bundle.materials
  const materialSlots: Record<Slot, Material> = {
    mast: options.materials?.mast ?? kit.graphite,
    horn: options.materials?.horn ?? kit.slate,
  }

  const root = new Group(); root.name = 'f1-pa-horn'
  const mast = new Group(); mast.name = 'mast'
  const horns = new Group(); horns.name = 'horns'
  root.add(mast, horns)

  const generated: BufferGeometry[] = []
  const meshesBySlot: Record<Slot, Mesh[]> = { mast: [], horn: [] }

  const releaseGenerated = (): void => {
    mast.clear(); horns.clear()
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
    emit('mast', tubeSection(0.05, 2.2, [0, 1.1, 0], AXIS_Y, 12), mast, 'post')
    const foot = bevelBox(0.32, 0.05, 0.32, 0.008)
    foot.translate(0, 0.025, 0)
    emit('mast', foot, mast, 'foot')
    const rack = bevelBox(0.9, 0.08, 0.14, 0.008)
    rack.translate(0, 2.05, 0)
    emit('mast', rack, mast, 'rack')

    const hornParts: BufferGeometry[] = []
    const count = config.horns
    const cols = Math.min(count, 3)
    const rows = Math.ceil(count / cols)
    let placed = 0
    for (let r = 0; r < rows && placed < count; r++) {
      for (let c = 0; c < cols && placed < count; c++) {
        const x = -0.28 + c * 0.28
        const y = 2.18 - r * 0.32
        const bell = bevelBox(0.22, 0.22, 0.18, 0.012)
        bell.translate(x, y, 0.12)
        hornParts.push(bell)
        const mouth = bevelBox(0.16, 0.16, 0.04, 0.006)
        mouth.translate(x, y, 0.22)
        hornParts.push(mouth)
        placed++
      }
    }
    emit('horn', mergeParts(hornParts, 'cluster'), horns, 'cluster')
  }
  rebuild()

  return {
    root,
    parts: { mast, horns },
    materials: materialSlots,
    getConfig: () => ({ ...config }),
    configure(patch) {
      if (patch.horns !== undefined) config.horns = Math.max(1, Math.round(patch.horns))
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
  return createF1Preview(createModel({ horns: 6 }), {
    aspect,
    target: [0, 1.8, 0],
    distance: 4.5,
    fov: 28,
    yaw: -0.3,
    pitch: 0.08,
  })
}
