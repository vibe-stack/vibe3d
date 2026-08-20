// f1-grid-box — painted FIA grid stall on the ground with a numbered plate.

import {
  BufferGeometry,
  DataTexture,
  Group,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  type Material,
} from 'three/webgpu'

import {
  LAYER_CLEARANCE,
  acquireF1Materials,
  bevelBox,
  createF1Preview,
  disposeF1Materials,
  marshalPlateTexture,
} from '../f1-kit-core/index.ts'

type Slot = 'pad' | 'plate'

export interface F1GridBoxConfig {
  index: number
}

export interface F1GridBoxOptions extends Partial<F1GridBoxConfig> {
  materials?: Partial<Record<Slot, Material>>
}

export interface F1GridBoxInstance {
  readonly root: Group
  readonly parts: { pad: Group; plate: Group }
  readonly materials: Readonly<Record<Slot, Material>>
  getConfig(): Readonly<F1GridBoxConfig>
  configure(patch: Partial<F1GridBoxConfig>): void
  setMaterial(slot: Slot, material: Material): void
  update(deltaSeconds: number): void
  dispose(): void
}

const defaults: F1GridBoxConfig = { index: 1 }
const W = 2.5
const D = 5.5
const THICK = 0.012

export function createModel(options: F1GridBoxOptions = {}): F1GridBoxInstance {
  const config: F1GridBoxConfig = {
    index: Math.max(1, Math.round(options.index ?? defaults.index)),
  }

  const bundle = acquireF1Materials()
  const kit = bundle.materials
  const extras: Material[] = []
  const textures: DataTexture[] = []
  const ownsPlate = options.materials?.plate === undefined
  const materialSlots: Record<Slot, Material> = {
    pad: options.materials?.pad ?? kit.shell,
    plate: options.materials?.plate ?? kit.shell,
  }

  const root = new Group(); root.name = 'f1-grid-box'
  const pad = new Group(); pad.name = 'pad'
  const plate = new Group(); plate.name = 'plate'
  root.add(pad, plate)

  const generated: BufferGeometry[] = []
  const meshesBySlot: Record<Slot, Mesh[]> = { pad: [], plate: [] }

  const releaseGenerated = (): void => {
    pad.clear(); plate.clear()
    for (const geometry of generated) geometry.dispose()
    generated.length = 0
    for (const slot of Object.keys(meshesBySlot) as Slot[]) meshesBySlot[slot].length = 0
    if (ownsPlate) {
      for (const texture of textures) texture.dispose()
      textures.length = 0
      for (const material of extras) material.dispose()
      extras.length = 0
    }
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
    const slab = bevelBox(W, THICK, D, 0.003)
    slab.translate(0, THICK / 2, 0)
    emit('pad', slab, pad, 'slab')
    const back = bevelBox(0.42, 0.28, 0.04, 0.004)
    back.translate(0, 0.16, D / 2 - 0.08)
    emit('plate', back, plate, 'back', kit.graphite)
    const face = new PlaneGeometry(0.38, 0.24)
    face.translate(0, 0.16, D / 2 - 0.06 + LAYER_CLEARANCE * 3)
    if (ownsPlate) {
      const tex = marshalPlateTexture(String(config.index))
      textures.push(tex)
      const mat = new MeshStandardMaterial({
        name: `f1-kit / grid ${config.index}`,
        map: tex,
        roughness: 0.55,
        metalness: 0.05,
      })
      extras.push(mat)
      emit('plate', face, plate, 'face', mat)
    } else {
      emit('plate', face, plate, 'face')
    }
  }
  rebuild()

  return {
    root,
    parts: { pad, plate },
    materials: materialSlots,
    getConfig: () => ({ ...config }),
    configure(patch) {
      if (patch.index !== undefined) config.index = Math.max(1, Math.round(patch.index))
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
  return createF1Preview(createModel({ index: 5 }), {
    aspect,
    target: [0, 0.08, 0],
    distance: 6.8,
    fov: 28,
    yaw: -0.85,
    pitch: 0.38,
  })
}
