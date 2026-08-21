// f1-led-ribbon — Zandvoort main-straight LED cabinet: 8 × 1.2 m face,
// shallow housing on feet, louver, setMaterial('face') for a host image.

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
  disposeF1Materials,
  mergeParts,
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
  const materialSlots: Record<Slot, Material> = {
    frame: options.materials?.frame ?? kit.graphite,
    face: options.materials?.face ?? kit.ink,
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
    const L = config.length
    const h = LED_RIBBON.height
    const d = LED_RIBBON.depth
    const footH = LED_RIBBON.footH
    const louver = LED_RIBBON.louver
    // Cabinet sits on the feet with a real gap — a flush y-plane is a rule-8 plate.
    const bodyY = footH + LAYER_CLEARANCE
    const body = bevelBox(L, h, d, 0.012)
    body.translate(0, bodyY + h / 2, 0)
    emit('frame', body, frame, 'body')
    const hood = bevelBox(L + 0.02, louver, d - 0.02, 0.006)
    hood.translate(0, bodyY + h - louver / 2, 0.008)
    emit('frame', hood, frame, 'louver')
    const feet: BufferGeometry[] = []
    for (const sx of [-1, 1] as const) {
      const foot = bevelBox(0.16, footH, d - 0.04, 0.008)
      foot.translate(sx * (L / 2 - 0.28), footH / 2, 0)
      feet.push(foot)
    }
    emit('frame', mergeParts(feet, 'feet'), frame, 'feet')
    const screen = new PlaneGeometry(L - 0.08, h - louver - 0.06)
    screen.translate(0, bodyY + (h - louver) / 2, d / 2 + LAYER_CLEARANCE)
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
      disposeF1Materials(bundle)
      root.removeFromParent()
    },
  }
}

export function createPreview({ aspect }: { aspect: number; time?: number }) {
  return createF1Preview(createModel(), {
    aspect, target: [0, 0.7, 0], distance: 14, fov: 30, yaw: -0.2, pitch: 0.08,
  })
}
