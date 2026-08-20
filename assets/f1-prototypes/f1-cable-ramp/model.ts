// f1-cable-ramp — hose/cable protector across a paddock road. 0.90 m wide.

import { BufferGeometry, Group, Mesh, type Material } from 'three/webgpu'

import {
  CABLE_RAMP,
  acquireF1Materials,
  createF1Preview,
  disposeF1Materials,
  loftAlongX,
} from '../f1-kit-core/index.ts'

type Slot = 'ramp'

export interface F1CableRampConfig {
  length: number
}

export interface F1CableRampOptions extends Partial<F1CableRampConfig> {
  materials?: Partial<Record<Slot, Material>>
}

export interface F1CableRampInstance {
  readonly root: Group
  readonly parts: { ramp: Group }
  readonly materials: Readonly<Record<Slot, Material>>
  getConfig(): Readonly<F1CableRampConfig>
  configure(patch: Partial<F1CableRampConfig>): void
  setMaterial(slot: Slot, material: Material): void
  update(deltaSeconds: number): void
  dispose(): void
}

const defaults: F1CableRampConfig = { length: 1.0 }

export function createModel(options: F1CableRampOptions = {}): F1CableRampInstance {
  const config: F1CableRampConfig = {
    length: Math.max(0.4, options.length ?? defaults.length),
  }
  const bundle = acquireF1Materials()
  const kit = bundle.materials
  const materialSlots: Record<Slot, Material> = {
    ramp: options.materials?.ramp ?? kit.shell,
  }
  const root = new Group(); root.name = 'f1-cable-ramp'
  const ramp = new Group(); ramp.name = 'ramp'
  root.add(ramp)
  const generated: BufferGeometry[] = []
  const meshesBySlot: Record<Slot, Mesh[]> = { ramp: [] }
  const releaseGenerated = (): void => {
    ramp.clear()
    for (const geometry of generated) geometry.dispose()
    generated.length = 0
    meshesBySlot.ramp.length = 0
  }
  const rebuild = (): void => {
    releaseGenerated()
    const half = CABLE_RAMP.width / 2
    const h = CABLE_RAMP.height
    const geo = loftAlongX(
      [
        [-half, 0],
        [-half + 0.14, h],
        [half - 0.14, h],
        [half, 0],
      ],
      config.length,
      { closed: true, stations: 3 },
    )
    generated.push(geo)
    const mesh = new Mesh(geo, materialSlots.ramp)
    mesh.name = 'hump'
    mesh.castShadow = true
    mesh.receiveShadow = true
    meshesBySlot.ramp.push(mesh)
    ramp.add(mesh)
  }
  rebuild()
  return {
    root,
    parts: { ramp },
    materials: materialSlots,
    getConfig: () => ({ ...config }),
    configure(patch) {
      if (patch.length !== undefined) config.length = Math.max(0.4, patch.length)
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
  return createF1Preview(createModel({ length: 1.2 }), {
    aspect, target: [0, 0.04, 0], distance: 2.2, fov: 28, yaw: -0.9, pitch: 0.28,
  })
}
