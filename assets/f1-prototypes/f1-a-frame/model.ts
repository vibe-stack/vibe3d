// f1-a-frame — sandwich board (~1.2 m). Unbranded fascia; host hangs an image via setMaterial.

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
  A_FRAME,
  LAYER_CLEARANCE,
  acquireF1Materials,
  bevelBox,
  createF1Preview,
  disposeF1Materials,
  fasciaTexture,
} from '../f1-kit-core/index.ts'

type Slot = 'frame' | 'fascia'

export const A_FRAME_KINDS = ['INFO', 'PIT', 'PAD'] as const
export type AFrameKind = (typeof A_FRAME_KINDS)[number]

function isAFrameKind(value: string): value is AFrameKind {
  return (A_FRAME_KINDS as readonly string[]).includes(value)
}

export interface F1AFrameConfig {
  kind: AFrameKind
}

export interface F1AFrameOptions extends Partial<F1AFrameConfig> {
  materials?: Partial<Record<Slot, Material>>
}

export interface F1AFrameInstance {
  readonly root: Group
  readonly parts: { frame: Group; fascia: Group }
  readonly materials: Readonly<Record<Slot, Material>>
  getConfig(): Readonly<F1AFrameConfig>
  configure(patch: Partial<F1AFrameConfig>): void
  setMaterial(slot: Slot, material: Material): void
  update(deltaSeconds: number): void
  dispose(): void
}

const defaults: F1AFrameConfig = { kind: 'INFO' }
const TILT = 0.32

export function createModel(options: F1AFrameOptions = {}): F1AFrameInstance {
  const config: F1AFrameConfig = {
    kind: options.kind && isAFrameKind(options.kind) ? options.kind : defaults.kind,
  }
  const bundle = acquireF1Materials()
  const kit = bundle.materials
  const extras: Material[] = []
  const textures: DataTexture[] = []
  let ownsFascia = options.materials?.fascia === undefined
  const materialSlots: Record<Slot, Material> = {
    frame: options.materials?.frame ?? kit.graphite,
    fascia: options.materials?.fascia ?? kit.shell,
  }
  const root = new Group(); root.name = 'f1-a-frame'
  const frame = new Group(); frame.name = 'frame'
  const fascia = new Group(); fascia.name = 'fascia'
  root.add(frame, fascia)
  const generated: BufferGeometry[] = []
  const meshesBySlot: Record<Slot, Mesh[]> = { frame: [], fascia: [] }
  const releaseOwned = (): void => {
    for (const texture of textures) texture.dispose()
    textures.length = 0
    for (const material of extras) material.dispose()
    extras.length = 0
  }
  const releaseGenerated = (): void => {
    frame.clear(); fascia.clear()
    for (const geometry of generated) geometry.dispose()
    generated.length = 0
    for (const slot of Object.keys(meshesBySlot) as Slot[]) meshesBySlot[slot].length = 0
    if (ownsFascia) releaseOwned()
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
    const h = A_FRAME.height
    const w = A_FRAME.width
    const thick = 0.018
    const halfSpread = Math.sin(TILT) * h
    for (const sz of [-1, 1] as const) {
      const board = bevelBox(w, h, thick, 0.006)
      board.rotateX(sz * TILT)
      board.translate(0, Math.cos(TILT) * h / 2, sz * halfSpread)
      emit('frame', board, frame, sz < 0 ? 'board-n' : 'board-s')
    }
    const stay = bevelBox(w - 0.08, 0.02, halfSpread * 2 - 0.04, 0.003)
    stay.translate(0, 0.18, 0)
    emit('frame', stay, frame, 'stay')

    const faceH = h - 0.12
    const faceW = w - 0.1
    const face = new PlaneGeometry(faceW, faceH)
    face.rotateX(-TILT)
    const faceZ = halfSpread + Math.cos(TILT) * (thick / 2 + LAYER_CLEARANCE * 3)
    face.translate(0, Math.cos(TILT) * h / 2, faceZ)
    if (ownsFascia) {
      const tex = fasciaTexture({ number: config.kind, legend: 'PADDOCK', style: 'stamp' })
      textures.push(tex)
      const mat = new MeshStandardMaterial({
        name: 'f1-kit / a-frame fascia',
        map: tex,
        roughness: 0.55,
        metalness: 0.04,
      })
      extras.push(mat)
      emit('fascia', face, fascia, 'face', mat)
    } else {
      emit('fascia', face, fascia, 'face')
    }
  }
  rebuild()
  return {
    root,
    parts: { frame, fascia },
    materials: materialSlots,
    getConfig: () => ({ ...config }),
    configure(patch) {
      if (patch.kind !== undefined && isAFrameKind(patch.kind)) config.kind = patch.kind
      rebuild()
    },
    setMaterial(slot, material) {
      if (slot === 'fascia' && ownsFascia) {
        releaseOwned()
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
  return createF1Preview(createModel(), {
    aspect, target: [0, 0.55, 0], distance: 2.6, fov: 28, yaw: -0.45, pitch: 0.08,
  })
}
