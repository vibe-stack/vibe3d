// f1-trophy-cup — generic two-handle GP cup. Not a named championship trophy.

import { BufferGeometry, Group, Mesh, Vector3, type Material } from 'three/webgpu'

import {
  TROPHY_CUP,
  acquireF1Materials,
  createF1Preview,
  disposeF1Materials,
  revolve,
  taperedTube,
} from '../f1-kit-core/index.ts'

type Slot = 'cup' | 'handles'

export interface F1TrophyCupConfig {
  height: number
}

export interface F1TrophyCupOptions extends Partial<F1TrophyCupConfig> {
  materials?: Partial<Record<Slot, Material>>
}

export interface F1TrophyCupInstance {
  readonly root: Group
  readonly parts: { cup: Group; handles: Group }
  readonly materials: Readonly<Record<Slot, Material>>
  getConfig(): Readonly<F1TrophyCupConfig>
  configure(patch: Partial<F1TrophyCupConfig>): void
  setMaterial(slot: Slot, material: Material): void
  update(deltaSeconds: number): void
  dispose(): void
}

const defaults: F1TrophyCupConfig = { height: TROPHY_CUP.height }

export function createModel(options: F1TrophyCupOptions = {}): F1TrophyCupInstance {
  const config: F1TrophyCupConfig = {
    height: Math.max(0.25, options.height ?? defaults.height),
  }
  const bundle = acquireF1Materials()
  const kit = bundle.materials
  const materialSlots: Record<Slot, Material> = {
    cup: options.materials?.cup ?? kit.steel,
    handles: options.materials?.handles ?? kit.steel,
  }
  const root = new Group(); root.name = 'f1-trophy-cup'
  const cup = new Group(); cup.name = 'cup'
  const handles = new Group(); handles.name = 'handles'
  root.add(cup, handles)
  const generated: BufferGeometry[] = []
  const meshesBySlot: Record<Slot, Mesh[]> = { cup: [], handles: [] }
  const releaseGenerated = (): void => {
    cup.clear(); handles.clear()
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
    const body = revolve(
      [[0, 0.22], [0.12, 0.18], [0.28, 0.12], [0.45, 0.28], [0.72, 0.42], [0.88, 0.38], [1, 0.36]],
      { yBot: 0, yTop: h, scaleW: h, segments: 28 },
    )
    emit('cup', body, cup, 'body')
    for (const sx of [-1, 1] as const) {
      const path = [
        new Vector3(sx * h * 0.28, h * 0.55, 0),
        new Vector3(sx * h * 0.48, h * 0.62, 0),
        new Vector3(sx * h * 0.48, h * 0.82, 0),
        new Vector3(sx * h * 0.32, h * 0.88, 0),
      ]
      emit('handles', taperedTube(path, h * 0.018, 8), handles, `handle-${sx}`)
    }
  }
  rebuild()
  return {
    root,
    parts: { cup, handles },
    materials: materialSlots,
    getConfig: () => ({ ...config }),
    configure(patch) {
      if (patch.height !== undefined) config.height = Math.max(0.25, patch.height)
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
    aspect, target: [0, 0.28, 0], distance: 1.6, fov: 28, yaw: -0.55, pitch: 0.08,
  })
}
