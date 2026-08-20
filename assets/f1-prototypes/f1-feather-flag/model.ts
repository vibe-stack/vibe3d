// f1-feather-flag — sail / teardrop flag (4.5 m). Distinct from the rectangular f1-flag-pole.

import { LoftGeometry } from 'three/examples/jsm/geometries/LoftGeometry.js'
import {
  BufferGeometry,
  Group,
  Mesh,
  Vector3,
  type Material,
} from 'three/webgpu'

import {
  AXIS_Y,
  FEATHER_FLAG,
  acquireF1Materials,
  bevelBox,
  createF1Preview,
  disposeF1Materials,
  tubeSection,
} from '../f1-kit-core/index.ts'

type Slot = 'pole' | 'sail'

export interface F1FeatherFlagConfig {
  height: number
}

export interface F1FeatherFlagOptions extends Partial<F1FeatherFlagConfig> {
  materials?: Partial<Record<Slot, Material>>
}

export interface F1FeatherFlagInstance {
  readonly root: Group
  readonly parts: { pole: Group; sail: Group }
  readonly materials: Readonly<Record<Slot, Material>>
  getConfig(): Readonly<F1FeatherFlagConfig>
  configure(patch: Partial<F1FeatherFlagConfig>): void
  setMaterial(slot: Slot, material: Material): void
  update(deltaSeconds: number): void
  dispose(): void
}

const defaults: F1FeatherFlagConfig = { height: FEATHER_FLAG.height }

function sailOutline(h: number): Array<readonly [number, number]> {
  return [
    [0.00, 0.18 * h],
    [0.10 * h, 0.28 * h],
    [0.16 * h, 0.44 * h],
    [0.15 * h, 0.62 * h],
    [0.10 * h, 0.80 * h],
    [0.045 * h, 0.93 * h],
    [0.012 * h, h],
    [0.00, 0.97 * h],
  ]
}

export function createModel(options: F1FeatherFlagOptions = {}): F1FeatherFlagInstance {
  const config: F1FeatherFlagConfig = {
    height: Math.max(2.5, options.height ?? defaults.height),
  }
  const bundle = acquireF1Materials()
  const kit = bundle.materials
  const materialSlots: Record<Slot, Material> = {
    pole: options.materials?.pole ?? kit.graphite,
    sail: options.materials?.sail ?? kit.cobalt,
  }
  const root = new Group(); root.name = 'f1-feather-flag'
  const pole = new Group(); pole.name = 'pole'
  const sail = new Group(); sail.name = 'sail'
  root.add(pole, sail)
  const generated: BufferGeometry[] = []
  const meshesBySlot: Record<Slot, Mesh[]> = { pole: [], sail: [] }
  const releaseGenerated = (): void => {
    pole.clear(); sail.clear()
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
    emit('pole', tubeSection(0.018, h, [0, h / 2, 0], AXIS_Y, 10), pole, 'shaft')
    const base = bevelBox(0.28, 0.05, 0.28, 0.006)
    base.translate(0, 0.025, 0)
    emit('pole', base, pole, 'base')
    const outline = sailOutline(h)
    const half = 0.004
    const rings = [-half, half].map((z) => outline.map(([x, y]) => new Vector3(x, y, z)))
    emit('sail', new LoftGeometry(rings, { closed: true, capStart: true, capEnd: true }), sail, 'cloth')
  }
  rebuild()
  return {
    root,
    parts: { pole, sail },
    materials: materialSlots,
    getConfig: () => ({ ...config }),
    configure(patch) {
      if (patch.height !== undefined) config.height = Math.max(2.5, patch.height)
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
    aspect, target: [0.2, 2.2, 0], distance: 8.0, fov: 28, yaw: 0.45, pitch: 0.08,
  })
}
