// f1-gravel-trap — a placeable FIA gravel TILE, not terrain. The 8–20 mm mono-grain
// packing lives in a Worley-cell albedo plus its matching normal map; jittered-grid
// half-buried chips carry the silhouette; soft dunes, two sparse tyre ruts and a damp
// patch carry the character. Deterministic throughout: integer hashes, no PRNG.

import {
  BufferAttribute,
  BufferGeometry,
  DataTexture,
  Group,
  LinearFilter,
  LinearMipmapLinearFilter,
  Mesh,
  MeshStandardMaterial,
  NearestFilter,
  PlaneGeometry,
  RepeatWrapping,
  RGBAFormat,
  SRGBColorSpace,
  UnsignedByteType,
  type Material,
} from 'three/webgpu'

import {
  TOKEN,
  acquireF1Materials,
  clamp01,
  createF1Preview,
  disposeF1Materials,
  mergeParts,
  revolve,
  shade,
} from '../f1-kit-core/index.ts'

type Slot = 'bed' | 'stone'

export interface F1GravelTrapConfig {
  modules: number
  /** Jittered-grid surface chips per 2.5 m tile. Sheet default 1200; scene uses ~90. */
  pebblesPerModule: number
}

export interface F1GravelTrapOptions extends Partial<F1GravelTrapConfig> {
  materials?: Partial<Record<Slot, Material>>
}

export interface F1GravelTrapInstance {
  readonly root: Group
  readonly parts: { bed: Group; stone: Group }
  readonly materials: Readonly<Record<Slot, Material>>
  getConfig(): Readonly<F1GravelTrapConfig>
  configure(patch: Partial<F1GravelTrapConfig>): void
  setMaterial(slot: Slot, material: Material): void
  update(deltaSeconds: number): void
  dispose(): void
}

const defaults: F1GravelTrapConfig = { modules: 2, pebblesPerModule: 1200 }
const TILE = 2.5
const THICK = 0.04
/** Metres of gravel bed covered by one wrap of the 512 px grain texture (~1.6 mm/texel). */
const GRAIN_SPAN = 0.82
const STONE_TONES = 8

/* ---------- deterministic hashing ---------- */

/**
 * Bit-mixing integer hash. A `sin(i * k)` hash cannot be used here: sampled at a linear
 * index it is a sine of an arithmetic progression, which aliases into visible rows —
 * exactly the farmed-row artefact this bed is supposed to be free of.
 */
function hashInt(n: number): number {
  let h = n | 0
  h = Math.imul(h ^ (h >>> 16), 2246822507)
  h = Math.imul(h ^ (h >>> 13), 3266489909)
  h ^= h >>> 16
  return (h >>> 0) / 4294967296
}

/** Decorrelated value for lattice cell (a, b). */
function hash2(a: number, b: number): number {
  return hashInt(Math.imul(a | 0, 73856093) ^ Math.imul(b | 0, 19349663))
}

/** Decorrelated value for item `i`, stream `salt`. */
function rnd(i: number, salt: number): number {
  return hashInt(Math.imul(i | 0, 2654435761) ^ Math.imul(salt | 0, 40503))
}

/* ---------- deterministic noise ---------- */

function valueNoise(x: number, y: number): number {
  const xi = Math.floor(x)
  const yi = Math.floor(y)
  const xf = x - xi
  const yf = y - yi
  const u = xf * xf * (3 - 2 * xf)
  const v = yf * yf * (3 - 2 * yf)
  const a = hash2(xi, yi)
  const b = hash2(xi + 1, yi)
  const c = hash2(xi, yi + 1)
  const d = hash2(xi + 1, yi + 1)
  return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v
}

function fbm(x: number, y: number): number {
  return (
    valueNoise(x, y) * 0.55 +
    valueNoise(x * 2.13 + 71, y * 2.13 - 37) * 0.29 +
    valueNoise(x * 4.71 - 13, y * 4.71 + 59) * 0.16
  )
}

/* ---------- bed relief ---------- */

/**
 * Two tyre ruts, deliberately not parallel: different drift, wobble and fade, so they
 * read as one car's passage rather than farmed rows. `from`/`to` are fractions along
 * the tile run, which keeps them sparse at any module count.
 */
const RUTS = [
  { z: -0.61, drift: 0.34, wobble: 0.060, phase: 1.7, half: 0.200, depth: 0.030, from: -0.30, to: 0.84 },
  { z: 0.76, drift: -0.20, wobble: 0.042, phase: 4.1, half: 0.170, depth: 0.024, from: 0.16, to: 1.30 },
] as const

function rutAt(x: number, z: number, length: number): { relief: number; mask: number } {
  const t = (x + length / 2) / length
  let cut = 0
  let berm = 0
  let mask = 0
  for (const rut of RUTS) {
    const along = clamp01((t - rut.from) / 0.24) * clamp01((rut.to - t) / 0.24)
    if (along <= 0) continue
    const cz = rut.z + rut.drift * (x / length) * TILE + Math.sin(x * 2.1 + rut.phase) * rut.wobble
    const d = Math.abs(z - cz) / rut.half
    if (d < 1) {
      const p = Math.cos(d * Math.PI * 0.5)
      cut = Math.max(cut, p * rut.depth * along)
      mask = Math.max(mask, p * along)
    } else if (d < 1.85) {
      const p = clamp01(1 - Math.abs(d - 1.36) / 0.46)
      berm = Math.max(berm, p * rut.depth * 0.62 * along)
    }
  }
  return { relief: berm - cut, mask }
}

/** Soft damp/dirty blob, sized in metres so it stays a patch rather than a stripe. */
function dampAt(x: number, z: number): number {
  const dx = (x - 0.58) / 0.78
  const dz = (z + 0.36) / 0.52
  const r = Math.sqrt(dx * dx + dz * dz) + (fbm(x * 2.4 + 53, z * 2.4 - 21) - 0.5) * 0.62
  return clamp01((1 - r) / 0.34)
}

/** Bed surface height. Chips sample this too, so they sit in the dunes and ruts. */
function bedAt(x: number, z: number, length: number): number {
  const dune = (fbm(x * 1.05 + 31, z * 1.05 - 17) - 0.5) * 0.023
  const swell = (fbm(x * 3.7 - 82, z * 3.7 + 64) - 0.5) * 0.012
  const chop = (fbm(x * 9.3 + 26, z * 9.3 - 49) - 0.5) * 0.006
  return THICK + dune + swell + chop + rutAt(x, z, length).relief
}

/* ---------- textures ---------- */

/** Chip tints indexed by UV rather than by draw call: one wide texel per tone. */
const STONE_TINTS: ReadonlyArray<readonly [number, number, number]> = [
  [252, 243, 228],
  [228, 219, 199],
  [244, 224, 190],
  [208, 209, 208],
  [196, 178, 152],
  [166, 156, 145],
  [142, 130, 112],
  [174, 166, 176],
]

function stonePalette(): DataTexture {
  const data = new Uint8Array(STONE_TONES * 4)
  for (let i = 0; i < STONE_TONES; i++) {
    const tint = STONE_TINTS[i]!
    data[i * 4] = tint[0]
    data[i * 4 + 1] = tint[1]
    data[i * 4 + 2] = tint[2]
    data[i * 4 + 3] = 255
  }
  const tex = new DataTexture(data, STONE_TONES, 1, RGBAFormat, UnsignedByteType)
  tex.colorSpace = SRGBColorSpace
  tex.magFilter = NearestFilter
  tex.minFilter = NearestFilter
  tex.generateMipmaps = false
  tex.needsUpdate = true
  return tex
}

/** Cell tints for the packed bed: mono-grain quarry stone, with dust between chips. */
const BED_TINTS: ReadonlyArray<readonly [number, number, number]> = [
  [232, 216, 186],
  [198, 178, 144],
  [246, 236, 214],
  [158, 141, 116],
  [218, 194, 152],
  [132, 119, 101],
  [184, 174, 170],
  [210, 188, 148],
]

/**
 * Packed-gravel albedo and its matching normal map from a single wrapping Worley pass.
 * Cells are the 8–20 mm chips; F2−F1 gives the dark contact seam between them; gaps
 * fall through to dust. Lighting is left to the normal map so the albedo stays flat.
 */
function gravelTextures(): { albedo: DataTexture; normal: DataTexture } {
  const n = 512
  // `cell` must divide `n` exactly: a fractional `cols` makes every feature lookup
  // index the typed array at a fractional offset, which silently yields undefined.
  const cell = 8
  const cols = n / cell
  const albedo = new Uint8Array(n * n * 4)
  const height = new Float32Array(n * n)
  const feature = new Float32Array(cols * cols * 3)

  for (let cy = 0; cy < cols; cy++) {
    for (let cx = 0; cx < cols; cx++) {
      const i = (cy * cols + cx) * 3
      feature[i] = (0.08 + 0.84 * hash2(cx, cy)) * cell
      feature[i + 1] = (0.08 + 0.84 * hash2(cx + 7919, cy - 104729)) * cell
      feature[i + 2] = hash2(cx - 31337, cy + 65537)
    }
  }

  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const gx = Math.floor(x / cell)
      const gy = Math.floor(y / cell)
      let best = 1e9
      let second = 1e9
      let bid = 0
      for (let oy = -1; oy <= 1; oy++) {
        for (let ox = -1; ox <= 1; ox++) {
          const wx = (((gx + ox) % cols) + cols) % cols
          const wy = (((gy + oy) % cols) + cols) % cols
          const f = (wy * cols + wx) * 3
          const dx = x - ((gx + ox) * cell + feature[f]!)
          const dy = y - ((gy + oy) * cell + feature[f + 1]!)
          const d = Math.sqrt(dx * dx + dy * dy)
          if (d < best) {
            second = best
            best = d
            bid = f
          } else if (d < second) {
            second = d
          }
        }
      }

      const seed = feature[bid + 2]!
      const radius = cell * (0.34 + 0.46 * seed)
      const t = best / radius
      const seam = clamp01((second - best) / (cell * 0.40))
      const grit = 0.84 + 0.32 * hash2(x * 3 + 1, y * 5 - 2)
      const i = (y * n + x) * 4
      let r: number
      let g: number
      let b: number
      let h: number

      if (t < 1) {
        const tint = BED_TINTS[Math.floor(seed * 57.13) % STONE_TONES]!
        const k = (0.44 + 0.56 * seam) * grit
        r = tint[0] * k
        g = tint[1] * k
        b = tint[2] * k
        h = Math.sqrt(Math.max(0, 1 - t * t)) * (0.55 + 0.45 * seed)
      } else {
        const dust = hash2(x - 4093, y + 8191)
        const k = (0.32 + 0.30 * dust) * grit
        r = 188 * k
        g = 172 * k
        b = 146 * k
        h = 0.05 * dust
      }

      albedo[i] = Math.min(255, Math.round(r))
      albedo[i + 1] = Math.min(255, Math.round(g))
      albedo[i + 2] = Math.min(255, Math.round(b))
      albedo[i + 3] = 255
      height[y * n + x] = h
    }
  }

  const normal = new Uint8Array(n * n * 4)
  const strength = 4.6
  for (let y = 0; y < n; y++) {
    const yp = (y + 1) % n
    const ym = (y + n - 1) % n
    for (let x = 0; x < n; x++) {
      const xp = (x + 1) % n
      const xm = (x + n - 1) % n
      const nx = (height[y * n + xm]! - height[y * n + xp]!) * strength
      const ny = (height[ym * n + x]! - height[yp * n + x]!) * strength
      const inv = 1 / Math.sqrt(nx * nx + ny * ny + 1)
      const i = (y * n + x) * 4
      normal[i] = Math.round((nx * inv * 0.5 + 0.5) * 255)
      normal[i + 1] = Math.round((ny * inv * 0.5 + 0.5) * 255)
      normal[i + 2] = Math.round((inv * 0.5 + 0.5) * 255)
      normal[i + 3] = 255
    }
  }

  const albedoTex = new DataTexture(albedo, n, n, RGBAFormat, UnsignedByteType)
  albedoTex.colorSpace = SRGBColorSpace
  albedoTex.wrapS = RepeatWrapping
  albedoTex.wrapT = RepeatWrapping
  albedoTex.magFilter = LinearFilter
  albedoTex.minFilter = LinearMipmapLinearFilter
  // The bed is nearly always seen at a grazing angle; without this the grain mips to mud.
  albedoTex.anisotropy = 16
  albedoTex.generateMipmaps = true
  albedoTex.needsUpdate = true

  const normalTex = new DataTexture(normal, n, n, RGBAFormat, UnsignedByteType)
  normalTex.wrapS = RepeatWrapping
  normalTex.wrapT = RepeatWrapping
  normalTex.magFilter = LinearFilter
  normalTex.minFilter = LinearMipmapLinearFilter
  normalTex.anisotropy = 16
  normalTex.generateMipmaps = true
  normalTex.needsUpdate = true

  return { albedo: albedoTex, normal: normalTex }
}

/* ---------- chips ---------- */

/** Tag every vertex with the palette texel for its tone; UV survives `mergeParts`. */
function paintTone(geometry: BufferGeometry, tone: number): BufferGeometry {
  const count = geometry.getAttribute('position').count
  const uv = new Float32Array(count * 2)
  const u = (tone + 0.5) / STONE_TONES
  for (let i = 0; i < count; i++) {
    uv[i * 2] = u
    uv[i * 2 + 1] = 0.5
  }
  geometry.setAttribute('uv', new BufferAttribute(uv, 2))
  return geometry
}

/** Flat-shade a chip so it reads as fractured quarry stone rather than a pebble. */
function facet(geometry: BufferGeometry): BufferGeometry {
  const flat = geometry.toNonIndexed()
  geometry.dispose()
  flat.computeVertexNormals()
  return flat
}

/** A chip of quarry stone: jittered lathe profile, squashed and tumbled. */
function chip(i: number, span: number, sy: number, segments: number): BufferGeometry {
  const geometry = revolve(
    [
      [0.00, 0.14 + rnd(i, 11) * 0.22],
      [0.36, 0.86 + rnd(i, 12) * 0.26],
      [0.74, 0.72 + rnd(i, 13) * 0.32],
      [1.00, 0.06 + rnd(i, 14) * 0.16],
    ],
    { yBot: 0, yTop: sy, scaleW: span * 0.5, segments },
  )
  geometry.scale(0.78 + rnd(i, 15) * 0.50, 1, 0.60 + rnd(i, 16) * 0.54)
  geometry.rotateY(rnd(i, 17) * Math.PI * 2)
  geometry.rotateX((rnd(i, 18) - 0.5) * 0.70)
  geometry.rotateZ((rnd(i, 19) - 0.5) * 0.70)
  return geometry
}

export function createModel(options: F1GravelTrapOptions = {}): F1GravelTrapInstance {
  const config: F1GravelTrapConfig = {
    modules: Math.max(1, Math.round(options.modules ?? defaults.modules)),
    pebblesPerModule: options.pebblesPerModule != null && Number.isFinite(options.pebblesPerModule)
      ? Math.max(0, Math.round(options.pebblesPerModule))
      : defaults.pebblesPerModule,
  }

  const bundle = acquireF1Materials()
  const extras: Material[] = []
  const textures: DataTexture[] = []
  const materialSlots: Record<Slot, Material> = {
    bed: options.materials?.bed ?? (() => {
      const mat = new MeshStandardMaterial({
        name: 'f1-kit / gravel bed',
        color: shade(TOKEN.DUST_300, -0.06),
        roughness: 0.97,
        metalness: 0,
      })
      extras.push(mat)
      return mat
    })(),
    stone: options.materials?.stone ?? (() => {
      const mat = new MeshStandardMaterial({
        name: 'f1-kit / gravel stone',
        color: shade(TOKEN.DUST_300, -0.16),
        roughness: 0.86,
        metalness: 0.03,
      })
      extras.push(mat)
      return mat
    })(),
  }
  const stoneDark = new MeshStandardMaterial({
    name: 'f1-kit / gravel stone dark',
    color: shade(TOKEN.DUST_300, -0.46),
    roughness: 0.92,
    metalness: 0.03,
  })
  const dustMat = new MeshStandardMaterial({
    name: 'f1-kit / gravel dust collar',
    color: shade(TOKEN.DUST_300, -0.66),
    roughness: 0.99,
    metalness: 0,
  })
  const rakeMat = new MeshStandardMaterial({
    name: 'f1-kit / gravel track spray',
    color: shade(TOKEN.DUST_300, -0.52),
    roughness: 0.94,
    metalness: 0,
  })
  extras.push(stoneDark, dustMat, rakeMat)

  const root = new Group()
  root.name = 'f1-gravel-trap'
  const bed = new Group(); bed.name = 'bed'
  const stone = new Group(); stone.name = 'stone'
  root.add(bed, stone)

  const generated: BufferGeometry[] = []
  const meshesBySlot: Record<Slot, Mesh[]> = { bed: [], stone: [] }

  const releaseGenerated = (): void => {
    bed.clear(); stone.clear()
    for (const geometry of generated) geometry.dispose()
    generated.length = 0
    for (const slot of Object.keys(meshesBySlot) as Slot[]) meshesBySlot[slot].length = 0
    for (const texture of textures) texture.dispose()
    textures.length = 0
  }

  const emit = (slot: Slot, geometry: BufferGeometry, material: Material, group: Group, name: string): void => {
    generated.push(geometry)
    const mesh = new Mesh(geometry, material)
    mesh.name = name
    mesh.userData.topologyRole = name === 'bed' ? 'hull' : name.startsWith('stones') ? 'scatter' : 'detail'
    mesh.castShadow = name === 'bed' || name === 'rake'
    mesh.receiveShadow = true
    meshesBySlot[slot].push(mesh)
    group.add(mesh)
  }

  const rebuild = (): void => {
    releaseGenerated()
    const length = config.modules * TILE
    const halfX = length / 2
    const halfZ = TILE / 2

    const segsX = Math.min(560, Math.max(16, Math.round(length / 0.04)))
    const segsZ = 64
    const slab = new PlaneGeometry(length, TILE, segsX, segsZ)
    slab.rotateX(-Math.PI / 2)
    const bedPos = slab.getAttribute('position')
    const bedCol = new Float32Array(bedPos.count * 3)
    for (let i = 0; i < bedPos.count; i++) {
      const x = bedPos.getX(i)
      const z = bedPos.getZ(i)
      const { relief, mask } = rutAt(x, z, length)
      bedPos.setY(i, bedAt(x, z, length))

      const damp = dampAt(x, z)
      const drift = fbm(x * 0.8 + 91, z * 0.8 + 22)
      const dirt = fbm(x * 3.1 - 44, z * 3.1 + 77)
      // Sunken ground reads damper and shaded; crests catch the dust bloom.
      const lift = clamp01(0.5 + relief * 16)
      let value = (0.76 + drift * 0.40 + dirt * 0.14) * (0.88 + lift * 0.20)
      value *= 1 - 0.58 * mask
      value *= 1 - 0.50 * damp
      // Wet gravel darkens and warms rather than greying out.
      bedCol[i * 3] = value
      bedCol[i * 3 + 1] = value * (1 - 0.09 * damp)
      bedCol[i * 3 + 2] = value * (1 - 0.20 * damp)
    }
    slab.setAttribute('color', new BufferAttribute(bedCol, 3))
    slab.computeVertexNormals()

    const grain = gravelTextures()
    textures.push(grain.albedo, grain.normal)
    grain.albedo.repeat.set(length / GRAIN_SPAN, TILE / GRAIN_SPAN)
    grain.normal.repeat.set(length / GRAIN_SPAN, TILE / GRAIN_SPAN)
    const bedMat = materialSlots.bed as MeshStandardMaterial
    bedMat.map = grain.albedo
    bedMat.normalMap = grain.normal
    bedMat.normalScale.set(1.4, 1.4)
    bedMat.vertexColors = true
    bedMat.needsUpdate = true
    emit('bed', slab, bedMat, bed, 'bed')

    const palette = stonePalette()
    textures.push(palette)
    const stoneMat = materialSlots.stone as MeshStandardMaterial
    stoneMat.map = palette
    stoneMat.needsUpdate = true
    stoneDark.map = palette
    stoneDark.needsUpdate = true

    const light: BufferGeometry[] = []
    const dark: BufferGeometry[] = []
    const collars: BufferGeometry[] = []

    const place = (i: number, x: number, z: number, scale: number): void => {
      const grade = rnd(i, 21)
      const span = Math.min(0.034, (0.012 + Math.pow(grade, 1.6) * 0.017) * scale)
      const sy = span * (0.34 + rnd(i, 22) * 0.34)
      const angular = i % 7 < 4

      let geometry = chip(i, span, sy, angular ? 5 + (i % 2) : 7)
      // Hero chips sit prouder; the mono-grain bulk stays mostly swallowed by the bed.
      const bury = scale > 1.3 ? 0.42 + rnd(i, 23) * 0.26 : 0.30 + rnd(i, 23) * 0.40
      const surface = bedAt(x, z, length)
      geometry.translate(x, surface - sy * bury, z)
      if (angular) geometry = facet(geometry)

      const tone = Math.min(STONE_TONES - 1, Math.floor(rnd(i, 24) * STONE_TONES))
      paintTone(geometry, tone)
      ;(tone < 4 ? light : dark).push(geometry)

      // Dust drifted against the buried third of the chip: the contact shade that
      // stops a stone from looking dropped onto a hard plane.
      if (rnd(i, 25) > 0.55 && rutAt(x, z, length).mask < 0.3) {
        const collar = revolve([[0, 1], [1, 0.04]], {
          yBot: surface + 0.0022,
          yTop: surface + 0.0028,
          scaleW: span * (0.70 + rnd(i, 26) * 0.34),
          segments: 5,
        })
        collar.rotateY(rnd(i, 27) * Math.PI * 2)
        collar.translate(x, 0, z)
        collars.push(collar)
      }
    }

    // A jittered grid, not a Weyl cycle: full-cell jitter from a decorrelated hash is
    // what keeps the packing from lining up into bead-strings.
    const target = config.modules * config.pebblesPerModule
    const cellsX = Math.max(1, Math.round(Math.sqrt((target * length) / TILE)))
    const cellsZ = Math.max(1, Math.round(target / cellsX))
    const stepX = length / cellsX
    const stepZ = TILE / cellsZ
    for (let cz = 0; cz < cellsZ; cz++) {
      for (let cx = 0; cx < cellsX; cx++) {
        const i = cz * cellsX + cx + 1
        const x = Math.min(halfX - 0.02, -halfX + (cx + hash2(cx, cz)) * stepX)
        const z = Math.min(halfZ - 0.02, -halfZ + (cz + hash2(cx + 5081, cz - 9109)) * stepZ)
        // Thinned-out drifts of bare dust between the packed clumps.
        if (fbm(x * 1.9 + 123, z * 1.9 - 66) < 0.36 && rnd(i, 31) > 0.30) continue
        // A tyre presses the loose top course into the bed, so ruts run barer.
        if (rutAt(x, z, length).mask > 0.25 && rnd(i, 35) < 0.55) continue
        place(i, x, z, rnd(i, 36) > 0.965 ? 1.75 : 1)
        if (rnd(i, 32) > 0.58) {
          const a = rnd(i, 33) * Math.PI * 2
          const r = stepX * (0.30 + rnd(i, 34) * 0.34)
          place(i + 100003, x + Math.cos(a) * r, z + Math.sin(a) * r, 0.82)
        }
      }
    }
    if (light.length === 0) light.push(chip(1, 1e-4, 1e-4, 5))
    if (dark.length === 0) dark.push(chip(2, 1e-4, 1e-4, 5))
    if (collars.length === 0) collars.push(chip(3, 1e-4, 1e-4, 5))

    // Gravel flung along the rut edges — the only linear feature left on the bed.
    const spray: BufferGeometry[] = []
    const sprayCount = Math.min(620, 60 * config.modules)
    for (let i = 1; i <= sprayCount; i++) {
      const rut = RUTS[i % RUTS.length]!
      const t = rut.from + rnd(i, 41) * (rut.to - rut.from)
      if (t < 0.02 || t > 0.98) continue
      const x = (t - 0.5) * length
      const cz = rut.z + rut.drift * (x / length) * TILE + Math.sin(x * 2.1 + rut.phase) * rut.wobble
      const side = rnd(i, 42) > 0.5 ? 1 : -1
      const z = cz + side * rut.half * (1.10 + rnd(i, 43) * 0.55)
      if (Math.abs(z) > halfZ - 0.03) continue
      const span = 0.013 + rnd(i, 44) * 0.015
      const flake = chip(i + 977, span, span * 0.30, 5)
      flake.translate(x, bedAt(x, z, length) - span * 0.10, z)
      spray.push(facet(flake))
    }
    if (spray.length === 0) spray.push(chip(4, 1e-4, 1e-4, 5))

    emit('bed', mergeParts(spray, 'track-spray'), rakeMat, bed, 'rake')
    emit('bed', mergeParts(collars, 'dust'), dustMat, bed, 'dust')
    emit('stone', mergeParts(light, 'stones'), materialSlots.stone, stone, 'stones')
    emit('stone', mergeParts(dark, 'stones-dark'), stoneDark, stone, 'stones-dark')
  }
  rebuild()

  return {
    root,
    parts: { bed, stone },
    materials: materialSlots,
    getConfig: () => ({ ...config }),
    configure(patch) {
      if (patch.modules !== undefined) config.modules = Math.max(1, Math.round(patch.modules))
      if (typeof patch.pebblesPerModule === 'number' && Number.isFinite(patch.pebblesPerModule)) {
        config.pebblesPerModule = Math.max(0, Math.round(patch.pebblesPerModule))
      }
      rebuild()
    },
    setMaterial(slot, material) {
      materialSlots[slot] = material
      for (const mesh of meshesBySlot[slot]) {
        if (slot === 'stone' && mesh.name !== 'stones') continue
        if (slot === 'bed' && mesh.name !== 'bed') continue
        mesh.material = material
      }
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
  return createF1Preview(createModel({ modules: 2 }), {
    aspect,
    target: [0, 0.04, 0],
    distance: 3.2,
    fov: 28,
    yaw: -0.78,
    pitch: 0.66,
  })
}
