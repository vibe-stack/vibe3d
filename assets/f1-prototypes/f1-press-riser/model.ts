// f1-press-riser — 2–3 step press platform, 180 mm rise.

import { BufferGeometry, Group, Mesh, type Material } from 'three/webgpu'

import {
  PRESS_RISER,
  acquireF1Materials,
  bevelBox,
  createF1Preview,
  disposeF1Materials,
  mergeParts,
} from '../f1-kit-core/index.ts'

type Slot = 'steps'

export interface F1PressRiserConfig {
  width: number
  steps: number
}

export interface F1PressRiserOptions extends Partial<F1PressRiserConfig> {
  materials?: Partial<Record<Slot, Material>>
}

export interface F1PressRiserInstance {
  readonly root: Group
  readonly parts: { steps: Group }
  readonly materials: Readonly<Record<Slot, Material>>
  getConfig(): Readonly<F1PressRiserConfig>
  configure(patch: Partial<F1PressRiserConfig>): void
  setMaterial(slot: Slot, material: Material): void
  update(deltaSeconds: number): void
  dispose(): void
}

const defaults: F1PressRiserConfig = { width: PRESS_RISER.width, steps: PRESS_RISER.steps }

export function createModel(options: F1PressRiserOptions = {}): F1PressRiserInstance {
  const config: F1PressRiserConfig = {
    width: Math.max(1.5, options.width ?? defaults.width),
    steps: Math.max(2, Math.min(4, Math.round(options.steps ?? defaults.steps))),
  }
  const bundle = acquireF1Materials()
  const kit = bundle.materials
  const materialSlots: Record<Slot, Material> = {
    steps: options.materials?.steps ?? kit.slate,
  }
  const root = new Group(); root.name = 'f1-press-riser'
  const steps = new Group(); steps.name = 'steps'
  root.add(steps)
  const generated: BufferGeometry[] = []
  const meshesBySlot: Record<Slot, Mesh[]> = { steps: [] }
  const releaseGenerated = (): void => {
    steps.clear()
    for (const geometry of generated) geometry.dispose()
    generated.length = 0
    meshesBySlot.steps.length = 0
  }
  const rebuild = (): void => {
    releaseGenerated()
    const w = config.width
    const n = config.steps
    const rise = PRESS_RISER.rise
    const tread = PRESS_RISER.tread
    const parts: BufferGeometry[] = []
    for (let i = 0; i < n; i++) {
      const h = (i + 1) * rise
      const slab = bevelBox(w, h, tread, 0.008)
      slab.translate(0, h / 2, -i * tread)
      parts.push(slab)
    }
    const geo = mergeParts(parts, 'treads')
    generated.push(geo)
    const mesh = new Mesh(geo, materialSlots.steps)
    mesh.name = 'treads'
    mesh.castShadow = true
    mesh.receiveShadow = true
    meshesBySlot.steps.push(mesh)
    steps.add(mesh)
  }
  rebuild()
  return {
    root,
    parts: { steps },
    materials: materialSlots,
    getConfig: () => ({ ...config }),
    configure(patch) {
      if (patch.width !== undefined) config.width = Math.max(1.5, patch.width)
      if (patch.steps !== undefined) config.steps = Math.max(2, Math.min(4, Math.round(patch.steps)))
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
    aspect, target: [0, 0.3, 0], distance: 5.5, fov: 30, yaw: -0.5, pitch: 0.14,
  })
}
