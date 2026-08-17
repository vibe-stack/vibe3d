// f1-pit-wheel-gun — a pit-lane impact wrench: a two-stage motor barrel with an exhaust tail, a rubber
// pistol grip with a trigger, an air inlet at the grip heel, and a thick-walled hex socket on the anvil.
//
// The read depends on three things a tapered blob cannot give you: a cylindrical motor housing with real
// volume *behind* the grip, the air inlet (the single most identifiable feature of a pneumatic wrench),
// and a proper anvil chain — bearing housing, exposed anvil, then a hollow socket — rather than a
// dumbbell floating off the nose.
//
// `configure({ engaged })` slides the gun +X so the socket seats on a hub; `configure({ spinning: true })`
// free-spins the socket via `update(deltaSeconds)`, and the status LED brightens while it runs.

import {
  BufferGeometry,
  CylinderGeometry,
  ExtrudeGeometry,
  Group,
  MathUtils,
  Mesh,
  MeshStandardMaterial,
  Path,
  Shape,
  Vector3,
  type Material,
} from 'three/webgpu'
import { toCreasedNormals } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

import { createF1Preview } from '../f1-kit-core/preview.ts'
import { TOKEN, shade } from '../f1-kit-core/palette.ts'
import { bevelBox } from '../f1-kit-core/bevel.ts'
import { mergeParts } from '../f1-kit-core/merge.ts'
import { ovalTube } from '../f1-kit-core/primitives.ts'
import { ResourceBag, clamp01 } from '../f1-kit-core/resourceBag.ts'

type Slot = 'gunmetal' | 'steel' | 'gripRubber' | 'accent' | 'led'

export interface F1PitWheelGunConfig {
  /** 0 = held back/away, 1 = socket seated on the hub. */
  engaged: number
  /** Whether the socket free-spins each `update()` tick. */
  spinning: boolean
}

export interface F1PitWheelGunOptions extends Partial<F1PitWheelGunConfig> {
  materials?: Partial<Record<Slot, Material>>
}

export interface F1PitWheelGunInstance {
  readonly root: Group
  readonly parts: { body: Group; spinner: Group }
  readonly materials: Readonly<Record<Slot, Material>>
  getConfig(): Readonly<F1PitWheelGunConfig>
  configure(patch: Partial<F1PitWheelGunConfig>): void
  setMaterial(slot: Slot, material: Material): void
  update(deltaSeconds: number): void
  dispose(): void
}

const defaults: F1PitWheelGunConfig = { engaged: 0, spinning: false }

const GUN_ENGAGE_TRAVEL = 0.2 // how far the gun slides +X from held-back (0) to seated (1)
const GUN_SPIN_RATE = 55 // rad/s the socket spins while running (impact-wrench fast)

// ---------------------------------------------------------------------------------------------------
// Local geometry helpers, deliberately private to this file rather than shared through f1-kit-core:
// every `.ts` under f1-kit-core ships to kit consumers as permanent public surface.
// ---------------------------------------------------------------------------------------------------

/**
 * A thick-walled hex barrel — the socket. Extruded along +X with a hex bore through it, so the drive end
 * reads as something that swallows a nut rather than as a solid nut of its own.
 */
function hexSocket(acrossFlats: number, bore: number, depth: number): BufferGeometry {
  const hexPath = (radius: number, target: Shape | Path, reverse: boolean): void => {
    for (let i = 0; i <= 6; i++) {
      const k = reverse ? 6 - i : i
      const a = (k / 6) * Math.PI * 2 + Math.PI / 6
      const x = Math.cos(a) * radius
      const y = Math.sin(a) * radius
      if (i === 0) target.moveTo(x, y)
      else target.lineTo(x, y)
    }
  }
  const shape = new Shape()
  hexPath(acrossFlats / 2 / Math.cos(Math.PI / 6), shape, false)
  const hole = new Path()
  hexPath(bore / 2 / Math.cos(Math.PI / 6), hole, true)
  shape.holes.push(hole)

  const geo = new ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: true,
    bevelThickness: 0.004,
    bevelSize: 0.004,
    bevelOffset: 0,
    bevelSegments: 1,
    steps: 1,
    curveSegments: 1,
  })
  geo.translate(0, 0, -depth / 2)
  geo.rotateY(Math.PI / 2) // lay the bore onto the tool axis (+X)
  const creased = toCreasedNormals(geo, MathUtils.degToRad(40))
  if (creased !== geo) geo.dispose()
  return creased
}

/** A cylinder laid along the tool axis (+X). */
function axial(rTop: number, rBottom: number, length: number, x: number, radial = 20): BufferGeometry {
  const geo = new CylinderGeometry(rTop, rBottom, length, radial)
  geo.rotateZ(Math.PI / 2)
  geo.translate(x, 0, 0)
  return geo
}

export function createModel(options: F1PitWheelGunOptions = {}): F1PitWheelGunInstance {
  const config: F1PitWheelGunConfig = {
    engaged: clamp01(options.engaged ?? defaults.engaged),
    spinning: options.spinning ?? defaults.spinning,
  }

  // Materials the model creates itself go in the bag and live for the model's lifetime. Materials handed
  // in through `options` belong to the caller, never enter the bag, and are never disposed or mutated
  // here (rule 16) — hence `ownsLed`, which gates the running-state emissive change.
  const bag = new ResourceBag()
  const ownsLed = options.materials?.led === undefined
  const materialSlots: Record<Slot, Material> = {
    gunmetal: options.materials?.gunmetal ??
      bag.mat(new MeshStandardMaterial({ color: shade(TOKEN.SLATE_650, -0.2), metalness: 0.75, roughness: 0.45 })),
    steel: options.materials?.steel ??
      bag.mat(new MeshStandardMaterial({ color: shade(TOKEN.SHELL_200, -0.12), metalness: 0.85, roughness: 0.3 })),
    gripRubber: options.materials?.gripRubber ??
      bag.mat(new MeshStandardMaterial({ color: shade(TOKEN.INK_950, 0.03), metalness: 0.0, roughness: 0.95 })),
    accent: options.materials?.accent ??
      bag.mat(new MeshStandardMaterial({ color: TOKEN.ORANGE_500, metalness: 0.2, roughness: 0.5 })),
    // Status LED — the only emissive part, unlit-bright via toneMapped:false so it glows through the tone map.
    led: options.materials?.led ??
      bag.mat(new MeshStandardMaterial({
        color: shade(TOKEN.INK_950, -0.4), emissive: TOKEN.CYAN_400, emissiveIntensity: 0.25, toneMapped: false,
      })),
  }

  // Runtime anchors: created once, never replaced (rules 10, 14). `body` slides on engage; `spinner`
  // rotates, so its geometry has to stay a separate mesh from the body's.
  const root = new Group()
  root.name = 'f1-pit-wheel-gun'
  const body = new Group(); body.name = 'body'
  const spinner = new Group(); spinner.name = 'spinner'
  root.add(body)
  body.add(spinner)

  const generated: BufferGeometry[] = []
  const meshesBySlot: Record<Slot, Mesh[]> = {
    gunmetal: [], steel: [], gripRubber: [], accent: [], led: [],
  }

  const releaseGenerated = (): void => {
    body.clear()
    spinner.clear()
    body.add(spinner)
    for (const geometry of generated) geometry.dispose()
    generated.length = 0
    for (const slot of Object.keys(meshesBySlot) as Slot[]) meshesBySlot[slot].length = 0
  }

  /** One merged geometry per material slot per group, so each is a single draw call. */
  const emit = (slot: Slot, geometry: BufferGeometry, group: Group, name: string): void => {
    generated.push(geometry)
    const mesh = new Mesh(geometry, materialSlots[slot])
    mesh.name = name
    mesh.castShadow = true
    mesh.receiveShadow = true
    meshesBySlot[slot].push(mesh)
    group.add(mesh)
  }

  const build = (): void => {
    releaseGenerated()

    // --- Motor barrel: the volume behind the grip that makes this read as a machine -----------------
    const gunmetalParts: BufferGeometry[] = [
      axial(0.055, 0.055, 0.20, -0.020),   // motor housing
      axial(0.045, 0.045, 0.10, -0.170),   // exhaust / regulator tail, behind the grip
      axial(0.052, 0.048, 0.018, -0.229),  // end plate
      axial(0.050, 0.055, 0.030, 0.093),   // shoulder into the nose
    ]
    // Regulator dial on the tail, and a hanging lug on the crown.
    const dial = axial(0.024, 0.024, 0.016, -0.238, 14)
    gunmetalParts.push(dial)
    const lug = bevelBox(0.040, 0.028, 0.014, 0.003)
    lug.translate(-0.10, 0.062, 0)
    gunmetalParts.push(lug)
    emit('gunmetal', mergeParts(gunmetalParts, 'barrel'), body, 'barrel')

    // --- Nose: bearing housing, static, ahead of the barrel -----------------------------------------
    const steelParts: BufferGeometry[] = [axial(0.045, 0.045, 0.050, 0.118)]
    emit('steel', mergeParts(steelParts, 'nose'), body, 'nose')

    // --- Grip and trigger ----------------------------------------------------------------------------
    const gripParts: BufferGeometry[] = [
      ovalTube([
        new Vector3(-0.030, -0.050, 0),
        new Vector3(0.000, -0.120, 0),
        new Vector3(0.010, -0.200, 0),
        new Vector3(-0.010, -0.270, 0),
      ], 0.030, 0.038, 12),
    ]
    // Trigger blade sitting in front of the grip's throat.
    const trigger = bevelBox(0.020, 0.052, 0.030, 0.003)
    trigger.translate(0.028, -0.096, 0)
    gripParts.push(trigger)
    emit('gripRubber', mergeParts(gripParts, 'grip'), body, 'grip')

    // --- Air inlet at the grip heel, with a short hose stub trailing back ---------------------------
    const accentParts: BufferGeometry[] = []
    const inlet = new CylinderGeometry(0.0175, 0.0175, 0.060, 14)
    inlet.rotateZ(Math.PI / 2.6)
    inlet.translate(-0.048, -0.288, 0)
    accentParts.push(inlet)
    const inletCollar = new CylinderGeometry(0.023, 0.023, 0.014, 14)
    inletCollar.rotateZ(Math.PI / 2.6)
    inletCollar.translate(-0.030, -0.279, 0)
    accentParts.push(inletCollar)
    // Accent collar band near the front of the barrel.
    accentParts.push(axial(0.0575, 0.0575, 0.022, 0.062, 24))
    emit('accent', mergeParts(accentParts, 'accent'), body, 'accent')

    const hose = ovalTube([
      new Vector3(-0.070, -0.300, 0),
      new Vector3(-0.130, -0.318, 0.020),
      new Vector3(-0.200, -0.300, 0.050),
    ], 0.017, 0.017, 10)
    emit('gripRubber', hose, body, 'air-hose')

    // --- Status LED on the barrel crown ---------------------------------------------------------------
    const ledGeo = new CylinderGeometry(0.009, 0.009, 0.012, 10)
    ledGeo.rotateX(Math.PI / 2)
    ledGeo.translate(-0.060, 0.058, 0.045)
    emit('led', ledGeo, body, 'led')

    // --- Spinner: exposed anvil then the hollow hex socket -------------------------------------------
    const spinnerParts: BufferGeometry[] = [
      // The anvil runs back into the bearing housing rather than butting against its face — meeting it
      // flush leaves a hairline coplanar seam that z-fights and reads as two unrelated parts.
      axial(0.022, 0.022, 0.070, 0.152, 16),
      hexSocket(0.130, 0.086, 0.120),                  // socket, authored at the origin
    ]
    spinnerParts[1]!.translate(0.248, 0, 0)
    emit('steel', mergeParts(spinnerParts, 'socket'), spinner, 'socket')
  }
  build()

  const applyEngaged = (): void => {
    body.position.x = config.engaged * GUN_ENGAGE_TRAVEL
  }
  const applyRunning = (): void => {
    // Only drive a material we own — never mutate one the consumer handed us (rule 16).
    if (!ownsLed) return
    ;(materialSlots.led as MeshStandardMaterial).emissiveIntensity = config.spinning ? 1.6 : 0.25
  }
  applyEngaged()
  applyRunning()

  return {
    root,
    parts: { body, spinner },
    materials: materialSlots,
    getConfig: () => ({ ...config }),
    configure(patch) {
      if (patch.engaged !== undefined) config.engaged = clamp01(patch.engaged)
      if (patch.spinning !== undefined) config.spinning = patch.spinning
      applyEngaged()
      applyRunning()
    },
    setMaterial(slot, material) {
      materialSlots[slot] = material
      for (const mesh of meshesBySlot[slot]) mesh.material = material
    },
    update(deltaSeconds) {
      if (config.spinning) spinner.rotation.x += deltaSeconds * GUN_SPIN_RATE
    },
    dispose() {
      releaseGenerated()
      bag.dispose()
      root.removeFromParent()
    },
  }
}

export function createPreview({ aspect }: { aspect: number; time?: number }) {
  const model = createModel()
  const preview = createF1Preview(model, { aspect, target: [0.05, -0.05, 0], distance: 1.05 })
  let running = false
  return {
    ...preview,
    /** Toggle engaged + spinning together, for an interactive preview action. */
    toggleRun(): void {
      running = !running
      model.configure({ engaged: running ? 1 : 0, spinning: running })
    },
  }
}
