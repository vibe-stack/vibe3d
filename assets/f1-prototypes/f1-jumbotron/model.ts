// f1-jumbotron — a trackside screen on a steel frame. The face is a material slot, not a live feed.

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

type Slot = 'frame' | 'screen' | 'leg'

export interface F1JumbotronConfig {
  width: number
}

export interface F1JumbotronOptions extends Partial<F1JumbotronConfig> {
  materials?: Partial<Record<Slot, Material>>
}

export interface F1JumbotronInstance {
  readonly root: Group
  readonly parts: { frame: Group; screen: Group }
  readonly materials: Readonly<Record<Slot, Material>>
  getConfig(): Readonly<F1JumbotronConfig>
  configure(patch: Partial<F1JumbotronConfig>): void
  setMaterial(slot: Slot, material: Material): void
  update(deltaSeconds: number): void
  dispose(): void
}

const defaults: F1JumbotronConfig = { width: 8 }

export function createModel(options: F1JumbotronOptions = {}): F1JumbotronInstance {
  const config: F1JumbotronConfig = { width: Math.max(3, options.width ?? defaults.width) }

  const bundle = acquireF1Materials()
  const kit = bundle.materials
  const materialSlots: Record<Slot, Material> = {
    frame: options.materials?.frame ?? kit.graphite,
    screen: options.materials?.screen ?? kit.ink,
    leg: options.materials?.leg ?? kit.slate,
  }

  const root = new Group()
  root.name = 'f1-jumbotron'
  const frame = new Group(); frame.name = 'frame'
  const screen = new Group(); screen.name = 'screen'
  root.add(frame, screen)

  const generated: BufferGeometry[] = []
  const meshesBySlot: Record<Slot, Mesh[]> = { frame: [], screen: [], leg: [] }

  const releaseGenerated = (): void => {
    for (const group of [frame, screen]) group.clear()
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
    const w = config.width
    const h = w * 0.45
    const y = 3.4 + h / 2
    const half = w / 2
    const legs: BufferGeometry[] = []
    for (const sx of [-1, 1] as const) {
      legs.push(member(new Vector3(sx * half * 0.72, 0, 0), new Vector3(sx * half * 0.72, y - h / 2, 0), 0.08, 8))
    }
    emit('leg', mergeParts(legs, 'legs'), frame, 'legs')
    const bezel = bevelBox(w + 0.28, h + 0.28, 0.22, 0.03)
    bezel.translate(0, y, 0)
    emit('frame', bezel, frame, 'bezel')
    const panel = bevelBox(w, h, 0.08, 0.01)
    panel.translate(0, y, 0.12)
    emit('screen', panel, screen, 'panel')
  }
  rebuild()

  return {
    root,
    parts: { frame, screen },
    materials: materialSlots,
    getConfig: () => ({ ...config }),
    configure(patch) {
      if (patch.width !== undefined) config.width = Math.max(3, patch.width)
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
  return createF1Preview(createModel(), { aspect, target: [0, 4.2, 0], distance: 16, fov: 34 })
}
