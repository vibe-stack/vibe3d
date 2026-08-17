// f1-gun-rack — a tubular A-frame rack holding idle `f1-pit-wheel-gun` instances, sockets down. Depends on
// `f1-pit-wheel-gun` for the individual guns, matching the kit's registry-dependency pattern for props
// composed from other props. Ported from a private racing project's pit-box garage dressing.

import {
  CylinderGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  Vector3,
  type Material,
} from 'three/webgpu'

import { createF1Preview } from '../f1-kit-core/preview.ts'
import { TOKEN, shade } from '../f1-kit-core/palette.ts'
import { taperedTube } from '../f1-kit-core/sculpt.ts'
import { ResourceBag } from '../f1-kit-core/resourceBag.ts'
import { createModel as createGun, type F1PitWheelGunInstance } from '../f1-pit-wheel-gun/model.ts'

export interface F1GunRackConfig {
  /** Number of guns hanging on the rack. */
  count: number
  /** Accent colour passed through to every gun's `accent` slot. */
  accentColor: number
}

export interface F1GunRackOptions extends Partial<F1GunRackConfig> {
  materials?: Partial<Record<'frame', Material>>
}

export interface F1GunRackInstance {
  readonly root: Group
  readonly parts: { frame: Group; guns: Group }
  readonly materials: Readonly<Record<'frame', Material>>
  getConfig(): Readonly<F1GunRackConfig>
  configure(patch: Partial<F1GunRackConfig>): void
  setMaterial(slot: 'frame', material: Material): void
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

  const bag = new ResourceBag()
  const frame = (options.materials?.frame ?? bag.mat(new MeshStandardMaterial({ color: shade(TOKEN.SLATE_650, -0.2), roughness: 0.7, metalness: 0.5 }))) as Material
  const materialSlots: Record<'frame', Material> = { frame }

  const root = new Group()
  root.name = 'f1-gun-rack'
  const frameGroup = new Group(); frameGroup.name = 'frame'
  const gunsGroup = new Group(); gunsGroup.name = 'guns'
  root.add(frameGroup, gunsGroup)

  // Two A-legs + a top rail — static, built once (the frame's size isn't reconfigured, only gun count).
  for (const sx of [-1, 1] as const) {
    const leg = new Mesh(bag.geo(taperedTube([
      new Vector3(sx * (W / 2 + 0.18), 0, 0.16),
      new Vector3(sx * (W / 2), H, 0),
      new Vector3(sx * (W / 2 + 0.18), 0, -0.16),
    ], 0.035, 8)), frame)
    frameGroup.add(leg)
  }
  const rail = new Mesh(bag.geo(new CylinderGeometry(0.035, 0.035, W, 10)), frame)
  rail.rotation.z = Math.PI / 2
  rail.position.y = H
  frameGroup.add(rail)

  // Shared accent material handed to every gun instance, owned here so recolouring the rack recolours
  // every hanging gun in one place.
  const gunAccent = bag.mat(new MeshStandardMaterial({ color: config.accentColor, metalness: 0.2, roughness: 0.5 }))

  let guns: F1PitWheelGunInstance[] = []

  const clearGuns = (): void => {
    for (const gun of guns) gun.dispose()
    guns = []
  }

  const rebuild = (): void => {
    clearGuns()
    const { count } = config
    for (let i = 0; i < count; i++) {
      const gun = createGun({ materials: { accent: gunAccent } })
      const x = (i / Math.max(1, count - 1) - 0.5) * (W * 0.7)
      gun.root.position.set(x, H - 0.12, 0)
      gun.root.rotation.z = -Math.PI / 2 // socket points down, hanging from the rail
      gun.root.scale.setScalar(0.9)
      gunsGroup.add(gun.root)
      guns.push(gun)
    }
  }
  rebuild()

  return {
    root,
    parts: { frame: frameGroup, guns: gunsGroup },
    materials: materialSlots,
    getConfig: () => ({ ...config }),
    configure(patch) {
      if (patch.count !== undefined) config.count = Math.max(1, Math.round(patch.count))
      if (patch.accentColor !== undefined) { config.accentColor = patch.accentColor; gunAccent.color.set(patch.accentColor) }
      rebuild()
    },
    setMaterial(slot, material) {
      materialSlots[slot] = material
      frameGroup.traverse((o) => { if (o instanceof Mesh) o.material = material })
    },
    update(deltaSeconds) {
      for (const gun of guns) gun.update(deltaSeconds)
    },
    dispose() {
      clearGuns()
      bag.dispose()
      root.removeFromParent()
    },
  }
}

export function createPreview({ aspect }: { aspect: number; time?: number }) {
  return createF1Preview(createModel(), { aspect, target: [0, 0.6, 0], distance: 2.89 })
}
