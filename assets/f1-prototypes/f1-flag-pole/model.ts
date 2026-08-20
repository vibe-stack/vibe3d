// f1-flag-pole — pole with a blank rectangular flag.

import { BufferGeometry, Group, Mesh, type Material } from 'three/webgpu'

import {
  acquireF1Materials,
  bevelBox,
  createF1Preview,
  disposeF1Materials,
  tubeSection,
  AXIS_Y,
} from '../f1-kit-core/index.ts'

type Slot = 'pole' | 'flag'

export interface F1FlagPoleConfig {
  height: number
}

export interface F1FlagPoleOptions extends Partial<F1FlagPoleConfig> {
  materials?: Partial<Record<Slot, Material>>
}

export interface F1FlagPoleInstance {
  readonly root: Group
  readonly parts: { pole: Group; flag: Group }
  readonly materials: Readonly<Record<Slot, Material>>
  getConfig(): Readonly<F1FlagPoleConfig>
  configure(patch: Partial<F1FlagPoleConfig>): void
  setMaterial(slot: Slot, material: Material): void
  update(deltaSeconds: number): void
  dispose(): void
}

const defaults: F1FlagPoleConfig = { height: 6 }

export function createModel(options: F1FlagPoleOptions = {}): F1FlagPoleInstance {
  const config: F1FlagPoleConfig = {
    height: Math.max(3, options.height ?? defaults.height),
  }

  const bundle = acquireF1Materials()
  const kit = bundle.materials
  const materialSlots: Record<Slot, Material> = {
    pole: options.materials?.pole ?? kit.graphite,
    flag: options.materials?.flag ?? kit.shell,
  }

  const root = new Group(); root.name = 'f1-flag-pole'
  const pole = new Group(); pole.name = 'pole'
  const flag = new Group(); flag.name = 'flag'
  root.add(pole, flag)

  const generated: BufferGeometry[] = []
  const meshesBySlot: Record<Slot, Mesh[]> = { pole: [], flag: [] }

  const releaseGenerated = (): void => {
    pole.clear(); flag.clear()
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
    const h = config.height
    emit('pole', tubeSection(0.035, h, [0, h / 2, 0], AXIS_Y, 12), pole, 'shaft')
    const base = bevelBox(0.42, 0.06, 0.42, 0.008)
    base.translate(0, 0.03, 0)
    emit('pole', base, pole, 'base')
    const cloth = bevelBox(0.9, 0.55, 0.012, 0.003)
    cloth.translate(0.48, h - 0.55, 0)
    emit('flag', cloth, flag, 'blank')
  }
  rebuild()

  return {
    root,
    parts: { pole, flag },
    materials: materialSlots,
    getConfig: () => ({ ...config }),
    configure(patch) {
      if (patch.height !== undefined) config.height = Math.max(3, patch.height)
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
  return createF1Preview(createModel({ height: 5 }), {
    aspect,
    target: [0, 2.5, 0],
    distance: 6,
    fov: 28,
    yaw: 0.35,
    pitch: 0.06,
  })
}
