// f1-ice-bucket — presentation bucket for the magnum.

import { BufferGeometry, Group, Mesh, type Material } from 'three/webgpu'

import {
  ICE_BUCKET,
  acquireF1Materials,
  createF1Preview,
  disposeF1Materials,
  revolve,
} from '../f1-kit-core/index.ts'

type Slot = 'bucket'

export interface F1IceBucketConfig {
  height: number
}

export interface F1IceBucketOptions extends Partial<F1IceBucketConfig> {
  materials?: Partial<Record<Slot, Material>>
}

export interface F1IceBucketInstance {
  readonly root: Group
  readonly parts: { bucket: Group }
  readonly materials: Readonly<Record<Slot, Material>>
  getConfig(): Readonly<F1IceBucketConfig>
  configure(patch: Partial<F1IceBucketConfig>): void
  setMaterial(slot: Slot, material: Material): void
  update(deltaSeconds: number): void
  dispose(): void
}

const defaults: F1IceBucketConfig = { height: ICE_BUCKET.height }

export function createModel(options: F1IceBucketOptions = {}): F1IceBucketInstance {
  const config: F1IceBucketConfig = {
    height: Math.max(0.2, options.height ?? defaults.height),
  }
  const bundle = acquireF1Materials()
  const kit = bundle.materials
  const materialSlots: Record<Slot, Material> = {
    bucket: options.materials?.bucket ?? kit.steel,
  }
  const root = new Group(); root.name = 'f1-ice-bucket'
  const bucket = new Group(); bucket.name = 'bucket'
  root.add(bucket)
  const generated: BufferGeometry[] = []
  const meshesBySlot: Record<Slot, Mesh[]> = { bucket: [] }
  const releaseGenerated = (): void => {
    bucket.clear()
    for (const geometry of generated) geometry.dispose()
    generated.length = 0
    meshesBySlot.bucket.length = 0
  }
  const rebuild = (): void => {
    releaseGenerated()
    const h = config.height
    const scaleW = ICE_BUCKET.diameter / 2
    const geo = revolve(
      [[0, 0.72], [0.08, 0.78], [0.85, 1], [1, 1]],
      { yBot: 0, yTop: h, scaleW, segments: 24 },
    )
    generated.push(geo)
    const mesh = new Mesh(geo, materialSlots.bucket)
    mesh.name = 'bucket'
    mesh.castShadow = true
    mesh.receiveShadow = true
    meshesBySlot.bucket.push(mesh)
    bucket.add(mesh)
  }
  rebuild()
  return {
    root,
    parts: { bucket },
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
    aspect, target: [0, 0.2, 0], distance: 1.2, fov: 28, yaw: -0.5, pitch: 0.12,
  })
}
