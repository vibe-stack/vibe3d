// f1-start-lights — FIA five-column start-light panel on a short overhead gantry.
// configure({ lit }) lights that many columns from the left.

import {
  BufferGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
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
} from '../f1-kit-core/index.ts'
import { TOKEN } from '../f1-kit-core/index.ts'

type Slot = 'housing' | 'lamp' | 'post'

export interface F1StartLightsConfig {
  /** Lit columns, 0–5. */
  lit: number
}

export interface F1StartLightsOptions extends Partial<F1StartLightsConfig> {
  materials?: Partial<Record<Slot, Material>>
}

export interface F1StartLightsInstance {
  readonly root: Group
  readonly parts: { gantry: Group; panel: Group }
  readonly materials: Readonly<Record<Slot, Material>>
  getConfig(): Readonly<F1StartLightsConfig>
  configure(patch: Partial<F1StartLightsConfig>): void
  setMaterial(slot: Slot, material: Material): void
  update(deltaSeconds: number): void
  dispose(): void
}

const defaults: F1StartLightsConfig = { lit: 5 }

export function createModel(options: F1StartLightsOptions = {}): F1StartLightsInstance {
  const config: F1StartLightsConfig = {
    lit: Math.min(5, Math.max(0, Math.round(options.lit ?? defaults.lit))),
  }

  const bundle = acquireF1Materials()
  const kit = bundle.materials
  const extras: Material[] = []
  const own = (material: Material): Material => {
    extras.push(material)
    return material
  }

  const lampOn = options.materials?.lamp ?? own(new MeshStandardMaterial({
    name: 'f1-kit / start-lamp on',
    color: TOKEN.RED_500,
    emissive: TOKEN.RED_500,
    emissiveIntensity: 1.4,
    roughness: 0.35,
    metalness: 0.1,
    toneMapped: false,
  }))
  const lampOff = own(new MeshStandardMaterial({
    name: 'f1-kit / start-lamp off',
    color: 0x1a0a0a,
    roughness: 0.55,
    metalness: 0.2,
  }))

  const materialSlots: Record<Slot, Material> = {
    housing: options.materials?.housing ?? kit.graphite,
    lamp: lampOn,
    post: options.materials?.post ?? kit.slate,
  }

  const root = new Group()
  root.name = 'f1-start-lights'
  const gantry = new Group(); gantry.name = 'gantry'
  const panel = new Group(); panel.name = 'panel'
  root.add(gantry, panel)

  const generated: BufferGeometry[] = []
  const meshesBySlot: Record<Slot, Mesh[]> = { housing: [], lamp: [], post: [] }

  const releaseGenerated = (): void => {
    for (const group of [gantry, panel]) group.clear()
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
    const span = 6.4
    const height = 5.8
    const half = span / 2
    const postParts: BufferGeometry[] = []
    for (const sx of [-1, 1] as const) {
      postParts.push(member(
        new Vector3(sx * half, 0, 0),
        new Vector3(sx * half, height, 0),
        0.09,
        10,
      ))
    }
    postParts.push(member(
      new Vector3(-half, height, 0),
      new Vector3(half, height, 0),
      0.08,
      10,
    ))
    emit('post', mergeParts(postParts, 'posts'), gantry, 'posts')

    const box = bevelBox(3.4, 0.95, 0.22, 0.02)
    box.translate(0, height - 0.15, 0.18)
    emit('housing', box, panel, 'housing')

    const cols = 5
    const rows = 4
    for (let c = 0; c < cols; c++) {
      const on = c < config.lit
      for (let r = 0; r < rows; r++) {
        const lamp = new CylinderGeometry(0.09, 0.09, 0.06, 16)
        lamp.rotateX(Math.PI / 2)
        lamp.translate((c - 2) * 0.58, height - 0.15 + (r - 1.5) * 0.2, 0.30)
        emit('lamp', lamp, panel, `lamp-${c}-${r}`, on ? lampOn : lampOff)
      }
    }
  }
  rebuild()

  return {
    root,
    parts: { gantry, panel },
    materials: materialSlots,
    getConfig: () => ({ ...config }),
    configure(patch) {
      if (patch.lit !== undefined) config.lit = Math.min(5, Math.max(0, Math.round(patch.lit)))
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
  return createF1Preview(createModel(), { aspect, target: [0, 4.2, 0], distance: 12, fov: 34 })
}
