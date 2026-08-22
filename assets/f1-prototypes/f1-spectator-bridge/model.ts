// f1-spectator-bridge — warren-truss span, walkable deck, stairs at both ends.
// Deck clears this kit's 5.5 m catch fence.

import {
  BufferGeometry,
  Group,
  Mesh,
  Vector3,
  type Material,
} from 'three/webgpu'

import {
  SPECTATOR_BRIDGE,
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
const DECK_H = SPECTATOR_BRIDGE.deckHeight
const WIDTH = SPECTATOR_BRIDGE.width
const RISE = 0.18

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

  const emit = (slot: Slot, geometry: BufferGeometry, group: Group, name: string, material?: Material): void => {
    generated.push(geometry)
    const meshObj = new Mesh(geometry, material ?? materialSlots[slot])
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
    const zL = -WIDTH / 2
    const zR = WIDTH / 2
    const trussParts: BufferGeometry[] = []
    for (const z of [zL, zR] as const) {
      trussParts.push(member(new Vector3(-half, 0.35, z), new Vector3(half, 0.35, z), 0.055, 10))
      trussParts.push(member(new Vector3(-half, DECK_H, z), new Vector3(half, DECK_H, z), 0.055, 10))
    }
    const bays = Math.max(5, Math.round(span / 1.8))
    for (let i = 0; i <= bays; i++) {
      const x = -half + (i / bays) * span
      trussParts.push(member(new Vector3(x, 0.35, zL), new Vector3(x, DECK_H, zL), 0.032, 8))
      trussParts.push(member(new Vector3(x, 0.35, zR), new Vector3(x, DECK_H, zR), 0.032, 8))
      if (i < bays) {
        const x1 = -half + ((i + 1) / bays) * span
        const a = i % 2 === 0
        trussParts.push(member(
          new Vector3(a ? x : x1, 0.35, zL),
          new Vector3(a ? x1 : x, DECK_H, zL),
          0.024,
          6,
        ))
        trussParts.push(member(
          new Vector3(a ? x : x1, 0.35, zR),
          new Vector3(a ? x1 : x, DECK_H, zR),
          0.024,
          6,
        ))
      }
    }
    emit('truss', mergeParts(trussParts, 'span'), truss, 'span')
    const deck = bevelBox(span, 0.08, WIDTH, 0.01)
    deck.translate(0, DECK_H, 0)
    emit('truss', deck, truss, 'deck', kit.slate)

    const meshParts: BufferGeometry[] = []
    for (const z of [zL, zR] as const) {
      meshParts.push(member(new Vector3(-half, DECK_H + 1.05, z), new Vector3(half, DECK_H + 1.05, z), 0.022, 8))
      meshParts.push(member(new Vector3(-half, DECK_H + 0.52, z), new Vector3(half, DECK_H + 0.52, z), 0.018, 6))
      const posts = Math.max(6, Math.round(span / 1.4))
      for (let i = 0; i <= posts; i++) {
        const x = -half + (i / posts) * span
        meshParts.push(member(new Vector3(x, DECK_H, z), new Vector3(x, DECK_H + 1.05, z), 0.016, 6))
      }
    }
    emit('mesh', mergeParts(meshParts, 'side-mesh'), mesh, 'side-mesh')

    const stairParts: BufferGeometry[] = []
    const steps = Math.max(8, Math.round(DECK_H / RISE))
    const run = 0.3
    for (const sx of [-1, 1] as const) {
      for (let s = 0; s < steps; s++) {
        const y = (s + 0.5) * (DECK_H / steps)
        const x = sx * (half + 0.12 + (steps - 1 - s) * run)
        stairParts.push(bevelBox(0.28, 0.05, 1.05, 0.004).translate(x, y, 0))
      }
      const xGround = sx * (half + 0.12 + (steps - 1) * run)
      const xDeck = sx * (half + 0.08)
      for (const z of [-0.5, 0.5] as const) {
        stairParts.push(member(new Vector3(xGround, 0.08, z), new Vector3(xDeck, DECK_H, z), 0.028, 8))
        stairParts.push(member(new Vector3(xGround, 0.95, z), new Vector3(xDeck, DECK_H + 0.95, z), 0.02, 6))
      }
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
    target: [0, 3.4, 0],
    distance: 18,
    fov: 32,
    yaw: 0.62,
    pitch: 0.18,
  })
}
