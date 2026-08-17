// f1-start-lights — FIA five-column start-light panel. Each column is a lofted rounded-rect housing
// with four stacked red lamps. configure({ lit }) lights that many columns from the left (the TV
// sequence: 1..5 reds, then all out).
//
// Datums: five modules at 0.42 m pitch, each housing 0.28 × 1.05 × 0.22 m, lamps Ø 0.09 m.
// Hung on a 6.4 m span / 5.6 m high overhead (the FIA "standard height above the track" gantry).

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
  bevelBox,
  createF1Preview,
  disposeF1Materials,
  loftRoundedBox,
  member,
  mergeParts,
} from '../f1-kit-core/index.ts'

type Slot = 'housing' | 'lamp' | 'post'

export interface F1StartLightsConfig {
  /** Lit columns, 0–5. */
  lit: number
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

const defaults: F1StartLightsConfig = { lit: 5 }
const COLS = 5
const ROWS = 4
const PITCH = 0.42
const MODULE_W = 0.28
const MODULE_H = 1.05
const MODULE_D = 0.22
const LAMP_R = 0.09

export function createModel(options: F1StartLightsOptions = {}): F1StartLightsInstance {
  const config: F1StartLightsConfig = {
    lit: Math.min(5, Math.max(0, Math.round(options.lit ?? defaults.lit))),
  }

  const bundle = acquireF1Materials()
  const kit = bundle.materials
  const extras: Material[] = []
  const own = (material: Material): Material => {
    extras.push(material)
    return material
  }

  const lampOn = options.materials?.lamp ?? own(new MeshStandardMaterial({
    name: 'f1-kit / start-lamp on',
    color: TOKEN.RED_500,
    emissive: TOKEN.RED_500,
    emissiveIntensity: 3.2,
    roughness: 0.22,
    metalness: 0,
    toneMapped: false,
  }))
  const lampOff = own(new MeshStandardMaterial({
    name: 'f1-kit / start-lamp off',
    color: 0x2a0c0c,
    roughness: 0.22,
    metalness: 0.12,
  }))

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
    const height = 5.6
    const half = span / 2
    const postParts: BufferGeometry[] = []
    for (const sx of [-1, 1] as const) {
      postParts.push(member(new Vector3(sx * half, 0, 0), new Vector3(sx * half, height, 0), 0.11, 12))
      const plate = bevelBox(0.55, 0.08, 0.55, 0.012)
      plate.translate(sx * half, 0.04, 0)
      postParts.push(plate)
      // Lattice braces on each post.
      postParts.push(member(
        new Vector3(sx * half, 0.4, -0.18),
        new Vector3(sx * half, height - 0.4, 0.18),
        0.035,
        8,
      ))
    }
    postParts.push(member(new Vector3(-half, height, 0), new Vector3(half, height, 0), 0.1, 12))
    const beam = bevelBox(span + 0.5, 0.28, 0.36, 0.02)
    beam.translate(0, height + 0.05, 0)
    postParts.push(beam)
    emit('post', mergeParts(postParts, 'posts'), gantry, 'posts')

    const panelW = (COLS - 1) * PITCH + MODULE_W + 0.16
    const back = bevelBox(panelW, MODULE_H + 0.18, 0.08, 0.012)
    back.translate(0, height - 0.55, -0.02)
    emit('housing', back, panel, 'backboard')

    const housings: BufferGeometry[] = []
    for (let c = 0; c < COLS; c++) {
      const x = (c - (COLS - 1) / 2) * PITCH
      const body = loftRoundedBox(MODULE_W, MODULE_H, MODULE_D, 0.045)
      body.rotateY(Math.PI / 2)
      body.translate(x, height - 0.55, MODULE_D / 2 + 0.04)
      housings.push(body)
    }
    emit('housing', mergeParts(housings, 'housings'), panel, 'housings')

    for (let c = 0; c < COLS; c++) {
      const on = c < config.lit
      const x = (c - (COLS - 1) / 2) * PITCH
      for (let r = 0; r < ROWS; r++) {
        const lamp = new CylinderGeometry(LAMP_R, LAMP_R * 0.92, 0.05, 18)
        lamp.rotateX(Math.PI / 2)
        lamp.translate(x, height - 0.55 + (1.5 - r) * 0.22, MODULE_D + 0.08)
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
      disposeF1Materials(bundle)
      root.removeFromParent()
    },
  }
}

export function createPreview({ aspect }: { aspect: number; time?: number }) {
  return createF1Preview(createModel(), { aspect, target: [0, 5.05, 0.35], distance: 4.8, fov: 28 })
}
