// f1-nameboard — pit-wall driver plate. Default Checo 11, black and white.

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
  DRIVER,
  LAYER_CLEARANCE,
  NAMEBOARD,
  acquireF1Materials,
  bevelBox,
  createF1Preview,
  disposeF1Materials,
  driverPlateTexture,
} from '../f1-kit-core/index.ts'

type Slot = 'board' | 'face'

export interface F1NameboardConfig {
  label: string
  name: string
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

const defaults: F1NameboardConfig = { label: DRIVER.number, name: DRIVER.name }

function stamp(value: string, fallback: string, max: number): string {
  return String(value ?? '').replace(/[^0-9A-Za-z]/g, '').slice(0, max).toUpperCase() || fallback
}

export function createModel(options: F1NameboardOptions = {}): F1NameboardInstance {
  const config: F1NameboardConfig = {
    label: stamp(options.label ?? defaults.label, DRIVER.number, 3),
    name: stamp(options.name ?? defaults.name, DRIVER.name, 8),
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
    const w = NAMEBOARD.width
    const h = NAMEBOARD.height
    const d = NAMEBOARD.depth
    const body = bevelBox(w, h, d, 0.006)
    body.translate(0, 1.15, 0)
    emit('board', body, board, 'body')
    const wall = bevelBox(w + 0.5, 0.9, 0.08, 0.01)
    wall.translate(0, 1.05, -0.12)
    emit('board', wall, board, 'wall-stub')
    for (const sx of [-1, 1] as const) {
      const post = bevelBox(0.06, 1.35, 0.06, 0.006)
      post.translate(sx * (w / 2 + 0.12), 0.68, -0.12)
      emit('board', post, board, `clip-post-${sx}`)
      const clip = bevelBox(0.1, 0.05, 0.12, 0.004)
      clip.translate(sx * (w / 2 - 0.08), 1.15, -0.04)
      emit('board', clip, board, `clip-${sx}`)
    }
    const screen = new PlaneGeometry(w - 0.06, h - 0.06)
    screen.translate(0, 1.15, d / 2 + LAYER_CLEARANCE * 3)
    if (ownsFace) {
      const tex = driverPlateTexture({ number: config.label, name: config.name })
      textures.push(tex)
      const mat = new MeshStandardMaterial({
        name: 'f1-kit / nameboard',
        map: tex,
        roughness: 0.48,
        metalness: 0.04,
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
      if (patch.label !== undefined) config.label = stamp(patch.label, DRIVER.number, 3)
      if (patch.name !== undefined) config.name = stamp(patch.name, DRIVER.name, 8)
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
    aspect, target: [0, 1.1, 0], distance: 4.0, fov: 28, yaw: -0.55, pitch: 0.1,
  })
}
