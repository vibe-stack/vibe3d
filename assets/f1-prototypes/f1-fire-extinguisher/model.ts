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
  writeGlyphWord(data, w, 6, 6, 'LIFELINE', red, 2)
  writeGlyphWord(data, w, 10, 28, 'ZERO', red, 3)
  writeGlyphWord(data, w, 18, 52, '360', ink, 5)
  writeGlyphWord(data, w, 10, 86, 'FIRE', ink, 3)
  for (let col = 0; col < 4; col++) {
    fillGlyphRect(data, w, 8 + col * 22, 118, 18, 32, ink)
    fillGlyphRect(data, w, 10 + col * 22, 120, 14, 28, paper)
    fillGlyphRect(data, w, 13 + col * 22, 128, 8, 12, red)
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
  kit.steel.roughness = 0.08
  kit.steel.metalness = 0.96
  kit.steel.color.set(0xe8eef4)
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
        [0.012, 0.0515],
        [0.028, 0.054],
        [0.048, 0.054],
        [0.064, 0.0525],
        [0.930, 0.0525],
        [0.945, 0.0500],
        [0.958, 0.0460],
        [0.970, 0.0400],
        [0.982, 0.0320],
        [0.992, 0.0250],
        [1.000, 0.0200],
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

    // Polished metal neck, left blanking coupling, right hose coupling, and gauge rim remain distinct
    // from the compact black valve core instead of reading as one oversized block.
    const fittings: BufferGeometry[] = [
      tubeSection(0.012, 0.022, [0, 0.386, 0], [0, 1, 0], 20),
      tubeSection(0.015, 0.008, [0, 0.399, 0], [0, 1, 0], 20),
      tubeSection(0.0085, 0.020, [-0.019, 0.407, 0], AXIS_X, 16),
      tubeSection(0.0085, 0.018, [0.019, 0.407, 0], AXIS_X, 16),
      tubeSection(0.0105, 0.006, [0.030, 0.407, 0], AXIS_X, 16),
    ]

    const gaugeRim = new CylinderGeometry(0.0095, 0.0095, 0.006, 20)
    gaugeRim.rotateX(Math.PI / 2)
    gaugeRim.translate(-0.006, 0.413, 0.019)
    fittings.push(gaugeRim)

    const pin = tubeSection(0.0016, 0.028, [0.013, 0.427, 0.013], [0, 0, 1], 8)
    fittings.push(pin)
    const pinRing = new TorusGeometry(0.009, 0.0015, 6, 20)
    pinRing.translate(0.026, 0.425, 0.027)
    fittings.push(pinRing)

    // A metal standoff and circular spring clip positively retain the nozzle against the vessel.
    const clipMount = bevelBox(0.012, 0.010, 0.024, 0.002)
    clipMount.translate(0.052, 0.151, 0.010)
    fittings.push(clipMount)
    const nozzleClip = new TorusGeometry(0.0115, 0.0022, 6, 18)
    nozzleClip.rotateX(Math.PI / 2)
    nozzleClip.translate(0.071, 0.151, 0.024)
    fittings.push(nozzleClip)
    emit('body', mergeParts(fittings, 'polished-fittings'), bodyGroup, 'polished-fittings')

    const hardware: BufferGeometry[] = []
    const valve = bevelBox(0.018, 0.012, 0.016, 0.002)
    valve.translate(-0.001, 0.409, 0)
    hardware.push(valve)

    const blankingCap = tubeSection(0.012, 0.020, [-0.038, 0.407, 0], AXIS_X, 16)
    hardware.push(blankingCap)
    const capFace = new CylinderGeometry(0.013, 0.013, 0.004, 16)
    capFace.rotateZ(Math.PI / 2)
    capFace.translate(-0.050, 0.407, 0)
    hardware.push(capFace)

    const fixedHandle = bevelBox(0.072, 0.010, 0.016, 0.003)
    fixedHandle.rotateZ(-0.18)
    fixedHandle.translate(0.018, 0.418, 0)
    hardware.push(fixedHandle)
    const squeezeLever = bevelBox(0.078, 0.010, 0.016, 0.003)
    squeezeLever.rotateZ(0.42)
    squeezeLever.translate(0.016, 0.448, 0)
    hardware.push(squeezeLever)

    const pivot = new CylinderGeometry(0.006, 0.006, 0.026, 12)
    pivot.rotateX(Math.PI / 2)
    pivot.translate(-0.010, 0.426, 0)
    hardware.push(pivot)
    const gaugeFace = new CylinderGeometry(0.0075, 0.0075, 0.007, 16)
    gaugeFace.rotateX(Math.PI / 2)
    gaugeFace.translate(-0.006, 0.413, 0.020)
    hardware.push(gaugeFace)

    const sealMaterial = new MeshBasicMaterial({
      name: 'f1-kit / extinguisher tamper seal',
      color: 0xd9252e,
      toneMapped: false,
    })
    extras.push(sealMaterial)
    const sealGeometry = bevelBox(0.011, 0.020, 0.002, 0.001)
    sealGeometry.rotateZ(0.22)
    sealGeometry.translate(0.028, 0.405, 0.028)
    generated.push(sealGeometry)
    const seal = new Mesh(sealGeometry, sealMaterial)
    seal.name = 'tamper-seal'
    seal.castShadow = true
    bodyGroup.add(seal)

    // The hose terminates in a tapered, flared nozzle visibly captured by the polished retaining clip.
    emit('hose', taperedTube([
      new Vector3(0.033, 0.407, 0),
      new Vector3(0.073, 0.367, 0.016),
      new Vector3(0.082, 0.300, 0.022),
      new Vector3(0.078, 0.225, 0.024),
      new Vector3(0.071, 0.187, 0.024),
    ], 0.005, 8), hoseGroup, 'hose')

    const nozzle = new CylinderGeometry(0.006, 0.010, 0.075, 12)
    nozzle.translate(0.071, 0.146, 0.024)
    hardware.push(nozzle)
    const nozzleMouth = new CylinderGeometry(0.010, 0.013, 0.024, 12)
    nozzleMouth.translate(0.071, 0.097, 0.024)
    hardware.push(nozzleMouth)
    emit('hardware', mergeParts(hardware, 'compact-valve-and-nozzle'), bodyGroup, 'valve')
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
