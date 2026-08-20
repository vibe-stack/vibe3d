// f1-podium — three 1:1 GP steps with numbered plates and an empty backdrop frame.

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
  LAYER_CLEARANCE,
  PODIUM_HEIGHTS,
  acquireF1Materials,
  bevelBox,
  createF1Preview,
  disposeF1Materials,
  marshalPlateTexture,
  mergeParts,
} from '../f1-kit-core/index.ts'

type Slot = 'steps' | 'frame' | 'plate'

export interface F1PodiumConfig {
  width: number
}

export interface F1PodiumOptions extends Partial<F1PodiumConfig> {
  materials?: Partial<Record<Slot, Material>>
}

export interface F1PodiumInstance {
  readonly root: Group
  readonly parts: { steps: Group; frame: Group; plates: Group }
  readonly materials: Readonly<Record<Slot, Material>>
  getConfig(): Readonly<F1PodiumConfig>
  configure(patch: Partial<F1PodiumConfig>): void
  setMaterial(slot: Slot, material: Material): void
  update(deltaSeconds: number): void
  dispose(): void
}

const defaults: F1PodiumConfig = { width: 5.5 }
const NUMBERS = ['1', '2', '3'] as const
const HEIGHTS = PODIUM_HEIGHTS
const OFFSETS = [0, -0.85, 0.85] as const

export function createModel(options: F1PodiumOptions = {}): F1PodiumInstance {
  const config: F1PodiumConfig = {
    width: Math.max(3, options.width ?? defaults.width),
  }

  const bundle = acquireF1Materials()
  const kit = bundle.materials
  const extras: Material[] = []
  const textures: DataTexture[] = []
  const ownsPlate = options.materials?.plate === undefined
  const materialSlots: Record<Slot, Material> = {
    steps: options.materials?.steps ?? kit.shell,
    frame: options.materials?.frame ?? kit.graphite,
    plate: options.materials?.plate ?? kit.shell,
  }

  const root = new Group(); root.name = 'f1-podium'
  const steps = new Group(); steps.name = 'steps'
  const frame = new Group(); frame.name = 'frame'
  const plates = new Group(); plates.name = 'plates'
  root.add(steps, frame, plates)

  const generated: BufferGeometry[] = []
  const meshesBySlot: Record<Slot, Mesh[]> = { steps: [], frame: [], plate: [] }

  const releaseGenerated = (): void => {
    steps.clear(); frame.clear(); plates.clear()
    for (const geometry of generated) geometry.dispose()
    generated.length = 0
    for (const slot of Object.keys(meshesBySlot) as Slot[]) meshesBySlot[slot].length = 0
    if (ownsPlate) {
      for (const texture of textures) texture.dispose()
      textures.length = 0
      for (const material of extras) material.dispose()
      extras.length = 0
    }
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
    const stepParts: BufferGeometry[] = []
    for (let i = 0; i < 3; i++) {
      const tread = bevelBox(w * 0.32, HEIGHTS[i], w * 0.38, 0.012)
      tread.translate(OFFSETS[i], HEIGHTS[i] / 2, 0.35)
      stepParts.push(tread)
    }
    emit('steps', mergeParts(stepParts, 'tiers'), steps, 'tiers')

    const backdropParts: BufferGeometry[] = []
    const frameW = w * 0.95
    const frameH = 2.8
    backdropParts.push(bevelBox(0.08, frameH, 0.08, 0.006).translate(-frameW / 2, frameH / 2, -0.6))
    backdropParts.push(bevelBox(0.08, frameH, 0.08, 0.006).translate(frameW / 2, frameH / 2, -0.6))
    backdropParts.push(bevelBox(frameW, 0.08, 0.08, 0.006).translate(0, frameH - 0.04, -0.6))
    emit('frame', mergeParts(backdropParts, 'backdrop'), frame, 'backdrop')

    for (let i = 0; i < 3; i++) {
      const x = OFFSETS[i]
      const y = HEIGHTS[i] * 0.55
      const back = bevelBox(0.32, 0.22, 0.03, 0.004)
      back.translate(x, y, 0.52)
      emit('plate', back, plates, `back-${NUMBERS[i]}`, kit.graphite)
      const face = new PlaneGeometry(0.28, 0.18)
      face.translate(x, y, 0.535 + LAYER_CLEARANCE * 3)
      if (ownsPlate) {
        const tex = marshalPlateTexture(NUMBERS[i])
        textures.push(tex)
        const mat = new MeshStandardMaterial({
          name: `f1-kit / podium ${NUMBERS[i]}`,
          map: tex,
          roughness: 0.55,
          metalness: 0.05,
        })
        extras.push(mat)
        emit('plate', face, plates, `plate-${NUMBERS[i]}`, mat)
      } else {
        emit('plate', face, plates, `plate-${NUMBERS[i]}`)
      }
    }
  }
  rebuild()

  return {
    root,
    parts: { steps, frame, plates },
    materials: materialSlots,
    getConfig: () => ({ ...config }),
    configure(patch) {
      if (patch.width !== undefined) config.width = Math.max(3, patch.width)
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
    target: [0, 0.7, 0],
    distance: 8.4,
    fov: 30,
    yaw: -0.55,
    pitch: 0.14,
  })
}
