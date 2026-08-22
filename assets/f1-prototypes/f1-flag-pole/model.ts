// f1-flag-pole — galvanized mast flying the Dutch tricolor (2:3, bright vermilion /
// white / cobalt). Preview frames the cloth, not a mid-pole hairline.

import { BufferGeometry, CylinderGeometry, Group, Mesh, type Material } from 'three/webgpu'

import {
  acquireF1Materials,
  bevelBox,
  bevelDisc,
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
const FLY = 1.8
const HOIST = 1.2

export function createModel(options: F1FlagPoleOptions = {}): F1FlagPoleInstance {
  const config: F1FlagPoleConfig = {
    height: Math.max(3, options.height ?? defaults.height),
  }

  const bundle = acquireF1Materials()
  const kit = bundle.materials
  const materialSlots: Record<Slot, Material> = {
    pole: options.materials?.pole ?? kit.steel,
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

  const emit = (slot: Slot, geometry: BufferGeometry, group: Group, name: string, material?: Material): void => {
    generated.push(geometry)
    const mesh = new Mesh(geometry, material ?? materialSlots[slot])
    mesh.name = name
    mesh.castShadow = true
    mesh.receiveShadow = true
    meshesBySlot[slot].push(mesh)
    group.add(mesh)
  }

  const rebuild = (): void => {
    releaseGenerated()
    const h = config.height
    const shaft = new CylinderGeometry(0.028, 0.05, h, 14)
    shaft.translate(0, h / 2, 0)
    emit('pole', shaft, pole, 'shaft')
    const base = bevelBox(0.48, 0.08, 0.48, 0.01)
    base.translate(0, 0.04, 0)
    emit('pole', base, pole, 'base', kit.graphite)
    const collar = tubeSection(0.06, 0.08, [0, 0.12, 0], AXIS_Y, 12)
    emit('pole', collar, pole, 'collar', kit.graphite)
    emit('pole', tubeSection(0.006, h - 0.35, [0.038, h / 2, 0], AXIS_Y, 8), pole, 'halliard', kit.ink)
    const truck = bevelDisc(0.045, 0.04, 0.006, 12)
    truck.rotateX(-Math.PI / 2)
    truck.translate(0, h + 0.02, 0)
    emit('pole', truck, pole, 'truck')
    const finial = new CylinderGeometry(0.012, 0.012, 0.08, 10)
    finial.translate(0, h + 0.08, 0)
    emit('pole', finial, pole, 'finial')

    const bandH = HOIST / 3
    const clothX = 0.06 + FLY / 2
    const topY = h - 0.06
    const red = bevelBox(FLY, bandH, 0.018, 0.003)
    red.translate(clothX, topY - bandH / 2, 0)
    emit('flag', red, flag, 'band-red', kit.red)
    const white = bevelBox(FLY, bandH, 0.018, 0.003)
    white.translate(clothX, topY - bandH * 1.5, 0)
    emit('flag', white, flag, 'band-white')
    const blue = bevelBox(FLY, bandH, 0.018, 0.003)
    blue.translate(clothX, topY - bandH * 2.5, 0)
    emit('flag', blue, flag, 'band-blue', kit.cobalt)
    const hoist = bevelBox(0.03, HOIST + 0.04, 0.03, 0.004)
    hoist.translate(0.045, topY - HOIST / 2, 0)
    emit('flag', hoist, flag, 'hoist-bar', kit.graphite)
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
  return createF1Preview(createModel({ height: 4.2 }), {
    aspect,
    target: [0.85, 3.45, 0],
    distance: 4.4,
    fov: 28,
    yaw: 0.42,
    pitch: 0.04,
  })
}
