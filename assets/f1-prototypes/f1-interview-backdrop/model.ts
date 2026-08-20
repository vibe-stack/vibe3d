// f1-interview-backdrop — cooldown / press wall with fascia slots.

import {
  BufferGeometry,
  DataTexture,
  Group,
  Mesh,
  MeshStandardMaterial,
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
  fasciaTexture,
  isFasciaStyle,
  type FasciaStyle,
} from '../f1-kit-core/index.ts'

type Slot = 'wall' | 'fascia'

export interface F1InterviewBackdropConfig {
  width: number
  style: FasciaStyle
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

const defaults: F1InterviewBackdropConfig = { width: INTERVIEW_BACKDROP.width, style: 'stamp' }

export function createModel(options: F1InterviewBackdropOptions = {}): F1InterviewBackdropInstance {
  const config: F1InterviewBackdropConfig = {
    width: Math.max(2, options.width ?? defaults.width),
    style: options.style && isFasciaStyle(options.style) ? options.style : defaults.style,
  }
  const bundle = acquireF1Materials()
  const kit = bundle.materials
  const extras: Material[] = []
  const textures: DataTexture[] = []
  let ownsFascia = options.materials?.fascia === undefined
  const materialSlots: Record<Slot, Material> = {
    wall: options.materials?.wall ?? kit.slate,
    fascia: options.materials?.fascia ?? kit.shell,
  }
  const root = new Group(); root.name = 'f1-interview-backdrop'
  const wall = new Group(); wall.name = 'wall'
  const fascia = new Group(); fascia.name = 'fascia'
  root.add(wall, fascia)
  const generated: BufferGeometry[] = []
  const meshesBySlot: Record<Slot, Mesh[]> = { wall: [], fascia: [] }
  const releaseOwned = (): void => {
    for (const texture of textures) texture.dispose()
    textures.length = 0
    for (const material of extras) material.dispose()
    extras.length = 0
  }
  const releaseGenerated = (): void => {
    wall.clear(); fascia.clear()
    for (const geometry of generated) geometry.dispose()
    generated.length = 0
    for (const slot of Object.keys(meshesBySlot) as Slot[]) meshesBySlot[slot].length = 0
    if (ownsFascia) releaseOwned()
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
    const w = config.width
    const h = INTERVIEW_BACKDROP.height
    const d = INTERVIEW_BACKDROP.depth
    const body = bevelBox(w, h, d, 0.012)
    body.translate(0, h / 2, 0)
    emit('wall', body, wall, 'body')
    const face = new PlaneGeometry(w - 0.2, h - 0.3)
    face.translate(0, h / 2, d / 2 + LAYER_CLEARANCE * 3)
    if (ownsFascia) {
      const tex = fasciaTexture({ number: 'P1', legend: 'PRESS', style: config.style })
      textures.push(tex)
      const mat = new MeshStandardMaterial({
        name: 'f1-kit / interview fascia',
        map: tex,
        roughness: 0.55,
        metalness: 0.05,
      })
      extras.push(mat)
      emit('fascia', face, fascia, 'face', mat)
    } else {
      emit('fascia', face, fascia, 'face')
    }
  }
  rebuild()
  return {
    root,
    parts: { wall, fascia },
    materials: materialSlots,
    getConfig: () => ({ ...config }),
    configure(patch) {
      if (patch.width !== undefined) config.width = Math.max(2, patch.width)
      if (patch.style !== undefined && isFasciaStyle(patch.style)) config.style = patch.style
      rebuild()
    },
    setMaterial(slot, material) {
      if (slot === 'fascia' && ownsFascia) {
        releaseOwned()
        ownsFascia = false
      }
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
