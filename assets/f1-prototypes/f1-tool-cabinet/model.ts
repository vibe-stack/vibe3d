// f1-tool-cabinet — a red-enamel rolling drawer chest with a recessed mesh work surface, raised perimeter
// rails, protected corners, a tubular push handle, and four exposed swivel castors. Static garage prop.
// `configure({ width })` rebuilds the cabinet at a new width; drawer rows and caster spacing stay
// proportional. Four stable material slots preserve the red / silver / black reference separation.

import {
  BufferGeometry,
  CatmullRomCurve3,
  CylinderGeometry,
  Group,
  Mesh,
  TubeGeometry,
  Vector3,
  type Material,
} from 'three/webgpu'

import {
  acquireF1Materials,
  bevelBox,
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

const H = 0.78
const D = 0.52
const ROWS = 6
const CASTOR_R = 0.074
const PLINTH_H = 0.05
const PLINTH_Y = CASTOR_R * 2.9
const BODY_Y = PLINTH_Y + PLINTH_H

export function createModel(options: F1ToolCabinetOptions = {}): F1ToolCabinetInstance {
  const config: F1ToolCabinetConfig = { width: Math.max(0.4, options.width ?? defaults.width) }

  const bundle = acquireF1Materials()
  const kit = bundle.materials
  if (!options.materials?.body) {
    kit.red.color.setHex(0xc92f27)
    kit.red.roughness = 0.32
    kit.red.metalness = 0.22
  }
  const materialSlots: Record<Slot, Material> = {
    body: options.materials?.body ?? kit.red,
    top: options.materials?.top ?? kit.steel,
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
    const carcass = bevelBox(W, H, D, 0.018)
    carcass.translate(0, BODY_Y + H / 2, 0)
    bodyParts.push(carcass)

    const plinth = bevelBox(W + 0.025, PLINTH_H, D + 0.02, 0.009)
    plinth.translate(0, PLINTH_Y + PLINTH_H / 2, 0)
    bodyParts.push(plinth)
    emit('body', mergeParts(bodyParts, 'carcass'), bodyGroup, 'carcass')

    const topY = BODY_Y + H
    const workSurface = bevelBox(W - 0.055, 0.018, D - 0.035, 0.004)
    workSurface.translate(0, topY + 0.018, 0)
    emit('top', workSurface, bodyGroup, 'recessed-mesh-work-surface')

    const blackParts: BufferGeometry[] = []
    for (const sx of [-1, 1] as const) {
      const rail = bevelBox(0.034, 0.038, D + 0.055, 0.009)
      rail.translate(sx * (W / 2 + 0.006), topY + 0.029, 0)
      blackParts.push(rail)
    }
    for (const sz of [-1, 1] as const) {
      const rail = bevelBox(W + 0.045, 0.038, 0.032, 0.008)
      rail.translate(0, topY + 0.029, sz * (D / 2 + 0.006))
      blackParts.push(rail)
    }
    // Recessed dark perforations leave the silver anti-slip panel as the dominant top value.
    for (let ix = -6; ix <= 6; ix++) {
      for (let iz = -3; iz <= 3; iz++) {
        const hole = bevelBox(0.007, 0.004, 0.007, 0.0015)
        hole.translate(ix * (W - 0.11) / 13, topY + 0.029, iz * (D - 0.10) / 7)
        blackParts.push(hole)
      }
    }

    const fascia = bevelBox(W - 0.075, 0.078, 0.026, 0.008)
    fascia.translate(0, topY - 0.030, D / 2 + 0.020)
    emit('top', fascia, bodyGroup, 'front-fascia')
    for (let i = -2; i <= 2; i++) {
      const mark = bevelBox(i === 0 ? 0.058 : 0.038, 0.010, 0.010, 0.002)
      mark.translate(i * 0.052, topY - 0.030, D / 2 + 0.038)
      blackParts.push(mark)
    }

    const fieldH = H - 0.125
    const rowGap = 0.012
    const rowWeights = [1, 1, 1, 1, 1.85, 1.85] as const
    const weightTotal = rowWeights.reduce((sum, weight) => sum + weight, 0)
    const faceT = 0.020
    const faceZ = D / 2 - 0.008 + faceT / 2
    const drawerParts: BufferGeometry[] = []
    const handleParts: BufferGeometry[] = []
    let cursorY = BODY_Y + H - 0.095
    for (let i = 0; i < ROWS; i++) {
      const faceH = (fieldH - rowGap * (ROWS - 1)) * rowWeights[i]! / weightTotal
      const y = cursorY - faceH / 2
      const face = bevelBox(W - 0.105, faceH, faceT, 0.006)
      face.translate(0, y, faceZ)
      drawerParts.push(face)

      const pull = new CylinderGeometry(0.018, 0.018, W - 0.165, 16)
      pull.rotateZ(Math.PI / 2)
      pull.translate(0, y + faceH / 2 - 0.026, faceZ + faceT / 2 + 0.020)
      handleParts.push(pull)
      cursorY -= faceH + rowGap
    }
    emit('body', mergeParts(drawerParts, 'drawers'), drawers, 'faces')
    emit('handle', mergeParts(handleParts, 'handles'), drawers, 'pulls')

    const pushPath = new CatmullRomCurve3([
      new Vector3(-W / 2 + 0.010, topY - 0.075, D * 0.31),
      new Vector3(-W / 2 - 0.070, topY - 0.075, D * 0.31),
      new Vector3(-W / 2 - 0.085, topY - 0.075, 0),
      new Vector3(-W / 2 - 0.070, topY - 0.075, -D * 0.31),
      new Vector3(-W / 2 + 0.010, topY - 0.075, -D * 0.31),
    ], false, 'centripetal')
    emit('handle', new TubeGeometry(pushPath, 32, 0.016, 12, false), bodyGroup, 'tubular-push-handle')

    // Slim segmented guards protect the uprights without hiding the enamel carcass.
    for (const sx of [-1, 1] as const) {
      for (let i = 0; i < 8; i++) {
        const guard = bevelBox(0.037, H / 8 - 0.010, 0.028, 0.006)
        guard.translate(sx * (W / 2 + 0.008), BODY_Y + H * (i + 0.5) / 8, D / 2 + 0.017)
        blackParts.push(guard)
      }
    }

    const forkParts: BufferGeometry[] = []
    for (const sx of [-1, 1] as const) {
      for (const sz of [-1, 1] as const) {
        const x = sx * (W / 2 - 0.095)
        const z = sz * (D / 2 - 0.080)
        const wheel = new CylinderGeometry(CASTOR_R, CASTOR_R, CASTOR_R * 0.48, 20)
        wheel.rotateZ(Math.PI / 2)
        wheel.translate(x, CASTOR_R, z)
        blackParts.push(wheel)

        for (const side of [-1, 1] as const) {
          const cheek = bevelBox(CASTOR_R * 0.18, CASTOR_R * 1.55, CASTOR_R * 0.22, 0.004)
          cheek.translate(x + side * CASTOR_R * 0.36, CASTOR_R * 1.48, z)
          forkParts.push(cheek)
        }
        const crown = bevelBox(CASTOR_R * 1.08, CASTOR_R * 0.18, CASTOR_R * 0.90, 0.005)
        crown.translate(x, CASTOR_R * 2.18, z)
        forkParts.push(crown)
        const stem = new CylinderGeometry(CASTOR_R * 0.18, CASTOR_R * 0.18, CASTOR_R * 0.55, 12)
        stem.translate(x, CASTOR_R * 2.54, z)
        forkParts.push(stem)
      }
    }
    emit('caster', mergeParts(blackParts, 'rubber-guards-and-top-rails'), casters, 'rubber-and-guards')
    emit('handle', mergeParts(forkParts, 'caster-forks'), casters, 'caster-forks')
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
  return createF1Preview(createModel(), { aspect, target: [0, 0.54, 0], distance: 2.55 })
}
