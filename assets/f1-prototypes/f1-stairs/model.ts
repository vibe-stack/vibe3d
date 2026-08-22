// f1-stairs — galvanized FIA flight (180/280) that mates to a deck, or an
// overpass that spans the circuit above the 5 m catch fence.
// Unbranded: no circuit or sponsor marks.

import {
  BufferGeometry,
  Group,
  Mesh,
  Vector3,
  type Material,
} from 'three/webgpu'

import {
  SPECTATOR_BRIDGE,
  STAIRS,
  acquireF1Materials,
  bevelBox,
  bolt,
  createF1Preview,
  disposeF1Materials,
  groundPad,
  isStairKind,
  member,
  mergeParts,
  type StairKind,
} from '../f1-kit-core/index.ts'

type Slot = 'tread' | 'rail' | 'structure' | 'deck'

export interface F1StairsConfig {
  kind: StairKind
  steps: number
  width: number
  span: number
  landing: boolean
}

export interface F1StairsOptions extends Partial<F1StairsConfig> {
  materials?: Partial<Record<Slot, Material>>
}

export interface F1StairsInstance {
  readonly root: Group
  readonly parts: { treads: Group; rails: Group; structure: Group; deck: Group }
  readonly materials: Readonly<Record<Slot, Material>>
  getConfig(): Readonly<F1StairsConfig>
  configure(patch: Partial<F1StairsConfig>): void
  setMaterial(slot: Slot, material: Material): void
  update(deltaSeconds: number): void
  dispose(): void
}

const RISE = STAIRS.rise
const RUN = STAIRS.run
const OVERPASS_STEPS = Math.round(SPECTATOR_BRIDGE.deckHeight / RISE)
const TRUSS_H = 2.05
const BEAM_H = 0.20

const defaults: F1StairsConfig = {
  kind: 'flight',
  steps: 12,
  width: 1.4,
  span: 12,
  landing: true,
}

function clampConfig(config: F1StairsConfig): void {
  config.kind = isStairKind(config.kind) ? config.kind : 'flight'
  config.steps = Math.min(40, Math.max(3, Math.round(config.steps)))
  if (config.kind === 'overpass') {
    config.steps = Math.max(config.steps, OVERPASS_STEPS)
  }
  config.width = Math.min(2.8, Math.max(0.9, config.width))
  config.span = Math.min(24, Math.max(6, config.span))
  config.landing = Boolean(config.landing)
}

/** Open pan: two channels, four bars, nosing. Gaps stay empty so grating reads at catalog distance. */
function gratingTread(width: number, y: number, z: number): BufferGeometry[] {
  const parts: BufferGeometry[] = []
  const left = bevelBox(0.05, STAIRS.treadT, RUN - 0.016, 0.004)
  left.translate(-width / 2 + 0.028, y, z)
  const right = bevelBox(0.05, STAIRS.treadT, RUN - 0.016, 0.004)
  right.translate(width / 2 - 0.028, y, z)
  parts.push(left, right)
  const count = 3
  for (let i = 0; i < count; i++) {
    const bar = bevelBox(width - 0.14, 0.028, 0.036, 0.003)
    bar.translate(0, y + 0.006, z - RUN / 2 + 0.055 + i * ((RUN - 0.11) / Math.max(1, count - 1)))
    parts.push(bar)
  }
  const nosing = bevelBox(width - 0.02, 0.028, STAIRS.nosing, 0.004)
  nosing.translate(0, y + 0.010, z + RUN / 2 - STAIRS.nosing / 2)
  parts.push(nosing)
  return parts
}

function stringerStations(width: number): number[] {
  const hz = width / 2
  return width > 1.8 ? [-hz + 0.05, 0, hz - 0.05] : [-hz + 0.05, hz - 0.05]
}

function channelStringer(sx: number, hyp: number, ang: number, riseH: number, runLen: number): BufferGeometry[] {
  const web = bevelBox(STAIRS.stringerT, STAIRS.stringer, hyp, 0.006)
  web.rotateX(-ang)
  web.translate(sx, riseH / 2 - 0.03, runLen / 2)
  const top = bevelBox(STAIRS.stringerT + 0.055, 0.022, hyp, 0.004)
  top.rotateX(-ang)
  top.translate(sx, riseH / 2 + STAIRS.stringer / 2 - 0.02, runLen / 2)
  const bot = bevelBox(STAIRS.stringerT + 0.055, 0.022, hyp, 0.004)
  bot.rotateX(-ang)
  bot.translate(sx, riseH / 2 - STAIRS.stringer / 2 - 0.04, runLen / 2)
  return [web, top, bot]
}

/** Local +Z flight: tread 0 at z = RUN/2, y = RISE/2. Open risers — kick lip only. */
function assembleFlight(
  steps: number,
  width: number,
  withLanding: boolean,
): { tread: BufferGeometry[]; rail: BufferGeometry[]; structure: BufferGeometry[] } {
  const tread: BufferGeometry[] = []
  const rail: BufferGeometry[] = []
  const structure: BufferGeometry[] = []
  const runLen = steps * RUN
  const riseH = steps * RISE
  const hyp = Math.hypot(RUN, RISE) * steps
  const ang = Math.atan2(RISE, RUN)
  const hz = width / 2

  for (let i = 0; i < steps; i++) {
    const z = (i + 0.5) * RUN
    const y = (i + 0.5) * RISE
    tread.push(...gratingTread(width - 0.08, y, z))
    const kick = bevelBox(width - 0.14, 0.038, 0.018, 0.003)
    kick.translate(0, y - RISE / 2 + 0.028, z + RUN / 2 - 0.03)
    tread.push(kick)
  }

  for (const sx of stringerStations(width)) {
    structure.push(...channelStringer(sx, hyp, ang, riseH, runLen))
  }

  for (const sx of [-hz + 0.04, hz - 0.04]) {
    const toe = bevelBox(0.024, STAIRS.toe, hyp - 0.12, 0.003)
    toe.rotateX(-ang)
    toe.translate(sx, riseH / 2 + STAIRS.stringer / 2 + 0.02, runLen / 2)
    structure.push(toe)
  }

  const braces = Math.max(3, Math.floor(steps / 3))
  for (let b = 0; b < braces; b++) {
    const t = (b + 0.5) / braces
    const z = t * runLen
    const y = t * riseH
    structure.push(
      member(new Vector3(-hz + 0.06, y - 0.12, z), new Vector3(hz - 0.06, y - 0.12, z), 0.016, 6),
    )
    if (b + 1 < braces) {
      const t1 = (b + 1.5) / braces
      structure.push(
        member(
          new Vector3(-hz + 0.06, y - 0.04, z),
          new Vector3(hz - 0.06, t1 * riseH - 0.04, t1 * runLen),
          0.012,
          6,
        ),
      )
    }
  }

  structure.push(groundPad([width + 0.24, 0.42], [0, 0, 0.10], 0.045))
  structure.push(bolt([0, 0.05, 0.10], 0.014, 0.018))
  structure.push(bolt([-hz + 0.12, 0.05, 0.10], 0.012, 0.016))
  structure.push(bolt([hz - 0.12, 0.05, 0.10], 0.012, 0.016))

  const railZ0 = 0.08
  const railZ1 = runLen - 0.04
  const railY0 = RISE + STAIRS.railH
  const railY1 = riseH + STAIRS.railH
  const midY0 = RISE + STAIRS.midH
  const midY1 = riseH + STAIRS.midH
  const posts = Math.max(4, Math.ceil(steps / 3))
  for (const sx of [-hz + 0.028, hz - 0.028]) {
    rail.push(member(new Vector3(sx, railY0, railZ0), new Vector3(sx, railY1, railZ1), 0.024, 8))
    rail.push(member(new Vector3(sx, midY0, railZ0), new Vector3(sx, midY1, railZ1), 0.016, 8))
    rail.push(member(new Vector3(sx, 0.04, railZ0), new Vector3(sx, railY0, railZ0), 0.032, 8))
    for (let p = 0; p <= posts; p++) {
      const t = p / posts
      const z = railZ0 + t * (railZ1 - railZ0)
      const yTread = RISE + t * (riseH - RISE)
      rail.push(member(
        new Vector3(sx, yTread + 0.04, z),
        new Vector3(sx, yTread + STAIRS.railH, z),
        STAIRS.post / 2,
        6,
      ))
    }
    for (let p = 0; p < posts; p++) {
      const t0 = p / posts
      const t1 = (p + 1) / posts
      const pickets = 3
      for (let k = 1; k <= pickets; k++) {
        const t = t0 + (k / (pickets + 1)) * (t1 - t0)
        const z = railZ0 + t * (railZ1 - railZ0)
        const yTread = RISE + t * (riseH - RISE)
        rail.push(member(
          new Vector3(sx, yTread + STAIRS.midH, z),
          new Vector3(sx, yTread + STAIRS.railH - 0.02, z),
          0.007,
          6,
        ))
      }
    }
  }

  if (withLanding) {
    const lz = runLen + STAIRS.landing / 2
    const ly = riseH + STAIRS.treadT / 2
    const land = bevelBox(width, STAIRS.treadT, STAIRS.landing, 0.006)
    land.translate(0, ly, lz)
    tread.push(land)
    for (let i = 0; i < 6; i++) {
      const bar = bevelBox(width - 0.14, 0.016, 0.028, 0.002)
      bar.translate(0, ly + 0.014, runLen + 0.12 + i * ((STAIRS.landing - 0.22) / 5))
      tread.push(bar)
    }
    for (const sx of [-hz + 0.028, hz - 0.028]) {
      rail.push(member(
        new Vector3(sx, riseH + 0.04, runLen),
        new Vector3(sx, riseH + STAIRS.railH, runLen),
        0.028,
        8,
      ))
      rail.push(member(
        new Vector3(sx, riseH + STAIRS.railH, runLen),
        new Vector3(sx, riseH + STAIRS.railH, runLen + STAIRS.landing),
        0.024,
        8,
      ))
      rail.push(member(
        new Vector3(sx, riseH + STAIRS.midH, runLen),
        new Vector3(sx, riseH + STAIRS.midH, runLen + STAIRS.landing),
        0.016,
        8,
      ))
      const kick = bevelBox(0.018, STAIRS.toe, STAIRS.landing - 0.08, 0.003)
      kick.translate(sx, riseH + STAIRS.toe / 2, lz)
      structure.push(kick)
    }
    rail.push(member(
      new Vector3(-hz + 0.028, riseH + STAIRS.railH, runLen + STAIRS.landing - 0.04),
      new Vector3(hz - 0.028, riseH + STAIRS.railH, runLen + STAIRS.landing - 0.04),
      0.024,
      8,
    ))
    rail.push(member(
      new Vector3(-hz + 0.028, riseH + STAIRS.midH, runLen + STAIRS.landing - 0.04),
      new Vector3(hz - 0.028, riseH + STAIRS.midH, runLen + STAIRS.landing - 0.04),
      0.016,
      8,
    ))
    structure.push(bolt([0, ly + 0.02, lz], 0.012, 0.016))
    structure.push(bolt([-hz + 0.12, ly + 0.02, lz], 0.012, 0.016))
    structure.push(bolt([hz - 0.12, ly + 0.02, lz], 0.012, 0.016))
  }

  return { tread, rail, structure }
}

function placeFlight(
  parts: { tread: BufferGeometry[]; rail: BufferGeometry[]; structure: BufferGeometry[] },
  yaw: number,
  origin: Vector3,
): void {
  const all = [...parts.tread, ...parts.rail, ...parts.structure]
  for (const geo of all) {
    if (yaw !== 0) geo.rotateY(yaw)
    geo.translate(origin.x, origin.y, origin.z)
  }
}

function assembleOverpassDeck(
  span: number,
  width: number,
  riseH: number,
): { deck: BufferGeometry[]; rail: BufferGeometry[]; structure: BufferGeometry[] } {
  const deck: BufferGeometry[] = []
  const rail: BufferGeometry[] = []
  const structure: BufferGeometry[] = []
  const half = span / 2
  const hz = width / 2
  const walkY = riseH + STAIRS.treadT / 2

  const bars = Math.max(18, Math.round(span / 0.28))
  for (let i = 0; i < bars; i++) {
    const x = -half + 0.10 + (i / Math.max(1, bars - 1)) * (span - 0.20)
    const bar = bevelBox(0.032, 0.028, width - 0.12, 0.003)
    bar.translate(x, walkY, 0)
    deck.push(bar)
  }
  for (const sz of [-1, 1] as const) {
    const edge = bevelBox(span, 0.04, 0.06, 0.005)
    edge.translate(0, walkY, sz * (hz - 0.04))
    deck.push(edge)
  }

  for (const sz of [-1, 1] as const) {
    const kick = bevelBox(span - 0.16, STAIRS.toe, 0.022, 0.003)
    kick.translate(0, riseH + STAIRS.toe / 2, sz * (hz + 0.012))
    structure.push(kick)
  }

  for (const sz of [-1, 1] as const) {
    const z = sz * (hz - 0.07)
    const beam = bevelBox(span, BEAM_H, 0.10, 0.008)
    beam.translate(0, riseH - BEAM_H / 2 - 0.012, z)
    structure.push(beam)
  }
  const transoms = Math.max(6, Math.round(span / 1.6))
  for (let i = 0; i <= transoms; i++) {
    const x = -half + (i / transoms) * span
    const beam = bevelBox(0.08, BEAM_H, width - 0.12, 0.006)
    beam.translate(x, riseH - BEAM_H / 2 - 0.012, 0)
    structure.push(beam)
  }

  const bays = Math.max(6, Math.round(span / 1.8))
  for (const sz of [-1, 1] as const) {
    const z = sz * (hz + 0.04)
    structure.push(member(
      new Vector3(-half, riseH + 0.04, z),
      new Vector3(half, riseH + 0.04, z),
      0.048,
      8,
    ))
    structure.push(member(
      new Vector3(-half, riseH + TRUSS_H, z),
      new Vector3(half, riseH + TRUSS_H, z),
      0.052,
      8,
    ))
    rail.push(member(
      new Vector3(-half, riseH + STAIRS.railH, z - sz * 0.025),
      new Vector3(half, riseH + STAIRS.railH, z - sz * 0.025),
      0.020,
      8,
    ))
    for (let i = 0; i <= bays; i++) {
      const x = -half + (i / bays) * span
      structure.push(member(
        new Vector3(x, riseH + 0.04, z),
        new Vector3(x, riseH + TRUSS_H, z),
        0.032,
        6,
      ))
    }
    for (let i = 0; i < bays; i++) {
      const x0 = -half + (i / bays) * span
      const x1 = -half + ((i + 1) / bays) * span
      if (i % 2 === 0) {
        structure.push(member(
          new Vector3(x0, riseH + 0.05, z),
          new Vector3(x1, riseH + TRUSS_H - 0.02, z),
          0.028,
          6,
        ))
      } else {
        structure.push(member(
          new Vector3(x0, riseH + TRUSS_H - 0.02, z),
          new Vector3(x1, riseH + 0.05, z),
          0.028,
          6,
        ))
      }
    }
  }


  for (const sx of [-1, 1] as const) {
    const x = sx * half
    for (const sz of [-1, 1] as const) {
      const z = sz * (hz + 0.08)
      const post = bevelBox(0.18, riseH, 0.18, 0.012)
      post.translate(x, riseH / 2, z)
      structure.push(post)
      structure.push(groundPad([0.58, 0.58], [x, 0, z], 0.06))
    }
    structure.push(member(
      new Vector3(x, 0.35, -(hz + 0.08)),
      new Vector3(x, riseH - 0.35, hz + 0.08),
      0.028,
      6,
    ))
    structure.push(member(
      new Vector3(x, riseH - 0.35, -(hz + 0.08)),
      new Vector3(x, 0.35, hz + 0.08),
      0.028,
      6,
    ))
    structure.push(member(
      new Vector3(x, riseH * 0.5, -(hz + 0.08)),
      new Vector3(x, riseH * 0.5, hz + 0.08),
      0.032,
      6,
    ))
  }

  for (const sx of [-1, 1] as const) {
    const x = sx * half
    for (const sz of [-1, 1] as const) {
      structure.push(member(
        new Vector3(x, riseH - BEAM_H, sz * hz),
        new Vector3(x, riseH + TRUSS_H + 0.05, sz * hz),
        0.036,
        8,
      ))
    }
    structure.push(member(
      new Vector3(x, riseH + TRUSS_H + 0.05, -hz),
      new Vector3(x, riseH + TRUSS_H + 0.05, hz),
      0.030,
      8,
    ))
    structure.push(member(
      new Vector3(x, riseH + 0.04, -hz),
      new Vector3(x, riseH + 0.04, hz),
      0.026,
      8,
    ))
  }

  return { deck, rail, structure }
}

export function createModel(options: F1StairsOptions = {}): F1StairsInstance {
  const config: F1StairsConfig = {
    kind: options.kind ?? defaults.kind,
    steps: options.steps ?? (options.kind === 'overpass' ? OVERPASS_STEPS : defaults.steps),
    width: options.width ?? (options.kind === 'overpass' ? SPECTATOR_BRIDGE.width : defaults.width),
    span: options.span ?? defaults.span,
    landing: options.landing ?? defaults.landing,
  }
  clampConfig(config)

  const bundle = acquireF1Materials()
  const kit = bundle.materials
  const materialSlots: Record<Slot, Material> = {
    tread: options.materials?.tread ?? kit.steel,
    rail: options.materials?.rail ?? kit.steel,
    structure: options.materials?.structure ?? kit.steel,
    deck: options.materials?.deck ?? kit.steel,
  }

  const root = new Group(); root.name = 'f1-stairs'
  const treads = new Group(); treads.name = 'treads'
  const rails = new Group(); rails.name = 'rails'
  const structure = new Group(); structure.name = 'structure'
  const deck = new Group(); deck.name = 'deck'
  root.add(treads, rails, structure, deck)

  const generated: BufferGeometry[] = []
  const meshesBySlot: Record<Slot, Mesh[]> = { tread: [], rail: [], structure: [], deck: [] }

  const releaseGenerated = (): void => {
    treads.clear(); rails.clear(); structure.clear(); deck.clear()
    for (const geometry of generated) geometry.dispose()
    generated.length = 0
    for (const slot of Object.keys(meshesBySlot) as Slot[]) meshesBySlot[slot].length = 0
  }

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
    const { steps, width, span, landing, kind } = config

    if (kind === 'flight') {
      const flight = assembleFlight(steps, width, landing)
      const runLen = steps * RUN
      const shift = new Vector3(0, 0, -(runLen + (landing ? STAIRS.landing : 0)) / 2)
      placeFlight(flight, 0, shift)
      emit('tread', mergeParts(flight.tread, 'treads'), treads, 'treads')
      emit('rail', mergeParts(flight.rail, 'rails'), rails, 'rails')
      emit('structure', mergeParts(flight.structure, 'structure'), structure, 'structure')
      return
    }

    const riseH = steps * RISE
    const runLen = steps * RUN
    const half = span / 2
    const over = assembleOverpassDeck(span, width, riseH)
    emit('deck', mergeParts(over.deck, 'deck'), deck, 'deck')

    const left = assembleFlight(steps, width, false)
    placeFlight(left, Math.PI / 2, new Vector3(-half - runLen, 0, 0))
    const right = assembleFlight(steps, width, false)
    placeFlight(right, -Math.PI / 2, new Vector3(half + runLen, 0, 0))

    emit('tread', mergeParts([...left.tread, ...right.tread], 'treads'), treads, 'treads')
    emit('rail', mergeParts([...over.rail, ...left.rail, ...right.rail], 'rails'), rails, 'rails')
    emit(
      'structure',
      mergeParts([...over.structure, ...left.structure, ...right.structure], 'structure'),
      structure,
      'structure',
    )
  }

  rebuild()

  return {
    root,
    parts: { treads, rails, structure, deck },
    materials: materialSlots,
    getConfig: () => ({ ...config }),
    configure(patch) {
      if (patch.kind !== undefined) config.kind = patch.kind
      if (patch.steps !== undefined) config.steps = patch.steps
      if (patch.width !== undefined) config.width = patch.width
      if (patch.span !== undefined) config.span = patch.span
      if (patch.landing !== undefined) config.landing = patch.landing
      clampConfig(config)
      rebuild()
    },
    setMaterial(slot, material) {
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
  return createF1Preview(
    createModel({ kind: 'overpass', steps: OVERPASS_STEPS, span: 12, width: SPECTATOR_BRIDGE.width }),
    {
      aspect,
      target: [-6.2, 2.4, 0],
      distance: 22,
      fov: 32,
      yaw: -0.95,
      pitch: 0.22,
    },
  )
}
