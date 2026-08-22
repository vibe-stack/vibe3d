// f1-cctv-mast — pole with two bullet cameras (hood, lens, tally LED). Not a floodlight,
// not a bare pole — the heads have to read at catalogue distance.

import {
  BufferGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  type Material,
} from 'three/webgpu'

import {
  acquireF1Materials,
  bevelBox,
  bevelDisc,
  createF1Preview,
  disposeF1Materials,
  loftRoundedBox,
  mergeParts,
} from '../f1-kit-core/index.ts'

type Slot = 'pole' | 'head'

export interface F1CctvMastConfig {
  height: number
}

export interface F1CctvMastOptions extends Partial<F1CctvMastConfig> {
  materials?: Partial<Record<Slot, Material>>
}

export interface F1CctvMastInstance {
  readonly root: Group
  readonly parts: { pole: Group; heads: Group }
  readonly materials: Readonly<Record<Slot, Material>>
  getConfig(): Readonly<F1CctvMastConfig>
  configure(patch: Partial<F1CctvMastConfig>): void
  setMaterial(slot: Slot, material: Material): void
  update(deltaSeconds: number): void
  dispose(): void
}

const defaults: F1CctvMastConfig = { height: 6 }

export function createModel(options: F1CctvMastOptions = {}): F1CctvMastInstance {
  const config: F1CctvMastConfig = {
    height: Math.max(3, options.height ?? defaults.height),
  }

  const bundle = acquireF1Materials()
  const kit = bundle.materials
  const materialSlots: Record<Slot, Material> = {
    pole: options.materials?.pole ?? kit.graphite,
    head: options.materials?.head ?? kit.ink,
  }

  const root = new Group(); root.name = 'f1-cctv-mast'
  const pole = new Group(); pole.name = 'pole'
  const heads = new Group(); heads.name = 'heads'
  root.add(pole, heads)

  const generated: BufferGeometry[] = []
  const meshesBySlot: Record<Slot, Mesh[]> = { pole: [], head: [] }

  const releaseGenerated = (): void => {
    pole.clear(); heads.clear()
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
    const shaft = new CylinderGeometry(0.055, 0.07, h, 14)
    shaft.translate(0, h / 2, 0)
    emit('pole', shaft, pole, 'shaft')
    const base = new CylinderGeometry(0.22, 0.26, 0.12, 16)
    base.translate(0, 0.06, 0)
    emit('pole', base, pole, 'base')
    const arm = bevelBox(1.05, 0.055, 0.055, 0.006)
    arm.translate(0, h - 0.22, 0.04)
    emit('pole', arm, pole, 'arm')

    const bodies: BufferGeometry[] = []
    const lenses: BufferGeometry[] = []
    const leds: BufferGeometry[] = []
    for (const sx of [-0.38, 0.38] as const) {
      const yaw = sx < 0 ? 0.4 : -0.4
      const housing = loftRoundedBox(0.14, 0.12, 0.28, 0.02)
      housing.rotateY(yaw)
      housing.translate(sx, h - 0.28, 0.12)
      bodies.push(housing)
      const hood = bevelBox(0.16, 0.04, 0.2, 0.006)
      hood.rotateY(yaw)
      hood.translate(sx, h - 0.2, 0.16)
      bodies.push(hood)
      const lens = new CylinderGeometry(0.045, 0.05, 0.04, 14)
      lens.rotateX(Math.PI / 2)
      lens.rotateY(yaw)
      lens.translate(sx + Math.sin(yaw) * 0.12, h - 0.3, 0.26)
      lenses.push(lens)
      const glass = bevelDisc(0.038, 0.01, 0.002, 12)
      glass.rotateX(Math.PI / 2)
      glass.rotateY(yaw)
      glass.translate(sx + Math.sin(yaw) * 0.14, h - 0.3, 0.29)
      lenses.push(glass)
      const led = bevelDisc(0.012, 0.008, 0.001, 8)
      led.translate(sx, h - 0.18, 0.22)
      leds.push(led)
    }
    emit('head', mergeParts(bodies, 'bodies'), heads, 'cameras')
    emit('head', mergeParts(lenses, 'lenses'), heads, 'lenses', kit.slate)
    emit('head', mergeParts(leds, 'leds'), heads, 'tally', kit.red)
  }
  rebuild()

  return {
    root,
    parts: { pole, heads },
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
    target: [0, 4.55, 0.15],
    distance: 3.4,
    fov: 28,
    yaw: 0.55,
    pitch: 0.12,
  })
}
