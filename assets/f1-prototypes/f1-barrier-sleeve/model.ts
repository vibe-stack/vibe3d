// f1-barrier-sleeve — printed cover over a wall run. Pitch follows WALL_END[fits].

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
  WALL_END,
  acquireF1Materials,
  createF1Preview,
  disposeF1Materials,
  fasciaTexture,
  isWallFit,
  loftAlongX,
  type WallFit,
} from '../f1-kit-core/index.ts'

type Slot = 'sleeve' | 'fascia'

export interface F1BarrierSleeveConfig {
  bays: number
  fits: WallFit
}

export interface F1BarrierSleeveOptions extends Partial<F1BarrierSleeveConfig> {
  materials?: Partial<Record<Slot, Material>>
}

export interface F1BarrierSleeveInstance {
  readonly root: Group
  readonly parts: { sleeve: Group; fascia: Group }
  readonly materials: Readonly<Record<Slot, Material>>
  getConfig(): Readonly<F1BarrierSleeveConfig>
  configure(patch: Partial<F1BarrierSleeveConfig>): void
  setMaterial(slot: Slot, material: Material): void
  update(deltaSeconds: number): void
  dispose(): void
}

const defaults: F1BarrierSleeveConfig = { bays: 2, fits: 'concrete' }
/** Vinyl bite into the host wall (rule 8). */
const BITE = 0.002
/** Cover thickness outside the bitten inner opening. */
const COVER = 0.018

export function createModel(options: F1BarrierSleeveOptions = {}): F1BarrierSleeveInstance {
  const config: F1BarrierSleeveConfig = {
    bays: Math.max(1, Math.round(options.bays ?? defaults.bays)),
    fits: options.fits && isWallFit(options.fits) ? options.fits : defaults.fits,
  }
  const bundle = acquireF1Materials()
  const kit = bundle.materials
  const extras: Material[] = []
  const textures: DataTexture[] = []
  let ownsFascia = options.materials?.fascia === undefined
  const materialSlots: Record<Slot, Material> = {
    sleeve: options.materials?.sleeve ?? kit.fabric,
    fascia: options.materials?.fascia ?? kit.shell,
  }
  const root = new Group(); root.name = 'f1-barrier-sleeve'
  const sleeve = new Group(); sleeve.name = 'sleeve'
  const fascia = new Group(); fascia.name = 'fascia'
  root.add(sleeve, fascia)
  const generated: BufferGeometry[] = []
  const meshesBySlot: Record<Slot, Mesh[]> = { sleeve: [], fascia: [] }
  const releaseOwned = (): void => {
    for (const texture of textures) texture.dispose()
    textures.length = 0
    for (const material of extras) material.dispose()
    extras.length = 0
  }
  const releaseGenerated = (): void => {
    sleeve.clear(); fascia.clear()
    for (const geometry of generated) geometry.dispose()
    generated.length = 0
    for (const slot of Object.keys(meshesBySlot) as Slot[]) meshesBySlot[slot].length = 0
    if (ownsFascia) releaseOwned()
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
    const end = WALL_END[config.fits]
    const h = end.height
    const d = end.depth
    const length = config.bays * end.pitch
    const innerZ = d / 2 - BITE
    const innerY = h - BITE
    const outerZ = d / 2 + COVER
    const outerY = h + COVER
    const geo = loftAlongX(
      [
        [-outerZ, 0],
        [-outerZ, outerY],
        [outerZ, outerY],
        [outerZ, 0],
        [innerZ, 0],
        [innerZ, innerY],
        [-innerZ, innerY],
        [-innerZ, 0],
      ],
      length,
      { closed: true, stations: 3 },
    )
    emit('sleeve', geo, sleeve, 'cover')

    const face = new PlaneGeometry(length - 0.08, h - 0.06)
    face.translate(0, h / 2, outerZ + LAYER_CLEARANCE * 3)
    if (ownsFascia) {
      const tex = fasciaTexture({ number: String(config.bays), legend: 'WALL', style: 'stamp' })
      textures.push(tex)
      const mat = new MeshStandardMaterial({
        name: 'f1-kit / barrier-sleeve fascia',
        map: tex,
        roughness: 0.6,
        metalness: 0.03,
      })
      extras.push(mat)
      emit('fascia', face, fascia, 'face', mat)
    } else {
      emit('fascia', face, fascia, 'face')
    }
  }
  rebuild()
  return {
    root,
    parts: { sleeve, fascia },
    materials: materialSlots,
    getConfig: () => ({ ...config }),
    configure(patch) {
      if (patch.bays !== undefined) config.bays = Math.max(1, Math.round(patch.bays))
      if (patch.fits !== undefined && isWallFit(patch.fits)) config.fits = patch.fits
      rebuild()
    },
    setMaterial(slot, material) {
      if (slot === 'fascia' && ownsFascia) {
        releaseOwned()
        ownsFascia = false
      }
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
  return createF1Preview(createModel({ bays: 2, fits: 'concrete' }), {
    aspect, target: [0, 0.5, 0], distance: 7.5, fov: 28, yaw: -1.05, pitch: 0.14,
  })
}
