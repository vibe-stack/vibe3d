// f1-garage-box — one F1 pit garage (~7 m bay). Fascia is procedural: pass `number` /
// `legend` / `style` to stamp a built-in plate, or `setMaterial('fascia', yours)` to hang an image.
// `count` tiles boxes along X at GARAGE_BAY_PITCH; numbers increment from `number`.

import {
  BufferGeometry,
  DataTexture,
  Group,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  type Material,
} from 'three/webgpu'

import {
  GARAGE_BAY_PITCH,
  LAYER_CLEARANCE,
  acquireF1Materials,
  bevelBox,
  createF1Preview,
  disposeF1Materials,
  fasciaTexture,
  isFasciaStyle,
  mergeParts,
  type FasciaStyle,
} from '../f1-kit-core/index.ts'

type Slot = 'shell' | 'shutter' | 'fascia' | 'floor'

export interface F1GarageBoxConfig {
  count: number
  /** Starting bay number (stamped). String so 'P1' works. */
  number: string
  /** Secondary fascia legend. Empty = number only. */
  legend: string
  /** Built-in plate. Ignored after `setMaterial('fascia', …)`. */
  style: FasciaStyle
}

export interface F1GarageBoxOptions extends Partial<F1GarageBoxConfig> {
  materials?: Partial<Record<Slot, Material>>
}

export interface F1GarageBoxInstance {
  readonly root: Group
  readonly parts: { shell: Group; shutter: Group; fascia: Group }
  readonly materials: Readonly<Record<Slot, Material>>
  getConfig(): Readonly<F1GarageBoxConfig>
  configure(patch: Partial<F1GarageBoxConfig>): void
  setMaterial(slot: Slot, material: Material): void
  update(deltaSeconds: number): void
  dispose(): void
}

const defaults: F1GarageBoxConfig = { count: 1, number: '1', legend: 'PIT', style: 'stamp' }
const W = 6.6
const D = 12.0
const H = 4.2
const WALL = 0.18
const FASCIA_H = 1.1

function bayNumber(start: string, offset: number): string {
  const n = Number.parseInt(start, 10)
  if (Number.isFinite(n)) return String(n + offset)
  return start
}

export function createModel(options: F1GarageBoxOptions = {}): F1GarageBoxInstance {
  const config: F1GarageBoxConfig = {
    count: Math.max(1, Math.round(options.count ?? defaults.count)),
    number: String(options.number ?? defaults.number).slice(0, 3),
    legend: String(options.legend ?? defaults.legend).slice(0, 8),
    style: options.style && isFasciaStyle(options.style) ? options.style : defaults.style,
  }

  const bundle = acquireF1Materials()
  const kit = bundle.materials
  const extras: Material[] = []
  const textures: DataTexture[] = []
  let ownsFascia = options.materials?.fascia === undefined
  const materialSlots: Record<Slot, Material> = {
    shell: options.materials?.shell ?? kit.shell,
    shutter: options.materials?.shutter ?? kit.slate,
    fascia: options.materials?.fascia ?? kit.shell,
    floor: options.materials?.floor ?? kit.graphite,
  }

  const root = new Group(); root.name = 'f1-garage-box'
  const shell = new Group(); shell.name = 'shell'
  const shutter = new Group(); shutter.name = 'shutter'
  const fascia = new Group(); fascia.name = 'fascia'
  root.add(shell, shutter, fascia)

  const generated: BufferGeometry[] = []
  const meshesBySlot: Record<Slot, Mesh[]> = { shell: [], shutter: [], fascia: [], floor: [] }

  const releaseOwnedFascia = (): void => {
    for (const texture of textures) texture.dispose()
    textures.length = 0
    for (const material of extras) material.dispose()
    extras.length = 0
  }

  const releaseGenerated = (): void => {
    shell.clear(); shutter.clear(); fascia.clear()
    for (const geometry of generated) geometry.dispose()
    generated.length = 0
    for (const slot of Object.keys(meshesBySlot) as Slot[]) meshesBySlot[slot].length = 0
    if (ownsFascia) releaseOwnedFascia()
  }

  const emit = (slot: Slot, geometry: BufferGeometry, group: Group, name: string, material?: Material): void => {
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
    const count = config.count
    const span = count * GARAGE_BAY_PITCH
    for (let i = 0; i < count; i++) {
      const x = -span / 2 + (i + 0.5) * GARAGE_BAY_PITCH
      const floor = bevelBox(W, 0.08, D, 0.01)
      floor.translate(x, 0.04, 0)
      emit('floor', floor, shell, `floor-${i}`)
      const left = bevelBox(WALL, H, D, 0.012)
      left.translate(x - W / 2 + WALL / 2, H / 2, 0)
      const right = bevelBox(WALL, H, D, 0.012)
      right.translate(x + W / 2 - WALL / 2, H / 2, 0)
      const back = bevelBox(W - WALL * 2, H, WALL, 0.012)
      back.translate(x, H / 2, -D / 2 + WALL / 2)
      const roof = bevelBox(W + 0.2, 0.12, D + 0.3, 0.01)
      roof.translate(x, H + 0.04, -0.05)
      emit('shell', mergeParts([left, right, back, roof], `box-${i}`), shell, `box-${i}`)

      const door = bevelBox(W - WALL * 2 - 0.1, H - FASCIA_H - 0.15, 0.06, 0.008)
      door.translate(x, (H - FASCIA_H - 0.15) / 2 + 0.08, D / 2 - 0.04)
      emit('shutter', door, shutter, `shutter-${i}`)

      const frame = bevelBox(W - WALL * 2 - 0.08, FASCIA_H - 0.04, 0.05, 0.006)
      frame.translate(x, H - FASCIA_H / 2, D / 2 - 0.02)
      emit('shell', frame, shell, `fascia-frame-${i}`)

      const plate = new PlaneGeometry(W - WALL * 2 - 0.2, FASCIA_H - 0.12)
      plate.translate(x, H - FASCIA_H / 2, D / 2 + LAYER_CLEARANCE * 3)
      if (ownsFascia) {
        const tex = fasciaTexture({
          number: bayNumber(config.number, i),
          legend: config.legend,
          style: config.style,
        })
        textures.push(tex)
        const mat = new MeshStandardMaterial({
          name: `f1-kit / garage fascia ${i}`,
          map: tex,
          roughness: 0.55,
          metalness: 0.05,
        })
        extras.push(mat)
        emit('fascia', plate, fascia, `fascia-${i}`, mat)
      } else {
        emit('fascia', plate, fascia, `fascia-${i}`)
      }
    }
  }
  rebuild()

  return {
    root,
    parts: { shell, shutter, fascia },
    materials: materialSlots,
    getConfig: () => ({ ...config }),
    configure(patch) {
      if (patch.count !== undefined) config.count = Math.max(1, Math.round(patch.count))
      if (patch.number !== undefined) config.number = String(patch.number).slice(0, 3)
      if (patch.legend !== undefined) config.legend = String(patch.legend).slice(0, 8)
      if (patch.style !== undefined && isFasciaStyle(patch.style)) config.style = patch.style
      rebuild()
    },
    setMaterial(slot, material) {
      if (slot === 'fascia' && ownsFascia) {
        releaseOwnedFascia()
        ownsFascia = false
      }
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
  return createF1Preview(createModel({ count: 3, number: '1', legend: 'PIT', style: 'stamp' }), {
    aspect,
    target: [0, 2.1, 2.5],
    distance: 18,
    fov: 32,
    yaw: -0.55,
    pitch: 0.18,
  })
}
