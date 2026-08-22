// f1-concrete-wall — FIA 3501 precast debris wall. 1.0 m envelope, 0.35 m section, `bays`.
// Identity is the battered face, bay joints, plinth scoop, and form-tie dimples — not a grey slab.

import { BufferGeometry, Group, Mesh, type Material } from 'three/webgpu'

import {
  WALL_END,
  acquireF1Materials,
  bevelBox,
  bolt,
  createF1Preview,
  creased,
  disposeF1Materials,
  loftAlongX,
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
const JOINT = 0.018
const PLINTH = 0.05

/** Track face +Z: plinth toe, batter, square back. Thickness at mid-height is WALL_END.concrete.depth. */
function wallProfile(bodyH: number): Array<readonly [number, number]> {
  const back = -DEPTH / 2
  const face = DEPTH / 2
  return [
    [back, 0],
    [face + PLINTH, 0],
    [face + PLINTH, 0.10],
    [face, 0.10],
    [face - 0.045, bodyH],
    [back, bodyH],
  ]
}

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
    const half = length / 2
    const bodyH = height - CAP_H
    const profile = wallProfile(bodyH)
    const wallParts: BufferGeometry[] = []
    const capParts: BufferGeometry[] = []

    for (let i = 0; i < bays; i++) {
      const x = -half + i * PITCH + PITCH / 2
      const bay = PITCH - JOINT
      const body = creased(loftAlongX(profile, bay, { closed: true, stations: 5 }), 35)
      body.translate(x, 0, 0)
      wallParts.push(body)

      const rust = bevelBox(bay - 0.08, 0.018, 0.022, 0.002)
      rust.translate(x, bodyH * 0.42, DEPTH / 2 - 0.008)
      wallParts.push(rust)
      const rustBack = bevelBox(bay - 0.08, 0.014, 0.016, 0.002)
      rustBack.translate(x, bodyH * 0.42, -DEPTH / 2 + 0.006)
      wallParts.push(rustBack)

      const cols = 4
      const rows = 3
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const dx = ((c + 0.5) / cols - 0.5) * (bay - 0.28)
          const y = 0.18 + r * ((bodyH - 0.32) / Math.max(1, rows - 1))
          const dimple = bevelBox(0.034, 0.034, 0.016, 0.004)
          dimple.translate(x + dx, y, DEPTH / 2 - 0.002)
          wallParts.push(dimple)
        }
      }

      const capBeam = bevelBox(bay + 0.02, CAP_H, DEPTH + 0.06, 0.008)
      capBeam.translate(x, height - CAP_H / 2, -0.01)
      capParts.push(capBeam)
      const drip = bevelBox(bay - 0.04, 0.016, 0.028, 0.003)
      drip.translate(x, height - CAP_H - 0.006, DEPTH / 2 + 0.008)
      capParts.push(drip)
    }

    emit('wall', mergeParts(wallParts, 'wall'), wall, 'body')
    emit('cap', mergeParts(capParts, 'cap'), cap, 'cap')

    if (!sockets) return
    const socketParts: BufferGeometry[] = []
    for (let i = 0; i <= bays; i++) {
      const x = -half + i * PITCH
      const post = bevelBox(0.07, 0.22, 0.07, 0.006)
      post.translate(x, height + 0.09, 0)
      socketParts.push(post)
      socketParts.push(bolt([x, height + 0.01, 0.028], 0.01, 0.014))
      socketParts.push(bolt([x, height + 0.01, -0.028], 0.01, 0.014))
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
