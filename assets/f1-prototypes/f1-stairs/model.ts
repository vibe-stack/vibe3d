// f1-stairs — steel flight + landing that mates to f1-grandstand-bay / pit wall.

import { BufferGeometry, Group, Mesh, type Material } from 'three/webgpu'

import {
  acquireF1Materials,
  bevelBox,
  createF1Preview,
  disposeF1Materials,
  mergeParts,
  tubeSection,
  AXIS_Z,
} from '../f1-kit-core/index.ts'

type Slot = 'tread' | 'rail'

export interface F1StairsConfig {
  steps: number
  width: number
}

export interface F1StairsOptions extends Partial<F1StairsConfig> {
  materials?: Partial<Record<Slot, Material>>
}

export interface F1StairsInstance {
  readonly root: Group
  readonly parts: { treads: Group; rails: Group }
  readonly materials: Readonly<Record<Slot, Material>>
  getConfig(): Readonly<F1StairsConfig>
  configure(patch: Partial<F1StairsConfig>): void
  setMaterial(slot: Slot, material: Material): void
  update(deltaSeconds: number): void
  dispose(): void
}

const defaults: F1StairsConfig = { steps: 8, width: 1.2 }
const RISE = 0.18
const RUN = 0.28

export function createModel(options: F1StairsOptions = {}): F1StairsInstance {
  const config: F1StairsConfig = {
    steps: Math.max(3, Math.round(options.steps ?? defaults.steps)),
    width: Math.max(0.8, options.width ?? defaults.width),
  }
  const bundle = acquireF1Materials()
  const kit = bundle.materials
  const materialSlots: Record<Slot, Material> = {
    tread: options.materials?.tread ?? kit.slate,
    rail: options.materials?.rail ?? kit.steel,
  }
  const root = new Group(); root.name = 'f1-stairs'
  const treads = new Group(); treads.name = 'treads'
  const rails = new Group(); rails.name = 'rails'
  root.add(treads, rails)
  const generated: BufferGeometry[] = []
  const meshesBySlot: Record<Slot, Mesh[]> = { tread: [], rail: [] }
  const releaseGenerated = (): void => {
    treads.clear(); rails.clear()
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
    const { steps, width } = config
    const treadParts: BufferGeometry[] = []
    const length = steps * RUN
    for (let i = 0; i < steps; i++) {
      const z = -length / 2 + (i + 0.5) * RUN
      const y = (i + 0.5) * RISE
      const tread = bevelBox(width, 0.04, RUN - 0.02, 0.006)
      tread.translate(0, y, z)
      treadParts.push(tread)
      const riser = bevelBox(width, RISE - 0.02, 0.03, 0.004)
      riser.translate(0, y - RISE / 2 + 0.02, z + RUN / 2 - 0.02)
      treadParts.push(riser)
    }
    emit('tread', mergeParts(treadParts, 'treads'), treads, 'treads')
    const railParts: BufferGeometry[] = []
    const topY = steps * RISE
    for (const sx of [-width / 2 + 0.04, width / 2 - 0.04]) {
      const start = bevelBox(0.04, topY, 0.04, 0.004)
      start.translate(sx, topY / 2, length / 2 - 0.04)
      railParts.push(start)
      const hand = tubeSection(0.018, length, [sx, topY + 0.04, 0], AXIS_Z, 8)
      railParts.push(hand)
    }
    emit('rail', mergeParts(railParts, 'rails'), rails, 'rails')
  }
  rebuild()
  return {
    root,
    parts: { treads, rails },
    materials: materialSlots,
    getConfig: () => ({ ...config }),
    configure(patch) {
      if (patch.steps !== undefined) config.steps = Math.max(3, Math.round(patch.steps))
      if (patch.width !== undefined) config.width = Math.max(0.8, patch.width)
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
  return createF1Preview(createModel({ steps: 8 }), {
    aspect, target: [0, 0.7, 0], distance: 5.4, fov: 28, yaw: -0.85, pitch: 0.22,
  })
}
