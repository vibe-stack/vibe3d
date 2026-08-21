// f1-cooldown-board — cooldown name/position plate on a stand.
// Default Checo 11, black and white. setMaterial('plate') for a host image.

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
  DRIVER,
  LAYER_CLEARANCE,
  acquireF1Materials,
  bevelBox,
  createF1Preview,
  disposeF1Materials,
  driverPlateTexture,
  tubeSection,
} from '../f1-kit-core/index.ts'

type Slot = 'post' | 'plate'

export interface F1CooldownBoardConfig {
  kind: string
  name: string
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

const defaults: F1CooldownBoardConfig = { kind: DRIVER.number, name: DRIVER.name }

function stamp(value: string, fallback: string, max: number): string {
  return String(value ?? '').replace(/[^0-9A-Za-z]/g, '').slice(0, max).toUpperCase() || fallback
}

export function createModel(options: F1CooldownBoardOptions = {}): F1CooldownBoardInstance {
  const config: F1CooldownBoardConfig = {
    kind: stamp(options.kind ?? defaults.kind, DRIVER.number, 8),
    name: stamp(options.name ?? defaults.name, DRIVER.name, 8),
  }
  const bundle = acquireF1Materials()
  const kit = bundle.materials
  const extras: Material[] = []
  const textures: DataTexture[] = []
  let ownsPlate = options.materials?.plate === undefined
  const materialSlots: Record<Slot, Material> = {
    post: options.materials?.post ?? kit.graphite,
    plate: options.materials?.plate ?? kit.shell,
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
    const poleH = COOLDOWN_BOARD.poleH
    const plateY = poleH + COOLDOWN_BOARD.height * 0.35
    emit('post', tubeSection(0.018, poleH, [0, poleH / 2, 0], AXIS_Y, 10), post, 'post')
    const foot = bevelBox(0.22, 0.02, 0.16, 0.003)
    foot.translate(0, 0.01, 0)
    emit('post', foot, post, 'foot')
    const back = bevelBox(COOLDOWN_BOARD.width + 0.04, COOLDOWN_BOARD.height + 0.04, 0.03, 0.004)
    back.translate(0, plateY, 0)
    emit('post', back, post, 'back')
    const face = new PlaneGeometry(COOLDOWN_BOARD.width, COOLDOWN_BOARD.height)
    face.translate(0, plateY, 0.018 + LAYER_CLEARANCE * 3)
    if (ownsPlate) {
      const tex = driverPlateTexture({ number: config.kind, name: config.name })
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
      if (patch.kind !== undefined) config.kind = stamp(patch.kind, DRIVER.number, 8)
      if (patch.name !== undefined) config.name = stamp(patch.name, DRIVER.name, 8)
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
  return createF1Preview(createModel(), {
    aspect, target: [0, 1.0, 0], distance: 3.2, fov: 28, yaw: -0.4, pitch: 0.08,
  })
}
