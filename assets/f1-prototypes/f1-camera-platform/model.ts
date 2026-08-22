// f1-camera-platform — scaffold deck with kick plates, ladder, and a broadcast camera
// (hood + lens). Preview frames the head, not empty legs.

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
  bevelDisc,
  createF1Preview,
  disposeF1Materials,
  loftRoundedBox,
  member,
  mergeParts,
  tubeSection,
  AXIS_Z,
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
    const w = 2.4
    const d = 1.8
    const corners: Array<readonly [number, number]> = [
      [-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2],
    ]
    const legParts: BufferGeometry[] = []
    for (const [x, z] of corners) {
      legParts.push(member(new Vector3(x, 0.06, z), new Vector3(x, h, z), 0.03, 8))
    }
    for (const y of [h * 0.35, h * 0.7] as const) {
      for (const sz of [-1, 1] as const) {
        legParts.push(member(new Vector3(-w / 2, y, sz * d / 2), new Vector3(w / 2, y, sz * d / 2), 0.02, 6))
      }
      for (const sx of [-1, 1] as const) {
        legParts.push(member(new Vector3(sx * w / 2, y, -d / 2), new Vector3(sx * w / 2, y, d / 2), 0.02, 6))
      }
    }
    for (const sz of [-1, 1] as const) {
      legParts.push(member(new Vector3(-w / 2, h * 0.35, sz * d / 2), new Vector3(w / 2, h * 0.7, sz * d / 2), 0.016, 6))
    }
    emit('scaffold', mergeParts(legParts, 'legs'), scaffold, 'legs')

    const rungs: BufferGeometry[] = []
    const steps = Math.max(5, Math.round(h / 0.32))
    for (let i = 0; i < steps; i++) {
      const y = 0.18 + (i / Math.max(1, steps - 1)) * (h - 0.25)
      rungs.push(member(new Vector3(-0.18, y, -d / 2 - 0.08), new Vector3(0.18, y, -d / 2 - 0.08), 0.012, 6))
    }
    rungs.push(member(new Vector3(-0.18, 0.08, -d / 2 - 0.08), new Vector3(-0.18, h, -d / 2 - 0.08), 0.016, 6))
    rungs.push(member(new Vector3(0.18, 0.08, -d / 2 - 0.08), new Vector3(0.18, h, -d / 2 - 0.08), 0.016, 6))
    emit('scaffold', mergeParts(rungs, 'ladder'), scaffold, 'ladder')

    const platform = bevelBox(w, 0.06, d, 0.006)
    platform.translate(0, h, 0)
    emit('deck', platform, deck, 'platform', kit.graphite)
    const kick: BufferGeometry[] = []
    for (const sz of [-1, 1] as const) {
      kick.push(bevelBox(w, 0.12, 0.03, 0.004).translate(0, h + 0.08, sz * (d / 2 - 0.01)))
    }
    for (const sx of [-1, 1] as const) {
      kick.push(bevelBox(0.03, 0.12, d, 0.004).translate(sx * (w / 2 - 0.01), h + 0.08, 0))
    }
    emit('deck', mergeParts(kick, 'kick'), deck, 'kick', kit.ink)

    const railParts: BufferGeometry[] = []
    for (const [x, z] of corners) {
      railParts.push(member(new Vector3(x, h, z), new Vector3(x, h + 0.9, z), 0.018, 8))
    }
    for (const sz of [-1, 1] as const) {
      railParts.push(member(new Vector3(-w / 2, h + 0.9, sz * d / 2), new Vector3(w / 2, h + 0.9, sz * d / 2), 0.016, 6))
      railParts.push(member(new Vector3(-w / 2, h + 0.45, sz * d / 2), new Vector3(w / 2, h + 0.45, sz * d / 2), 0.014, 6))
    }
    for (const sx of [-1, 1] as const) {
      railParts.push(member(new Vector3(sx * w / 2, h + 0.9, -d / 2), new Vector3(sx * w / 2, h + 0.9, d / 2), 0.016, 6))
    }
    emit('deck', mergeParts(railParts, 'rails'), deck, 'rails', kit.steel)

    const body = loftRoundedBox(0.22, 0.16, 0.38, 0.02)
    body.translate(0, h + 0.2, 0.12)
    emit('deck', body, deck, 'camera', kit.ink)
    const hood = bevelBox(0.24, 0.04, 0.22, 0.006)
    hood.translate(0, h + 0.3, 0.18)
    emit('deck', hood, deck, 'hood', kit.ink)
    emit('deck', tubeSection(0.055, 0.16, [0, h + 0.18, 0.38], AXIS_Z, 12), deck, 'lens', kit.slate)
    const glass = bevelDisc(0.048, 0.012, 0.002, 12)
    glass.rotateX(Math.PI / 2)
    glass.translate(0, h + 0.18, 0.47)
    emit('deck', glass, deck, 'glass', kit.cyan)
    const pan = bevelBox(0.16, 0.06, 0.16, 0.006)
    pan.translate(0, h + 0.08, 0.08)
    emit('deck', pan, deck, 'pan', kit.graphite)
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
  return createF1Preview(createModel({ height: 2.2 }), {
    aspect,
    target: [0, 2.35, 0.2],
    distance: 3.6,
    fov: 28,
    yaw: 0.55,
    pitch: 0.16,
  })
}
