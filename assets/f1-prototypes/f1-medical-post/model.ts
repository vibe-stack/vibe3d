// f1-medical-post — white trackside hut with a door, window, geometric red cross,
// and numbered marshal plate. Not a featureless cabinet.

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
  acquireF1Materials,
  bevelBox,
  createF1Preview,
  disposeF1Materials,
  marshalPlateTexture,
  mergeParts,
} from '../f1-kit-core/index.ts'

type Slot = 'hut' | 'cross' | 'plate'

export interface F1MedicalPostConfig {
  number: string
}

export interface F1MedicalPostOptions extends Partial<F1MedicalPostConfig> {
  materials?: Partial<Record<Slot, Material>>
}

export interface F1MedicalPostInstance {
  readonly root: Group
  readonly parts: { hut: Group; cross: Group; plate: Group }
  readonly materials: Readonly<Record<Slot, Material>>
  getConfig(): Readonly<F1MedicalPostConfig>
  configure(patch: Partial<F1MedicalPostConfig>): void
  setMaterial(slot: Slot, material: Material): void
  update(deltaSeconds: number): void
  dispose(): void
}

const defaults: F1MedicalPostConfig = { number: 'M1' }

function sanitizeNumber(value: string): string {
  const next = value.replace(/[^0-9A-Za-z]/g, '').slice(0, 3).toUpperCase()
  return next || 'M1'
}

export function createModel(options: F1MedicalPostOptions = {}): F1MedicalPostInstance {
  const config: F1MedicalPostConfig = {
    number: sanitizeNumber(options.number ?? defaults.number),
  }

  const bundle = acquireF1Materials()
  const kit = bundle.materials
  const extras: Material[] = []
  const textures: DataTexture[] = []
  const ownsPlate = options.materials?.plate === undefined
  const materialSlots: Record<Slot, Material> = {
    hut: options.materials?.hut ?? kit.shell,
    cross: options.materials?.cross ?? kit.red,
    plate: options.materials?.plate ?? kit.shell,
  }

  const root = new Group(); root.name = 'f1-medical-post'
  const hut = new Group(); hut.name = 'hut'
  const cross = new Group(); cross.name = 'cross'
  const plate = new Group(); plate.name = 'plate'
  root.add(hut, cross, plate)

  const generated: BufferGeometry[] = []
  const meshesBySlot: Record<Slot, Mesh[]> = { hut: [], cross: [], plate: [] }

  const releaseGenerated = (): void => {
    hut.clear(); cross.clear(); plate.clear()
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
    const w = 2.2
    const d = 1.7
    const h = 2.15
    const body = bevelBox(w, h, d, 0.014)
    body.translate(0, h / 2 + 0.06, 0)
    emit('hut', body, hut, 'hut')
    const skirt = bevelBox(w + 0.08, 0.1, d + 0.08, 0.008)
    skirt.translate(0, 0.05, 0)
    emit('hut', skirt, hut, 'skirt', kit.graphite)
    const roof = bevelBox(w + 0.28, 0.1, d + 0.28, 0.01)
    roof.translate(0, h + 0.16, 0)
    emit('hut', roof, hut, 'roof', kit.graphite)
    const ridge = bevelBox(w + 0.1, 0.08, 0.16, 0.006)
    ridge.translate(0, h + 0.24, 0)
    emit('hut', ridge, hut, 'ridge', kit.ink)

    const door = bevelBox(0.72, 1.55, 0.05, 0.006)
    door.translate(-0.42, 0.88, d / 2 + 0.02)
    emit('hut', door, hut, 'door', kit.shell)
    const handle = bevelBox(0.04, 0.12, 0.05, 0.004)
    handle.translate(-0.14, 0.9, d / 2 + 0.05)
    emit('hut', handle, hut, 'handle', kit.steel)
    const window = bevelBox(0.7, 0.48, 0.04, 0.005)
    window.translate(0.55, 1.35, d / 2 + 0.02)
    emit('hut', window, hut, 'window', kit.ink)

    const badge = bevelBox(0.72, 0.72, 0.03, 0.004)
    badge.translate(0.55, 1.85, d / 2 + 0.025)
    emit('cross', badge, cross, 'badge', kit.shell)
    const barV = bevelBox(0.16, 0.56, 0.04, 0.004)
    barV.translate(0.55, 1.85, d / 2 + 0.05)
    const barH = bevelBox(0.56, 0.16, 0.04, 0.004)
    barH.translate(0.55, 1.85, d / 2 + 0.05)
    emit('cross', mergeParts([barV, barH], 'cross'), cross, 'cross')

    const back = bevelBox(0.5, 0.34, 0.03, 0.004)
    back.translate(-0.55, 1.85, d / 2 + 0.025)
    emit('plate', back, plate, 'back', kit.graphite)
    const face = new PlaneGeometry(0.46, 0.3)
    face.translate(-0.55, 1.85, d / 2 + 0.042 + LAYER_CLEARANCE * 3)
    if (ownsPlate) {
      const tex = marshalPlateTexture(config.number)
      textures.push(tex)
      const mat = new MeshStandardMaterial({
        name: 'f1-kit / medical plate',
        map: tex,
        roughness: 0.55,
        metalness: 0.05,
      })
      extras.push(mat)
      emit('plate', face, plate, 'face', mat)
    } else {
      emit('plate', face, plate, 'face')
    }
  }
  rebuild()

  return {
    root,
    parts: { hut, cross, plate },
    materials: materialSlots,
    getConfig: () => ({ ...config }),
    configure(patch) {
      if (patch.number !== undefined) config.number = sanitizeNumber(patch.number)
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
  return createF1Preview(createModel({ number: 'M1' }), {
    aspect,
    target: [0, 1.15, 0.55],
    distance: 4.0,
    fov: 28,
    yaw: -0.42,
    pitch: 0.08,
  })
}
