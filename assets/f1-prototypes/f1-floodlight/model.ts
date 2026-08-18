// f1-floodlight — a circuit flood mast: tapered pole, access ladder, yoke, and a 2×2 cluster of
// rectangular Musco-style cans with barn doors and round unlit-emissive lenses.
//
// Datums: 12 m mast (configurable), 0.14→0.22 m taper, 2.2 m crossbar, each can 0.62 × 0.38 × 0.28 m
// pitched +32° (rotateX > 0 so the +Z lens face aims down onto the track). Preview frames the HEAD.

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
  AXIS_X,
  AXIS_Y,
  applyPolarCapUVs,
  createLampMaterial,
  tubeSection,
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
    const doors: BufferGeometry[] = []
    const lenses: BufferGeometry[] = []
    // rotateX > 0 pitches the can's +Z (lens face) down onto the track.
    const tilt = 0.55
    const placeOnCan = (geo: BufferGeometry, sx: number, cy: number): BufferGeometry => {
      geo.rotateX(tilt)
      geo.translate(sx, cy, 0.42)
      return geo
    }
    for (const sx of [-0.88, 0.88] as const) {
      for (const sy of [-0.28, 0.28] as const) {
        const cy = height - 0.22 + sy
        cans.push(placeOnCan(loftRoundedBox(0.62, 0.38, 0.28, 0.04), sx, cy))

        const top = bevelBox(0.64, 0.018, 0.14, 0.003)
        top.rotateX(-0.35)
        top.translate(0, 0.205, 0.12)
        doors.push(placeOnCan(top, sx, cy))
        const bot = bevelBox(0.64, 0.018, 0.14, 0.003)
        bot.rotateX(0.35)
        bot.translate(0, -0.205, 0.12)
        doors.push(placeOnCan(bot, sx, cy))
        const left = bevelBox(0.018, 0.4, 0.14, 0.003)
        left.translate(-0.32, 0, 0.12)
        doors.push(placeOnCan(left, sx, cy))
        const right = bevelBox(0.018, 0.4, 0.14, 0.003)
        right.translate(0.32, 0, 0.12)
        doors.push(placeOnCan(right, sx, cy))

        for (const hx of [-0.2, 0, 0.2] as const) {
          const topKn = tubeSection(0.008, 0.032, [0, 0, 0], AXIS_X, 8)
          topKn.translate(hx, 0.19, 0.10)
          doors.push(placeOnCan(topKn, sx, cy))
          const botKn = tubeSection(0.008, 0.032, [0, 0, 0], AXIS_X, 8)
          botKn.translate(hx, -0.19, 0.10)
          doors.push(placeOnCan(botKn, sx, cy))
        }
        for (const hy of [-0.1, 0.1] as const) {
          const leftKn = tubeSection(0.008, 0.028, [0, 0, 0], AXIS_Y, 8)
          leftKn.translate(-0.31, hy, 0.10)
          doors.push(placeOnCan(leftKn, sx, cy))
          const rightKn = tubeSection(0.008, 0.028, [0, 0, 0], AXIS_Y, 8)
          rightKn.translate(0.31, hy, 0.10)
          doors.push(placeOnCan(rightKn, sx, cy))
        }

        for (const lx of [-0.14, 0.14] as const) {
          for (const ly of [-0.1, 0.1] as const) {
            const lens = new CylinderGeometry(0.08, 0.08, 0.03, 16)
            lens.rotateX(Math.PI / 2)
            applyPolarCapUVs(lens)
            lens.translate(lx, ly, 0.155)
            lenses.push(placeOnCan(lens, sx, cy))
          }
        }
      }
    }
    emit('can', mergeParts(cans, 'cans'), head, 'cans')
    emit('can', mergeParts(doors, 'barn-doors'), head, 'barn-doors')
    emit('lens', mergeParts(lenses, 'lenses'), head, 'lenses')
    for (const sx of [-0.88, 0.88] as const) {
      for (const sy of [-0.28, 0.28] as const) {
        const cy = height - 0.22 + sy
        const spot = new SpotLight(0xfff3e0, 12, 14, Math.PI / 4, 0.45, 1.8)
        spot.name = `spot-${sx}-${sy}`
        const origin = new Vector3(sx, cy, 0.42)
        const aim = new Vector3(0, -Math.sin(tilt), Math.cos(tilt))
        spot.position.copy(origin).addScaledVector(aim, 0.22)
        spot.target.position.copy(spot.position).addScaledVector(aim, 10)
        head.add(spot)
        head.add(spot.target)
      }
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
    target: [0, 7.45, 0.55],
    distance: 4.6,
    fov: 30,
    pitch: 0.22,
    ground: true,
    bloom: true,
  })
}
