// f1-gun-rack — a tubular A-frame rack holding idle `f1-tyre-gun` instances, sockets down. Depends
// on `f1-tyre-gun` for the individual guns, matching the kit's registry-dependency pattern for
// props composed from other props. One shared gun material set is owned here so recolouring the rack
// recolours every hanging gun.

import {
  BufferGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  Vector3,
  type Material,
} from 'three/webgpu'

import {
  AXIS_X,
  acquireF1Materials,
  createF1Preview,
  disposeF1Materials,
  groundPad,
  mergeParts,
  taperedTube,
  tubeSection,
} from '../f1-kit-core/index.ts'
import { createModel as createGun, type F1TyreGunInstance } from '../f1-tyre-gun/model.ts'

type Slot = 'frame'

export interface F1GunRackConfig {
  /** Number of guns hanging on the rack. */
  count: number
  /** Accent colour passed through to every gun's `accent` slot. */
  accentColor: number
}

export interface F1GunRackOptions extends Partial<F1GunRackConfig> {
  materials?: Partial<Record<Slot, Material>>
}

export interface F1GunRackInstance {
  readonly root: Group
  readonly parts: { frame: Group; guns: Group }
  readonly materials: Readonly<Record<Slot, Material>>
  getConfig(): Readonly<F1GunRackConfig>
  configure(patch: Partial<F1GunRackConfig>): void
  setMaterial(slot: Slot, material: Material): void
  update(deltaSeconds: number): void
  dispose(): void
}

const defaults: F1GunRackConfig = { count: 3, accentColor: 0xff5a1f }

const W = 1.4
const H = 1.05

export function createModel(options: F1GunRackOptions = {}): F1GunRackInstance {
  const config: F1GunRackConfig = {
    count: Math.max(1, Math.round(options.count ?? defaults.count)),
    accentColor: options.accentColor ?? defaults.accentColor,
  }

  const bundle = acquireF1Materials()
  const kit = bundle.materials
  const extras: Material[] = []
  const own = (material: Material): Material => {
    extras.push(material)
    return material
  }
  const materialSlots: Record<Slot, Material> = {
    frame: options.materials?.frame ?? kit.slate,
  }
  const gunAccent = own(kit.orange.clone()) as MeshStandardMaterial
  gunAccent.color.set(config.accentColor)
  const gunMaterials = {
    gunmetal: kit.slate,
    steel: kit.steel,
    gripRubber: kit.ink,
    accent: gunAccent,
    led: kit.cyan,
  }

  const root = new Group()
  root.name = 'f1-gun-rack'
  const frameGroup = new Group(); frameGroup.name = 'frame'
  const gunsGroup = new Group(); gunsGroup.name = 'guns'
  root.add(frameGroup, gunsGroup)

  const generated: BufferGeometry[] = []
  const meshesBySlot: Record<Slot, Mesh[]> = { frame: [] }
  let guns: F1TyreGunInstance[] = []

  const releaseFrame = (): void => {
    frameGroup.clear()
    for (const geometry of generated) geometry.dispose()
    generated.length = 0
    meshesBySlot.frame.length = 0
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

  const buildFrame = (): void => {
    releaseFrame()
    const parts: BufferGeometry[] = []
    for (const sx of [-1, 1] as const) {
      parts.push(taperedTube([
        new Vector3(sx * (W / 2 + 0.18), 0.02, 0.16),
        new Vector3(sx * (W / 2), H, 0),
        new Vector3(sx * (W / 2 + 0.18), 0.02, -0.16),
      ], 0.035, 8))
      parts.push(groundPad([0.12, 0.10], [sx * (W / 2 + 0.18), 0, 0.16], 0.024))
      parts.push(groundPad([0.12, 0.10], [sx * (W / 2 + 0.18), 0, -0.16], 0.024))
    }
    parts.push(tubeSection(0.035, W, [0, H, 0], AXIS_X, 10))
    emit('frame', mergeParts(parts, 'frame'), frameGroup, 'frame')
  }

  const clearGuns = (): void => {
    for (const gun of guns) gun.dispose()
    guns = []
  }

  const rebuild = (): void => {
    clearGuns()
    const { count } = config
    for (let i = 0; i < count; i++) {
      const gun = createGun({ materials: gunMaterials })
      const x = count <= 1 ? 0 : (i / (count - 1) - 0.5) * (W * 0.7)
      gun.root.position.set(x, H - 0.12, 0)
      gun.root.rotation.z = -Math.PI / 2
      gun.root.scale.setScalar(0.9)
      gunsGroup.add(gun.root)
      guns.push(gun)
    }
  }
  buildFrame()
  rebuild()

  return {
    root,
    parts: { frame: frameGroup, guns: gunsGroup },
    materials: materialSlots,
    getConfig: () => ({ ...config }),
    configure(patch) {
      if (patch.count !== undefined) config.count = Math.max(1, Math.round(patch.count))
      if (patch.accentColor !== undefined) {
        config.accentColor = patch.accentColor
        gunAccent.color.set(patch.accentColor)
      }
      rebuild()
    },
    setMaterial(slot, material) {
      materialSlots[slot] = material
      for (const mesh of meshesBySlot[slot]) mesh.material = material
    },
    update(deltaSeconds) {
      for (const gun of guns) gun.update(deltaSeconds)
    },
    dispose() {
      clearGuns()
      releaseFrame()
      disposeF1Materials(bundle)
      for (const material of extras) material.dispose()
      root.removeFromParent()
    },
  }
}

export function createPreview({ aspect }: { aspect: number; time?: number }) {
  return createF1Preview(createModel(), { aspect, target: [0, 0.6, 0], distance: 2.89 })
}
