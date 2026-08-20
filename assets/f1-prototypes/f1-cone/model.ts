// f1-cone — traffic cone with orange body and white shell stripe.

import { BufferGeometry, CylinderGeometry, Group, Mesh, type Material } from 'three/webgpu'

import {
  acquireF1Materials,
  bevelRing,
  createF1Preview,
  disposeF1Materials,
  mergeParts,
} from '../f1-kit-core/index.ts'

type Slot = 'body' | 'stripe'

export interface F1ConeConfig {
  height: number
}

export interface F1ConeOptions extends Partial<F1ConeConfig> {
  materials?: Partial<Record<Slot, Material>>
}

export interface F1ConeInstance {
  readonly root: Group
  readonly parts: { body: Group; stripe: Group }
  readonly materials: Readonly<Record<Slot, Material>>
  getConfig(): Readonly<F1ConeConfig>
  configure(patch: Partial<F1ConeConfig>): void
  setMaterial(slot: Slot, material: Material): void
  update(deltaSeconds: number): void
  dispose(): void
}

const defaults: F1ConeConfig = { height: 0.5 }

export function createModel(options: F1ConeOptions = {}): F1ConeInstance {
  const config: F1ConeConfig = {
    height: Math.max(0.25, options.height ?? defaults.height),
  }

  const bundle = acquireF1Materials()
  const kit = bundle.materials
  const materialSlots: Record<Slot, Material> = {
    body: options.materials?.body ?? kit.orange,
    stripe: options.materials?.stripe ?? kit.shell,
  }

  const root = new Group(); root.name = 'f1-cone'
  const body = new Group(); body.name = 'body'
  const stripe = new Group(); stripe.name = 'stripe'
  root.add(body, stripe)

  const generated: BufferGeometry[] = []
  const meshesBySlot: Record<Slot, Mesh[]> = { body: [], stripe: [] }

  const releaseGenerated = (): void => {
    body.clear(); stripe.clear()
    for (const geometry of generated) geometry.dispose()
    generated.length = 0
    for (const slot of Object.keys(meshesBySlot) as Slot[]) meshesBySlot[slot].length = 0
  }

  const emit = (slot: Slot, geometry: BufferGeometry, group: Group, name: string): void => {
    generated.push(geometry)
    const mesh = new Mesh(geometry, materialSlots[slot])
    mesh.name = name
    mesh.castShadow = true
    mesh.receiveShadow = true
    meshesBySlot[slot].push(mesh)
    group.add(mesh)
  }

  const rebuild = (): void => {
    releaseGenerated()
    const h = config.height
    const baseR = h * 0.34
    const topR = h * 0.06
    const cone = new CylinderGeometry(topR, baseR, h, 16)
    cone.translate(0, h / 2, 0)
    emit('body', cone, body, 'cone')
    const bandY = h * 0.42
    const bandR = baseR * (1 - bandY / h) + topR * (bandY / h)
    const band = bevelRing(bandR * 0.92, bandR * 1.08, h * 0.12, 0.003, 16)
    band.translate(0, bandY, 0)
    emit('stripe', band, stripe, 'stripe')
  }
  rebuild()

  return {
    root,
    parts: { body, stripe },
    materials: materialSlots,
    getConfig: () => ({ ...config }),
    configure(patch) {
      if (patch.height !== undefined) config.height = Math.max(0.25, patch.height)
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
    target: [0, 0.25, 0],
    distance: 1.4,
    fov: 28,
    yaw: -0.6,
    pitch: 0.1,
  })
}
