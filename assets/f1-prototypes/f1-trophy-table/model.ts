// f1-trophy-table — draped table to the side of the podium (FIA Appendix 5).

import { BufferGeometry, Group, Mesh, type Material } from 'three/webgpu'

import {
  TROPHY_TABLE,
  acquireF1Materials,
  bevelBox,
  createF1Preview,
  disposeF1Materials,
  mergeParts,
} from '../f1-kit-core/index.ts'

type Slot = 'top' | 'cloth' | 'legs'

export interface F1TrophyTableConfig {
  width: number
}

export interface F1TrophyTableOptions extends Partial<F1TrophyTableConfig> {
  materials?: Partial<Record<Slot, Material>>
}

export interface F1TrophyTableInstance {
  readonly root: Group
  readonly parts: { top: Group; cloth: Group; legs: Group }
  readonly materials: Readonly<Record<Slot, Material>>
  getConfig(): Readonly<F1TrophyTableConfig>
  configure(patch: Partial<F1TrophyTableConfig>): void
  setMaterial(slot: Slot, material: Material): void
  update(deltaSeconds: number): void
  dispose(): void
}

const defaults: F1TrophyTableConfig = { width: TROPHY_TABLE.width }

export function createModel(options: F1TrophyTableOptions = {}): F1TrophyTableInstance {
  const config: F1TrophyTableConfig = {
    width: Math.max(1.2, options.width ?? defaults.width),
  }
  const bundle = acquireF1Materials()
  const kit = bundle.materials
  const materialSlots: Record<Slot, Material> = {
    top: options.materials?.top ?? kit.graphite,
    cloth: options.materials?.cloth ?? kit.shell,
    legs: options.materials?.legs ?? kit.steel,
  }
  const root = new Group(); root.name = 'f1-trophy-table'
  const top = new Group(); top.name = 'top'
  const cloth = new Group(); cloth.name = 'cloth'
  const legs = new Group(); legs.name = 'legs'
  root.add(top, cloth, legs)
  const generated: BufferGeometry[] = []
  const meshesBySlot: Record<Slot, Mesh[]> = { top: [], cloth: [], legs: [] }
  const releaseGenerated = (): void => {
    top.clear(); cloth.clear(); legs.clear()
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
    const w = config.width
    const d = TROPHY_TABLE.depth
    const h = TROPHY_TABLE.height
    const slab = bevelBox(w, 0.05, d, 0.008)
    slab.translate(0, h, 0)
    emit('top', slab, top, 'slab')
    const drape = bevelBox(w + 0.04, h * 0.55, 0.02, 0.004)
    drape.translate(0, h - h * 0.275, d / 2 + 0.01)
    emit('cloth', drape, cloth, 'drape')
    const legParts: BufferGeometry[] = []
    for (const sx of [-1, 1] as const) {
      for (const sz of [-1, 1] as const) {
        const leg = bevelBox(0.05, h - 0.04, 0.05, 0.004)
        leg.translate(sx * (w / 2 - 0.08), (h - 0.04) / 2, sz * (d / 2 - 0.08))
        legParts.push(leg)
      }
    }
    emit('legs', mergeParts(legParts, 'legs'), legs, 'legs')
  }
  rebuild()
  return {
    root,
    parts: { top, cloth, legs },
    materials: materialSlots,
    getConfig: () => ({ ...config }),
    configure(patch) {
      if (patch.width !== undefined) config.width = Math.max(1.2, patch.width)
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
  return createF1Preview(createModel(), {
    aspect, target: [0, 0.4, 0], distance: 4.2, fov: 30, yaw: -0.55, pitch: 0.12,
  })
}
