// f1-hand-trolley — sack truck, standing height 1.15 m.

import {
  BufferGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  Vector3,
  type Material,
} from 'three/webgpu'

import {
  HAND_TROLLEY,
  acquireF1Materials,
  bevelBox,
  createF1Preview,
  disposeF1Materials,
  member,
  mergeParts,
  tubeSection,
} from '../f1-kit-core/index.ts'

type Slot = 'frame' | 'wheels'

export interface F1HandTrolleyConfig {
  height: number
}

export interface F1HandTrolleyOptions extends Partial<F1HandTrolleyConfig> {
  materials?: Partial<Record<Slot, Material>>
}

export interface F1HandTrolleyInstance {
  readonly root: Group
  readonly parts: { frame: Group; wheels: Group }
  readonly materials: Readonly<Record<Slot, Material>>
  getConfig(): Readonly<F1HandTrolleyConfig>
  configure(patch: Partial<F1HandTrolleyConfig>): void
  setMaterial(slot: Slot, material: Material): void
  update(deltaSeconds: number): void
  dispose(): void
}

const defaults: F1HandTrolleyConfig = { height: HAND_TROLLEY.height }

export function createModel(options: F1HandTrolleyOptions = {}): F1HandTrolleyInstance {
  const config: F1HandTrolleyConfig = {
    height: Math.max(0.9, options.height ?? defaults.height),
  }
  const bundle = acquireF1Materials()
  const kit = bundle.materials
  const materialSlots: Record<Slot, Material> = {
    frame: options.materials?.frame ?? kit.steel,
    wheels: options.materials?.wheels ?? kit.ink,
  }
  const root = new Group(); root.name = 'f1-hand-trolley'
  const frame = new Group(); frame.name = 'frame'
  const wheels = new Group(); wheels.name = 'wheels'
  root.add(frame, wheels)
  const generated: BufferGeometry[] = []
  const meshesBySlot: Record<Slot, Mesh[]> = { frame: [], wheels: [] }
  const releaseGenerated = (): void => {
    frame.clear(); wheels.clear()
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
    const h = config.height
    const lean = 0.12
    const parts: BufferGeometry[] = []
    for (const sx of [-1, 1] as const) {
      parts.push(member(
        new Vector3(sx * 0.18, 0.16, 0),
        new Vector3(sx * 0.18, h, -lean),
        0.012,
        8,
      ))
    }
    parts.push(member(new Vector3(-0.18, 0.42, -0.04), new Vector3(0.18, 0.42, -0.04), 0.01, 6))
    parts.push(member(new Vector3(-0.18, h - 0.08, -lean), new Vector3(0.18, h - 0.08, -lean), 0.01, 6))
    const toe = bevelBox(0.42, 0.03, 0.28, 0.004)
    toe.translate(0, 0.04, 0.1)
    parts.push(toe)
    emit('frame', mergeParts(parts, 'frame'), frame, 'frame')
    emit('frame', tubeSection(0.014, 0.36, [0, h - 0.02, -lean], [1, 0, 0], 8), frame, 'handle')

    const wheelR = 0.09
    for (const sx of [-1, 1] as const) {
      const tyre = new CylinderGeometry(wheelR, wheelR, 0.04, 16)
      tyre.rotateZ(Math.PI / 2)
      tyre.translate(sx * 0.22, wheelR, -0.02)
      emit('wheels', tyre, wheels, sx < 0 ? 'tyre-l' : 'tyre-r')
    }
  }
  rebuild()
  return {
    root,
    parts: { frame, wheels },
    materials: materialSlots,
    getConfig: () => ({ ...config }),
    configure(patch) {
      if (patch.height !== undefined) config.height = Math.max(0.9, patch.height)
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
    aspect, target: [0, 0.55, 0], distance: 2.6, fov: 28, yaw: 0.55, pitch: 0.1,
  })
}
