// f1-tool-cabinet — a rolling drawer chest: a bevelled carcass on a plinth and four swivel castors, a
// work-surface top, and a stack of inset drawer faces with pull handles. Static garage-dressing prop.
// `configure({ width })` rebuilds the cabinet at a new width; drawer rows and caster spacing stay
// proportional. The body defaults to a neutral industrial graphite (still recolorable via the `body` slot).

import {
  BufferGeometry,
  Group,
  Mesh,
  type Material,
} from 'three/webgpu'

import {
  acquireF1Materials,
  bevelBox,
  castor,
  createF1Preview,
  disposeF1Materials,
  mergeParts,
} from '../f1-kit-core/index.ts'

type Slot = 'body' | 'top' | 'handle' | 'caster'

export interface F1ToolCabinetConfig {
  /** Overall cabinet width (metres). Height and depth stay fixed proportions of the original prop. */
  width: number
}

export interface F1ToolCabinetOptions extends Partial<F1ToolCabinetConfig> {
  materials?: Partial<Record<Slot, Material>>
}

export interface F1ToolCabinetInstance {
  readonly root: Group
  readonly parts: { body: Group; drawers: Group; casters: Group }
  readonly materials: Readonly<Record<Slot, Material>>
  getConfig(): Readonly<F1ToolCabinetConfig>
  configure(patch: Partial<F1ToolCabinetConfig>): void
  setMaterial(slot: Slot, material: Material): void
  update(deltaSeconds: number): void
  dispose(): void
}

const defaults: F1ToolCabinetConfig = { width: 0.9 }

const H = 1.05
const D = 0.6
const ROWS = 4
const CASTOR_R = 0.048
const PLINTH_H = 0.05
// Stem top of `castor()` at position.y = 0 is 2.9 * radius (see parts.ts).
const PLINTH_Y = CASTOR_R * 2.9
const BODY_Y = PLINTH_Y + PLINTH_H

export function createModel(options: F1ToolCabinetOptions = {}): F1ToolCabinetInstance {
  const config: F1ToolCabinetConfig = { width: Math.max(0.4, options.width ?? defaults.width) }

  const bundle = acquireF1Materials()
  const kit = bundle.materials
  const materialSlots: Record<Slot, Material> = {
    body: options.materials?.body ?? kit.graphite,
    top: options.materials?.top ?? kit.slate,
    handle: options.materials?.handle ?? kit.steel,
    caster: options.materials?.caster ?? kit.ink,
  }

  const root = new Group()
  root.name = 'f1-tool-cabinet'
  const bodyGroup = new Group(); bodyGroup.name = 'body'
  const drawers = new Group(); drawers.name = 'drawers'
  const casters = new Group(); casters.name = 'casters'
  root.add(bodyGroup, drawers, casters)

  const generated: BufferGeometry[] = []
  const meshesBySlot: Record<Slot, Mesh[]> = { body: [], top: [], handle: [], caster: [] }

  const releaseGenerated = (): void => {
    for (const group of [bodyGroup, drawers, casters]) group.clear()
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
    const W = Math.max(0.4, config.width)

    const bodyParts: BufferGeometry[] = []
    const carcass = bevelBox(W, H, D, 0.012)
    carcass.translate(0, BODY_Y + H / 2, 0)
    bodyParts.push(carcass)

    const plinth = bevelBox(W + 0.02, PLINTH_H, D + 0.02, 0.008)
    plinth.translate(0, PLINTH_Y + PLINTH_H / 2, 0)
    bodyParts.push(plinth)
    emit('body', mergeParts(bodyParts, 'carcass'), bodyGroup, 'carcass')

    const workTop = bevelBox(W + 0.04, 0.04, D + 0.04, 0.006)
    workTop.translate(0, BODY_Y + H + 0.02, 0)
    emit('top', workTop, bodyGroup, 'top')

    // Drawer faces bite 8 mm into the carcass (thickness 24 mm) so they read as recessed fronts rather
    // than coplanar decals on the body's front plane.
    const rowH = (H - 0.14) / ROWS
    const faceH = rowH - 0.03
    const faceT = 0.024
    const faceZ = D / 2 - 0.008 + faceT / 2
    const drawerParts: BufferGeometry[] = []
    const handleParts: BufferGeometry[] = []
    for (let i = 0; i < ROWS; i++) {
      const y = BODY_Y + 0.10 + rowH * (i + 0.5)
      const face = bevelBox(W - 0.06, faceH, faceT, 0.004)
      face.translate(0, y, faceZ)
      drawerParts.push(face)

      const pull = bevelBox(W * 0.5, 0.028, 0.028, 0.004)
      pull.translate(0, y + faceH * 0.18, faceZ + faceT / 2 + 0.006)
      handleParts.push(pull)
    }
    emit('body', mergeParts(drawerParts, 'drawers'), drawers, 'faces')
    emit('handle', mergeParts(handleParts, 'handles'), drawers, 'pulls')

    const casterParts: BufferGeometry[] = []
    for (const sx of [-1, 1] as const) {
      for (const sz of [-1, 1] as const) {
        casterParts.push(castor(
          [sx * (W / 2 - 0.1), 0, sz * (D / 2 - 0.1)],
          CASTOR_R,
          sx * sz * 0.35,
        ))
      }
    }
    emit('caster', mergeParts(casterParts, 'casters'), casters, 'castors')
  }
  rebuild()

  return {
    root,
    parts: { body: bodyGroup, drawers, casters },
    materials: materialSlots,
    getConfig: () => ({ ...config }),
    configure(patch) {
      if (patch.width !== undefined) config.width = Math.max(0.4, patch.width)
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
  return createF1Preview(createModel(), { aspect, target: [0, 0.55, 0], distance: 2.33 })
}
