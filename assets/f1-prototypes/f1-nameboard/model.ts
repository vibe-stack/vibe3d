// f1-nameboard — pit-wall driver board, tiles on GARAGE_BAY_PITCH.

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
  GARAGE_BAY_PITCH,
  LAYER_CLEARANCE,
  acquireF1Materials,
  bevelBox,
  createF1Preview,
  disposeF1Materials,
  fasciaTexture,
} from '../f1-kit-core/index.ts'

type Slot = 'board' | 'face'

export interface F1NameboardConfig {
  label: string
}

export interface F1NameboardOptions extends Partial<F1NameboardConfig> {
  materials?: Partial<Record<Slot, Material>>
}

export interface F1NameboardInstance {
  readonly root: Group
  readonly parts: { board: Group; face: Group }
  readonly materials: Readonly<Record<Slot, Material>>
  getConfig(): Readonly<F1NameboardConfig>
  configure(patch: Partial<F1NameboardConfig>): void
  setMaterial(slot: Slot, material: Material): void
  update(deltaSeconds: number): void
  dispose(): void
}

const defaults: F1NameboardConfig = { label: '44' }

export function createModel(options: F1NameboardOptions = {}): F1NameboardInstance {
  const config: F1NameboardConfig = {
    label: String(options.label ?? defaults.label).slice(0, 4).toUpperCase() || '44',
  }
  const bundle = acquireF1Materials()
  const kit = bundle.materials
  const extras: Material[] = []
  const textures: DataTexture[] = []
  let ownsFace = options.materials?.face === undefined
  const materialSlots: Record<Slot, Material> = {
    board: options.materials?.board ?? kit.graphite,
    face: options.materials?.face ?? kit.shell,
  }
  const root = new Group(); root.name = 'f1-nameboard'
  const board = new Group(); board.name = 'board'
  const face = new Group(); face.name = 'face'
  root.add(board, face)
  const generated: BufferGeometry[] = []
  const meshesBySlot: Record<Slot, Mesh[]> = { board: [], face: [] }
  const releaseOwned = (): void => {
    for (const texture of textures) texture.dispose()
    textures.length = 0
    for (const material of extras) material.dispose()
    extras.length = 0
  }
  const releaseGenerated = (): void => {
    board.clear(); face.clear()
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
    const w = GARAGE_BAY_PITCH - 0.4
    const h = 0.55
    const d = 0.06
    const body = bevelBox(w, h, d, 0.008)
    body.translate(0, 1.35, 0)
    emit('board', body, board, 'body')
    const post = bevelBox(0.05, 1.1, 0.05, 0.004)
    post.translate(0, 0.55, 0)
    emit('board', post, board, 'post')
    const screen = new PlaneGeometry(w - 0.08, h - 0.08)
    screen.translate(0, 1.35, d / 2 + LAYER_CLEARANCE * 3)
    if (ownsFace) {
      const tex = fasciaTexture({ number: config.label, legend: 'CAR', style: 'stamp' })
      textures.push(tex)
      const mat = new MeshStandardMaterial({
        name: 'f1-kit / nameboard',
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
    parts: { board, face },
    materials: materialSlots,
    getConfig: () => ({ ...config }),
    configure(patch) {
      if (patch.label !== undefined) config.label = String(patch.label).slice(0, 4).toUpperCase() || '44'
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
  return createF1Preview(createModel({ label: '44' }), {
    aspect, target: [0, 1.1, 0], distance: 8.5, fov: 28, yaw: -0.3, pitch: 0.08,
  })
}
