// f1-kerb — FIA rumble-strip: one lofted 50 mm trapezoid section with 45° painted stripes.
// configure({ modules }) sets how many 0.4 m modules long the run is.

import {
  BufferGeometry,
  DataTexture,
  Group,
  LinearFilter,
  Mesh,
  MeshStandardMaterial,
  NearestFilter,
  RGBAFormat,
  UnsignedByteType,
  type Material,
} from 'three/webgpu'

import {
  TOKEN,
  acquireF1Materials,
  createF1Preview,
  disposeF1Materials,
  loftAlongX,
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

function stripeTexture(modules: number): DataTexture {
  const w = Math.max(64, modules * 32)
  const h = 32
  const data = new Uint8Array(w * h * 4)
  const red = [(TOKEN.RED_500 >> 16) & 0xff, (TOKEN.RED_500 >> 8) & 0xff, TOKEN.RED_500 & 0xff]
  const white = [(TOKEN.SHELL_050 >> 16) & 0xff, (TOKEN.SHELL_050 >> 8) & 0xff, TOKEN.SHELL_050 & 0xff]
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4
      const stripe = Math.floor((x + y * 1.4) / 10) % 2 === 0
      const c = stripe ? red : white
      data[i] = c[0]!
      data[i + 1] = c[1]!
      data[i + 2] = c[2]!
      data[i + 3] = 255
    }
  }
  const tex = new DataTexture(data, w, h, RGBAFormat, UnsignedByteType)
  tex.minFilter = LinearFilter
  tex.magFilter = NearestFilter
  tex.needsUpdate = true
  return tex
}

export function createModel(options: F1KerbOptions = {}): F1KerbInstance {
  const config: F1KerbConfig = { modules: Math.max(2, Math.round(options.modules ?? defaults.modules)) }

  const bundle = acquireF1Materials()
  const kit = bundle.materials
  const extras: Material[] = []
  const textures: DataTexture[] = []
  const own = (material: Material): Material => {
    extras.push(material)
    return material
  }

  const tex = stripeTexture(config.modules)
  textures.push(tex)
  const paintMat = options.materials?.paint ?? own(new MeshStandardMaterial({
    name: 'f1-kit / kerb paint',
    map: tex,
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
    // FIA 50 mm kerb: 280 mm wide, 50 mm high, 60 mm front chamfer down to the asphalt.
    const profile: Array<readonly [number, number]> = [
      [0.32, 0.00],
      [0.32, 0.10],
      [0.08, 0.10],
      [0.00, 0.06],
      [-0.06, 0.00],
    ]
    emit('paint', loftAlongX(profile, length, { closed: true }), 'kerb')
  }
  rebuild()

  return {
    root,
    parts: { kerb },
    materials: materialSlots,
    getConfig: () => ({ ...config }),
    configure(patch) {
      if (patch.modules !== undefined) {
        config.modules = Math.max(2, Math.round(patch.modules))
        const next = stripeTexture(config.modules)
        textures[0]?.dispose()
        textures[0] = next
        ;(paintMat as MeshStandardMaterial).map = next
      }
      rebuild()
    },
    setMaterial(slot, material) {
      materialSlots[slot] = material
      for (const mesh of meshesBySlot[slot]) mesh.material = material
    },
    update: () => {},
    dispose() {
      releaseGenerated()
      for (const texture of textures) texture.dispose()
      for (const material of extras) material.dispose()
      disposeF1Materials(bundle)
      root.removeFromParent()
    },
  }
}

export function createPreview({ aspect }: { aspect: number; time?: number }) {
  return createF1Preview(createModel(), { aspect, target: [0, 0.06, 0.1], distance: 3.4, fov: 26 })
}
