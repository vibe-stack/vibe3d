// f1-tyre-gun — a pit-lane impact wrench: a two-stage motor barrel with an exhaust tail, a rubber
// pistol grip with a guarded trigger, a heel air inlet, and a ribbed hollow socket on the anvil.
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
  Group,
  Mesh,
  MeshStandardMaterial,
  Vector3,
  type Material,
} from 'three/webgpu'

import {
  AXIS_X,
  acquireF1Materials,
  bevelBox,
  clamp01,
  createF1Preview,
  disposeF1Materials,
  mergeParts,
  ovalTube,
  taperedTube,
  tubeSection,
} from '../f1-kit-core/index.ts'

type Slot = 'gunmetal' | 'steel' | 'gripRubber' | 'accent' | 'led'

export interface F1TyreGunConfig {
  /** 0 = held back/away, 1 = socket seated on the hub. */
  engaged: number
  /** Whether the socket free-spins each `update()` tick. */
  spinning: boolean
}

export interface F1TyreGunOptions extends Partial<F1TyreGunConfig> {
  materials?: Partial<Record<Slot, Material>>
}

export interface F1TyreGunInstance {
  readonly root: Group
  readonly parts: { body: Group; spinner: Group }
  readonly materials: Readonly<Record<Slot, Material>>
  getConfig(): Readonly<F1TyreGunConfig>
  configure(patch: Partial<F1TyreGunConfig>): void
  setMaterial(slot: Slot, material: Material): void
  update(deltaSeconds: number): void
  dispose(): void
}

const defaults: F1TyreGunConfig = { engaged: 0, spinning: false }

const GUN_ENGAGE_TRAVEL = 0.2 // how far the gun slides +X from held-back (0) to seated (1)
const GUN_SPIN_RATE = 55 // rad/s the socket spins while running (impact-wrench fast)

// ---------------------------------------------------------------------------------------------------
// Local geometry helpers, deliberately private to this file rather than shared through f1-kit-core:
// every `.ts` under f1-kit-core ships to kit consumers as permanent public surface.
// ---------------------------------------------------------------------------------------------------

/** A tapered cylinder laid along the tool axis (+X). Equal-radius barrels use tubeSection. */
function axial(rTop: number, rBottom: number, length: number, x: number, radial = 20): BufferGeometry {
  const geo = new CylinderGeometry(rTop, rBottom, length, radial)
  geo.rotateZ(Math.PI / 2)
  geo.translate(x, 0, 0)
  return geo
}

export function createModel(options: F1TyreGunOptions = {}): F1TyreGunInstance {
  const config: F1TyreGunConfig = {
    engaged: clamp01(options.engaged ?? defaults.engaged),
    spinning: options.spinning ?? defaults.spinning,
  }

  const bundle = acquireF1Materials()
  const kit = bundle.materials
  const ownsLed = options.materials?.led === undefined
  const extras: Material[] = []
  const carbon = options.materials?.gunmetal ?? new MeshStandardMaterial({
    name: 'f1-kit / tyre-gun carbon cone',
    color: 0x0b0d10,
    roughness: 0.08,
    metalness: 0.58,
  })
  if (options.materials?.gunmetal === undefined) extras.push(carbon)
  const materialSlots: Record<Slot, Material> = {
    gunmetal: options.materials?.gunmetal ?? kit.graphite,
    steel: options.materials?.steel ?? kit.steel,
    gripRubber: options.materials?.gripRubber ?? kit.ink,
    accent: options.materials?.accent ?? kit.cobalt,
    led: options.materials?.led ?? kit.cyan,
  }

  // Runtime anchors: created once, never replaced (rules 10, 14). `body` slides on engage; `spinner`
  // rotates, so its geometry has to stay a separate mesh from the body's.
  const root = new Group()
  root.name = 'f1-tyre-gun'
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

    // --- Fat T-shaped impact housing: volume behind the grip, not a heat-gun taper -------------------
    const gunmetalParts: BufferGeometry[] = [
      axial(0.104, 0.118, 0.11, -0.118, 24),
      axial(0.118, 0.108, 0.14, -0.242, 24),
    ]
    for (const sz of [-1, 1] as const) {
      const cover = bevelBox(0.16, 0.122, 0.024, 0.014)
      cover.translate(-0.12, 0, sz * 0.086)
      gunmetalParts.push(cover)
    }
    const flange = bevelBox(0.028, 0.178, 0.178, 0.006)
    flange.translate(-0.028, 0, 0)
    gunmetalParts.push(flange)
    for (let i = 0; i < 6; i++) {
      const rib = bevelBox(0.010, 0.028, 0.11, 0.003)
      rib.translate(-0.22 + i * 0.018, 0.092, 0)
      gunmetalParts.push(rib)
    }
    emit('gunmetal', mergeParts(gunmetalParts, 'barrel'), body, 'barrel')

    const cone = axial(0.048, 0.096, 0.11, 0.020, 28)
    generated.push(cone)
    const coneMesh = new Mesh(cone, carbon)
    coneMesh.name = 'carbon-cone'
    coneMesh.castShadow = true
    coneMesh.receiveShadow = true
    body.add(coneMesh)

    const boltParts: BufferGeometry[] = []
    for (const [y, z] of [[0.062, 0.062], [0.062, -0.062], [-0.062, 0.062], [-0.062, -0.062]] as const) {
      const bolt = new CylinderGeometry(0.008, 0.008, 0.016, 8)
      bolt.rotateZ(Math.PI / 2)
      bolt.translate(-0.012, y, z)
      boltParts.push(bolt)
    }
    emit('gripRubber', mergeParts(boltParts, 'flange-bolts'), body, 'flange-bolts')

    const steelParts: BufferGeometry[] = []
    const plateTop = bevelBox(0.012, 0.014, 0.046, 0.003)
    plateTop.translate(0.028, -0.086, 0)
    steelParts.push(plateTop)
    const plateBot = bevelBox(0.012, 0.018, 0.050, 0.003)
    plateBot.translate(0.028, -0.152, 0)
    steelParts.push(plateBot)
    const plateL = bevelBox(0.012, 0.040, 0.010, 0.003)
    plateL.translate(0.028, -0.118, 0.020)
    steelParts.push(plateL)
    const plateR = bevelBox(0.012, 0.040, 0.010, 0.003)
    plateR.translate(0.028, -0.118, -0.020)
    steelParts.push(plateR)
    const inlet = new CylinderGeometry(0.015, 0.015, 0.048, 14)
    inlet.translate(-0.018, -0.312, 0)
    steelParts.push(inlet)
    const inletCollar = new CylinderGeometry(0.021, 0.021, 0.016, 14)
    inletCollar.translate(-0.018, -0.288, 0)
    steelParts.push(inletCollar)
    emit('steel', mergeParts(steelParts, 'trigger-and-inlet'), body, 'nose')

    // --- Slender rubber grip -------------------------------------------------------------------------
    const gripParts: BufferGeometry[] = [
      taperedTube([
        new Vector3(-0.025, -0.062, 0),
        new Vector3(-0.002, -0.135, 0),
        new Vector3(0.002, -0.215, 0),
        new Vector3(-0.018, -0.285, 0),
      ], 0.034, 10),
    ]
    emit('gripRubber', mergeParts(gripParts, 'grip'), body, 'grip')

    // --- Air inlet at the grip heel, plus a blue nose ring kept clear of the socket ------------------
    const accentParts: BufferGeometry[] = []
    accentParts.push(tubeSection(0.049, 0.008, [0.080, 0, 0], AXIS_X, 24))
    const reverseKnob = new CylinderGeometry(0.034, 0.034, 0.024, 20)
    reverseKnob.rotateZ(Math.PI / 2)
    reverseKnob.translate(-0.318, 0, 0)
    accentParts.push(reverseKnob)
    emit('accent', mergeParts(accentParts, 'accent'), body, 'accent')

    const hose = ovalTube([
      new Vector3(-0.018, -0.340, 0),
      new Vector3(-0.04, -0.385, 0.015),
      new Vector3(-0.105, -0.410, 0.045),
    ], 0.015, 0.015, 10)
    emit('gripRubber', hose, body, 'air-hose')

    // --- Status LED on the barrel crown ---------------------------------------------------------------
    const ledGeo = new CylinderGeometry(0.009, 0.009, 0.012, 10)
    ledGeo.rotateX(Math.PI / 2)
    ledGeo.translate(-0.060, 0.078, 0.055)
    emit('led', ledGeo, body, 'led')

    // --- Spinner: short anvil, ribbed spline and visibly hollow round socket -------------------------
    const spinnerParts: BufferGeometry[] = [
      tubeSection(0.016, 0.055, [0.132, 0, 0], AXIS_X, 16),
    ]
    for (let i = 0; i < 12; i++) {
      const angle = (i / 12) * Math.PI * 2
      const spline = bevelBox(0.050, 0.007, 0.007, 0.001)
      spline.translate(0, 0.020, 0)
      spline.rotateX(angle)
      spline.translate(0.136, 0, 0)
      spinnerParts.push(spline)
    }
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
      for (const material of extras) material.dispose()
      disposeF1Materials(bundle)
      root.removeFromParent()
    },
  }
}

export function createPreview({ aspect }: { aspect: number; time?: number }) {
  const model = createModel()
  const preview = createF1Preview(model, { aspect, target: [0, -0.08, 0], distance: 1.05, yaw: 0.82, pitch: 0.12 })
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
