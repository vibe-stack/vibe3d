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

    // --- Rounded carbon clamshell: tapered centre mass with separate side cover halves ---------------
    const gunmetalParts: BufferGeometry[] = [
      axial(0.062, 0.075, 0.18, -0.025, 28),
      axial(0.072, 0.058, 0.055, -0.142, 24),
      axial(0.058, 0.05, 0.025, -0.182, 20),
    ]
    for (const sz of [-1, 1] as const) {
      const cover = bevelBox(0.145, 0.094, 0.018, 0.012)
      cover.translate(-0.02, 0, sz * 0.061)
      gunmetalParts.push(cover)
    }
    // Rear regulator, hanging lug, and offset cooling ribs break the otherwise smooth shell.
    gunmetalParts.push(tubeSection(0.024, 0.018, [-0.206, 0, 0], AXIS_X, 14))
    const lug = bevelBox(0.038, 0.026, 0.014, 0.003)
    lug.translate(-0.09, 0.075, 0)
    gunmetalParts.push(lug)
    for (let i = 0; i < 4; i++) {
      const rib = bevelBox(0.01, 0.018, 0.075, 0.003)
      rib.translate(-0.11 + i * 0.023, 0.067, 0)
      gunmetalParts.push(rib)
    }
    emit('gunmetal', mergeParts(gunmetalParts, 'barrel'), body, 'barrel')

    // --- Short nose and integrated trigger guard -----------------------------------------------------
    const steelParts: BufferGeometry[] = [tubeSection(0.046, 0.038, [0.088, 0, 0], AXIS_X, 20)]
    steelParts.push(ovalTube([
      new Vector3(0.018, -0.062, 0),
      new Vector3(0.055, -0.11, 0),
      new Vector3(0.035, -0.17, 0),
    ], 0.008, 0.008, 8))
    const trigger = bevelBox(0.014, 0.046, 0.026, 0.003)
    trigger.translate(0.024, -0.105, 0)
    steelParts.push(trigger)
    emit('steel', mergeParts(steelParts, 'nose-and-guard'), body, 'nose')

    // --- Slender rubber grip -------------------------------------------------------------------------
    const gripParts: BufferGeometry[] = [
      ovalTube([
        new Vector3(-0.025, -0.052, 0),
        new Vector3(-0.002, -0.12, 0),
        new Vector3(0.002, -0.20, 0),
        new Vector3(-0.018, -0.27, 0),
      ], 0.025, 0.032, 12),
    ]
    emit('gripRubber', mergeParts(gripParts, 'grip'), body, 'grip')

    // --- Air inlet at the grip heel, with a short hose stub trailing back ---------------------------
    const accentParts: BufferGeometry[] = []
    const inlet = new CylinderGeometry(0.016, 0.016, 0.055, 14)
    inlet.translate(-0.018, -0.297, 0)
    accentParts.push(inlet)
    const inletCollar = new CylinderGeometry(0.023, 0.023, 0.018, 14)
    inletCollar.translate(-0.018, -0.272, 0)
    accentParts.push(inletCollar)
    // Accent collar band near the front of the barrel.
    accentParts.push(tubeSection(0.0575, 0.022, [0.028, 0, 0], AXIS_X, 24))
    emit('accent', mergeParts(accentParts, 'accent'), body, 'accent')

    const hose = ovalTube([
      new Vector3(-0.018, -0.325, 0),
      new Vector3(-0.04, -0.37, 0.015),
      new Vector3(-0.105, -0.395, 0.045),
    ], 0.015, 0.015, 10)
    emit('gripRubber', hose, body, 'air-hose')

    // --- Status LED on the barrel crown ---------------------------------------------------------------
    const ledGeo = new CylinderGeometry(0.009, 0.009, 0.012, 10)
    ledGeo.rotateX(Math.PI / 2)
    ledGeo.translate(-0.060, 0.058, 0.045)
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
  const preview = createF1Preview(model, { aspect, target: [0, -0.08, 0], distance: 0.95, yaw: 0.82, pitch: 0.12 })
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
