// f1-champagne — 1.5 L magnum with a wire cage. Unbranded glass.

import { BufferGeometry, Group, Mesh, Vector3, type Material } from 'three/webgpu'

import {
  CHAMPAGNE,
  acquireF1Materials,
  createF1Preview,
  disposeF1Materials,
  mergeParts,
  revolve,
  taperedTube,
} from '../f1-kit-core/index.ts'

type Slot = 'glass' | 'cage'

export interface F1ChampagneConfig {
  height: number
}

export interface F1ChampagneOptions extends Partial<F1ChampagneConfig> {
  materials?: Partial<Record<Slot, Material>>
}

export interface F1ChampagneInstance {
  readonly root: Group
  readonly parts: { glass: Group; cage: Group }
  readonly materials: Readonly<Record<Slot, Material>>
  getConfig(): Readonly<F1ChampagneConfig>
  configure(patch: Partial<F1ChampagneConfig>): void
  setMaterial(slot: Slot, material: Material): void
  update(deltaSeconds: number): void
  dispose(): void
}

const defaults: F1ChampagneConfig = { height: CHAMPAGNE.height }

export function createModel(options: F1ChampagneOptions = {}): F1ChampagneInstance {
  const config: F1ChampagneConfig = {
    height: Math.max(0.22, options.height ?? defaults.height),
  }
  const bundle = acquireF1Materials()
  const kit = bundle.materials
  const materialSlots: Record<Slot, Material> = {
    glass: options.materials?.glass ?? kit.cyan,
    cage: options.materials?.cage ?? kit.steel,
  }
  const root = new Group(); root.name = 'f1-champagne'
  const glass = new Group(); glass.name = 'glass'
  const cage = new Group(); cage.name = 'cage'
  root.add(glass, cage)
  const generated: BufferGeometry[] = []
  const meshesBySlot: Record<Slot, Mesh[]> = { glass: [], cage: [] }
  const releaseGenerated = (): void => {
    glass.clear(); cage.clear()
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
    const bottle = revolve(
      [[0, 0.18], [0.08, 0.22], [0.55, 0.24], [0.72, 0.12], [0.9, 0.07], [1, 0.06]],
      { yBot: 0, yTop: h, scaleW: h, segments: 24 },
    )
    emit('glass', bottle, glass, 'bottle')
    const wires: BufferGeometry[] = []
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2
      const r = h * 0.08
      wires.push(taperedTube([
        new Vector3(Math.cos(a) * r, h * 0.88, Math.sin(a) * r),
        new Vector3(Math.cos(a) * r * 0.6, h * 0.98, Math.sin(a) * r * 0.6),
      ], 0.003, 6))
    }
    emit('cage', mergeParts(wires, 'cage'), cage, 'cage')
  }
  rebuild()
  return {
    root,
    parts: { glass, cage },
    materials: materialSlots,
    getConfig: () => ({ ...config }),
    configure(patch) {
      if (patch.height !== undefined) config.height = Math.max(0.22, patch.height)
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
    aspect, target: [0, 0.18, 0], distance: 1.05, fov: 28, yaw: -0.4, pitch: 0.08,
  })
}
