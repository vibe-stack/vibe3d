// f1-generator-cabin — acoustic genset on skids: amber canopy, louvers, exhaust, panel.
// Not a graphite shipping box.

import { BufferGeometry, Group, Mesh, type Material } from 'three/webgpu'

import {
  acquireF1Materials,
  bevelBox,
  createF1Preview,
  disposeF1Materials,
  mergeParts,
  tubeSection,
  AXIS_Y,
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
    shell: options.materials?.shell ?? kit.amber,
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
    const len = config.length
    const y0 = 0.14
    const box = bevelBox(len, H, W, 0.02)
    box.translate(0, y0 + H / 2, 0)
    emit('shell', box, shell, 'enclosure')

    const roof = bevelBox(len + 0.08, 0.06, W + 0.08, 0.01)
    roof.translate(0, y0 + H + 0.02, 0)
    emit('shell', roof, shell, 'roof', kit.graphite)

    const louvers: BufferGeometry[] = []
    const slots = Math.max(5, Math.round(len / 0.32))
    for (let i = 0; i < slots; i++) {
      const x = -len / 2 + 0.28 + i * ((len - 0.56) / Math.max(1, slots - 1))
      const slot = bevelBox(0.22, 0.07, 0.03, 0.003)
      slot.translate(x, y0 + H * 0.58, W / 2 + 0.012)
      louvers.push(slot)
    }
    emit('shell', mergeParts(louvers, 'louvers'), shell, 'louvers', kit.ink)

    const panel = bevelBox(0.55, 0.7, 0.06, 0.008)
    panel.translate(len / 2 - 0.42, y0 + 0.85, W / 2 + 0.03)
    emit('shell', panel, shell, 'panel', kit.graphite)
    const dial = bevelBox(0.22, 0.16, 0.03, 0.004)
    dial.translate(len / 2 - 0.42, y0 + 1.05, W / 2 + 0.06)
    emit('shell', dial, shell, 'dial', kit.ink)

    emit('shell', tubeSection(0.07, 0.85, [len / 2 - 0.28, y0 + H + 0.45, -W / 2 + 0.22], AXIS_Y, 12), shell, 'exhaust', kit.slate)
    const cap = bevelBox(0.16, 0.05, 0.16, 0.006)
    cap.translate(len / 2 - 0.28, y0 + H + 0.9, -W / 2 + 0.22)
    emit('shell', cap, shell, 'rain-cap', kit.graphite)

    const hazard: BufferGeometry[] = []
    for (const sx of [-1, 1] as const) {
      const stripe = bevelBox(0.08, H * 0.7, 0.02, 0.003)
      stripe.translate(sx * (len / 2 - 0.04), y0 + H * 0.45, W / 2 + 0.012)
      hazard.push(stripe)
    }
    emit('shell', mergeParts(hazard, 'hazard'), shell, 'hazard', kit.ink)

    const skidParts: BufferGeometry[] = []
    for (const z of [-W / 2 + 0.12, W / 2 - 0.12] as const) {
      skidParts.push(bevelBox(len + 0.15, 0.1, 0.1, 0.008).translate(0, 0.05, z))
    }
    for (const x of [-len / 2 + 0.3, len / 2 - 0.3] as const) {
      skidParts.push(bevelBox(0.12, 0.08, W + 0.18, 0.006).translate(x, 0.04, 0))
    }
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
    target: [0, 1.0, 0],
    distance: 5.4,
    fov: 28,
    yaw: -0.72,
    pitch: 0.14,
  })
}
