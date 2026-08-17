// f1-hose-reel — a pit-garage air-hose reel: a real multi-layer helical coil wound on a drum barrel
// between two windowed flanges, carried on a tubular stand, with a crank handle on the outboard hub and
// a lead hose running over a guide roller down to the floor.
//
// The coil is the hero. It is one continuous swept tube following a genuine helix — out across the drum,
// step a layer, wind back — rather than a stack of concentric rings, so it reads as wound hose from any
// angle. The flanges are pierced with lightening windows and sit only just proud of the outermost wrap,
// so they retain the coil the way a real flange does instead of walling it off.
//
// The amber flanges are a generic hazard-equipment colour, not team branding, and are kept as the default
// while still exposed as the `accent` material slot.

import {
  BufferGeometry,
  CatmullRomCurve3,
  ExtrudeGeometry,
  Group,
  MathUtils,
  Mesh,
  Path,
  Shape,
  TubeGeometry,
  Vector3,
  type Material,
} from 'three/webgpu'
import { toCreasedNormals } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

import {
  AXIS_X,
  acquireF1Materials,
  bevelBox,
  bolt,
  createF1Preview,
  disposeF1Materials,
  groundPad,
  mergeParts,
  taperedTube,
  tubeSection,
} from '../f1-kit-core/index.ts'

type Slot = 'accent' | 'stand' | 'hose' | 'metal'

export interface F1HoseReelConfig {
  /** Wraps of hose per layer across the drum. */
  wraps: number
  /** Layers wound on top of one another. With `wraps`, this is the LOD knob — the coil is the tri budget. */
  layers: number
}

export interface F1HoseReelOptions extends Partial<F1HoseReelConfig> {
  materials?: Partial<Record<Slot, Material>>
}

export interface F1HoseReelInstance {
  readonly root: Group
  readonly parts: { drum: Group; stand: Group; hose: Group }
  readonly materials: Readonly<Record<Slot, Material>>
  getConfig(): Readonly<F1HoseReelConfig>
  configure(patch: Partial<F1HoseReelConfig>): void
  setMaterial(slot: Slot, material: Material): void
  update(deltaSeconds: number): void
  dispose(): void
}

// 8 wraps across the 0.300 m drum gives a 0.0375 m pitch against a 0.042 m hose OD, so adjacent turns
// overlap slightly and nest. Anything looser leaves air between wraps and the coil reads as corrugated
// ducting rather than wound hose.
const defaults: F1HoseReelConfig = { wraps: 8, layers: 4 }

// --- Drum geometry, world units ---------------------------------------------------------------------
const AXLE_Y = 0.34        // axle height — low, so the drum's lowest point clears the floor by ~0.06 m
const HALF_SPAN = 0.150    // half the usable drum width, so the coil is 0.300 m wide
const R_BARREL = 0.115     // drum barrel radius
const HOSE_R = 0.021       // 42 mm OD air hose
const LAYER_PITCH = 0.042  // radial step between wound layers
const R_FLANGE = 0.300     // flange radius — just proud of the outermost wrap, so it retains the coil
const X_FLANGE = 0.165     // flange offset from the drum centre along the axle

// ---------------------------------------------------------------------------------------------------
// Local geometry helpers, deliberately private to this file rather than shared through f1-kit-core:
// every `.ts` under f1-kit-core ships to kit consumers as permanent public surface.
// ---------------------------------------------------------------------------------------------------

/** A flat chamfered ring: an annulus from `rIn` to `rOut`, `depth` thick along +Z. */
function ringPlate(rIn: number, rOut: number, depth: number, bevel: number): BufferGeometry {
  const shape = new Shape()
  shape.absarc(0, 0, rOut - bevel, 0, Math.PI * 2, false)
  const hole = new Path()
  hole.absarc(0, 0, rIn + bevel, 0, Math.PI * 2, true)
  shape.holes.push(hole)
  const geo = new ExtrudeGeometry(shape, {
    depth: Math.max(1e-4, depth - 2 * bevel),
    bevelEnabled: bevel > 0,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelOffset: 0,
    bevelSegments: 1,
    steps: 1,
    curveSegments: 40,
  })
  geo.translate(0, 0, -(depth / 2 - bevel))
  return geo
}

/**
 * One flange, built as an open spoked wheel rather than a plate with holes drilled in it.
 *
 * A pierced plate leaves a wide blank annulus of flange between the outermost wrap and the rim, and its
 * windows read as black voids because the hose behind them sits unlit inside the drum. An open spoke
 * frame inverts that: the coil is the face, and the flange is only the rim that retains it plus the
 * arms that carry it. This is how the heavier reels in the reference set are actually made.
 *
 * Built in XY, then laid onto the drum axis (+X).
 */
function flangeSpoked(spokes: number): BufferGeometry {
  const parts: BufferGeometry[] = [
    ringPlate(0.258, R_FLANGE, 0.018, 0.005), // outer rim with a rolled lip
    ringPlate(0.048, 0.100, 0.016, 0.004),    // hub ring
  ]
  for (let i = 0; i < spokes; i++) {
    const a = (i / spokes) * Math.PI * 2
    const arm = bevelBox(0.180, 0.034, 0.014, 0.004)
    arm.translate(0.180, 0, 0)
    arm.rotateZ(a)
    parts.push(arm)
  }
  const geo = mergeParts(parts, 'flange')
  geo.rotateY(Math.PI / 2) // face the flange along the drum axis
  const creased = toCreasedNormals(geo, MathUtils.degToRad(45))
  if (creased !== geo) geo.dispose()
  return creased
}

/**
 * The wound coil: one continuous helix swept as a single tube. It winds out across the drum, steps up a
 * layer, then winds back, so successive layers run in opposite directions exactly as hand-wound hose does.
 */
function coilGeometry(wraps: number, layers: number): BufferGeometry {
  const points: Vector3[] = []
  const perWrap = 12
  for (let layer = 0; layer < layers; layer++) {
    const radius = R_BARREL + HOSE_R + layer * LAYER_PITCH
    const outward = layer % 2 === 0
    const steps = wraps * perWrap
    for (let step = 0; step <= steps; step++) {
      const t = step / steps
      // Offset each layer's start so the wrap seams do not stack into a visible column.
      const angle = t * wraps * Math.PI * 2 + layer * 1.1
      const across = outward ? -HALF_SPAN + t * 2 * HALF_SPAN : HALF_SPAN - t * 2 * HALF_SPAN
      points.push(new Vector3(across, Math.sin(angle) * radius, Math.cos(angle) * radius))
    }
  }
  const curve = new CatmullRomCurve3(points)
  return new TubeGeometry(curve, points.length, HOSE_R, 7, false)
}

export function createModel(options: F1HoseReelOptions = {}): F1HoseReelInstance {
  const config: F1HoseReelConfig = {
    wraps: Math.max(2, Math.round(options.wraps ?? defaults.wraps)),
    layers: Math.max(1, Math.round(options.layers ?? defaults.layers)),
  }

  const bundle = acquireF1Materials()
  const kit = bundle.materials
  const materialSlots: Record<Slot, Material> = {
    accent: options.materials?.accent ?? kit.amber,
    stand: options.materials?.stand ?? kit.graphite,
    hose: options.materials?.hose ?? kit.ink,
    metal: options.materials?.metal ?? kit.steel,
  }

  // Runtime anchors: created once, never replaced, so consumer attachments survive a rebuild (rules 10, 14).
  const root = new Group()
  root.name = 'f1-hose-reel'
  const drum = new Group(); drum.name = 'drum'
  const standGroup = new Group(); standGroup.name = 'stand'
  const hoseGroup = new Group(); hoseGroup.name = 'hose'
  root.add(drum, standGroup, hoseGroup)

  // Per-rebuild geometry ownership. Materials live for the model's whole lifetime in `bag`; geometry is
  // regenerated by configure() and so is tracked separately and released at the top of every rebuild.
  const generated: BufferGeometry[] = []
  const meshesBySlot: Record<Slot, Mesh[]> = { accent: [], stand: [], hose: [], metal: [] }

  const releaseGenerated = (): void => {
    for (const group of [drum, standGroup, hoseGroup]) group.clear()
    for (const geometry of generated) geometry.dispose()
    generated.length = 0
    for (const slot of Object.keys(meshesBySlot) as Slot[]) meshesBySlot[slot].length = 0
  }

  /** One merged geometry per material slot, so there is exactly one mesh per slot and one draw call. */
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
    const { wraps, layers } = config
    const rOuter = R_BARREL + HOSE_R + (layers - 1) * LAYER_PITCH + HOSE_R

    // --- Flanges: pierced discs standing just proud of the outermost wrap ---------------------------
    const flanges: BufferGeometry[] = []
    for (const sx of [-1, 1] as const) {
      const disc = flangeSpoked(6)
      disc.translate(sx * X_FLANGE, AXLE_Y, 0)
      flanges.push(disc)
    }
    emit('accent', mergeParts(flanges, 'flanges'), drum, 'flanges')

    // --- Wound hose, the hero mass -----------------------------------------------------------------
    const coil = coilGeometry(wraps, layers)
    coil.translate(0, AXLE_Y, 0)
    const hoseParts: BufferGeometry[] = [coil]

    // Lead hose: leaves the outermost wrap at the front quarter, through the guide nip, then down to the
    // floor. Routed off the top centreline so it never fouls the carry bow.
    hoseParts.push(taperedTube([
      new Vector3(0.00, AXLE_Y + rOuter * 0.80, 0.15),
      new Vector3(0.02, AXLE_Y + rOuter * 0.86, 0.205),
      new Vector3(0.07, AXLE_Y * 1.40, 0.30),
      new Vector3(0.16, AXLE_Y * 0.74, 0.42),
      new Vector3(0.28, 0.10, 0.50),
      new Vector3(0.44, 0.028, 0.54),
    ], HOSE_R * 0.92, 10))
    emit('hose', mergeParts(hoseParts, 'hose'), hoseGroup, 'hose')

    // --- Drum barrel, hubs, crank and stand ---------------------------------------------------------
    const standParts: BufferGeometry[] = []
    const metalParts: BufferGeometry[] = []

    standParts.push(tubeSection(R_BARREL, HALF_SPAN * 2 + 0.02, [0, AXLE_Y, 0], AXIS_X, 26))

    for (const sx of [-1, 1] as const) {
      // Hub boss standing proud of the flange, so the axle line reads from the side.
      standParts.push(tubeSection(0.055, 0.030, [sx * (X_FLANGE + 0.015), AXLE_Y, 0], AXIS_X, 20))

      // Four hex fasteners on the outboard face of each hub.
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + Math.PI / 4
        metalParts.push(bolt(
          [sx * (X_FLANGE + 0.022), AXLE_Y + Math.sin(a) * 0.075, Math.cos(a) * 0.075],
          0.012, 0.016, AXIS_X,
        ))
      }
    }

    // --- Crank handle: the silhouette cue that says "reel" ------------------------------------------
    // A proper offset Z-crank mounted outboard of the frame upright, on the axle running through its
    // bearing: 0.130 m of throw, with the grip standing clear of the flange so it breaks the drum
    // silhouette and reads as something a hand can actually turn.
    const crankX = 0.310
    const throwY = 0.130
    const arm = bevelBox(throwY + 0.030, 0.032, 0.017, 0.004)
    arm.rotateY(Math.PI / 2) // lay the arm's length into the wheel plane
    arm.rotateX(Math.PI / 2)
    arm.translate(crankX, AXLE_Y + throwY / 2, 0)
    metalParts.push(arm)

    standParts.push(tubeSection(0.018, 0.095, [crankX + 0.062, AXLE_Y + throwY, 0], AXIS_X, 12))

    for (const dx of [0.008, 0.116]) {
      metalParts.push(tubeSection(0.022, 0.008, [crankX + dx, AXLE_Y + throwY, 0], AXIS_X, 14))
    }

    // Guide roller pair forming the nip the lead hose passes through, at the drum's front quarter.
    // Axes run parallel to the drum axle, as a real hose guide's do.
    for (const sz of [-1, 1] as const) {
      metalParts.push(tubeSection(
        0.015, 0.048,
        [0, AXLE_Y + rOuter * 0.86 + sz * 0.005, 0.205 + sz * 0.026],
        AXIS_X, 14,
      ))
    }

    // --- Stand: one bent tube, the way a real reel frame is made ------------------------------------
    // Up from the floor on the left, over the drum as a carry bow, and back down on the right. Each
    // upright lands on its own front-to-back floor tube. This keeps every tube clear of the flange
    // faces, so nothing crosses the wheel the crank turns on.
    // The uprights sit well outboard of the flanges so the frame straddles the drum rather than crossing
    // its face — a tube running down the front of the flange makes the drum read as threaded onto a
    // handle instead of journalled in a frame.
    const upright = 0.262
    standParts.push(taperedTube([
      new Vector3(-upright, 0.045, 0),
      new Vector3(-upright + 0.010, AXLE_Y * 0.55, 0),
      new Vector3(-upright + 0.016, AXLE_Y, 0),
      // The bow has to clear the flange's top edge (AXLE_Y + R_FLANGE) or it hides inside the drum.
      new Vector3(-upright + 0.024, AXLE_Y + R_FLANGE + 0.06, 0),
      new Vector3(0, AXLE_Y + R_FLANGE + 0.13, 0),
      new Vector3(upright - 0.024, AXLE_Y + R_FLANGE + 0.06, 0),
      new Vector3(upright - 0.016, AXLE_Y, 0),
      new Vector3(upright - 0.010, AXLE_Y * 0.55, 0),
      new Vector3(upright, 0.045, 0),
    ], 0.017, 12))

    for (const sx of [-1, 1] as const) {
      // Front-to-back floor tube, with the upright's foot landing on its centre.
      standParts.push(taperedTube([
        new Vector3(sx * upright, 0.024, -0.27),
        new Vector3(sx * upright, 0.030, 0),
        new Vector3(sx * upright, 0.024, 0.27),
      ], 0.017, 12))

      // Bearing boss where the axle passes through the upright — the axle story the frame needs.
      standParts.push(tubeSection(0.032, 0.034, [sx * (upright - 0.016), AXLE_Y, 0], AXIS_X, 18))

      // Axle stub spanning from the hub out to its bearing.
      standParts.push(tubeSection(
        0.019, upright - X_FLANGE,
        [sx * (X_FLANGE + (upright - X_FLANGE) / 2), AXLE_Y, 0],
        AXIS_X, 14,
      ))

      for (const sz of [-1, 1] as const) {
        standParts.push(groundPad([0.070, 0.060], [sx * upright, 0.002, sz * 0.255], 0.018))
      }
    }

    emit('stand', mergeParts(standParts, 'stand'), standGroup, 'frame')
    emit('metal', mergeParts(metalParts, 'metal'), standGroup, 'fittings')
  }
  rebuild()

  return {
    root,
    parts: { drum, stand: standGroup, hose: hoseGroup },
    materials: materialSlots,
    getConfig: () => ({ ...config }),
    configure(patch) {
      if (patch.wraps !== undefined) config.wraps = Math.max(2, Math.round(patch.wraps))
      if (patch.layers !== undefined) config.layers = Math.max(1, Math.round(patch.layers))
      rebuild()
    },
    setMaterial(slot, material) {
      // One mesh per slot, so this is a direct reassignment with no rebuild.
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
  return createF1Preview(createModel(), { aspect, target: [0.1, 0.35, 0], distance: 1.84 })
}
