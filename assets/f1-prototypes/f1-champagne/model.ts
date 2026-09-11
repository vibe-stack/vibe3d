// f1-champagne — unbranded 1.5 L magnum (punt, foil, muselet).
// Moët-green glass and gold foil — no house mark.

import {
  BufferGeometry,
  Float32BufferAttribute,
  Group,
  Mesh,
  MeshPhysicalMaterial,
  Vector3,
  type Material,
} from 'three/webgpu'

import {
  CHAMPAGNE,
  LAYER_CLEARANCE,
  acquireF1Materials,
  createF1Preview,
  disposeF1Materials,
  mergeParts,
  revolve,
  taperedTube,
} from '../f1-kit-core/index.ts'

type Slot = 'glass' | 'cage'

export interface F1ChampagneConfig {
  height: number
}

export interface F1ChampagneOptions extends Partial<F1ChampagneConfig> {
  materials?: Partial<Record<Slot, Material>>
}

export interface F1ChampagneInstance {
  readonly root: Group
  readonly parts: { glass: Group; cage: Group }
  readonly materials: Readonly<Record<Slot, Material>>
  getConfig(): Readonly<F1ChampagneConfig>
  configure(patch: Partial<F1ChampagneConfig>): void
  setMaterial(slot: Slot, material: Material): void
  update(deltaSeconds: number): void
  dispose(): void
}

const defaults: F1ChampagneConfig = { height: CHAMPAGNE.height }
const GOLD = 0xC9A227
const GOLD_TRIM = 0xD6B54E
const GREEN = 0x11231A
const CREAM = 0xE3D2A6
const CORK = 0x6F5530

/**
 * Half-profile of the glass as `[height fraction of the whole bottle, radius as a multiple of bodyR]`.
 *
 * A magnum is not a scaled-up 750: the body cylinder runs to just past mid-height, the shoulder is one
 * long diagonal rather than a bulb, and the neck is close to parallel. The last four rows are the string
 * rim — the thick collar the muselet hooks under, and the landmark that separates a champagne bottle from
 * a wine bottle at silhouette distance.
 */
const PROFILE: ReadonlyArray<readonly [number, number]> = [
  [0.0000, 0.800],
  [0.0040, 0.938],
  [0.0105, 0.984],
  [0.0165, 0.998],
  [0.0400, 1.000],
  [0.4000, 1.000],
  [0.5000, 0.992],
  [0.5300, 0.958],
  [0.5600, 0.888],
  [0.5900, 0.784],
  [0.6200, 0.660],
  [0.6500, 0.536],
  [0.6800, 0.428],
  [0.7100, 0.356],
  [0.7400, 0.318],
  [0.8000, 0.303],
  [0.8600, 0.294],
  [0.9000, 0.297],
  [0.9150, 0.316],
  [0.9180, 0.352],
  [0.9400, 0.352],
  [0.9450, 0.330],
  [0.9500, 0.276],
]

const GLASS_TOP = 0.95

interface SleeveRow {
  /** Height as a fraction of the whole bottle. */
  readonly y: number
  /** Radius in world units, before crumpling. */
  readonly r: number
  /** Radial crumple as a fraction of `r`. Zero where the foil is glued flat. */
  readonly jitter: number
}

const hash1 = (a: number, b: number, seed: number): number => {
  const s = Math.sin(a * 127.1 + b * 311.7 + seed * 74.7) * 43758.5453123
  return s - Math.floor(s)
}

/**
 * An open crumpled tube of revolution-ish rows.
 *
 * A lathe cannot crumple: every column shares one radius, so gold foil comes out as a turned cone with
 * ring highlights. Perturbing radius per column instead breaks the highlight into the vertical flutes
 * that actually identify foil, and the fold phase drifts with height so the flutes meander rather than
 * reading as machined splines.
 */
function crumpledSleeve(
  rows: readonly SleeveRow[],
  height: number,
  segments: number,
  creases: number,
  seed: number,
): BufferGeometry {
  const positions: number[] = []
  const indices: number[] = []
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!
    const phase = (i / Math.max(1, rows.length - 1)) * 2.1 + seed * 0.37
    for (let j = 0; j < segments; j++) {
      const a = (j / segments) * Math.PI * 2
      const fold =
        Math.cos(creases * a + phase) * 0.64 + Math.cos(creases * 1.618 * a - phase * 1.4) * 0.33
      const grain = hash1(j, i, seed) * 2 - 1
      const r = row.r * (1 + row.jitter * (fold + grain * 0.15))
      positions.push(Math.cos(a) * r, row.y * height, Math.sin(a) * r)
    }
  }
  for (let i = 0; i < rows.length - 1; i++) {
    for (let j = 0; j < segments; j++) {
      const a = i * segments + j
      const b = i * segments + ((j + 1) % segments)
      indices.push(a, a + segments, b + segments, a, b + segments, b)
    }
  }
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  return geometry
}

export function createModel(options: F1ChampagneOptions = {}): F1ChampagneInstance {
  const config: F1ChampagneConfig = {
    height: Math.max(0.22, options.height ?? defaults.height),
  }
  const bundle = acquireF1Materials()
  const glassMat = new MeshPhysicalMaterial({
    name: 'f1-kit / magnum glass',
    color: GREEN,
    roughness: 0.15,
    metalness: 0,
    ior: 1.52,
    specularIntensity: 1,
    clearcoat: 1,
    clearcoatRoughness: 0.09,
    sheen: 0.5,
    sheenRoughness: 0.35,
    sheenColor: 0x3a6b48,
  })
  const goldMat = new MeshPhysicalMaterial({
    name: 'f1-kit / magnum foil',
    color: GOLD,
    roughness: 0.38,
    metalness: 0.86,
  })
  const trimMat = new MeshPhysicalMaterial({
    name: 'f1-kit / magnum gold trim',
    color: GOLD_TRIM,
    roughness: 0.17,
    metalness: 0.95,
  })
  const creamMat = new MeshPhysicalMaterial({
    name: 'f1-kit / magnum label',
    color: CREAM,
    roughness: 0.62,
    metalness: 0.02,
    sheen: 0.3,
    sheenRoughness: 0.7,
  })
  const corkMat = new MeshPhysicalMaterial({
    name: 'f1-kit / magnum cork',
    color: CORK,
    roughness: 0.95,
    metalness: 0,
  })
  const extras: Material[] = [glassMat, goldMat, trimMat, creamMat, corkMat]
  const materialSlots: Record<Slot, Material> = {
    glass: options.materials?.glass ?? glassMat,
    cage: options.materials?.cage ?? goldMat,
  }
  const root = new Group(); root.name = 'f1-champagne'
  const glass = new Group(); glass.name = 'glass'
  const cage = new Group(); cage.name = 'cage'
  root.add(glass, cage)
  const generated: BufferGeometry[] = []
  const meshesBySlot: Record<Slot, Mesh[]> = { glass: [], cage: [] }
  const releaseGenerated = (): void => {
    glass.clear(); cage.clear()
    for (const geometry of generated) geometry.dispose()
    generated.length = 0
    for (const slot of Object.keys(meshesBySlot) as Slot[]) meshesBySlot[slot].length = 0
  }
  const emit = (slot: Slot, geometry: BufferGeometry, group: Group, name: string, material?: Material): void => {
    generated.push(geometry)
    const mesh = new Mesh(geometry, material ?? materialSlots[slot])
    mesh.name = name
    mesh.userData.topologyRole = name === 'bottle' || name === 'body' ? 'hull' : 'detail'
    mesh.castShadow = true
    mesh.receiveShadow = true
    meshesBySlot[slot].push(mesh)
    group.add(mesh)
  }
  const rebuild = (): void => {
    releaseGenerated()
    const h = config.height
    const k = h / CHAMPAGNE.height
    const bodyR = CHAMPAGNE.bodyR * k
    const wireR = 0.0032 * k
    // Applied layers are paper and foil: clearance must clear rule-8 LAYER_CLEARANCE (6 mm).
    const paperGap = LAYER_CLEARANCE
    const foilGap = LAYER_CLEARANCE * 1.15

    /** Outer radius of the glass at a height fraction, in world units. */
    const glassR = (yFrac: number): number => {
      const first = PROFILE[0]!
      if (yFrac <= first[0]) return first[1] * bodyR
      for (let i = 1; i < PROFILE.length; i++) {
        const [y1, r1] = PROFILE[i]!
        if (yFrac <= y1) {
          const [y0, r0] = PROFILE[i - 1]!
          const t = (yFrac - y0) / Math.max(1e-6, y1 - y0)
          return (r0 + (r1 - r0) * t) * bodyR
        }
      }
      return PROFILE[PROFILE.length - 1]![1] * bodyR
    }

    emit('glass', revolve(
      PROFILE.map(([y, r]): [number, number] => [y / GLASS_TOP, r * bodyR]),
      { yBot: 0, yTop: GLASS_TOP * h, scaleW: 1, segments: 48 },
    ), glass, 'bottle')

    // Punt: a 30 mm dome pushed up into the base. It closes the heel and carries the ring-shaped
    // contact edge that makes the base read as flat rather than as a cone.
    emit('glass', revolve(
      [
        [0.00, bodyR * 0.800],
        [0.06, bodyR * 0.792],
        [0.30, bodyR * 0.660],
        [0.62, bodyR * 0.430],
        [0.86, bodyR * 0.210],
        [1.00, bodyR * 0.030],
      ],
      { yBot: 0, yTop: 0.085 * h, scaleW: 1, segments: 48 },
    ), glass, 'punt')

    // Body label and its gold edge trim. Same segment count as the glass so the polygonal
    // cross-sections stay concentric instead of interleaving.
    const labelBot = 0.230
    const labelTop = 0.450
    emit('glass', revolve(
      [
        [0.00, bodyR + paperGap],
        [1.00, bodyR + paperGap],
      ],
      { yBot: labelBot * h, yTop: labelTop * h, scaleW: 1, segments: 48 },
    ), glass, 'label', creamMat)
    for (const [y0, y1] of [[labelBot, labelBot + 0.012], [labelTop - 0.012, labelTop]] as const) {
      emit('glass', revolve(
        [
          [0.00, bodyR + paperGap + LAYER_CLEARANCE],
          [1.00, bodyR + paperGap + LAYER_CLEARANCE],
        ],
        { yBot: y0 * h, yTop: y1 * h, scaleW: 1, segments: 48 },
      ), glass, 'label-trim', trimMat)
    }
    for (const at of [0.78] as const) {
      const y0 = labelBot + (labelTop - labelBot) * at
      emit('glass', revolve(
        [
          [0.00, bodyR + paperGap + LAYER_CLEARANCE * 1.5],
          [1.00, bodyR + paperGap + LAYER_CLEARANCE * 1.5],
        ],
        { yBot: y0 * h, yTop: (y0 + 0.008) * h, scaleW: 1, segments: 48 },
      ), glass, 'label-rule', trimMat)
    }

    // Gold foil sleeve. Glued flat at the hem, loosest where a hand grips it, drawn back in at the
    // torn upper edge that leaves the collar and muselet exposed.
    const foilBot = 0.700
    const foilTop = 0.902
    const foilRows: SleeveRow[] = []
    const foilRowCount = 26
    for (let i = 0; i < foilRowCount; i++) {
      const t = i / (foilRowCount - 1)
      const y = foilBot + (foilTop - foilBot) * t
      const bulge = (t - 0.1) / 0.09
      const hem = t < 0.06 ? 1 : 1 + 0.055 * Math.exp(-(bulge * bulge))
      const jitter =
        t < 0.05 ? 0.012 : t > 0.92 ? 0.028 : 0.05 + 0.088 * Math.sin(Math.PI * ((t - 0.05) / 0.87))
      foilRows.push({ y, r: (glassR(y) + foilGap) * hem, jitter })
    }
    emit('cage', crumpledSleeve(foilRows, h, 44, 6, 3), cage, 'foil')

    // Cork mushroom head, then the muselet plaque capping it.
    emit('cage', revolve(
      [
        [0.00, bodyR * 0.285],
        [0.12, bodyR * 0.360],
        [0.28, bodyR * 0.395],
        [0.60, bodyR * 0.404],
        [0.82, bodyR * 0.386],
        [0.94, bodyR * 0.340],
        [1.00, bodyR * 0.268],
      ],
      { yBot: 0.946 * h, yTop: 0.990 * h, scaleW: 1, segments: 32 },
    ), cage, 'cork', corkMat)
    emit('cage', revolve(
      [
        [0.00, bodyR * 0.414],
        [0.30, bodyR * 0.408],
        [0.62, bodyR * 0.382],
        [0.86, bodyR * 0.286],
        [1.00, bodyR * 0.020],
      ],
      { yBot: 0.9775 * h, yTop: 0.9945 * h, scaleW: 1, segments: 32 },
    ), cage, 'plaque', goldMat)

    // Muselet: four legs bowed out over the string rim, a hoop captured beneath it, and the twisted
    // wire tail you undo first.
    const wires: BufferGeometry[] = []
    const hoopY = 0.918
    const hoopR = glassR(hoopY) + foilGap + LAYER_CLEARANCE * 2 + wireR
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + 0.72
      const cx = Math.cos(a)
      const cz = Math.sin(a)
      const leg: Array<readonly [number, number]> = [
        [hoopR, hoopY],
        [bodyR * 0.390, 0.9210],
        [bodyR * 0.393, 0.9350],
        [bodyR * 0.412, 0.9480],
        [bodyR * 0.438, 0.9640],
        [bodyR * 0.448, 0.9775],
        [bodyR * 0.410, 0.9880],
        [bodyR * 0.286, 0.9925],
        [bodyR * 0.105, 0.9972],
      ]
      wires.push(taperedTube(
        leg.map(([r, y]) => new Vector3(cx * r, y * h, cz * r)),
        wireR,
        6,
      ))
    }
    wires.push(taperedTube(
      Array.from({ length: 25 }, (_, i) => {
        const a = (i / 24) * Math.PI * 2
        return new Vector3(Math.cos(a) * hoopR, hoopY * h, Math.sin(a) * hoopR)
      }),
      wireR * 0.92,
      6,
    ))
    const knotA = -0.1
    wires.push(taperedTube(
      Array.from({ length: 15 }, (_, i) => {
        const t = i / 14
        const a = knotA - 0.3 + t * 0.6
        const spin = t * Math.PI * 3.5
        const radial = hoopR + Math.cos(spin) * bodyR * 0.11
        return new Vector3(Math.cos(a) * radial, (hoopY + Math.sin(spin) * 0.0055) * h, Math.sin(a) * radial)
      }),
      wireR * 0.85,
      6,
    ))
    wires.push(taperedTube(
      Array.from({ length: 13 }, (_, i) => {
        const t = i / 12
        const a = t * Math.PI * 3.2
        const radial = bodyR * 0.06 * (1 - t * 0.5)
        return new Vector3(Math.cos(a) * radial, (0.9930 + t * 0.0070) * h, Math.sin(a) * radial)
      }),
      wireR * 0.8,
      6,
    ))
    emit('cage', mergeParts(wires, 'f1-champagne: muselet'), cage, 'muselet')
  }
  rebuild()
  return {
    root,
    parts: { glass, cage },
    materials: materialSlots,
    getConfig: () => ({ ...config }),
    configure(patch) {
      if (patch.height !== undefined) config.height = Math.max(0.22, patch.height)
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
      extras.length = 0
      disposeF1Materials(bundle)
      root.removeFromParent()
    },
  }
}

export function createPreview({ aspect }: { aspect: number; time?: number }) {
  return createF1Preview(createModel(), {
    aspect, target: [0, 0.178, 0], distance: 0.92, fov: 28, yaw: -0.5, pitch: 0.12,
  })
}
