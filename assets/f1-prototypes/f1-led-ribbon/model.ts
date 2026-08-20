// f1-led-ribbon — trackside LED advertising wall. 8 × 1.2 m module.

import {
  BufferGeometry,
  Group,
  Mesh,
  PlaneGeometry,
  type Material,
} from 'three/webgpu'

import {
  LAYER_CLEARANCE,
  LED_RIBBON,
  acquireF1Materials,
  bevelBox,
  createF1Preview,
  createLampMaterial,
  disposeF1Materials,
} from '../f1-kit-core/index.ts'

type Slot = 'frame' | 'face'

export interface F1LedRibbonConfig {
  length: number
}

export interface F1LedRibbonOptions extends Partial<F1LedRibbonConfig> {
  materials?: Partial<Record<Slot, Material>>
}

export interface F1LedRibbonInstance {
  readonly root: Group
  readonly parts: { frame: Group; face: Group }
  readonly materials: Readonly<Record<Slot, Material>>
  getConfig(): Readonly<F1LedRibbonConfig>
  configure(patch: Partial<F1LedRibbonConfig>): void
  setMaterial(slot: Slot, material: Material): void
  update(deltaSeconds: number): void
  dispose(): void
}

const defaults: F1LedRibbonConfig = { length: LED_RIBBON.length }

export function createModel(options: F1LedRibbonOptions = {}): F1LedRibbonInstance {
  const config: F1LedRibbonConfig = {
    length: Math.max(2, options.length ?? defaults.length),
  }
  const bundle = acquireF1Materials()
  const kit = bundle.materials
  const extras: Material[] = []
  const ownsFace = options.materials?.face === undefined
  const faceMat = options.materials?.face ?? createLampMaterial({
    on: true, color: 0x3e6cff, name: 'f1-kit / led ribbon',
  })
  if (ownsFace) extras.push(faceMat)
  const materialSlots: Record<Slot, Material> = {
    frame: options.materials?.frame ?? kit.graphite,
    face: faceMat,
  }
  const root = new Group(); root.name = 'f1-led-ribbon'
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
    const L = config.length
    const h = LED_RIBBON.height
    const d = LED_RIBBON.depth
    const body = bevelBox(L, h, d, 0.01)
    body.translate(0, h / 2, 0)
    emit('frame', body, frame, 'body')
    const screen = new PlaneGeometry(L - 0.08, h - 0.08)
    screen.translate(0, h / 2, d / 2 + LAYER_CLEARANCE * 3)
    emit('face', screen, face, 'face')
  }
  rebuild()
  return {
    root,
    parts: { frame, face },
    materials: materialSlots,
    getConfig: () => ({ ...config }),
    configure(patch) {
      if (patch.length !== undefined) config.length = Math.max(2, patch.length)
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
    aspect, target: [0, 0.6, 0], distance: 14, fov: 30, yaw: -0.2, pitch: 0.08, bloom: true,
  })
}
