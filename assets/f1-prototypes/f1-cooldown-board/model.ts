// f1-cooldown-board — name/position board on a stand. FIA yellow-board class.

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
  AXIS_Y,
  COOLDOWN_BOARD,
  LAYER_CLEARANCE,
  acquireF1Materials,
  bevelBox,
  circuitSignTexture,
  createF1Preview,
  disposeF1Materials,
  tubeSection,
} from '../f1-kit-core/index.ts'

type Slot = 'post' | 'plate'

export interface F1CooldownBoardConfig {
  kind: string
}

export interface F1CooldownBoardOptions extends Partial<F1CooldownBoardConfig> {
  materials?: Partial<Record<Slot, Material>>
}

export interface F1CooldownBoardInstance {
  readonly root: Group
  readonly parts: { post: Group; plate: Group }
  readonly materials: Readonly<Record<Slot, Material>>
  getConfig(): Readonly<F1CooldownBoardConfig>
  configure(patch: Partial<F1CooldownBoardConfig>): void
  setMaterial(slot: Slot, material: Material): void
  update(deltaSeconds: number): void
  dispose(): void
}

const defaults: F1CooldownBoardConfig = { kind: 'P1' }

export function createModel(options: F1CooldownBoardOptions = {}): F1CooldownBoardInstance {
  const config: F1CooldownBoardConfig = {
    kind: String(options.kind ?? defaults.kind).slice(0, 8).toUpperCase() || 'P1',
  }
  const bundle = acquireF1Materials()
  const kit = bundle.materials
  const extras: Material[] = []
  const textures: DataTexture[] = []
  let ownsPlate = options.materials?.plate === undefined
  const materialSlots: Record<Slot, Material> = {
    post: options.materials?.post ?? kit.graphite,
    plate: options.materials?.plate ?? kit.amber,
  }
  const root = new Group(); root.name = 'f1-cooldown-board'
  const post = new Group(); post.name = 'post'
  const plate = new Group(); plate.name = 'plate'
  root.add(post, plate)
  const generated: BufferGeometry[] = []
  const meshesBySlot: Record<Slot, Mesh[]> = { post: [], plate: [] }
  const releaseOwned = (): void => {
    for (const texture of textures) texture.dispose()
    textures.length = 0
    for (const material of extras) material.dispose()
    extras.length = 0
  }
  const releaseGenerated = (): void => {
    post.clear(); plate.clear()
    for (const geometry of generated) geometry.dispose()
    generated.length = 0
    for (const slot of Object.keys(meshesBySlot) as Slot[]) meshesBySlot[slot].length = 0
    if (ownsPlate) releaseOwned()
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
    emit('post', tubeSection(0.035, 1.6, [0, 0.8, 0], AXIS_Y, 10), post, 'post')
    const back = bevelBox(COOLDOWN_BOARD.width + 0.06, COOLDOWN_BOARD.height + 0.08, 0.04, 0.005)
    back.translate(0, 1.55, 0)
    emit('post', back, post, 'back')
    const face = new PlaneGeometry(COOLDOWN_BOARD.width, COOLDOWN_BOARD.height)
    face.translate(0, 1.55, 0.02 + LAYER_CLEARANCE * 3)
    if (ownsPlate) {
      const tex = circuitSignTexture({ kind: config.kind })
      textures.push(tex)
      const mat = new MeshStandardMaterial({
        name: 'f1-kit / cooldown board',
        map: tex,
        roughness: 0.5,
        metalness: 0.05,
      })
      extras.push(mat)
      emit('plate', face, plate, 'plate', mat)
    } else {
      emit('plate', face, plate, 'plate')
    }
  }
  rebuild()
  return {
    root,
    parts: { post, plate },
    materials: materialSlots,
    getConfig: () => ({ ...config }),
    configure(patch) {
      if (patch.kind !== undefined) config.kind = String(patch.kind).slice(0, 8).toUpperCase() || 'P1'
      rebuild()
    },
    setMaterial(slot, material) {
      if (slot === 'plate' && ownsPlate) {
        releaseOwned()
        ownsPlate = false
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
  return createF1Preview(createModel({ kind: 'P1' }), {
    aspect, target: [0, 1.1, 0], distance: 3.6, fov: 28, yaw: -0.4, pitch: 0.08,
  })
}
