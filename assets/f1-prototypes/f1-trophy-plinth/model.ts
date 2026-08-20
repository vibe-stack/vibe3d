// f1-trophy-plinth — presentation block the cups socket onto.

import { BufferGeometry, Group, Mesh, type Material } from 'three/webgpu'

import {
  TROPHY_PLINTH,
  acquireF1Materials,
  bevelBox,
  createF1Preview,
  disposeF1Materials,
} from '../f1-kit-core/index.ts'

type Slot = 'plinth'

export interface F1TrophyPlinthConfig {
  width: number
}

export interface F1TrophyPlinthOptions extends Partial<F1TrophyPlinthConfig> {
  materials?: Partial<Record<Slot, Material>>
}

export interface F1TrophyPlinthInstance {
  readonly root: Group
  readonly parts: { plinth: Group }
  readonly materials: Readonly<Record<Slot, Material>>
  getConfig(): Readonly<F1TrophyPlinthConfig>
  configure(patch: Partial<F1TrophyPlinthConfig>): void
  setMaterial(slot: Slot, material: Material): void
  update(deltaSeconds: number): void
  dispose(): void
}

const defaults: F1TrophyPlinthConfig = { width: TROPHY_PLINTH.width }

export function createModel(options: F1TrophyPlinthOptions = {}): F1TrophyPlinthInstance {
  const config: F1TrophyPlinthConfig = {
    width: Math.max(0.5, options.width ?? defaults.width),
  }
  const bundle = acquireF1Materials()
  const kit = bundle.materials
  const materialSlots: Record<Slot, Material> = {
    plinth: options.materials?.plinth ?? kit.shell,
  }
  const root = new Group(); root.name = 'f1-trophy-plinth'
  const plinth = new Group(); plinth.name = 'plinth'
  root.add(plinth)
  const generated: BufferGeometry[] = []
  const meshesBySlot: Record<Slot, Mesh[]> = { plinth: [] }
  const releaseGenerated = (): void => {
    plinth.clear()
    for (const geometry of generated) geometry.dispose()
    generated.length = 0
    meshesBySlot.plinth.length = 0
  }
  const rebuild = (): void => {
    releaseGenerated()
    const w = config.width
    const h = TROPHY_PLINTH.height
    const d = TROPHY_PLINTH.depth * (w / TROPHY_PLINTH.width)
    const body = bevelBox(w, h, d, 0.02)
    body.translate(0, h / 2, 0)
    generated.push(body)
    const mesh = new Mesh(body, materialSlots.plinth)
    mesh.name = 'block'
    mesh.castShadow = true
    mesh.receiveShadow = true
    meshesBySlot.plinth.push(mesh)
    plinth.add(mesh)
  }
  rebuild()
  return {
    root,
    parts: { plinth },
    materials: materialSlots,
    getConfig: () => ({ ...config }),
    configure(patch) {
      if (patch.width !== undefined) config.width = Math.max(0.5, patch.width)
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
    aspect, target: [0, 0.45, 0], distance: 2.6, fov: 28, yaw: -0.55, pitch: 0.1,
  })
}
