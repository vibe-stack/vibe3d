// f1-sector-board — Grade 1 sector-time cabinet on a short post.
// Same language as the MYLAPS panel. Face is a dark module; host hangs an image.

import {
  BufferGeometry,
  Group,
  Mesh,
  PlaneGeometry,
  type Material,
} from 'three/webgpu'

import {
  AXIS_Y,
  LAYER_CLEARANCE,
  SECTOR_BOARD,
  acquireF1Materials,
  bevelBox,
  createF1Preview,
  disposeF1Materials,
  loftRoundedBox,
  tubeSection,
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
  const materialSlots: Record<Slot, Material> = {
    cabinet: options.materials?.cabinet ?? kit.graphite,
    face: options.materials?.face ?? kit.ink,
  }
  const root = new Group(); root.name = 'f1-sector-board'
  const cabinet = new Group(); cabinet.name = 'cabinet'
  const face = new Group(); face.name = 'face'
  root.add(cabinet, face)
  const generated: BufferGeometry[] = []
  const meshesBySlot: Record<Slot, Mesh[]> = { cabinet: [], face: [] }
  const releaseGenerated = (): void => {
    cabinet.clear(); face.clear()
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
    const w = SECTOR_BOARD.width
    const h = SECTOR_BOARD.height
    const d = SECTOR_BOARD.depth
    const postH = 0.85
    emit('cabinet', tubeSection(0.04, postH, [0, postH / 2, 0], AXIS_Y, 10), cabinet, 'post')
    const box = loftRoundedBox(w, h, d, 0.04)
    box.translate(0, postH + h / 2, 0)
    emit('cabinet', box, cabinet, 'box')
    const screen = new PlaneGeometry(w - 0.1, h - 0.1)
    screen.translate(0, postH + h / 2, d / 2 + LAYER_CLEARANCE * 3)
    emit('face', screen, face, 'face')
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
    aspect, target: [0, 1.15, 0], distance: 3.6, fov: 28, yaw: -0.4, pitch: 0.08,
  })
}
