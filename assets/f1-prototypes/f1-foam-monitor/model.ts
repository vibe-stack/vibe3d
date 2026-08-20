// f1-foam-monitor — red trackside foam cannon on a trailer base.

import { BufferGeometry, Group, Mesh, type Material } from 'three/webgpu'

import {
  acquireF1Materials,
  bevelBox,
  createF1Preview,
  disposeF1Materials,
  mergeParts,
  tubeSection,
  AXIS_X,
  AXIS_Y,
} from '../f1-kit-core/index.ts'

type Slot = 'base' | 'cannon'

export interface F1FoamMonitorConfig {
  yaw: number
}

export interface F1FoamMonitorOptions extends Partial<F1FoamMonitorConfig> {
  materials?: Partial<Record<Slot, Material>>
}

export interface F1FoamMonitorInstance {
  readonly root: Group
  readonly parts: { base: Group; nozzle: Group }
  readonly materials: Readonly<Record<Slot, Material>>
  getConfig(): Readonly<F1FoamMonitorConfig>
  configure(patch: Partial<F1FoamMonitorConfig>): void
  setMaterial(slot: Slot, material: Material): void
  update(deltaSeconds: number): void
  dispose(): void
}

const defaults: F1FoamMonitorConfig = { yaw: 0 }

export function createModel(options: F1FoamMonitorOptions = {}): F1FoamMonitorInstance {
  const config: F1FoamMonitorConfig = { yaw: options.yaw ?? defaults.yaw }

  const bundle = acquireF1Materials()
  const kit = bundle.materials
  const materialSlots: Record<Slot, Material> = {
    base: options.materials?.base ?? kit.graphite,
    cannon: options.materials?.cannon ?? kit.red,
  }

  const root = new Group(); root.name = 'f1-foam-monitor'
  const base = new Group(); base.name = 'base'
  const nozzle = new Group(); nozzle.name = 'nozzle'
  root.add(base, nozzle)

  const generated: BufferGeometry[] = []
  const meshesBySlot: Record<Slot, Mesh[]> = { base: [], cannon: [] }
  let built = false

  const releaseGenerated = (): void => {
    base.clear()
    for (const geometry of generated) geometry.dispose()
    generated.length = 0
    meshesBySlot.base.length = 0
    if (built) meshesBySlot.cannon.length = 0
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

  const buildBase = (): void => {
    base.clear()
    for (const geometry of generated) geometry.dispose()
    generated.length = 0
    meshesBySlot.base.length = 0
    const chassis = bevelBox(1.6, 0.12, 2.4, 0.012)
    chassis.translate(0, 0.36, 0)
    emit('base', chassis, base, 'chassis')
    for (const x of [-0.62, 0.62] as const) {
      const wheel = tubeSection(0.18, 0.08, [x, 0.18, 0.85], AXIS_X, 12)
      emit('base', wheel, base, `wheel-${x}`)
    }
    const pivot = bevelBox(0.38, 0.28, 0.38, 0.01)
    pivot.translate(0, 0.56, -0.15)
    emit('base', pivot, base, 'pivot')
  }

  const buildNozzle = (): void => {
    nozzle.clear()
    meshesBySlot.cannon.length = 0
    const parts: BufferGeometry[] = []
    const barrel = tubeSection(0.12, 1.1, [0.55, 0.72, -0.15], AXIS_X, 14)
    parts.push(barrel)
    const tank = bevelBox(0.72, 0.62, 0.72, 0.015)
    tank.translate(-0.12, 0.78, -0.15)
    parts.push(tank)
    const guard = bevelBox(0.18, 0.42, 0.52, 0.008)
    guard.translate(0.05, 0.72, -0.15)
    parts.push(guard)
    const geo = mergeParts(parts, 'cannon')
    generated.push(geo)
    const mesh = new Mesh(geo, materialSlots.cannon)
    mesh.name = 'cannon'
    mesh.castShadow = true
    mesh.receiveShadow = true
    meshesBySlot.cannon.push(mesh)
    nozzle.add(mesh)
    nozzle.position.set(0, 0, 0)
    nozzle.rotation.y = config.yaw
    built = true
  }

  buildBase()
  buildNozzle()

  return {
    root,
    parts: { base, nozzle },
    materials: materialSlots,
    getConfig: () => ({ ...config }),
    configure(patch) {
      if (patch.yaw !== undefined) {
        config.yaw = patch.yaw
        nozzle.rotation.y = config.yaw
      }
    },
    setMaterial(slot, material) {
      materialSlots[slot] = material
      for (const mesh of meshesBySlot[slot]) mesh.material = material
    },
    update: () => {},
    dispose() {
      releaseGenerated()
      nozzle.clear()
      disposeF1Materials(bundle)
      root.removeFromParent()
    },
  }
}

export function createPreview({ aspect }: { aspect: number; time?: number }) {
  return createF1Preview(createModel({ yaw: 0.35 }), {
    aspect,
    target: [0, 0.7, 0],
    distance: 4.2,
    fov: 28,
    yaw: -0.65,
    pitch: 0.1,
  })
}
