// f1-ice-bucket — stainless magnum presentation bucket with a rolled rim.

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
  const emit = (geometry: BufferGeometry, name: string): void => {
    generated.push(geometry)
    const mesh = new Mesh(geometry, materialSlots.bucket)
    mesh.name = name
    mesh.castShadow = true
    mesh.receiveShadow = true
    meshesBySlot.bucket.push(mesh)
    bucket.add(mesh)
  }
  const rebuild = (): void => {
    releaseGenerated()
    const h = config.height
    const k = h / ICE_BUCKET.height
    const rimR = ICE_BUCKET.rimR * k
    const baseR = ICE_BUCKET.baseR * k
    const lip = ICE_BUCKET.lip * k
    emit(revolve(
      [
        [0.00, 0.004],
        [0.04, baseR],
        [0.88, rimR],
        [1.00, rimR],
      ],
      { yBot: 0, yTop: h - lip, scaleW: 1, segments: 28 },
    ), 'body')
    emit(revolve(
      [
        [0.00, rimR * 0.96],
        [0.45, rimR + lip],
        [1.00, rimR * 0.98],
      ],
      { yBot: h - lip, yTop: h, scaleW: 1, segments: 28 },
    ), 'lip')
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
    aspect, target: [0, 0.19, 0], distance: 1.15, fov: 28, yaw: -0.5, pitch: 0.14,
  })
}
