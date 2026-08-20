// f1-camera-tower — lattice tower with an overhead camera deck.

import {
  BufferGeometry,
  CylinderGeometry,
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

type Slot = 'tower' | 'deck'

export interface F1CameraTowerConfig {
  height: number
}

export interface F1CameraTowerOptions extends Partial<F1CameraTowerConfig> {
  materials?: Partial<Record<Slot, Material>>
}

export interface F1CameraTowerInstance {
  readonly root: Group
  readonly parts: { tower: Group; deck: Group }
  readonly materials: Readonly<Record<Slot, Material>>
  getConfig(): Readonly<F1CameraTowerConfig>
  configure(patch: Partial<F1CameraTowerConfig>): void
  setMaterial(slot: Slot, material: Material): void
  update(deltaSeconds: number): void
  dispose(): void
}

const defaults: F1CameraTowerConfig = { height: 8 }

export function createModel(options: F1CameraTowerOptions = {}): F1CameraTowerInstance {
  const config: F1CameraTowerConfig = {
    height: Math.max(4, options.height ?? defaults.height),
  }

  const bundle = acquireF1Materials()
  const kit = bundle.materials
  const materialSlots: Record<Slot, Material> = {
    tower: options.materials?.tower ?? kit.steel,
    deck: options.materials?.deck ?? kit.graphite,
  }

  const root = new Group(); root.name = 'f1-camera-tower'
  const tower = new Group(); tower.name = 'tower'
  const deck = new Group(); deck.name = 'deck'
  root.add(tower, deck)

  const generated: BufferGeometry[] = []
  const meshesBySlot: Record<Slot, Mesh[]> = { tower: [], deck: [] }

  const releaseGenerated = (): void => {
    tower.clear(); deck.clear()
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
    const legs: BufferGeometry[] = []
    for (const [x, z] of [[-0.35, -0.35], [0.35, -0.35], [0.35, 0.35], [-0.35, 0.35]] as const) {
      legs.push(member(new Vector3(x, 0.08, z), new Vector3(x, h, z), 0.028, 8))
    }
    const bays = Math.max(4, Math.round(h / 1.6))
    for (let i = 0; i < bays; i++) {
      const y = 0.5 + (i / bays) * (h - 0.8)
      for (const sx of [-1, 1] as const) {
        legs.push(member(
          new Vector3(-0.35, y, sx * 0.35),
          new Vector3(0.35, y, sx * 0.35),
          0.018,
          6,
        ))
        legs.push(member(
          new Vector3(sx * 0.35, y, -0.35),
          new Vector3(sx * 0.35, y, 0.35),
          0.018,
          6,
        ))
      }
    }
    const pier = new CylinderGeometry(0.42, 0.48, 0.14, 16)
    pier.translate(0, 0.07, 0)
    legs.push(pier)
    emit('tower', mergeParts(legs, 'lattice'), tower, 'lattice')

    const platform = bevelBox(1.4, 0.06, 1.4, 0.008)
    platform.translate(0, h + 0.03, 0)
    const railParts: BufferGeometry[] = [platform]
    for (const sx of [-1, 1] as const) {
      railParts.push(bevelBox(1.4, 0.9, 0.04, 0.006).translate(0, h + 0.48, sx * 0.68))
      railParts.push(bevelBox(0.04, 0.9, 1.4, 0.006).translate(sx * 0.68, h + 0.48, 0))
    }
    emit('deck', mergeParts(railParts, 'platform'), deck, 'platform')
    const pods: BufferGeometry[] = []
    for (const [x, z] of [[-0.28, 0.28], [0.28, -0.28]] as const) {
      const pod = bevelBox(0.22, 0.16, 0.28, 0.012)
      pod.translate(x, h + 0.14, z)
      pods.push(pod)
    }
    emit('deck', mergeParts(pods, 'cameras'), deck, 'cameras')
  }
  rebuild()

  return {
    root,
    parts: { tower, deck },
    materials: materialSlots,
    getConfig: () => ({ ...config }),
    configure(patch) {
      if (patch.height !== undefined) config.height = Math.max(4, patch.height)
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
  return createF1Preview(createModel({ height: 6 }), {
    aspect,
    target: [0, 3.2, 0],
    distance: 12,
    fov: 32,
    yaw: 0.55,
    pitch: 0.08,
  })
}
