// f1-pit-gantry — the overhead structure spanning a pit lane: two braced truss columns carrying a
// box-truss beam, with a tensioned banner slung beneath it, a lighting bar, and a cable tray.
//
// Real pit gantries are bolted aluminium box truss, and that is the whole silhouette: four chords per
// member with zig-zag lacing between them, so the structure reads as open framework against the sky
// rather than as a solid beam. A post-and-beam of plain boxes has no such read at any distance, which is
// what this prop was before. Everything here is merged per material slot, so the truss costs one draw.
//
// The banner colour is genericised (no team livery — plain corporate blue by default).

import {
  BufferGeometry,
  CylinderGeometry,
  DirectionalLight,
  ExtrudeGeometry,
  Group,
  HemisphereLight,
  MathUtils,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  Quaternion,
  Scene,
  Shape,
  Vector3,
  type Material,
} from 'three/webgpu'
import { mergeGeometries, toCreasedNormals } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

import { ResourceBag } from '../f1-kit-core/resourceBag.ts'

type Slot = 'post' | 'banner' | 'fitting'

export interface F1PitGantryConfig {
  /** Distance between the two columns along local +X, metres. */
  span: number
  /** Column height / beam elevation, metres. */
  height: number
  /** Truss bays across the span. Doubles as the LOD knob. */
  bays: number
}

export interface F1PitGantryOptions extends Partial<F1PitGantryConfig> {
  materials?: Partial<Record<Slot, Material>>
}

export interface F1PitGantryInstance {
  readonly root: Group
  readonly parts: { posts: Group; beam: Group; banner: Group }
  readonly materials: Readonly<Record<Slot, Material>>
  getConfig(): Readonly<F1PitGantryConfig>
  configure(patch: Partial<F1PitGantryConfig>): void
  setMaterial(slot: Slot, material: Material): void
  update(deltaSeconds: number): void
  dispose(): void
}

const defaults: F1PitGantryConfig = { span: 8.0, height: 4.6, bays: 10 }

const CHORD = 0.032 // truss chord tube radius, world units
const LACE = 0.020  // lacing tube radius

// ---------------------------------------------------------------------------------------------------
// Local geometry helpers, deliberately private to this file rather than shared through f1-kit-core:
// every `.ts` under f1-kit-core ships to kit consumers as permanent public surface.
// ---------------------------------------------------------------------------------------------------

/** Strip a geometry to the exact shape `mergeGeometries` needs: non-indexed, position/normal/uv only. */
function mergeReady(geometry: BufferGeometry): BufferGeometry {
  const flat = geometry.index ? geometry.toNonIndexed() : geometry
  if (flat !== geometry) geometry.dispose()
  if (!flat.getAttribute('normal')) flat.computeVertexNormals()
  if (!flat.getAttribute('uv')) {
    const count = flat.getAttribute('position').count
    flat.setAttribute('uv', new Float32Array(count * 2) as unknown as never)
  }
  for (const name of Object.keys(flat.attributes)) {
    if (name !== 'position' && name !== 'normal' && name !== 'uv') flat.deleteAttribute(name)
  }
  flat.clearGroups()
  return flat
}

/** Merge parts into one geometry (rule 9). Disposes every input; throws rather than returning null. */
function mergeParts(parts: BufferGeometry[], label: string): BufferGeometry {
  const ready = parts.map(mergeReady)
  if (ready.length === 1) return ready[0]!
  const merged = mergeGeometries(ready, false)
  for (const part of ready) part.dispose()
  if (!merged) throw new Error(`f1-pit-gantry: failed to merge "${label}" (${ready.length} parts)`)
  return merged
}

/** A chamfered block: `width` x `height` x `depth`, centred on the origin, depth along +Z (rules 1, 6, 7). */
function bevelBox(width: number, height: number, depth: number, bevel: number): BufferGeometry {
  const b = Math.max(0, Math.min(bevel, Math.min(width, height, depth) * 0.3))
  const shape = new Shape()
  const hw = Math.max(1e-4, width / 2 - b)
  const hh = Math.max(1e-4, height / 2 - b)
  shape.moveTo(-hw, -hh)
  shape.lineTo(hw, -hh)
  shape.lineTo(hw, hh)
  shape.lineTo(-hw, hh)
  shape.closePath()
  const geo = new ExtrudeGeometry(shape, {
    depth: Math.max(1e-4, depth - 2 * b),
    bevelEnabled: b > 0,
    bevelThickness: b,
    bevelSize: b,
    bevelOffset: 0,
    bevelSegments: 1,
    steps: 1,
    curveSegments: 1,
  })
  geo.translate(0, 0, -(depth / 2 - b))
  // ExtrudeGeometry output is non-indexed, so toCreasedNormals returns the same object and nothing leaks.
  const creased = toCreasedNormals(geo, MathUtils.degToRad(50))
  if (creased !== geo) geo.dispose()
  return creased
}

/** A tube between two points — the truss member primitive. */
function strut(from: Vector3, to: Vector3, radius: number, radial = 8): BufferGeometry {
  const delta = new Vector3().subVectors(to, from)
  const length = delta.length()
  const geo = new CylinderGeometry(radius, radius, Math.max(1e-4, length), radial, 1)
  // CylinderGeometry runs along +Y; swing it onto the member's direction. BufferGeometry has no
  // rotateOnAxis, so the swing goes through a quaternion matrix.
  const quaternion = new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), delta.clone().normalize())
  geo.applyMatrix4(new Matrix4().makeRotationFromQuaternion(quaternion))
  geo.translate((from.x + to.x) / 2, (from.y + to.y) / 2, (from.z + to.z) / 2)
  return geo
}

/**
 * A square box-truss run between two points: four corner chords with zig-zag lacing on all four faces.
 * This is the member that gives a gantry its open, engineered read — a solid beam of the same envelope
 * reads as a kerbstone in the sky.
 */
function boxTruss(from: Vector3, to: Vector3, size: number, bays: number): BufferGeometry[] {
  const axis = new Vector3().subVectors(to, from)
  const length = axis.length()
  const dir = axis.clone().normalize()
  // Two perpendiculars spanning the truss's cross-section.
  const up = Math.abs(dir.y) > 0.9 ? new Vector3(0, 0, 1) : new Vector3(0, 1, 0)
  const u = new Vector3().crossVectors(dir, up).normalize().multiplyScalar(size / 2)
  const v = new Vector3().crossVectors(dir, u).normalize().multiplyScalar(size / 2)

  const corners = [
    new Vector3().addVectors(u, v), new Vector3().subVectors(u, v),
    new Vector3().subVectors(v, u), new Vector3().addVectors(u, v).negate(),
  ]

  const parts: BufferGeometry[] = []
  for (const corner of corners) {
    parts.push(strut(
      new Vector3().addVectors(from, corner),
      new Vector3().addVectors(to, corner),
      CHORD,
    ))
  }

  // Lacing: alternate the diagonal direction bay to bay on each face, as real laced truss does.
  const step = length / bays
  for (let bay = 0; bay < bays; bay++) {
    const a = from.clone().addScaledVector(dir, bay * step)
    const b = from.clone().addScaledVector(dir, (bay + 1) * step)
    for (let face = 0; face < 4; face++) {
      const c0 = corners[face]!
      const c1 = corners[(face + 1) % 4]!
      const forward = (bay + face) % 2 === 0
      parts.push(strut(
        new Vector3().addVectors(forward ? a : b, c0),
        new Vector3().addVectors(forward ? b : a, c1),
        LACE,
        6,
      ))
    }
  }
  return parts
}

export function createModel(options: F1PitGantryOptions = {}): F1PitGantryInstance {
  const config: F1PitGantryConfig = {
    span: Math.max(2, options.span ?? defaults.span),
    height: Math.max(1.5, options.height ?? defaults.height),
    bays: Math.max(3, Math.round(options.bays ?? defaults.bays)),
  }

  // Materials the model creates itself go in the bag and live for the model's lifetime. Materials handed
  // in through `options` belong to the caller, never enter the bag, and are never disposed here (rule 16).
  const bag = new ResourceBag()
  const materialSlots: Record<Slot, Material> = {
    post: options.materials?.post ??
      bag.mat(new MeshStandardMaterial({ color: 0x2a2e33, metalness: 0.6, roughness: 0.5 })),
    banner: options.materials?.banner ??
      bag.mat(new MeshStandardMaterial({ color: 0x1a4d7a, metalness: 0.0, roughness: 0.65 })),
    fitting: options.materials?.fitting ??
      bag.mat(new MeshStandardMaterial({ color: 0x9aa1a9, metalness: 0.75, roughness: 0.35 })),
  }

  // Runtime anchors: created once, never replaced (rules 10, 14).
  const root = new Group()
  root.name = 'f1-pit-gantry'
  const posts = new Group(); posts.name = 'posts'
  const beam = new Group(); beam.name = 'beam'
  const banner = new Group(); banner.name = 'banner'
  root.add(posts, beam, banner)

  // Per-rebuild geometry ownership. Geometry is regenerated by configure(), so it is tracked separately
  // from the bag and released at the top of every rebuild — putting it in the bag would both grow the bag
  // without bound and double-dispose everything it already released.
  const generated: BufferGeometry[] = []
  const meshesBySlot: Record<Slot, Mesh[]> = { post: [], banner: [], fitting: [] }

  const releaseGenerated = (): void => {
    for (const group of [posts, beam, banner]) group.clear()
    for (const geometry of generated) geometry.dispose()
    generated.length = 0
    for (const slot of Object.keys(meshesBySlot) as Slot[]) meshesBySlot[slot].length = 0
  }

  /** One merged geometry per material slot, so there is exactly one mesh per slot and one draw call. */
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
    const { span, height, bays } = config
    const half = span / 2
    const columnSize = 0.30
    const beamSize = 0.42
    const beamY = height - beamSize / 2

    // --- Columns: braced truss legs on bolted base plates -------------------------------------------
    const postParts: BufferGeometry[] = []
    const fittingParts: BufferGeometry[] = []
    for (const sx of [-1, 1] as const) {
      postParts.push(...boxTruss(
        new Vector3(sx * half, 0.06, 0),
        new Vector3(sx * half, beamY - beamSize / 2, 0),
        columnSize,
        Math.max(3, Math.round(height / 0.7)),
      ))

      // Base plate and its bolt ring — the detail that stops a column floating on the floor.
      // bevelBox is already thin in Y here (0.52 x 0.05 x 0.52), so it lies flat as authored.
      const plate = bevelBox(0.52, 0.05, 0.52, 0.008)
      plate.translate(sx * half, 0.025, 0)
      postParts.push(plate)
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + Math.PI / 4
        const bolt = new CylinderGeometry(0.022, 0.022, 0.030, 6)
        bolt.translate(sx * half + Math.cos(a) * 0.19, 0.062, Math.sin(a) * 0.19)
        fittingParts.push(bolt)
      }

      // Knee brace from the column into the beam, so the corner is not a bare butt joint.
      postParts.push(strut(
        new Vector3(sx * half, beamY - 1.05, 0),
        new Vector3(sx * (half - 0.95), beamY - beamSize / 2, 0),
        CHORD,
      ))
    }

    // --- Beam: the span's box truss -----------------------------------------------------------------
    postParts.push(...boxTruss(
      new Vector3(-half, beamY, 0),
      new Vector3(half, beamY, 0),
      beamSize,
      bays,
    ))
    emit('post', mergeParts(postParts, 'structure'), beam, 'truss')

    // --- Banner: a tensioned panel in a frame, slung under the beam ---------------------------------
    const bannerParts: BufferGeometry[] = []
    const bannerW = span * 0.86
    const bannerH = 0.62
    const bannerY = beamY - beamSize / 2 - 0.10 - bannerH / 2
    bannerParts.push((() => {
      const panel = bevelBox(bannerW, bannerH, 0.030, 0.006)
      panel.translate(0, bannerY, 0)
      return panel
    })())
    emit('banner', mergeParts(bannerParts, 'banner'), banner, 'panel')

    // Frame rails top and bottom, plus the drop links that hang the banner off the beam.
    for (const sy of [-1, 1] as const) {
      const rail = bevelBox(bannerW + 0.05, 0.045, 0.050, 0.008)
      rail.translate(0, bannerY + sy * (bannerH / 2), 0)
      fittingParts.push(rail)
    }
    for (let i = 0; i < 4; i++) {
      const x = (i / 3 - 0.5) * bannerW * 0.9
      fittingParts.push(strut(
        new Vector3(x, beamY - beamSize / 2, 0),
        new Vector3(x, bannerY + bannerH / 2, 0),
        0.010,
        6,
      ))
    }

    // --- Lighting bar and cable tray under the beam --------------------------------------------------
    for (let i = 0; i < 5; i++) {
      const x = (i / 4 - 0.5) * span * 0.72
      const body = new CylinderGeometry(0.085, 0.10, 0.16, 12)
      body.rotateX(Math.PI / 2)
      body.translate(x, beamY - beamSize / 2 - 0.11, 0.16)
      fittingParts.push(body)
      const yoke = bevelBox(0.024, 0.16, 0.20, 0.004)
      yoke.translate(x, beamY - beamSize / 2 - 0.06, 0.16)
      fittingParts.push(yoke)
    }
    const tray = bevelBox(span * 0.94, 0.06, 0.16, 0.008)
    tray.translate(0, beamY + beamSize / 2 + 0.05, -0.12)
    fittingParts.push(tray)

    emit('fitting', mergeParts(fittingParts, 'fittings'), posts, 'fittings')
  }
  rebuild()

  return {
    root,
    parts: { posts, beam, banner },
    materials: materialSlots,
    getConfig: () => ({ ...config }),
    configure(patch) {
      if (patch.span !== undefined) config.span = Math.max(2, patch.span)
      if (patch.height !== undefined) config.height = Math.max(1.5, patch.height)
      if (patch.bays !== undefined) config.bays = Math.max(3, Math.round(patch.bays))
      rebuild()
    },
    setMaterial(slot, material) {
      // One mesh per slot, so this is a direct reassignment with no rebuild.
      materialSlots[slot] = material
      for (const mesh of meshesBySlot[slot]) mesh.material = material
    },
    update: () => {},
    dispose() {
      releaseGenerated()
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
  key.position.set(-4, 8, 6)
  scene.add(key)
  const camera = new PerspectiveCamera(42, aspect, 0.1, 60)
  camera.position.set(9, 5, 9)
  camera.lookAt(0, 2.6, 0)
  scene.add(camera)
  return { scene, root: model.root, camera, update: model.update, dispose: model.dispose }
}
