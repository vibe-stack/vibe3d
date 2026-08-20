// f1-jersey-barrier — interlocking New-Jersey profile modules (street / temporary walls).
// Different section from f1-concrete-wall; same `WALL_END.jersey` pitch as gates and cushions.

import { BufferGeometry, Group, Mesh, type Material } from 'three/webgpu'

import {
  WALL_END,
  acquireF1Materials,
  createF1Preview,
  disposeF1Materials,
  loftAlongX,
} from '../f1-kit-core/index.ts'

type Slot = 'barrier'

export interface F1JerseyBarrierConfig {
  modules: number
}

export interface F1JerseyBarrierOptions extends Partial<F1JerseyBarrierConfig> {
  materials?: Partial<Record<Slot, Material>>
}

export interface F1JerseyBarrierInstance {
  readonly root: Group
  readonly parts: { barrier: Group }
  readonly materials: Readonly<Record<Slot, Material>>
  getConfig(): Readonly<F1JerseyBarrierConfig>
  configure(patch: Partial<F1JerseyBarrierConfig>): void
  setMaterial(slot: Slot, material: Material): void
  update(deltaSeconds: number): void
  dispose(): void
}

const defaults: F1JerseyBarrierConfig = { modules: 3 }
const PITCH = WALL_END.jersey.pitch
const H = WALL_END.jersey.height

/** NJ outline in ZY: base 610 mm, top 150 mm, height 810 mm. */
function jerseyProfile(): Array<readonly [number, number]> {
  return [
    [-0.305, 0.00],
    [-0.305, 0.075],
    [-0.075, 0.81],
    [0.075, 0.81],
    [0.305, 0.075],
    [0.305, 0.00],
  ]
}

export function createModel(options: F1JerseyBarrierOptions = {}): F1JerseyBarrierInstance {
  const config: F1JerseyBarrierConfig = {
    modules: Math.max(1, Math.round(options.modules ?? defaults.modules)),
  }

  const bundle = acquireF1Materials()
  const kit = bundle.materials
  const materialSlots: Record<Slot, Material> = {
    barrier: options.materials?.barrier ?? kit.shell,
  }

  const root = new Group()
  root.name = 'f1-jersey-barrier'
  const barrier = new Group(); barrier.name = 'barrier'
  root.add(barrier)

  const generated: BufferGeometry[] = []
  const meshesBySlot: Record<Slot, Mesh[]> = { barrier: [] }

  const releaseGenerated = (): void => {
    barrier.clear()
    for (const geometry of generated) geometry.dispose()
    generated.length = 0
    meshesBySlot.barrier.length = 0
  }

  const rebuild = (): void => {
    releaseGenerated()
    const length = config.modules * PITCH
    const geo = loftAlongX(jerseyProfile(), length, { closed: true, stations: 4 })
    generated.push(geo)
    const mesh = new Mesh(geo, materialSlots.barrier)
    mesh.name = 'jersey'
    mesh.castShadow = true
    mesh.receiveShadow = true
    meshesBySlot.barrier.push(mesh)
    barrier.add(mesh)
  }
  rebuild()

  return {
    root,
    parts: { barrier },
    materials: materialSlots,
    getConfig: () => ({ ...config }),
    configure(patch) {
      if (patch.modules !== undefined) config.modules = Math.max(1, Math.round(patch.modules))
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
  return createF1Preview(createModel({ modules: 2 }), {
    aspect,
    target: [0, H / 2, 0],
    distance: 7.2,
    fov: 28,
    yaw: -1.05,
    pitch: 0.16,
  })
}
