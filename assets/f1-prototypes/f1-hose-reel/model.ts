// f1-hose-reel — a pit-garage air-hose reel: a real multi-layer helical coil wound on a drum barrel
// between two pressed flanges, carried on a tubular stand, with a crank handle on the outboard hub and
// a lead hose running over a guide roller down to the floor.
//
// The coil is the hero. It is one continuous swept tube following a genuine helix — out across the drum,
// step a layer, wind back — rather than a stack of concentric rings, so it reads as wound hose from any
// angle. The rolled plate flanges sit only just proud of the outermost wrap, retaining the coil without
// swallowing its side profile.
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
  MeshStandardMaterial,
  Path,
  Shape,
  TorusGeometry,
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
const defaults: F1HoseReelConfig = { wraps: 6, layers: 2 }

// --- Drum geometry, world units ---------------------------------------------------------------------
const AXLE_Y = 0.34        // axle height — low, so the drum's lowest point clears the floor by ~0.06 m
const HALF_SPAN = 0.115    // narrow hose pack leaves the glossy drum shoulders visible
const R_BARREL = 0.145     // drum barrel radius
const HOSE_R = 0.018       // 36 mm OD rubber hose
const LAYER_PITCH = 0.036  // radial step between wound layers
const R_FLANGE = 0.255     // restrained pressed flanges, not oversized moulded discs
const X_FLANGE = 0.180     // flange offset from the drum centre along the axle

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

/** A shallow rolled plate flange, matching the pressed-steel Coxreels drum construction. */
function flangePlate(): BufferGeometry {
  const parts: BufferGeometry[] = [
    ringPlate(0.062, R_FLANGE - 0.008, 0.010, 0.003),
    ringPlate(0.045, 0.092, 0.016, 0.003),
    new TorusGeometry(R_FLANGE - 0.008, 0.008, 5, 48),
  ]
  // Six low pressed swages catch a highlight without turning the dish into a starburst.
  for (let i = 0; i < 6; i++) {
    const rib = bevelBox(0.112, 0.012, 0.007, 0.002)
    rib.translate(0.150, 0, 0.007)
    rib.rotateZ(i * Math.PI / 3)
    parts.push(rib)
  }
  const geo = mergeParts(parts, 'flange')
  geo.rotateY(Math.PI / 2)
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
  kit.cobalt.roughness = 0.20
  kit.cobalt.metalness = 0.62
  const materialSlots: Record<Slot, Material> = {
    accent: options.materials?.accent ?? kit.cobalt,
    stand: options.materials?.stand ?? kit.cobalt,
    hose: options.materials?.hose ?? kit.tread,
    metal: options.materials?.metal ?? kit.steel,
  }
  const brass = new MeshStandardMaterial({
    name: 'f1-kit / hose-reel brass',
    color: 0xc89b3c,
    roughness: 0.24,
    metalness: 0.88,
  })

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

    // --- Flanges: rolled plates standing just proud of the outermost wrap ----------------------------
    const flanges: BufferGeometry[] = []
    for (const sx of [-1, 1] as const) {
      const disc = flangePlate()
      disc.translate(sx * X_FLANGE, AXLE_Y, 0)
      flanges.push(disc)
    }
    emit('accent', mergeParts(flanges, 'flanges'), drum, 'flanges')

    // --- Wound hose, the hero mass -----------------------------------------------------------------
    const coil = coilGeometry(wraps, layers)
    coil.translate(0, AXLE_Y, 0)
    const hoseParts: BufferGeometry[] = [coil]

    // The reference is neatly wound: omit a dangling lead so the barrel shoulders and frame remain legible.
    emit('hose', mergeParts(hoseParts, 'hose'), hoseGroup, 'hose')

    // --- Drum barrel, hubs, crank and stand ---------------------------------------------------------
    const standParts: BufferGeometry[] = []
    const metalParts: BufferGeometry[] = []

    standParts.push(tubeSection(R_BARREL, X_FLANGE * 2 - 0.014, [0, AXLE_Y, 0], AXIS_X, 32))

    for (const sx of [-1, 1] as const) {
      standParts.push(tubeSection(0.052, 0.026, [sx * (X_FLANGE + 0.013), AXLE_Y, 0], AXIS_X, 20))
      const hubPlate = bevelBox(0.012, 0.112, 0.112, 0.008)
      hubPlate.translate(sx * (X_FLANGE + 0.025), AXLE_Y, 0)
      metalParts.push(hubPlate)
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + Math.PI / 4
        metalParts.push(bolt(
          [sx * (X_FLANGE + 0.034), AXLE_Y + Math.sin(a) * 0.041, Math.cos(a) * 0.041],
          0.009, 0.010, AXIS_X,
        ))
      }
    }

    // Long right-hand crank: bright arm and journals, with a separate black rotating grip.
    const crankX = 0.305
    const throwY = 0.145
    const arm = bevelBox(0.018, throwY + 0.025, 0.030, 0.005)
    arm.translate(crankX, AXLE_Y + throwY / 2, 0)
    metalParts.push(arm)
    metalParts.push(tubeSection(0.018, 0.100, [crankX - 0.050, AXLE_Y, 0], AXIS_X, 14))
    emit('hose', tubeSection(0.024, 0.205, [crankX + 0.115, AXLE_Y + throwY, 0], AXIS_X, 16), standGroup, 'crank-grip')

    // Prominent left brass swivel with a rotary gland, block body, and raised outlet.
    const brassParts: BufferGeometry[] = []
    brassParts.push(tubeSection(0.035, 0.085, [-0.280, AXLE_Y, 0], AXIS_X, 18))
    const swivelBody = bevelBox(0.075, 0.085, 0.072, 0.010)
    swivelBody.translate(-0.336, AXLE_Y, 0)
    brassParts.push(swivelBody)
    brassParts.push(tubeSection(0.027, 0.080, [-0.374, AXLE_Y + 0.065, 0], AXIS_X, 14))
    const brassGeometry = mergeParts(brassParts, 'brass-swivel')
    generated.push(brassGeometry)
    const brassMesh = new Mesh(brassGeometry, brass)
    brassMesh.name = 'brass-swivel'
    brassMesh.castShadow = true
    standGroup.add(brassMesh)

    // Guide roller pair forming the nip the lead hose passes through, at the drum's front quarter.
    // Axes run parallel to the drum axle, as a real hose guide's do.
    for (const sz of [-1, 1] as const) {
      metalParts.push(tubeSection(
        0.015, 0.048,
        [0, AXLE_Y + rOuter * 0.86 + sz * 0.005, 0.205 + sz * 0.026],
        AXIS_X, 14,
      ))
    }

    // Each side is one continuous bent sled from front foot, around the drum, to rear foot.
    const upright = 0.278
    for (const sx of [-1, 1] as const) {
      standParts.push(taperedTube([
        new Vector3(sx * upright, 0.025, 0.31),
        new Vector3(sx * upright, 0.035, 0.18),
        new Vector3(sx * upright, AXLE_Y, 0.12),
        new Vector3(sx * upright, AXLE_Y + R_FLANGE + 0.055, 0.04),
        new Vector3(sx * upright, AXLE_Y + R_FLANGE + 0.065, -0.13),
        new Vector3(sx * upright, AXLE_Y, -0.18),
        new Vector3(sx * upright, 0.075, -0.26),
        new Vector3(sx * upright, 0.025, -0.32),
      ], 0.017, 12))

      standParts.push(tubeSection(0.032, 0.034, [sx * upright, AXLE_Y, 0], AXIS_X, 18))
      standParts.push(tubeSection(
        0.019, upright - X_FLANGE,
        [sx * (X_FLANGE + (upright - X_FLANGE) / 2), AXLE_Y, 0],
        AXIS_X, 14,
      ))
      for (const sz of [-1, 1] as const) {
        standParts.push(groundPad([0.058, 0.050], [sx * upright, 0.002, sz * 0.30], 0.016))
      }
    }
    standParts.push(taperedTube([
      new Vector3(-upright, AXLE_Y + R_FLANGE + 0.062, -0.13),
      new Vector3(0, AXLE_Y + R_FLANGE + 0.075, -0.13),
      new Vector3(upright, AXLE_Y + R_FLANGE + 0.062, -0.13),
    ], 0.017, 12))

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
      brass.dispose()
      disposeF1Materials(bundle)
      root.removeFromParent()
    },
  }
}

export function createPreview({ aspect }: { aspect: number; time?: number }) {
  return createF1Preview(createModel(), {
    aspect, target: [0, 0.34, 0], distance: 1.72, yaw: -0.58, pitch: 0.27,
  })
}
