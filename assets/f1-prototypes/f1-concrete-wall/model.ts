// f1-concrete-wall — a vertical FIA concrete wall module. Height and bay count are knobs;
// optional fence sockets stand on the cap for a catch-fence run.

import { BufferGeometry, Group, Mesh, type Material } from 'three/webgpu'

import {
  WALL_END,
  acquireF1Materials,
  bevelBox,
  createF1Preview,
  disposeF1Materials,
  mergeParts,
} from '../f1-kit-core/index.ts'

type Slot = 'wall' | 'cap' | 'socket'

export interface F1ConcreteWallConfig {
  bays: number
  height: number
  sockets: boolean
}

export interface F1ConcreteWallOptions extends Partial<F1ConcreteWallConfig> {
  materials?: Partial<Record<Slot, Material>>
}

export interface F1ConcreteWallInstance {
  readonly root: Group
  readonly parts: { wall: Group; cap: Group }
  readonly materials: Readonly<Record<Slot, Material>>
  getConfig(): Readonly<F1ConcreteWallConfig>
  configure(patch: Partial<F1ConcreteWallConfig>): void
  setMaterial(slot: Slot, material: Material): void
  update(deltaSeconds: number): void
  dispose(): void
}

const defaults: F1ConcreteWallConfig = {
  bays: 4,
  height: WALL_END.concrete.height,
  sockets: true,
}
const PITCH = WALL_END.concrete.pitch
const DEPTH = WALL_END.concrete.depth
const CAP_H = 0.08

export function createModel(options: F1ConcreteWallOptions = {}): F1ConcreteWallInstance {
  const config: F1ConcreteWallConfig = {
    bays: Math.max(1, Math.round(options.bays ?? defaults.bays)),
    height: Math.max(0.6, options.height ?? defaults.height),
    sockets: options.sockets ?? defaults.sockets,
  }

  const bundle = acquireF1Materials()
  const kit = bundle.materials
  const materialSlots: Record<Slot, Material> = {
    wall: options.materials?.wall ?? kit.shell,
    cap: options.materials?.cap ?? kit.slate,
    socket: options.materials?.socket ?? kit.graphite,
  }

  const root = new Group()
  root.name = 'f1-concrete-wall'
  const wall = new Group(); wall.name = 'wall'
  const cap = new Group(); cap.name = 'cap'
  root.add(wall, cap)

  const generated: BufferGeometry[] = []
  const meshesBySlot: Record<Slot, Mesh[]> = { wall: [], cap: [], socket: [] }

  const releaseGenerated = (): void => {
    wall.clear(); cap.clear()
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
    const { bays, height, sockets } = config
    const length = bays * PITCH
    const body = bevelBox(length, height - CAP_H, DEPTH, 0.012)
    body.translate(0, (height - CAP_H) / 2, 0)
    emit('wall', body, wall, 'body')
    const capBeam = bevelBox(length + 0.04, CAP_H, DEPTH + 0.04, 0.008)
    capBeam.translate(0, height - CAP_H / 2, 0)
    emit('cap', capBeam, cap, 'cap')
    if (!sockets) return
    const socketParts: BufferGeometry[] = []
    for (let i = 0; i <= bays; i++) {
      const x = -length / 2 + i * PITCH
      const post = bevelBox(0.06, 0.22, 0.06, 0.006)
      post.translate(x, height + 0.09, 0)
      socketParts.push(post)
    }
    emit('socket', mergeParts(socketParts, 'sockets'), cap, 'sockets')
  }
  rebuild()

  return {
    root,
    parts: { wall, cap },
    materials: materialSlots,
    getConfig: () => ({ ...config }),
    configure(patch) {
      if (patch.bays !== undefined) config.bays = Math.max(1, Math.round(patch.bays))
      if (patch.height !== undefined) config.height = Math.max(0.6, patch.height)
      if (patch.sockets !== undefined) config.sockets = patch.sockets
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
  return createF1Preview(createModel({ bays: 3 }), {
    aspect,
    target: [0, 0.55, 0],
    distance: 8.4,
    fov: 28,
    yaw: -1.05,
    pitch: 0.18,
  })
}
