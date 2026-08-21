// f1-astroturf-strip — 2.0 m Grade 1 artificial-grass verge. Green pile, not a flat green card.

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
const PILE = 0.055
const STEP = 0.08

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
        color: TOKEN.FIELD_500,
        roughness: 0.94,
        metalness: 0,
      })
      extras.push(mat)
      return mat
    })(),
  }
  const pileDark = new MeshStandardMaterial({
    name: 'f1-kit / astroturf pile',
    color: shade(TOKEN.FIELD_500, -0.32),
    roughness: 0.96,
    metalness: 0,
  })
  extras.push(pileDark)

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
    const light: BufferGeometry[] = [bed]
    const dark: BufferGeometry[] = []
    const nx = Math.max(6, Math.round(length / STEP))
    const nz = Math.max(5, Math.round(WIDTH / STEP))
    for (let i = 0; i < nx; i++) {
      for (let j = 0; j < nz; j++) {
        const x = -length / 2 + (i + 0.5) * (length / nx)
        const z = -WIDTH / 2 + (j + 0.5) * (WIDTH / nz)
        const h = PILE + ((i * 3 + j * 5) % 5) * 0.006
        const alongX = ((i + j) % 2) === 0
        const blade = alongX
          ? bevelBox(0.042, h, 0.008, 0.0015)
          : bevelBox(0.008, h, 0.042, 0.0015)
        blade.rotateY(((i * 7 + j * 3) % 9) * 0.14)
        blade.translate(x, THICK + h / 2, z)
        ;((i + j) % 3 === 0 ? dark : light).push(blade)
      }
    }
    emit(mergeParts(light, 'mat'), materialSlots.mat, 'mat')
    emit(mergeParts(dark, 'pile'), pileDark, 'pile')
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
        if (mesh.name === 'mat') mesh.material = material
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
    target: [0, 0.05, 0],
    distance: 4.2,
    fov: 28,
    yaw: -0.8,
    pitch: 0.55,
  })
}
