// f1-oranje-can — handheld Dutch-GP orange smoke flare (the "oranje army" support can).
//
// Geometry is a lathed can + striker. Smoke clouds and spark jets are closed-form CPU pools
// imported from devlo-racing `OranjeSmoke` / `OranjeSparkFountains` (Weyl phases, mod-wrapped life,
// scattering vs emissive families). No TSL, no PRNG. Steady-state at elapsed=0 for stills.
//
// Smoke uses instanced unlit spheres (NormalBlending + instanceColor) so the effect reads on the
// kit's WebGPU / Dawn capture path — legacy ShaderMaterial point sprites are not compatible.
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
  NormalBlending,
  SphereGeometry,
  type Material,
} from 'three/webgpu'

import {
  TOKEN,
  acquireF1Materials,
  bevelBox,
  bevelDisc,
  bevelRing,
  createF1Preview,
  disposeF1Materials,
  mergeParts,
  revolve,
  tubeSection,
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

const PLUME_N = 48
const HAZE_N = 6
const SPARK_N = 28

const SMOKE_BASE = new Color(0xff6c12)
const SMOKE_TOP = new Color(0xee8a38)
const HAZE_BASE = new Color(0xdf8a4e)
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

function scatteringSmokeMaterial(name: string, peakOpacity: number): MeshBasicMaterial {
  return new MeshBasicMaterial({
    name,
    color: 0xffffff,
    vertexColors: true,
    transparent: true,
    opacity: peakOpacity,
    depthWrite: false,
    toneMapped: true,
    blending: NormalBlending,
  })
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

  const smokeMat = options.materials?.smoke ?? own(scatteringSmokeMaterial('f1-kit / oranje-smoke', 0.52))
  const hazeMat = own(scatteringSmokeMaterial('f1-kit / oranje-haze', 0.2))
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
    smoke: smokeMat,
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
  const tint = new Color()
  let elapsed = 0
  let plumeMesh: InstancedMesh | null = null
  let hazeMesh: InstancedMesh | null = null
  let sparkMesh: InstancedMesh | null = null

  const releaseGenerated = (): void => {
    for (const group of [body, fx]) group.clear()
    for (const geometry of generated) geometry.dispose()
    generated.length = 0
    for (const slot of Object.keys(meshesBySlot) as Slot[]) meshesBySlot[slot].length = 0
    plumeMesh = null
    hazeMesh = null
    sparkMesh = null
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
    slot: Slot | null,
    mesh: InstancedMesh,
    group: Group,
  ): void => {
    if (!generated.includes(mesh.geometry)) generated.push(mesh.geometry)
    mesh.castShadow = false
    mesh.receiveShadow = false
    mesh.frustumCulled = false
    if (slot) meshesBySlot[slot].push(mesh)
    group.add(mesh)
  }

  const hideInstance = (mesh: InstancedMesh, index: number): void => {
    scratch.makeScale(0, 0, 0)
    mesh.setMatrixAt(index, scratch)
  }

  const placePuff = (
    mesh: InstancedMesh,
    index: number,
    x: number,
    y: number,
    z: number,
    radius: number,
    alpha: number,
    base: Color,
    top: Color,
    tone: number,
  ): void => {
    if (alpha < 0.04) {
      hideInstance(mesh, index)
      return
    }
    const scale = radius * Math.sqrt(alpha)
    scratch.makeScale(scale, scale, scale)
    scratch.setPosition(x, y, z)
    mesh.setMatrixAt(index, scratch)
    tint.copy(base).lerp(top, tone)
    mesh.setColorAt(index, tint)
  }

  const samplePlume = (mesh: InstancedMesh): void => {
    const wind = config.windXZ
    for (let i = 0; i < PLUME_N; i++) {
      if (!config.lit) {
        hideInstance(mesh, i)
        continue
      }
      const g = IDX_ORANJE + i
      const cycle = 8
      const life = 4 + 2 * frac(g * PHI3)
      const phase = frac(g * PHI) * cycle
      const ageN = frac((elapsed - phase) / life)
      const age = ageN * life
      const riseTau = 1.8
      const riseFrac = 1 - Math.exp(-age / riseTau)
      const rise = 1.35 * riseFrac
      const driftT = Math.max(0, age - 0.25)
      const drift = 0.35 * Math.min(driftT, 2.5)
      const wanderVar = 0.5 + frac(g * PHI4)
      const wander = (0.02 + 0.12 * riseFrac) * wanderVar
      const wPhase = frac(g * PHI5) * Math.PI * 2
      const angle = frac(i * PHI4) * Math.PI * 2
      const spread = frac(i * PHI7) * 0.015
      const x = Math.cos(angle) * spread + wind[0] * drift + Math.cos(wPhase + age * 0.9) * wander
      const y = MOUTH_Y + rise
      const z = Math.sin(angle) * spread + wind[1] * drift + Math.sin(wPhase + age * 0.9) * wander
      const t = Math.pow(ageN, 1.25)
      const radius = 0.03 + (0.22 - 0.03) * t
      const fadeIn = clamp01(ageN / 0.1)
      const fadeOut = clamp01((1 - ageN) / 0.4)
      const alpha = fadeIn * fadeOut
      placePuff(mesh, i, x, y, z, radius, alpha, SMOKE_BASE, SMOKE_TOP, Math.pow(riseFrac, 3.4))
    }
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  }

  const sampleHaze = (mesh: InstancedMesh): void => {
    const wind = config.windXZ
    for (let i = 0; i < HAZE_N; i++) {
      if (!config.lit) {
        hideInstance(mesh, i)
        continue
      }
      const g = IDX_ORANJE + 50_000 + i
      const cycle = 8
      const life = 6.5 + 1.2 * frac(g * PHI3)
      const phase = frac(g * PHI) * cycle
      const ageN = frac((elapsed - phase) / life)
      const age = ageN * life
      const rise = 0.9 + 0.4 * ageN
      const drift = 0.22 * Math.min(age, 4)
      const wPhase = frac(g * PHI5) * Math.PI * 2
      const x = wind[0] * drift + Math.cos(wPhase + age * 0.35) * 0.04
      const y = MOUTH_Y + rise
      const z = wind[1] * drift + Math.sin(wPhase + age * 0.35) * 0.04
      const radius = 0.16 + 0.22 * Math.pow(ageN, 0.8)
      const fadeIn = clamp01(ageN / 0.08)
      const fadeOut = clamp01((1 - ageN) / 0.25)
      placePuff(mesh, i, x, y, z, radius, fadeIn * fadeOut, HAZE_BASE, SMOKE_TOP, ageN)
    }
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
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

  const sampleFx = (): void => {
    if (plumeMesh) samplePlume(plumeMesh)
    if (hazeMesh) sampleHaze(hazeMesh)
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

    const puffGeo = new SphereGeometry(1, 10, 8)
    const sparkGeo = new SphereGeometry(1, 8, 6)
    plumeMesh = new InstancedMesh(puffGeo, materialSlots.smoke, PLUME_N)
    plumeMesh.name = 'oranje-smoke'
    emitInstances('smoke', plumeMesh, fx)
    hazeMesh = new InstancedMesh(puffGeo, hazeMat, HAZE_N)
    hazeMesh.name = 'oranje-haze'
    emitInstances(null, hazeMesh, fx)
    sparkMesh = new InstancedMesh(sparkGeo, materialSlots.spark, SPARK_N)
    sparkMesh.name = 'oranje-fountains'
    emitInstances('spark', sparkMesh, fx)
    sampleFx()
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
      sampleFx()
    },
    setMaterial(slot, material) {
      materialSlots[slot] = material
      for (const mesh of meshesBySlot[slot]) mesh.material = material
    },
    update(deltaSeconds) {
      elapsed += deltaSeconds
      sampleFx()
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
