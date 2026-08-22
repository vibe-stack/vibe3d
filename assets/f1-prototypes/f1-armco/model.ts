// f1-armco — a straight W-beam guardrail: lofted AASHTO W-section (~380 mm tall, 140 mm corrugation)
// on C-channel posts at 2.0 m centres. Galvanized rails, graphite posts, red / shell block reflectors.

import {
  BufferGeometry,
  Group,
  Mesh,
  type Material,
} from 'three/webgpu'

import {
  acquireF1Materials,
  bevelBox,
  bolt,
  createF1Preview,
  disposeF1Materials,
  loftAlongX,
  mergeParts,
  AXIS_Z,
} from '../f1-kit-core/index.ts'

type Slot = 'post' | 'rail' | 'stripe'

export interface F1ArmcoConfig {
  bays: number
}

export interface F1ArmcoOptions extends Partial<F1ArmcoConfig> {
  materials?: Partial<Record<Slot, Material>>
}

export interface F1ArmcoInstance {
  readonly root: Group
  readonly parts: { posts: Group; rail: Group }
  readonly materials: Readonly<Record<Slot, Material>>
  getConfig(): Readonly<F1ArmcoConfig>
  configure(patch: Partial<F1ArmcoConfig>): void
  setMaterial(slot: Slot, material: Material): void
  update(deltaSeconds: number): void
  dispose(): void
}

const defaults: F1ArmcoConfig = { bays: 4 }
const PITCH = 2.0
const W_H = 0.38
const W_D = 0.14
const W_T = 0.008

function wBeamProfile(): Array<readonly [number, number]> {
  const outer: Array<readonly [number, number]> = [
    [0.00, 0.00],
    [W_D, W_H * 0.18],
    [0.02, W_H * 0.50],
    [W_D, W_H * 0.82],
    [0.00, W_H],
  ]
  const inner = [...outer].reverse().map(([z, y]) => [z - W_T, y] as const)
  return [...outer, ...inner]
}

export function createModel(options: F1ArmcoOptions = {}): F1ArmcoInstance {
  const config: F1ArmcoConfig = { bays: Math.max(1, Math.round(options.bays ?? defaults.bays)) }

  const bundle = acquireF1Materials()
  const kit = bundle.materials
  const materialSlots: Record<Slot, Material> = {
    post: options.materials?.post ?? kit.graphite,
    rail: options.materials?.rail ?? kit.steel,
    stripe: options.materials?.stripe ?? kit.red,
  }

  const root = new Group()
  root.name = 'f1-armco'
  const posts = new Group(); posts.name = 'posts'
  const rail = new Group(); rail.name = 'rail'
  root.add(posts, rail)

  const generated: BufferGeometry[] = []
  const meshesBySlot: Record<Slot, Mesh[]> = { post: [], rail: [], stripe: [] }

  const releaseGenerated = (): void => {
    for (const group of [posts, rail]) group.clear()
    for (const geometry of generated) geometry.dispose()
    generated.length = 0
    for (const slot of Object.keys(meshesBySlot) as Slot[]) meshesBySlot[slot].length = 0
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
    const { bays } = config
    const length = bays * PITCH
    const half = length / 2
    const postParts: BufferGeometry[] = []
    const redMarks: BufferGeometry[] = []
    const whiteMarks: BufferGeometry[] = []
    const profile = wBeamProfile()
    const levels = [0.12, 0.42, 0.72]

    for (let i = 0; i <= bays; i++) {
      const x = -half + i * PITCH
      const web = bevelBox(0.012, 1.24, 0.08, 0.003)
      web.translate(x, 0.64, -0.11)
      postParts.push(web)
      const flangeA = bevelBox(0.08, 1.24, 0.012, 0.003)
      flangeA.translate(x, 0.64, -0.15)
      postParts.push(flangeA)
      const flangeB = bevelBox(0.08, 1.24, 0.012, 0.003)
      flangeB.translate(x, 0.64, -0.07)
      postParts.push(flangeB)
      const socket = bevelBox(0.12, 0.10, 0.12, 0.008)
      socket.translate(x, 0.02, -0.11)
      postParts.push(socket)
      const cap = bevelBox(0.09, 0.04, 0.09, 0.006)
      cap.translate(x, 1.26, -0.11)
      postParts.push(cap)
      for (const y of levels) {
        const bracket = bevelBox(0.16, 0.16, 0.22, 0.012)
        bracket.translate(x, y + W_H / 2, -0.01)
        postParts.push(bracket)
      }
    }
    const railParts: BufferGeometry[] = []
    for (let level = 0; level < levels.length; level++) {
      const beam = loftAlongX(profile, length + 0.20, { closed: true, stations: 8 })
      beam.translate(0, levels[level]!, 0)
      railParts.push(beam)
      for (let joint = 1; joint < bays; joint++) {
        const x = -half + joint * PITCH
        const y = levels[level]! + W_H / 2
        const lap = loftAlongX(profile, 0.28, { closed: true, stations: 4 })
        lap.translate(x, levels[level]!, 0.006)
        railParts.push(lap)
        for (const dx of [-0.06, 0.06] as const) {
          for (const dy of [-0.075, 0.075] as const) {
            postParts.push(bolt([x + dx, y + dy, W_D + 0.018], 0.013, 0.018, AXIS_Z))
          }
        }
      }
    }
    emit('post', mergeParts(postParts, 'posts'), posts, 'posts')
    emit('rail', mergeParts(railParts, 'rails'), rail, 'rails')

    const midY = levels[1]! + W_H / 2
    for (let bay = 0; bay < bays; bay++) {
      const x = -half + (bay + 0.5) * PITCH
      const block = bevelBox(0.22, 0.13, 0.045, 0.006)
      block.translate(x, midY, W_D + 0.052)
      if (bay % 2 === 0) redMarks.push(block)
      else whiteMarks.push(block)
    }
    if (redMarks.length) emit('stripe', mergeParts(redMarks, 'reflectors-red'), rail, 'reflectors-red')
    if (whiteMarks.length) emit('rail', mergeParts(whiteMarks, 'reflectors-white'), rail, 'reflectors-white', kit.shell)
  }
  rebuild()

  return {
    root,
    parts: { posts, rail },
    materials: materialSlots,
    getConfig: () => ({ ...config }),
    configure(patch) {
      if (patch.bays !== undefined) config.bays = Math.max(1, Math.round(patch.bays))
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
  return createF1Preview(createModel({ bays: 3 }), {
    aspect,
    target: [0, 0.55, 0.08],
    distance: 5.6,
    fov: 28,
    yaw: -0.95,
    pitch: 0.18,
  })
}
