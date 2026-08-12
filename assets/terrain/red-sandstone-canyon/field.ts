/**
 * Authoritative signed distance recipe for red sandstone canyon rock.
 *
 * Formation intent: stratified aeolian sandstone as it appears in a canyon -
 * horizontally bedded, cut into vertical fins and walls, with hard beds standing
 * out as ledges and soft beds weathered back into shadowed recesses. This is a
 * fundamentally different structure from the granite recipe next door, and the
 * difference is not cosmetic: granite is isotropic and fails along joint planes
 * in three directions, whereas sandstone is layered, so its dominant structure is
 * a *stack* and every read depends on that stack being legible.
 *
 * The three rules from the granite recipe still hold (Nyquist per band, fold
 * safety, never displace a resampled field), and one more is specific to strata:
 *
 * 4. Bedding is boolean, never displacement. A ledge is a step in the surface,
 *    and a step of depth A over a transition height h has gradient A/h, so any
 *    displacement sharp enough to read as a ledge is past the fold limit by
 *    construction. Beds are therefore cut as a union of laterally inset slabs,
 *    which is gradient-free at any sharpness and can even undercut. What limits
 *    them instead is grid resolution: two step edges closer together than a
 *    couple of voxels cannot both survive extraction, so `bedBudget` measures the
 *    thinnest bed in voxels and the compiler reports it.
 *
 * Performance contract is inherited: nothing allocates on the hot path.
 */

import {
  boxoid,
  fbm,
  hash01,
  normalize,
  ridged,
  smax,
  smin,
  worleyBorder,
  type Vec3,
} from '../shared/noise.ts'

export { fbm, hash01, normalize, ridged, worleyBorder }
export type { Vec3 }

/** Domain half-extent maps to this many metres along X after materialization. */
export const DOMAIN_TO_METRES_X = 3.4

/**
 * Canyon rock appears in three shapes, and they are not interchangeable: a
 * corridor needs walls, a floor needs collapsed blocks, and the middle distance
 * needs freestanding stacks or the assembly reads as a trench rather than a
 * canyon.
 *
 * Formation is derived from the seed rather than passed as an argument so that
 * every downstream signature - extractor, bake, LOD chain - stays identical to
 * the granite pipeline's and no plumbing has to know this recipe is polymorphic.
 */
export type Formation = 'wall' | 'butte' | 'block'

export function formationOf(seed: number): Formation {
  const normalized = Math.max(1, Math.floor(seed))
  if (normalized <= 4) return 'wall'
  if (normalized <= 7) return 'butte'
  return 'block'
}

// --- bedded mass --------------------------------------------------------------

interface MassParameters {
  formation: Formation
  /** Plan-view half-extents of the unweathered column. */
  radiusX: number
  radiusZ: number
  /** Flat [y0, y1, inset, hardness] per bed, bottom first. */
  beds: Float64Array
  bedCount: number
  thinnestBed: number
  /** Flat [nx, ny, nz, limit, blend] per near-vertical joint plane. */
  joints: Float64Array
  jointCount: number
  /** Flat [cx, cy, cz, rx, ry, rz, blend] per seep alcove. */
  alcoves: Float64Array
  alcoveCount: number
  /** Rounding radius applied when unioning beds, in domain units. */
  lipBlend: number
  /** Amplitude of the plan-view outline meander. */
  meander: number
}

const massParameterCache = new Map<number, MassParameters>()

/**
 * Floor on bed thickness in domain units.
 *
 * Set from the grid, not from taste: at the LOD0 grid this must stay above about
 * two voxels or the bed's two step edges land in one cell, where a single vertex
 * per cell cannot represent both. `bedBudget` reports the actual margin.
 */
export const MINIMUM_BED_THICKNESS = 0.14

/**
 * Vertical interpenetration between neighbouring beds, in domain units.
 *
 * Must exceed the displacement amplitude surviving at a bed boundary, or the
 * boundary sheet reopens. It is not free: in the overlap zone the union takes
 * whichever bed is prouder, so a recessed bed loses this much exposed height at
 * each end. That is why the lip guard drives displacement toward zero at
 * boundaries - a strong guard buys a small overlap, and a small overlap is what
 * keeps thin beds from being eaten by their neighbours.
 */
const BED_OVERLAP = 0.015

/**
 * The stack is the asset. Bed thickness and hardness are drawn per bed, and
 * `inset` - how far the bed has weathered back from the unweathered column face -
 * is derived from hardness alone. That single dependency is what produces the
 * canyon read: a hard bed stands proud, the soft bed beneath it retreats, and the
 * hard bed above it is left as an overhanging lip.
 *
 * Thickness is floored well above the grid limit rather than drawn freely. A bed
 * thinner than a couple of voxels is not a thin bed in the output, it is a
 * tangled one, and the tangle shows up as fins and holes rather than as detail.
 */
function buildMassParameters(seed: number): MassParameters {
  const formation = formationOf(seed)
  const pick = (index: number) => hash01(seed, index, 131, 0x9e3779b1)

  // Plan-view section. A wall is a fin: wide, thin, and read from one side. A
  // butte is a stack, roughly square. A block is a collapsed slab, squatter and
  // fatter, and the scene rolls it so its bedding tilts.
  const sections = {
    wall: { radiusX: 0.88, radiusZ: 0.38, beds: 15, recess: 0.1, lip: 0.006, meander: 0.04 },
    butte: { radiusX: 0.6, radiusZ: 0.56, beds: 12, recess: 0.085, lip: 0.008, meander: 0.05 },
    block: { radiusX: 0.76, radiusZ: 0.7, beds: 6, recess: 0.06, lip: 0.022, meander: 0.06 },
  } as const
  const section = sections[formation]
  const radiusX = section.radiusX + (pick(1) - 0.5) * 0.06
  const radiusZ = section.radiusZ + (pick(2) - 0.5) * 0.05

  // Keep the stack strictly inside the domain. A solid that touches the sampling
  // boundary is clipped open there, and an open boundary is not a hole the repair
  // pass can close - it is a missing face the size of the domain wall.
  const bottom = -0.94
  const ceiling = 0.92
  const minimumThickness = MINIMUM_BED_THICKNESS

  const beds: number[] = []
  let cursor = bottom
  let thinnest = Infinity
  let index = 0
  while (cursor < ceiling && index < section.beds) {
    const span = (ceiling - bottom) / section.beds
    const thickness = Math.max(minimumThickness, span * (0.55 + pick(20 + index) * 1.15))
    const top = Math.min(ceiling, cursor + thickness)
    if (top - cursor < minimumThickness * 0.9) break

    // Hardness drives everything visible. Biased so hard beds are the minority:
    // a stack where every bed protrudes equally is a fluted column, not strata.
    let hardness = pick(60 + index)
    hardness *= hardness
    // Every third or fourth bed is a resistant ledge former, which is what gives
    // the stack a rhythm instead of a random jitter.
    if (index % 3 === 1) hardness = 0.72 + pick(90 + index) * 0.28
    // The top bed is the caprock. A butte only survives as a butte because
    // something resistant protects it from above, and a canyon wall only holds a
    // clean plateau rim for the same reason - so both get a hard top bed, which is
    // what lets neighbouring wall segments share one continuous skyline.
    if (
      (formation === 'butte' || formation === 'wall')
      && cursor + thickness >= ceiling - 1e-6
    ) hardness = 1

    const inset = (1 - hardness) * section.recess
    beds.push(cursor, top, inset, hardness)
    thinnest = Math.min(thinnest, top - cursor)
    cursor = top
    index += 1
  }

  // Near-vertical joints. Sandstone canyons are cut along vertical fractures, and
  // those fractures are what turns a bedded mound into a wall with hard corners.
  // Constrained steep: a plane with much vertical component would shear the stack
  // diagonally and destroy the horizontality the formation depends on.
  const joints: number[] = []
  const addJoint = (normal: Vec3, support: number, blend: number) => {
    const unit = normalize(normal)
    const extent = Math.sqrt(
      (unit[0] * radiusX) ** 2 + (unit[1] * 0.95) ** 2 + (unit[2] * radiusZ) ** 2,
    )
    // Offsets are a fraction of the mass's own extent along the normal, so every
    // plane is guaranteed to cut rather than graze.
    joints.push(unit[0], unit[1], unit[2], extent * support, blend)
  }
  const jointCount = formation === 'wall' ? 7 : 5
  for (let joint = 0; joint < jointCount; joint += 1) {
    const theta = (joint / jointCount) * Math.PI * 2 + pick(120 + joint) * 1.1
    addJoint(
      [Math.cos(theta), (pick(140 + joint) - 0.5) * 0.26, Math.sin(theta)],
      0.72 + pick(160 + joint) * 0.24,
      0.002 + pick(180 + joint) * 0.005,
    )
  }
  // A hard base plane, so the formation sits on a face and beds meet the ground
  // squarely instead of the lowest bed tapering to a point.
  //
  // Support is near 1 deliberately. At the granite recipe's 0.62 this plane cut
  // at y = -0.59 and removed the bottom third of the stack - four beds - which is
  // invisible in a front render and only showed up as a section through the mass.
  addJoint([0.02, -0.99, 0.03], 0.96, 0.005)

  // Seep alcoves: water emerging at a permeability contrast undercuts the soft
  // bed above it and leaves a domed overhang. Centres sit at or beyond the
  // surface - a centre inside the mass hollows it into a shell, which reads as a
  // cave from behind and sheds thin plates as detached debris.
  const alcoveCount = formation === 'block' ? 1 : 3
  const alcoves = new Float64Array(alcoveCount * 7)
  for (let alcove = 0; alcove < alcoveCount; alcove += 1) {
    const theta = pick(200 + alcove) * Math.PI * 2
    const radius = 0.22 + pick(220 + alcove) * 0.2
    const distance = 0.94 + radius * (0.68 + pick(240 + alcove) * 0.3)
    alcoves[alcove * 7] = Math.cos(theta) * distance * radiusX
    // Low on the face: alcoves form where a seep line meets the wall, and a seep
    // line is near the base of the exposed section.
    alcoves[alcove * 7 + 1] = -0.55 + pick(260 + alcove) * 0.75
    alcoves[alcove * 7 + 2] = Math.sin(theta) * distance * radiusZ
    alcoves[alcove * 7 + 3] = radius
    alcoves[alcove * 7 + 4] = radius * (0.7 + pick(280 + alcove) * 0.6)
    alcoves[alcove * 7 + 5] = radius * (0.7 + pick(300 + alcove) * 0.6)
    alcoves[alcove * 7 + 6] = 0.012 + pick(320 + alcove) * 0.02
  }

  return {
    formation,
    radiusX,
    radiusZ,
    beds: new Float64Array(beds),
    bedCount: beds.length / 4,
    thinnestBed: thinnest === Infinity ? 0 : thinnest,
    joints: new Float64Array(joints),
    jointCount: joints.length / 5,
    alcoves,
    alcoveCount,
    lipBlend: section.lip,
    meander: section.meander,
  }
}

function massParameters(seed: number): MassParameters {
  let cached = massParameterCache.get(seed)
  if (!cached) {
    cached = buildMassParameters(seed)
    massParameterCache.set(seed, cached)
  }
  return cached
}

export function bedCount(seed: number): number {
  return massParameters(seed).bedCount
}

export function jointCount(seed: number): number {
  return massParameters(seed).jointCount
}

export interface BedBudget {
  cells: number
  voxel: number
  thinnestBedDomain: number
  /** Thinnest bed measured in voxels. Below ~2 the bed cannot survive extraction. */
  thinnestBedVoxels: number
  representable: boolean
}

/** Whether the grid can actually carry the stack it is being asked to extract. */
export function bedBudget(seed: number, cells: number): BedBudget {
  const voxel = 2 / cells
  const thinnest = massParameters(seed).thinnestBed
  return {
    cells,
    voxel,
    thinnestBedDomain: thinnest,
    thinnestBedVoxels: thinnest / voxel,
    representable: thinnest / voxel >= 2,
  }
}

/**
 * Plan-view section of the column, as a 2D signed distance in XZ.
 *
 * Exponent 4 rather than 2 so the section has flattish faces and defined
 * corners. A canyon wall in plan is not an ellipse; it is a slab with corners
 * where joints intersect.
 */
function section(x: number, z: number, radiusX: number, radiusZ: number): number {
  const ax = x / radiusX
  const az = z / radiusZ
  const sx = ax * ax
  const sz = az * az
  const sum = sx * sx + sz * sz
  const normalized = Math.sqrt(Math.sqrt(sum))
  return (normalized - 1) * (radiusX < radiusZ ? radiusX : radiusZ)
}

/**
 * Low-frequency authored mass: the bedded stack, jointed and undercut.
 *
 * The final read must already exist here. The displacement bands below only add
 * character to faces this function has already shaped, and no amount of band
 * amplitude can rescue a mass that does not already read as strata.
 */
export function massSdf(x: number, y: number, z: number, seed: number): number {
  const parameters = massParameters(seed)

  // Plan-view meander, so the wall is not a straight extrusion. Kept low
  // amplitude: this term is part of the mass rather than a displacement band, so
  // it is not covered by the band fold budget and has to be conservative on its
  // own. `fieldDiagnostics` measures the total field gradient to catch it.
  // The Y coefficient is deliberately far below the XZ one. Beds do pinch and
  // swell, but when the outline shifts as fast as the beds are thick, the lateral
  // wander swamps the hardness-driven recess and the stack stops reading as
  // strata at all - a plan-section overlay of a hard bed against a soft one
  // showed the two offset sideways rather than concentrically inset.
  const meander = fbm(x * 1.25 + 5.3, y * 0.2, z * 1.25, seed + 17, 3) * parameters.meander
  const lateral = section(x, z, parameters.radiusX, parameters.radiusZ) + meander

  // Union of laterally inset slabs. This is the bedding, and it is boolean: a
  // ledge lip is a genuine step, and a soft bed under a hard one genuinely
  // undercuts, neither of which any displacement could express and stay unfolded.
  //
  // Each slab is grown vertically by BED_OVERLAP so that neighbouring beds
  // interpenetrate rather than merely abut. This is not a tuning knob, it fixes a
  // real defect: `min` unions the *exterior* distance correctly but two solids
  // that only touch report distance 0 along their shared plane, even deep inside
  // the union. Subtracting displacement there flipped the field positive and cut
  // a one-voxel-thick sheet across the wall at every bed boundary, splitting it
  // into 70 disconnected plates - 8.9% of the dense mesh. Measured directly: at a
  // boundary the mass read -0.0017 where the beds either side read -0.011.
  const beds = parameters.beds
  let distance = Infinity
  for (let index = 0; index < parameters.bedCount; index += 1) {
    const offset = index * 4
    const below = beds[offset]! - y
    const above = y - beds[offset + 1]!
    const slab = (below > above ? below : above) - BED_OVERLAP
    const inset = lateral + beds[offset + 2]!
    const bed = slab > inset ? slab : inset
    distance = smin(distance, bed, parameters.lipBlend)
  }

  // Vertical joints, cutting the stack into a fin with hard corners.
  const joints = parameters.joints
  for (let index = 0; index < parameters.jointCount; index += 1) {
    const offset = index * 5
    const plane = x * joints[offset]! + y * joints[offset + 1]! + z * joints[offset + 2]!
      - joints[offset + 3]!
    distance = smax(distance, plane, joints[offset + 4]!)
  }

  // Seep alcoves.
  const alcoves = parameters.alcoves
  for (let index = 0; index < parameters.alcoveCount; index += 1) {
    const offset = index * 7
    distance = smax(distance, -boxoid(
      x - alcoves[offset]!, y - alcoves[offset + 1]!, z - alcoves[offset + 2]!,
      alcoves[offset + 3]!, alcoves[offset + 4]!, alcoves[offset + 5]!,
    ), alcoves[offset + 6]!)
  }

  return distance
}

/**
 * Hardness of the bed containing a point, in [0, 1].
 *
 * Baked as a `region-mask` channel so the material's colour banding lands on the
 * same boundaries the geometry was cut at. Deriving the banding from world Y in
 * the shader instead cannot land on them - the bed edges are irregular in Y once
 * jointed and weathered - and the colour visibly slides off the ledges.
 */
export function bedHardness(x: number, y: number, z: number, seed: number): number {
  const parameters = massParameters(seed)
  const beds = parameters.beds
  for (let index = 0; index < parameters.bedCount; index += 1) {
    const offset = index * 4
    if (y >= beds[offset]! && y <= beds[offset + 1]!) return beds[offset + 3]!
  }
  // Above or below the stack: report the nearer end rather than a neutral value,
  // so the ground contact and the cap do not read as a different rock.
  if (parameters.bedCount === 0) return 0.5
  return y < beds[0]! ? beds[3]! : beds[(parameters.bedCount - 1) * 4 + 3]!
}

// --- displacement bands -------------------------------------------------------

export interface OctaveBudget {
  cells: number
  voxel: number
  minimumWavelength: number
  bands: string[]
  bakeOnly: string[]
}

interface Band {
  name: string
  wavelength: number
  amplitude: number
  evaluate(x: number, y: number, z: number, seed: number): number
}

/**
 * Displacement bands, coarsest first. Every band returns roughly [-1, 1] and is
 * scaled by its own amplitude, so `amplitude / wavelength` reads as the
 * fold-safety ratio at a glance.
 *
 * All three are strongly anisotropic, sampled with Y compressed relative to XZ.
 * That is the whole difference between sandstone and granite at this scale:
 * water runs down a wall, so its marks are long vertically and narrow
 * horizontally. Isotropic noise on a canyon wall reads as lichen-covered granite
 * no matter how the colour is graded.
 */
const BANDS: Band[] = [
  {
    // Vertical fluting: the broad rounded ribs and gullies runoff cuts into a
    // wall face over its whole height.
    name: 'macro-fluting',
    wavelength: 0.52,
    // Amplitude spends the fold headroom the boolean bedding leaves free. At
    // 0.036 the measured mean band gradient was 0.34 against the granite
    // recipe's 0.51, so this band was under-driven rather than at its limit.
    amplitude: 0.044,
    evaluate: (x, y, z, seed) => {
      const wx = x + fbm(x * 0.9 + 2.7, y * 0.3, z * 0.9, seed + 23, 3) * 0.35
      const wz = z + fbm(x * 0.95, y * 0.32, z * 0.95 + 7.1, seed + 61, 3) * 0.35
      // Y frequency an order below XZ: flutes are long streaks, not blobs.
      const flute = ridged(wx * 2.3, y * 0.34, wz * 2.3, seed + 149, 3)
      const broad = fbm(wx * 1.7, y * 0.55, wz * 1.7, seed + 107, 3) * 2
      return broad * 0.4 + (flute - 0.42) * 1.2
    },
  },
  {
    // Scallops and potholes on bed faces, plus the granular retreat of soft beds.
    name: 'meso-scallop',
    wavelength: 0.19,
    amplitude: 0.015,
    evaluate: (x, y, z, seed) => {
      const warp = fbm(x * 3.1 + 4.9, y * 1.1, z * 3.1, seed + 311, 3) * 0.22
      const scoop = worleyBorder((x + warp) * 6.2, y * 3.1, (z - warp) * 6.2, seed + 397)
      const bowl = 1 - Math.min(1, scoop / 0.46)
      const rib = ridged((x + warp) * 5.1, y * 1.4, (z + warp) * 5.1, seed + 433, 2)
      const broken = fbm((x + warp) * 6.4, y * 2.6, (z + warp) * 6.4, seed + 353, 3) * 2
      return broken * 0.36 + (rib - 0.44) * 0.66 - bowl * bowl * 0.58
    },
  },
  {
    // Cross-bedding laminae: the sheared, truncated layering left by migrating
    // dunes. Sampled along a sheared coordinate so the laminae run diagonally
    // within each bed and cut against the horizontal bed boundaries, which is the
    // single most recognisable signature of aeolian sandstone.
    name: 'fine-lamina',
    wavelength: 0.072,
    amplitude: 0.0042,
    evaluate: (x, y, z, seed) => {
      const shear = 0.42
      const laminaY = y * 17 + x * shear * 17 + z * shear * 8
      const lamina = ridged(x * 3.2, laminaY, z * 3.2, seed + 521, 2)
      const grit = fbm(x * 11.5, y * 6.5, z * 11.5, seed + 587, 3) * 2
      const chip = worleyBorder(x * 13.5, y * 7.5, z * 13.5, seed + 619)
      const flake = 1 - Math.min(1, chip / 0.44)
      return grit * 0.34 - (lamina - 0.4) * 0.78 - flake * flake * 0.4
    },
  },
]

export function octaveBudget(cells: number): OctaveBudget {
  const voxel = 2 / cells
  const minimumWavelength = voxel * 3
  return {
    cells,
    voxel,
    minimumWavelength,
    bands: BANDS.filter((band) => band.wavelength >= minimumWavelength).map((band) => band.name),
    bakeOnly: BANDS.filter((band) => band.wavelength < minimumWavelength).map((band) => band.name),
  }
}

/**
 * Displacement amplitude as a fraction of nominal, from the local bed.
 *
 * Two jobs, and they happen to be the same function.
 *
 * Physically: soft beds are the ones that weather, so they should carry most of
 * the surface texture, and a resistant ledge former should stay comparatively
 * smooth. Applying one amplitude everywhere is what makes a bedded surface read
 * as uniformly noisy rock with stripes painted on.
 *
 * Structurally: displacement across a boolean step can detach the step. A ledge
 * lip is a thin feature bounded by two step faces, and subtracting relief
 * comparable to the step depth near that lip pinches it off into a free-floating
 * shell. The first canyon compile shed 12,196 stray triangles from the dense mesh
 * (2.6% of it, against 0.03% for the granite recipe) for exactly this reason.
 *
 * Both parts must be smooth in Y. Multiplying displacement by the piecewise
 * constant `bedHardness` would make the field itself discontinuous at every bed
 * boundary - an uncontrolled step of infinite gradient at the exact place the
 * geometry is already most fragile - so hardness is blended across boundaries and
 * the lip guard ramps with a smoothstep.
 */
const LIP_TRANSITION = 0.045

function bedAttenuation(y: number, seed: number): number {
  const parameters = massParameters(seed)
  const beds = parameters.beds
  const count = parameters.bedCount
  if (count === 0) return 1

  let index = -1
  for (let bed = 0; bed < count; bed += 1) {
    if (y >= beds[bed * 4]! && y <= beds[bed * 4 + 1]!) { index = bed; continue }
  }
  if (index < 0) {
    // Outside the stack: no lip to protect, and the nearest bed's hardness stands.
    const hardness = y < beds[0]! ? beds[3]! : beds[(count - 1) * 4 + 3]!
    return 1.15 - hardness * 0.62
  }

  const hardness = beds[index * 4 + 3]!
  const fromBelow = y - beds[index * 4]!
  const fromAbove = beds[index * 4 + 1]! - y
  const edge = fromBelow < fromAbove ? fromBelow : fromAbove
  const neighbour = fromBelow < fromAbove ? index - 1 : index + 1
  const neighbourHardness = neighbour < 0 || neighbour >= count
    ? hardness
    : beds[neighbour * 4 + 3]!

  const t = edge >= LIP_TRANSITION ? 1 : edge / LIP_TRANSITION
  const ramp = t * t * (3 - 2 * t)
  // Halfway to the neighbour's hardness exactly on the boundary, which is what
  // makes the blend continuous across it.
  const blended = hardness + (neighbourHardness - hardness) * (1 - ramp) * 0.5
  // Near zero on the boundary itself. The bed overlap that closes the boundary
  // sheet costs exposed bed height, so it has to stay small, and it can only stay
  // small if there is almost no displacement left at the boundary to reopen it.
  const lipGuard = 0.08 + 0.92 * ramp
  return (1.15 - blended * 0.62) * lipGuard
}

export function displacement(
  x: number,
  y: number,
  z: number,
  seed: number,
  minimumWavelength = 0,
): number {
  let total = 0
  for (let index = 0; index < BANDS.length; index += 1) {
    const band = BANDS[index]!
    if (band.wavelength < minimumWavelength) continue
    total += band.evaluate(x, y, z, seed) * band.amplitude
  }
  return total * bedAttenuation(y, seed)
}

/**
 * Relief below the mesh's Nyquist limit: sand grain and tafoni, the honeycomb
 * cavernous weathering that pits sheltered sandstone faces. Evaluated only in
 * texture space by the bake compiler, where the sampling rate can carry it.
 */
export function microRelief(x: number, y: number, z: number, seed: number): number {
  const grain = fbm(x * 41, y * 41, z * 41, seed + 701, 3) * 2
  const honeycomb = worleyBorder(x * 26, y * 26, z * 26, seed + 757)
  const pit = 1 - Math.min(1, honeycomb / 0.4)
  const dust = ridged(x * 63, y * 63, z * 63, seed + 811, 2)
  return grain * 0.0019 - pit * pit * 0.0026 + (dust - 0.44) * 0.0011
}

/** The authoritative surface: bedded mass minus the representable bands. */
export function surfaceSdf(
  x: number,
  y: number,
  z: number,
  seed: number,
  minimumWavelength = 0,
): number {
  return massSdf(x, y, z, seed) - displacement(x, y, z, seed, minimumWavelength)
}

/**
 * The surface at full detail: every band plus the sub-Nyquist micro relief. No
 * extracted mesh can represent this, which is exactly why it is the target the
 * surface bake traces against.
 */
export function detailedSdf(x: number, y: number, z: number, seed: number): number {
  return massSdf(x, y, z, seed)
    - displacement(x, y, z, seed, 0)
    - microRelief(x, y, z, seed)
}

/** Unit normal of `detailedSdf`, by tetrahedral differences (four evaluations). */
export function detailedNormal(
  x: number, y: number, z: number,
  seed: number,
  step: number,
): Vec3 {
  const base = detailedSdf(x + step, y + step, z + step, seed)
  const dx = detailedSdf(x + step, y - step, z - step, seed)
  const dy = detailedSdf(x - step, y + step, z - step, seed)
  const dz = detailedSdf(x - step, y - step, z + step, seed)
  const nx = base + dx - dy - dz
  const ny = base - dx + dy - dz
  const nz = base - dx - dy + dz
  const length = Math.sqrt(nx * nx + ny * ny + nz * nz)
  if (length < 1e-12) return [0, 1, 0]
  return [nx / length, ny / length, nz / length]
}

/** Band-limited view for the extractor; full-detail view for the bake. */
export const canyonMeshField = {
  sdf: surfaceSdf,
  octaveBudget,
}

export const canyonDetailField = {
  sdf: detailedSdf,
  normal: detailedNormal,
  regionMask: bedHardness,
}

export interface FieldDiagnostics {
  peakDisplacement: number
  meanNearSurfaceGradient: number
  maximumNearSurfaceGradient: number
  foldedFraction: number
  /**
   * Mean |grad| of the whole field near the surface. A true distance field
   * measures 1. Sphere tracing in the bake assumes the value is a conservative
   * distance, so a mean well above 1 means the trace can overshoot thin features
   * and silently miss them - a failure that shows up as flat patches in the bake
   * rather than as an error.
   */
  meanFieldGradient: number
  maximumFieldGradient: number
}

export function fieldDiagnostics(
  seed: number,
  minimumWavelength = 0,
  samples = 20000,
): FieldDiagnostics {
  const step = 1e-3
  let peak = 0
  let gradientSum = 0
  let gradientMax = 0
  let fieldSum = 0
  let fieldMax = 0
  let folded = 0
  let counted = 0
  for (let index = 0; index < samples; index += 1) {
    const x = hash01(index, 1, seed, 0x1b56c4e9) * 2 - 1
    const y = hash01(index, 2, seed, 0x1b56c4e9) * 2 - 1
    const z = hash01(index, 3, seed, 0x1b56c4e9) * 2 - 1
    peak = Math.max(peak, Math.abs(displacement(x, y, z, seed, minimumWavelength)))
    if (Math.abs(massSdf(x, y, z, seed)) > 0.12) continue
    const dx = displacement(x + step, y, z, seed, minimumWavelength)
      - displacement(x - step, y, z, seed, minimumWavelength)
    const dy = displacement(x, y + step, z, seed, minimumWavelength)
      - displacement(x, y - step, z, seed, minimumWavelength)
    const dz = displacement(x, y, z + step, seed, minimumWavelength)
      - displacement(x, y, z - step, seed, minimumWavelength)
    const magnitude = Math.sqrt(dx * dx + dy * dy + dz * dz) / (2 * step)
    gradientSum += magnitude
    gradientMax = Math.max(gradientMax, magnitude)
    if (magnitude > 1) folded += 1

    const fx = surfaceSdf(x + step, y, z, seed, minimumWavelength)
      - surfaceSdf(x - step, y, z, seed, minimumWavelength)
    const fy = surfaceSdf(x, y + step, z, seed, minimumWavelength)
      - surfaceSdf(x, y - step, z, seed, minimumWavelength)
    const fz = surfaceSdf(x, y, z + step, seed, minimumWavelength)
      - surfaceSdf(x, y, z - step, seed, minimumWavelength)
    const fieldMagnitude = Math.sqrt(fx * fx + fy * fy + fz * fz) / (2 * step)
    fieldSum += fieldMagnitude
    fieldMax = Math.max(fieldMax, fieldMagnitude)
    counted += 1
  }
  return {
    peakDisplacement: peak,
    meanNearSurfaceGradient: counted === 0 ? 0 : gradientSum / counted,
    maximumNearSurfaceGradient: gradientMax,
    foldedFraction: counted === 0 ? 0 : folded / counted,
    meanFieldGradient: counted === 0 ? 0 : fieldSum / counted,
    maximumFieldGradient: fieldMax,
  }
}
