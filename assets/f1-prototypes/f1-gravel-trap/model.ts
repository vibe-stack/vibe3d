// f1-gravel-trap — a placeable raked-gravel TILE, not terrain. Weyl-cycled pebbles, no PRNG.

import {
  BufferGeometry,
  DataTexture,
  Group,
  LinearFilter,
  Mesh,
  MeshStandardMaterial,
  RepeatWrapping,
  RGBAFormat,
  UnsignedByteType,
  type Material,
} from 'three/webgpu'

import {
  TOKEN,
  acquireF1Materials,
  bevelBox,
  createF1Preview,
  disposeF1Materials,
  mergeParts,
  shade,
} from '../f1-kit-core/index.ts'

type Slot = 'bed' | 'stone'

export interface F1GravelTrapConfig {
  modules: number
}

export interface F1GravelTrapOptions extends Partial<F1GravelTrapConfig> {
  materials?: Partial<Record<Slot, Material>>
}

export interface F1GravelTrapInstance {
  readonly root: Group
  readonly parts: { bed: Group; stone: Group }
  readonly materials: Readonly<Record<Slot, Material>>
  getConfig(): Readonly<F1GravelTrapConfig>
  configure(patch: Partial<F1GravelTrapConfig>): void
  setMaterial(slot: Slot, material: Material): void
  update(deltaSeconds: number): void
  dispose(): void
}

const defaults: F1GravelTrapConfig = { modules: 2 }
const TILE = 2.5
const THICK = 0.06
const WEYL = 0.7548776662466927

function gravelTexture(): DataTexture {
  const n = 64
  const data = new Uint8Array(n * n * 4)
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const i = (y * n + x) * 4
      const cell = ((x * 7 + y * 13) & 7)
      const k = 160 + cell * 8
      data[i] = k
      data[i + 1] = k - 18
      data[i + 2] = k - 42
      data[i + 3] = 255
    }
  }
  const tex = new DataTexture(data, n, n, RGBAFormat, UnsignedByteType)
  tex.wrapS = RepeatWrapping
  tex.wrapT = RepeatWrapping
  tex.minFilter = LinearFilter
  tex.magFilter = LinearFilter
  tex.repeat.set(4, 4)
  tex.needsUpdate = true
  return tex
}

export function createModel(options: F1GravelTrapOptions = {}): F1GravelTrapInstance {
  const config: F1GravelTrapConfig = {
    modules: Math.max(1, Math.round(options.modules ?? defaults.modules)),
  }

  const bundle = acquireF1Materials()
  const extras: Material[] = []
  const textures: DataTexture[] = []
  const ownsBed = options.materials?.bed === undefined
  let bedMat: Material
  if (ownsBed) {
    const weave = gravelTexture()
    textures.push(weave)
    bedMat = new MeshStandardMaterial({
      name: 'f1-kit / gravel bed',
      map: weave,
      color: TOKEN.DUST_300,
      roughness: 0.95,
      metalness: 0,
    })
    extras.push(bedMat)
  } else {
    bedMat = options.materials!.bed!
  }
  const materialSlots: Record<Slot, Material> = {
    bed: bedMat,
    stone: options.materials?.stone ?? (() => {
      const mat = new MeshStandardMaterial({
        name: 'f1-kit / gravel stone',
        color: shade(TOKEN.DUST_300, -0.18),
        roughness: 0.9,
        metalness: 0,
      })
      extras.push(mat)
      return mat
    })(),
  }

  const root = new Group()
  root.name = 'f1-gravel-trap'
  const bed = new Group(); bed.name = 'bed'
  const stone = new Group(); stone.name = 'stone'
  root.add(bed, stone)

  const generated: BufferGeometry[] = []
  const meshesBySlot: Record<Slot, Mesh[]> = { bed: [], stone: [] }

  const releaseGenerated = (): void => {
    bed.clear(); stone.clear()
    for (const geometry of generated) geometry.dispose()
    generated.length = 0
    for (const slot of Object.keys(meshesBySlot) as Slot[]) meshesBySlot[slot].length = 0
  }

  const emit = (slot: Slot, geometry: BufferGeometry, group: Group, name: string): void => {
    generated.push(geometry)
    const mesh = new Mesh(geometry, materialSlots[slot])
    mesh.name = name
    mesh.castShadow = true
    mesh.receiveShadow = true
    meshesBySlot[slot].push(mesh)
    group.add(mesh)
  }

  const rebuild = (): void => {
    releaseGenerated()
    const length = config.modules * TILE
    const slab = bevelBox(length, THICK, TILE, 0.008)
    slab.translate(0, THICK / 2, 0)
    emit('bed', slab, bed, 'bed')
    const pebbles: BufferGeometry[] = []
    const count = config.modules * 18
    for (let i = 0; i < count; i++) {
      const u = (i * WEYL) % 1
      const v = (i * WEYL * 1.324) % 1
      const x = (u - 0.5) * (length - 0.3)
      const z = (v - 0.5) * (TILE - 0.3)
      const s = 0.04 + ((i * 3) % 5) * 0.012
      const pebble = bevelBox(s, s * 0.55, s * 0.8, 0.004)
      pebble.translate(x, THICK + s * 0.2, z)
      pebbles.push(pebble)
    }
    emit('stone', mergeParts(pebbles, 'stones'), stone, 'stones')
  }
  rebuild()

  return {
    root,
    parts: { bed, stone },
    materials: materialSlots,
    getConfig: () => ({ ...config }),
    configure(patch) {
      if (patch.modules !== undefined) config.modules = Math.max(1, Math.round(patch.modules))
      rebuild()
    },
    setMaterial(slot, material) {
      materialSlots[slot] = material
      for (const mesh of meshesBySlot[slot]) mesh.material = material
    },
    update: () => {},
    dispose() {
      releaseGenerated()
      for (const texture of textures) texture.dispose()
      for (const material of extras) material.dispose()
      disposeF1Materials(bundle)
      root.removeFromParent()
    },
  }
}

export function createPreview({ aspect }: { aspect: number; time?: number }) {
  return createF1Preview(createModel({ modules: 2 }), {
    aspect,
    target: [0, 0.04, 0],
    distance: 6.4,
    fov: 28,
    yaw: -0.8,
    pitch: 0.55,
  })
}
