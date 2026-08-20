// f1-fia-light-panel — LED marshalling box on a short post.

import { BufferGeometry, Group, Mesh, type Material } from 'three/webgpu'

import {
  TOKEN,
  acquireF1Materials,
  bevelBox,
  createF1Preview,
  createLampMaterial,
  disposeF1Materials,
  loftRoundedBox,
  mergeParts,
  tubeSection,
  AXIS_Y,
} from '../f1-kit-core/index.ts'

type Slot = 'post' | 'housing' | 'lamp'

export type F1FiaLightMode = 'yellow' | 'green' | 'red' | 'sc' | 'vsc'

export interface F1FiaLightPanelConfig {
  mode: F1FiaLightMode
}

export interface F1FiaLightPanelOptions extends Partial<F1FiaLightPanelConfig> {
  materials?: Partial<Record<Slot, Material>>
}

export interface F1FiaLightPanelInstance {
  readonly root: Group
  readonly parts: { post: Group; panel: Group }
  readonly materials: Readonly<Record<Slot, Material>>
  getConfig(): Readonly<F1FiaLightPanelConfig>
  configure(patch: Partial<F1FiaLightPanelConfig>): void
  setMaterial(slot: Slot, material: Material): void
  update(deltaSeconds: number): void
  dispose(): void
}

const defaults: F1FiaLightPanelConfig = { mode: 'yellow' }

const MODE_COLOR: Record<F1FiaLightMode, number> = {
  yellow: TOKEN.AMBER_400,
  green: TOKEN.FIELD_500,
  red: TOKEN.RED_500,
  sc: TOKEN.AMBER_400,
  vsc: TOKEN.CYAN_400,
}

export function createModel(options: F1FiaLightPanelOptions = {}): F1FiaLightPanelInstance {
  const config: F1FiaLightPanelConfig = { mode: options.mode ?? defaults.mode }

  const bundle = acquireF1Materials()
  const kit = bundle.materials
  const extras: Material[] = []
  const ownsLamp = options.materials?.lamp === undefined
  let lampMat = options.materials?.lamp ?? createLampMaterial({
    on: true,
    color: MODE_COLOR[config.mode],
    name: 'f1-kit / fia panel lamp',
  })
  if (ownsLamp) extras.push(lampMat)

  const materialSlots: Record<Slot, Material> = {
    post: options.materials?.post ?? kit.graphite,
    housing: options.materials?.housing ?? kit.slate,
    lamp: lampMat,
  }

  const root = new Group(); root.name = 'f1-fia-light-panel'
  const post = new Group(); post.name = 'post'
  const panel = new Group(); panel.name = 'panel'
  root.add(post, panel)

  const generated: BufferGeometry[] = []
  const meshesBySlot: Record<Slot, Mesh[]> = { post: [], housing: [], lamp: [] }

  const releaseGenerated = (): void => {
    post.clear(); panel.clear()
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
    if (ownsLamp) {
      const idx = extras.indexOf(lampMat)
      lampMat.dispose()
      lampMat = createLampMaterial({
        on: true,
        color: MODE_COLOR[config.mode],
        name: 'f1-kit / fia panel lamp',
      })
      if (idx >= 0) extras[idx] = lampMat
      else extras.push(lampMat)
      materialSlots.lamp = lampMat
    }
    emit('post', tubeSection(0.045, 1.35, [0, 0.675, 0], AXIS_Y, 12), post, 'post')
    const foot = bevelBox(0.28, 0.05, 0.28, 0.008)
    foot.translate(0, 0.025, 0)
    emit('post', foot, post, 'foot')
    const box = loftRoundedBox(0.52, 0.38, 0.16, 0.035)
    box.translate(0, 1.55, 0)
    emit('housing', box, panel, 'housing')
    const lamps: BufferGeometry[] = []
    for (let i = 0; i < 3; i++) {
      const disc = bevelBox(0.12, 0.12, 0.014, 0.004)
      disc.translate(-0.14 + i * 0.14, 1.55, 0.09)
      lamps.push(disc)
    }
    emit('lamp', mergeParts(lamps, 'lamps'), panel, 'lamps', lampMat)
  }
  rebuild()

  return {
    root,
    parts: { post, panel },
    materials: materialSlots,
    getConfig: () => ({ ...config }),
    configure(patch) {
      if (patch.mode !== undefined) config.mode = patch.mode
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
  return createF1Preview(createModel({ mode: 'yellow' }), {
    aspect,
    target: [0, 1.4, 0],
    distance: 3.6,
    fov: 28,
    yaw: -0.4,
    pitch: 0.08,
    bloom: true,
  })
}
