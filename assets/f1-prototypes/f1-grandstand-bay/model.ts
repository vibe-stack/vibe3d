// f1-grandstand-bay — one lofted seating bay with a roof canopy. configure({ rows }).

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

type Slot = 'structure' | 'seat' | 'roof'

export interface F1GrandstandBayConfig {
  rows: number
  width: number
}

export interface F1GrandstandBayOptions extends Partial<F1GrandstandBayConfig> {
  materials?: Partial<Record<Slot, Material>>
}

export interface F1GrandstandBayInstance {
  readonly root: Group
  readonly parts: { bowl: Group; roof: Group }
  readonly materials: Readonly<Record<Slot, Material>>
  getConfig(): Readonly<F1GrandstandBayConfig>
  configure(patch: Partial<F1GrandstandBayConfig>): void
  setMaterial(slot: Slot, material: Material): void
  update(deltaSeconds: number): void
  dispose(): void
}

const defaults: F1GrandstandBayConfig = { rows: 8, width: 10 }

export function createModel(options: F1GrandstandBayOptions = {}): F1GrandstandBayInstance {
  const config: F1GrandstandBayConfig = {
    rows: Math.max(4, Math.round(options.rows ?? defaults.rows)),
    width: Math.max(4, options.width ?? defaults.width),
  }

  const bundle = acquireF1Materials()
  const kit = bundle.materials
  const materialSlots: Record<Slot, Material> = {
    structure: options.materials?.structure ?? kit.graphite,
    seat: options.materials?.seat ?? kit.cobalt,
    roof: options.materials?.roof ?? kit.shell,
  }

  const root = new Group()
  root.name = 'f1-grandstand-bay'
  const bowl = new Group(); bowl.name = 'bowl'
  const roof = new Group(); roof.name = 'roof'
  root.add(bowl, roof)

  const generated: BufferGeometry[] = []
  const meshesBySlot: Record<Slot, Mesh[]> = { structure: [], seat: [], roof: [] }

  const releaseGenerated = (): void => {
    for (const group of [bowl, roof]) group.clear()
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
    const { rows, width } = config
    const rise = 0.42
    const tread = 0.85
    const struct: BufferGeometry[] = []
    const seats: BufferGeometry[] = []
    const depth = rows * tread
    const wall = bevelBox(width + 0.4, rows * rise + 0.4, 0.22, 0.03)
    wall.translate(0, (rows * rise + 0.4) / 2, -depth / 2 - 0.1)
    struct.push(wall)
    for (let r = 0; r < rows; r++) {
      const z = depth / 2 - r * tread - tread / 2
      const y = 0.18 + r * rise
      const step = bevelBox(width, 0.16, tread - 0.08, 0.02)
      step.translate(0, y, z)
      struct.push(step)
      const bench = bevelBox(width - 0.3, 0.08, 0.38, 0.015)
      bench.translate(0, y + 0.18, z - 0.12)
      seats.push(bench)
    }
    emit('structure', mergeParts(struct, 'bowl'), bowl, 'bowl')
    emit('seat', mergeParts(seats, 'seats'), bowl, 'seats')

    const roofY = rows * rise + 2.2
    const roofParts: BufferGeometry[] = []
    const canopy = bevelBox(width + 0.6, 0.12, depth + 1.2, 0.03)
    canopy.translate(0, roofY, 0)
    roofParts.push(canopy)
    for (const sx of [-1, 1] as const) {
      roofParts.push(member(
        new Vector3(sx * width * 0.42, rows * rise + 0.4, -depth / 2),
        new Vector3(sx * width * 0.42, roofY, -depth / 2),
        0.07,
        8,
      ))
    }
    emit('roof', mergeParts(roofParts, 'roof'), roof, 'roof')
  }
  rebuild()

  return {
    root,
    parts: { bowl, roof },
    materials: materialSlots,
    getConfig: () => ({ ...config }),
    configure(patch) {
      if (patch.rows !== undefined) config.rows = Math.max(4, Math.round(patch.rows))
      if (patch.width !== undefined) config.width = Math.max(4, patch.width)
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
  return createF1Preview(createModel({ rows: 6, width: 8 }), {
    aspect,
    target: [0, 2.4, 0],
    distance: 22,
    fov: 36,
  })
}
