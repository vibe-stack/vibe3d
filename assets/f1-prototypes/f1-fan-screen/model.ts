// f1-fan-screen — fan-zone LED wall. Flat, not the jumbotron hood.

import {
  BufferGeometry,
  Group,
  Mesh,
  PlaneGeometry,
  Vector3,
  type Material,
} from 'three/webgpu'

import {
  FAN_SCREEN,
  LAYER_CLEARANCE,
  acquireF1Materials,
  bevelBox,
  createF1Preview,
  createLampMaterial,
  disposeF1Materials,
  member,
} from '../f1-kit-core/index.ts'

type Slot = 'frame' | 'face'

export interface F1FanScreenConfig {
  width: number
}

export interface F1FanScreenOptions extends Partial<F1FanScreenConfig> {
  materials?: Partial<Record<Slot, Material>>
}

export interface F1FanScreenInstance {
  readonly root: Group
  readonly parts: { frame: Group; face: Group }
  readonly materials: Readonly<Record<Slot, Material>>
  getConfig(): Readonly<F1FanScreenConfig>
  configure(patch: Partial<F1FanScreenConfig>): void
  setMaterial(slot: Slot, material: Material): void
  update(deltaSeconds: number): void
  dispose(): void
}

const defaults: F1FanScreenConfig = { width: FAN_SCREEN.width }

export function createModel(options: F1FanScreenOptions = {}): F1FanScreenInstance {
  const config: F1FanScreenConfig = {
    width: Math.max(2, options.width ?? defaults.width),
  }
  const bundle = acquireF1Materials()
  const kit = bundle.materials
  const extras: Material[] = []
  const ownsFace = options.materials?.face === undefined
  const faceMat = options.materials?.face ?? createLampMaterial({
    on: true, color: 0x1a3a8a, name: 'f1-kit / fan screen',
  })
  if (ownsFace) extras.push(faceMat)
  const materialSlots: Record<Slot, Material> = {
    frame: options.materials?.frame ?? kit.graphite,
    face: faceMat,
  }
  const root = new Group(); root.name = 'f1-fan-screen'
  const frame = new Group(); frame.name = 'frame'
  const face = new Group(); face.name = 'face'
  root.add(frame, face)
  const generated: BufferGeometry[] = []
  const meshesBySlot: Record<Slot, Mesh[]> = { frame: [], face: [] }
  const releaseGenerated = (): void => {
    frame.clear(); face.clear()
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
    const w = config.width
    const h = FAN_SCREEN.height
    const d = FAN_SCREEN.depth
    const body = bevelBox(w, h, d, 0.012)
    body.translate(0, 1.2 + h / 2, 0)
    emit('frame', body, frame, 'body')
    emit('frame', member(new Vector3(-w / 2, 0, 0), new Vector3(-w / 2, 1.2, 0), 0.05, 8), frame, 'leg-l')
    emit('frame', member(new Vector3(w / 2, 0, 0), new Vector3(w / 2, 1.2, 0), 0.05, 8), frame, 'leg-r')
    const screen = new PlaneGeometry(w - 0.12, h - 0.12)
    screen.translate(0, 1.2 + h / 2, d / 2 + LAYER_CLEARANCE * 3)
    emit('face', screen, face, 'face')
  }
  rebuild()
  return {
    root,
    parts: { frame, face },
    materials: materialSlots,
    getConfig: () => ({ ...config }),
    configure(patch) {
      if (patch.width !== undefined) config.width = Math.max(2, patch.width)
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
  return createF1Preview(createModel(), {
    aspect, target: [0, 2.0, 0], distance: 10, fov: 30, yaw: -0.25, pitch: 0.06, bloom: true,
  })
}
