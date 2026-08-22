// f1-weighbridge — FIA paddock scale: ribbed steel deck, ramps with hazard stripes,
// load-cell feet, and a KG cabinet. Not a grey slab.

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
  TOKEN,
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
    deck: options.materials?.deck ?? kit.steel,
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
    const deckL = 4.2
    const platform = bevelBox(w, 0.12, deckL, 0.01)
    platform.translate(0, 0.16, 0)
    emit('deck', platform, deck, 'platform')

    const grate: BufferGeometry[] = []
    const bars = Math.max(8, Math.round(w / 0.22))
    for (let i = 0; i < bars; i++) {
      const x = -w / 2 + 0.12 + i * ((w - 0.24) / Math.max(1, bars - 1))
      const bar = bevelBox(0.04, 0.03, deckL - 0.16, 0.004)
      bar.translate(x, 0.23, 0)
      grate.push(bar)
    }
    emit('deck', mergeParts(grate, 'grate'), deck, 'grate', kit.graphite)

    const feet: BufferGeometry[] = []
    for (const x of [-w / 2 + 0.28, w / 2 - 0.28] as const) {
      for (const z of [-1.6, 1.6] as const) {
        const cell = bevelBox(0.18, 0.1, 0.18, 0.008)
        cell.translate(x, 0.05, z)
        feet.push(cell)
      }
    }
    emit('deck', mergeParts(feet, 'load-cells'), deck, 'load-cells', kit.ink)

    const rampParts: BufferGeometry[] = []
    const hazard: BufferGeometry[] = []
    for (const sz of [-1, 1] as const) {
      const incline = bevelBox(w - 0.16, 0.07, 1.15, 0.008)
      incline.rotateX(sz * 0.14)
      incline.translate(0, 0.1, sz * 2.55)
      rampParts.push(incline)
      for (let s = 0; s < 5; s++) {
        const stripe = bevelBox(w - 0.28, 0.012, 0.12, 0.002)
        stripe.rotateX(sz * 0.14)
        stripe.translate(0, 0.14, sz * (2.15 + s * 0.2))
        if (s % 2 === 0) hazard.push(stripe)
      }
    }
    emit('ramp', mergeParts(rampParts, 'ramps'), ramp, 'ramps')
    emit('ramp', mergeParts(hazard, 'hazard'), ramp, 'hazard', kit.amber)

    const rails: BufferGeometry[] = []
    for (const sx of [-1, 1] as const) {
      const rail = bevelBox(0.05, 0.22, deckL + 0.4, 0.008)
      rail.translate(sx * (w / 2 + 0.02), 0.28, 0)
      rails.push(rail)
    }
    emit('deck', mergeParts(rails, 'side-rails'), deck, 'side-rails', kit.graphite)

    const pillar = bevelBox(0.42, 1.35, 0.32, 0.01)
    pillar.translate(w / 2 + 0.42, 0.72, -0.4)
    emit('deck', pillar, deck, 'pillar', kit.steel)
    const hood = bevelBox(0.46, 0.08, 0.36, 0.008)
    hood.translate(w / 2 + 0.42, 1.42, -0.4)
    emit('deck', hood, deck, 'hood', kit.ink)
    const back = bevelBox(0.4, 0.28, 0.04, 0.004)
    back.translate(w / 2 + 0.42, 1.18, -0.22)
    emit('display', back, display, 'back', kit.ink)
    const face = new PlaneGeometry(0.36, 0.24)
    face.translate(w / 2 + 0.42, 1.18, -0.2 + LAYER_CLEARANCE * 3)
    if (ownsDisplay) {
      const tex = fasciaTexture({ number: '798', legend: 'KG', paper: [18, 28, 36], ink: [190, 255, 24] })
      textures.push(tex)
      const mat = new MeshStandardMaterial({
        name: 'f1-kit / weigh display',
        map: tex,
        color: TOKEN.INK_950,
        roughness: 0.4,
        metalness: 0.05,
        emissive: TOKEN.LIME_400,
        emissiveIntensity: 0.18,
        toneMapped: false,
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
    target: [0.4, 0.55, 0],
    distance: 7.2,
    fov: 28,
    yaw: -0.85,
    pitch: 0.22,
  })
}
