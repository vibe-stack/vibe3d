// f1-circuit-sign — one FIA plate; `kind` picks DRS / PIT ENTRY / PIT EXIT / 80 / T-n / SC / VSC.
// Pass a custom plate via setMaterial('plate', …). Plate is an FIA yellow board (~600–800 mm).

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
  CIRCUIT_SIGN_PLATE,
  LAYER_CLEARANCE,
  acquireF1Materials,
  bevelBox,
  circuitSignTexture,
  createF1Preview,
  disposeF1Materials,
  isCircuitSignKind,
  tubeSection,
  type CircuitSignKind,
} from '../f1-kit-core/index.ts'

type Slot = 'post' | 'plate'

export interface F1CircuitSignConfig {
  kind: CircuitSignKind
  /** Turn index used when kind is T-n. */
  turn: number
}

export interface F1CircuitSignOptions extends Partial<F1CircuitSignConfig> {
  materials?: Partial<Record<Slot, Material>>
}

export interface F1CircuitSignInstance {
  readonly root: Group
  readonly parts: { post: Group; plate: Group }
  readonly materials: Readonly<Record<Slot, Material>>
  getConfig(): Readonly<F1CircuitSignConfig>
  configure(patch: Partial<F1CircuitSignConfig>): void
  setMaterial(slot: Slot, material: Material): void
  update(deltaSeconds: number): void
  dispose(): void
}

const defaults: F1CircuitSignConfig = { kind: 'DRS', turn: 1 }
const PLATE_W = CIRCUIT_SIGN_PLATE.width
const PLATE_H = CIRCUIT_SIGN_PLATE.height

export function createModel(options: F1CircuitSignOptions = {}): F1CircuitSignInstance {
  const config: F1CircuitSignConfig = {
    kind: isCircuitSignKind(options.kind ?? '') ? options.kind! : defaults.kind,
    turn: Math.max(1, Math.round(options.turn ?? defaults.turn)),
  }
  const bundle = acquireF1Materials()
  const kit = bundle.materials
  const extras: Material[] = []
  const textures: DataTexture[] = []
  const ownsPlate = options.materials?.plate === undefined
  const materialSlots: Record<Slot, Material> = {
    post: options.materials?.post ?? kit.graphite,
    plate: options.materials?.plate ?? kit.amber,
  }
  const root = new Group(); root.name = 'f1-circuit-sign'
  const post = new Group(); post.name = 'post'
  const plate = new Group(); plate.name = 'plate'
  root.add(post, plate)
  const generated: BufferGeometry[] = []
  const meshesBySlot: Record<Slot, Mesh[]> = { post: [], plate: [] }
  const releaseGenerated = (): void => {
    post.clear(); plate.clear()
    for (const geometry of generated) geometry.dispose()
    generated.length = 0
    for (const slot of Object.keys(meshesBySlot) as Slot[]) meshesBySlot[slot].length = 0
    if (ownsPlate) {
      for (const texture of textures) texture.dispose()
      textures.length = 0
      for (const material of extras) material.dispose()
      extras.length = 0
    }
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
    emit('post', tubeSection(0.04, 2.4, [0, 1.2, 0], AXIS_Y, 10), post, 'post')
    const back = bevelBox(PLATE_W + 0.06, PLATE_H + 0.08, 0.05, 0.006)
    back.translate(0, 2.05, 0)
    emit('post', back, post, 'back')
    const face = new PlaneGeometry(PLATE_W, PLATE_H)
    face.translate(0, 2.05, 0.025 + LAYER_CLEARANCE * 3)
    const label = config.kind === 'T-n' ? `T${config.turn}` : config.kind
    if (ownsPlate) {
      const tex = circuitSignTexture({ kind: label })
      textures.push(tex)
      const mat = new MeshStandardMaterial({
        name: 'f1-kit / circuit sign',
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
      if (patch.kind !== undefined && isCircuitSignKind(patch.kind)) config.kind = patch.kind
      if (patch.turn !== undefined) config.turn = Math.max(1, Math.round(patch.turn))
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
  return createF1Preview(createModel({ kind: 'DRS' }), {
    aspect, target: [0, 1.5, 0], distance: 4.2, fov: 28, yaw: -0.45, pitch: 0.08,
  })
}
