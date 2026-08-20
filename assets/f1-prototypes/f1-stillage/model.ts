// f1-stillage — EUR-pallet mesh cage (1.20 × 0.80 × 1.00 m).

import {
  BufferGeometry,
  Group,
  Mesh,
  Vector3,
  type Material,
} from 'three/webgpu'

import {
  STILLAGE,
  acquireF1Materials,
  bevelBox,
  createF1Preview,
  disposeF1Materials,
  member,
  mergeParts,
} from '../f1-kit-core/index.ts'

type Slot = 'cage' | 'deck'

export interface F1StillageConfig {
  count: number
}

export interface F1StillageOptions extends Partial<F1StillageConfig> {
  materials?: Partial<Record<Slot, Material>>
}

export interface F1StillageInstance {
  readonly root: Group
  readonly parts: { cage: Group; deck: Group }
  readonly materials: Readonly<Record<Slot, Material>>
  getConfig(): Readonly<F1StillageConfig>
  configure(patch: Partial<F1StillageConfig>): void
  setMaterial(slot: Slot, material: Material): void
  update(deltaSeconds: number): void
  dispose(): void
}

const defaults: F1StillageConfig = { count: 1 }
const GAP = 0.04

export function createModel(options: F1StillageOptions = {}): F1StillageInstance {
  const config: F1StillageConfig = {
    count: Math.max(1, Math.round(options.count ?? defaults.count)),
  }
  const bundle = acquireF1Materials()
  const kit = bundle.materials
  const materialSlots: Record<Slot, Material> = {
    cage: options.materials?.cage ?? kit.steel,
    deck: options.materials?.deck ?? kit.slate,
  }
  const root = new Group(); root.name = 'f1-stillage'
  const cage = new Group(); cage.name = 'cage'
  const deck = new Group(); deck.name = 'deck'
  root.add(cage, deck)
  const generated: BufferGeometry[] = []
  const meshesBySlot: Record<Slot, Mesh[]> = { cage: [], deck: [] }
  const releaseGenerated = (): void => {
    cage.clear(); deck.clear()
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
    const { width: w, depth: d, height: h } = STILLAGE
    const n = config.count
    const pitch = w + GAP
    const origin = -((n - 1) * pitch) / 2
    const cageParts: BufferGeometry[] = []
    const deckParts: BufferGeometry[] = []
    for (let i = 0; i < n; i++) {
      const cx = origin + i * pitch
      const pallet = bevelBox(w, 0.12, d, 0.008)
      pallet.translate(cx, 0.06, 0)
      deckParts.push(pallet)
      for (const sx of [-1, 1] as const) {
        for (const sz of [-1, 1] as const) {
          cageParts.push(member(
            new Vector3(cx + sx * (w / 2 - 0.03), 0.12, sz * (d / 2 - 0.03)),
            new Vector3(cx + sx * (w / 2 - 0.03), h, sz * (d / 2 - 0.03)),
            0.012,
            6,
          ))
        }
      }
      for (const y of [0.45, h]) {
        cageParts.push(member(
          new Vector3(cx - w / 2 + 0.03, y, -d / 2 + 0.03),
          new Vector3(cx + w / 2 - 0.03, y, -d / 2 + 0.03),
          0.01,
          6,
        ))
        cageParts.push(member(
          new Vector3(cx - w / 2 + 0.03, y, d / 2 - 0.03),
          new Vector3(cx + w / 2 - 0.03, y, d / 2 - 0.03),
          0.01,
          6,
        ))
        cageParts.push(member(
          new Vector3(cx - w / 2 + 0.03, y, -d / 2 + 0.03),
          new Vector3(cx - w / 2 + 0.03, y, d / 2 - 0.03),
          0.01,
          6,
        ))
        cageParts.push(member(
          new Vector3(cx + w / 2 - 0.03, y, -d / 2 + 0.03),
          new Vector3(cx + w / 2 - 0.03, y, d / 2 - 0.03),
          0.01,
          6,
        ))
      }
    }
    emit('deck', mergeParts(deckParts, 'pallets'), deck, 'pallets')
    emit('cage', mergeParts(cageParts, 'mesh'), cage, 'mesh')
  }
  rebuild()
  return {
    root,
    parts: { cage, deck },
    materials: materialSlots,
    getConfig: () => ({ ...config }),
    configure(patch) {
      if (patch.count !== undefined) config.count = Math.max(1, Math.round(patch.count))
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
  return createF1Preview(createModel({ count: 1 }), {
    aspect, target: [0, 0.5, 0], distance: 3.4, fov: 28, yaw: 0.55, pitch: 0.18,
  })
}
