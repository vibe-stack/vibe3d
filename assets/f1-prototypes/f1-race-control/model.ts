// f1-race-control — glass control tower with roof deck and antennas.

import {
  BufferGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
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

export interface F1RaceControlConfig {
  height: number
}

export interface F1RaceControlOptions extends Partial<F1RaceControlConfig> {
  materials?: Partial<Record<Slot, Material>>
}

export interface F1RaceControlInstance {
  readonly root: Group
  readonly parts: { tower: Group; deck: Group }
  readonly materials: Readonly<Record<Slot, Material>>
  getConfig(): Readonly<F1RaceControlConfig>
  configure(patch: Partial<F1RaceControlConfig>): void
  setMaterial(slot: Slot, material: Material): void
  update(deltaSeconds: number): void
  dispose(): void
}

const defaults: F1RaceControlConfig = { height: 18 }

export function createModel(options: F1RaceControlOptions = {}): F1RaceControlInstance {
  const config: F1RaceControlConfig = {
    height: Math.max(8, options.height ?? defaults.height),
  }

  const bundle = acquireF1Materials()
  const kit = bundle.materials
  const extras: Material[] = []
  const glassMat = new MeshStandardMaterial({
    name: 'f1-kit / race control glass',
    color: 0x0a1820,
    roughness: 0.06,
    metalness: 0.15,
    transparent: true,
    opacity: 0.42,
  })
  extras.push(glassMat)

  const materialSlots: Record<Slot, Material> = {
    tower: options.materials?.tower ?? kit.shell,
    deck: options.materials?.deck ?? kit.graphite,
  }

  const root = new Group(); root.name = 'f1-race-control'
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
    const w = 4.2
    const d = 6.8
    const shellParts: BufferGeometry[] = []
    for (const sx of [-1, 1] as const) {
      shellParts.push(bevelBox(0.14, h, d, 0.012).translate(sx * (w / 2 - 0.07), h / 2, 0))
    }
    for (const sz of [-1, 1] as const) {
      shellParts.push(bevelBox(w - 0.28, h, 0.14, 0.012).translate(0, h / 2, sz * (d / 2 - 0.07)))
    }
    emit('tower', mergeParts(shellParts, 'frame'), tower, 'frame', kit.slate)
    const glass = bevelBox(w - 0.32, h - 1.2, 0.012, 0.002)
    glass.translate(0, h / 2, d / 2 - 0.08)
    emit('tower', glass, tower, 'glazing', glassMat)
    const base = bevelBox(w + 0.6, 0.18, d + 0.8, 0.012)
    base.translate(0, 0.09, 0)
    emit('tower', base, tower, 'podium', kit.graphite)

    const roof = bevelBox(w + 0.4, 0.12, d + 0.5, 0.01)
    roof.translate(0, h + 0.06, 0)
    emit('deck', roof, deck, 'roof')
    const railParts: BufferGeometry[] = []
    for (const sx of [-1, 1] as const) {
      railParts.push(member(new Vector3(sx * w / 2, h + 0.12, -d / 2), new Vector3(sx * w / 2, h + 1.0, -d / 2), 0.025, 8))
      railParts.push(member(new Vector3(sx * w / 2, h + 0.12, d / 2), new Vector3(sx * w / 2, h + 1.0, d / 2), 0.025, 8))
    }
    emit('deck', mergeParts(railParts, 'rails'), deck, 'rails', kit.steel)
    const masts: BufferGeometry[] = []
    for (const [x, z] of [[-1.2, 0], [1.2, 0], [0, 1.8]] as const) {
      const mast = new CylinderGeometry(0.012, 0.016, 1.4, 8)
      mast.translate(x, h + 0.82, z)
      masts.push(mast)
    }
    emit('deck', mergeParts(masts, 'antennas'), deck, 'antennas', kit.steel)
  }
  rebuild()

  return {
    root,
    parts: { tower, deck },
    materials: materialSlots,
    getConfig: () => ({ ...config }),
    configure(patch) {
      if (patch.height !== undefined) config.height = Math.max(8, patch.height)
      rebuild()
    },
    setMaterial(slot, material) {
      materialSlots[slot] = material
      for (const mesh of meshesBySlot[slot]) mesh.material = material
    },
    update: () => {},
    dispose() {
      releaseGenerated()
      for (const material of extras) material.dispose()
      disposeF1Materials(bundle)
      root.removeFromParent()
    },
  }
}

export function createPreview({ aspect }: { aspect: number; time?: number }) {
  return createF1Preview(createModel({ height: 14 }), {
    aspect,
    target: [0, 7, 0],
    distance: 22,
    fov: 34,
    yaw: 0.35,
    pitch: 0.06,
  })
}
