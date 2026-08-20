// f1-pit-totem — vertical pit-lane information totem.

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
  PIT_TOTEM,
  acquireF1Materials,
  bevelBox,
  createF1Preview,
  disposeF1Materials,
  fasciaTexture,
} from '../f1-kit-core/index.ts'

type Slot = 'body' | 'face'

export interface F1PitTotemConfig {
  height: number
}

export interface F1PitTotemOptions extends Partial<F1PitTotemConfig> {
  materials?: Partial<Record<Slot, Material>>
}

export interface F1PitTotemInstance {
  readonly root: Group
  readonly parts: { body: Group; face: Group }
  readonly materials: Readonly<Record<Slot, Material>>
  getConfig(): Readonly<F1PitTotemConfig>
  configure(patch: Partial<F1PitTotemConfig>): void
  setMaterial(slot: Slot, material: Material): void
  update(deltaSeconds: number): void
  dispose(): void
}

const defaults: F1PitTotemConfig = { height: PIT_TOTEM.height }

export function createModel(options: F1PitTotemOptions = {}): F1PitTotemInstance {
  const config: F1PitTotemConfig = {
    height: Math.max(2, options.height ?? defaults.height),
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
  const root = new Group(); root.name = 'f1-pit-totem'
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
    const h = config.height
    const w = PIT_TOTEM.width
    const d = PIT_TOTEM.depth
    const shaft = bevelBox(w, h, d, 0.012)
    shaft.translate(0, h / 2, 0)
    emit('body', shaft, body, 'shaft')
    const screen = new PlaneGeometry(w - 0.12, h - 0.4)
    screen.translate(0, h / 2, d / 2 + LAYER_CLEARANCE * 3)
    if (ownsFace) {
      const tex = fasciaTexture({ number: 'PIT', legend: 'INFO', style: 'stamp' })
      textures.push(tex)
      const mat = new MeshStandardMaterial({
        name: 'f1-kit / pit totem',
        map: tex,
        roughness: 0.5,
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
      if (patch.height !== undefined) config.height = Math.max(2, patch.height)
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
  return createF1Preview(createModel(), {
    aspect, target: [0, 1.7, 0], distance: 7.2, fov: 28, yaw: -0.4, pitch: 0.06,
  })
}
