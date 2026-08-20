// f1-generator-cabin — acoustic enclosure box on skids.

import { BufferGeometry, Group, Mesh, type Material } from 'three/webgpu'

import {
  acquireF1Materials,
  bevelBox,
  createF1Preview,
  disposeF1Materials,
  mergeParts,
} from '../f1-kit-core/index.ts'

type Slot = 'shell' | 'skid'

export interface F1GeneratorCabinConfig {
  length: number
}

export interface F1GeneratorCabinOptions extends Partial<F1GeneratorCabinConfig> {
  materials?: Partial<Record<Slot, Material>>
}

export interface F1GeneratorCabinInstance {
  readonly root: Group
  readonly parts: { shell: Group; skid: Group }
  readonly materials: Readonly<Record<Slot, Material>>
  getConfig(): Readonly<F1GeneratorCabinConfig>
  configure(patch: Partial<F1GeneratorCabinConfig>): void
  setMaterial(slot: Slot, material: Material): void
  update(deltaSeconds: number): void
  dispose(): void
}

const defaults: F1GeneratorCabinConfig = { length: 3.6 }
const W = 1.4
const H = 1.8

export function createModel(options: F1GeneratorCabinOptions = {}): F1GeneratorCabinInstance {
  const config: F1GeneratorCabinConfig = {
    length: Math.max(2, options.length ?? defaults.length),
  }

  const bundle = acquireF1Materials()
  const kit = bundle.materials
  const materialSlots: Record<Slot, Material> = {
    shell: options.materials?.shell ?? kit.graphite,
    skid: options.materials?.skid ?? kit.steel,
  }

  const root = new Group(); root.name = 'f1-generator-cabin'
  const shell = new Group(); shell.name = 'shell'
  const skid = new Group(); skid.name = 'skid'
  root.add(shell, skid)

  const generated: BufferGeometry[] = []
  const meshesBySlot: Record<Slot, Mesh[]> = { shell: [], skid: [] }

  const releaseGenerated = (): void => {
    shell.clear(); skid.clear()
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
    const len = config.length
    const box = bevelBox(len, H, W, 0.015)
    box.translate(0, H / 2 + 0.12, 0)
    emit('shell', box, shell, 'enclosure')
    const louvers: BufferGeometry[] = []
    const slots = Math.max(4, Math.round(len / 0.45))
    for (let i = 0; i < slots; i++) {
      const x = -len / 2 + 0.25 + i * ((len - 0.5) / Math.max(1, slots - 1))
      const slot = bevelBox(0.28, 0.08, 0.02, 0.002)
      slot.translate(x, H * 0.55 + 0.12, W / 2 + 0.01)
      louvers.push(slot)
    }
    emit('shell', mergeParts(louvers, 'louvers'), shell, 'louvers', kit.slate)
    const skidParts: BufferGeometry[] = []
    for (const x of [-len / 2 + 0.25, len / 2 - 0.25] as const) {
      skidParts.push(bevelBox(0.12, 0.08, W + 0.2, 0.006).translate(x, 0.04, 0))
    }
    skidParts.push(bevelBox(len - 0.3, 0.06, 0.08, 0.004).translate(0, 0.03, W / 2 + 0.04))
    skidParts.push(bevelBox(len - 0.3, 0.06, 0.08, 0.004).translate(0, 0.03, -(W / 2 + 0.04)))
    emit('skid', mergeParts(skidParts, 'skids'), skid, 'skids')
  }
  rebuild()

  return {
    root,
    parts: { shell, skid },
    materials: materialSlots,
    getConfig: () => ({ ...config }),
    configure(patch) {
      if (patch.length !== undefined) config.length = Math.max(2, patch.length)
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
  return createF1Preview(createModel({ length: 3 }), {
    aspect,
    target: [0, 0.9, 0],
    distance: 5.5,
    fov: 28,
    yaw: -0.65,
    pitch: 0.1,
  })
}
