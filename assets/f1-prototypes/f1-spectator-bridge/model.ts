// f1-spectator-bridge — truss span with mesh sides and stairs at both ends.

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

type Slot = 'truss' | 'mesh' | 'stairs'

export interface F1SpectatorBridgeConfig {
  span: number
}

export interface F1SpectatorBridgeOptions extends Partial<F1SpectatorBridgeConfig> {
  materials?: Partial<Record<Slot, Material>>
}

export interface F1SpectatorBridgeInstance {
  readonly root: Group
  readonly parts: { truss: Group; mesh: Group; stairs: Group }
  readonly materials: Readonly<Record<Slot, Material>>
  getConfig(): Readonly<F1SpectatorBridgeConfig>
  configure(patch: Partial<F1SpectatorBridgeConfig>): void
  setMaterial(slot: Slot, material: Material): void
  update(deltaSeconds: number): void
  dispose(): void
}

const defaults: F1SpectatorBridgeConfig = { span: 12 }
const DECK_H = 3.2
const WIDTH = 2.4

export function createModel(options: F1SpectatorBridgeOptions = {}): F1SpectatorBridgeInstance {
  const config: F1SpectatorBridgeConfig = {
    span: Math.max(6, options.span ?? defaults.span),
  }

  const bundle = acquireF1Materials()
  const kit = bundle.materials
  const materialSlots: Record<Slot, Material> = {
    truss: options.materials?.truss ?? kit.steel,
    mesh: options.materials?.mesh ?? kit.graphite,
    stairs: options.materials?.stairs ?? kit.slate,
  }

  const root = new Group(); root.name = 'f1-spectator-bridge'
  const truss = new Group(); truss.name = 'truss'
  const mesh = new Group(); mesh.name = 'mesh'
  const stairs = new Group(); stairs.name = 'stairs'
  root.add(truss, mesh, stairs)

  const generated: BufferGeometry[] = []
  const meshesBySlot: Record<Slot, Mesh[]> = { truss: [], mesh: [], stairs: [] }

  const releaseGenerated = (): void => {
    truss.clear(); mesh.clear(); stairs.clear()
    for (const geometry of generated) geometry.dispose()
    generated.length = 0
    for (const slot of Object.keys(meshesBySlot) as Slot[]) meshesBySlot[slot].length = 0
  }

  const emit = (slot: Slot, geometry: BufferGeometry, group: Group, name: string): void => {
    generated.push(geometry)
    const meshObj = new Mesh(geometry, materialSlots[slot])
    meshObj.name = name
    meshObj.castShadow = true
    meshObj.receiveShadow = true
    meshesBySlot[slot].push(meshObj)
    group.add(meshObj)
  }

  const rebuild = (): void => {
    releaseGenerated()
    const span = config.span
    const half = span / 2
    const trussParts: BufferGeometry[] = []
    for (const sx of [-1, 1] as const) {
      trussParts.push(member(new Vector3(-half, 0.4, sx * WIDTH / 2), new Vector3(half, 0.4, sx * WIDTH / 2), 0.035, 10))
      trussParts.push(member(new Vector3(-half, DECK_H, sx * WIDTH / 2), new Vector3(half, DECK_H, sx * WIDTH / 2), 0.035, 10))
    }
    const bays = Math.max(4, Math.round(span / 2))
    for (let i = 0; i <= bays; i++) {
      const x = -half + (i / bays) * span
      trussParts.push(member(new Vector3(x, 0.4, -WIDTH / 2), new Vector3(x, DECK_H, -WIDTH / 2), 0.022, 8))
      trussParts.push(member(new Vector3(x, 0.4, WIDTH / 2), new Vector3(x, DECK_H, WIDTH / 2), 0.022, 8))
    }
    const deck = bevelBox(span, 0.06, WIDTH, 0.008)
    deck.translate(0, DECK_H, 0)
    trussParts.push(deck)
    emit('truss', mergeParts(trussParts, 'span'), truss, 'span')

    const meshParts: BufferGeometry[] = []
    for (const sx of [-1, 1] as const) {
      const panel = bevelBox(span - 0.4, 0.9, 0.02, 0.002)
      panel.translate(0, DECK_H + 0.5, sx * (WIDTH / 2 + 0.01))
      meshParts.push(panel)
      const ribs = Math.max(6, Math.round(span / 1.2))
      for (let i = 0; i < ribs; i++) {
        const x = -half + 0.2 + (i / Math.max(1, ribs - 1)) * (span - 0.4)
        const rib = member(
          new Vector3(x, DECK_H + 0.08, sx * WIDTH / 2),
          new Vector3(x, DECK_H + 0.92, sx * WIDTH / 2),
          0.008,
          6,
        )
        meshParts.push(rib)
      }
    }
    emit('mesh', mergeParts(meshParts, 'side-mesh'), mesh, 'side-mesh')

    const stairParts: BufferGeometry[] = []
    for (const sx of [-1, 1] as const) {
      const x0 = sx * (half + 1.2)
      const steps = 10
      for (let s = 0; s < steps; s++) {
        const tread = bevelBox(1.0, 0.05, 0.28, 0.004)
        tread.translate(x0, 0.12 + s * (DECK_H / steps), -WIDTH / 2 + s * 0.12)
        stairParts.push(tread)
      }
      stairParts.push(member(new Vector3(x0, 0.2, -WIDTH / 2), new Vector3(x0, DECK_H, -WIDTH / 2 + 1.0), 0.025, 8))
    }
    emit('stairs', mergeParts(stairParts, 'stairs'), stairs, 'stairs')
  }
  rebuild()

  return {
    root,
    parts: { truss, mesh, stairs },
    materials: materialSlots,
    getConfig: () => ({ ...config }),
    configure(patch) {
      if (patch.span !== undefined) config.span = Math.max(6, patch.span)
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
  return createF1Preview(createModel({ span: 10 }), {
    aspect,
    target: [0, 1.6, 0],
    distance: 16,
    fov: 34,
    yaw: 0.25,
    pitch: 0.1,
  })
}
