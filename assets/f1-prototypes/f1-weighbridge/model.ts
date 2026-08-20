// f1-weighbridge — low platform with ramps and an unbranded fascia display.

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
  fasciaTexture,
  mergeParts,
} from '../f1-kit-core/index.ts'

type Slot = 'deck' | 'ramp' | 'display'

export interface F1WeighbridgeConfig {
  width: number
}

export interface F1WeighbridgeOptions extends Partial<F1WeighbridgeConfig> {
  materials?: Partial<Record<Slot, Material>>
}

export interface F1WeighbridgeInstance {
  readonly root: Group
  readonly parts: { deck: Group; ramp: Group; display: Group }
  readonly materials: Readonly<Record<Slot, Material>>
  getConfig(): Readonly<F1WeighbridgeConfig>
  configure(patch: Partial<F1WeighbridgeConfig>): void
  setMaterial(slot: Slot, material: Material): void
  update(deltaSeconds: number): void
  dispose(): void
}

const defaults: F1WeighbridgeConfig = { width: 3.2 }

export function createModel(options: F1WeighbridgeOptions = {}): F1WeighbridgeInstance {
  const config: F1WeighbridgeConfig = {
    width: Math.max(2, options.width ?? defaults.width),
  }

  const bundle = acquireF1Materials()
  const kit = bundle.materials
  const extras: Material[] = []
  const textures: DataTexture[] = []
  const ownsDisplay = options.materials?.display === undefined
  const materialSlots: Record<Slot, Material> = {
    deck: options.materials?.deck ?? kit.graphite,
    ramp: options.materials?.ramp ?? kit.slate,
    display: options.materials?.display ?? kit.shell,
  }

  const root = new Group(); root.name = 'f1-weighbridge'
  const deck = new Group(); deck.name = 'deck'
  const ramp = new Group(); ramp.name = 'ramp'
  const display = new Group(); display.name = 'display'
  root.add(deck, ramp, display)

  const generated: BufferGeometry[] = []
  const meshesBySlot: Record<Slot, Mesh[]> = { deck: [], ramp: [], display: [] }

  const releaseGenerated = (): void => {
    deck.clear(); ramp.clear(); display.clear()
    for (const geometry of generated) geometry.dispose()
    generated.length = 0
    for (const slot of Object.keys(meshesBySlot) as Slot[]) meshesBySlot[slot].length = 0
    if (ownsDisplay) {
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
    const w = config.width
    const platform = bevelBox(w, 0.14, 4.2, 0.012)
    platform.translate(0, 0.18, 0)
    emit('deck', platform, deck, 'platform')
    const rampParts: BufferGeometry[] = []
    for (const sz of [-1, 1] as const) {
      const incline = bevelBox(w - 0.2, 0.08, 1.2, 0.008)
      incline.rotateX(sz * 0.12)
      incline.translate(0, 0.1, sz * 2.6)
      rampParts.push(incline)
    }
    emit('ramp', mergeParts(rampParts, 'ramps'), ramp, 'ramps')
    const pillar = bevelBox(0.5, 1.4, 0.4, 0.01)
    pillar.translate(w / 2 + 0.35, 0.7, 0)
    emit('deck', pillar, deck, 'pillar', kit.steel)
    const back = bevelBox(0.48, 0.32, 0.04, 0.004)
    back.translate(w / 2 + 0.35, 1.05, 0.22)
    emit('display', back, display, 'back', kit.graphite)
    const face = new PlaneGeometry(0.44, 0.28)
    face.translate(w / 2 + 0.35, 1.05, 0.24 + LAYER_CLEARANCE * 3)
    if (ownsDisplay) {
      const tex = fasciaTexture({ number: '000', legend: 'KG' })
      textures.push(tex)
      const mat = new MeshStandardMaterial({
        name: 'f1-kit / weigh display',
        map: tex,
        roughness: 0.55,
        metalness: 0.05,
      })
      extras.push(mat)
      emit('display', face, display, 'face', mat)
    } else {
      emit('display', face, display, 'face')
    }
  }
  rebuild()

  return {
    root,
    parts: { deck, ramp, display },
    materials: materialSlots,
    getConfig: () => ({ ...config }),
    configure(patch) {
      if (patch.width !== undefined) config.width = Math.max(2, patch.width)
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
    aspect,
    target: [0, 0.35, 0],
    distance: 6.5,
    fov: 28,
    yaw: -0.7,
    pitch: 0.16,
  })
}
