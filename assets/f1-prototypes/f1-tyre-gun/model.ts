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
  TorusGeometry,
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
      axial(0.092, 0.112, 0.22, -0.015, 28),
      axial(0.112, 0.098, 0.09, -0.170, 24),
      axial(0.098, 0.072, 0.045, -0.238, 20),
    ]
    for (const sz of [-1, 1] as const) {
      const cover = bevelBox(0.175, 0.118, 0.022, 0.014)
      cover.translate(-0.02, 0, sz * 0.078)
      gunmetalParts.push(cover)
    }
    const flange = bevelBox(0.022, 0.168, 0.168, 0.006)
    flange.translate(0.078, 0, 0)
    gunmetalParts.push(flange)
    for (const [y, z] of [[0.058, 0.058], [0.058, -0.058], [-0.058, 0.058], [-0.058, -0.058]] as const) {
      const bolt = new CylinderGeometry(0.008, 0.008, 0.016, 10)
      bolt.rotateZ(Math.PI / 2)
      bolt.translate(0.092, y, z)
      gunmetalParts.push(bolt)
    }
    gunmetalParts.push(tubeSection(0.028, 0.022, [-0.268, 0, 0], AXIS_X, 14))
    const lug = bevelBox(0.042, 0.028, 0.016, 0.003)
    lug.translate(-0.09, 0.098, 0)
    gunmetalParts.push(lug)
    for (let i = 0; i < 5; i++) {
      const rib = bevelBox(0.012, 0.022, 0.095, 0.003)
      rib.translate(-0.14 + i * 0.026, 0.086, 0)
      gunmetalParts.push(rib)
    }
    emit('gunmetal', mergeParts(gunmetalParts, 'barrel'), body, 'barrel')

    // --- Short nose and skeletonized two-finger trigger ----------------------------------------------
    const steelParts: BufferGeometry[] = [tubeSection(0.052, 0.042, [0.108, 0, 0], AXIS_X, 20)]
    steelParts.push(ovalTube([
      new Vector3(0.018, -0.078, 0),
      new Vector3(0.062, -0.128, 0),
      new Vector3(0.038, -0.195, 0),
    ], 0.009, 0.009, 8))
    const triggerUpper = bevelBox(0.016, 0.028, 0.028, 0.003)
    triggerUpper.translate(0.028, -0.092, 0)
    steelParts.push(triggerUpper)
    const triggerLower = bevelBox(0.016, 0.028, 0.028, 0.003)
    triggerLower.translate(0.028, -0.132, 0)
    steelParts.push(triggerLower)
    emit('steel', mergeParts(steelParts, 'nose-and-guard'), body, 'nose')

    // --- Slender rubber grip -------------------------------------------------------------------------
    const gripParts: BufferGeometry[] = [
      ovalTube([
        new Vector3(-0.025, -0.062, 0),
        new Vector3(-0.002, -0.135, 0),
        new Vector3(0.002, -0.215, 0),
        new Vector3(-0.018, -0.285, 0),
      ], 0.030, 0.038, 12),
    ]
    emit('gripRubber', mergeParts(gripParts, 'grip'), body, 'grip')

    // --- Air inlet at the grip heel, plus a blue nose ring kept clear of the socket ------------------
    const accentParts: BufferGeometry[] = []
    const inlet = new CylinderGeometry(0.016, 0.016, 0.055, 14)
    inlet.translate(-0.018, -0.312, 0)
    accentParts.push(inlet)
    const inletCollar = new CylinderGeometry(0.023, 0.023, 0.018, 14)
    inletCollar.translate(-0.018, -0.286, 0)
    accentParts.push(inletCollar)
    const reverseKnob = new CylinderGeometry(0.022, 0.022, 0.018, 16)
    reverseKnob.rotateZ(Math.PI / 2)
    reverseKnob.translate(-0.255, 0.042, 0)
    accentParts.push(reverseKnob)
    accentParts.push(tubeSection(0.054, 0.016, [0.028, 0, 0], AXIS_X, 24))
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
      tubeSection(0.019, 0.038, [0.095, 0, 0], AXIS_X, 16),
    ]
    for (let i = 0; i < 10; i++) {
      const angle = (i / 10) * Math.PI * 2
      const spline = bevelBox(0.034, 0.011, 0.011, 0.002)
      spline.translate(0, 0.041, 0)
      spline.rotateX(angle)
      spline.translate(0.119, 0, 0)
      spinnerParts.push(spline)
    }
    const socketShell = new CylinderGeometry(0.05, 0.046, 0.068, 24, 1, true)
    socketShell.rotateZ(Math.PI / 2)
    socketShell.translate(0.157, 0, 0)
    spinnerParts.push(socketShell)
    const socketLip = new TorusGeometry(0.04, 0.008, 8, 24)
    socketLip.rotateY(Math.PI / 2)
    socketLip.translate(0.191, 0, 0)
    spinnerParts.push(socketLip)
    emit('steel', mergeParts(spinnerParts, 'socket'), spinner, 'socket')

    const bore = new CylinderGeometry(0.031, 0.031, 0.008, 20)
    bore.rotateZ(Math.PI / 2)
    bore.translate(0.189, 0, 0)
    emit('gripRubber', bore, spinner, 'socket-bore')
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
