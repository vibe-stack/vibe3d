// f1-kerb — FIA rumble-strip: one measured 800 mm module, lofted from the published
// 0 → 50 mm ramp over the first 400 mm, with a raised-cosine blister cap (Singapore elevation)
// seated on the flat. Paint is 800 × 800 mm red/white squares in the photo hexes, not 45° bars.
// configure({ modules }) sets how many 800 mm bands long the run is.

import {
  BufferGeometry,
  Float32BufferAttribute,
  Group,
  Mesh,
  MeshStandardMaterial,
  type Material,
} from 'three/webgpu'

import {
  acquireF1Materials,
  createF1Preview,
  disposeF1Materials,
  mergeParts,
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

/** Published FIA apex-kerb / 800 × 800 mm squares. See curbShader PROFILE_DEF. */
const BAND = 0.80
const WIDTH = 0.80
const RAMP_LEN = 0.40
const RAMP_RISE = 0.050
const LIP = 0.005
const CAP_CROWN = 0.050
const CAP_DUTY = 0.72
const CAP_PER_BAND = 3
const SKIRT = 0.04
const ALONG = 24

/** Spa fresh-paint red; Singapore kerb-white (neutral, not the Spa illuminant). */
const KERB_RED = 0xde2f25
const KERB_WHITE = 0xe5e0da

function kerbCap(xLocal: number): number {
  const pitch = BAND / CAP_PER_BAND
  const v = xLocal / pitch + 0.5
  const q = v - Math.floor(v) - 0.5
  const u = Math.max(-1, Math.min(1, q / (0.5 * CAP_DUTY)))
  return 0.5 * (1 + Math.cos(Math.PI * u))
}

function kerbHeight(d: number, xLocal: number): number {
  const t = Math.max(0, Math.min(1, d / RAMP_LEN))
  const s = t * t * (3 - 2 * t)
  return LIP + (RAMP_RISE - LIP + CAP_CROWN * kerbCap(xLocal)) * s
}

/** `out = (∂h/∂d, ∂h/∂x)`. Analytic so the blister silhouette and the shading share one field. */
function kerbGradient(d: number, xLocal: number, out: [number, number]): void {
  const rl = RAMP_LEN
  const t = Math.max(0, Math.min(1, d / rl))
  const s = t * t * (3 - 2 * t)
  const ds = (6 * t * (1 - t)) / rl
  const pitch = BAND / CAP_PER_BAND
  const v = xLocal / pitch + 0.5
  const q = v - Math.floor(v) - 0.5
  const uRaw = q / (0.5 * CAP_DUTY)
  const u = Math.max(-1, Math.min(1, uRaw))
  const cap = 0.5 * (1 + Math.cos(Math.PI * u))
  const dcap = Math.abs(uRaw) >= 1 ? 0 : (-Math.PI * Math.sin(Math.PI * u)) / (CAP_DUTY * pitch)
  out[0] = (RAMP_RISE - LIP + CAP_CROWN * cap) * ds
  out[1] = CAP_CROWN * dcap * s
}

/**
 * One 800 mm band. Track-side lip at +Z (d = 0), rear edge at −Z. Along-kerb is X, centred on 0.
 * Port of `buildCurbModuleGeometry` into the kit's X-along / Z-across frame.
 */
function buildKerbModule(): BufferGeometry {
  const pos: number[] = []
  const nor: number[] = []
  const uvs: number[] = []
  const idx: number[] = []
  const halfW = WIDTH * 0.5
  const halfL = BAND * 0.5
  const yBot = -SKIRT
  const g: [number, number] = [0, 0]
  const dKnots = [0, RAMP_LEN * 0.25, RAMP_LEN * 0.5, RAMP_LEN * 0.75, RAMP_LEN, WIDTH]
  const zs = dKnots.map((d) => halfW - d)
  const nZ = zs.length - 1

  const xAt = (k: number): number => -halfL + (k / ALONG) * BAND
  const dAt = (z: number): number => halfW - z

  const push = (x: number, y: number, z: number, nx: number, ny: number, nz: number): void => {
    pos.push(x, y, z)
    nor.push(nx, ny, nz)
    uvs.push((x + halfL) / BAND, (z + halfW) / WIDTH)
  }

  for (let i = 0; i <= nZ; i++) {
    const z = zs[i]!
    for (let k = 0; k <= ALONG; k++) {
      const x = xAt(k)
      kerbGradient(dAt(z), x, g)
      // n = normalize(−∂h/∂x, 1, −∂h/∂z); ∂h/∂z = −∂h/∂d so n.z = ∂h/∂d.
      const nx = -g[1]
      const nz = g[0]
      const inv = 1 / Math.hypot(nx, 1, nz)
      push(x, kerbHeight(dAt(z), x), z, nx * inv, inv, nz * inv)
    }
  }
  const top = (i: number, k: number): number => i * (ALONG + 1) + k
  for (let i = 0; i < nZ; i++) {
    for (let k = 0; k < ALONG; k++) {
      idx.push(top(i, k), top(i, k + 1), top(i + 1, k))
      idx.push(top(i + 1, k), top(i, k + 1), top(i + 1, k + 1))
    }
  }

  const yAt = (x: number, z: number): number => kerbHeight(dAt(z), x)
  const wall = (
    pts: ReadonlyArray<readonly [number, number]>,
    normal: readonly [number, number, number],
    flip: boolean,
  ): void => {
    const base = pos.length / 3
    for (const [x, z] of pts) {
      push(x, yAt(x, z), z, normal[0], normal[1], normal[2])
      push(x, yBot, z, normal[0], normal[1], normal[2])
    }
    for (let i = 0; i < pts.length - 1; i++) {
      const t0 = base + i * 2
      const b0 = t0 + 1
      const t1 = t0 + 2
      const b1 = t0 + 3
      if (flip) idx.push(t0, t1, b0, t1, b1, b0)
      else idx.push(t0, b0, t1, t1, b0, b1)
    }
  }

  const xAll: number[] = []
  for (let k = 0; k <= ALONG; k++) xAll.push(xAt(k))
  const zTrack = zs[0]!
  const zRear = zs[nZ]!
  wall(xAll.map((x) => [x, zRear] as const), [0, 0, -1], false)
  wall([[-halfL, zTrack], [halfL, zTrack]], [0, 0, 1], true)
  wall(zs.map((z) => [-halfL, z] as const), [-1, 0, 0], true)
  wall(zs.map((z) => [halfL, z] as const), [1, 0, 0], false)

  const b = pos.length / 3
  const zLo = Math.min(zTrack, zRear)
  const zHi = Math.max(zTrack, zRear)
  push(-halfL, yBot, zLo, 0, -1, 0)
  push(halfL, yBot, zLo, 0, -1, 0)
  push(-halfL, yBot, zHi, 0, -1, 0)
  push(halfL, yBot, zHi, 0, -1, 0)
  idx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2)

  const geo = new BufferGeometry()
  geo.setAttribute('position', new Float32BufferAttribute(pos, 3))
  geo.setAttribute('normal', new Float32BufferAttribute(nor, 3))
  geo.setAttribute('uv', new Float32BufferAttribute(uvs, 2))
  geo.setIndex(idx)
  geo.computeBoundingSphere()
  return geo
}

export function createModel(options: F1KerbOptions = {}): F1KerbInstance {
  const config: F1KerbConfig = { modules: Math.max(2, Math.round(options.modules ?? defaults.modules)) }

  const bundle = acquireF1Materials()
  const extras: Material[] = []
  const own = (material: Material): Material => {
    extras.push(material)
    return material
  }

  const paintMat = options.materials?.paint ?? own(new MeshStandardMaterial({
    name: 'f1-kit / kerb red',
    color: KERB_RED,
    roughness: 0.74,
    metalness: 0.02,
  }))
  const whiteMat = options.materials?.shell ?? own(new MeshStandardMaterial({
    name: 'f1-kit / kerb white',
    color: KERB_WHITE,
    roughness: 0.78,
    metalness: 0.02,
  }))

  const materialSlots: Record<Slot, Material> = {
    shell: whiteMat,
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
    const red: BufferGeometry[] = []
    const white: BufferGeometry[] = []
    const origin = -((config.modules - 1) * BAND) / 2
    for (let i = 0; i < config.modules; i++) {
      const module = buildKerbModule()
      module.translate(origin + i * BAND, 0, 0)
      ;(i % 2 === 0 ? red : white).push(module)
    }
    if (red.length) emit('paint', mergeParts(red, 'kerb-red'), 'kerb-red')
    if (white.length) emit('shell', mergeParts(white, 'kerb-white'), 'kerb-white')
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
  return createF1Preview(createModel({ modules: 6 }), {
    aspect,
    target: [0, 0.04, 0.08],
    distance: 3.4,
    fov: 28,
    yaw: -1.12,
    pitch: 0.38,
  })
}
