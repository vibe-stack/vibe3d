// f1-lollipop-board — the "brakes / gear" paddle a mechanic holds over the car during a pit stop: a
// dished paddle on a telescoping pole, with a legible instruction band across the face.
//
// The prop's whole job is to read as a two-sided instruction sign, so the face carries a real recessed
// panel with a raised instruction bar across it rather than a flat colour. A bare disc is a lollipop in
// name only — it has no front/back distinction and nothing to read.
//
// Sized to a real board: a 0.46 m paddle at 2.05 m, not the 0.68 m disc this prop used to carry.

import {
  BufferGeometry,
  CylinderGeometry,
  DirectionalLight,
  ExtrudeGeometry,
  Group,
  HemisphereLight,
  MathUtils,
  Mesh,
  MeshStandardMaterial,
  Path,
  PerspectiveCamera,
  Scene,
  Shape,
  type Material,
} from 'three/webgpu'
import { mergeGeometries, toCreasedNormals } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

import { ResourceBag } from '../f1-kit-core/resourceBag.ts'

type Slot = 'pole' | 'paddle' | 'legend'

export interface F1LollipopBoardConfig {
  /** Paddle radius, metres. Real boards run ~0.23 m. */
  radius: number
  /** Height of the paddle's centre above the floor, metres. */
  height: number
}

export interface F1LollipopBoardOptions extends Partial<F1LollipopBoardConfig> {
  materials?: Partial<Record<Slot, Material>>
}

export interface F1LollipopBoardInstance {
  readonly root: Group
  readonly parts: { pole: Group; paddle: Group }
  readonly materials: Readonly<Record<Slot, Material>>
  getConfig(): Readonly<F1LollipopBoardConfig>
  configure(patch: Partial<F1LollipopBoardConfig>): void
  setMaterial(slot: Slot, material: Material): void
  update(deltaSeconds: number): void
  dispose(): void
}

const defaults: F1LollipopBoardConfig = { radius: 0.23, height: 2.05 }

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
  if (!merged) throw new Error(`f1-lollipop-board: failed to merge "${label}" (${ready.length} parts)`)
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

/** A chamfered annulus: the paddle's rim, thick at the edge and open in the middle for the face panel. */
function ring(rIn: number, rOut: number, depth: number, bevel: number): BufferGeometry {
  const shape = new Shape()
  shape.absarc(0, 0, rOut - bevel, 0, Math.PI * 2, false)
  const hole = new Path()
  hole.absarc(0, 0, rIn + bevel, 0, Math.PI * 2, true)
  shape.holes.push(hole)
  const geo = new ExtrudeGeometry(shape, {
    depth: Math.max(1e-4, depth - 2 * bevel),
    bevelEnabled: bevel > 0,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelOffset: 0,
    bevelSegments: 1,
    steps: 1,
    curveSegments: 44,
  })
  geo.translate(0, 0, -(depth / 2 - bevel))
  const creased = toCreasedNormals(geo, MathUtils.degToRad(45))
  if (creased !== geo) geo.dispose()
  return creased
}

/** A plain chamfered disc. */
function disc(radius: number, depth: number, bevel: number): BufferGeometry {
  const shape = new Shape()
  shape.absarc(0, 0, radius - bevel, 0, Math.PI * 2, false)
  const geo = new ExtrudeGeometry(shape, {
    depth: Math.max(1e-4, depth - 2 * bevel),
    bevelEnabled: bevel > 0,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelOffset: 0,
    bevelSegments: 1,
    steps: 1,
    curveSegments: 44,
  })
  geo.translate(0, 0, -(depth / 2 - bevel))
  const creased = toCreasedNormals(geo, MathUtils.degToRad(45))
  if (creased !== geo) geo.dispose()
  return creased
}

export function createModel(options: F1LollipopBoardOptions = {}): F1LollipopBoardInstance {
  const config: F1LollipopBoardConfig = {
    radius: Math.max(0.1, options.radius ?? defaults.radius),
    height: Math.max(0.8, options.height ?? defaults.height),
  }

  // Materials the model creates itself go in the bag and live for the model's lifetime. Materials handed
  // in through `options` belong to the caller, never enter the bag, and are never disposed here (rule 16).
  const bag = new ResourceBag()
  const materialSlots: Record<Slot, Material> = {
    pole: options.materials?.pole ??
      bag.mat(new MeshStandardMaterial({ color: 0xc8ccd2, metalness: 0.55, roughness: 0.4 })),
    paddle: options.materials?.paddle ??
      bag.mat(new MeshStandardMaterial({ color: 0xf2c018, metalness: 0.0, roughness: 0.62 })),
    legend: options.materials?.legend ??
      bag.mat(new MeshStandardMaterial({ color: 0x14161a, metalness: 0.0, roughness: 0.7 })),
  }

  // Runtime anchors: created once, never replaced (rules 10, 14).
  const root = new Group()
  root.name = 'f1-lollipop-board'
  const pole = new Group(); pole.name = 'pole'
  const paddle = new Group(); paddle.name = 'paddle'
  root.add(pole, paddle)

  // Per-rebuild geometry ownership, kept out of the bag so a reconfigure neither grows it nor
  // double-disposes the live set.
  const generated: BufferGeometry[] = []
  const meshesBySlot: Record<Slot, Mesh[]> = { pole: [], paddle: [], legend: [] }

  const releaseGenerated = (): void => {
    for (const group of [pole, paddle]) group.clear()
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
    const { radius: R, height } = config
    const faceZ = 0.0

    // --- Paddle: a dished face inside a thicker rim, so the sign has an edge and a tray -------------
    const paddleParts: BufferGeometry[] = [
      ring(R * 0.86, R, 0.042, 0.006),      // rim
      (() => {
        const face = disc(R * 0.90, 0.020, 0.004)
        face.translate(0, 0, -0.008)         // recessed behind the rim, both sides
        return face
      })(),
    ]

    // Boss where the pole enters the paddle, so the two are joined rather than intersecting.
    const boss = new CylinderGeometry(0.048, 0.055, 0.075, 16)
    boss.translate(0, -R * 0.92, faceZ)
    paddleParts.push(boss)

    const paddleGeo = mergeParts(paddleParts, 'paddle')
    paddleGeo.translate(0, height, 0)
    emit('paddle', paddleGeo, paddle, 'face')

    // --- Legend: a raised instruction bar across each face, plus a lower strip ----------------------
    const legendParts: BufferGeometry[] = []
    for (const sz of [-1, 1] as const) {
      const bar = bevelBox(R * 1.34, R * 0.34, 0.012, 0.003)
      bar.translate(0, height + R * 0.16, sz * 0.016)
      legendParts.push(bar)
      const strip = bevelBox(R * 1.06, R * 0.20, 0.010, 0.003)
      strip.translate(0, height - R * 0.32, sz * 0.016)
      legendParts.push(strip)
    }
    emit('legend', mergeParts(legendParts, 'legend'), paddle, 'legend')

    // --- Pole: a telescoping shaft with a collar and a capped grip ----------------------------------
    const poleParts: BufferGeometry[] = []
    const upperLen = height - R * 0.92 - 0.60
    const upper = new CylinderGeometry(0.020, 0.020, upperLen, 12)
    upper.translate(0, height - R * 0.92 - upperLen / 2, faceZ)
    poleParts.push(upper)

    const collar = new CylinderGeometry(0.030, 0.030, 0.055, 14)
    collar.translate(0, height - R * 0.92 - upperLen, faceZ)
    poleParts.push(collar)

    const lower = new CylinderGeometry(0.027, 0.027, 0.62, 12)
    lower.translate(0, height - R * 0.92 - upperLen - 0.31, faceZ)
    poleParts.push(lower)

    const grip = new CylinderGeometry(0.033, 0.033, 0.22, 12)
    grip.translate(0, height - R * 0.92 - upperLen - 0.50, faceZ)
    poleParts.push(grip)

    emit('pole', mergeParts(poleParts, 'pole'), pole, 'shaft')
  }
  rebuild()

  return {
    root,
    parts: { pole, paddle },
    materials: materialSlots,
    getConfig: () => ({ ...config }),
    configure(patch) {
      if (patch.radius !== undefined) config.radius = Math.max(0.1, patch.radius)
      if (patch.height !== undefined) config.height = Math.max(0.8, patch.height)
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
  key.position.set(-2, 4, 3)
  scene.add(key)
  const camera = new PerspectiveCamera(32, aspect, 0.05, 30)
  camera.position.set(3.2, 1.6, 3.2)
  camera.lookAt(0, 1.3, 0)
  scene.add(camera)
  return { scene, root: model.root, camera, update: model.update, dispose: model.dispose }
}
