// f1-interview-backdrop — FOM cooldown wall: truss frame, blank fascia.
// Host hangs an image with setMaterial('fascia', …). No P1 PRESS stamp.

import {
  BufferGeometry,
  Group,
  Mesh,
  PlaneGeometry,
  type Material,
} from 'three/webgpu'

import {
  INTERVIEW_BACKDROP,
  LAYER_CLEARANCE,
  acquireF1Materials,
  bevelBox,
  createF1Preview,
  disposeF1Materials,
  mergeParts,
} from '../f1-kit-core/index.ts'

type Slot = 'wall' | 'fascia'

export interface F1InterviewBackdropConfig {
  width: number
}

export interface F1InterviewBackdropOptions extends Partial<F1InterviewBackdropConfig> {
  materials?: Partial<Record<Slot, Material>>
}

export interface F1InterviewBackdropInstance {
  readonly root: Group
  readonly parts: { wall: Group; fascia: Group }
  readonly materials: Readonly<Record<Slot, Material>>
  getConfig(): Readonly<F1InterviewBackdropConfig>
  configure(patch: Partial<F1InterviewBackdropConfig>): void
  setMaterial(slot: Slot, material: Material): void
  update(deltaSeconds: number): void
  dispose(): void
}

const defaults: F1InterviewBackdropConfig = { width: INTERVIEW_BACKDROP.width }

export function createModel(options: F1InterviewBackdropOptions = {}): F1InterviewBackdropInstance {
  const config: F1InterviewBackdropConfig = {
    width: Math.max(2, options.width ?? defaults.width),
  }
  const bundle = acquireF1Materials()
  const kit = bundle.materials
  const materialSlots: Record<Slot, Material> = {
    wall: options.materials?.wall ?? kit.graphite,
    fascia: options.materials?.fascia ?? kit.shell,
  }
  const root = new Group(); root.name = 'f1-interview-backdrop'
  const wall = new Group(); wall.name = 'wall'
  const fascia = new Group(); fascia.name = 'fascia'
  root.add(wall, fascia)
  const generated: BufferGeometry[] = []
  const meshesBySlot: Record<Slot, Mesh[]> = { wall: [], fascia: [] }
  const releaseGenerated = (): void => {
    wall.clear(); fascia.clear()
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
    const w = config.width
    const h = INTERVIEW_BACKDROP.height
    const d = INTERVIEW_BACKDROP.depth
    const t = INTERVIEW_BACKDROP.truss
    const body = bevelBox(w - t * 2, h - t * 2, d * 0.45, 0.008)
    body.translate(0, h / 2, 0)
    emit('wall', body, wall, 'body')
    const trussParts: BufferGeometry[] = []
    const rail = bevelBox(w, t, t, 0.004)
    const copy = rail.clone() as BufferGeometry
    rail.translate(0, t / 2, 0)
    copy.translate(0, h - t / 2, 0)
    trussParts.push(rail, copy)
    for (const sx of [-1, 1] as const) {
      const post = bevelBox(t, h, t, 0.004)
      post.translate(sx * (w / 2 - t / 2), h / 2, 0)
      trussParts.push(post)
    }
    const mid = bevelBox(w - t * 2, t * 0.7, t * 0.7, 0.003)
    mid.translate(0, h * 0.5, 0)
    trussParts.push(mid)
    emit('wall', mergeParts(trussParts, 'truss'), wall, 'truss')
    const face = new PlaneGeometry(w - t * 2.4, h - t * 2.4)
    face.translate(0, h / 2, d * 0.22 + LAYER_CLEARANCE * 3)
    emit('fascia', face, fascia, 'face')
  }
  rebuild()
  return {
    root,
    parts: { wall, fascia },
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
    aspect, target: [0, 1.2, 0], distance: 8.5, fov: 30, yaw: -0.25, pitch: 0.06,
  })
}
