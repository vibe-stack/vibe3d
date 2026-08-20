// f1-access-gate — a marshal gap that mates armco / concrete / jersey via `fits`.
// Frame + mesh infill; height and thickness come from WALL_END so joints agree.

import {
  BufferGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  type Material,
} from 'three/webgpu'

import {
  WALL_END,
  acquireF1Materials,
  bevelBox,
  createF1Preview,
  disposeF1Materials,
  isWallFit,
  mergeParts,
  type WallFit,
} from '../f1-kit-core/index.ts'

type Slot = 'frame' | 'mesh'

export interface F1AccessGateConfig {
  fits: WallFit
  width: number
}

export interface F1AccessGateOptions extends Partial<F1AccessGateConfig> {
  materials?: Partial<Record<Slot, Material>>
}

export interface F1AccessGateInstance {
  readonly root: Group
  readonly parts: { frame: Group; mesh: Group }
  readonly materials: Readonly<Record<Slot, Material>>
  getConfig(): Readonly<F1AccessGateConfig>
  configure(patch: Partial<F1AccessGateConfig>): void
  setMaterial(slot: Slot, material: Material): void
  update(deltaSeconds: number): void
  dispose(): void
}

const defaults: F1AccessGateConfig = { fits: 'armco', width: 1.8 }

export function createModel(options: F1AccessGateOptions = {}): F1AccessGateInstance {
  const config: F1AccessGateConfig = {
    fits: isWallFit(options.fits ?? '') ? options.fits! : defaults.fits,
    width: Math.max(1.2, options.width ?? defaults.width),
  }

  const bundle = acquireF1Materials()
  const kit = bundle.materials
  const extras: Material[] = []
  const materialSlots: Record<Slot, Material> = {
    frame: options.materials?.frame ?? kit.graphite,
    mesh: options.materials?.mesh ?? (() => {
      const mat = new MeshStandardMaterial({
        name: 'f1-kit / gate mesh',
        color: kit.slate.color,
        roughness: 0.55,
        metalness: 0.45,
        side: DoubleSide,
      })
      extras.push(mat)
      return mat
    })(),
  }

  const root = new Group()
  root.name = 'f1-access-gate'
  const frame = new Group(); frame.name = 'frame'
  const meshGroup = new Group(); meshGroup.name = 'mesh'
  root.add(frame, meshGroup)

  const generated: BufferGeometry[] = []
  const meshesBySlot: Record<Slot, Mesh[]> = { frame: [], mesh: [] }

  const releaseGenerated = (): void => {
    frame.clear(); meshGroup.clear()
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
    const end = WALL_END[config.fits]
    const w = config.width
    const h = end.height
    const t = 0.08
    const posts: BufferGeometry[] = [
      (() => { const g = bevelBox(t, h, t, 0.006); g.translate(-w / 2, h / 2, 0); return g })(),
      (() => { const g = bevelBox(t, h, t, 0.006); g.translate(w / 2, h / 2, 0); return g })(),
      (() => { const g = bevelBox(w + t, t, t, 0.006); g.translate(0, h - t / 2, 0); return g })(),
      (() => { const g = bevelBox(w + t, t, t, 0.006); g.translate(0, t / 2, 0); return g })(),
    ]
    emit('frame', mergeParts(posts, 'frame'), frame, 'frame')
    const infill = new PlaneGeometry(w - t * 1.4, h - t * 2.2)
    infill.translate(0, h / 2, 0)
    emit('mesh', infill, meshGroup, 'infill')
  }
  rebuild()

  return {
    root,
    parts: { frame, mesh: meshGroup },
    materials: materialSlots,
    getConfig: () => ({ ...config }),
    configure(patch) {
      if (patch.fits !== undefined && isWallFit(patch.fits)) config.fits = patch.fits
      if (patch.width !== undefined) config.width = Math.max(1.2, patch.width)
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
    target: [0, 0.62, 0],
    distance: 4.6,
    fov: 28,
    yaw: -0.55,
    pitch: 0.12,
  })
}
