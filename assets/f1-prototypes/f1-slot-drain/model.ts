// f1-slot-drain — kerb-edge slot drain, 2 m modules along X with a grated lid and a visible centre slot.

import { BufferGeometry, Group, Mesh, type Material } from 'three/webgpu'

import {
  acquireF1Materials,
  bevelBox,
  bolt,
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
const WIDTH = 0.28
const DEPTH = 0.09
const SLOT = 0.03

export function createModel(options: F1SlotDrainOptions = {}): F1SlotDrainInstance {
  const config: F1SlotDrainConfig = {
    modules: Math.max(1, Math.round(options.modules ?? defaults.modules)),
  }

  const bundle = acquireF1Materials()
  const kit = bundle.materials
  const materialSlots: Record<Slot, Material> = {
    channel: options.materials?.channel ?? kit.shell,
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
    const channelParts: BufferGeometry[] = []
    const invert = bevelBox(length - 0.04, 0.014, WIDTH - 0.10, 0.003)
    invert.translate(0, 0.01, 0)
    channelParts.push(invert)
    for (const z of [-1, 1] as const) {
      const wall = bevelBox(length, DEPTH, 0.032, 0.004)
      wall.translate(0, DEPTH / 2, z * (WIDTH / 2 - 0.016))
      channelParts.push(wall)
      const lip = bevelBox(length, 0.024, 0.055, 0.004)
      lip.translate(0, DEPTH + 0.006, z * (WIDTH / 2 + 0.008))
      channelParts.push(lip)
    }
    for (const x of [-length / 2 + 0.025, length / 2 - 0.025]) {
      const bulkhead = bevelBox(0.05, DEPTH + 0.02, WIDTH + 0.05, 0.004)
      bulkhead.translate(x, (DEPTH + 0.02) / 2, 0)
      channelParts.push(bulkhead)
    }
    emit('channel', mergeParts(channelParts, 'channel'), channel, 'trough')

    const grateParts: BufferGeometry[] = []
    const yG = DEPTH + 0.018
    const leaf = (WIDTH - SLOT) / 2 - 0.02
    for (const z of [-1, 1] as const) {
      const inner = bevelBox(length - 0.10, 0.012, 0.012, 0.002)
      inner.translate(0, yG, z * (SLOT / 2 + 0.008))
      grateParts.push(inner)
      const outer = bevelBox(length - 0.10, 0.012, 0.012, 0.002)
      outer.translate(0, yG, z * (WIDTH / 2 - 0.04))
      grateParts.push(outer)
    }
    const n = Math.round(length / 0.048)
    for (let i = 0; i < n; i++) {
      const x = -length / 2 + 0.08 + (i + 0.5) * ((length - 0.16) / n)
      for (const z of [-1, 1] as const) {
        const bar = bevelBox(0.01, 0.014, leaf, 0.002)
        bar.translate(x, yG, z * (SLOT / 2 + leaf / 2 + 0.006))
        grateParts.push(bar)
      }
    }
    for (const x of [-length / 4, length / 4]) {
      grateParts.push(bolt([x, yG + 0.008, WIDTH / 2 - 0.03], 0.008, 0.01))
      grateParts.push(bolt([x, yG + 0.008, -(WIDTH / 2 - 0.03)], 0.008, 0.01))
    }
    emit('grate', mergeParts(grateParts, 'grate'), grate, 'grate')
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
    aspect, target: [0, 0.05, 0], distance: 3.6, fov: 28, yaw: -0.95, pitch: 0.52,
  })
}
