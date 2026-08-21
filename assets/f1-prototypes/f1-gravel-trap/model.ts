// f1-gravel-trap — a placeable raked-gravel TILE, not terrain. Weyl-cycled stones, no PRNG, no canvas map.

import { BufferGeometry, Group, Mesh, MeshStandardMaterial, type Material } from 'three/webgpu'

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
const THICK = 0.04
const GOLDEN = 0.6180339887498949

export function createModel(options: F1GravelTrapOptions = {}): F1GravelTrapInstance {
  const config: F1GravelTrapConfig = {
    modules: Math.max(1, Math.round(options.modules ?? defaults.modules)),
  }

  const bundle = acquireF1Materials()
  const extras: Material[] = []
  const materialSlots: Record<Slot, Material> = {
    bed: options.materials?.bed ?? (() => {
      const mat = new MeshStandardMaterial({
        name: 'f1-kit / gravel bed',
        color: shade(TOKEN.DUST_300, -0.48),
        roughness: 0.97,
        metalness: 0,
      })
      extras.push(mat)
      return mat
    })(),
    stone: options.materials?.stone ?? (() => {
      const mat = new MeshStandardMaterial({
        name: 'f1-kit / gravel stone',
        color: shade(TOKEN.DUST_300, 0.04),
        roughness: 0.86,
        metalness: 0,
      })
      extras.push(mat)
      return mat
    })(),
  }
  const stoneDark = new MeshStandardMaterial({
    name: 'f1-kit / gravel stone dark',
    color: shade(TOKEN.DUST_300, -0.4),
    roughness: 0.9,
    metalness: 0,
  })
  extras.push(stoneDark)

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

  const emit = (slot: Slot, geometry: BufferGeometry, material: Material, group: Group, name: string): void => {
    generated.push(geometry)
    const mesh = new Mesh(geometry, material)
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
    emit('bed', slab, materialSlots.bed, bed, 'bed')

    const light: BufferGeometry[] = []
    const dark: BufferGeometry[] = []
    const count = config.modules * 140
    for (let i = 0; i < count; i++) {
      const u = (i * GOLDEN) % 1
      const v = (i * 0.41421356237) % 1
      const x = (u - 0.5) * (length - 0.2)
      const z = (v - 0.5) * (TILE - 0.2)
      const cls = i % 11
      const sx = 0.16 + (cls % 4) * 0.05
      const sy = sx * (0.45 + (cls % 3) * 0.14)
      const sz = sx * (0.7 + (cls % 5) * 0.1)
      const pebble = bevelBox(sx, sy, sz, Math.min(0.018, sx * 0.14))
      pebble.rotateY(((i * 13) % 20) * 0.31)
      pebble.translate(x, THICK + sy * 0.4, z)
      ;(cls % 2 === 0 ? light : dark).push(pebble)
    }
    emit('stone', mergeParts(light, 'stones'), materialSlots.stone, stone, 'stones')
    emit('stone', mergeParts(dark, 'stones-dark'), stoneDark, stone, 'stones-dark')
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
      for (const mesh of meshesBySlot[slot]) {
        if (slot === 'stone' && mesh.name === 'stones-dark') continue
        mesh.material = material
      }
    },
    update: () => {},
    dispose() {
      releaseGenerated()
      for (const material of extras) material.dispose()
      disposeF1Materials(bundle)
      root.removeFromParent()
    },
  }
}

export function createPreview({ aspect }: { aspect: number; time?: number }) {
  return createF1Preview(createModel({ modules: 2 }), {
    aspect,
    target: [0, 0.1, 0],
    distance: 4.4,
    fov: 28,
    yaw: -0.65,
    pitch: 0.64,
  })
}
