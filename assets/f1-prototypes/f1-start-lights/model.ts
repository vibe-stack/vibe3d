// f1-start-lights — FIA five-column start-light panel. Each column is a lofted rounded-rect housing
// with stacked lamps. configure({ lit }) lights that many columns from the left (the TV
// sequence: 1..5 reds, then all out). configure({ mode, color }) maps through createLampMaterial.
//
// Datums: five modules at 0.36 m pitch, each housing 0.29 × 1.05 × 0.22 m, lamps Ø 0.08 m.
// Panel hangs clear of the overhead beam (soffit gap ≥ 0.12 m).
// Housing is a solid loft. The well is a collar standing ON the face (no boolean hole, no filled
// cavity in front of the disc). The lens sits inside that collar, behind the lip.
// Lamps are emissive materials + bloom — never per-column SpotLights.

import {
  BufferGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  Vector3,
  type Material,
} from 'three/webgpu'

import {
  TOKEN,
  acquireF1Materials,
  applyPolarCapUVs,
  bevelBox,
  bevelDisc,
  bevelRing,
  createF1Preview,
  createLampMaterial,
  disposeF1Materials,
  loftRoundedBox,
  member,
  mergeParts,
  LAYER_CLEARANCE,
} from '../f1-kit-core/index.ts'

type Slot = 'housing' | 'lamp' | 'post' | 'bezel' | 'glass'

export type F1StartLightMode = 'start' | 'formation' | 'go'

export interface F1StartLightsConfig {
  /** Lit columns, 0–5. */
  lit: number
  /** When true, update() runs the FIA 1..5 then all-out sequence. Sheets stay static. */
  sequence: boolean
  /** Named colour: start=FIA red, formation=amber, go=green. */
  mode: F1StartLightMode
  /** Explicit lamp hex; wins over `mode` when set. */
  color?: number
  /** Lamp rows per column. FIA TV unit is 4. */
  rows: number
}

export interface F1StartLightsOptions extends Partial<F1StartLightsConfig> {
  materials?: Partial<Record<Slot, Material>>
}

export interface F1StartLightsInstance {
  readonly root: Group
  readonly parts: { gantry: Group; panel: Group }
  readonly materials: Readonly<Record<Slot, Material>>
  getConfig(): Readonly<F1StartLightsConfig>
  configure(patch: Partial<F1StartLightsConfig>): void
  setMaterial(slot: Slot, material: Material): void
  update(deltaSeconds: number): void
  dispose(): void
}

const FIA_START_RED = 0xc41820
const defaults: F1StartLightsConfig = { lit: 5, sequence: false, mode: 'start', rows: 4 }
const COLS = 5
const PITCH = 0.36
const MODULE_W = 0.29
const MODULE_H = 1.05
const MODULE_D = 0.22
const LAMP_R = 0.08
const LENS_THICK = 0.012
const WELL_DEPTH = 0.045
const DOME_THICK = 0.004
const HEIGHT = 5.6
/** Panel centre Y — hung so housing top clears the soffit by ≥ 0.12 m. */
const PANEL_Y = HEIGHT - MODULE_H / 2 - 0.28

function lampHex(mode: F1StartLightMode, color?: number): number {
  if (color !== undefined) return color
  if (mode === 'formation') return TOKEN.AMBER_400
  if (mode === 'go') return TOKEN.FIELD_500
  return FIA_START_RED
}

export function createModel(options: F1StartLightsOptions = {}): F1StartLightsInstance {
  const config: F1StartLightsConfig = {
    lit: Math.min(5, Math.max(0, Math.round(options.lit ?? defaults.lit))),
    sequence: options.sequence ?? defaults.sequence,
    mode: options.mode ?? defaults.mode,
    color: options.color,
    rows: Math.min(6, Math.max(1, Math.round(options.rows ?? defaults.rows))),
  }
  let elapsed = 0

  const bundle = acquireF1Materials()
  const kit = bundle.materials
  const extras: Material[] = []
  const own = (material: Material): Material => {
    extras.push(material)
    return material
  }
  const ownsLamp = options.materials?.lamp === undefined

  let lampOn: Material = options.materials?.lamp ?? own(createLampMaterial({
    on: true,
    color: lampHex(config.mode, config.color),
    name: 'f1-kit / start-lamp on',
  }))
  let lampOff: Material = own(createLampMaterial({
    on: false,
    color: lampHex(config.mode, config.color),
    name: 'f1-kit / start-lamp off',
  }))
  const glassMat = options.materials?.glass ?? own(new MeshStandardMaterial({
    name: 'f1-kit / lamp dome',
    color: 0x8aa0b0,
    roughness: 0.15,
    metalness: 0,
    transparent: true,
    opacity: 0.22,
    toneMapped: false,
    depthWrite: false,
  }))

  const relamp = (): void => {
    const hex = lampHex(config.mode, config.color)
    if (ownsLamp) {
      const previousOn = extras.indexOf(lampOn)
      lampOn.dispose()
      lampOn = createLampMaterial({ on: true, color: hex, name: 'f1-kit / start-lamp on' })
      if (previousOn >= 0) extras[previousOn] = lampOn
      else extras.push(lampOn)
    }
    const previousOff = extras.indexOf(lampOff)
    lampOff.dispose()
    lampOff = createLampMaterial({ on: false, color: hex, name: 'f1-kit / start-lamp off' })
    if (previousOff >= 0) extras[previousOff] = lampOff
    else extras.push(lampOff)
    materialSlots.lamp = lampOn
  }

  const materialSlots: Record<Slot, Material> = {
    housing: options.materials?.housing ?? kit.graphite,
    lamp: lampOn,
    post: options.materials?.post ?? kit.slate,
    bezel: options.materials?.bezel ?? kit.graphite,
    glass: glassMat,
  }

  const root = new Group()
  root.name = 'f1-start-lights'
  const gantry = new Group(); gantry.name = 'gantry'
  const panel = new Group(); panel.name = 'panel'
  root.add(gantry, panel)

  const generated: BufferGeometry[] = []
  const meshesBySlot: Record<Slot, Mesh[]> = { housing: [], lamp: [], post: [], bezel: [], glass: [] }

  const releaseGenerated = (): void => {
    for (const group of [gantry, panel]) group.clear()
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
    mesh.castShadow = slot !== 'glass'
    mesh.receiveShadow = slot !== 'glass'
    meshesBySlot[slot].push(mesh)
    group.add(mesh)
  }

  const rebuild = (): void => {
    releaseGenerated()
    const rows = config.rows
    const span = 6.4
    const half = span / 2
    const postParts: BufferGeometry[] = []
    for (const sx of [-1, 1] as const) {
      postParts.push(member(new Vector3(sx * half, 0, 0), new Vector3(sx * half, HEIGHT, 0), 0.11, 12))
      const plate = bevelBox(0.55, 0.08, 0.55, 0.012)
      plate.translate(sx * half, 0.04, 0)
      postParts.push(plate)
      postParts.push(member(
        new Vector3(sx * half, 0.4, -0.18),
        new Vector3(sx * half, HEIGHT - 0.4, 0.18),
        0.035,
        8,
      ))
    }
    postParts.push(member(new Vector3(-half, HEIGHT, 0), new Vector3(half, HEIGHT, 0), 0.1, 12))
    const beam = bevelBox(span + 0.5, 0.28, 0.36, 0.02)
    beam.translate(0, HEIGHT + 0.14, 0)
    postParts.push(beam)
    for (const sx of [-1.2, 0, 1.2] as const) {
      postParts.push(member(
        new Vector3(sx, HEIGHT, 0),
        new Vector3(sx, PANEL_Y + MODULE_H / 2 + 0.04, 0.12),
        0.028,
        8,
      ))
    }
    emit('post', mergeParts(postParts, 'posts'), gantry, 'posts')

    const panelW = (COLS - 1) * PITCH + MODULE_W
    const mountingParts: BufferGeometry[] = []
    const rail = bevelBox(panelW + 0.12, 0.1, 0.08, 0.012)
    rail.translate(0, PANEL_Y + MODULE_H / 2 - 0.04, -0.07)
    mountingParts.push(rail)
    for (const sx of [-1, 1] as const) {
      const tab = bevelBox(0.1, 0.24, 0.07, 0.012)
      tab.translate(sx * (panelW / 2 + 0.02), PANEL_Y + MODULE_H / 2 - 0.12, -0.07)
      mountingParts.push(tab)
    }
    const board = bevelBox(panelW + 0.22, MODULE_H + 0.18, 0.05, 0.01)
    board.translate(0, PANEL_Y, 0.02)
    mountingParts.push(board)
    emit('housing', mergeParts(mountingParts, 'mounting-rail'), panel, 'mounting-rail')

    const housings: BufferGeometry[] = []
    const bezels: BufferGeometry[] = []
    const domes: BufferGeometry[] = []
    const faceZ = MODULE_D / 2 + 0.02
    const housingFaceZ = faceZ + MODULE_D / 2
    // Collar stands ON the face. Lens stays in front of the solid housing, behind the lip.
    const lensZ = housingFaceZ + LAYER_CLEARANCE + LENS_THICK / 2
    const lipZ = housingFaceZ + WELL_DEPTH / 2
    const domeZ = housingFaceZ + WELL_DEPTH + LAYER_CLEARANCE + DOME_THICK / 2
    const rowPitch = 0.2 * (4 / rows)
    for (let c = 0; c < COLS; c++) {
      const x = (c - (COLS - 1) / 2) * PITCH
      const body = loftRoundedBox(MODULE_W, MODULE_H, MODULE_D, 0.045)
      body.translate(x, PANEL_Y, faceZ)
      housings.push(body)
    }
    emit('housing', mergeParts(housings, 'housings'), panel, 'housings')

    const lampsOn: BufferGeometry[] = []
    const lampsOff: BufferGeometry[] = []
    for (let c = 0; c < COLS; c++) {
      const on = c < config.lit
      const x = (c - (COLS - 1) / 2) * PITCH
      for (let r = 0; r < rows; r++) {
        const y = PANEL_Y + ((rows - 1) / 2 - r) * rowPitch
        const lamp = new CylinderGeometry(LAMP_R * 0.78, LAMP_R * 0.74, LENS_THICK, 18)
        lamp.rotateX(Math.PI / 2)
        applyPolarCapUVs(lamp)
        lamp.translate(x, y, lensZ)
        ;(on ? lampsOn : lampsOff).push(lamp)

        const step = bevelRing(LAMP_R * 0.72, LAMP_R * 0.9, 0.005, 0.0005, 24)
        step.translate(x, y, housingFaceZ + 0.003)
        bezels.push(step)
        const lip = bevelRing(LAMP_R * 0.9, LAMP_R * 1.24, WELL_DEPTH, 0.0007, 24)
        lip.translate(x, y, lipZ)
        bezels.push(lip)

        const dome = bevelDisc(LAMP_R * 0.88, DOME_THICK, 0.001, 20)
        dome.translate(x, y, domeZ)
        domes.push(dome)
      }
    }
    if (lampsOn.length) emit('lamp', mergeParts(lampsOn, 'lamps-on'), panel, 'lamps-on', lampOn)
    if (lampsOff.length) emit('lamp', mergeParts(lampsOff, 'lamps-off'), panel, 'lamps-off', lampOff)
    emit('bezel', mergeParts(bezels, 'bezels'), panel, 'bezels')
    emit('glass', mergeParts(domes, 'domes'), panel, 'domes')
  }
  rebuild()

  return {
    root,
    parts: { gantry, panel },
    materials: materialSlots,
    getConfig: () => ({ ...config }),
    configure(patch) {
      if (patch.lit !== undefined) config.lit = Math.min(5, Math.max(0, Math.round(patch.lit)))
      if (patch.sequence !== undefined) config.sequence = patch.sequence
      if (patch.rows !== undefined) config.rows = Math.min(6, Math.max(1, Math.round(patch.rows)))
      let dirtyLamps = false
      if (patch.mode !== undefined) {
        config.mode = patch.mode
        dirtyLamps = true
      }
      if (patch.color !== undefined) {
        config.color = patch.color
        dirtyLamps = true
      }
      if (dirtyLamps) relamp()
      rebuild()
    },
    setMaterial(slot, material) {
      materialSlots[slot] = material
      for (const mesh of meshesBySlot[slot]) mesh.material = material
    },
    update(deltaSeconds) {
      if (!config.sequence) return
      elapsed += deltaSeconds
      const cycle = elapsed % 7
      const next = cycle < 5 ? Math.min(5, Math.floor(cycle) + 1) : 0
      if (next !== config.lit) {
        config.lit = next
        rebuild()
      }
    },
    dispose() {
      releaseGenerated()
      for (const material of extras) material.dispose()
      disposeF1Materials(bundle)
      root.removeFromParent()
    },
  }
}

function litFromEnv(): number | undefined {
  const raw = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.F1_START_LIGHTS_LIT
  if (raw === undefined || raw === '') return undefined
  const n = Number(raw)
  if (!Number.isFinite(n)) return undefined
  return Math.min(5, Math.max(0, Math.round(n)))
}

export function createPreview({ aspect }: { aspect: number; time?: number }) {
  const lit = litFromEnv()
  return createF1Preview(createModel(lit !== undefined ? { lit } : {}), {
    aspect,
    target: [0, PANEL_Y, 0.26],
    distance: 4.6,
    fov: 26,
    yaw: 0.12,
    pitch: 0.04,
    bloom: true,
  })
}
