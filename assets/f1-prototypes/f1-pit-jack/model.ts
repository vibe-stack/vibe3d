// f1-pit-jack — the classic low lever jack a pit crew slams under the car's nose or tail: a ground base
// + pivot bracket hold a rigid lever whose LIFT ARM (a lofted oval-section beam) reaches toward the car to
// a T-bar pad, while the HANDLE sticks up-and-back. Rotating the shared pivot raises the arm (car up)
// while the handle swings down. `configure({ lift })` drives the lever angle; `liftMeters` on the instance
// reports the pad's honest vertical rise so a host scene can match the car's Y offset. Ported from a
// private racing project's pit-stop choreography prop.

import {
  BoxGeometry,
  BufferGeometry,
  CylinderGeometry,
  DirectionalLight,
  Group,
  HemisphereLight,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  Scene,
  Vector3,
  type Material,
} from 'three/webgpu'

import { ovalTube } from '../f1-kit-core/primitives.ts'
import { ResourceBag, clamp01 } from '../f1-kit-core/resourceBag.ts'

export interface F1PitJackConfig {
  /** 0 = resting (car down), 1 = fully jacked (car lifted). */
  lift: number
}

export interface F1PitJackOptions extends Partial<F1PitJackConfig> {
  materials?: Partial<Record<'metal' | 'darkMetal' | 'accent' | 'rubber', Material>>
}

export interface F1PitJackInstance {
  readonly root: Group
  readonly parts: { base: Group; lever: Group; handle: Group }
  readonly materials: Readonly<Record<'metal' | 'darkMetal' | 'accent' | 'rubber', Material>>
  /** Vertical rise of the lift pad at lift=1 (metres) — match the car's Y offset to this. */
  readonly liftMeters: number
  getConfig(): Readonly<F1PitJackConfig>
  configure(patch: Partial<F1PitJackConfig>): void
  setMaterial(slot: 'metal' | 'darkMetal' | 'accent' | 'rubber', material: Material): void
  update(deltaSeconds: number): void
  dispose(): void
}

const defaults: F1PitJackConfig = { lift: 0 }

const JACK_PAD_X = 0.46 // pad tip forward of the pivot
const JACK_PAD_Y = 0.1 // pad tip above the pivot at rest
const JACK_MAX_ANGLE = 0.42 // rad the lever swings from rest -> full lift (~24 degrees, arcade-exaggerated)
// rise = padX*sin(theta) + padY*(cos(theta) - 1)  (rotation about +Z lifts the +X arm)
const JACK_LIFT_METERS = JACK_PAD_X * Math.sin(JACK_MAX_ANGLE) + JACK_PAD_Y * (Math.cos(JACK_MAX_ANGLE) - 1)

export function createModel(options: F1PitJackOptions = {}): F1PitJackInstance {
  const config: F1PitJackConfig = { lift: clamp01(options.lift ?? defaults.lift) }

  const bag = new ResourceBag()
  const metal = (options.materials?.metal ?? bag.mat(new MeshStandardMaterial({ color: 0x8f959c, metalness: 0.85, roughness: 0.35 }))) as Material
  const darkMetal = (options.materials?.darkMetal ?? bag.mat(new MeshStandardMaterial({ color: 0x2c2f34, metalness: 0.7, roughness: 0.5 }))) as Material
  const accent = (options.materials?.accent ?? bag.mat(new MeshStandardMaterial({ color: 0xff5a1f, metalness: 0.2, roughness: 0.55 }))) as Material
  const rubber = (options.materials?.rubber ?? bag.mat(new MeshStandardMaterial({ color: 0x14151a, metalness: 0.0, roughness: 0.95 }))) as Material
  const materialSlots: Record<'metal' | 'darkMetal' | 'accent' | 'rubber', Material> = { metal, darkMetal, accent, rubber }

  const root = new Group()
  root.name = 'f1-pit-jack'
  const base = new Group(); base.name = 'base'
  const lever = new Group(); lever.name = 'lever'
  const handle = new Group(); handle.name = 'handle'
  root.add(base, lever)
  lever.add(handle)

  const pivotX = 0.0
  const pivotY = 0.09
  lever.position.set(pivotX, pivotY, 0)

  // Track every mesh that uses a given material slot, so setMaterial can reassign all of them at once.
  const meshesBySlot: Record<'metal' | 'darkMetal' | 'accent' | 'rubber', Mesh[]> = {
    metal: [], darkMetal: [], accent: [], rubber: [],
  }
  const meshOf = (slot: keyof typeof meshesBySlot, geometry: BufferGeometry): Mesh => {
    const mesh = new Mesh(geometry, materialSlots[slot])
    meshesBySlot[slot].push(mesh)
    return mesh
  }

  // Ground base plate + two rolling casters at the back.
  const basePlate = meshOf('metal', bag.geo(new BoxGeometry(0.55, 0.04, 0.3)))
  basePlate.position.set(0.1, 0.02, 0)
  basePlate.castShadow = true
  basePlate.receiveShadow = true
  base.add(basePlate)
  for (const sz of [1, -1] as const) {
    const caster = meshOf('rubber', bag.geo(new CylinderGeometry(0.05, 0.05, 0.04, 16)))
    caster.geometry.rotateX(Math.PI / 2)
    caster.position.set(-0.12, 0.05, sz * 0.13)
    caster.castShadow = true
    base.add(caster)
  }

  // Pivot bracket (static): two side plates + the pivot bolt.
  for (const sz of [1, -1] as const) {
    const plate = meshOf('metal', bag.geo(new BoxGeometry(0.16, 0.11, 0.02)))
    plate.position.set(pivotX, pivotY - 0.01, sz * 0.07)
    plate.castShadow = true
    base.add(plate)
  }
  const bolt = meshOf('darkMetal', bag.geo(new CylinderGeometry(0.02, 0.02, 0.18, 12)))
  bolt.geometry.rotateX(Math.PI / 2)
  bolt.position.set(pivotX, pivotY, 0)
  base.add(bolt)

  // HERO: the lift arm — an oval-section beam curving up from the pivot to the pad tip.
  const armPath = [
    new Vector3(0.0, 0.0, 0),
    new Vector3(0.18, 0.02, 0),
    new Vector3(0.34, 0.06, 0),
    new Vector3(JACK_PAD_X, JACK_PAD_Y, 0),
  ]
  const arm = meshOf('metal', bag.geo(ovalTube(armPath, 0.045, 0.05, 12)))
  arm.castShadow = true
  lever.add(arm)

  // T-bar lift pad at the arm tip.
  const crossbar = meshOf('darkMetal', bag.geo(new BoxGeometry(0.07, 0.03, 0.24)))
  crossbar.position.set(JACK_PAD_X, JACK_PAD_Y, 0)
  crossbar.castShadow = true
  lever.add(crossbar)
  const padTop = meshOf('rubber', bag.geo(new BoxGeometry(0.06, 0.015, 0.22)))
  padTop.position.set(JACK_PAD_X, JACK_PAD_Y + 0.022, 0)
  lever.add(padTop)

  // Handle — a long bar up-and-back with an accent grip at the end.
  handle.rotation.z = 0.9
  const HL = 0.9
  const shaft = meshOf('metal', bag.geo(new CylinderGeometry(0.018, 0.018, HL, 12)))
  shaft.position.y = HL / 2
  shaft.castShadow = true
  handle.add(shaft)
  const grip = meshOf('accent', bag.geo(new CylinderGeometry(0.026, 0.026, 0.3, 12)))
  grip.position.y = HL - 0.15
  grip.castShadow = true
  handle.add(grip)

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
      bag.dispose()
      root.removeFromParent()
    },
  }
}

export function createPreview({ aspect }: { aspect: number; time?: number }) {
  const model = createModel()
  const scene = new Scene()
  scene.add(model.root, new HemisphereLight(0x8ea3b2, 0x0a0c10, 0.6))
  const key = new DirectionalLight(0xfff2e2, 1.2)
  key.position.set(-2, 3, 2.5)
  scene.add(key)
  const camera = new PerspectiveCamera(30, aspect, 0.02, 20)
  camera.position.set(1.1, 0.75, 1.1)
  camera.lookAt(0.15, 0.1, 0)
  scene.add(camera)
  let lifted = false
  return {
    scene,
    root: model.root,
    camera,
    update: model.update,
    dispose: model.dispose,
    /** Toggle between resting and fully-jacked, for an interactive preview action. */
    toggleLift(): void {
      lifted = !lifted
      model.configure({ lift: lifted ? 1 : 0 })
    },
  }
}
