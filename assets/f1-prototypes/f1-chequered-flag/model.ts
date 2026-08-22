// f1-chequered-flag — handheld FIA finish flag. Grip at the origin so a host
// character can parent the root. Cloth is a 2:3 chequer that waves in update();
// no marshal figure, no PRNG.

import {
  BufferGeometry,
  CylinderGeometry,
  DataTexture,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  Mesh,
  MeshStandardMaterial,
  NearestFilter,
  PlaneGeometry,
  RGBAFormat,
  UnsignedByteType,
  type Material,
} from 'three/webgpu'

import {
  acquireF1Materials,
  bevelBox,
  createF1Preview,
  disposeF1Materials,
} from '../f1-kit-core/index.ts'

type Slot = 'pole' | 'cloth'

export interface F1ChequeredFlagConfig {
  waving: boolean
  windXZ: readonly [number, number]
}

export interface F1ChequeredFlagOptions extends Partial<F1ChequeredFlagConfig> {
  materials?: Partial<Record<Slot, Material>>
}

export interface F1ChequeredFlagInstance {
  readonly root: Group
  readonly parts: { pole: Group; cloth: Group }
  readonly materials: Readonly<Record<Slot, Material>>
  getConfig(): Readonly<F1ChequeredFlagConfig>
  configure(patch: Partial<F1ChequeredFlagConfig>): void
  setMaterial(slot: Slot, material: Material): void
  update(deltaSeconds: number): void
  dispose(): void
}

const STICK = 0.92
const FLY = 0.80
const HOIST = 0.54
const WAVE_HZ = 2.2
const WAVE_AMP = 0.22
const defaults: F1ChequeredFlagConfig = {
  waving: true,
  windXZ: [1, 0],
}

function normalizeWind(value: readonly [number, number]): readonly [number, number] {
  const len = Math.hypot(value[0], value[1])
  if (len < 1e-6) return [1, 0]
  return [value[0] / len, value[1] / len]
}

function chequerTexture(): DataTexture {
  const cols = 8
  const rows = 6
  const cell = 10
  const w = cols * cell
  const h = rows * cell
  const data = new Uint8Array(w * h * 4)
  const ink: [number, number, number] = [10, 12, 14]
  const paper: [number, number, number] = [246, 247, 244]
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4
      const on = ((Math.floor(x / cell) + Math.floor(y / cell)) & 1) === 0
      const [r, g, b] = on ? paper : ink
      data[i] = r
      data[i + 1] = g
      data[i + 2] = b
      data[i + 3] = 255
    }
  }
  const tex = new DataTexture(data, w, h, RGBAFormat, UnsignedByteType)
  tex.minFilter = NearestFilter
  tex.magFilter = NearestFilter
  tex.flipY = true
  tex.needsUpdate = true
  tex.name = 'f1-kit / chequered'
  return tex
}

export function createModel(options: F1ChequeredFlagOptions = {}): F1ChequeredFlagInstance {
  const config: F1ChequeredFlagConfig = {
    waving: options.waving ?? defaults.waving,
    windXZ: normalizeWind(options.windXZ ?? defaults.windXZ),
  }

  const bundle = acquireF1Materials()
  const kit = bundle.materials
  const extras: Material[] = []
  const textures: DataTexture[] = []
  const tex = chequerTexture()
  textures.push(tex)
  const clothMat = options.materials?.cloth ?? (() => {
    const mat = new MeshStandardMaterial({
      name: 'f1-kit / chequered cloth',
      map: tex,
      roughness: 0.88,
      metalness: 0,
      side: DoubleSide,
    })
    extras.push(mat)
    return mat
  })()
  const materialSlots: Record<Slot, Material> = {
    pole: options.materials?.pole ?? kit.steel,
    cloth: clothMat,
  }

  const root = new Group()
  root.name = 'f1-chequered-flag'
  const wave = new Group()
  wave.name = 'wave'
  const pole = new Group(); pole.name = 'pole'
  const cloth = new Group(); cloth.name = 'cloth'
  wave.add(pole, cloth)
  root.add(wave)

  const generated: BufferGeometry[] = []
  const meshesBySlot: Record<Slot, Mesh[]> = { pole: [], cloth: [] }
  let rest: Float32Array | null = null
  let clothMesh: Mesh | null = null
  let elapsed = 0

  const releaseGenerated = (): void => {
    pole.clear(); cloth.clear()
    for (const geometry of generated) geometry.dispose()
    generated.length = 0
    meshesBySlot.pole.length = 0
    meshesBySlot.cloth.length = 0
    rest = null
    clothMesh = null
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

  const applyCloth = (t: number): void => {
    if (!clothMesh || !rest) return
    const pos = clothMesh.geometry.getAttribute('position') as Float32BufferAttribute
    const wind = config.windXZ
    const hoistX = 0.02
    for (let i = 0; i < pos.count; i++) {
      const rx = rest[i * 3]!
      const ry = rest[i * 3 + 1]!
      const rz = rest[i * 3 + 2]!
      const u = Math.max(0, Math.min(1, (rx - hoistX) / FLY))
      const phase = t * 7.2 + u * 8.4 + wind[1] * 1.1
      const flap = Math.sin(phase) * u * 0.09
      const sag = Math.sin(t * 5.4 + u * 5.1) * u * 0.028
      pos.setXYZ(
        i,
        rx + wind[0] * u * 0.02,
        ry + sag,
        rz + flap + wind[1] * u * 0.03,
      )
    }
    pos.needsUpdate = true
    clothMesh.geometry.computeVertexNormals()
  }

  const applyWave = (): void => {
    wave.rotation.z = config.waving ? Math.sin(elapsed * WAVE_HZ * Math.PI * 2) * WAVE_AMP : 0
    applyCloth(elapsed)
  }

  const rebuild = (): void => {
    releaseGenerated()
    const grip = new CylinderGeometry(0.018, 0.02, 0.12, 12)
    grip.translate(0, 0.06, 0)
    emit('pole', grip, pole, 'grip', kit.ink)

    const shaftLen = STICK - 0.14
    const shaft = new CylinderGeometry(0.009, 0.011, shaftLen, 10)
    shaft.translate(0, 0.14 + shaftLen / 2, 0)
    emit('pole', shaft, pole, 'shaft')

    const ferrule = new CylinderGeometry(0.013, 0.013, 0.028, 12)
    ferrule.translate(0, STICK - 0.01, 0)
    emit('pole', ferrule, pole, 'ferrule')

    const tape = bevelBox(0.03, HOIST + 0.02, 0.012, 0.002)
    tape.translate(0.018, STICK - HOIST / 2, 0)
    emit('pole', tape, pole, 'hoist-tape', kit.graphite)

    const sheet = new PlaneGeometry(FLY, HOIST, 16, 10)
    sheet.translate(FLY / 2 + 0.02, STICK - HOIST / 2, 0)
    const attr = sheet.getAttribute('position')
    rest = new Float32Array(attr.array as Float32Array)
    emit('cloth', sheet, cloth, 'cloth')
    clothMesh = cloth.children[0] as Mesh
    applyWave()
  }
  rebuild()

  return {
    root,
    parts: { pole, cloth },
    materials: materialSlots,
    getConfig: () => ({ ...config, windXZ: [...config.windXZ] as [number, number] }),
    configure(patch) {
      if (patch.waving !== undefined) config.waving = patch.waving
      if (patch.windXZ !== undefined) config.windXZ = normalizeWind(patch.windXZ)
      applyWave()
    },
    setMaterial(slot, material) {
      materialSlots[slot] = material
      for (const mesh of meshesBySlot[slot]) mesh.material = material
    },
    update(deltaSeconds) {
      elapsed += deltaSeconds
      applyWave()
    },
    dispose() {
      releaseGenerated()
      for (const material of extras) material.dispose()
      for (const texture of textures) texture.dispose()
      disposeF1Materials(bundle)
      root.removeFromParent()
    },
  }
}

export function createPreview({ aspect, time }: { aspect: number; time?: number }) {
  const model = createModel({ waving: true, windXZ: [0.92, -0.39] })
  const preview = createF1Preview(model, {
    aspect,
    target: [0.28, 0.62, 0],
    distance: 2.15,
    fov: 30,
    yaw: -0.72,
    pitch: 0.18,
  })
  model.update(time ?? 0.38)
  return preview
}
