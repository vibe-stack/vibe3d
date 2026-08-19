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
  DataTexture,
  ExtrudeGeometry,
  Group,
  LinearFilter,
  LinearMipmapLinearFilter,
  MathUtils,
  Mesh,
  MeshStandardMaterial,
  Path,
  RepeatWrapping,
  RGBAFormat,
  Shape,
  UnsignedByteType,
  Vector3,
  type Material,
} from 'three/webgpu'
import { toCreasedNormals } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

import {
  AXIS_X,
  AXIS_Z,
  TOKEN,
  acquireF1Materials,
  bevelBox,
  bevelDisc,
  bevelRing,
  bolt,
  clamp01,
  createF1Preview,
  disposeF1Materials,
  mergeParts,
  ovalTube,
  shade,
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
function axial(
  rTop: number, rBottom: number, length: number, x: number, radial = 20, open = false,
): BufferGeometry {
  const geo = new CylinderGeometry(rTop, rBottom, length, radial, 1, open)
  geo.rotateZ(Math.PI / 2)
  geo.translate(x, 0, 0)
  return geo
}

/** 2×2 twill — glossy carbon weave without a PRNG. */
function carbonTwillTexture(n = 64): DataTexture {
  const data = new Uint8Array(n * n * 4)
  const cell = 8
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const cx = (x / cell) | 0
      const cy = (y / cell) | 0
      const checker = ((cx + cy) & 1) === 0
      const lx = x - cx * cell
      const ly = y - cy * cell
      const fiber = checker ? lx : ly
      const ridge = 1 - Math.abs(fiber / cell * 2 - 1)
      const base = checker ? 72 : 22
      const k = base + Math.round(ridge * 40)
      const i = (y * n + x) * 4
      data[i] = k
      data[i + 1] = k + 2
      data[i + 2] = k + 4
      data[i + 3] = 255
    }
  }
  const tex = new DataTexture(data, n, n, RGBAFormat, UnsignedByteType)
  tex.wrapS = RepeatWrapping
  tex.wrapT = RepeatWrapping
  tex.magFilter = LinearFilter
  tex.minFilter = LinearMipmapLinearFilter
  tex.generateMipmaps = true
  tex.repeat.set(6, 2)
  tex.needsUpdate = true
  return tex
}

/** One two-finger slab with a circular cutout, plate in YZ, thin along +X. */
function triggerPlate(): BufferGeometry {
  const hw = 0.024
  const hh = 0.052
  const corner = 0.007
  const hole = 0.019
  const thick = 0.008
  const bevel = 0.0015
  const shape = new Shape()
  shape.moveTo(-hw + corner, -hh)
  shape.lineTo(hw - corner, -hh)
  shape.quadraticCurveTo(hw, -hh, hw, -hh + corner)
  shape.lineTo(hw, hh - corner)
  shape.quadraticCurveTo(hw, hh, hw - corner, hh)
  shape.lineTo(-hw + corner, hh)
  shape.quadraticCurveTo(-hw, hh, -hw, hh - corner)
  shape.lineTo(-hw, -hh + corner)
  shape.quadraticCurveTo(-hw, -hh, -hw + corner, -hh)
  shape.closePath()
  const cut = new Path()
  cut.absarc(0, 0, hole, 0, Math.PI * 2, true)
  shape.holes.push(cut)
  const geo = new ExtrudeGeometry(shape, {
    depth: thick - 2 * bevel,
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelOffset: 0,
    bevelSegments: 1,
    steps: 1,
    curveSegments: 20,
  })
  geo.translate(0, 0, -(thick / 2 - bevel))
  const creased = toCreasedNormals(geo, MathUtils.degToRad(50))
  if (creased !== geo) geo.dispose()
  creased.rotateY(Math.PI / 2)
  creased.translate(0.058, -0.088, 0)
  return creased
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
  const textures: DataTexture[] = []
  const ownsCone = options.materials?.gunmetal === undefined
  let carbon: Material
  if (ownsCone) {
    const weave = carbonTwillTexture()
    textures.push(weave)
    carbon = new MeshStandardMaterial({
      name: 'f1-kit / tyre-gun carbon cone',
      map: weave,
      color: shade(TOKEN.SHELL_200, -0.15),
      roughness: 0.025,
      metalness: 0.88,
    })
    extras.push(carbon)
  } else {
    carbon = options.materials!.gunmetal!
  }
  const machined = options.materials?.gunmetal ?? new MeshStandardMaterial({
    name: 'f1-kit / tyre-gun gunmetal',
    color: shade(TOKEN.GRAPHITE_800, 0.48),
    roughness: 0.16,
    metalness: 0.9,
  })
  if (options.materials?.gunmetal === undefined) extras.push(machined)
  const anodized = options.materials?.accent ?? new MeshStandardMaterial({
    name: 'f1-kit / tyre-gun anodized',
    color: shade(TOKEN.COBALT_500, 0.42),
    roughness: 0.22,
    metalness: 0.35,
    emissive: TOKEN.COBALT_500,
    emissiveIntensity: 0.3,
    toneMapped: false,
  })
  if (options.materials?.accent === undefined) extras.push(anodized)
  const materialSlots: Record<Slot, Material> = {
    gunmetal: machined,
    steel: options.materials?.steel ?? kit.steel,
    gripRubber: options.materials?.gripRubber ?? kit.ink,
    accent: anodized,
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
    for (let i = 0; i < 10; i++) {
      const rib = bevelBox(0.005, 0.016, 0.13, 0.0015)
      rib.translate(-0.28 + i * 0.012, 0.108, 0)
      gunmetalParts.push(rib)
    }
    emit('gunmetal', mergeParts(gunmetalParts, 'barrel'), body, 'barrel')

    // Glossy carbon taper, small end just behind the spline so the blue collar can wrap it.
    const cone = axial(0.044, 0.096, 0.166, 0.015, 40, true)
    generated.push(cone)
    const coneMesh = new Mesh(cone, carbon)
    coneMesh.name = 'carbon-cone'
    coneMesh.castShadow = true
    coneMesh.receiveShadow = true
    body.add(coneMesh)

    const boltParts: BufferGeometry[] = []
    for (const [y, z] of [[0.062, 0.062], [0.062, -0.062], [-0.062, 0.062], [-0.062, -0.062]] as const) {
      boltParts.push(bolt([-0.012, y, z], 0.007, 0.014, AXIS_X))
    }
    emit('gripRubber', mergeParts(boltParts, 'flange-bolts'), body, 'flange-bolts')

    emit('gripRubber', triggerPlate(), body, 'trigger')
    const triggerRim = bevelRing(0.0185, 0.0205, 0.0085, 0.0008, 24)
    triggerRim.rotateY(Math.PI / 2)
    triggerRim.translate(0.058, -0.088, 0)
    emit('steel', triggerRim, body, 'trigger-rim')
    const steelParts: BufferGeometry[] = []
    const inlet = new CylinderGeometry(0.015, 0.015, 0.048, 14)
    inlet.translate(-0.018, -0.312, 0)
    steelParts.push(inlet)
    const inletCollar = new CylinderGeometry(0.021, 0.021, 0.016, 14)
    inletCollar.translate(-0.018, -0.288, 0)
    steelParts.push(inletCollar)
    const dialBolt = bolt([-0.248, 0.012, 0.116], 0.008, 0.016, AXIS_Z)
    steelParts.push(dialBolt)
    emit('steel', mergeParts(steelParts, 'inlet-and-dial'), body, 'nose')

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

    // Thin blue collar wrapping the cone, immediately behind the spline — not a nose flange.
    // Keep collar and rear dial as separate meshes: merging them makes a paper-thin AABB that
    // plate-overlaps the grip (rule 8).
    const collar = new CylinderGeometry(0.050, 0.054, 0.014, 28, 1, true)
    collar.rotateZ(Math.PI / 2)
    collar.translate(0.093, 0, 0)
    emit('accent', collar, body, 'collar')
    const reverseDial = bevelDisc(0.038, 0.012, 0.002, 28)
    reverseDial.translate(-0.248, 0.012, 0.114)
    emit('accent', reverseDial, body, 'rear-dial')

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
      tubeSection(0.022, 0.054, [0.121, 0, 0], AXIS_X, 16),
    ]
    for (let i = 0; i < 12; i++) {
      const angle = (i / 12) * Math.PI * 2
      const spline = bevelBox(0.050, 0.011, 0.011, 0.002)
      spline.translate(0, 0.028, 0)
      spline.rotateX(angle)
      spline.translate(0.121, 0, 0)
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
      for (const texture of textures) texture.dispose()
      for (const material of extras) material.dispose()
      disposeF1Materials(bundle)
      root.removeFromParent()
    },
  }
}

export function createPreview({ aspect }: { aspect: number; time?: number }) {
  const model = createModel()
  const preview = createF1Preview(model, {
    aspect,
    target: [-0.02, -0.06, 0],
    distance: 1.24,
    yaw: 0.28,
    pitch: 0.10,
  })
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
