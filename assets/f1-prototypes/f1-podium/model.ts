// f1-podium — FIA Appendix 5 GP dais (2026 F1-supplied numbered blocks).
// Camera-facing P2 | P1 | P3, carpeted walkway ≥ 1.20 m, flag slot ≥ 0.50 m,
// large front numerals, solid backdrop. Trophies and champagne are separate props.

import {
  BufferGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  type Material,
} from 'three/webgpu'

import {
  LAYER_CLEARANCE,
  PODIUM,
  TOKEN,
  acquireF1Materials,
  bevelBox,
  bevelPrism,
  createF1Preview,
  disposeF1Materials,
  mergeParts,
  shade,
} from '../f1-kit-core/index.ts'

type Slot = 'steps' | 'deck' | 'barrier' | 'frame' | 'plate'

export interface F1PodiumConfig {
  width: number
}

export interface F1PodiumOptions extends Partial<F1PodiumConfig> {
  materials?: Partial<Record<Slot, Material>>
}

export interface F1PodiumInstance {
  readonly root: Group
  readonly parts: { steps: Group; deck: Group; barrier: Group; frame: Group; plates: Group }
  readonly materials: Readonly<Record<Slot, Material>>
  getConfig(): Readonly<F1PodiumConfig>
  configure(patch: Partial<F1PodiumConfig>): void
  setMaterial(slot: Slot, material: Material): void
  update(deltaSeconds: number): void
  dispose(): void
}

const DAIS_SPAN =
  PODIUM.p2.width + PODIUM.gap + PODIUM.p1.width + PODIUM.gap + PODIUM.p3.width
const defaults: F1PodiumConfig = { width: Math.max(5.5, DAIS_SPAN + 1.2) }
const NUMBERS = ['1', '2', '3'] as const

function daisSpec(place: 1 | 2 | 3) {
  if (place === 1) return PODIUM.p1
  if (place === 2) return PODIUM.p2
  return PODIUM.p3
}

/** Camera-facing X: P2 left (−X), P1 centre, P3 right (+X). */
function daisX(place: 1 | 2 | 3): number {
  if (place === 1) return 0
  const half = PODIUM.p1.width / 2 + PODIUM.gap + daisSpec(place).width / 2
  return place === 2 ? -half : half
}

function raisedDigit(digit: '1' | '2' | '3', width: number, height: number): BufferGeometry {
  const t = 0.032
  const hz = width * 0.78
  const vt = width * 0.18
  const hh = height * 0.13
  const yTop = height * 0.38
  const yMid = 0
  const yBot = -height * 0.38
  const xR = width * 0.28
  const xL = -width * 0.28
  const vH = height * 0.34
  const parts: BufferGeometry[] = []
  const hBar = (y: number) => parts.push(bevelBox(hz, hh, t, 0.003).translate(0, y, 0))
  const vBar = (x: number, y: number) => parts.push(bevelBox(vt, vH, t, 0.003).translate(x, y, 0))
  if (digit === '1') {
    parts.push(bevelBox(vt * 1.15, height * 0.82, t, 0.003))
    hBar(yBot)
  } else if (digit === '2') {
    hBar(yTop)
    vBar(xR, height * 0.18)
    hBar(yMid)
    vBar(xL, -height * 0.18)
    hBar(yBot)
  } else {
    hBar(yTop)
    vBar(xR, height * 0.18)
    hBar(yMid)
    vBar(xR, -height * 0.18)
    hBar(yBot)
  }
  return mergeParts(parts, `digit-${digit}`)
}

/** D-shaped dais: straight back, curved camera face (2026 F1-supplied blocks). */
function daisSolid(width: number, height: number, depth: number): BufferGeometry {
  const hw = width / 2
  const radius = Math.min(hw, depth * 0.58)
  const back = depth - radius
  const y0 = -depth / 2
  const outline: Array<readonly [number, number]> = [
    [-hw, y0],
    [hw, y0],
    [hw, y0 + back],
  ]
  const segs = 14
  for (let i = 0; i <= segs; i++) {
    const a = (i / segs) * Math.PI
    outline.push([Math.cos(a) * radius, y0 + back + Math.sin(a) * radius])
  }
  const geo = bevelPrism(outline, height, 0.008)
  geo.rotateX(-Math.PI / 2)
  geo.scale(1, 1, -1)
  return geo
}

export function createModel(options: F1PodiumOptions = {}): F1PodiumInstance {
  const config: F1PodiumConfig = {
    width: Math.max(DAIS_SPAN + 0.4, options.width ?? defaults.width),
  }

  const bundle = acquireF1Materials()
  const kit = bundle.materials
  const extras: Material[] = []
  const carpet = new MeshStandardMaterial({
    name: 'f1-kit / podium carpet',
    color: shade(TOKEN.COBALT_500, -0.62),
    roughness: 0.92,
    metalness: 0,
  })
  const glass = new MeshStandardMaterial({
    name: 'f1-kit / podium glass',
    color: shade(TOKEN.ICE_300, -0.28),
    roughness: 0.12,
    metalness: 0.18,
  })
  const daisCarpet = new MeshStandardMaterial({
    name: 'f1-kit / dais carpet',
    color: shade(TOKEN.COBALT_500, -0.42),
    roughness: 0.9,
    metalness: 0,
  })
  extras.push(carpet, glass, daisCarpet)

  const ownsPlate = options.materials?.plate === undefined
  const materialSlots: Record<Slot, Material> = {
    steps: options.materials?.steps ?? daisCarpet,
    deck: options.materials?.deck ?? carpet,
    barrier: options.materials?.barrier ?? glass,
    frame: options.materials?.frame ?? kit.ink,
    plate: options.materials?.plate ?? kit.shell,
  }

  const root = new Group(); root.name = 'f1-podium'
  const steps = new Group(); steps.name = 'steps'
  const deck = new Group(); deck.name = 'deck'
  const barrier = new Group(); barrier.name = 'barrier'
  const frame = new Group(); frame.name = 'frame'
  const plates = new Group(); plates.name = 'plates'
  root.add(steps, deck, barrier, frame, plates)

  const generated: BufferGeometry[] = []
  const meshesBySlot: Record<Slot, Mesh[]> = {
    steps: [], deck: [], barrier: [], frame: [], plate: [],
  }

  const releaseGenerated = (): void => {
    steps.clear(); deck.clear(); barrier.clear(); frame.clear(); plates.clear()
    for (const geometry of generated) geometry.dispose()
    generated.length = 0
    for (const slot of Object.keys(meshesBySlot) as Slot[]) meshesBySlot[slot].length = 0
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
    mesh.castShadow = true
    mesh.receiveShadow = true
    meshesBySlot[slot].push(mesh)
    group.add(mesh)
  }

  const rebuild = (): void => {
    releaseGenerated()
    const w = config.width
    const deckH = PODIUM.deck
    const daisFront = PODIUM.p1.depth / 2
    const daisBack = -PODIUM.p1.depth / 2
    const railZ = daisFront + PODIUM.walkway
    const backdropFront = daisBack - PODIUM.flagGap
    const platformZ0 = daisBack
    const platformZ1 = railZ
    const platformDepth = platformZ1 - platformZ0
    const platformZ = (platformZ0 + platformZ1) / 2

    emit(
      'deck',
      bevelBox(w, deckH, platformDepth, 0.008).translate(0, deckH / 2, platformZ),
      deck,
      'deck',
    )

    for (const place of [2, 1, 3] as const) {
      const spec = daisSpec(place)
      const x = daisX(place)
      const y = deckH + spec.height / 2
      emit(
        'steps',
        daisSolid(spec.width, spec.height, spec.depth).translate(x, y, 0),
        steps,
        `dais-${place}`,
      )
      emit(
        'steps',
        bevelBox(spec.width * 0.88, 0.016, 0.012, 0.002).translate(
          x, deckH + spec.height - 0.028, spec.depth / 2 + 0.004,
        ),
        steps,
        `stripe-top-${place}`,
        kit.shell,
      )
      emit(
        'steps',
        bevelBox(spec.width * 0.88, 0.016, 0.012, 0.002).translate(
          x, deckH + 0.028, spec.depth / 2 + 0.004,
        ),
        steps,
        `stripe-bot-${place}`,
        kit.shell,
      )
      const faceZ = spec.depth / 2 + 0.06
      const plateW = spec.width * 0.78
      const plateH = spec.height * 0.8
      const digit = raisedDigit(NUMBERS[place - 1], plateW, plateH).translate(x, y, faceZ)
      emit('plate', digit, plates, `plate-${place}`, ownsPlate ? kit.shell : undefined)
    }

    const railH = PODIUM.barrierH
    const railY = deckH + railH / 2
    const glassT = 0.024
    emit(
      'barrier',
      bevelBox(w - 0.12, railH, glassT, 0.003).translate(0, railY, railZ),
      barrier,
      'rail',
    )
    emit(
      'barrier',
      bevelBox(w - 0.06, 0.028, 0.045, 0.003).translate(0, deckH + railH, railZ + 0.008),
      barrier,
      'handrail',
      kit.steel,
    )
    const postH = railH + 0.08
    const postY = deckH + postH / 2
    const postParts: BufferGeometry[] = []
    const postCount = 5
    for (let i = 0; i < postCount; i++) {
      const t = postCount === 1 ? 0.5 : i / (postCount - 1)
      const x = (t - 0.5) * (w - 0.08)
      postParts.push(bevelBox(0.04, postH, 0.04, 0.003).translate(x, postY, railZ + 0.018))
      postParts.push(bevelBox(0.07, 0.03, 0.05, 0.002).translate(x, deckH + 0.08, railZ + 0.01))
      postParts.push(bevelBox(0.07, 0.03, 0.05, 0.002).translate(x, deckH + railH - 0.06, railZ + 0.01))
    }
    emit('barrier', mergeParts(postParts, 'posts'), barrier, 'posts', kit.graphite)

    const wallT = PODIUM.backdropT
    const wallH = PODIUM.backdropH
    const wallZ = backdropFront - wallT / 2
    emit(
      'frame',
      bevelBox(w, wallH, wallT, 0.008).translate(0, wallH / 2, wallZ),
      frame,
      'backdrop',
    )
    emit(
      'frame',
      bevelBox(w + 0.04, 0.08, wallT + 0.02, 0.004).translate(0, wallH - 0.04, wallZ),
      frame,
      'cap',
      kit.graphite,
    )
    emit(
      'frame',
      bevelBox(w * 0.92, 0.06, wallT + 0.012, 0.003).translate(0, 2.35, wallZ + LAYER_CLEARANCE),
      frame,
      'belt',
      kit.cobalt,
    )
  }
  rebuild()

  return {
    root,
    parts: { steps, deck, barrier, frame, plates },
    materials: materialSlots,
    getConfig: () => ({ ...config }),
    configure(patch) {
      if (patch.width !== undefined) config.width = Math.max(DAIS_SPAN + 0.4, patch.width)
      rebuild()
    },
    setMaterial(slot, material) {
      materialSlots[slot] = material
      for (const mesh of meshesBySlot[slot]) mesh.material = material
    },
    update: () => {},
    dispose() {
      releaseGenerated()
      for (const material of extras) material.dispose()
      extras.length = 0
      disposeF1Materials(bundle)
      root.removeFromParent()
    },
  }
}

export function createPreview({ aspect }: { aspect: number; time?: number }) {
  return createF1Preview(createModel(), {
    aspect,
    target: [0, 0.65, 0],
    distance: 8.8,
    fov: 30,
    yaw: -0.22,
    pitch: 0.34,
  })
}
