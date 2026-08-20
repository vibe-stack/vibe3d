// f1-drink-wall — cooler-bank modules (1.3 × 2.0 m). Unbranded fascia strip.

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
  DRINK_WALL,
  LAYER_CLEARANCE,
  acquireF1Materials,
  bevelBox,
  createF1Preview,
  disposeF1Materials,
  fasciaTexture,
  loftRoundedBox,
} from '../f1-kit-core/index.ts'

type Slot = 'cabinet' | 'fascia'

export interface F1DrinkWallConfig {
  modules: number
}

export interface F1DrinkWallOptions extends Partial<F1DrinkWallConfig> {
  materials?: Partial<Record<Slot, Material>>
}

export interface F1DrinkWallInstance {
  readonly root: Group
  readonly parts: { cabinet: Group; fascia: Group }
  readonly materials: Readonly<Record<Slot, Material>>
  getConfig(): Readonly<F1DrinkWallConfig>
  configure(patch: Partial<F1DrinkWallConfig>): void
  setMaterial(slot: Slot, material: Material): void
  update(deltaSeconds: number): void
  dispose(): void
}

const defaults: F1DrinkWallConfig = { modules: 2 }

export function createModel(options: F1DrinkWallOptions = {}): F1DrinkWallInstance {
  const config: F1DrinkWallConfig = {
    modules: Math.max(1, Math.round(options.modules ?? defaults.modules)),
  }
  const bundle = acquireF1Materials()
  const kit = bundle.materials
  const extras: Material[] = []
  const textures: DataTexture[] = []
  let ownsFascia = options.materials?.fascia === undefined
  const materialSlots: Record<Slot, Material> = {
    cabinet: options.materials?.cabinet ?? kit.graphite,
    fascia: options.materials?.fascia ?? kit.shell,
  }
  const root = new Group(); root.name = 'f1-drink-wall'
  const cabinet = new Group(); cabinet.name = 'cabinet'
  const fascia = new Group(); fascia.name = 'fascia'
  root.add(cabinet, fascia)
  const generated: BufferGeometry[] = []
  const meshesBySlot: Record<Slot, Mesh[]> = { cabinet: [], fascia: [] }
  const releaseOwned = (): void => {
    for (const texture of textures) texture.dispose()
    textures.length = 0
    for (const material of extras) material.dispose()
    extras.length = 0
  }
  const releaseGenerated = (): void => {
    cabinet.clear(); fascia.clear()
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
    const n = config.modules
    const w = DRINK_WALL.width
    const h = DRINK_WALL.height
    const d = DRINK_WALL.depth
    const total = n * w
    const body = loftRoundedBox(total, h, d, 0.04)
    body.translate(0, h / 2, 0)
    emit('cabinet', body, cabinet, 'body')
    for (let i = 0; i < n; i++) {
      const x = -total / 2 + (i + 0.5) * w
      const door = bevelBox(w - 0.12, h - 0.38, 0.02, 0.006)
      door.translate(x, (h - 0.38) / 2 + 0.08, d / 2 + LAYER_CLEARANCE * 3)
      emit('cabinet', door, cabinet, `door-${i}`)
    }
    const stripH = 0.22
    const face = new PlaneGeometry(total - 0.1, stripH)
    face.translate(0, h - stripH / 2 - 0.04, d / 2 + LAYER_CLEARANCE * 3)
    if (ownsFascia) {
      const tex = fasciaTexture({ number: String(n), legend: 'COOL', style: 'stamp' })
      textures.push(tex)
      const mat = new MeshStandardMaterial({
        name: 'f1-kit / drink-wall fascia',
        map: tex,
        roughness: 0.55,
        metalness: 0.04,
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
    parts: { cabinet, fascia },
    materials: materialSlots,
    getConfig: () => ({ ...config }),
    configure(patch) {
      if (patch.modules !== undefined) config.modules = Math.max(1, Math.round(patch.modules))
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
  return createF1Preview(createModel({ modules: 2 }), {
    aspect, target: [0, 1.0, 0], distance: 6.5, fov: 28, yaw: -0.35, pitch: 0.08,
  })
}
