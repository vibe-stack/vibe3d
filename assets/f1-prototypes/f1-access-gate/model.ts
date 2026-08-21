// f1-access-gate — a marshal gap that mates armco / concrete / jersey via `fits`.
// Wall returns + hinged mesh leaf — identity is the hole in a wall, not a lone fence panel.

import { BufferGeometry, Group, Mesh, Vector3, type Material } from 'three/webgpu'

import {
  WALL_END,
  acquireF1Materials,
  bevelBox,
  bolt,
  createF1Preview,
  creased,
  disposeF1Materials,
  isWallFit,
  loftAlongX,
  member,
  mergeParts,
  AXIS_Z,
  type WallFit,
} from '../f1-kit-core/index.ts'

type Slot = 'frame' | 'mesh'

export interface F1AccessGateConfig {
  fits: WallFit
  width: number
}

export interface F1AccessGateOptions extends Partial<F1AccessGateConfig> {
  materials?: Partial<Record<Slot, Material>>
}

export interface F1AccessGateInstance {
  readonly root: Group
  readonly parts: { frame: Group; mesh: Group }
  readonly materials: Readonly<Record<Slot, Material>>
  getConfig(): Readonly<F1AccessGateConfig>
  configure(patch: Partial<F1AccessGateConfig>): void
  setMaterial(slot: Slot, material: Material): void
  update(deltaSeconds: number): void
  dispose(): void
}

const defaults: F1AccessGateConfig = { fits: 'armco', width: 1.8 }
const STUB = 0.55

function jerseyStubProfile(): Array<readonly [number, number]> {
  const h = WALL_END.jersey.height
  return [
    [-0.375, 0.00],
    [-0.375, 0.094],
    [-0.227, 0.313],
    [-0.094, h],
    [0.094, h],
    [0.227, 0.313],
    [0.375, 0.094],
    [0.375, 0.00],
  ]
}

function concreteStubProfile(): Array<readonly [number, number]> {
  const h = WALL_END.concrete.height
  const d = WALL_END.concrete.depth
  return [
    [-d / 2, 0],
    [d / 2 + 0.04, 0],
    [d / 2 + 0.04, 0.08],
    [d / 2, 0.08],
    [d / 2 - 0.04, h],
    [-d / 2, h],
  ]
}

function wBeamProfile(): Array<readonly [number, number]> {
  const h = 0.38
  const d = 0.14
  const t = 0.008
  const outer: Array<readonly [number, number]> = [
    [0.00, 0.00],
    [d, h * 0.18],
    [0.02, h * 0.50],
    [d, h * 0.82],
    [0.00, h],
  ]
  const inner = [...outer].reverse().map(([z, y]) => [z - t, y] as const)
  return [...outer, ...inner]
}

export function createModel(options: F1AccessGateOptions = {}): F1AccessGateInstance {
  const config: F1AccessGateConfig = {
    fits: isWallFit(options.fits ?? '') ? options.fits! : defaults.fits,
    width: Math.max(1.2, options.width ?? defaults.width),
  }

  const bundle = acquireF1Materials()
  const kit = bundle.materials
  const materialSlots: Record<Slot, Material> = {
    frame: options.materials?.frame ?? kit.graphite,
    mesh: options.materials?.mesh ?? kit.slate,
  }

  const root = new Group()
  root.name = 'f1-access-gate'
  const frame = new Group(); frame.name = 'frame'
  const meshGroup = new Group(); meshGroup.name = 'mesh'
  root.add(frame, meshGroup)

  const generated: BufferGeometry[] = []
  const meshesBySlot: Record<Slot, Mesh[]> = { frame: [], mesh: [] }

  const releaseGenerated = (): void => {
    frame.clear(); meshGroup.clear()
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
    const end = WALL_END[config.fits]
    const w = config.width
    const h = end.height
    const t = 0.07
    const hz = w / 2
    const posts: BufferGeometry[] = [
      (() => { const g = bevelBox(t, h, t, 0.006); g.translate(-hz, h / 2, 0); return g })(),
      (() => { const g = bevelBox(t, h, t, 0.006); g.translate(hz, h / 2, 0); return g })(),
      (() => { const g = bevelBox(w + t, t * 0.7, t, 0.006); g.translate(0, h - t * 0.35, 0); return g })(),
      (() => { const g = bevelBox(w + t, t * 0.55, t, 0.006); g.translate(0, t * 0.35, 0); return g })(),
    ]
    for (const y of [0.22, 0.55, h - 0.18]) {
      const hinge = bevelBox(0.04, 0.05, 0.05, 0.004)
      hinge.translate(-hz - 0.03, y, 0)
      posts.push(hinge)
    }
    const latch = bevelBox(0.22, 0.04, 0.04, 0.004)
    latch.translate(hz - 0.12, h * 0.55, 0.05)
    posts.push(latch)
    posts.push(bolt([hz - 0.02, h * 0.55, 0.07], 0.01, 0.012, AXIS_Z))

    for (const side of [-1, 1] as const) {
      const x = side * (hz + STUB / 2 + t * 0.6)
      if (config.fits === 'jersey') {
        const stub = creased(loftAlongX(jerseyStubProfile(), STUB, { closed: true, stations: 3 }), 30)
        stub.translate(x, 0, 0)
        posts.push(stub)
      } else if (config.fits === 'concrete') {
        const stub = creased(loftAlongX(concreteStubProfile(), STUB, { closed: true, stations: 3 }), 35)
        stub.translate(x, 0, 0)
        posts.push(stub)
      } else {
        const rail = wBeamProfile()
        for (const y0 of [0.12, 0.50, 0.88]) {
          const beam = loftAlongX(rail, STUB, { closed: true, stations: 3 })
          beam.translate(x, y0, -0.04)
          posts.push(beam)
        }
        const post = bevelBox(0.08, h, 0.08, 0.004)
        post.translate(x + side * STUB * 0.35, h / 2, -0.12)
        posts.push(post)
      }
    }

    emit('frame', mergeParts(posts, 'frame'), frame, 'frame')

    const infill: BufferGeometry[] = []
    const innerW = w - t * 1.6
    const innerH = h - t * 2.1
    const y0 = t * 1.15
    const verts = Math.max(8, Math.round(innerW / 0.07))
    for (let i = 0; i < verts; i++) {
      const x = -innerW / 2 + (i + 0.5) * (innerW / verts)
      infill.push(member(
        new Vector3(x, y0, 0),
        new Vector3(x, y0 + innerH, 0),
        0.006,
        5,
      ))
    }
    const horiz = Math.max(4, Math.round(innerH / 0.10))
    for (let j = 0; j < horiz; j++) {
      const y = y0 + (j + 0.5) * (innerH / horiz)
      infill.push(member(
        new Vector3(-innerW / 2, y, 0),
        new Vector3(innerW / 2, y, 0),
        0.005,
        5,
      ))
    }
    emit('mesh', mergeParts(infill, 'mesh'), meshGroup, 'infill')
  }
  rebuild()

  return {
    root,
    parts: { frame, mesh: meshGroup },
    materials: materialSlots,
    getConfig: () => ({ ...config }),
    configure(patch) {
      if (patch.fits !== undefined && isWallFit(patch.fits)) config.fits = patch.fits
      if (patch.width !== undefined) config.width = Math.max(1.2, patch.width)
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
  return createF1Preview(createModel({ fits: 'armco' }), {
    aspect,
    target: [0, 0.62, 0],
    distance: 5.4,
    fov: 28,
    yaw: -0.7,
    pitch: 0.14,
  })
}
