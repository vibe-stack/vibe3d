// f1-kerb — FIA rumble-strip: one lofted ~80 mm trapezoid with 45° painted stripes as
// 3D bars on the top face (LoftGeometry UVs smear a DataTexture at contact-sheet scale).
// configure({ modules }) sets how many 0.4 m modules long the run is.

import {
  BufferGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  type Material,
} from 'three/webgpu'

import {
  TOKEN,
  acquireF1Materials,
  bevelBox,
  createF1Preview,
  disposeF1Materials,
  loftAlongX,
  mergeParts,
  uvAlongX,
} from '../f1-kit-core/index.ts'

type Slot = 'shell' | 'paint'

export interface F1KerbConfig {
  modules: number
}

export interface F1KerbOptions extends Partial<F1KerbConfig> {
  materials?: Partial<Record<Slot, Material>>
}

export interface F1KerbInstance {
  readonly root: Group
  readonly parts: { kerb: Group }
  readonly materials: Readonly<Record<Slot, Material>>
  getConfig(): Readonly<F1KerbConfig>
  configure(patch: Partial<F1KerbConfig>): void
  setMaterial(slot: Slot, material: Material): void
  update(deltaSeconds: number): void
  dispose(): void
}

const defaults: F1KerbConfig = { modules: 8 }
const MOD = 0.4

export function createModel(options: F1KerbOptions = {}): F1KerbInstance {
  const config: F1KerbConfig = { modules: Math.max(2, Math.round(options.modules ?? defaults.modules)) }

  const bundle = acquireF1Materials()
  const kit = bundle.materials
  const extras: Material[] = []
  const own = (material: Material): Material => {
    extras.push(material)
    return material
  }

  const paintMat = options.materials?.paint ?? own(new MeshStandardMaterial({
    name: 'f1-kit / kerb paint',
    color: TOKEN.RED_500,
    roughness: 0.72,
    metalness: 0.05,
  }))

  const materialSlots: Record<Slot, Material> = {
    shell: options.materials?.shell ?? kit.shell,
    paint: paintMat,
  }

  const root = new Group()
  root.name = 'f1-kerb'
  const kerb = new Group(); kerb.name = 'kerb'
  root.add(kerb)

  const generated: BufferGeometry[] = []
  const meshesBySlot: Record<Slot, Mesh[]> = { shell: [], paint: [] }

  const releaseGenerated = (): void => {
    kerb.clear()
    for (const geometry of generated) geometry.dispose()
    generated.length = 0
    for (const slot of Object.keys(meshesBySlot) as Slot[]) meshesBySlot[slot].length = 0
  }

  const emit = (slot: Slot, geometry: BufferGeometry, name: string): void => {
    generated.push(geometry)
    const mesh = new Mesh(geometry, materialSlots[slot])
    mesh.name = name
    mesh.castShadow = true
    mesh.receiveShadow = true
    meshesBySlot[slot].push(mesh)
    kerb.add(mesh)
  }

  const rebuild = (): void => {
    releaseGenerated()
    const length = config.modules * MOD
    // FIA kerb: ~350 mm wide, 80 mm high, 60 mm front chamfer down to the asphalt.
    const profile: Array<readonly [number, number]> = [
      [0.14, 0.00],
      [0.16, 0.05],
      [0.10, 0.13],
      [-0.04, 0.13],
      [-0.14, 0.07],
      [-0.18, 0.00],
    ]
    const body = uvAlongX(loftAlongX(profile, length, { closed: true, stations: 8 }), length, 0.38)
    emit('shell', body, 'kerb')

    const red: BufferGeometry[] = []
    const white: BufferGeometry[] = []
    const pitch = 0.16
    const count = Math.ceil(length / pitch) + 2
    for (let i = 0; i < count; i++) {
      const bar = bevelBox(0.09, 0.018, 0.36, 0.004)
      bar.rotateY(Math.PI / 4)
      bar.translate(-length / 2 + i * pitch, 0.128, 0.0)
      ;(i % 2 === 0 ? red : white).push(bar)
    }
    if (red.length) emit('paint', mergeParts(red, 'red-stripes'), 'red-stripes')
    if (white.length) emit('shell', mergeParts(white, 'white-stripes'), 'white-stripes')
  }
  rebuild()

  return {
    root,
    parts: { kerb },
    materials: materialSlots,
    getConfig: () => ({ ...config }),
    configure(patch) {
      if (patch.modules !== undefined) config.modules = Math.max(2, Math.round(patch.modules))
      rebuild()
    },
    setMaterial(slot, material) {
      materialSlots[slot] = material
      for (const mesh of meshesBySlot[slot]) mesh.material = material
    },
    update: () => {},
    dispose() {
      releaseGenerated()
      for (const material of extras) material.dispose()
      disposeF1Materials(bundle)
      root.removeFromParent()
    },
  }
}

export function createPreview({ aspect }: { aspect: number; time?: number }) {
  return createF1Preview(createModel({ modules: 5 }), {
    aspect,
    target: [0.2, 0.08, 0.0],
    distance: 1.55,
    fov: 28,
    yaw: -1.35,
    pitch: 0.28,
  })
}
