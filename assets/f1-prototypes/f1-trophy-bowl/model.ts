// f1-trophy-bowl — retired generic bowl. Not a GP trophy; kept for catalog id.

import { BufferGeometry, Group, Mesh, type Material } from 'three/webgpu'

import {
  TROPHY_BOWL,
  acquireF1Materials,
  createF1Preview,
  disposeF1Materials,
  revolve,
} from '../f1-kit-core/index.ts'

type Slot = 'bowl'

export interface F1TrophyBowlConfig {
  height: number
}

export interface F1TrophyBowlOptions extends Partial<F1TrophyBowlConfig> {
  materials?: Partial<Record<Slot, Material>>
}

export interface F1TrophyBowlInstance {
  readonly root: Group
  readonly parts: { bowl: Group }
  readonly materials: Readonly<Record<Slot, Material>>
  getConfig(): Readonly<F1TrophyBowlConfig>
  configure(patch: Partial<F1TrophyBowlConfig>): void
  setMaterial(slot: Slot, material: Material): void
  update(deltaSeconds: number): void
  dispose(): void
}

const defaults: F1TrophyBowlConfig = { height: TROPHY_BOWL.height }

export function createModel(options: F1TrophyBowlOptions = {}): F1TrophyBowlInstance {
  const config: F1TrophyBowlConfig = {
    height: Math.max(0.2, options.height ?? defaults.height),
  }
  const bundle = acquireF1Materials()
  const kit = bundle.materials
  const materialSlots: Record<Slot, Material> = {
    bowl: options.materials?.bowl ?? kit.steel,
  }
  const root = new Group(); root.name = 'f1-trophy-bowl'
  const bowl = new Group(); bowl.name = 'bowl'
  root.add(bowl)
  const generated: BufferGeometry[] = []
  const meshesBySlot: Record<Slot, Mesh[]> = { bowl: [] }
  const releaseGenerated = (): void => {
    bowl.clear()
    for (const geometry of generated) geometry.dispose()
    generated.length = 0
    meshesBySlot.bowl.length = 0
  }
  const rebuild = (): void => {
    releaseGenerated()
    const h = config.height
    const geo = revolve(
      [[0, 0.2], [0.18, 0.16], [0.38, 0.14], [0.55, 0.42], [0.82, 0.55], [1, 0.52]],
      { yBot: 0, yTop: h, scaleW: h, segments: 28 },
    )
    generated.push(geo)
    const mesh = new Mesh(geo, materialSlots.bowl)
    mesh.name = 'bowl'
    mesh.castShadow = true
    mesh.receiveShadow = true
    meshesBySlot.bowl.push(mesh)
    bowl.add(mesh)
  }
  rebuild()
  return {
    root,
    parts: { bowl },
    materials: materialSlots,
    getConfig: () => ({ ...config }),
    configure(patch) {
      if (patch.height !== undefined) config.height = Math.max(0.2, patch.height)
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
    aspect, target: [0, 0.22, 0], distance: 1.4, fov: 28, yaw: -0.5, pitch: 0.12,
  })
}
