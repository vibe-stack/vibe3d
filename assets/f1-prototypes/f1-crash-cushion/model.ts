// f1-crash-cushion — yellow stepped end-terminal. `fits` picks the host wall height.

import { BufferGeometry, Group, Mesh, MeshStandardMaterial, type Material } from 'three/webgpu'

import {
  TOKEN,
  WALL_END,
  acquireF1Materials,
  bevelBox,
  createF1Preview,
  disposeF1Materials,
  isWallFit,
  mergeParts,
  type WallFit,
} from '../f1-kit-core/index.ts'

type Slot = 'cushion'

export interface F1CrashCushionConfig {
  fits: WallFit
}

export interface F1CrashCushionOptions extends Partial<F1CrashCushionConfig> {
  materials?: Partial<Record<Slot, Material>>
}

export interface F1CrashCushionInstance {
  readonly root: Group
  readonly parts: { cushion: Group }
  readonly materials: Readonly<Record<Slot, Material>>
  getConfig(): Readonly<F1CrashCushionConfig>
  configure(patch: Partial<F1CrashCushionConfig>): void
  setMaterial(slot: Slot, material: Material): void
  update(deltaSeconds: number): void
  dispose(): void
}

const defaults: F1CrashCushionConfig = { fits: 'armco' }

export function createModel(options: F1CrashCushionOptions = {}): F1CrashCushionInstance {
  const config: F1CrashCushionConfig = {
    fits: isWallFit(options.fits ?? '') ? options.fits! : defaults.fits,
  }

  const bundle = acquireF1Materials()
  const extras: Material[] = []
  const materialSlots: Record<Slot, Material> = {
    cushion: options.materials?.cushion ?? (() => {
      const mat = new MeshStandardMaterial({
        name: 'f1-kit / crash cushion',
        color: TOKEN.AMBER_400,
        roughness: 0.55,
        metalness: 0.08,
      })
      extras.push(mat)
      return mat
    })(),
  }

  const root = new Group()
  root.name = 'f1-crash-cushion'
  const cushion = new Group(); cushion.name = 'cushion'
  root.add(cushion)

  const generated: BufferGeometry[] = []
  const meshesBySlot: Record<Slot, Mesh[]> = { cushion: [] }

  const releaseGenerated = (): void => {
    cushion.clear()
    for (const geometry of generated) geometry.dispose()
    generated.length = 0
    meshesBySlot.cushion.length = 0
  }

  const rebuild = (): void => {
    releaseGenerated()
    const end = WALL_END[config.fits]
    const parts: BufferGeometry[] = []
    const steps = 4
    for (let i = 0; i < steps; i++) {
      const t = i / (steps - 1)
      const h = end.height * (0.45 + 0.55 * t)
      const d = end.depth * (1.8 - 0.6 * t)
      const w = 0.55 + i * 0.22
      const box = bevelBox(w, h, d, 0.02)
      box.translate(i * 0.48 - 0.72, h / 2, 0)
      parts.push(box)
    }
    const geo = mergeParts(parts, 'cushion')
    generated.push(geo)
    const mesh = new Mesh(geo, materialSlots.cushion)
    mesh.name = 'cushion'
    mesh.castShadow = true
    mesh.receiveShadow = true
    meshesBySlot.cushion.push(mesh)
    cushion.add(mesh)
  }
  rebuild()

  return {
    root,
    parts: { cushion },
    materials: materialSlots,
    getConfig: () => ({ ...config }),
    configure(patch) {
      if (patch.fits !== undefined && isWallFit(patch.fits)) config.fits = patch.fits
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
  return createF1Preview(createModel({ fits: 'armco' }), {
    aspect,
    target: [0, 0.45, 0],
    distance: 4.8,
    fov: 28,
    yaw: -0.85,
    pitch: 0.22,
  })
}
