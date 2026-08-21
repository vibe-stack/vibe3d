// f1-jersey-barrier — interlocking New Jersey profile scaled so the crown sits at FIA Grade 1 (1.0 m).
// Identity is the NJ kink (toe + two slopes), drain slots, and module joints — not a smooth wedge.

import { BufferGeometry, Group, Mesh, type Material } from 'three/webgpu'

import {
  WALL_END,
  acquireF1Materials,
  bevelBox,
  createF1Preview,
  creased,
  disposeF1Materials,
  loftAlongX,
  mergeParts,
} from '../f1-kit-core/index.ts'

type Slot = 'barrier'

export interface F1JerseyBarrierConfig {
  modules: number
}

export interface F1JerseyBarrierOptions extends Partial<F1JerseyBarrierConfig> {
  materials?: Partial<Record<Slot, Material>>
}

export interface F1JerseyBarrierInstance {
  readonly root: Group
  readonly parts: { barrier: Group }
  readonly materials: Readonly<Record<Slot, Material>>
  getConfig(): Readonly<F1JerseyBarrierConfig>
  configure(patch: Partial<F1JerseyBarrierConfig>): void
  setMaterial(slot: Slot, material: Material): void
  update(deltaSeconds: number): void
  dispose(): void
}

const defaults: F1JerseyBarrierConfig = { modules: 3 }
const PITCH = WALL_END.jersey.pitch
const H = WALL_END.jersey.height
const GAP = 0.06
const SLOT_Y0 = 0.12
const SLOT_Y1 = 0.24

/**
 * US NJ 32 in outline, scaled so crown = 1.0 m.
 * Tall vertical toe, 55° lower slope, 84° upper face — the kink has to read at catalogue distance.
 */
function jerseyLower(): Array<readonly [number, number]> {
  return [
    [-0.375, 0.00],
    [-0.375, 0.14],
    [-0.365, SLOT_Y0],
    [0.365, SLOT_Y0],
    [0.375, 0.14],
    [0.375, 0.00],
  ]
}

function jerseyUpper(): Array<readonly [number, number]> {
  return [
    [-0.28, SLOT_Y1],
    [-0.20, 0.38],
    [-0.09, H],
    [0.09, H],
    [0.20, 0.38],
    [0.28, SLOT_Y1],
  ]
}

export function createModel(options: F1JerseyBarrierOptions = {}): F1JerseyBarrierInstance {
  const config: F1JerseyBarrierConfig = {
    modules: Math.max(1, Math.round(options.modules ?? defaults.modules)),
  }

  const bundle = acquireF1Materials()
  const kit = bundle.materials
  const materialSlots: Record<Slot, Material> = {
    barrier: options.materials?.barrier ?? kit.shell,
  }

  const root = new Group()
  root.name = 'f1-jersey-barrier'
  const barrier = new Group(); barrier.name = 'barrier'
  root.add(barrier)

  const generated: BufferGeometry[] = []
  const meshesBySlot: Record<Slot, Mesh[]> = { barrier: [] }

  const releaseGenerated = (): void => {
    barrier.clear()
    for (const geometry of generated) geometry.dispose()
    generated.length = 0
    meshesBySlot.barrier.length = 0
  }

  const emit = (geometry: BufferGeometry, material: Material, name: string): void => {
    generated.push(geometry)
    const mesh = new Mesh(geometry, material)
    mesh.name = name
    mesh.castShadow = true
    mesh.receiveShadow = true
    meshesBySlot.barrier.push(mesh)
    barrier.add(mesh)
  }

  const rebuild = (): void => {
    releaseGenerated()
    const body: BufferGeometry[] = []
    const voids: BufferGeometry[] = []
    const length = config.modules * PITCH
    const half = length / 2
    const bay = PITCH - GAP
    const lower = jerseyLower()
    const upper = jerseyUpper()

    for (let i = 0; i < config.modules; i++) {
      const x = -half + i * PITCH + PITCH / 2
      const foot = creased(loftAlongX(lower, bay, { closed: true, stations: 3 }), 28)
      foot.translate(x, 0, 0)
      body.push(foot)
      const top = creased(loftAlongX(upper, bay, { closed: true, stations: 4 }), 28)
      top.translate(x, 0, 0)
      body.push(top)

      const slotW = 0.28
      const slotX = x + ((i % 2) === 0 ? -0.45 : 0.45)
      for (const z of [-1, 1] as const) {
        const plate = bevelBox(slotW, SLOT_Y1 - SLOT_Y0, 0.03, 0.004)
        plate.translate(slotX, (SLOT_Y0 + SLOT_Y1) / 2, z * 0.30)
        voids.push(plate)
      }

      const lipL = bevelBox(bay - 0.08, 0.022, 0.032, 0.003)
      lipL.translate(x, H - 0.012, -0.05)
      const lipR = bevelBox(bay - 0.08, 0.022, 0.032, 0.003)
      lipR.translate(x, H - 0.012, 0.05)
      body.push(lipL, lipR)

      if (i < config.modules - 1) {
        const joint = bevelBox(GAP - 0.01, 0.78, 0.28, 0.004)
        joint.translate(x + bay / 2 + GAP / 2, 0.4, 0)
        voids.push(joint)
        const tongue = bevelBox(0.09, 0.34, 0.13, 0.008)
        tongue.translate(x + bay / 2 + GAP / 2, 0.5, 0)
        body.push(tongue)
      }
    }

    emit(mergeParts(body, 'jersey'), materialSlots.barrier, 'jersey')
    emit(mergeParts(voids, 'jersey-voids'), kit.ink, 'voids')
  }
  rebuild()

  return {
    root,
    parts: { barrier },
    materials: materialSlots,
    getConfig: () => ({ ...config }),
    configure(patch) {
      if (patch.modules !== undefined) config.modules = Math.max(1, Math.round(patch.modules))
      rebuild()
    },
    setMaterial(slot, material) {
      materialSlots[slot] = material
      for (const mesh of meshesBySlot[slot]) {
        if (mesh.name === 'jersey') mesh.material = material
      }
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
    aspect,
    target: [0, 0.46, 0],
    distance: 5.4,
    fov: 30,
    yaw: -0.38,
    pitch: 0.2,
  })
}
