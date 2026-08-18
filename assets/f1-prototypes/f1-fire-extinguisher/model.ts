// f1-fire-extinguisher — a Lifeline-style handheld motorsport unit: a brushed-aluminum pressure vessel
// with compact valve hardware, safety pin, procedural instruction label, and a clipped black hose/nozzle.
// Static garage dressing; every visible material remains replaceable through the existing slots.

import {
  BufferGeometry,
  CylinderGeometry,
  DataTexture,
  Group,
  Mesh,
  MeshBasicMaterial,
  NearestFilter,
  RGBAFormat,
  TorusGeometry,
  UnsignedByteType,
  Vector3,
  type Material,
} from 'three/webgpu'

import {
  AXIS_X,
  acquireF1Materials,
  bevelBox,
  createF1Preview,
  disposeF1Materials,
  fillGlyphRect,
  mergeParts,
  revolve,
  taperedTube,
  tubeSection,
  writeGlyphWord,
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

function extinguisherLabelTexture(): DataTexture {
  const w = 96
  const h = 160
  const data = new Uint8Array(w * h * 4)
  const paper: [number, number, number] = [244, 245, 242]
  const ink: [number, number, number] = [14, 18, 22]
  const red: [number, number, number] = [184, 24, 34]
  fillGlyphRect(data, w, 0, 0, w, h, paper)
  writeGlyphWord(data, w, 8, 9, 'LIFELINE', red, 2)
  writeGlyphWord(data, w, 21, 34, '360', ink, 5)
  writeGlyphWord(data, w, 16, 70, 'FIRE', ink, 4)
  fillGlyphRect(data, w, 9, 102, 78, 3, red)
  for (let row = 0; row < 4; row++) {
    fillGlyphRect(data, w, 10, 116 + row * 9, 60 - row * 6, 2, ink)
  }
  const texture = new DataTexture(data, w, h, RGBAFormat, UnsignedByteType)
  texture.minFilter = NearestFilter
  texture.magFilter = NearestFilter
  texture.flipY = true
  texture.needsUpdate = true
  return texture
}

export function createModel(options: F1FireExtinguisherOptions = {}): F1FireExtinguisherInstance {
  const config: F1FireExtinguisherConfig = {}

  const bundle = acquireF1Materials()
  const kit = bundle.materials
  const materialSlots: Record<Slot, Material> = {
    body: options.materials?.body ?? kit.steel,
    hardware: options.materials?.hardware ?? kit.graphite,
    hose: options.materials?.hose ?? kit.ink,
  }

  const root = new Group()
  root.name = 'f1-fire-extinguisher'
  const bodyGroup = new Group(); bodyGroup.name = 'body'
  const hoseGroup = new Group(); hoseGroup.name = 'hose'
  root.add(bodyGroup, hoseGroup)

  const generated: BufferGeometry[] = []
  const extras: Material[] = []
  const textures: DataTexture[] = []
  const meshesBySlot: Record<Slot, Mesh[]> = { body: [], hardware: [], hose: [] }

  const releaseGenerated = (): void => {
    for (const group of [bodyGroup, hoseGroup]) group.clear()
    for (const geometry of generated) geometry.dispose()
    generated.length = 0
    for (const texture of textures) texture.dispose()
    textures.length = 0
    for (const material of extras) material.dispose()
    extras.length = 0
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

    // The pressure vessel is exactly 375 x 108 mm (3.47:1). A tight shoulder preserves the long
    // parallel-sided mass; the doubled lower profile forms the rolled base rim visible in the reference.
    emit('body', revolve(
      [
        [0.000, 0.047],
        [0.020, 0.054],
        [0.055, 0.054],
        [0.075, 0.0525],
        [0.840, 0.0525],
        [0.890, 0.052],
        [0.940, 0.041],
        [0.980, 0.027],
        [1.000, 0.022],
      ],
      { yBot: 0, yTop: 0.375, segments: 40 },
    ), bodyGroup, 'brushed-aluminum-cylinder')

    const labelTexture = extinguisherLabelTexture()
    textures.push(labelTexture)
    const labelMaterial = new MeshBasicMaterial({
      name: 'f1-kit / lifeline extinguisher label',
      map: labelTexture,
      toneMapped: false,
    })
    extras.push(labelMaterial)
    const labelGeometry = new CylinderGeometry(
      0.0545, 0.0545, 0.158, 24, 1, true, -0.88, 1.76,
    )
    labelGeometry.translate(0, 0.205, 0)
    generated.push(labelGeometry)
    const label = new Mesh(labelGeometry, labelMaterial)
    label.name = 'lifeline-label'
    label.castShadow = false
    bodyGroup.add(label)

    const hardware: BufferGeometry[] = []
    hardware.push(tubeSection(0.018, 0.027, [0, 0.3885, 0], [0, 1, 0], 18))

    const valve = bevelBox(0.052, 0.026, 0.040, 0.004)
    valve.translate(-0.003, 0.414, 0)
    hardware.push(valve)

    // Side outlet coupling, compact fixed handle, and sprung lever are scaled from the photo rather
    // than enlarged for readability.
    hardware.push(tubeSection(0.014, 0.040, [0.047, 0.413, 0], AXIS_X, 16))
    const fixedHandle = bevelBox(0.078, 0.012, 0.020, 0.003)
    fixedHandle.rotateZ(-0.08)
    fixedHandle.translate(0.018, 0.438, 0)
    hardware.push(fixedHandle)
    const squeezeLever = bevelBox(0.084, 0.009, 0.018, 0.002)
    squeezeLever.rotateZ(0.14)
    squeezeLever.translate(0.023, 0.456, 0)
    hardware.push(squeezeLever)

    const gauge = new CylinderGeometry(0.012, 0.012, 0.008, 18)
    gauge.rotateX(Math.PI / 2)
    gauge.translate(-0.020, 0.419, 0.024)
    hardware.push(gauge)

    const pin = tubeSection(0.002, 0.036, [0.013, 0.438, 0.022], AXIS_X, 8)
    hardware.push(pin)
    const pinRing = new TorusGeometry(0.010, 0.0018, 6, 20)
    pinRing.translate(0.031, 0.438, 0.022)
    hardware.push(pinRing)
    const seal = bevelBox(0.010, 0.022, 0.003, 0.001)
    seal.rotateZ(0.20)
    seal.translate(0.035, 0.419, 0.024)
    hardware.push(seal)

    // The hose exits the side coupling, follows the vessel, and parks its nozzle in a body-mounted clip.
    emit('hose', taperedTube([
      new Vector3(0.067, 0.413, 0),
      new Vector3(0.092, 0.355, 0.018),
      new Vector3(0.086, 0.270, 0.012),
      new Vector3(0.070, 0.190, 0.010),
    ], 0.006, 8), hoseGroup, 'hose')

    const holder = bevelBox(0.020, 0.038, 0.024, 0.003)
    holder.translate(0.058, 0.168, 0.006)
    hardware.push(holder)
    hardware.push(tubeSection(0.009, 0.085, [0.070, 0.137, 0.010], [0, 1, 0], 12))
    emit('hardware', mergeParts(hardware, 'valve-and-fittings'), bodyGroup, 'valve')
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
