// f1-camera-tower — lattice mast with an open-rail deck and two broadcast cameras
// (hood, lens). Preview frames the head so the cameras read at catalogue distance.

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
  bevelDisc,
  createF1Preview,
  disposeF1Materials,
  loftRoundedBox,
  member,
  mergeParts,
  tubeSection,
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
    height: Math.min(12, Math.max(6, options.height ?? defaults.height)),
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
    const h = config.height
    const half = 0.35
    const legs: BufferGeometry[] = []
    const corners: Array<readonly [number, number]> = [
      [-half, -half], [half, -half], [half, half], [-half, half],
    ]
    for (const [x, z] of corners) {
      legs.push(member(new Vector3(x, 0.08, z), new Vector3(x, h, z), 0.028, 8))
    }
    const bays = Math.max(4, Math.round(h / 1.6))
    for (let i = 0; i < bays; i++) {
      const y = 0.5 + (i / bays) * (h - 0.8)
      for (const sz of [-1, 1] as const) {
        legs.push(member(new Vector3(-half, y, sz * half), new Vector3(half, y, sz * half), 0.016, 6))
      }
      for (const sx of [-1, 1] as const) {
        legs.push(member(new Vector3(sx * half, y, -half), new Vector3(sx * half, y, half), 0.016, 6))
      }
      if (i % 2 === 0) {
        legs.push(member(new Vector3(-half, y, -half), new Vector3(half, y + (h - 0.8) / bays, half), 0.014, 6))
      }
    }
    const pier = new CylinderGeometry(0.42, 0.48, 0.14, 16)
    pier.translate(0, 0.07, 0)
    legs.push(pier)
    emit('tower', mergeParts(legs, 'lattice'), tower, 'lattice')

    const platform = bevelBox(1.45, 0.07, 1.45, 0.008)
    platform.translate(0, h + 0.03, 0)
    emit('deck', platform, deck, 'platform')
    const railParts: BufferGeometry[] = []
    const deckHalf = 0.68
    const deckCorners: Array<readonly [number, number]> = [
      [-deckHalf, -deckHalf], [deckHalf, -deckHalf], [deckHalf, deckHalf], [-deckHalf, deckHalf],
    ]
    for (const [x, z] of deckCorners) {
      railParts.push(member(new Vector3(x, h + 0.04, z), new Vector3(x, h + 0.95, z), 0.018, 8))
    }
    for (const sz of [-1, 1] as const) {
      railParts.push(member(
        new Vector3(-deckHalf, h + 0.95, sz * deckHalf),
        new Vector3(deckHalf, h + 0.95, sz * deckHalf),
        0.016,
        6,
      ))
      railParts.push(member(
        new Vector3(-deckHalf, h + 0.5, sz * deckHalf),
        new Vector3(deckHalf, h + 0.5, sz * deckHalf),
        0.014,
        6,
      ))
    }
    emit('deck', mergeParts(railParts, 'rails'), deck, 'rails', kit.steel)

    const bodies: BufferGeometry[] = []
    const lenses: BufferGeometry[] = []
    for (const [x, z, yaw] of [[-0.28, 0.32, 0.35], [0.28, -0.22, -2.4]] as const) {
      const housing = loftRoundedBox(0.16, 0.13, 0.3, 0.02)
      housing.rotateY(yaw)
      housing.translate(x, h + 0.2, z)
      bodies.push(housing)
      const hood = bevelBox(0.18, 0.04, 0.2, 0.005)
      hood.rotateY(yaw)
      hood.translate(x, h + 0.28, z + Math.cos(yaw) * 0.04)
      bodies.push(hood)
      lenses.push(tubeSection(
        0.045,
        0.12,
        [x + Math.sin(yaw) * 0.18, h + 0.18, z + Math.cos(yaw) * 0.18],
        [Math.sin(yaw), 0, Math.cos(yaw)],
        12,
      ))
    }
    emit('deck', mergeParts(bodies, 'cameras'), deck, 'cameras', kit.ink)
    emit('deck', mergeParts(lenses, 'lenses'), deck, 'lenses', kit.slate)
    const tally = bevelDisc(0.014, 0.01, 0.001, 8)
    tally.translate(-0.28, h + 0.3, 0.42)
    emit('deck', tally, deck, 'tally', kit.red)
  }
  rebuild()

  return {
    root,
    parts: { tower, deck },
    materials: materialSlots,
    getConfig: () => ({ ...config }),
    configure(patch) {
      if (patch.height !== undefined) config.height = Math.min(12, Math.max(6, patch.height))
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
    target: [0, 6.15, 0.1],
    distance: 3.5,
    fov: 28,
    yaw: 0.55,
    pitch: 0.14,
  })
}
