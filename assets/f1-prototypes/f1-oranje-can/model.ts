// f1-oranje-can — handheld Dutch-GP orange smoke flare (the "oranje army" support can).
//
// Geometry is a lathed can + striker. Smoke clouds and spark jets are closed-form pools
// imported from devlo-racing `OranjeSmoke` / `OranjeSparkFountains` (Weyl phases, mod-wrapped life,
// scattering vs emissive families). No TSL, no PRNG. Steady-state at elapsed=0 for stills.
//
// Datums: typical handheld smoke grenade ~Ø70 mm × 160 mm body (stated approximation — no measured
// photo in this kit). Wind default is Zandvoort's published south-westerly unit vector
// (−0.692, +0.722) from `ZANDVOORT_WIND_FROM_DEG = 225`. Smoke / spark hexes are the committed
// flare palette from those features, not TOKEN.ORANGE_500 (the can paint).

import {
  AdditiveBlending,
  BufferGeometry,
  Color,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Points,
  SphereGeometry,
  type Material,
} from 'three/webgpu'

import {
  TOKEN,
  acquireF1Materials,
  bevelBox,
  bevelDisc,
  bevelRing,
  buildPlumePointGeometry,
  createF1Preview,
  createPlumePointMaterial,
  disposeF1Materials,
  mergeParts,
  revolve,
  tubeSection,
  type PlumePointHandle,
} from '../f1-kit-core/index.ts'

type Slot = 'body' | 'hardware' | 'smoke' | 'spark'

export interface F1OranjeCanConfig {
  /** When false, the can is cold — no plume, no sparks. */
  lit: boolean
  /** Unit wind in model XZ. Default is Zandvoort's onshore south-westerly. */
  windXZ: readonly [number, number]
}

export interface F1OranjeCanOptions extends Partial<F1OranjeCanConfig> {
  materials?: Partial<Record<Slot, Material>>
}

export interface F1OranjeCanInstance {
  readonly root: Group
  readonly parts: { body: Group; fx: Group }
  readonly materials: Readonly<Record<Slot, Material>>
  getConfig(): Readonly<F1OranjeCanConfig>
  configure(patch: Partial<F1OranjeCanConfig>): void
  setMaterial(slot: Slot, material: Material): void
  update(deltaSeconds: number): void
  dispose(): void
}

const PHI = 0.61803398875
const PHI3 = 0.7548776662
const PHI4 = 0.4142135624
const PHI5 = 0.5698402909275586
const PHI7 = 0.6457513110645907
const IDX_ORANJE = 400_000
const IDX_ORANJE_FOUNTAIN = 500_000

const ZANDVOORT_WIND_XZ: readonly [number, number] = [-0.692, 0.722]

const BODY_H = 0.16
const MOUTH_Y = 0.175

const PLUME_N = 40
const HAZE_N = 6
const SPARK_N = 28

const PLUME_CYCLE_S = 8
const ALBEDO_VAR = 0.08
const WANDER_VAR = 0.5

const SMOKE_BASE = new Color(0xff6c12)
const SMOKE_TOP = new Color(0xee8a38)
const HAZE_BASE = new Color(0xdf8a4e)
const HAZE_TOP = new Color(0xee8a38)
const SPARK_COL = new Color(0xfff6d8)

const defaults: F1OranjeCanConfig = { lit: true, windXZ: ZANDVOORT_WIND_XZ }

function frac(x: number): number {
  return x - Math.floor(x)
}

function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x
}

function normalizeWind(wind: readonly [number, number]): readonly [number, number] {
  const len = Math.hypot(wind[0], wind[1]) || 1
  return [wind[0] / len, wind[1] / len]
}

function buildSmokePool(windXZ: readonly [number, number]): {
  points: Points
  handle: PlumePointHandle
  geo: BufferGeometry
} {
  const count = PLUME_N + HAZE_N
  const built = buildPlumePointGeometry(count)
  const { pos, seed, seed2 } = built

  for (let i = 0; i < PLUME_N; i++) {
    const g = IDX_ORANJE + i
    const angle = frac(i * PHI4) * Math.PI * 2
    const spread = frac(i * PHI7) * 0.015
    pos[i * 3] = Math.cos(angle) * spread
    pos[i * 3 + 1] = MOUTH_Y
    pos[i * 3 + 2] = Math.sin(angle) * spread
    seed[i * 4] = frac(g * PHI) * PLUME_CYCLE_S
    seed[i * 4 + 1] = 4 + 2 * frac(g * PHI3)
    seed[i * 4 + 2] = 1 - WANDER_VAR + 2 * WANDER_VAR * frac(g * PHI4)
    seed[i * 4 + 3] = frac(g * PHI5) * Math.PI * 2
    seed2[i * 2] = 1 - ALBEDO_VAR + 2 * ALBEDO_VAR * frac(g * PHI7)
    seed2[i * 2 + 1] = 0
  }

  for (let i = 0; i < HAZE_N; i++) {
    const k = PLUME_N + i
    const g = IDX_ORANJE + 50_000 + i
    pos[k * 3] = 0
    pos[k * 3 + 1] = MOUTH_Y
    pos[k * 3 + 2] = 0
    seed[k * 4] = frac(g * PHI) * PLUME_CYCLE_S
    seed[k * 4 + 1] = 6.5 + 1.2 * frac(g * PHI3)
    seed[k * 4 + 2] = 1
    seed[k * 4 + 3] = frac(g * PHI5) * Math.PI * 2
    seed2[k * 2] = 1 - ALBEDO_VAR + 2 * ALBEDO_VAR * frac(g * PHI7)
    seed2[k * 2 + 1] = 1
  }

  const handle = createPlumePointMaterial({
    windXZ,
    plume: {
      cycle: PLUME_CYCLE_S,
      riseMax: 1.35,
      riseTau: 1.8,
      driftSpeed: 0.14,
      driftDelay: 0.25,
      driftCapTime: 2.5,
      wanderBase: 0.02,
      wanderGrowth: 0.12,
      wanderHz: 0.9,
      radiusStart: 0.03,
      radiusEnd: 0.22,
      radiusPow: 1.25,
      radiusCap: 0.22,
      alphaPeak: 0.58,
      fadeInFrac: 0.1,
      fadeOutFrac: 0.4,
      alphaFloorFrac: 0.6,
      albedoPow: 3.4,
      colBase: SMOKE_BASE,
      colTop: SMOKE_TOP,
    },
    haze: {
      cycle: PLUME_CYCLE_S,
      riseMax: 0.9,
      riseTau: 0.4,
      driftSpeed: 0.22,
      driftDelay: 0,
      driftCapTime: 4,
      wanderBase: 0.04,
      wanderGrowth: 0,
      wanderHz: 0.35,
      radiusStart: 0.16,
      radiusEnd: 0.38,
      radiusPow: 0.8,
      radiusCap: 0.38,
      alphaPeak: 0.18,
      fadeInFrac: 0.08,
      fadeOutFrac: 0.25,
      alphaFloorFrac: 0.65,
      albedoPow: 1,
      colBase: HAZE_BASE,
      colTop: HAZE_TOP,
    },
    sizeCapPx: 220,
  })
  handle.material.name = 'f1-kit / oranje-smoke'

  const points = new Points(built.geo, handle.material)
  points.name = 'oranje-smoke'
  points.frustumCulled = false
  return { points, handle, geo: built.geo }
}

export function createModel(options: F1OranjeCanOptions = {}): F1OranjeCanInstance {
  const config: F1OranjeCanConfig = {
    lit: options.lit ?? defaults.lit,
    windXZ: normalizeWind(options.windXZ ?? defaults.windXZ),
  }

  const bundle = acquireF1Materials()
  const kit = bundle.materials
  const extras: Material[] = []
  const own = (material: Material): Material => {
    extras.push(material)
    return material
  }

  const sparkMat = options.materials?.spark ?? own(new MeshBasicMaterial({
    name: 'f1-kit / oranje-fountains',
    color: SPARK_COL,
    transparent: true,
    opacity: 0.92,
    depthWrite: false,
    toneMapped: false,
    blending: AdditiveBlending,
  }))

  const materialSlots: Record<Slot, Material> = {
    body: options.materials?.body ?? own(kit.orange.clone() as MeshStandardMaterial),
    hardware: options.materials?.hardware ?? kit.graphite,
    smoke: options.materials?.smoke ?? own(new MeshBasicMaterial({ visible: false })),
    spark: sparkMat,
  }
  if (options.materials?.body === undefined) {
    ;(materialSlots.body as MeshStandardMaterial).color.set(TOKEN.ORANGE_500)
  }

  const root = new Group()
  root.name = 'f1-oranje-can'
  const body = new Group(); body.name = 'body'
  const fx = new Group(); fx.name = 'fx'
  root.add(body, fx)

  const generated: BufferGeometry[] = []
  const meshesBySlot: Record<Slot, Mesh[]> = { body: [], hardware: [], smoke: [], spark: [] }
  const scratch = new Matrix4()
  let elapsed = 0
  let sparkMesh: InstancedMesh | null = null
  let smokePoints: Points | null = null
  let smokeHandle: PlumePointHandle | null = null

  const releaseGenerated = (): void => {
    for (const group of [body, fx]) group.clear()
    for (const geometry of generated) geometry.dispose()
    generated.length = 0
    for (const slot of Object.keys(meshesBySlot) as Slot[]) meshesBySlot[slot].length = 0
    sparkMesh = null
    smokePoints = null
    smokeHandle = null
  }

  const emit = (
    slot: Slot,
    geometry: BufferGeometry,
    group: Group,
    name: string,
    material?: Material,
  ): void => {
    generated.push(geometry)
    const mesh = new Mesh(geometry, material ?? materialSlots[slot])
    mesh.name = name
    mesh.castShadow = slot !== 'smoke' && slot !== 'spark'
    mesh.receiveShadow = slot !== 'smoke' && slot !== 'spark'
    meshesBySlot[slot].push(mesh)
    group.add(mesh)
  }

  const emitInstances = (
    slot: Slot,
    mesh: InstancedMesh,
    group: Group,
  ): void => {
    if (!generated.includes(mesh.geometry)) generated.push(mesh.geometry)
    mesh.castShadow = false
    mesh.receiveShadow = false
    mesh.frustumCulled = false
    meshesBySlot[slot].push(mesh)
    group.add(mesh)
  }

  const hideInstance = (mesh: InstancedMesh, index: number): void => {
    scratch.makeScale(0, 0, 0)
    mesh.setMatrixAt(index, scratch)
  }

  const sampleSparks = (mesh: InstancedMesh): void => {
    for (let i = 0; i < SPARK_N; i++) {
      if (!config.lit) {
        hideInstance(mesh, i)
        continue
      }
      const g = IDX_ORANJE_FOUNTAIN + i
      const cycle = 1.15
      const life = 0.4 + 0.3 * frac(g * PHI3)
      const phase = frac(g * PHI) * cycle
      const ageN = frac((elapsed - phase) / life)
      const rise = 0.42 * ageN * (0.55 + 0.9 * frac(g * PHI4))
      const spread = 0.01 + 0.05 * ageN
      const az = frac(g * PHI5) * Math.PI * 2
      const x = Math.cos(az) * spread
      const y = MOUTH_Y + rise
      const z = Math.sin(az) * spread
      const fadeIn = clamp01(ageN / 0.08)
      const fadeOut = clamp01((1 - ageN) / 0.25)
      if (fadeIn * fadeOut < 0.05) {
        hideInstance(mesh, i)
        continue
      }
      const radius = 0.008 + 0.01 * ageN
      scratch.makeScale(radius, radius, radius)
      scratch.setPosition(x, y, z)
      mesh.setMatrixAt(i, scratch)
    }
    mesh.instanceMatrix.needsUpdate = true
  }

  const syncFx = (): void => {
    smokeHandle?.setTime(elapsed)
    smokeHandle?.setWindXZ(config.windXZ)
    smokeHandle?.setOpacity(config.lit ? 1 : 0)
    if (sparkMesh) sampleSparks(sparkMesh)
  }

  const rebuild = (): void => {
    releaseGenerated()

    emit('body', revolve(
      [
        [0.00, 0.034],
        [0.04, 0.036],
        [0.12, 0.035],
        [0.88, 0.035],
        [0.94, 0.032],
        [1.00, 0.022],
      ],
      { yBot: 0, yTop: BODY_H, scaleW: 1, segments: 28 },
    ), body, 'cylinder')

    const lid = bevelDisc(0.034, 0.008, 0.0015, 20)
    lid.translate(0, BODY_H + 0.004, 0)
    emit('hardware', lid, body, 'lid')
    const mouth = bevelRing(0.01, 0.018, 0.01, 0.001, 16)
    mouth.translate(0, MOUTH_Y, 0)
    emit('hardware', mouth, body, 'mouth')

    const hardware: BufferGeometry[] = []
    hardware.push(tubeSection(0.007, 0.028, [0.018, BODY_H + 0.02, 0], [0, 1, 0], 10))
    const lever = bevelBox(0.042, 0.006, 0.012, 0.0015)
    lever.rotateZ(-0.45)
    lever.translate(0.028, BODY_H + 0.032, 0)
    hardware.push(lever)
    const ring = bevelRing(0.007, 0.011, 0.003, 0.0006, 14)
    ring.rotateZ(Math.PI / 2)
    ring.translate(0.048, BODY_H + 0.04, 0)
    hardware.push(ring)
    emit('hardware', mergeParts(hardware, 'striker'), body, 'striker')

    const smoke = buildSmokePool(config.windXZ)
    smokePoints = smoke.points
    smokeHandle = smoke.handle
    generated.push(smoke.geo)
    materialSlots.smoke = smoke.handle.material
    meshesBySlot.smoke.push(smoke.points as unknown as Mesh)
    fx.add(smoke.points)

    const sparkGeo = new SphereGeometry(1, 8, 6)
    sparkMesh = new InstancedMesh(sparkGeo, materialSlots.spark, SPARK_N)
    sparkMesh.name = 'oranje-fountains'
    emitInstances('spark', sparkMesh, fx)
    syncFx()
  }
  rebuild()

  return {
    root,
    parts: { body, fx },
    materials: materialSlots,
    getConfig: () => ({ lit: config.lit, windXZ: [...config.windXZ] as [number, number] }),
    configure(patch) {
      if (patch.lit !== undefined) config.lit = patch.lit
      if (patch.windXZ !== undefined) config.windXZ = normalizeWind(patch.windXZ)
      syncFx()
    },
    setMaterial(slot, material) {
      materialSlots[slot] = material
      for (const mesh of meshesBySlot[slot]) mesh.material = material
    },
    update(deltaSeconds) {
      elapsed += deltaSeconds
      syncFx()
    },
    dispose() {
      releaseGenerated()
      for (const material of extras) material.dispose()
      disposeF1Materials(bundle)
      root.removeFromParent()
    },
  }
}

/** Steady-state still at t≈2.5 s — full column anchored at the mouth. */
export function createPreview({ aspect, time }: { aspect: number; time?: number }) {
  const model = createModel({ lit: true })
  model.update(time ?? 2.5)
  return createF1Preview(model, {
    aspect,
    target: [0.05, 0.55, 0.08],
    distance: 1.45,
    fov: 32,
    pitch: 0.18,
    ground: true,
    bloom: true,
  })
}
