// f1-pa-horn — flared speaker cluster on a stub mast. Bells face the camera.
// Not four grey boxes on a stick.

import { BufferGeometry, Group, Mesh, type Material } from 'three/webgpu'

import {
  acquireF1Materials,
  bevelBox,
  createF1Preview,
  disposeF1Materials,
  mergeParts,
  revolve,
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

function hornBell(): BufferGeometry {
  const geo = revolve(
    [
      [0, 0.018],
      [0.35, 0.028],
      [0.7, 0.055],
      [1, 0.11],
    ],
    { yBot: 0, yTop: 0.2, segments: 14 },
  )
  geo.rotateX(Math.PI / 2)
  return geo
}

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
    emit('mast', tubeSection(0.05, 2.15, [0, 1.08, 0], AXIS_Y, 12), mast, 'post')
    const foot = bevelBox(0.32, 0.05, 0.32, 0.008)
    foot.translate(0, 0.025, 0)
    emit('mast', foot, mast, 'foot')
    const rack = bevelBox(0.95, 0.07, 0.12, 0.008)
    rack.translate(0, 2.02, 0.02)
    emit('mast', rack, mast, 'rack')

    const hornParts: BufferGeometry[] = []
    const count = config.horns
    const cols = Math.min(count, 3)
    const rows = Math.ceil(count / cols)
    let placed = 0
    for (let r = 0; r < rows && placed < count; r++) {
      for (let c = 0; c < cols && placed < count; c++) {
        const x = (c - (cols - 1) / 2) * 0.3
        const y = 2.22 - r * 0.28
        const bell = hornBell()
        bell.rotateY((c - 1) * 0.12)
        bell.translate(x, y, 0.08)
        hornParts.push(bell)
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
    target: [0, 2.05, 0.15],
    distance: 3.6,
    fov: 28,
    yaw: -0.35,
    pitch: 0.1,
  })
}
