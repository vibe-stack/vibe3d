// f1-gazebo — 3 × 3 m hospitality tent. Lofted hip roof / eaves.

import { LoftGeometry } from 'three/examples/jsm/geometries/LoftGeometry.js'
import {
  BufferGeometry,
  Group,
  Mesh,
  Vector3,
  type Material,
} from 'three/webgpu'

import {
  AXIS_Y,
  GAZEBO,
  acquireF1Materials,
  createF1Preview,
  disposeF1Materials,
  groundPad,
  tubeSection,
} from '../f1-kit-core/index.ts'

type Slot = 'frame' | 'canopy'

export interface F1GazeboConfig {
  span: number
}

export interface F1GazeboOptions extends Partial<F1GazeboConfig> {
  materials?: Partial<Record<Slot, Material>>
}

export interface F1GazeboInstance {
  readonly root: Group
  readonly parts: { frame: Group; canopy: Group }
  readonly materials: Readonly<Record<Slot, Material>>
  getConfig(): Readonly<F1GazeboConfig>
  configure(patch: Partial<F1GazeboConfig>): void
  setMaterial(slot: Slot, material: Material): void
  update(deltaSeconds: number): void
  dispose(): void
}

const defaults: F1GazeboConfig = { span: GAZEBO.span }
const POST_H = 2.15
const EAVES = 0.18

function squareRing(half: number, y: number): Vector3[] {
  return [
    new Vector3(-half, y, -half),
    new Vector3(half, y, -half),
    new Vector3(half, y, half),
    new Vector3(-half, y, half),
  ]
}

export function createModel(options: F1GazeboOptions = {}): F1GazeboInstance {
  const config: F1GazeboConfig = {
    span: Math.max(2.4, options.span ?? defaults.span),
  }
  const bundle = acquireF1Materials()
  const kit = bundle.materials
  const materialSlots: Record<Slot, Material> = {
    frame: options.materials?.frame ?? kit.steel,
    canopy: options.materials?.canopy ?? kit.fabric,
  }
  const root = new Group(); root.name = 'f1-gazebo'
  const frame = new Group(); frame.name = 'frame'
  const canopy = new Group(); canopy.name = 'canopy'
  root.add(frame, canopy)
  const generated: BufferGeometry[] = []
  const meshesBySlot: Record<Slot, Mesh[]> = { frame: [], canopy: [] }
  const releaseGenerated = (): void => {
    frame.clear(); canopy.clear()
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
    const span = config.span
    const half = span / 2
    const peak = GAZEBO.height * (span / GAZEBO.span)
    for (const sx of [-1, 1] as const) {
      for (const sz of [-1, 1] as const) {
        const x = sx * (half - 0.06)
        const z = sz * (half - 0.06)
        emit('frame', tubeSection(0.028, POST_H, [x, POST_H / 2, z], AXIS_Y, 10), frame, 'post')
        emit('frame', groundPad([0.14, 0.14], [x, 0, z]), frame, 'pad')
      }
    }
    const roof = new LoftGeometry(
      [squareRing(half + EAVES, POST_H), squareRing(0.07, peak)],
      { closed: true, capStart: false, capEnd: true },
    )
    emit('canopy', roof, canopy, 'roof')
    const valance = new LoftGeometry(
      [squareRing(half + EAVES, POST_H), squareRing(half + EAVES - 0.01, POST_H - 0.22)],
      { closed: true, capStart: false, capEnd: true },
    )
    emit('canopy', valance, canopy, 'valance')
  }
  rebuild()
  return {
    root,
    parts: { frame, canopy },
    materials: materialSlots,
    getConfig: () => ({ ...config }),
    configure(patch) {
      if (patch.span !== undefined) config.span = Math.max(2.4, patch.span)
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
  return createF1Preview(createModel(), {
    aspect, target: [0, 1.3, 0], distance: 8.5, fov: 30, yaw: 0.55, pitch: 0.18,
  })
}
