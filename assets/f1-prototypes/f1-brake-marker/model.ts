// f1-brake-marker — narrow reflective circuit distance panel fixed directly to a catch-fence.
// Flat printed numerals remain legible without turning the marker into a freestanding billboard.
// configure({ distance }).

import {
  BufferGeometry,
  Group,
  Mesh,
  Path,
  Shape,
  ShapeGeometry,
  Vector3,
  type Material,
} from 'three/webgpu'

import {
  acquireF1Materials,
  bevelBox,
  createF1Preview,
  disposeF1Materials,
  member,
  mergeParts,
  tubeSection,
} from '../f1-kit-core/index.ts'

type Slot = 'post' | 'board' | 'face'

export interface F1BrakeMarkerConfig {
  distance: 50 | 100 | 150
}

export interface F1BrakeMarkerOptions extends Partial<F1BrakeMarkerConfig> {
  materials?: Partial<Record<Slot, Material>>
}

export interface F1BrakeMarkerInstance {
  readonly root: Group
  readonly parts: { posts: Group; board: Group }
  readonly materials: Readonly<Record<Slot, Material>>
  getConfig(): Readonly<F1BrakeMarkerConfig>
  configure(patch: Partial<F1BrakeMarkerConfig>): void
  setMaterial(slot: Slot, material: Material): void
  update(deltaSeconds: number): void
  dispose(): void
}

const defaults: F1BrakeMarkerConfig = { distance: 100 }

function roundedRectPath(width: number, height: number, radius: number, clockwise = false): Path {
  const path = new Path()
  const x = width / 2
  const y = height / 2
  const r = Math.min(radius, x, y)
  if (clockwise) {
    path.moveTo(-x, -y + r)
    path.lineTo(-x, y - r)
    path.quadraticCurveTo(-x, y, -x + r, y)
    path.lineTo(x - r, y)
    path.quadraticCurveTo(x, y, x, y - r)
    path.lineTo(x, -y + r)
    path.quadraticCurveTo(x, -y, x - r, -y)
    path.lineTo(-x + r, -y)
    path.quadraticCurveTo(-x, -y, -x, -y + r)
    path.closePath()
    return path
  }
  path.moveTo(-x + r, -y)
  path.lineTo(x - r, -y)
  path.quadraticCurveTo(x, -y, x, -y + r)
  path.lineTo(x, y - r)
  path.quadraticCurveTo(x, y, x - r, y)
  path.lineTo(-x + r, y)
  path.quadraticCurveTo(-x, y, -x, y - r)
  path.lineTo(-x, -y + r)
  path.quadraticCurveTo(-x, -y, -x + r, -y)
  return path
}

function roundedBar(width: number, height: number, radius: number, x: number, y: number, z: number): BufferGeometry {
  const shape = new Shape(roundedRectPath(width, height, radius).getPoints(8))
  const geometry = new ShapeGeometry(shape, 8)
  geometry.translate(x, y, z)
  return geometry
}

function printedDigit(digit: string, cx: number, cy: number, cz: number): BufferGeometry[] {
  const w = 0.27
  const h = 0.43
  const stroke = 0.07
  if (digit === '1') {
    const one = new Shape()
    one.moveTo(-0.045, -h / 2)
    one.quadraticCurveTo(-0.075, -h / 2, -0.075, -h / 2 + 0.03)
    one.lineTo(-0.075, 0.1)
    one.lineTo(-0.145, 0.05)
    one.quadraticCurveTo(-0.17, 0.032, -0.17, 0.064)
    one.lineTo(-0.17, 0.105)
    one.quadraticCurveTo(-0.17, 0.13, -0.145, 0.145)
    one.lineTo(-0.035, h / 2)
    one.lineTo(0.055, h / 2)
    one.quadraticCurveTo(0.085, h / 2, 0.085, h / 2 - 0.035)
    one.lineTo(0.085, -h / 2 + 0.035)
    one.quadraticCurveTo(0.085, -h / 2, 0.055, -h / 2)
    one.closePath()
    const geometry = new ShapeGeometry(one, 10)
    geometry.translate(cx + 0.015, cy, cz)
    return [geometry]
  }
  if (digit === '0') {
    const outer = new Shape(roundedRectPath(w, h, 0.095).getPoints(10))
    outer.holes.push(roundedRectPath(w - stroke * 2, h - stroke * 2, 0.05, true))
    const geometry = new ShapeGeometry(outer, 10)
    geometry.translate(cx, cy, cz)
    return [geometry]
  }
  if (digit === '5') {
    return [
      roundedBar(w, stroke, 0.025, cx, cy + h / 2 - stroke / 2, cz),
      roundedBar(w, stroke, 0.025, cx, cy, cz),
      roundedBar(w, stroke, 0.025, cx, cy - h / 2 + stroke / 2, cz),
      roundedBar(stroke, h / 2, 0.025, cx - w / 2 + stroke / 2, cy + h / 4, cz),
      roundedBar(stroke, h / 2, 0.025, cx + w / 2 - stroke / 2, cy - h / 4, cz),
    ]
  }
  return []
}

function numeralParts(value: 50 | 100 | 150, cx: number, cy: number, cz: number): BufferGeometry[] {
  const text = String(value)
  const pitch = 0.61
  const origin = cy + ((text.length - 1) * pitch) / 2
  const parts: BufferGeometry[] = []
  for (let i = 0; i < text.length; i++) {
    parts.push(...printedDigit(text[i]!, cx, origin - i * pitch, cz))
  }
  return parts
}

export function createModel(options: F1BrakeMarkerOptions = {}): F1BrakeMarkerInstance {
  const config: F1BrakeMarkerConfig = { distance: options.distance ?? defaults.distance }

  const bundle = acquireF1Materials()
  const kit = bundle.materials

  const materialSlots: Record<Slot, Material> = {
    post: options.materials?.post ?? kit.graphite,
    board: options.materials?.board ?? kit.shell,
    face: options.materials?.face ?? kit.graphite,
  }

  const root = new Group()
  root.name = 'f1-brake-marker'
  const posts = new Group(); posts.name = 'posts'
  const board = new Group(); board.name = 'board'
  root.add(posts, board)

  const generated: BufferGeometry[] = []
  const meshesBySlot: Record<Slot, Mesh[]> = { post: [], board: [], face: [] }

  const releaseGenerated = (): void => {
    for (const group of [posts, board]) group.clear()
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
    const postParts: BufferGeometry[] = []
    const fenceWidth = 1.8
    const fenceHeight = 2.5
    for (const sx of [-fenceWidth / 2, fenceWidth / 2] as const) {
      postParts.push(tubeSection(0.025, fenceHeight, [sx, fenceHeight / 2, -0.09], [0, 1, 0], 8))
    }
    for (let i = 0; i <= 6; i++) {
      const x = -fenceWidth / 2 + i * fenceWidth / 6
      postParts.push(member(new Vector3(x, 0.12, -0.09), new Vector3(x, fenceHeight, -0.09), 0.008, 4))
    }
    for (let i = 0; i <= 10; i++) {
      const y = 0.12 + i * (fenceHeight - 0.12) / 10
      postParts.push(member(new Vector3(-fenceWidth / 2, y, -0.09), new Vector3(fenceWidth / 2, y, -0.09), 0.008, 4))
    }
    emit('post', mergeParts(postParts, 'catch-fence'), posts, 'catch-fence')

    const plate = bevelBox(0.6, 1.94, 0.045, 0.009)
    plate.translate(0, 1.35, -0.035)
    emit('board', plate, board, 'plate')

    emit('face', mergeParts(numeralParts(config.distance, 0, 1.35, -0.011), 'printed-numerals'), board, 'printed-numerals')

    const ties: BufferGeometry[] = []
    for (const y of [0.52, 1.35, 2.18]) {
      ties.push(member(new Vector3(-0.325, y, -0.075), new Vector3(-0.265, y, -0.002), 0.007, 6))
      ties.push(member(new Vector3(0.325, y, -0.075), new Vector3(0.265, y, -0.002), 0.007, 6))
    }
    emit('post', mergeParts(ties, 'fence-ties'), posts, 'fence-ties')
  }
  rebuild()

  return {
    root,
    parts: { posts, board },
    materials: materialSlots,
    getConfig: () => ({ ...config }),
    configure(patch) {
      if (patch.distance !== undefined) config.distance = patch.distance
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
  return createF1Preview(createModel(), {
    aspect,
    target: [0, 1.3, -0.02],
    distance: 4.2,
    fov: 28,
    yaw: -0.24,
    pitch: 0.04,
  })
}
