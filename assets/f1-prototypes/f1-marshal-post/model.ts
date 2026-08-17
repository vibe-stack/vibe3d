// f1-marshal-post — a white trackside hut, two orange marshals, and a signal flag.

import {
  BufferGeometry,
  Group,
  Mesh,
  SphereGeometry,
  type Material,
} from 'three/webgpu'

import {
  acquireF1Materials,
  bevelBox,
  createF1Preview,
  disposeF1Materials,
  mergeParts,
  tubeSection,
} from '../f1-kit-core/index.ts'

type Slot = 'hut' | 'crew' | 'flag'

export interface F1MarshalPostConfig {}

export interface F1MarshalPostOptions extends Partial<F1MarshalPostConfig> {
  materials?: Partial<Record<Slot, Material>>
}

export interface F1MarshalPostInstance {
  readonly root: Group
  readonly parts: { hut: Group; crew: Group }
  readonly materials: Readonly<Record<Slot, Material>>
  getConfig(): Readonly<F1MarshalPostConfig>
  configure(patch: Partial<F1MarshalPostConfig>): void
  setMaterial(slot: Slot, material: Material): void
  update(deltaSeconds: number): void
  dispose(): void
}

export function createModel(options: F1MarshalPostOptions = {}): F1MarshalPostInstance {
  const config: F1MarshalPostConfig = {}
  const bundle = acquireF1Materials()
  const kit = bundle.materials
  const materialSlots: Record<Slot, Material> = {
    hut: options.materials?.hut ?? kit.shell,
    crew: options.materials?.crew ?? kit.orange,
    flag: options.materials?.flag ?? kit.amber,
  }

  const root = new Group()
  root.name = 'f1-marshal-post'
  const hut = new Group(); hut.name = 'hut'
  const crew = new Group(); crew.name = 'crew'
  root.add(hut, crew)

  const generated: BufferGeometry[] = []
  const meshesBySlot: Record<Slot, Mesh[]> = { hut: [], crew: [], flag: [] }

  const releaseGenerated = (): void => {
    for (const group of [hut, crew]) group.clear()
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
    const hutParts: BufferGeometry[] = []
    const walls = bevelBox(1.6, 1.15, 1.2, 0.03)
    walls.translate(0, 0.72, 0)
    hutParts.push(walls)
    const roof = bevelBox(1.85, 0.08, 1.45, 0.02)
    roof.translate(0, 1.38, 0)
    hutParts.push(roof)
    emit('hut', mergeParts(hutParts, 'hut'), hut, 'hut')

    const crewParts: BufferGeometry[] = []
    for (const sx of [-0.55, 0.55] as const) {
      crewParts.push(tubeSection(0.11, 0.72, [sx, 0.52, 0.85], [0, 1, 0], 10))
      const head = new SphereGeometry(0.12, 12, 10)
      head.translate(sx, 1.02, 0.85)
      crewParts.push(head)
    }
    emit('crew', mergeParts(crewParts, 'crew'), crew, 'crew')

    const pole = tubeSection(0.012, 1.1, [0.55, 1.55, 0.85], [0, 1, 0], 6)
    const cloth = bevelBox(0.42, 0.28, 0.02, 0.004)
    cloth.translate(0.78, 1.95, 0.85)
    emit('flag', mergeParts([pole, cloth], 'flag'), crew, 'flag')
  }
  rebuild()

  return {
    root,
    parts: { hut, crew },
    materials: materialSlots,
    getConfig: () => ({ ...config }),
    configure() {},
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
  return createF1Preview(createModel(), { aspect, target: [0, 1.0, 0.4], distance: 4.8, fov: 32 })
}
