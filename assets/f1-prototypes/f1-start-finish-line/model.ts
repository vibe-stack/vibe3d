// f1-start-finish-line — thin F1 timing stripe, or a ceremonial 1 m chequer when kind is SF.
import { BufferGeometry, Group, Mesh, type Material } from 'three/webgpu'
import {
  START_FINISH,
  acquireF1Materials,
  bevelBox,
  createF1Preview,
  disposeF1Materials,
  mergeParts,
} from '../f1-kit-core/index.ts'
type Slot = 'stripe' | 'mark'
export type F1StartFinishKind = 'LINE' | 'SF' | 'SC1' | 'SC2'
export interface F1StartFinishLineConfig {
  width: number
  kind: F1StartFinishKind
}
export interface F1StartFinishLineOptions extends Partial<F1StartFinishLineConfig> {
  materials?: Partial<Record<Slot, Material>>
}
export interface F1StartFinishLineInstance {
  readonly root: Group
  readonly parts: { stripe: Group; mark: Group }
  readonly materials: Readonly<Record<Slot, Material>>
  getConfig(): Readonly<F1StartFinishLineConfig>
  configure(patch: Partial<F1StartFinishLineConfig>): void
  setMaterial(slot: Slot, material: Material): void
  update(deltaSeconds: number): void
  dispose(): void
}
const defaults: F1StartFinishLineConfig = { width: 8, kind: 'LINE' }
const THICK = 0.008

export function createModel(options: F1StartFinishLineOptions = {}): F1StartFinishLineInstance {
  const config: F1StartFinishLineConfig = {
    width: Math.max(2, options.width ?? defaults.width),
    kind: options.kind ?? defaults.kind,
  }
  const bundle = acquireF1Materials()
  const kit = bundle.materials
  const materialSlots: Record<Slot, Material> = {
    stripe: options.materials?.stripe ?? kit.shell,
    mark: options.materials?.mark ?? kit.ink,
  }
  const root = new Group(); root.name = 'f1-start-finish-line'
  const stripe = new Group(); stripe.name = 'stripe'
  const mark = new Group(); mark.name = 'mark'
  root.add(stripe, mark)
  const generated: BufferGeometry[] = []
  const meshesBySlot: Record<Slot, Mesh[]> = { stripe: [], mark: [] }
  const releaseGenerated = (): void => {
    stripe.clear(); mark.clear()
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
    const { width, kind } = config
    const band = kind === 'SF' ? START_FINISH.chequer : START_FINISH.timing
    const base = bevelBox(width, THICK, band, 0.002)
    base.translate(0, THICK / 2, 0)
    emit('stripe', base, stripe, 'band')
    const marks: BufferGeometry[] = []
    if (kind === 'SF') {
      const tile = START_FINISH.chequer
      const cols = Math.max(2, Math.round(width / tile))
      const tw = width / cols
      for (let col = 0; col < cols; col++) {
        if (col % 2 !== 0) continue
        const x = -width / 2 + (col + 0.5) * tw
        const cell = bevelBox(tw - 0.02, THICK + 0.002, band - 0.02, 0.001)
        cell.translate(x, THICK + 0.001, 0)
        marks.push(cell)
      }
    } else if (kind !== 'LINE') {
      const bars = kind === 'SC1' ? 2 : 3
      for (let i = 0; i < bars; i++) {
        const x = -width / 2 + (i + 1) * (width / (bars + 1))
        const bar = bevelBox(0.18, THICK + 0.002, band - 0.04, 0.001)
        bar.translate(x, THICK + 0.001, 0)
        marks.push(bar)
      }
    }
    if (marks.length > 0) emit('mark', mergeParts(marks, 'marks'), mark, 'marks')
  }
  rebuild()
  return {
    root,
    parts: { stripe, mark },
    materials: materialSlots,
    getConfig: () => ({ ...config }),
    configure(patch) {
      if (patch.width !== undefined) config.width = Math.max(2, patch.width)
      if (patch.kind !== undefined) config.kind = patch.kind
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
  return createF1Preview(createModel({ width: 8, kind: 'SF' }), {
    aspect,
    target: [0, 0.02, 0],
    distance: 9.2,
    fov: 28,
    yaw: -0.2,
    pitch: 0.55,
  })
}
