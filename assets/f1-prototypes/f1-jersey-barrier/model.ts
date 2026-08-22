// f1-jersey-barrier — interlocking New Jersey profile scaled so the crown sits at FIA Grade 1 (1.0 m).
// Identity is the NJ kink (toe + two slopes) and a through-drain per module — not a smooth wedge
// and not a painted-on slot.

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
/** Bottom of the through-drain, top of the vertical toe. */
const SLOT_Y0 = 0.14
/** Top of the through-drain, at the NJ kink. 0.22 m tall so it punches at 320 px. */
const SLOT_Y1 = 0.42
const SLOT_W = 0.82

/**
 * US NJ 32 in outline, scaled so crown = 1.0 m.
 * Tall vertical toe, 55° lower slope, 84° upper face — the kink has to read at catalogue distance.
 */
function jerseyProfile(): Array<readonly [number, number]> {
  return [
    [-0.375, 0.00],
    [-0.375, SLOT_Y0],
    [-0.22, SLOT_Y1],
    [-0.09, H],
    [0.09, H],
    [0.22, SLOT_Y1],
    [0.375, SLOT_Y0],
    [0.375, 0.00],
  ]
}

function jerseySill(): Array<readonly [number, number]> {
  return [
    [-0.375, 0.00],
    [-0.375, SLOT_Y0],
    [0.375, SLOT_Y0],
    [0.375, 0.00],
  ]
}

function jerseyLintel(): Array<readonly [number, number]> {
  return [
    [-0.22, SLOT_Y1],
    [-0.09, H],
    [0.09, H],
    [0.22, SLOT_Y1],
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
    const drains: BufferGeometry[] = []
    const length = config.modules * PITCH
    const half = length / 2
    const bay = PITCH - GAP
    const profile = jerseyProfile()
    const sill = jerseySill()
    const lintel = jerseyLintel()

    for (let i = 0; i < config.modules; i++) {
      const x = -half + i * PITCH + PITCH / 2
      const moduleStart = x - bay / 2
      const moduleEnd = x + bay / 2
      const slotX = x + ((i % 2) === 0 ? -0.22 : 0.22)
      const slotStart = slotX - SLOT_W / 2
      const slotEnd = slotX + SLOT_W / 2
      const leftW = slotStart - moduleStart
      const rightW = moduleEnd - slotEnd
      const leftX = (moduleStart + slotStart) / 2
      const rightX = (slotEnd + moduleEnd) / 2

      const left = creased(loftAlongX(profile, leftW, { closed: true, stations: 3 }), 28)
      left.translate(leftX, 0, 0)
      const right = creased(loftAlongX(profile, rightW, { closed: true, stations: 3 }), 28)
      right.translate(rightX, 0, 0)
      const foot = creased(loftAlongX(sill, SLOT_W, { closed: true, stations: 2 }), 28)
      foot.translate(slotX, 0, 0)
      const top = creased(loftAlongX(lintel, SLOT_W, { closed: true, stations: 4 }), 28)
      top.translate(slotX, 0, 0)
      body.push(left, right, foot, top)

      const slotH = SLOT_Y1 - SLOT_Y0
      for (const side of [-1, 1] as const) {
        const jamb = bevelBox(0.028, slotH, 0.72, 0.004)
        jamb.translate(slotX + side * (SLOT_W / 2 - 0.012), (SLOT_Y0 + SLOT_Y1) / 2, 0)
        drains.push(jamb)
      }
      const soffit = bevelBox(SLOT_W - 0.04, 0.018, 0.42, 0.003)
      soffit.translate(slotX, SLOT_Y1 - 0.008, 0)
      const threshold = bevelBox(SLOT_W - 0.04, 0.016, 0.72, 0.003)
      threshold.translate(slotX, SLOT_Y0 + 0.008, 0)
      drains.push(soffit, threshold)

      const lipL = bevelBox(bay - 0.08, 0.022, 0.032, 0.003)
      lipL.translate(x, H - 0.012, -0.05)
      const lipR = bevelBox(bay - 0.08, 0.022, 0.032, 0.003)
      lipR.translate(x, H - 0.012, 0.05)
      body.push(lipL, lipR)

      if (i < config.modules - 1) {
        const tongue = bevelBox(0.09, 0.34, 0.13, 0.008)
        tongue.translate(x + bay / 2 + GAP / 2, 0.5, 0)
        body.push(tongue)
      }
    }

    emit(mergeParts(body, 'jersey'), materialSlots.barrier, 'jersey')
    emit(mergeParts(drains, 'jersey-drains'), kit.ink, 'drains')
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
    target: [0, 0.42, 0],
    distance: 4.6,
    fov: 28,
    yaw: -0.22,
    pitch: 0.22,
  })
}
