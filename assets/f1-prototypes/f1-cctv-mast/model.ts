// f1-cctv-mast — pole with two compact camera heads (not floodlight cans).

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
    head: options.materials?.head ?? kit.slate,
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
    const shaft = new CylinderGeometry(0.055, 0.07, h, 14)
    shaft.translate(0, h / 2, 0)
    emit('pole', shaft, pole, 'shaft')
    const base = new CylinderGeometry(0.22, 0.26, 0.12, 16)
    base.translate(0, 0.06, 0)
    emit('pole', base, pole, 'base')
    const arm = bevelBox(0.85, 0.05, 0.05, 0.006)
    arm.translate(0, h - 0.18, 0)
    emit('pole', arm, pole, 'arm')

    const cameraParts: BufferGeometry[] = []
    for (const sx of [-0.32, 0.32] as const) {
      const housing = loftRoundedBox(0.18, 0.12, 0.22, 0.025)
      housing.rotateY(sx < 0 ? 0.35 : -0.35)
      housing.translate(sx, h - 0.22, 0.08)
      cameraParts.push(housing)
      const lens = bevelBox(0.08, 0.06, 0.04, 0.004)
      lens.rotateY(sx < 0 ? 0.35 : -0.35)
      lens.translate(sx + (sx < 0 ? -0.08 : 0.08), h - 0.22, 0.18)
      cameraParts.push(lens)
    }
    emit('head', mergeParts(cameraParts, 'cameras'), heads, 'cameras', kit.ink)
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
    target: [0, 2.6, 0],
    distance: 6.5,
    fov: 28,
    yaw: 0.4,
    pitch: 0.06,
  })
}
