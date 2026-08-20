// f1-sector-board — trackside sector-time cabinet.

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
  SECTOR_BOARD,
  acquireF1Materials,
  bevelBox,
  createF1Preview,
  disposeF1Materials,
  fasciaTexture,
} from '../f1-kit-core/index.ts'

type Slot = 'cabinet' | 'face'

export interface F1SectorBoardConfig {
  sector: number
}

export interface F1SectorBoardOptions extends Partial<F1SectorBoardConfig> {
  materials?: Partial<Record<Slot, Material>>
}

export interface F1SectorBoardInstance {
  readonly root: Group
  readonly parts: { cabinet: Group; face: Group }
  readonly materials: Readonly<Record<Slot, Material>>
  getConfig(): Readonly<F1SectorBoardConfig>
  configure(patch: Partial<F1SectorBoardConfig>): void
  setMaterial(slot: Slot, material: Material): void
  update(deltaSeconds: number): void
  dispose(): void
}

const defaults: F1SectorBoardConfig = { sector: 1 }

export function createModel(options: F1SectorBoardOptions = {}): F1SectorBoardInstance {
  const config: F1SectorBoardConfig = {
    sector: Math.max(1, Math.min(3, Math.round(options.sector ?? defaults.sector))),
  }
  const bundle = acquireF1Materials()
  const kit = bundle.materials
  const extras: Material[] = []
  const textures: DataTexture[] = []
  let ownsFace = options.materials?.face === undefined
  const materialSlots: Record<Slot, Material> = {
    cabinet: options.materials?.cabinet ?? kit.graphite,
    face: options.materials?.face ?? kit.shell,
  }
  const root = new Group(); root.name = 'f1-sector-board'
  const cabinet = new Group(); cabinet.name = 'cabinet'
  const face = new Group(); face.name = 'face'
  root.add(cabinet, face)
  const generated: BufferGeometry[] = []
  const meshesBySlot: Record<Slot, Mesh[]> = { cabinet: [], face: [] }
  const releaseOwned = (): void => {
    for (const texture of textures) texture.dispose()
    textures.length = 0
    for (const material of extras) material.dispose()
    extras.length = 0
  }
  const releaseGenerated = (): void => {
    cabinet.clear(); face.clear()
    for (const geometry of generated) geometry.dispose()
    generated.length = 0
    for (const slot of Object.keys(meshesBySlot) as Slot[]) meshesBySlot[slot].length = 0
    if (ownsFace) releaseOwned()
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
    const w = SECTOR_BOARD.width
    const h = SECTOR_BOARD.height
    const d = SECTOR_BOARD.depth
    const box = bevelBox(w, h, d, 0.01)
    box.translate(0, 1.1, 0)
    emit('cabinet', box, cabinet, 'box')
    const post = bevelBox(0.08, 0.7, 0.08, 0.006)
    post.translate(0, 0.35, 0)
    emit('cabinet', post, cabinet, 'post')
    const screen = new PlaneGeometry(w - 0.12, h - 0.12)
    screen.translate(0, 1.1, d / 2 + LAYER_CLEARANCE * 3)
    if (ownsFace) {
      const tex = fasciaTexture({ number: `S${config.sector}`, legend: 'SECTOR', style: 'stamp' })
      textures.push(tex)
      const mat = new MeshStandardMaterial({
        name: 'f1-kit / sector board',
        map: tex,
        roughness: 0.5,
        metalness: 0.05,
      })
      extras.push(mat)
      emit('face', screen, face, 'face', mat)
    } else {
      emit('face', screen, face, 'face')
    }
  }
  rebuild()
  return {
    root,
    parts: { cabinet, face },
    materials: materialSlots,
    getConfig: () => ({ ...config }),
    configure(patch) {
      if (patch.sector !== undefined) config.sector = Math.max(1, Math.min(3, Math.round(patch.sector)))
      rebuild()
    },
    setMaterial(slot, material) {
      if (slot === 'face' && ownsFace) {
        releaseOwned()
        ownsFace = false
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
  return createF1Preview(createModel({ sector: 2 }), {
    aspect, target: [0, 1.0, 0], distance: 3.4, fov: 28, yaw: -0.4, pitch: 0.08,
  })
}
