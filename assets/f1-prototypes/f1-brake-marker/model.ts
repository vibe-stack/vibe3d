// f1-brake-marker — narrow reflective circuit distance panel fixed directly to a catch-fence.
// Flat printed numerals remain legible without turning the marker into a freestanding billboard.
// configure({ distance }).

import {
  BufferGeometry,
  Group,
  Mesh,
  PlaneGeometry,
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

function flatBar(width: number, height: number, x: number, y: number, z: number): BufferGeometry {
  const geometry = new PlaneGeometry(width, height)
  geometry.translate(x, y, z)
  return geometry
}

function printedDigit(digit: string, cx: number, cy: number, cz: number): BufferGeometry[] {
  const w = 0.34
  const h = 0.48
  const stroke = 0.095
  if (digit === '1') {
    const cap = new PlaneGeometry(stroke, 0.18)
    cap.rotateZ(-0.58)
    cap.translate(cx - 0.015, cy + 0.17, cz)
    return [
      flatBar(stroke, h, cx + 0.035, cy, cz),
      cap,
      flatBar(0.27, stroke, cx, cy - h / 2 + stroke / 2, cz),
    ]
  }
  if (digit === '0') {
    return [
      flatBar(w, stroke, cx, cy + h / 2 - stroke / 2, cz),
      flatBar(w, stroke, cx, cy - h / 2 + stroke / 2, cz),
      flatBar(stroke, h - stroke * 2, cx - w / 2 + stroke / 2, cy, cz),
      flatBar(stroke, h - stroke * 2, cx + w / 2 - stroke / 2, cy, cz),
    ]
  }
  if (digit === '5') {
    return [
      flatBar(w, stroke, cx, cy + h / 2 - stroke / 2, cz),
      flatBar(w, stroke, cx, cy, cz),
      flatBar(w, stroke, cx, cy - h / 2 + stroke / 2, cz),
      flatBar(stroke, h / 2 - stroke, cx - w / 2 + stroke / 2, cy + h / 4, cz),
      flatBar(stroke, h / 2 - stroke, cx + w / 2 - stroke / 2, cy - h / 4, cz),
    ]
  }
  return []
}

function numeralParts(value: 50 | 100 | 150, cx: number, cy: number, cz: number): BufferGeometry[] {
  const text = String(value)
  const pitch = 0.56
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

    const plate = bevelBox(0.68, 1.94, 0.045, 0.009)
    plate.translate(0, 1.35, -0.035)
    emit('board', plate, board, 'plate')

    emit('face', mergeParts(numeralParts(config.distance, 0, 1.35, -0.011), 'printed-numerals'), board, 'printed-numerals')

    const ties: BufferGeometry[] = []
    for (const y of [0.55, 1.35, 2.14]) {
      ties.push(member(new Vector3(-0.38, y, -0.08), new Vector3(-0.29, y, 0), 0.012, 6))
      ties.push(member(new Vector3(0.38, y, -0.08), new Vector3(0.29, y, 0), 0.012, 6))
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
