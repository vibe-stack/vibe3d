// f1-slot-drain — kerb-edge slot drain, 2 m modules along X with a grated lid.

import { BufferGeometry, Group, Mesh, type Material } from 'three/webgpu'

import {
  acquireF1Materials,
  bevelBox,
  createF1Preview,
  disposeF1Materials,
  mergeParts,
} from '../f1-kit-core/index.ts'

type Slot = 'channel' | 'grate'

export interface F1SlotDrainConfig {
  modules: number
}

export interface F1SlotDrainOptions extends Partial<F1SlotDrainConfig> {
  materials?: Partial<Record<Slot, Material>>
}

export interface F1SlotDrainInstance {
  readonly root: Group
  readonly parts: { channel: Group; grate: Group }
  readonly materials: Readonly<Record<Slot, Material>>
  getConfig(): Readonly<F1SlotDrainConfig>
  configure(patch: Partial<F1SlotDrainConfig>): void
  setMaterial(slot: Slot, material: Material): void
  update(deltaSeconds: number): void
  dispose(): void
}

const defaults: F1SlotDrainConfig = { modules: 4 }
const BAND = 2.0
const WIDTH = 0.22
const DEPTH = 0.08

export function createModel(options: F1SlotDrainOptions = {}): F1SlotDrainInstance {
  const config: F1SlotDrainConfig = {
    modules: Math.max(1, Math.round(options.modules ?? defaults.modules)),
  }
  const bundle = acquireF1Materials()
  const kit = bundle.materials
  const materialSlots: Record<Slot, Material> = {
    channel: options.materials?.channel ?? kit.graphite,
    grate: options.materials?.grate ?? kit.steel,
  }
  const root = new Group(); root.name = 'f1-slot-drain'
  const channel = new Group(); channel.name = 'channel'
  const grate = new Group(); grate.name = 'grate'
  root.add(channel, grate)
  const generated: BufferGeometry[] = []
  const meshesBySlot: Record<Slot, Mesh[]> = { channel: [], grate: [] }
  const releaseGenerated = (): void => {
    channel.clear(); grate.clear()
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
    const length = config.modules * BAND
    const trough = bevelBox(length, DEPTH, WIDTH, 0.006)
    trough.translate(0, DEPTH / 2, 0)
    emit('channel', trough, channel, 'trough')
    const bars: BufferGeometry[] = []
    const n = Math.round(length / 0.04)
    for (let i = 0; i < n; i++) {
      const x = -length / 2 + (i + 0.5) * (length / n)
      const bar = bevelBox(0.012, 0.016, WIDTH - 0.02, 0.002)
      bar.translate(x, DEPTH + 0.01, 0)
      bars.push(bar)
    }
    emit('grate', mergeParts(bars, 'grate'), grate, 'grate')
  }
  rebuild()
  return {
    root,
    parts: { channel, grate },
    materials: materialSlots,
    getConfig: () => ({ ...config }),
    configure(patch) {
      if (patch.modules !== undefined) config.modules = Math.max(1, Math.round(patch.modules))
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
  return createF1Preview(createModel({ modules: 3 }), {
    aspect, target: [0, 0.06, 0], distance: 4.2, fov: 28, yaw: -1.05, pitch: 0.4,
  })
}
