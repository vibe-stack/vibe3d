// f1-sector-gantry — compact overhead truss with a blank sector fascia plate.

import {
  BufferGeometry,
  DataTexture,
  Group,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  Vector3,
  type Material,
} from 'three/webgpu'

import {
  LAYER_CLEARANCE,
  acquireF1Materials,
  bevelBox,
  createF1Preview,
  disposeF1Materials,
  fasciaTexture,
  loftAlongX,
  member,
  mergeParts,
} from '../f1-kit-core/index.ts'

type Slot = 'truss' | 'fascia'

export interface F1SectorGantryConfig {
  span: number
  sector: number
}

export interface F1SectorGantryOptions extends Partial<F1SectorGantryConfig> {
  materials?: Partial<Record<Slot, Material>>
}

export interface F1SectorGantryInstance {
  readonly root: Group
  readonly parts: { truss: Group; fascia: Group }
  readonly materials: Readonly<Record<Slot, Material>>
  getConfig(): Readonly<F1SectorGantryConfig>
  configure(patch: Partial<F1SectorGantryConfig>): void
  setMaterial(slot: Slot, material: Material): void
  update(deltaSeconds: number): void
  dispose(): void
}

const defaults: F1SectorGantryConfig = { span: 8, sector: 1 }
const HEIGHT = 4.2

export function createModel(options: F1SectorGantryOptions = {}): F1SectorGantryInstance {
  const config: F1SectorGantryConfig = {
    span: Math.max(4, options.span ?? defaults.span),
    sector: Math.max(1, Math.round(options.sector ?? defaults.sector)),
  }

  const bundle = acquireF1Materials()
  const kit = bundle.materials
  const extras: Material[] = []
  const textures: DataTexture[] = []
  const ownsFascia = options.materials?.fascia === undefined
  const materialSlots: Record<Slot, Material> = {
    truss: options.materials?.truss ?? kit.steel,
    fascia: options.materials?.fascia ?? kit.shell,
  }

  const root = new Group(); root.name = 'f1-sector-gantry'
  const truss = new Group(); truss.name = 'truss'
  const fascia = new Group(); fascia.name = 'fascia'
  root.add(truss, fascia)

  const generated: BufferGeometry[] = []
  const meshesBySlot: Record<Slot, Mesh[]> = { truss: [], fascia: [] }

  const releaseGenerated = (): void => {
    truss.clear(); fascia.clear()
    for (const geometry of generated) geometry.dispose()
    generated.length = 0
    for (const slot of Object.keys(meshesBySlot) as Slot[]) meshesBySlot[slot].length = 0
    if (ownsFascia) {
      for (const texture of textures) texture.dispose()
      textures.length = 0
      for (const material of extras) material.dispose()
      extras.length = 0
    }
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
    const { span, sector } = config
    const half = span / 2
    const trussParts: BufferGeometry[] = []
    for (const sx of [-1, 1] as const) {
      trussParts.push(member(new Vector3(sx * half, 0.08, 0), new Vector3(sx * half, HEIGHT, 0), 0.05, 10))
      const plate = bevelBox(0.32, 0.05, 0.32, 0.008)
      plate.translate(sx * half, 0.025, 0)
      trussParts.push(plate)
    }
    const chord: Array<readonly [number, number]> = [
      [0.12, -0.12], [0.12, 0.12], [-0.12, 0.12], [-0.12, -0.12],
    ]
    const beam = loftAlongX(chord, span + 0.2, { closed: true })
    beam.translate(0, HEIGHT, 0)
    trussParts.push(beam)
    const bays = Math.max(4, Math.round(span / 1.5))
    for (let i = 0; i < bays; i++) {
      const x0 = -half + (i / bays) * span
      const x1 = -half + ((i + 1) / bays) * span
      trussParts.push(member(
        new Vector3(x0, HEIGHT - 0.08, 0.1),
        new Vector3(x1, HEIGHT - 0.08, -0.1),
        0.014,
        6,
      ))
    }
    emit('truss', mergeParts(trussParts, 'truss'), truss, 'truss')

    const back = bevelBox(span * 0.55, 0.42, 0.05, 0.006)
    back.translate(0, HEIGHT - 0.22, 0.14)
    emit('fascia', back, fascia, 'back', kit.graphite)
    const face = new PlaneGeometry(span * 0.5, 0.36)
    face.translate(0, HEIGHT - 0.22, 0.165 + LAYER_CLEARANCE * 3)
    if (ownsFascia) {
      const tex = fasciaTexture({ legend: 'SECTOR', number: String(sector) })
      textures.push(tex)
      const mat = new MeshStandardMaterial({
        name: `f1-kit / sector ${sector}`,
        map: tex,
        roughness: 0.55,
        metalness: 0.05,
      })
      extras.push(mat)
      emit('fascia', face, fascia, 'plate', mat)
    } else {
      emit('fascia', face, fascia, 'plate')
    }
  }
  rebuild()

  return {
    root,
    parts: { truss, fascia },
    materials: materialSlots,
    getConfig: () => ({ ...config }),
    configure(patch) {
      if (patch.span !== undefined) config.span = Math.max(4, patch.span)
      if (patch.sector !== undefined) config.sector = Math.max(1, Math.round(patch.sector))
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
  return createF1Preview(createModel({ span: 7, sector: 2 }), {
    aspect,
    target: [0, 3.6, 0.1],
    distance: 12,
    fov: 32,
    yaw: -0.1,
    pitch: 0.05,
  })
}
