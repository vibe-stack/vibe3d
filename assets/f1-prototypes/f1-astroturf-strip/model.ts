// f1-astroturf-strip — 2.0 m Grade 1 artificial-grass verge. Dark soil bed,
// dense two-tone pile with a mown nap. Not a mint slab of card blades.

import { BufferGeometry, Group, Mesh, MeshStandardMaterial, type Material } from 'three/webgpu'

import {
  ASTROTURF,
  TOKEN,
  acquireF1Materials,
  bevelBox,
  createF1Preview,
  disposeF1Materials,
  mergeParts,
  shade,
} from '../f1-kit-core/index.ts'

type Slot = 'mat'

export interface F1AstroturfStripConfig {
  modules: number
}

export interface F1AstroturfStripOptions extends Partial<F1AstroturfStripConfig> {
  materials?: Partial<Record<Slot, Material>>
}

export interface F1AstroturfStripInstance {
  readonly root: Group
  readonly parts: { mat: Group }
  readonly materials: Readonly<Record<Slot, Material>>
  getConfig(): Readonly<F1AstroturfStripConfig>
  configure(patch: Partial<F1AstroturfStripConfig>): void
  setMaterial(slot: Slot, material: Material): void
  update(deltaSeconds: number): void
  dispose(): void
}

const defaults: F1AstroturfStripConfig = { modules: 6 }
const BAND = ASTROTURF.pitch
const WIDTH = ASTROTURF.width
const THICK = ASTROTURF.thick
const PILE = 0.046
const STEP = 0.05
const STRIPE = 0.25
const NAP = -0.28
const RIM = 0.04

export function createModel(options: F1AstroturfStripOptions = {}): F1AstroturfStripInstance {
  const config: F1AstroturfStripConfig = {
    modules: Math.max(1, Math.round(options.modules ?? defaults.modules)),
  }

  const bundle = acquireF1Materials()
  const extras: Material[] = []
  const materialSlots: Record<Slot, Material> = {
    mat: options.materials?.mat ?? (() => {
      const mat = new MeshStandardMaterial({
        name: 'f1-kit / astroturf',
        color: shade(TOKEN.FIELD_500, 0.16),
        roughness: 0.9,
        metalness: 0,
      })
      extras.push(mat)
      return mat
    })(),
  }
  const bedMat = new MeshStandardMaterial({
    name: 'f1-kit / astroturf bed',
    color: shade(TOKEN.FIELD_500, -0.72),
    roughness: 1,
    metalness: 0,
  })
  const pileDark = new MeshStandardMaterial({
    name: 'f1-kit / astroturf pile',
    color: shade(TOKEN.FIELD_500, -0.55),
    roughness: 0.96,
    metalness: 0,
  })
  extras.push(bedMat, pileDark)

  const root = new Group()
  root.name = 'f1-astroturf-strip'
  const mat = new Group(); mat.name = 'mat'
  root.add(mat)

  const generated: BufferGeometry[] = []
  const meshesBySlot: Record<Slot, Mesh[]> = { mat: [] }

  const releaseGenerated = (): void => {
    mat.clear()
    for (const geometry of generated) geometry.dispose()
    generated.length = 0
    meshesBySlot.mat.length = 0
  }

  const emit = (geometry: BufferGeometry, material: Material, name: string): void => {
    generated.push(geometry)
    const mesh = new Mesh(geometry, material)
    mesh.name = name
    mesh.castShadow = true
    mesh.receiveShadow = true
    meshesBySlot.mat.push(mesh)
    mat.add(mesh)
  }

  const rebuild = (): void => {
    releaseGenerated()
    const length = config.modules * BAND
    const bed = bevelBox(length, THICK, WIDTH, 0.004)
    bed.translate(0, THICK / 2, 0)
    emit(bed, bedMat, 'bed')

    const light: BufferGeometry[] = []
    const dark: BufferGeometry[] = []
    const innerL = length - RIM * 2
    const innerW = WIDTH - RIM * 2
    const nx = Math.max(8, Math.round(innerL / STEP))
    const nz = Math.max(8, Math.round(innerW / STEP))
    for (let i = 0; i < nx; i++) {
      for (let j = 0; j < nz; j++) {
        const x = -innerL / 2 + (i + 0.5) * (innerL / nx)
        const z = -innerW / 2 + (j + 0.5) * (innerW / nz)
        const h = PILE + ((i * 3 + j * 5) % 5) * 0.005
        const blade = bevelBox(0.026, h, 0.0042, 0.0008)
        blade.rotateX(NAP)
        blade.rotateY(((i * 7 + j * 3) % 9) * 0.1)
        blade.translate(x, THICK + h / 2, z)
        const mown = Math.floor((z + innerW / 2) / STRIPE) % 2 === 0
        const swap = (i + j) % 9 === 0
        ;((mown !== swap) ? light : dark).push(blade)
      }
    }
    emit(mergeParts(light, 'pile'), materialSlots.mat, 'pile')
    emit(mergeParts(dark, 'pile-dark'), pileDark, 'pile-dark')
  }
  rebuild()

  return {
    root,
    parts: { mat },
    materials: materialSlots,
    getConfig: () => ({ ...config }),
    configure(patch) {
      if (patch.modules !== undefined) config.modules = Math.max(1, Math.round(patch.modules))
      rebuild()
    },
    setMaterial(slot, material) {
      materialSlots[slot] = material
      for (const mesh of meshesBySlot[slot]) {
        if (mesh.name === 'pile') mesh.material = material
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
  return createF1Preview(createModel({ modules: 3 }), {
    aspect,
    target: [0, 0.04, 0],
    distance: 2.85,
    fov: 28,
    yaw: -1.05,
    pitch: 0.3,
  })
}
