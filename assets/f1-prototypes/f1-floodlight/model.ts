// f1-floodlight — a circuit flood mast: a tapered pole, a yoke, and a cluster of lamp cans.

import {
  BufferGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  Vector3,
  type Material,
} from 'three/webgpu'

import {
  acquireF1Materials,
  bevelBox,
  createF1Preview,
  disposeF1Materials,
  member,
  mergeParts,
} from '../f1-kit-core/index.ts'

type Slot = 'mast' | 'can' | 'lens'

export interface F1FloodlightConfig {
  height: number
}

export interface F1FloodlightOptions extends Partial<F1FloodlightConfig> {
  materials?: Partial<Record<Slot, Material>>
}

export interface F1FloodlightInstance {
  readonly root: Group
  readonly parts: { mast: Group; head: Group }
  readonly materials: Readonly<Record<Slot, Material>>
  getConfig(): Readonly<F1FloodlightConfig>
  configure(patch: Partial<F1FloodlightConfig>): void
  setMaterial(slot: Slot, material: Material): void
  update(deltaSeconds: number): void
  dispose(): void
}

const defaults: F1FloodlightConfig = { height: 12 }

export function createModel(options: F1FloodlightOptions = {}): F1FloodlightInstance {
  const config: F1FloodlightConfig = { height: Math.max(6, options.height ?? defaults.height) }

  const bundle = acquireF1Materials()
  const kit = bundle.materials
  const materialSlots: Record<Slot, Material> = {
    mast: options.materials?.mast ?? kit.graphite,
    can: options.materials?.can ?? kit.slate,
    lens: options.materials?.lens ?? kit.shell,
  }

  const root = new Group()
  root.name = 'f1-floodlight'
  const mast = new Group(); mast.name = 'mast'
  const head = new Group(); head.name = 'head'
  root.add(mast, head)

  const generated: BufferGeometry[] = []
  const meshesBySlot: Record<Slot, Mesh[]> = { mast: [], can: [], lens: [] }

  const releaseGenerated = (): void => {
    for (const group of [mast, head]) group.clear()
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
    const { height } = config
    const pole = new CylinderGeometry(0.07, 0.14, height, 12)
    pole.translate(0, height / 2, 0)
    emit('mast', pole, mast, 'pole')
    const base = bevelBox(0.7, 0.12, 0.7, 0.02)
    base.translate(0, 0.06, 0)
    emit('mast', base, mast, 'base')

    const yoke = member(new Vector3(-0.55, height - 0.15, 0), new Vector3(0.55, height - 0.15, 0), 0.04, 8)
    emit('can', yoke, head, 'yoke')

    const cans: BufferGeometry[] = []
    const lenses: BufferGeometry[] = []
    for (const sx of [-0.32, 0.32] as const) {
      for (const sy of [-0.18, 0.18] as const) {
        const can = new CylinderGeometry(0.16, 0.18, 0.22, 14)
        can.rotateX(-0.55)
        can.translate(sx, height - 0.35 + sy, 0.18)
        cans.push(can)
        const lens = new CylinderGeometry(0.13, 0.13, 0.03, 14)
        lens.rotateX(-0.55)
        lens.translate(sx, height - 0.35 + sy, 0.30)
        lenses.push(lens)
      }
    }
    emit('can', mergeParts(cans, 'cans'), head, 'cans')
    emit('lens', mergeParts(lenses, 'lenses'), head, 'lenses')
  }
  rebuild()

  return {
    root,
    parts: { mast, head },
    materials: materialSlots,
    getConfig: () => ({ ...config }),
    configure(patch) {
      if (patch.height !== undefined) config.height = Math.max(6, patch.height)
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
  return createF1Preview(createModel(), { aspect, target: [0, 6.2, 0], distance: 18, fov: 32 })
}
