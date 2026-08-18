// f1-floodlight — a circuit flood mast: tapered pole, access ladder, yoke, and four linear
// Musco TLC-style luminaires with broad optics and glare-control visors.
//
// Datums: 12 m mast (configurable), 0.14→0.22 m taper, 2.35 m crossbar, each can 0.60 × 0.38 × 0.30 m
// based on the TLC-LED-550 envelope and pitched down onto the track.

import {
  BufferGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  SpotLight,
  Vector3,
  type Material,
} from 'three/webgpu'

import {
  TOKEN,
  acquireF1Materials,
  bevelBox,
  bolt,
  createF1Preview,
  disposeF1Materials,
  groundPad,
  loftRoundedBox,
  member,
  mergeParts,
  AXIS_Y,
  createLampMaterial,
} from '../f1-kit-core/index.ts'

type Slot = 'mast' | 'can' | 'lens'

export interface F1FloodlightConfig {
  height: number
}

export interface F1FloodlightOptions extends Partial<F1FloodlightConfig> {
  materials?: Partial<Record<Slot, Material>>
}

export interface F1FloodlightInstance {
  readonly root: Group
  readonly parts: { mast: Group; head: Group }
  readonly materials: Readonly<Record<Slot, Material>>
  getConfig(): Readonly<F1FloodlightConfig>
  configure(patch: Partial<F1FloodlightConfig>): void
  setMaterial(slot: Slot, material: Material): void
  update(deltaSeconds: number): void
  dispose(): void
}

const defaults: F1FloodlightConfig = { height: 12 }

export function createModel(options: F1FloodlightOptions = {}): F1FloodlightInstance {
  const config: F1FloodlightConfig = { height: Math.max(6, options.height ?? defaults.height) }

  const bundle = acquireF1Materials()
  const kit = bundle.materials
  const extras: Material[] = []
  const own = (material: Material): Material => {
    extras.push(material)
    return material
  }
  const lensMat = options.materials?.lens ?? own(createLampMaterial({
    on: true,
    color: TOKEN.SHELL_050,
    name: 'f1-kit / flood lens',
    intensity: 3.2,
  }))

  const materialSlots: Record<Slot, Material> = {
    mast: options.materials?.mast ?? kit.graphite,
    can: options.materials?.can ?? kit.slate,
    lens: lensMat,
  }

  const root = new Group()
  root.name = 'f1-floodlight'
  const mast = new Group(); mast.name = 'mast'
  const head = new Group(); head.name = 'head'
  root.add(mast, head)

  const generated: BufferGeometry[] = []
  const meshesBySlot: Record<Slot, Mesh[]> = { mast: [], can: [], lens: [] }

  const releaseGenerated = (): void => {
    for (const group of [mast, head]) group.clear()
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
    const { height } = config
    const pole = new CylinderGeometry(0.09, 0.18, height, 16)
    pole.translate(0, height / 2, 0)
    emit('mast', pole, mast, 'pole')
    emit('mast', groundPad([0.85, 0.85], [0, 0, 0], 0.1), mast, 'pad')
    const collar = bevelBox(0.42, 0.08, 0.42, 0.01)
    collar.translate(0, 0.14, 0)
    emit('mast', collar, mast, 'collar')
    emit('mast', bolt([0.22, 0.2, 0.22], 0.016, 0.02, AXIS_Y), mast, 'bolt-a')
    emit('mast', bolt([-0.22, 0.2, 0.22], 0.016, 0.02, AXIS_Y), mast, 'bolt-b')
    emit('mast', bolt([0.22, 0.2, -0.22], 0.016, 0.02, AXIS_Y), mast, 'bolt-c')
    emit('mast', bolt([-0.22, 0.2, -0.22], 0.016, 0.02, AXIS_Y), mast, 'bolt-d')

    const rungs: BufferGeometry[] = []
    const rungN = Math.max(6, Math.round(height / 0.45))
    for (let i = 1; i < rungN; i++) {
      const y = (i / rungN) * (height - 0.8)
      rungs.push(member(new Vector3(-0.11, y, 0.12), new Vector3(0.11, y, 0.12), 0.016, 6))
    }
    emit('mast', mergeParts(rungs, 'ladder'), mast, 'ladder')

    const yoke = bevelBox(2.35, 0.22, 0.28, 0.02)
    yoke.translate(0, height - 0.08, 0)
    emit('can', yoke, head, 'yoke')
    emit('can', member(new Vector3(0, height - 0.22, 0), new Vector3(0, height + 0.05, 0.05), 0.05, 10), head, 'pivot')

    const cans: BufferGeometry[] = []
    const shields: BufferGeometry[] = []
    const lenses: BufferGeometry[] = []
    // The measured TLC-LED head is one broad optic per wedge-shaped luminaire.
    const tilt = 0.48
    const cy = height - 0.2
    const placeOnCan = (geo: BufferGeometry, sx: number): BufferGeometry => {
      geo.rotateX(tilt)
      geo.translate(sx, cy, 0.38)
      return geo
    }
    const lampXs = [-1.05, -0.35, 0.35, 1.05] as const
    for (const sx of lampXs) {
      cans.push(placeOnCan(loftRoundedBox(0.6, 0.38, 0.3, 0.045), sx))

      const visor = bevelBox(0.62, 0.025, 0.18, 0.004)
      visor.rotateX(-0.22)
      visor.translate(0, 0.205, 0.13)
      shields.push(placeOnCan(visor, sx))

      const lens = bevelBox(0.48, 0.25, 0.018, 0.012)
      lens.translate(0, 0, 0.16)
      lenses.push(placeOnCan(lens, sx))
    }
    emit('can', mergeParts(cans, 'cans'), head, 'cans')
    emit('can', mergeParts(shields, 'visors'), head, 'visors')
    emit('lens', mergeParts(lenses, 'lenses'), head, 'lenses')
    for (const sx of lampXs) {
      const spot = new SpotLight(0xfff3e0, 8, 14, Math.PI / 5, 0.45, 1.8)
      spot.name = `spot-${sx}`
      const origin = new Vector3(sx, cy, 0.38)
      const aim = new Vector3(0, -Math.sin(tilt), Math.cos(tilt))
      spot.position.copy(origin).addScaledVector(aim, 0.2)
      spot.target.position.copy(spot.position).addScaledVector(aim, 10)
      head.add(spot)
      head.add(spot.target)
    }
  }
  rebuild()

  return {
    root,
    parts: { mast, head },
    materials: materialSlots,
    getConfig: () => ({ ...config }),
    configure(patch) {
      if (patch.height !== undefined) config.height = Math.max(6, patch.height)
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
  const model = createModel({ height: 8 })
  return createF1Preview(model, {
    aspect,
    target: [0, 4.2, 0.2],
    distance: 14,
    fov: 32,
    yaw: -0.45,
    pitch: 0.04,
    ground: true,
  })
}
