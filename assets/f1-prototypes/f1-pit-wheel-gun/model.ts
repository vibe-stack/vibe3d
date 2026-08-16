// f1-pit-wheel-gun — a chunky pit-lane impact wrench: a lofted rounded-rect body tapering toward the
// socket, a curved pistol grip, and a hex socket on a short shaft pointing +X. `configure({ engaged })`
// slides the gun +X so the socket seats on a hub; `configure({ spinning: true })` free-spins the socket via
// `update(deltaSeconds)`. A status LED reads bright when running. Ported from a private racing project's
// pit-stop choreography prop.

import {
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
import { LoftGeometry } from 'three/examples/jsm/geometries/LoftGeometry.js'

import { ovalTube } from '../f1-kit-core/primitives.ts'
import { ResourceBag, clamp01 } from '../f1-kit-core/resourceBag.ts'

export interface F1PitWheelGunConfig {
  /** 0 = held back/away, 1 = socket seated on the hub. */
  engaged: number
  /** Whether the socket free-spins each `update()` tick. */
  spinning: boolean
}

export interface F1PitWheelGunOptions extends Partial<F1PitWheelGunConfig> {
  materials?: Partial<Record<'gunmetal' | 'steel' | 'gripRubber' | 'accent' | 'led', Material>>
}

export interface F1PitWheelGunInstance {
  readonly root: Group
  readonly parts: { body: Group; spinner: Group }
  readonly materials: Readonly<Record<'gunmetal' | 'steel' | 'gripRubber' | 'accent' | 'led', Material>>
  getConfig(): Readonly<F1PitWheelGunConfig>
  configure(patch: Partial<F1PitWheelGunConfig>): void
  setMaterial(slot: 'gunmetal' | 'steel' | 'gripRubber' | 'accent' | 'led', material: Material): void
  update(deltaSeconds: number): void
  dispose(): void
}

const defaults: F1PitWheelGunConfig = { engaged: 0, spinning: false }

const GUN_ENGAGE_TRAVEL = 0.2 // how far the gun slides +X from held-back (0) to seated (1)
const GUN_SPIN_RATE = 55 // rad/s the socket spins while running (impact-wrench fast)

/** A rounded-rectangle (super-ellipse) ring in the Y-Z plane at longitudinal `x`. `p < 1` -> boxy/rounded —
 *  the chunky body reads as a rounded block, not a plain cylinder. */
function gunBodyRing(x: number, hy: number, hz: number, p = 0.62): Vector3[] {
  const ring: Vector3[] = []
  for (let k = 0; k < 16; k++) {
    const a = (k / 16) * Math.PI * 2
    const sy = Math.sin(a)
    const cz = Math.cos(a)
    const y = hy * Math.sign(sy) * Math.pow(Math.abs(sy), p)
    const z = hz * Math.sign(cz) * Math.pow(Math.abs(cz), p)
    ring.push(new Vector3(x, y, z))
  }
  return ring
}

export function createModel(options: F1PitWheelGunOptions = {}): F1PitWheelGunInstance {
  const config: F1PitWheelGunConfig = {
    engaged: clamp01(options.engaged ?? defaults.engaged),
    spinning: options.spinning ?? defaults.spinning,
  }

  const bag = new ResourceBag()
  const gunmetal = (options.materials?.gunmetal ?? bag.mat(new MeshStandardMaterial({ color: 0x3b3f45, metalness: 0.75, roughness: 0.45 }))) as Material
  const steel = (options.materials?.steel ?? bag.mat(new MeshStandardMaterial({ color: 0xc8ccd2, metalness: 0.85, roughness: 0.3 }))) as Material
  const gripRubber = (options.materials?.gripRubber ?? bag.mat(new MeshStandardMaterial({ color: 0x121317, metalness: 0.0, roughness: 0.95 }))) as Material
  const accent = (options.materials?.accent ?? bag.mat(new MeshStandardMaterial({ color: 0xff5a1f, metalness: 0.2, roughness: 0.5 }))) as Material
  // Status LED — the only emissive part, unlit-bright via toneMapped:false so it glows through the tone map.
  const led = (options.materials?.led ?? bag.mat(new MeshStandardMaterial({ color: 0x001a00, emissive: 0x35ff5a, emissiveIntensity: 1.4, toneMapped: false }))) as Material
  const materialSlots: Record<'gunmetal' | 'steel' | 'gripRubber' | 'accent' | 'led', Material> = {
    gunmetal, steel, gripRubber, accent, led,
  }

  const root = new Group()
  root.name = 'f1-pit-wheel-gun'
  const body = new Group(); body.name = 'body' // slides +X on engage
  const spinner = new Group(); spinner.name = 'spinner'
  root.add(body)
  body.add(spinner)

  const meshesBySlot: Record<keyof typeof materialSlots, Mesh[]> = {
    gunmetal: [], steel: [], gripRubber: [], accent: [], led: [],
  }
  const meshOf = (slot: keyof typeof materialSlots, geometry: import('three/webgpu').BufferGeometry): Mesh => {
    const mesh = new Mesh(geometry, materialSlots[slot])
    meshesBySlot[slot].push(mesh)
    return mesh
  }

  // HERO: the body — a LoftGeometry of rounded-rect rings, fat at the rear and tapering toward the socket.
  const bodyRings = [
    gunBodyRing(-0.15, 0.055, 0.05),
    gunBodyRing(-0.07, 0.062, 0.056),
    gunBodyRing(0.01, 0.056, 0.05),
    gunBodyRing(0.07, 0.04, 0.036),
    gunBodyRing(0.1, 0.032, 0.03),
  ]
  const bodyMesh = meshOf('gunmetal', bag.geo(new LoftGeometry(bodyRings, { closed: true, capStart: true, capEnd: true })))
  bodyMesh.castShadow = true
  bodyMesh.receiveShadow = true
  body.add(bodyMesh)

  // Accent collar band near the front of the body.
  const collar = meshOf('accent', bag.geo(new CylinderGeometry(0.05, 0.05, 0.022, 24)))
  collar.geometry.rotateZ(Math.PI / 2)
  collar.position.x = 0.045
  body.add(collar)

  // HERO: the pistol grip — an oval-section swept loft curving down from the body underside.
  const gripPath = [
    new Vector3(-0.03, -0.05, 0),
    new Vector3(0.0, -0.12, 0),
    new Vector3(0.01, -0.2, 0),
    new Vector3(-0.01, -0.27, 0),
  ]
  const grip = meshOf('gripRubber', bag.geo(ovalTube(gripPath, 0.03, 0.038, 12)))
  grip.castShadow = true
  body.add(grip)

  // Status LED on the body crown.
  const ledMesh = meshOf('led', bag.geo(new CylinderGeometry(0.009, 0.009, 0.012, 10)))
  ledMesh.geometry.rotateX(Math.PI / 2)
  ledMesh.position.set(-0.06, 0.06, 0.045)
  body.add(ledMesh)

  // The spinner — anvil + shaft + hex socket, all on the +X axis.
  const anvil = meshOf('steel', bag.geo(new CylinderGeometry(0.045, 0.03, 0.04, 20)))
  anvil.geometry.rotateZ(Math.PI / 2)
  anvil.position.x = 0.115
  anvil.castShadow = true
  spinner.add(anvil)

  const shaft = meshOf('steel', bag.geo(new CylinderGeometry(0.02, 0.02, 0.06, 16)))
  shaft.geometry.rotateZ(Math.PI / 2)
  shaft.position.x = 0.165
  spinner.add(shaft)

  const socket = meshOf('steel', bag.geo(new CylinderGeometry(0.036, 0.036, 0.06, 6))) // 6-sided = a real hex drive
  socket.geometry.rotateZ(Math.PI / 2)
  socket.position.x = 0.225
  socket.castShadow = true
  spinner.add(socket)

  const applyEngaged = (): void => {
    body.position.x = config.engaged * GUN_ENGAGE_TRAVEL
  }
  applyEngaged()

  return {
    root,
    parts: { body, spinner },
    materials: materialSlots,
    getConfig: () => ({ ...config }),
    configure(patch) {
      if (patch.engaged !== undefined) config.engaged = clamp01(patch.engaged)
      if (patch.spinning !== undefined) config.spinning = patch.spinning
      applyEngaged()
    },
    setMaterial(slot, material) {
      materialSlots[slot] = material
      for (const mesh of meshesBySlot[slot]) mesh.material = material
    },
    update(deltaSeconds) {
      if (config.spinning) spinner.rotation.x += deltaSeconds * GUN_SPIN_RATE
    },
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
  camera.position.set(0.55, 0.35, 0.55)
  camera.lookAt(0.05, -0.05, 0)
  scene.add(camera)
  let running = false
  return {
    scene,
    root: model.root,
    camera,
    update: model.update,
    dispose: model.dispose,
    /** Toggle engaged + spinning together, for an interactive preview action. */
    toggleRun(): void {
      running = !running
      model.configure({ engaged: running ? 1 : 0, spinning: running })
    },
  }
}
