// f1-fire-extinguisher — a handheld dry-powder unit: a domed cylinder body (lathe revolve) with a
// valve/handle head and a curved hose sweeping down to a nozzle. Static garage-dressing prop. The
// safety-red body is a universal fire-equipment convention (not team branding) and is the kit's only
// use of RED-500, still exposed as the `body` material slot.

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
  mergeParts,
  revolve,
  taperedTube,
  tubeSection,
} from '../f1-kit-core/index.ts'

type Slot = 'body' | 'hardware' | 'hose'

export interface F1FireExtinguisherConfig {}

export interface F1FireExtinguisherOptions extends Partial<F1FireExtinguisherConfig> {
  materials?: Partial<Record<Slot, Material>>
}

export interface F1FireExtinguisherInstance {
  readonly root: Group
  readonly parts: { body: Group; hose: Group }
  readonly materials: Readonly<Record<Slot, Material>>
  getConfig(): Readonly<F1FireExtinguisherConfig>
  configure(patch: Partial<F1FireExtinguisherConfig>): void
  setMaterial(slot: Slot, material: Material): void
  update(deltaSeconds: number): void
  dispose(): void
}

export function createModel(options: F1FireExtinguisherOptions = {}): F1FireExtinguisherInstance {
  const config: F1FireExtinguisherConfig = {}

  const bundle = acquireF1Materials()
  const kit = bundle.materials
  const materialSlots: Record<Slot, Material> = {
    body: options.materials?.body ?? kit.red,
    hardware: options.materials?.hardware ?? kit.graphite,
    hose: options.materials?.hose ?? kit.ink,
  }

  const root = new Group()
  root.name = 'f1-fire-extinguisher'
  const bodyGroup = new Group(); bodyGroup.name = 'body'
  const hoseGroup = new Group(); hoseGroup.name = 'hose'
  root.add(bodyGroup, hoseGroup)

  const generated: BufferGeometry[] = []
  const meshesBySlot: Record<Slot, Mesh[]> = { body: [], hardware: [], hose: [] }

  const releaseGenerated = (): void => {
    for (const group of [bodyGroup, hoseGroup]) group.clear()
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

    // Handheld unit: ~Ø150 mm body, ~0.38 m tall before the valve. The foot starts at a real radius so
    // `revolve` does not clamp a 0-width pole into a degenerate fan.
    emit('body', revolve(
      [
        [0.00, 0.068],
        [0.04, 0.075],
        [0.10, 0.075],
        [0.82, 0.075],
        [0.90, 0.058],
        [0.96, 0.036],
        [1.00, 0.022],
      ],
      { yBot: 0, yTop: 0.38, segments: 32 },
    ), bodyGroup, 'cylinder')

    const hardware: BufferGeometry[] = []
    const neck = tubeSection(0.028, 0.05, [0, 0.395, 0], [0, 1, 0], 16)
    hardware.push(neck)
    const valve = bevelBox(0.08, 0.05, 0.055, 0.006)
    valve.translate(0, 0.435, 0)
    hardware.push(valve)
    const handleBar = bevelBox(0.11, 0.016, 0.032, 0.003)
    handleBar.rotateZ(0.12)
    handleBar.translate(0.012, 0.475, 0)
    hardware.push(handleBar)
    emit('hardware', mergeParts(hardware, 'head'), bodyGroup, 'valve')

    emit('hose', taperedTube([
      new Vector3(0.038, 0.445, 0.012),
      new Vector3(0.12, 0.38, 0.036),
      new Vector3(0.115, 0.22, -0.024),
      new Vector3(0.06, 0.12, 0.03),
    ], 0.012, 8), hoseGroup, 'hose')

    const nozzle = tubeSection(0.014, 0.07, [0.06, 0.11, 0.03], [0.15, -0.85, 0.5], 10)
    emit('hardware', nozzle, hoseGroup, 'nozzle')
  }
  rebuild()

  return {
    root,
    parts: { body: bodyGroup, hose: hoseGroup },
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
  return createF1Preview(createModel(), { aspect, target: [0.05, 0.22, 0], distance: 1.05 })
}
