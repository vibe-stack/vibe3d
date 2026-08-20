// f1-chevron-board — large red/yellow direction chevrons on a backboard.

import { BufferGeometry, Group, Mesh, type Material } from 'three/webgpu'

import {
  acquireF1Materials,
  bevelBox,
  bevelPrism,
  createF1Preview,
  disposeF1Materials,
  mergeParts,
} from '../f1-kit-core/index.ts'

type Slot = 'board' | 'chevron'

export interface F1ChevronBoardConfig {
  count: number
}

export interface F1ChevronBoardOptions extends Partial<F1ChevronBoardConfig> {
  materials?: Partial<Record<Slot, Material>>
}

export interface F1ChevronBoardInstance {
  readonly root: Group
  readonly parts: { board: Group; chevrons: Group }
  readonly materials: Readonly<Record<Slot, Material>>
  getConfig(): Readonly<F1ChevronBoardConfig>
  configure(patch: Partial<F1ChevronBoardConfig>): void
  setMaterial(slot: Slot, material: Material): void
  update(deltaSeconds: number): void
  dispose(): void
}

const defaults: F1ChevronBoardConfig = { count: 4 }
const CHEVRON: Array<readonly [number, number]> = [
  [-0.29, -0.21], [0.12, -0.21], [0.29, 0], [0.12, 0.21], [-0.29, 0.21],
]

export function createModel(options: F1ChevronBoardOptions = {}): F1ChevronBoardInstance {
  const config: F1ChevronBoardConfig = {
    count: Math.max(1, Math.round(options.count ?? defaults.count)),
  }

  const bundle = acquireF1Materials()
  const kit = bundle.materials
  const materialSlots: Record<Slot, Material> = {
    board: options.materials?.board ?? kit.graphite,
    chevron: options.materials?.chevron ?? kit.red,
  }

  const root = new Group(); root.name = 'f1-chevron-board'
  const board = new Group(); board.name = 'board'
  const chevrons = new Group(); chevrons.name = 'chevrons'
  root.add(board, chevrons)

  const generated: BufferGeometry[] = []
  const meshesBySlot: Record<Slot, Mesh[]> = { board: [], chevron: [] }

  const releaseGenerated = (): void => {
    board.clear(); chevrons.clear()
    for (const geometry of generated) geometry.dispose()
    generated.length = 0
    for (const slot of Object.keys(meshesBySlot) as Slot[]) meshesBySlot[slot].length = 0
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
    const count = config.count
    const span = count * 0.72 + 0.4
    const back = bevelBox(span, 1.05, 0.06, 0.012)
    back.translate(0, 0.62, 0)
    emit('board', back, board, 'back')
    const redParts: BufferGeometry[] = []
    const yellowParts: BufferGeometry[] = []
    for (let i = 0; i < count; i++) {
      const x = -span / 2 + 0.36 + i * 0.72
      const blade = bevelPrism(CHEVRON, 0.04, 0.008)
      blade.translate(x, 0.62, 0.04)
      if (i % 2 === 0) redParts.push(blade)
      else yellowParts.push(blade)
    }
    emit('chevron', mergeParts(redParts, 'red'), chevrons, 'red', kit.red)
    emit('chevron', mergeParts(yellowParts, 'yellow'), chevrons, 'yellow', kit.amber)
  }
  rebuild()

  return {
    root,
    parts: { board, chevrons },
    materials: materialSlots,
    getConfig: () => ({ ...config }),
    configure(patch) {
      if (patch.count !== undefined) config.count = Math.max(1, Math.round(patch.count))
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
  return createF1Preview(createModel({ count: 5 }), {
    aspect,
    target: [0, 0.65, 0],
    distance: 4.8,
    fov: 28,
    yaw: -0.35,
    pitch: 0.06,
  })
}
