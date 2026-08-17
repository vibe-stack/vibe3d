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
  Group,
  Mesh,
  type Material,
} from 'three/webgpu'

import {
  acquireF1Materials,
  bevelBox,
  bevelDisc as disc,
  bevelRing as ring,
  createF1Preview,
  disposeF1Materials,
  mergeParts,
} from '../f1-kit-core/index.ts'

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

export function createModel(options: F1LollipopBoardOptions = {}): F1LollipopBoardInstance {
  const config: F1LollipopBoardConfig = {
    radius: Math.max(0.1, options.radius ?? defaults.radius),
    height: Math.max(0.8, options.height ?? defaults.height),
  }

  const bundle = acquireF1Materials()
  const m = bundle.materials
  const materialSlots: Record<Slot, Material> = {
    pole: options.materials?.pole ?? m.steel,
    paddle: options.materials?.paddle ?? m.amber,
    legend: options.materials?.legend ?? m.ink,
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
      disposeF1Materials(bundle)
      root.removeFromParent()
    },
  }
}

export function createPreview({ aspect }: { aspect: number; time?: number }) {
  return createF1Preview(createModel(), { aspect, target: [0, 1.3, 0], distance: 4.54, fov: 32 })
}
