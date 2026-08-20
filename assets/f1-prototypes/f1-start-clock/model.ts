// f1-start-clock — grid countdown clock, ~1 m face.

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
  LAYER_CLEARANCE,
  START_CLOCK,
  acquireF1Materials,
  bevelBox,
  createF1Preview,
  disposeF1Materials,
  marshalPlateTexture,
} from '../f1-kit-core/index.ts'

type Slot = 'body' | 'face'

export interface F1StartClockConfig {
  digits: string
}

export interface F1StartClockOptions extends Partial<F1StartClockConfig> {
  materials?: Partial<Record<Slot, Material>>
}

export interface F1StartClockInstance {
  readonly root: Group
  readonly parts: { body: Group; face: Group }
  readonly materials: Readonly<Record<Slot, Material>>
  getConfig(): Readonly<F1StartClockConfig>
  configure(patch: Partial<F1StartClockConfig>): void
  setMaterial(slot: Slot, material: Material): void
  update(deltaSeconds: number): void
  dispose(): void
}

const defaults: F1StartClockConfig = { digits: '00' }

export function createModel(options: F1StartClockOptions = {}): F1StartClockInstance {
  const config: F1StartClockConfig = {
    digits: String(options.digits ?? defaults.digits).replace(/[^0-9]/g, '').slice(0, 3) || '00',
  }
  const bundle = acquireF1Materials()
  const kit = bundle.materials
  const extras: Material[] = []
  const textures: DataTexture[] = []
  let ownsFace = options.materials?.face === undefined
  const materialSlots: Record<Slot, Material> = {
    body: options.materials?.body ?? kit.graphite,
    face: options.materials?.face ?? kit.shell,
  }
  const root = new Group(); root.name = 'f1-start-clock'
  const body = new Group(); body.name = 'body'
  const face = new Group(); face.name = 'face'
  root.add(body, face)
  const generated: BufferGeometry[] = []
  const meshesBySlot: Record<Slot, Mesh[]> = { body: [], face: [] }
  const releaseOwned = (): void => {
    for (const texture of textures) texture.dispose()
    textures.length = 0
    for (const material of extras) material.dispose()
    extras.length = 0
  }
  const releaseGenerated = (): void => {
    body.clear(); face.clear()
    for (const geometry of generated) geometry.dispose()
    generated.length = 0
    for (const slot of Object.keys(meshesBySlot) as Slot[]) meshesBySlot[slot].length = 0
    if (ownsFace) releaseOwned()
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
    const s = START_CLOCK.size
    const d = START_CLOCK.depth
    const box = bevelBox(s, s, d, 0.012)
    box.translate(0, 1.4, 0)
    emit('body', box, body, 'box')
    const post = bevelBox(0.1, 0.9, 0.1, 0.006)
    post.translate(0, 0.45, 0)
    emit('body', post, body, 'post')
    const screen = new PlaneGeometry(s - 0.1, s - 0.1)
    screen.translate(0, 1.4, d / 2 + LAYER_CLEARANCE * 3)
    if (ownsFace) {
      const tex = marshalPlateTexture(config.digits)
      textures.push(tex)
      const mat = new MeshStandardMaterial({
        name: 'f1-kit / start clock',
        map: tex,
        roughness: 0.45,
        metalness: 0.05,
      })
      extras.push(mat)
      emit('face', screen, face, 'face', mat)
    } else {
      emit('face', screen, face, 'face')
    }
  }
  rebuild()
  return {
    root,
    parts: { body, face },
    materials: materialSlots,
    getConfig: () => ({ ...config }),
    configure(patch) {
      if (patch.digits !== undefined) {
        config.digits = String(patch.digits).replace(/[^0-9]/g, '').slice(0, 3) || '00'
      }
      rebuild()
    },
    setMaterial(slot, material) {
      if (slot === 'face' && ownsFace) {
        releaseOwned()
        ownsFace = false
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
  return createF1Preview(createModel({ digits: '30' }), {
    aspect, target: [0, 1.2, 0], distance: 3.8, fov: 28, yaw: -0.35, pitch: 0.08,
  })
}
