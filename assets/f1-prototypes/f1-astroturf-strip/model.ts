// f1-astroturf-strip — green deterrent matting past the rumble. Thin ribbed slab, tiled along X.
import { BufferGeometry, Group, Mesh, MeshStandardMaterial, type Material } from 'three/webgpu'
import {
  ASTROTURF,
  TOKEN,
  acquireF1Materials,
  bevelBox,
  createF1Preview,
  disposeF1Materials,
  mergeParts,
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
const RIB = 0.04

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
        roughness: 0.92,
        metalness: 0,
      })
      extras.push(mat)
      return mat
    })(),
  }
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
  const rebuild = (): void => {
    releaseGenerated()
    const length = config.modules * BAND
    const parts: BufferGeometry[] = []
    const bed = bevelBox(length, THICK, WIDTH, 0.004)
    bed.translate(0, THICK / 2, 0)
    parts.push(bed)
    const ribs = Math.max(4, Math.round(length / RIB))
    for (let i = 0; i < ribs; i++) {
      const x = -length / 2 + (i + 0.5) * (length / ribs)
      const rib = bevelBox(0.018, 0.01, WIDTH - 0.04, 0.002)
      rib.translate(x, THICK + 0.004, 0)
      parts.push(rib)
    }
    const geo = mergeParts(parts, 'mat')
    generated.push(geo)
    const mesh = new Mesh(geo, materialSlots.mat)
    mesh.name = 'mat'
    mesh.castShadow = true
    mesh.receiveShadow = true
    meshesBySlot.mat.push(mesh)
    mat.add(mesh)
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
      for (const mesh of meshesBySlot[slot]) mesh.material = material
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
  return createF1Preview(createModel({ modules: 4 }), {
    aspect,
    target: [0, 0.02, 0],
    distance: 6.8,
    fov: 28,
    yaw: -0.95,
    pitch: 0.42,
  })
}
