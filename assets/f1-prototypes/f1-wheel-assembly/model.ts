// f1-wheel-assembly — a loose F1 tyre/wheel: a fat lathe tyre (rounded-rectangle annulus revolved about
// the axle) in rubber, a rim/cover barrel filling the bore, a procedural sidewall marking band, an aero
// cover disc + accent ring in the livery colour, rim spoke fins, and a centre locking nut. Dressed on
// BOTH faces (axle along local Z) — a carried tyre is seen from both sides, unlike a fitted car wheel.
// Ported from a private racing project's standalone pit-crew tyre prop; the sidewall marking and compound
// stripe are original geometry/canvas work, generic (no real tyre-brand wordmark).

import {
  BoxGeometry,
  BufferGeometry,
  CanvasTexture,
  CircleGeometry,
  CylinderGeometry,
  DirectionalLight,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  HemisphereLight,
  LatheGeometry,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PerspectiveCamera,
  RepeatWrapping,
  RingGeometry,
  Scene,
  Vector2,
  type Material,
} from 'three/webgpu'
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js'

export interface F1WheelAssemblyConfig {
  /** Overall tyre radius, metres. Real F1 tyres run ~0.33 m. */
  radius: number
  /** Tyre width, metres. Real F1 fronts run ~0.30 m, rears ~0.40 m. */
  width: number
  /** Sidewall marking-band colour (stands in for a compound/brand stripe). */
  band: number
}

export interface F1WheelAssemblyOptions extends Partial<F1WheelAssemblyConfig> {
  materials?: Partial<Record<'rubber' | 'metal' | 'cover' | 'accent', Material>>
}

export interface F1WheelAssemblyInstance {
  readonly root: Group
  readonly parts: { tire: Group; rim: Group; trim: Group }
  readonly materials: Readonly<Record<'rubber' | 'metal' | 'cover' | 'accent', Material>>
  getConfig(): Readonly<F1WheelAssemblyConfig>
  configure(patch: Partial<F1WheelAssemblyConfig>): void
  setMaterial(slot: 'rubber' | 'metal' | 'cover' | 'accent', material: Material): void
  update(deltaSeconds: number): void
  dispose(): void
}

const defaults: F1WheelAssemblyConfig = {
  radius: 0.33,
  width: 0.33,
  band: 0xffd400,
}

/** Build one tyre geometry (lathe annulus), rolling about local Z, centred at the origin. */
function buildTyreGeometry(radius: number, width: number): BufferGeometry {
  const Rout = radius
  const Rin = radius * 0.45 // rim seat — F1 wheels aren't hubless, the bore is filled by the rim
  const hw = width / 2
  const cr = (Rout - Rin) * 0.22 // rounded shoulder radius

  const prof: Vector2[] = [new Vector2(Rin, -hw), new Vector2(Rout - cr, -hw)]
  for (let i = 1; i <= 4; i++) {
    const a = -Math.PI / 2 + (Math.PI / 2) * (i / 4)
    prof.push(new Vector2(Rout - cr + Math.cos(a) * cr, -hw + cr + Math.sin(a) * cr))
  }
  for (let i = 0; i <= 4; i++) {
    const a = (Math.PI / 2) * (i / 4)
    prof.push(new Vector2(Rout - cr + Math.cos(a) * cr, hw - cr + Math.sin(a) * cr))
  }
  prof.push(new Vector2(Rin, hw), new Vector2(Rin, -hw))

  const geo = new LatheGeometry(prof, 40)
  geo.rotateX(Math.PI / 2) // axle Y -> Z, so the wheel rolls about local Z
  return geo
}

/** The rim/cover barrel filling the tyre bore. */
function buildRimGeometry(radius: number, width: number): BufferGeometry {
  const Rrim = radius * 0.45 * 1.01 // ~match the tyre's rim seat so no gap shows at the bore
  const geo = new CylinderGeometry(Rrim, Rrim, width * 0.96, 24, 1, false)
  geo.rotateX(Math.PI / 2)
  return geo
}

/** A flat annulus in the XY plane (sidewall plane, normal +Z), UV-mapped so a marking band tiles `repeat`x
 *  around the ring. */
function sidewallRing(rIn: number, rOut: number, repeat: number, seg = 160): BufferGeometry {
  const pos: number[] = []
  const uv: number[] = []
  const idx: number[] = []
  for (let i = 0; i <= seg; i++) {
    const a = (i / seg) * Math.PI * 2
    const ca = Math.cos(a)
    const sa = Math.sin(a)
    pos.push(rIn * ca, rIn * sa, 0, rOut * ca, rOut * sa, 0)
    const u = (i / seg) * repeat
    uv.push(u, 0, u, 1)
  }
  for (let i = 0; i < seg; i++) {
    const a = i * 2
    idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3)
  }
  const g = new BufferGeometry()
  g.setAttribute('position', new Float32BufferAttribute(pos, 3))
  g.setAttribute('uv', new Float32BufferAttribute(uv, 2))
  g.setIndex(idx)
  g.computeVertexNormals()
  return g
}

/** A ring of radial spoke fins in the XY plane (normal +Z), merged to one geometry (one draw call). */
function spokeFan(rMid: number, half: number, count: number): BufferGeometry {
  const fins: BufferGeometry[] = []
  for (let k = 0; k < count; k++) {
    const a = (k / count) * Math.PI * 2
    const fin = new BoxGeometry(half * 2, rMid * 0.14, 0.02)
    fin.rotateZ(a)
    fin.translate(Math.cos(a) * rMid, Math.sin(a) * rMid, 0)
    fins.push(fin)
  }
  const merged = BufferGeometryUtils.mergeGeometries(fins, false)!
  for (const f of fins) f.dispose()
  return merged
}

/** A procedural sidewall marking canvas: a solid colour band + a generic wordmark. Returns null outside a
 *  DOM environment (headless/SSR); callers fall back to a plain material. */
function drawMarkingCanvas(band: number): CanvasTexture | null {
  if (typeof document === 'undefined') return null
  const c = document.createElement('canvas')
  c.width = 256
  c.height = 64
  const ctx = c.getContext('2d')
  if (!ctx) return null
  ctx.clearRect(0, 0, c.width, c.height)
  ctx.fillStyle = '#' + (band & 0xffffff).toString(16).padStart(6, '0')
  ctx.fillRect(0, 3, c.width, 9)
  ctx.fillStyle = '#f4f4f4'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.save()
  ctx.translate(c.width, 0)
  ctx.scale(-1, 1) // mirrored source so it reads correctly on the outboard face
  ctx.font = 'bold 26px Arial, sans-serif'
  ctx.fillText('RACE TYRE', c.width / 2, 33)
  ctx.font = 'bold 12px Arial, sans-serif'
  ctx.fillText('SLICK', c.width / 2, 53)
  ctx.restore()
  const tex = new CanvasTexture(c)
  tex.wrapS = RepeatWrapping
  tex.anisotropy = 4
  return tex
}

export function createModel(options: F1WheelAssemblyOptions = {}): F1WheelAssemblyInstance {
  const config: F1WheelAssemblyConfig = {
    radius: Math.max(0.1, options.radius ?? defaults.radius),
    width: Math.max(0.05, options.width ?? defaults.width),
    band: options.band ?? defaults.band,
  }

  const rubber = (options.materials?.rubber ??
    new MeshStandardMaterial({ color: 0x0a0a0d, roughness: 0.95, metalness: 0.0 })) as Material
  const metal = (options.materials?.metal ??
    new MeshStandardMaterial({ color: 0xc8ccd2, roughness: 0.35, metalness: 0.8 })) as Material
  const cover = (options.materials?.cover ??
    new MeshStandardMaterial({ color: 0x0b0c0e, roughness: 0.4, metalness: 0.2 })) as Material
  const accent = (options.materials?.accent ??
    new MeshStandardMaterial({ color: 0xc6ff2a, roughness: 0.5, metalness: 0.1 })) as Material
  const materialSlots: Record<'rubber' | 'metal' | 'cover' | 'accent', Material> = { rubber, metal, cover, accent }

  const root = new Group()
  root.name = 'f1-wheel-assembly'
  const tire = new Group(); tire.name = 'tire'
  const rim = new Group(); rim.name = 'rim'
  const trim = new Group(); trim.name = 'trim'
  root.add(tire, rim, trim)

  let markingTexture: CanvasTexture | null = null
  let markingMaterial: Material | null = null
  const ownedGeometries: BufferGeometry[] = []

  const clearGenerated = (): void => {
    for (const group of [tire, rim, trim]) group.clear()
    for (const g of ownedGeometries) g.dispose()
    ownedGeometries.length = 0
    markingTexture?.dispose()
    markingMaterial = null
  }

  const track = <G extends BufferGeometry>(g: G): G => {
    ownedGeometries.push(g)
    return g
  }

  const rebuild = (): void => {
    clearGenerated()
    const { radius, width, band } = config

    markingTexture = drawMarkingCanvas(band)
    markingMaterial = markingTexture
      ? new MeshBasicMaterial({ map: markingTexture, transparent: true, alphaTest: 0.35, side: DoubleSide, toneMapped: false })
      : new MeshStandardMaterial({ color: band, roughness: 0.6, metalness: 0.0 })

    const tyreMesh = new Mesh(track(buildTyreGeometry(radius, width)), rubber)
    tyreMesh.castShadow = true
    tyreMesh.receiveShadow = true
    tire.add(tyreMesh)

    const rimMesh = new Mesh(track(buildRimGeometry(radius, width)), metal)
    rimMesh.castShadow = true
    rim.add(rimMesh)

    for (const zSign of [1, -1] as const) {
      const flip = (g: BufferGeometry): BufferGeometry => {
        if (zSign < 0) g.rotateX(Math.PI)
        return g
      }

      const markingMesh = new Mesh(track(sidewallRing(radius * 0.6, radius * 0.78, 5)), markingMaterial)
      if (zSign < 0) markingMesh.rotation.y = Math.PI
      markingMesh.position.z = (width / 2) * 1.01 * zSign
      trim.add(markingMesh)

      const discGeo = track(flip(new CircleGeometry(radius * 0.58, 32)))
      discGeo.translate(0, 0, (width / 2) * 0.985 * zSign)
      const coverDisc = new Mesh(discGeo, cover)
      trim.add(coverDisc)

      const ringGeo = track(flip(new RingGeometry(radius * 0.22, radius * 0.34, 24)))
      ringGeo.translate(0, 0, (width / 2) * 0.995 * zSign)
      trim.add(new Mesh(ringGeo, accent))

      const spokeGeo = track(flip(spokeFan(radius * 0.58, radius * 0.06, 12)))
      spokeGeo.translate(0, 0, (width / 2) * 0.92 * zSign)
      trim.add(new Mesh(spokeGeo, metal))

      const nutGeo = track(new CylinderGeometry(radius * 0.09, radius * 0.09, 0.04, 6))
      nutGeo.rotateX(Math.PI / 2)
      nutGeo.translate(0, 0, (width / 2) * 1.02 * zSign)
      trim.add(new Mesh(nutGeo, metal))
    }
  }
  rebuild()

  return {
    root,
    parts: { tire, rim, trim },
    materials: materialSlots,
    getConfig: () => ({ ...config }),
    configure(patch) {
      if (patch.radius !== undefined) config.radius = Math.max(0.1, patch.radius)
      if (patch.width !== undefined) config.width = Math.max(0.05, patch.width)
      if (patch.band !== undefined) config.band = patch.band
      rebuild()
    },
    setMaterial(slot, material) {
      materialSlots[slot] = material
      rebuild()
    },
    update: () => {},
    dispose() {
      clearGenerated()
      root.removeFromParent()
    },
  }
}

export function createPreview({ aspect }: { aspect: number; time?: number }) {
  const model = createModel()
  const scene = new Scene()
  scene.add(model.root, new HemisphereLight(0x8ea3b2, 0x0a0c10, 0.6))
  const key = new DirectionalLight(0xfff2e2, 1.2)
  key.position.set(-3, 4, 3)
  scene.add(key)
  const camera = new PerspectiveCamera(30, aspect, 0.02, 20)
  camera.position.set(0.9, 0.55, 0.9)
  camera.lookAt(0, 0.1, 0)
  scene.add(camera)
  return { scene, root: model.root, camera, update: model.update, dispose: model.dispose }
}
