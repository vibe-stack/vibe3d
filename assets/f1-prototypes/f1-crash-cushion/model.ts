// f1-crash-cushion — yellow QuadGuard-style stepped end-terminal. `fits` picks the host wall height.
// Identity is the tapering yellow cells, black chevrons, and steel diaphragms — not four yellow boxes.

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
  shade,
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
const STEPS = 5

export function createModel(options: F1CrashCushionOptions = {}): F1CrashCushionInstance {
  const config: F1CrashCushionConfig = {
    fits: isWallFit(options.fits ?? '') ? options.fits! : defaults.fits,
  }

  const bundle = acquireF1Materials()
  const kit = bundle.materials
  const extras: Material[] = []
  const materialSlots: Record<Slot, Material> = {
    cushion: options.materials?.cushion ?? (() => {
      const mat = new MeshStandardMaterial({
        name: 'f1-kit / crash cushion',
        color: TOKEN.AMBER_400,
        roughness: 0.52,
        metalness: 0.08,
      })
      extras.push(mat)
      return mat
    })(),
  }
  const bandMat = new MeshStandardMaterial({
    name: 'f1-kit / crash cushion band',
    color: shade(TOKEN.INK_950, 0.04),
    roughness: 0.7,
    metalness: 0.05,
  })
  extras.push(bandMat)

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

  const emit = (geometry: BufferGeometry, material: Material, name: string): void => {
    generated.push(geometry)
    const mesh = new Mesh(geometry, material)
    mesh.name = name
    mesh.castShadow = true
    mesh.receiveShadow = true
    meshesBySlot.cushion.push(mesh)
    cushion.add(mesh)
  }

  const rebuild = (): void => {
    releaseGenerated()
    const end = WALL_END[config.fits]
    const yellow: BufferGeometry[] = []
    const black: BufferGeometry[] = []
    const steel: BufferGeometry[] = []
    const pitch = 0.42
    const origin = -((STEPS - 1) * pitch) / 2

    for (let i = 0; i < STEPS; i++) {
      const t = i / (STEPS - 1)
      const h = end.height * (0.38 + 0.62 * t)
      const d = end.depth * (0.95 + 0.85 * (1 - t))
      const w = 0.38 + i * 0.16
      const x = origin + i * pitch
      const cell = bevelBox(w, h, d, 0.018)
      cell.translate(x, h / 2, 0)
      yellow.push(cell)

      const stripeH = 0.07
      for (let s = 0; s < 3; s++) {
        const y = 0.12 + s * stripeH * 2.1
        if (y + stripeH > h - 0.04) break
        const band = bevelBox(w + 0.004, stripeH, 0.018, 0.003)
        band.translate(x, y, d / 2 + 0.002)
        black.push(band)
      }

      if (i > 0) {
        const prevH = end.height * (0.38 + 0.62 * ((i - 1) / (STEPS - 1)))
        const plate = bevelBox(0.04, Math.max(prevH, h) + 0.04, d + 0.08, 0.006)
        plate.translate(x - pitch / 2, Math.max(prevH, h) / 2, 0)
        steel.push(plate)
      }
    }

    const noseH = end.height * 0.38
    const noseX = origin - 0.28
    const nose = bevelBox(0.22, noseH * 0.85, end.depth * 1.55, 0.016)
    nose.translate(noseX, noseH * 0.42, 0)
    yellow.push(nose)
    const chevL = bevelBox(0.16, 0.05, 0.016, 0.003)
    chevL.rotateZ(0.55)
    chevL.translate(noseX - 0.02, noseH * 0.42 + 0.04, end.depth * 0.8)
    const chevR = bevelBox(0.16, 0.05, 0.016, 0.003)
    chevR.rotateZ(-0.55)
    chevR.translate(noseX - 0.02, noseH * 0.42 - 0.04, end.depth * 0.8)
    black.push(chevL, chevR)

    const backH = end.height
    const backX = origin + (STEPS - 1) * pitch + 0.28
    const trans = bevelBox(0.18, backH, end.depth + 0.06, 0.01)
    trans.translate(backX, backH / 2, 0)
    steel.push(trans)
    for (const z of [-1, 1] as const) {
      const rail = bevelBox((STEPS - 1) * pitch + 0.5, 0.05, 0.04, 0.006)
      rail.translate(0, backH * 0.72, z * (end.depth * 0.55))
      steel.push(rail)
    }

    emit(mergeParts(yellow, 'cushion'), materialSlots.cushion, 'cushion')
    emit(mergeParts(black, 'bands'), bandMat, 'bands')
    emit(mergeParts(steel, 'frame'), kit.graphite, 'frame')
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
      for (const mesh of meshesBySlot[slot]) {
        if (mesh.name === 'cushion') mesh.material = material
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
  return createF1Preview(createModel({ fits: 'armco' }), {
    aspect,
    target: [0, 0.48, 0],
    distance: 5.2,
    fov: 28,
    yaw: -0.9,
    pitch: 0.22,
  })
}
