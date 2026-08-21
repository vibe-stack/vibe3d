// f1-nameboard — pit-wall driver plate. Width from NAMEBOARD (~1.8 m),
// not a full garage-bay billboard. setMaterial('face') for a host image.

import {
  BufferGeometry,
  Group,
  Mesh,
  PlaneGeometry,
  type Material,
} from 'three/webgpu'

import {
  LAYER_CLEARANCE,
  NAMEBOARD,
  acquireF1Materials,
  bevelBox,
  createF1Preview,
  disposeF1Materials,
} from '../f1-kit-core/index.ts'

type Slot = 'board' | 'face'

export interface F1NameboardConfig {
  label: string
}

export interface F1NameboardOptions extends Partial<F1NameboardConfig> {
  materials?: Partial<Record<Slot, Material>>
}

export interface F1NameboardInstance {
  readonly root: Group
  readonly parts: { board: Group; face: Group }
  readonly materials: Readonly<Record<Slot, Material>>
  getConfig(): Readonly<F1NameboardConfig>
  configure(patch: Partial<F1NameboardConfig>): void
  setMaterial(slot: Slot, material: Material): void
  update(deltaSeconds: number): void
  dispose(): void
}

const defaults: F1NameboardConfig = { label: '44' }

export function createModel(options: F1NameboardOptions = {}): F1NameboardInstance {
  const config: F1NameboardConfig = {
    label: String(options.label ?? defaults.label).slice(0, 4).toUpperCase() || '44',
  }
  const bundle = acquireF1Materials()
  const kit = bundle.materials
  const materialSlots: Record<Slot, Material> = {
    board: options.materials?.board ?? kit.graphite,
    face: options.materials?.face ?? kit.shell,
  }
  const root = new Group(); root.name = 'f1-nameboard'
  const board = new Group(); board.name = 'board'
  const face = new Group(); face.name = 'face'
  root.add(board, face)
  const generated: BufferGeometry[] = []
  const meshesBySlot: Record<Slot, Mesh[]> = { board: [], face: [] }
  const releaseGenerated = (): void => {
    board.clear(); face.clear()
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
    const w = NAMEBOARD.width
    const h = NAMEBOARD.height
    const d = NAMEBOARD.depth
    const body = bevelBox(w, h, d, 0.006)
    body.translate(0, 1.15, 0)
    emit('board', body, board, 'body')
    const bracket = bevelBox(0.08, 0.12, 0.04, 0.003)
    bracket.translate(0, 1.15 - h / 2 - 0.04, 0)
    emit('board', bracket, board, 'bracket')
    const screen = new PlaneGeometry(w - 0.06, h - 0.06)
    screen.translate(0, 1.15, d / 2 + LAYER_CLEARANCE * 3)
    emit('face', screen, face, 'face')
  }
  rebuild()
  return {
    root,
    parts: { board, face },
    materials: materialSlots,
    getConfig: () => ({ ...config }),
    configure(patch) {
      if (patch.label !== undefined) config.label = String(patch.label).slice(0, 4).toUpperCase() || '44'
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
  return createF1Preview(createModel({ label: '44' }), {
    aspect, target: [0, 1.15, 0], distance: 4.2, fov: 28, yaw: -0.3, pitch: 0.08,
  })
}
