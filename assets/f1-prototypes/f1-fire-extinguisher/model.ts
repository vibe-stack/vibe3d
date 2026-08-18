// f1-fire-extinguisher — a handheld dry-powder unit: a domed cylinder body (lathe revolve) with a
// valve/handle head and a curved hose sweeping down to a nozzle. Static garage-dressing prop. The
// safety-red body is a universal fire-equipment convention (not team branding) and is the kit's only
// use of RED-500, still exposed as the `body` material slot.

import {
  BufferGeometry,
  CylinderGeometry,
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

    // Lifeline's FIA handheld is 375 mm long by 108 mm diameter. The lower protective foot and domed
    // shoulder are included in that measured envelope; the valve and levers sit above it.
    emit('body', revolve(
      [
        [0.00, 0.047],
        [0.035, 0.054],
        [0.10, 0.054],
        [0.78, 0.054],
        [0.88, 0.050],
        [0.95, 0.034],
        [1.00, 0.021],
      ],
      { yBot: 0, yTop: 0.30, segments: 32 },
    ), bodyGroup, 'cylinder')

    const hardware: BufferGeometry[] = []
    hardware.push(tubeSection(0.021, 0.036, [0, 0.318, 0], [0, 1, 0], 16))
    const valve = bevelBox(0.066, 0.040, 0.048, 0.006)
    valve.translate(-0.004, 0.346, 0)
    hardware.push(valve)

    // Fixed carry handle and sprung squeeze lever: two separated blades are the key handheld cue.
    const fixedHandle = bevelBox(0.105, 0.018, 0.026, 0.004)
    fixedHandle.rotateZ(-0.10)
    fixedHandle.translate(0.024, 0.370, 0)
    hardware.push(fixedHandle)
    const squeezeLever = bevelBox(0.112, 0.013, 0.024, 0.003)
    squeezeLever.rotateZ(0.15)
    squeezeLever.translate(0.030, 0.395, 0)
    hardware.push(squeezeLever)

    // Pressure gauge faces the operator and projects far enough to remain readable in silhouette.
    const gauge = new CylinderGeometry(0.018, 0.018, 0.012, 16)
    gauge.rotateX(Math.PI / 2)
    gauge.translate(-0.038, 0.353, 0.030)
    hardware.push(gauge)
    emit('hardware', mergeParts(hardware, 'head'), bodyGroup, 'valve')

    emit('hose', taperedTube([
      new Vector3(0.030, 0.346, -0.006),
      new Vector3(0.082, 0.305, 0.022),
      new Vector3(0.080, 0.205, -0.010),
      new Vector3(0.052, 0.125, 0.018),
    ], 0.008, 8), hoseGroup, 'hose')

    const nozzle = tubeSection(0.011, 0.065, [0.052, 0.115, 0.018], [0.15, -0.85, 0.5], 10)
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
