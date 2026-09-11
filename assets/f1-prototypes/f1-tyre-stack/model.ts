// f1-tyre-stack — a long chrome two-tier trolley packed with individually blanketed F1 tyres: the
// pit-lane landmark a garage is read by. Each padded warmer covers its tyre in black quilted fabric with
// a dished face, a hard shoulder and a flat tread wrap, and carries one bold high-vis position stripe
// around the crown — yellow on the fronts, red on the rears, in the blocks a garage loads sets in. That
// stripe is the graphic the row is recognised by from the pit wall, and it only works as a mark *on*
// black: colour the bag itself and the whole thing reads as a rack of coral drums. The outboard warmer
// faces carry the supplier's ring mark, every warmer trails a short black power lead to its connector,
// and the near course of the bottom tier goes out unbagged so the tyre's own sidewall and tread mass stay
// readable. Depends on `f1-tyre` for that anatomy while keeping stable stack-level runtime anchors and
// configuration.

import {
  BufferGeometry,
  Group,
  InstancedMesh,
  LatheGeometry,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  Vector2,
  Vector3,
  type Material,
} from 'three/webgpu'

import {
  COMPOUND_TOKEN,
  TOKEN,
  acquireF1Materials,
  arcBand,
  bevelBox,
  bevelRing,
  castor,
  createCompoundMaterial,
  createF1Preview,
  disposeF1Materials,
  mergeParts,
  shade,
  taperedTube,
} from '../f1-kit-core/index.ts'
import {
  createModel as createTyre,
  type F1Compound,
  type F1TyreInstance,
} from '../f1-tyre/model.ts'

type Slot = 'blanket' | 'strap' | 'cable'

export interface F1TyreStackConfig {
  /** Number of tyres in the stack. */
  count: number
  /** Which compound the stacked tyres are graded as, using the sport's official sidewall colour key. */
  compound: F1Compound
  /** Rim colour, passed through to every tyre's `cover` slot. */
  coverColor: number
  /** Livery accent, passed through to every tyre's `accent` slot. */
  accentColor: number
}

export interface F1TyreStackOptions extends Partial<F1TyreStackConfig> {
  materials?: Partial<Record<Slot, Material>>
}

export interface F1TyreStackInstance {
  readonly root: Group
  readonly parts: { tyres: Group; blanket: Group; cable: Group }
  readonly materials: Readonly<Record<Slot, Material>>
  getConfig(): Readonly<F1TyreStackConfig>
  configure(patch: Partial<F1TyreStackConfig>): void
  setMaterial(slot: Slot, material: Material): void
  update(deltaSeconds: number): void
  dispose(): void
}

const defaults: F1TyreStackConfig = {
  // A trolley, not a set. Four tyres on a two-tier rack leaves a frame taller than it is long, which
  // reads as a cage with two drums in it; a garage stages three sets at a time, and the long dense row
  // of courses is the whole silhouette of this prop.
  count: 12,
  compound: 'medium',
  coverColor: shade(TOKEN.INK_950, 0.04),
  // A tyre waiting on a trolley is undressed: black rubber, dark forged rim, no team colour on it
  // anywhere. Livery belongs to whoever installs the prop, so the default keeps the unbagged course
  // reading as rubber rather than putting a bright ring through the one wheel on show.
  accentColor: TOKEN.GRAPHITE_800,
}

const R = 0.36             // tyre outer radius, matching a default f1-tyre (720 mm OD)
const BLANKET_HALF = 0.18  // half a padded warmer's width, measured at its widest point
const BLANKET_R = R + 0.04 // a warmer's outer radius over the tread
const TH = 0.366           // course pitch: a warmer's full width plus a 6 mm seam

// The position stripe: 144 mm of the 308 mm tread wrap. Just under half, which is the band this shape has
// twice been wrong about in both directions — two thirds of the crown made every course a coloured drum,
// a third left the mark reading as trim. At this width the stripe dominates the lit crown at a glance
// while the shoulders and faces stay unmistakably black quilt. It stands 16 mm proud, so it also carries
// a lit side wall and a shadow line onto the fabric either side rather than relying on area alone.
const STRIPE_HALF = 0.072
const STRIPE_PROUD = 0.016
const STRIPE_BITE = 0.009  // enough to stay seated through the warmer's own surface wobble

// How many courses a colour runs for before the next block starts. A set is two fronts and two rears, a
// garage loads them in that order, and a trolley leaves with three sets on it — so the row arrives in
// blocks, not alternating course by course, which would read as a pattern rather than as staged sets.
const STRIPE_BLOCK = 3

const FRAME_HALF_D = 0.42  // frame half-depth — clear of the 0.80 m courses, so posts read in front of them
const CRADLE_Z = 0.2       // how far off centre the pair of rails each tier nests between sits
const TIER_Y = [0.56, 1.4] as const
const HOOP_TOP = 1.52      // the push handles are the only frame member that rises past the top tier
const CASTOR_R = 0.074

// Buried tyres do not need the hero tread resolution — the blanket hides most of the crown, and only the
// bottom course and the top sidewall are ever seen. This is the tyre's single LOD knob.
const STACK_TREAD_SEGMENTS = 12

// ---------------------------------------------------------------------------------------------------
// Local geometry helpers, deliberately private to this file rather than shared through f1-kit-core:
// every `.ts` under f1-kit-core ships to kit consumers as permanent public surface.
// ---------------------------------------------------------------------------------------------------

/** A solid of revolution about +Y from an absolute `[radius, y]` profile. */
function latheY(profile: ReadonlyArray<readonly [number, number]>, segments: number): BufferGeometry {
  return new LatheGeometry(profile.map(([r, y]) => new Vector2(Math.max(1e-4, r), y)), segments)
}

/** A stable per-course value in -1..1, so a dozen bagged tyres are not a dozen identical ones. */
function jitter(index: number, salt: number): number {
  return Math.sin((index + 1) * 12.9898 + salt * 4.1414)
}

/**
 * Wobble a revolve's radius as a smooth function of angle and height.
 *
 * A LatheGeometry is a machined arc by construction: every horizontal cross-section is a perfect circle,
 * which is exactly what makes a swept blanket read as a moulded drum however well the vertical profile is
 * shaped. Perturbing the radius per vertex breaks that circle without needing a hand-authored sweep, and
 * `phase` moves the perturbation on per course, so the row is not one slack shape repeated a dozen times.
 *
 * Because it is a pure function of angle and height, the same amount and phase applied to a band laid on
 * the same revolve deforms the two together, and the band stays seated instead of cutting through it.
 */
function wobble(geometry: BufferGeometry, amount: number, phase: number): BufferGeometry {
  const position = geometry.getAttribute('position')
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i)
    const y = position.getY(i)
    const z = position.getZ(i)
    const radius = Math.hypot(x, z)
    if (radius < 1e-5) continue
    const angle = Math.atan2(z, x)
    // Two incommensurate harmonics, so the section never repeats cleanly around the circumference.
    const scale = 1 + amount * (
      Math.sin(angle * 3 + y * 4.1 + phase) * 0.6 + Math.sin(angle * 5 - y * 2.7 + phase * 1.7) * 0.4
    )
    position.setX(i, x * scale)
    position.setZ(i, z * scale)
  }
  position.needsUpdate = true
  geometry.computeVertexNormals()
  return geometry
}

/**
 * Sample a polyline with a rounded bend at each interior corner, for bent tube stock.
 *
 * `taperedTube` runs a Catmull-Rom through whatever it is given, so feeding it bare corners rounds every
 * bend by an amount nobody chose and overshoots the outside of tight ones. Sampling the fillet here makes
 * the bend radius a stated dimension instead.
 */
function bentPath(corners: readonly Vector3[], fillet: number, perCorner = 5): Vector3[] {
  const path: Vector3[] = [corners[0].clone()]
  for (let i = 1; i < corners.length - 1; i++) {
    const [previous, here, next] = [corners[i - 1], corners[i], corners[i + 1]]
    const back = new Vector3().subVectors(previous, here)
    const forward = new Vector3().subVectors(next, here)
    const radius = Math.min(fillet, back.length() * 0.48, forward.length() * 0.48)
    const start = here.clone().addScaledVector(back.normalize(), radius)
    const end = here.clone().addScaledVector(forward.normalize(), radius)
    for (let step = 0; step <= perCorner; step++) {
      const t = step / perCorner
      path.push(start.clone().multiplyScalar((1 - t) * (1 - t))
        .addScaledVector(here, 2 * (1 - t) * t)
        .addScaledVector(end, t * t))
    }
  }
  path.push(corners[corners.length - 1].clone())
  return path
}

/**
 * The half-profile of a padded warmer, as `[radius, inset from the widest plane]`.
 *
 * This shape carries the whole read of the prop, and the governing dimension is the radius at which the
 * profile is widest — because that is what a neighbouring course butts against, and the drop from the
 * tread wrap down to it is the groove the eye counts courses by. Put the widest point on the face, as a
 * crowned barrel does, and each course pinches to a peanut with a 90 mm valley chewed out between them.
 * Put it just under the wrap, as a bag pulled tight over a wheel does, and the row closes up into
 * distinct drums parted by a seam. Inboard of that corner the face runs nearly flat and dishes into the
 * rim well, which is the surface the printed marks need.
 */
const BLANKET_HALF_PROFILE: ReadonlyArray<readonly [number, number]> = [
  [0.001, 0.036],
  [R * 0.32, 0.022],
  [R * 0.66, 0.008],
  [R * 0.88, 0.002],
  [R + 0.024, 0],     // widest: 96% of the wrap radius, so courses part with a seam and not a notch
  [R + 0.036, 0.01],
  [BLANKET_R, 0.026], // and the tread wrap runs at constant radius from here
]

/**
 * How far the outboard face sits inboard of the widest plane, at a given radius.
 *
 * A printed mark laid on a *dished* face cannot be parked at one flat depth. The face falls away by 6 mm
 * across the radii a supplier ring occupies and by 13 mm again by the time it reaches the wordmark, so a
 * mark set placed at one depth either buries its inner half or floats its outer half off the surface.
 * Reading the depth off the same profile the face is revolved from, per mark, keeps all of them seated,
 * and it stays correct if that profile is ever retuned.
 */
function faceInset(radius: number): number {
  for (let i = 1; i < BLANKET_HALF_PROFILE.length; i++) {
    const [rIn, insetIn] = BLANKET_HALF_PROFILE[i - 1]!
    const [rOut, insetOut] = BLANKET_HALF_PROFILE[i]!
    if (radius > rOut) continue
    const t = Math.min(1, Math.max(0, (radius - rIn) / Math.max(1e-6, rOut - rIn)))
    return insetIn + (insetOut - insetIn) * t
  }
  return BLANKET_HALF_PROFILE[BLANKET_HALF_PROFILE.length - 1]![1]
}

export function createModel(options: F1TyreStackOptions = {}): F1TyreStackInstance {
  const config: F1TyreStackConfig = {
    count: Math.max(1, Math.round(options.count ?? defaults.count)),
    compound: options.compound ?? defaults.compound,
    coverColor: options.coverColor ?? defaults.coverColor,
    accentColor: options.accentColor ?? defaults.accentColor,
  }

  const bundle = acquireF1Materials()
  const kit = bundle.materials
  const extras: Material[] = []
  const own = <T extends Material>(material: T): T => {
    extras.push(material)
    return material
  }

  // Warmers photograph near black with a soft sheen. The shared `fabric` value is pitched for a single
  // strap or bag read against a dark garage; a whole row of it turns the courses mid grey and the
  // position stripes stop being the brightest thing on the prop.
  const quilt = own(kit.fabric.clone())
  quilt.name = 'f1-tyre-stack / warmer shell'
  quilt.color.set(shade(TOKEN.INK_950, -0.1))
  quilt.roughness = 0.9

  // The two position colours are the yellow/red pair out of the sport's own grading key.
  //
  // Dyed webbing left fabric-rough takes so much bounce off a garage key that Dawn's tonemapper hands the
  // colour back as coral and cream. Emissive is the wrong lever against that: adding light drives the
  // stripe further up the curve, which is exactly where the chroma is being crushed. Going the other way
  // works — a deeper albedo, near-zero metalness so no grey specular is mixed through the diffuse, and a
  // tight coated sheen. That keeps the lit face on the steep part of the curve, where hue survives. Owned
  // here, and never mutated if a consumer supplied their own strap material (rule 16).
  const frontStripe = own(createCompoundMaterial('medium'))
  frontStripe.name = 'f1-tyre-stack / front position stripe'
  frontStripe.color.set(shade(COMPOUND_TOKEN.medium, -0.08))
  frontStripe.roughness = 0.4
  frontStripe.metalness = 0.06

  const rearStripe = own(createCompoundMaterial('soft'))
  rearStripe.name = 'f1-tyre-stack / rear position stripe'
  // The red is sunk further than the yellow: `RED-500` carries enough blue to go salmon the moment it is
  // lit hard, and value is the only lever the palette leaves for holding it at red.
  rearStripe.color.set(shade(COMPOUND_TOKEN.soft, -0.3))
  rearStripe.roughness = 0.4
  rearStripe.metalness = 0.06

  // Castor tread is moulded rubber, not the frame's bright steel. Sunk out of `ICE-300` so it lands
  // blue-grey and the four wheels read cool against the chrome forks instead of dissolving into them.
  const castorRubber = own(new MeshStandardMaterial({
    name: 'f1-tyre-stack / castor tread',
    color: shade(TOKEN.ICE_300, -0.5),
    roughness: 0.66,
    metalness: 0.08,
  }))

  const materialSlots: Record<Slot, Material> = {
    blanket: options.materials?.blanket ?? quilt,
    strap: options.materials?.strap ?? frontStripe,
    cable: options.materials?.cable ?? kit.ink,
  }
  // A consumer overriding `strap` is overriding the webbing, not half of it, so the rear block follows
  // the slot when one was supplied and only falls back to the red when it was not.
  const rearStripeMaterial = options.materials?.strap ?? rearStripe

  // Runtime anchors: created once, never replaced (rules 10, 14).
  const root = new Group()
  root.name = 'f1-tyre-stack'
  const tyresGroup = new Group(); tyresGroup.name = 'tyres'
  const blanketGroup = new Group(); blanketGroup.name = 'blanket'
  const cableGroup = new Group(); cableGroup.name = 'cable'
  root.add(tyresGroup, blanketGroup, cableGroup)

  // Shared cover/accent materials handed to every tyre instance (one pair, not one per tyre) — owned here
  // so recolouring the stack recolours every tyre in one place. The children treat these as
  // consumer-supplied and never dispose them, so ownership stays here (rule 16).
  const tyreCover = own(new MeshStandardMaterial({ color: config.coverColor, roughness: 0.4, metalness: 0.2 }))
  const tyreAccent = own(new MeshStandardMaterial({ color: config.accentColor, roughness: 0.5, metalness: 0.1 }))

  let prototype: F1TyreInstance | null = null
  const generated: BufferGeometry[] = []
  const meshesBySlot: Record<Slot, Mesh[]> = { blanket: [], strap: [], cable: [] }

  const releaseGenerated = (): void => {
    tyresGroup.clear()
    prototype?.dispose()
    prototype = null
    blanketGroup.clear()
    cableGroup.clear()
    for (const geometry of generated) geometry.dispose()
    generated.length = 0
    for (const slot of Object.keys(meshesBySlot) as Slot[]) meshesBySlot[slot].length = 0
  }

  /**
   * Publish one merged mesh into a consumer material slot. `material` overrides the slot's default for
   * this mesh alone — the two-tone stripe row is two meshes on one slot — while still registering with
   * the slot, so `setMaterial` retargets the whole row.
   */
  const emit = (
    slot: Slot, geometry: BufferGeometry, group: Group, name: string, material?: Material,
  ): void => {
    generated.push(geometry)
    const mesh = new Mesh(geometry, material ?? materialSlots[slot])
    mesh.name = name
    mesh.userData.topologyRole = 'hull'
    mesh.castShadow = true
    mesh.receiveShadow = true
    meshesBySlot[slot].push(mesh)
    group.add(mesh)
  }

  /** Rack hardware and printed marks: geometry the stack owns outright, with no consumer material slot. */
  const fixture = (geometry: BufferGeometry, material: Material, name: string): void => {
    generated.push(geometry)
    const mesh = new Mesh(geometry, material)
    mesh.name = name
    mesh.castShadow = true
    mesh.receiveShadow = true
    blanketGroup.add(mesh)
  }

  const rebuild = (): void => {
    releaseGenerated()
    const { count, compound } = config

    const columns = Math.ceil(count / 2)
    const rowHalf = ((columns - 1) / 2) * TH + BLANKET_HALF
    // On a row this long one course can be spared: the near one on the bottom tier goes out unbagged, so
    // the prop still shows what is inside all the others.
    const bare = count >= 8 ? 0 : -1
    const tyrePosition = (index: number): Vector3 =>
      new Vector3(((index % columns) - (columns - 1) / 2) * TH, TIER_Y[index < columns ? 0 : 1], 0)

    // Offsetting the top tier by one block stops the two tiers from stacking into vertical bars.
    const isFront = (index: number): boolean => {
      const column = index % columns
      const tier = index < columns ? 0 : 1
      return (Math.floor(column / STRIPE_BLOCK) + tier) % 2 === 0
    }

    // --- The tyres themselves ------------------------------------------------------------------------
    // One tyre geometry set, drawn `count` times via InstancedMesh. GPU buffers exist once; dispose
    // runs once on the prototype. The prototype root stays off-scene so its meshes are not extra draws.
    // `compound` reaches a visible surface through the unbagged course's own sidewall grading.
    prototype = createTyre({
      compound,
      treadSegments: STACK_TREAD_SEGMENTS,
      materials: { cover: tyreCover, accent: tyreAccent },
    })
    prototype.root.updateMatrixWorld(true)
    const pose = new Matrix4()
    const composed = new Matrix4()
    prototype.root.traverse((object) => {
      const mesh = object as Mesh
      if (!mesh.isMesh) return
      const instanced = new InstancedMesh(mesh.geometry, mesh.material, count)
      instanced.name = mesh.name
      instanced.castShadow = true
      instanced.receiveShadow = true
      for (let i = 0; i < count; i++) {
        pose.makeRotationY(Math.PI / 2)
        pose.setPosition(tyrePosition(i))
        composed.copy(pose).multiply(mesh.matrixWorld)
        instanced.setMatrixAt(i, composed)
      }
      instanced.instanceMatrix.needsUpdate = true
      tyresGroup.add(instanced)
    })

    // --- Individual full-coverage warmers, with their closures ---------------------------------------
    const profile: Array<readonly [number, number]> = [
      ...BLANKET_HALF_PROFILE.map(([r, inset]) => [r, -BLANKET_HALF + inset] as const),
      ...[...BLANKET_HALF_PROFILE].reverse().map(([r, inset]) => [r, BLANKET_HALF - inset] as const),
    ]
    const blanketParts: BufferGeometry[] = []
    for (let i = 0; i < count; i++) {
      if (i === bare) continue
      const position = tyrePosition(i)
      const warmer = wobble(latheY(profile, 44), 0.008, jitter(i, 0) * Math.PI)
      warmer.rotateZ(-Math.PI / 2)
      warmer.translate(position.x, position.y, position.z)
      blanketParts.push(warmer)
      // The buckle is a black plastic clip, so it merges into the shell rather than costing a draw of its
      // own. Nobody does them up at the same point on the clock, and a row of a dozen identical ones at
      // bottom-dead-centre is the tell that this was generated: spread them over the aisle side.
      const closure = bevelBox(0.052, 0.044, 0.03, 0.005)
      closure.translate(0, 0, BLANKET_R + STRIPE_PROUD + 0.005)
      closure.rotateX(jitter(i, 1) * 0.85 - 0.35)
      closure.translate(position.x, position.y, position.z)
      blanketParts.push(closure)
    }
    emit('blanket', mergeParts(blanketParts, 'blankets'), blanketGroup, 'blankets')

    // --- The position stripe: one bold belt per warmer, yellow front / red rear ----------------------
    // Wobbled with the same amount and phase as its host warmer, so the belt follows the slack of the bag
    // instead of cutting a machined circle through it.
    const frontParts: BufferGeometry[] = []
    const rearParts: BufferGeometry[] = []
    for (let i = 0; i < count; i++) {
      if (i === bare) continue
      const position = tyrePosition(i)
      const inner = BLANKET_R - STRIPE_BITE
      const outer = BLANKET_R + STRIPE_PROUD
      const belt = latheY([
        [inner, -STRIPE_HALF],
        [outer, -STRIPE_HALF + 0.008],
        [outer, STRIPE_HALF - 0.008],
        [inner, STRIPE_HALF],
        [inner, -STRIPE_HALF],
      ], 44)
      wobble(belt, 0.008, jitter(i, 0) * Math.PI)
      belt.rotateZ(-Math.PI / 2)
      belt.translate(position.x, position.y, position.z)
      ;(isFront(i) ? frontParts : rearParts).push(belt)
    }
    if (frontParts.length > 0) {
      emit('strap', mergeParts(frontParts, 'front-stripes'), blanketGroup, 'front-stripes')
    }
    if (rearParts.length > 0) {
      emit('strap', mergeParts(rearParts, 'rear-stripes'), blanketGroup, 'rear-stripes',
        rearStripeMaterial)
    }

    // --- The supplier's ring mark, on the black faces that are actually seen -------------------------
    // Every interior face is buried by the next course, so this is three mark sets rather than `count` of
    // them: both ends of the top tier, and the far end of the bottom tier — the near end of that tier is
    // where the unbagged course sits, and it carries the mark on its own sidewall.
    const brand = (facing: 1 | -1, centreY: number): BufferGeometry[] => {
      // Each mark is placed at the depth its *own* radius sits at, not at one depth for the set.
      const place = (geometry: BufferGeometry, meanRadius: number): BufferGeometry => {
        const inset = faceInset(meanRadius)
        geometry.rotateY(facing * Math.PI / 2)
        geometry.translate(facing < 0 ? -rowHalf + inset : rowHalf - inset, centreY, 0)
        return geometry
      }
      // The wordmark plate, slightly off square and off centre: applied by hand, not moulded in.
      const plate = bevelBox(0.152, 0.044, 0.018, 0.005)
      plate.rotateZ(0.08)
      plate.translate(-0.012, BLANKET_R * 0.42, 0)
      return [
        // The full ring, not an arc pair: a broken ring foreshortens to a hook from any angle that also
        // shows the row, which is what stopped the earliest mark from reading as a supplier badge.
        place(bevelRing(BLANKET_R * 0.58, BLANKET_R * 0.72, 0.02, 0.003, 44), BLANKET_R * 0.65),
        place(arcBand(BLANKET_R * 0.34, BLANKET_R * 0.46, -0.46 * Math.PI, 0.1 * Math.PI, 0.016, 0.002, 24),
          BLANKET_R * 0.4),
        place(plate, BLANKET_R * 0.44),
      ]
    }
    fixture(mergeParts([
      ...brand(-1, TIER_Y[1]),
      ...brand(1, TIER_Y[1]),
      ...brand(1, TIER_Y[0]),
    ], 'face-marks'), kit.amber, 'face-marks')

    // --- Chrome two-tier wheeled trolley -------------------------------------------------------------
    // The frame is deliberately subordinate. It stops at the upper cradle, so the top tier crowns free
    // and only the push hoops rise past it: boxing the row in on all six sides is what made the previous
    // rack read as a cage with drums inside rather than a trolley carrying tyres. Two bays rather than
    // three for the same reason — a centre upright lands square in the middle of the row and splits the
    // silhouette in half.
    const rackParts: BufferGeometry[] = []
    const endX = rowHalf + 0.1
    const cradleY = (centre: number): number => centre - Math.sqrt(BLANKET_R ** 2 - CRADLE_Z ** 2) + 0.012
    const bays = [-(rowHalf - 0.26), rowHalf - 0.26]

    for (const sx of [-1, 1] as const) {
      rackParts.push(taperedTube(bentPath([
        new Vector3(sx * endX, 0.16, -FRAME_HALF_D),
        new Vector3(sx * endX, HOOP_TOP, -FRAME_HALF_D),
        new Vector3(sx * endX, HOOP_TOP, FRAME_HALF_D),
        new Vector3(sx * endX, 0.16, FRAME_HALF_D),
      ], 0.26), 0.028, 10))
    }
    for (const y of [0.16, 0.99]) {
      for (const sz of [-1, 1] as const) {
        rackParts.push(taperedTube([
          new Vector3(-endX, y, sz * FRAME_HALF_D),
          new Vector3(endX, y, sz * FRAME_HALF_D),
        ], 0.023, 10))
      }
    }
    for (const centre of TIER_Y) {
      const y = cradleY(centre)
      for (const sz of [-1, 1] as const) {
        rackParts.push(taperedTube([
          new Vector3(-rowHalf - 0.05, y, sz * CRADLE_Z),
          new Vector3(rowHalf + 0.05, y, sz * CRADLE_Z),
        ], 0.021, 10))
      }
      for (const x of bays) {
        rackParts.push(taperedTube([
          new Vector3(x, y, -FRAME_HALF_D),
          new Vector3(x, y, FRAME_HALF_D),
        ], 0.021, 10))
      }
    }
    for (const x of bays) {
      for (const sz of [-1, 1] as const) {
        rackParts.push(taperedTube([
          new Vector3(x, 0.16, sz * FRAME_HALF_D),
          new Vector3(x, cradleY(TIER_Y[1]) + 0.02, sz * FRAME_HALF_D),
        ], 0.022, 10))
      }
    }
    const wheels: Array<{ at: [number, number, number]; swivel: number }> = []
    for (const sx of [-1, 1] as const) {
      for (const sz of [-1, 1] as const) {
        const at: [number, number, number] = [sx * (rowHalf - 0.26), 0, sz * FRAME_HALF_D]
        wheels.push({ at, swivel: sx * sz * 0.4 })
        rackParts.push(castor(at, CASTOR_R, sx * sz * 0.4))
      }
    }
    fixture(mergeParts(rackParts, 'rack'), kit.steel, 'two-tier-rack')

    // The moulded tread over each castor wheel, standing proud of the chrome fork it turns in and wide
    // enough to be the wheel rather than a tyre on it. Authored through the same rotate-then-place order
    // the shared `castor` uses, so it lands on its own wheel.
    const treadParts: BufferGeometry[] = []
    for (const { at, swivel } of wheels) {
      const half = CASTOR_R * 0.3
      const tread = latheY([
        [CASTOR_R * 0.5, -half],
        [CASTOR_R * 1.08, -half + CASTOR_R * 0.05],
        [CASTOR_R * 1.1, 0],
        [CASTOR_R * 1.08, half - CASTOR_R * 0.05],
        [CASTOR_R * 0.5, half],
        [CASTOR_R * 0.5, -half],
      ], 18)
      tread.rotateZ(Math.PI / 2)
      tread.rotateY(swivel)
      tread.translate(at[0], at[1] + CASTOR_R, at[2])
      treadParts.push(tread)
    }
    fixture(mergeParts(treadParts, 'castor-treads'), castorRubber, 'castor-treads')

    // --- One short black power lead and connector per warmer -----------------------------------------
    // The lead leaves the wrap just off top-dead-centre and runs down the aisle side to a connector
    // resting on the crown. Two things keep it reading as a cable: it stays outside the warmer's own
    // radius the whole way, because a lead that droops toward the axis is a lead inside the tyre; and it
    // is held low and asymmetric, because a symmetric loop standing clear of the crown is a bail handle.
    const cableParts: BufferGeometry[] = []
    for (let i = 0; i < count; i++) {
      if (i === bare) continue
      const position = tyrePosition(i)
      const side = i % 2 === 0 ? 1 : -1
      const exit = 0.15 + jitter(i, 2) * 0.09
      const rest = exit + 0.32 + jitter(i, 3) * 0.07
      // Clear of the stripe, so the lead runs on black fabric and does not break the belt's silhouette.
      const on = (angle: number, proud: number): Vector3 => new Vector3(
        position.x + side * (STRIPE_HALF + 0.03),
        position.y + (BLANKET_R + proud) * Math.cos(angle),
        (BLANKET_R + proud) * Math.sin(angle),
      )
      cableParts.push(taperedTube([
        on(exit, -0.014),
        on(exit + 0.04, 0.02),
        on(exit + 0.13, 0.025),
        on(rest - 0.06, 0.017),
        on(rest, 0.013),
      ], 0.0075, 8))
      // Seated radially on the wrap, so it reads as a plug lying on the bag rather than a floating block.
      const connector = bevelBox(0.034, 0.048, 0.028, 0.005)
      connector.rotateX(rest + 0.045)
      const seat = on(rest + 0.045, 0.012)
      connector.translate(seat.x, seat.y, seat.z)
      cableParts.push(connector)
    }
    emit('cable', mergeParts(cableParts, 'cables'), cableGroup, 'cables')
  }
  rebuild()

  return {
    root,
    parts: { tyres: tyresGroup, blanket: blanketGroup, cable: cableGroup },
    materials: materialSlots,
    getConfig: () => ({ ...config }),
    configure(patch) {
      if (patch.count !== undefined) config.count = Math.max(1, Math.round(patch.count))
      if (patch.compound !== undefined) config.compound = patch.compound
      if (patch.coverColor !== undefined) { config.coverColor = patch.coverColor; tyreCover.color.set(patch.coverColor) }
      if (patch.accentColor !== undefined) { config.accentColor = patch.accentColor; tyreAccent.color.set(patch.accentColor) }
      rebuild()
    },
    setMaterial(slot, material) {
      // The stripe row is two meshes on one slot, so an override unifies them; every other slot is one.
      materialSlots[slot] = material
      for (const mesh of meshesBySlot[slot]) mesh.material = material
    },
    update: () => {},
    dispose() {
      releaseGenerated()
      disposeF1Materials(bundle)
      for (const material of extras) material.dispose()
      root.removeFromParent()
    },
  }
}

export function createPreview({ aspect }: { aspect: number; time?: number }) {
  return createF1Preview(createModel(), { aspect, target: [0, 0.95, 0], distance: 5.1, yaw: -0.62, pitch: 0.18 })
}
