// f1-camera-platform — low scaffold deck for trackside cameras.

import {
  BufferGeometry,
  Group,
  Mesh,
  Vector3,
  type Material,
} from 'three/webgpu'

import {
  acquireF1Materials,
  bevelBox,
  createF1Preview,
  disposeF1Materials,
  member,
  mergeParts,
} from '../f1-kit-core/index.ts'

type Slot = 'scaffold' | 'deck'

export interface F1CameraPlatformConfig {
  height: number
}

export interface F1CameraPlatformOptions extends Partial<F1CameraPlatformConfig> {
  materials?: Partial<Record<Slot, Material>>
}

export interface F1CameraPlatformInstance {
  readonly root: Group
  readonly parts: { scaffold: Group; deck: Group }
  readonly materials: Readonly<Record<Slot, Material>>
  getConfig(): Readonly<F1CameraPlatformConfig>
  configure(patch: Partial<F1CameraPlatformConfig>): void
  setMaterial(slot: Slot, material: Material): void
  update(deltaSeconds: number): void
  dispose(): void
}

const defaults: F1CameraPlatformConfig = { height: 3 }

export function createModel(options: F1CameraPlatformOptions = {}): F1CameraPlatformInstance {
  const config: F1CameraPlatformConfig = {
    height: Math.max(1.5, options.height ?? defaults.height),
  }

  const bundle = acquireF1Materials()
  const kit = bundle.materials
  const materialSlots: Record<Slot, Material> = {
    scaffold: options.materials?.scaffold ?? kit.steel,
    deck: options.materials?.deck ?? kit.slate,
  }

  const root = new Group(); root.name = 'f1-camera-platform'
  const scaffold = new Group(); scaffold.name = 'scaffold'
  const deck = new Group(); deck.name = 'deck'
  root.add(scaffold, deck)

  const generated: BufferGeometry[] = []
  const meshesBySlot: Record<Slot, Mesh[]> = { scaffold: [], deck: [] }

  const releaseGenerated = (): void => {
    scaffold.clear(); deck.clear()
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
    const w = 2.4
    const d = 1.8
    const legParts: BufferGeometry[] = []
    for (const [x, z] of [[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2]] as const) {
      legParts.push(member(new Vector3(x, 0.06, z), new Vector3(x, h, z), 0.028, 8))
    }
    for (const sx of [-1, 1] as const) {
      legParts.push(member(new Vector3(-w / 2, h * 0.45, sx * d / 2), new Vector3(w / 2, h * 0.45, sx * d / 2), 0.02, 6))
      legParts.push(member(new Vector3(-w / 2, h * 0.75, sx * d / 2), new Vector3(w / 2, h * 0.75, sx * d / 2), 0.02, 6))
    }
    emit('scaffold', mergeParts(legParts, 'legs'), scaffold, 'legs')
    const platform = bevelBox(w, 0.05, d, 0.006)
    platform.translate(0, h, 0)
    emit('deck', platform, deck, 'platform')
    const railParts: BufferGeometry[] = []
    for (const sx of [-1, 1] as const) {
      railParts.push(bevelBox(w, 0.04, 0.04, 0.004).translate(0, h + 0.55, sx * (d / 2 + 0.02)))
      railParts.push(bevelBox(0.04, 0.55, d + 0.04, 0.004).translate(sx * (w / 2 + 0.02), h + 0.55, 0))
    }
    emit('deck', mergeParts(railParts, 'rails'), deck, 'rails', kit.graphite)
    const pod = bevelBox(0.22, 0.14, 0.26, 0.01)
    pod.translate(0, h + 0.12, 0.2)
    emit('deck', pod, deck, 'camera', kit.ink)
  }
  rebuild()

  return {
    root,
    parts: { scaffold, deck },
    materials: materialSlots,
    getConfig: () => ({ ...config }),
    configure(patch) {
      if (patch.height !== undefined) config.height = Math.max(1.5, patch.height)
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
  return createF1Preview(createModel({ height: 2.4 }), {
    aspect,
    target: [0, 1.4, 0],
    distance: 5.5,
    fov: 28,
    yaw: 0.5,
    pitch: 0.08,
  })
}
