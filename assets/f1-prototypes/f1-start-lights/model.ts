// f1-start-lights — FIA five-column start-light panel. Each column is a lofted rounded-rect housing
// with four stacked red lamps. configure({ lit }) lights that many columns from the left (the TV
// sequence: 1..5 reds, then all out).
//
// Datums: five modules at 0.48 m pitch, each housing 0.28 × 1.05 × 0.22 m, lamps Ø 0.08 m.
// Panel hangs clear of the overhead beam (soffit gap ≥ 0.12 m).

import {
  BufferGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  Vector3,
  type Material,
} from 'three/webgpu'

import {
  acquireF1Materials,
  bevelBox,
  createF1Preview,
  createLampMaterial,
  disposeF1Materials,
  loftRoundedBox,
  member,
  mergeParts,
  LAYER_CLEARANCE,
} from '../f1-kit-core/index.ts'

type Slot = 'housing' | 'lamp' | 'post'

export interface F1StartLightsConfig {
  /** Lit columns, 0–5. */
  lit: number
  /** When true, update() runs the FIA 1..5 then all-out sequence. Sheets stay static. */
  sequence: boolean
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

const defaults: F1StartLightsConfig = { lit: 5, sequence: false }
const COLS = 5
const ROWS = 4
const PITCH = 0.48
const MODULE_W = 0.28
const MODULE_H = 1.05
const MODULE_D = 0.22
const LAMP_R = 0.08
const HEIGHT = 5.6
/** Panel centre Y — hung so housing top clears the soffit by ≥ 0.12 m. */
const PANEL_Y = HEIGHT - MODULE_H / 2 - 0.28

export function createModel(options: F1StartLightsOptions = {}): F1StartLightsInstance {
  const config: F1StartLightsConfig = {
    lit: Math.min(5, Math.max(0, Math.round(options.lit ?? defaults.lit))),
    sequence: options.sequence ?? defaults.sequence,
  }
  let elapsed = 0

  const bundle = acquireF1Materials()
  const kit = bundle.materials
  const extras: Material[] = []
  const own = (material: Material): Material => {
    extras.push(material)
    return material
  }

  const lampOn = options.materials?.lamp ?? own(createLampMaterial({
    on: true,
    name: 'f1-kit / start-lamp on',
  }))
  const lampOff = own(createLampMaterial({ on: false, name: 'f1-kit / start-lamp off' }))

  const materialSlots: Record<Slot, Material> = {
    housing: options.materials?.housing ?? kit.graphite,
    lamp: lampOn,
    post: options.materials?.post ?? kit.slate,
  }

  const root = new Group()
  root.name = 'f1-start-lights'
  const gantry = new Group(); gantry.name = 'gantry'
  const panel = new Group(); panel.name = 'panel'
  root.add(gantry, panel)

  const generated: BufferGeometry[] = []
  const meshesBySlot: Record<Slot, Mesh[]> = { housing: [], lamp: [], post: [] }

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
    mesh.castShadow = true
    mesh.receiveShadow = true
    meshesBySlot[slot].push(mesh)
    group.add(mesh)
  }

  const rebuild = (): void => {
    releaseGenerated()
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
    // Drop hangers from the soffit to the panel top — no housing/beam intersection.
    for (const sx of [-1.2, 0, 1.2] as const) {
      postParts.push(member(
        new Vector3(sx, HEIGHT, 0),
        new Vector3(sx, PANEL_Y + MODULE_H / 2 + 0.04, 0.12),
        0.028,
        8,
      ))
    }
    emit('post', mergeParts(postParts, 'posts'), gantry, 'posts')

    const panelW = (COLS - 1) * PITCH + MODULE_W + 0.2
    // Backboard behind the modules with ≥15 mm air gap (rule 8).
    const back = bevelBox(panelW, MODULE_H + 0.18, 0.05, 0.01)
    back.translate(0, PANEL_Y, -0.08)
    emit('housing', back, panel, 'backboard')

    const housings: BufferGeometry[] = []
    // loftRoundedBox is W×H×D in XYZ — no rotateY (that swapped width/depth and kissed the board).
    const faceZ = MODULE_D / 2 + 0.02
    for (let c = 0; c < COLS; c++) {
      const x = (c - (COLS - 1) / 2) * PITCH
      const body = loftRoundedBox(MODULE_W, MODULE_H, MODULE_D, 0.045)
      body.translate(x, PANEL_Y, faceZ)
      housings.push(body)
    }
    emit('housing', mergeParts(housings, 'housings'), panel, 'housings')

    const lampZ = faceZ + MODULE_D / 2 + LAYER_CLEARANCE + 0.02
    const rowPitch = 0.2
    for (let c = 0; c < COLS; c++) {
      const on = c < config.lit
      const x = (c - (COLS - 1) / 2) * PITCH
      for (let r = 0; r < ROWS; r++) {
        const lamp = new CylinderGeometry(LAMP_R, LAMP_R * 0.92, 0.04, 18)
        lamp.rotateX(Math.PI / 2)
        lamp.translate(x, PANEL_Y + (1.5 - r) * rowPitch, lampZ)
        emit('lamp', lamp, panel, `lamp-${c}-${r}`, on ? lampOn : lampOff)
      }
    }
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
  const raw = process.env.F1_START_LIGHTS_LIT
  if (raw === undefined || raw === '') return undefined
  const n = Number(raw)
  if (!Number.isFinite(n)) return undefined
  return Math.min(5, Math.max(0, Math.round(n)))
}

export function createPreview({ aspect }: { aspect: number; time?: number }) {
  const lit = litFromEnv()
  return createF1Preview(createModel(lit !== undefined ? { lit } : {}), {
    aspect,
    target: [0, PANEL_Y, 0.28],
    distance: 4.8,
    fov: 28,
    pitch: 0.06,
    ground: true,
  })
}
