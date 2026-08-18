// f1-oranje-can — handheld Dutch-GP orange smoke flare (the "oranje army" support can).
//
// Product datum: Enola Gaye WP40 wire-pull tube, 130 mm × 40 mm. Smoke is a
// dense overlapping field of wispy DataTexture cards, not spheres. Closed-form Weyl phases,
// NormalBlending, no TSL, no PRNG, Dawn-safe. Steady-state at elapsed=0 for stills.
//
// Wind default is Zandvoort's south-westerly (−0.692, +0.722). Smoke hexes are the flare palette,
// not TOKEN.ORANGE_500 (the paper wrap).

import {
  BufferGeometry,
  Color,
  DoubleSide,
  Group,
  InstancedMesh,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  NormalBlending,
  Object3D,
  PlaneGeometry,
  Vector3,
  type Material,
  type PerspectiveCamera,
} from 'three/webgpu'

import {
  TOKEN,
  acquireF1Materials,
  bevelDisc,
  bevelRing,
  createF1Preview,
  disposeF1Materials,
  mergeParts,
  oranjeSmokeTexture,
  revolve,
  tubeSection,
} from '../f1-kit-core/index.ts'

type Slot = 'body' | 'hardware' | 'smoke'

export interface F1OranjeCanConfig {
  /** When false, the can is cold — no plume. */
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
  lookAt(camera: PerspectiveCamera): void
  update(deltaSeconds: number): void
  dispose(): void
}

const PHI = 0.61803398875
const PHI3 = 0.7548776662
const PHI4 = 0.4142135624
const PHI5 = 0.5698402909275586
const PHI7 = 0.6457513110645907
const IDX_ORANJE = 400_000

const ZANDVOORT_WIND_XZ: readonly [number, number] = [-0.692, 0.722]

/** Enola Gaye WP40: 130 mm length × 40 mm diameter. */
const BODY_H = 0.13
const BODY_R = 0.02
const MOUTH_Y = 0.14

const PLUME_N = 180

const SMOKE_BASE = new Color(0xff6c12)
const SMOKE_TOP = new Color(0xee8a38)

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

export function createModel(options: F1OranjeCanOptions = {}): F1OranjeCanInstance {
  const config: F1OranjeCanConfig = {
    lit: options.lit ?? defaults.lit,
    windXZ: normalizeWind(options.windXZ ?? defaults.windXZ),
  }

  const bundle = acquireF1Materials()
  const kit = bundle.materials
  const extras: Array<{ dispose: () => void }> = []
  const own = (material: Material): Material => {
    extras.push(material)
    return material
  }

  const smokeMap = oranjeSmokeTexture(128)
  extras.push(smokeMap)

  const smokeMat = options.materials?.smoke ?? own(new MeshBasicMaterial({
    name: 'f1-kit / oranje-smoke',
    map: smokeMap,
    color: 0xffffff,
    vertexColors: true,
    transparent: true,
    opacity: 0.18,
    alphaTest: 0.025,
    depthWrite: false,
    toneMapped: true,
    blending: NormalBlending,
    side: DoubleSide,
  }))

  const materialSlots: Record<Slot, Material> = {
    body: options.materials?.body ?? own(kit.orange.clone() as MeshStandardMaterial),
    hardware: options.materials?.hardware ?? kit.graphite,
    smoke: smokeMat,
  }
  if (options.materials?.body === undefined) {
    const bodyMat = materialSlots.body as MeshStandardMaterial
    bodyMat.color.set(TOKEN.ORANGE_500)
    bodyMat.roughness = 0.92
    bodyMat.metalness = 0
  }

  const root = new Group()
  root.name = 'f1-oranje-can'
  const body = new Group(); body.name = 'body'
  const fx = new Group(); fx.name = 'fx'
  root.add(body, fx)

  const generated: BufferGeometry[] = []
  const meshesBySlot: Record<Slot, Mesh[]> = { body: [], hardware: [], smoke: [] }
  const dummy = new Object3D()
  const tint = new Color()
  const cameraPos = new Vector3(0.9, 0.55, 1.2)
  let elapsed = 0
  let plumeMesh: InstancedMesh | null = null

  const releaseGenerated = (): void => {
    for (const group of [body, fx]) group.clear()
    for (const geometry of generated) geometry.dispose()
    generated.length = 0
    for (const slot of Object.keys(meshesBySlot) as Slot[]) meshesBySlot[slot].length = 0
    plumeMesh = null
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
    mesh.castShadow = slot !== 'smoke'
    mesh.receiveShadow = slot !== 'smoke'
    meshesBySlot[slot].push(mesh)
    group.add(mesh)
  }

  const hideInstance = (mesh: InstancedMesh, index: number): void => {
    dummy.scale.set(0, 0, 0)
    dummy.position.set(0, 0, 0)
    dummy.rotation.set(0, 0, 0)
    dummy.updateMatrix()
    mesh.setMatrixAt(index, dummy.matrix)
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
      const life = 4.2 + 2.2 * frac(g * PHI3)
      const phase = frac(g * PHI) * cycle
      const ageN = frac((elapsed - phase) / life)
      const age = ageN * life
      const riseTau = 1.6
      const riseFrac = 1 - Math.exp(-age / riseTau)
      const rise = 0.68 * Math.pow(riseFrac, 2.4)
      const driftT = Math.max(0, age - 0.18)
      const drift = 0.16 * Math.min(driftT, 2.8)
      const wanderVar = 0.45 + frac(g * PHI4)
      const wander = (0.01 + 0.12 * riseFrac) * wanderVar
      const wPhase = frac(g * PHI5) * Math.PI * 2
      const angle = frac(i * PHI4) * Math.PI * 2
      const spread = frac(i * PHI7) * (0.006 + 0.05 * riseFrac)
      const x = Math.cos(angle) * spread + wind[0] * drift + Math.cos(wPhase + age * 0.7) * wander
      const y = MOUTH_Y + rise
      const z = Math.sin(angle) * spread + wind[1] * drift + Math.sin(wPhase + age * 0.7) * wander
      const t = Math.pow(ageN, 1.2)
      const stretch = 0.65 + 0.7 * frac(g * PHI4)
      const width = (0.04 + 0.21 * t) * stretch
      const height = (0.06 + 0.17 * t) / Math.max(0.55, stretch)
      const fadeIn = clamp01(ageN / 0.02)
      const fadeOut = 0.65 + 0.35 * clamp01((1 - ageN) / 0.32)
      const alpha = fadeIn * fadeOut
      if (alpha < 0.03) {
        hideInstance(mesh, i)
        continue
      }
      const scale = Math.sqrt(alpha)
      dummy.position.set(x, y - height * scale * 0.42, z)
      dummy.scale.set(width * scale, height * scale, 1)
      dummy.lookAt(cameraPos)
      dummy.rotateZ(frac(g * PHI7) * Math.PI * 2)
      dummy.updateMatrix()
      mesh.setMatrixAt(i, dummy.matrix)
      tint.copy(SMOKE_BASE).lerp(SMOKE_TOP, Math.pow(riseFrac, 3.4))
      tint.offsetHSL(0, 0, 0.08)
      mesh.setColorAt(i, tint)
    }
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  }

  const sampleFx = (): void => {
    if (plumeMesh) samplePlume(plumeMesh)
  }

  const rebuild = (): void => {
    releaseGenerated()

    emit('body', revolve(
      [
        [0.00, BODY_R * 0.92],
        [0.04, BODY_R],
        [0.12, BODY_R * 1.02],
        [0.88, BODY_R * 1.01],
        [0.94, BODY_R * 0.94],
        [1.00, BODY_R * 0.72],
      ],
      { yBot: 0, yTop: BODY_H, scaleW: 1, segments: 24 },
    ), body, 'cylinder')

    const base = bevelDisc(BODY_R * 0.92, 0.004, 0.0007, 18)
    base.rotateX(Math.PI / 2)
    base.translate(0, 0.0015, 0)
    emit('body', base, body, 'base')

    const lid = bevelDisc(BODY_R * 0.96, 0.005, 0.0008, 18)
    lid.translate(0, BODY_H + 0.002, 0)
    emit('hardware', lid, body, 'lid')
    const mouth = bevelRing(0.003, 0.007, 0.006, 0.0006, 12)
    mouth.translate(0, MOUTH_Y, 0)
    emit('hardware', mouth, body, 'mouth')

    const hardware: BufferGeometry[] = []
    hardware.push(tubeSection(0.0012, 0.022, [0.009, BODY_H + 0.012, 0], [0, 1, 0], 8))
    const ring = bevelRing(0.01, 0.013, 0.0018, 0.0004, 18)
    ring.rotateZ(Math.PI / 2)
    ring.translate(0.027, BODY_H + 0.024, 0)
    hardware.push(ring)
    emit('hardware', mergeParts(hardware, 'wire-pull'), body, 'wire-pull')

    const cardGeo = new PlaneGeometry(1, 1)
    plumeMesh = new InstancedMesh(cardGeo, materialSlots.smoke, PLUME_N)
    plumeMesh.name = 'oranje-smoke'
    plumeMesh.castShadow = false
    plumeMesh.receiveShadow = false
    plumeMesh.frustumCulled = false
    generated.push(cardGeo)
    meshesBySlot.smoke.push(plumeMesh)
    fx.add(plumeMesh)
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
    lookAt(camera) {
      cameraPos.copy(camera.position)
      sampleFx()
    },
    update(deltaSeconds) {
      elapsed += deltaSeconds
      sampleFx()
    },
    dispose() {
      releaseGenerated()
      for (const extra of extras) extra.dispose()
      disposeF1Materials(bundle)
      root.removeFromParent()
    },
  }
}

/** Steady-state still — can base on the ground, plume filling the rest of the tile. */
export function createPreview({ aspect, time }: { aspect: number; time?: number }) {
  const model = createModel({ lit: true })
  const preview = createF1Preview(model, {
    aspect,
    target: [0.03, 0.5, 0.04],
    distance: 1.7,
    fov: 34,
    yaw: -0.55,
    pitch: 0.18,
    ground: false,
    bloom: true,
  })
  model.lookAt(preview.camera)
  model.update(time ?? 2.5)
  return preview
}
