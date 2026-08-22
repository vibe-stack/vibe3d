// f1-pit-jack — the classic low lever jack a pit crew slams under the car's nose or tail: a ground base
// + pivot bracket hold a rigid lever whose LIFT ARM (a lofted oval-section beam) reaches toward the car to
// a T-bar pad, while the HANDLE sticks up-and-back. Rotating the shared pivot raises the arm (car up)
// while the handle swings down. `configure({ lift })` drives the lever angle; `liftMeters` on the instance
// reports the pad's honest vertical rise so a host scene can match the car's Y offset.

import {
  BufferGeometry,
  Group,
  Mesh,
  Vector3,
  type Material,
} from 'three/webgpu'

import {
  AXIS_Z,
  acquireF1Materials,
  bevelBox,
  bolt,
  castor,
  clamp01,
  createF1Preview,
  disposeF1Materials,
  mergeParts,
  ovalTube,
  tubeSection,
} from '../f1-kit-core/index.ts'

type Slot = 'metal' | 'darkMetal' | 'accent' | 'rubber'

export interface F1PitJackConfig {
  /** 0 = resting (car down), 1 = fully jacked (car lifted). */
  lift: number
}

export interface F1PitJackOptions extends Partial<F1PitJackConfig> {
  materials?: Partial<Record<Slot, Material>>
}

export interface F1PitJackInstance {
  readonly root: Group
  readonly parts: { base: Group; lever: Group; handle: Group }
  readonly materials: Readonly<Record<Slot, Material>>
  /** Vertical rise of the lift pad at lift=1 (metres) — match the car's Y offset to this. */
  readonly liftMeters: number
  getConfig(): Readonly<F1PitJackConfig>
  configure(patch: Partial<F1PitJackConfig>): void
  setMaterial(slot: Slot, material: Material): void
  update(deltaSeconds: number): void
  dispose(): void
}

const defaults: F1PitJackConfig = { lift: 0 }

const JACK_PAD_X = 0.57
const JACK_PAD_Y = 0.05
const JACK_MAX_ANGLE = 0.29
const JACK_LIFT_METERS = JACK_PAD_X * Math.sin(JACK_MAX_ANGLE) + JACK_PAD_Y * (Math.cos(JACK_MAX_ANGLE) - 1)

export function createModel(options: F1PitJackOptions = {}): F1PitJackInstance {
  const config: F1PitJackConfig = { lift: clamp01(options.lift ?? defaults.lift) }

  const bundle = acquireF1Materials()
  const kit = bundle.materials
  const materialSlots: Record<Slot, Material> = {
    metal: options.materials?.metal ?? kit.steel,
    darkMetal: options.materials?.darkMetal ?? kit.graphite,
    accent: options.materials?.accent ?? kit.amber,
    rubber: options.materials?.rubber ?? kit.ink,
  }

  const root = new Group()
  root.name = 'f1-pit-jack'
  const base = new Group(); base.name = 'base'
  const lever = new Group(); lever.name = 'lever'
  const handle = new Group(); handle.name = 'handle'
  root.add(base, lever)
  lever.add(handle)

  const pivotX = -0.2
  const pivotY = 0.075
  lever.position.set(pivotX, pivotY, 0)

  const generated: BufferGeometry[] = []
  const meshesBySlot: Record<Slot, Mesh[]> = { metal: [], darkMetal: [], accent: [], rubber: [] }

  const releaseGenerated = (): void => {
    base.clear()
    lever.clear()
    handle.clear()
    lever.add(handle)
    for (const geometry of generated) geometry.dispose()
    generated.length = 0
    for (const slot of Object.keys(meshesBySlot) as Slot[]) meshesBySlot[slot].length = 0
  }

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

    const metalBase: BufferGeometry[] = []
    for (const sz of [1, -1] as const) {
      const rail = bevelBox(0.79, 0.04, 0.045, 0.006)
      rail.translate(0.145, 0.035, sz * 0.13)
      metalBase.push(rail)
      const side = bevelBox(0.15, 0.11, 0.024, 0.004)
      side.translate(pivotX, pivotY - 0.005, sz * 0.07)
      metalBase.push(side)
    }
    const rearTie = bevelBox(0.18, 0.05, 0.38, 0.007)
    rearTie.translate(-0.24, 0.04, 0)
    metalBase.push(rearTie)
    emit('metal', mergeParts(metalBase, 'base'), base, 'base')

    const rubberBase: BufferGeometry[] = [
      castor([-0.18, 0, 0.18], 0.052, 0.25),
      castor([-0.18, 0, -0.18], 0.052, -0.25),
      castor([0.48, 0, 0.16], 0.046, 0.12),
      castor([0.48, 0, -0.16], 0.046, -0.12),
    ]
    emit('rubber', mergeParts(rubberBase, 'casters'), base, 'casters')

    emit('darkMetal', bolt([pivotX, pivotY, 0], 0.02, 0.18, AXIS_Z), base, 'pivot')

    const linkage: BufferGeometry[] = []
    for (const sz of [-1, 1] as const) {
      linkage.push(ovalTube([
        new Vector3(0, 0, sz * 0.065),
        new Vector3(-0.11, 0.19, sz * 0.065),
      ], 0.014, 0.018, 8))
    }
    linkage.push(bevelBox(0.075, 0.035, 0.17, 0.005).translate(-0.11, 0.19, 0))
    emit('metal', mergeParts(linkage, 'handle-linkage'), lever, 'handle-linkage')
    emit('darkMetal', bolt([0, 0, 0], 0.018, 0.17, AXIS_Z), lever, 'lever-hinge')

    emit('metal', ovalTube([
      new Vector3(0.0, 0.0, 0),
      new Vector3(0.2, 0.005, 0),
      new Vector3(0.4, 0.018, 0),
      new Vector3(JACK_PAD_X, JACK_PAD_Y, 0),
    ], 0.034, 0.042, 12), lever, 'arm')

    const crossbar = bevelBox(0.09, 0.03, 0.25, 0.004)
    crossbar.translate(JACK_PAD_X, JACK_PAD_Y, 0)
    emit('darkMetal', crossbar, lever, 'crossbar')

    const padTop = bevelBox(0.2, 0.018, 0.23, 0.006)
    padTop.translate(JACK_PAD_X, JACK_PAD_Y + 0.016, 0)
    emit('rubber', padTop, lever, 'pad')

    handle.rotation.z = 0.18
    const HL = 1.08
    emit('metal', tubeSection(0.018, HL, [0, HL / 2, 0], [0, 1, 0], 12), handle, 'shaft')
    emit('accent', tubeSection(0.026, 0.18, [0, HL - 0.09, 0], [0, 1, 0], 12), handle, 'grip')
    const collarGeometry = tubeSection(0.029, 0.035, [0, HL - 0.195, 0], [0, 1, 0], 12)
    generated.push(collarGeometry)
    const collar = new Mesh(collarGeometry, kit.red)
    collar.name = 'safety-collar'
    collar.castShadow = true
    handle.add(collar)
  }
  rebuild()

  const applyLift = (): void => {
    lever.rotation.z = config.lift * JACK_MAX_ANGLE
  }
  applyLift()

  return {
    root,
    parts: { base, lever, handle },
    materials: materialSlots,
    liftMeters: JACK_LIFT_METERS,
    getConfig: () => ({ ...config }),
    configure(patch) {
      if (patch.lift !== undefined) config.lift = clamp01(patch.lift)
      applyLift()
    },
    setMaterial(slot, material) {
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
  const model = createModel()
  const preview = createF1Preview(model, { aspect, target: [0.12, 0.48, 0], distance: 2.85, yaw: -0.52, pitch: 0.2 })
  let lifted = false
  return {
    ...preview,
    /** Toggle between resting and fully-jacked, for an interactive preview action. */
    toggleLift(): void {
      lifted = !lifted
      model.configure({ lift: lifted ? 1 : 0 })
    },
  }
}
