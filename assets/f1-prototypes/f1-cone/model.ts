// f1-cone — FIA-style PE traffic cone: square black base, orange body, two
// white reflective bands. Not a frustum with a sideways washer.

import { BufferGeometry, CylinderGeometry, Group, Mesh, type Material } from 'three/webgpu'

import {
  acquireF1Materials,
  bevelBox,
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
    const h = config.height
    const baseR = h * 0.32
    const topR = h * 0.07
    const base = bevelBox(h * 0.78, 0.045, h * 0.78, 0.006)
    base.translate(0, 0.022, 0)
    emit('body', base, body, 'base', kit.ink)
    const cone = new CylinderGeometry(topR, baseR, h * 0.92, 18)
    cone.translate(0, 0.045 + h * 0.46, 0)
    emit('body', cone, body, 'cone')
    const collar = new CylinderGeometry(topR * 1.15, topR * 1.05, h * 0.06, 14)
    collar.translate(0, 0.045 + h * 0.9, 0)
    emit('body', collar, body, 'collar', kit.ink)

    const bands: BufferGeometry[] = []
    for (const t of [0.38, 0.62] as const) {
      const y = 0.045 + t * h * 0.92
      const r = baseR * (1 - t) + topR * t
      const ring = bevelRing(r * 0.92, r * 1.12, h * 0.07, 0.002, 18)
      ring.rotateX(-Math.PI / 2)
      ring.translate(0, y, 0)
      bands.push(ring)
    }
    emit('stripe', mergeParts(bands, 'bands'), stripe, 'stripe')
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
  return createF1Preview(createModel({ height: 0.5 }), {
    aspect,
    target: [0, 0.26, 0],
    distance: 1.15,
    fov: 28,
    yaw: -0.55,
    pitch: 0.18,
  })
}
