// f1-foam-monitor — red trackside foam cannon on a four-wheel trailer. Tank, swivel
// monitor, and flared nozzle have to read; not a pink cube on a slab.

import { BufferGeometry, Group, Mesh, type Material } from 'three/webgpu'

import {
  acquireF1Materials,
  bevelBox,
  createF1Preview,
  disposeF1Materials,
  mergeParts,
  revolve,
  tubeSection,
  AXIS_X,
  AXIS_Y,
  AXIS_Z,
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

  const releaseGenerated = (): void => {
    base.clear(); nozzle.clear()
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
    const chassis = bevelBox(1.35, 0.12, 2.15, 0.012)
    chassis.translate(0, 0.34, 0)
    emit('base', chassis, base, 'chassis')
    const hitch = bevelBox(0.18, 0.08, 0.55, 0.008)
    hitch.translate(0, 0.34, -1.25)
    emit('base', hitch, base, 'hitch', kit.steel)
    const wheels: BufferGeometry[] = []
    for (const x of [-0.62, 0.62] as const) {
      for (const z of [-0.72, 0.72] as const) {
        wheels.push(tubeSection(0.2, 0.12, [x, 0.2, z], AXIS_X, 14))
      }
    }
    emit('base', mergeParts(wheels, 'wheels'), base, 'wheels', kit.ink)

    const tank = tubeSection(0.38, 1.35, [0, 0.82, -0.15], AXIS_Z, 16)
    emit('cannon', tank, nozzle, 'tank')
    const strapA = bevelBox(0.82, 0.06, 0.08, 0.004)
    strapA.translate(0, 0.82, -0.55)
    const strapB = bevelBox(0.82, 0.06, 0.08, 0.004)
    strapB.translate(0, 0.82, 0.25)
    emit('cannon', mergeParts([strapA, strapB], 'straps'), nozzle, 'straps', kit.ink)
    const cap = tubeSection(0.12, 0.1, [0, 0.82, -0.88], AXIS_Z, 12)
    emit('cannon', cap, nozzle, 'cap', kit.graphite)

    emit('cannon', tubeSection(0.09, 0.28, [0, 1.18, 0.15], AXIS_Y, 12), nozzle, 'pedestal')
    const swivel = bevelBox(0.28, 0.16, 0.28, 0.01)
    swivel.translate(0, 1.36, 0.15)
    emit('cannon', swivel, nozzle, 'swivel', kit.graphite)
    emit('cannon', tubeSection(0.07, 0.95, [0.48, 1.42, 0.15], AXIS_X, 14), nozzle, 'barrel')
    const bell = revolve(
      [[0, 0.35], [0.35, 0.4], [0.7, 0.7], [1, 1]],
      { yBot: 0, yTop: 0.22, scaleW: 0.11, segments: 16 },
    )
    bell.rotateZ(-Math.PI / 2)
    bell.translate(1.05, 1.42, 0.15)
    emit('cannon', bell, nozzle, 'nozzle')
    const handle = bevelBox(0.06, 0.04, 0.42, 0.004)
    handle.translate(0.15, 1.52, 0.15)
    emit('cannon', handle, nozzle, 'handle', kit.ink)
    nozzle.rotation.y = config.yaw
  }

  rebuild()

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
      disposeF1Materials(bundle)
      root.removeFromParent()
    },
  }
}

export function createPreview({ aspect }: { aspect: number; time?: number }) {
  return createF1Preview(createModel({ yaw: 0.4 }), {
    aspect,
    target: [0.15, 0.85, 0],
    distance: 3.9,
    fov: 28,
    yaw: -0.72,
    pitch: 0.16,
  })
}
