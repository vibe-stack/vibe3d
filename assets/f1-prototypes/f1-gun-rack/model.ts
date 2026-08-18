// f1-gun-rack — a compact wheeled cradle holding idle `f1-tyre-gun` instances horizontally. Depends
// on `f1-tyre-gun` for the individual guns, matching the kit's registry-dependency pattern for
// props composed from other props. One shared gun material set is owned here so recolouring the rack
// recolours every staged gun.

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
  AXIS_X,
  TOKEN,
  acquireF1Materials,
  bevelBox,
  createF1Preview,
  disposeF1Materials,
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

const defaults: F1GunRackConfig = { count: 3, accentColor: TOKEN.ORANGE_500 }

const W = 0.92
const H = 0.34
const DEPTH = 0.58

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
    frame: options.materials?.frame ?? kit.steel,
  }
  const gunAccent = own(kit.orange.clone()) as MeshStandardMaterial
  gunAccent.color.set(config.accentColor)
  const gunMaterials = {
    gunmetal: kit.red,
    steel: kit.graphite,
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
    const halfW = W / 2
    const halfD = DEPTH / 2
    for (const z of [-halfD, halfD]) {
      parts.push(tubeSection(0.025, W, [0, 0.16, z], AXIS_X, 10))
    }
    for (const x of [-halfW, halfW]) {
      parts.push(tubeSection(0.025, DEPTH, [x, 0.16, 0], [0, 0, 1], 10))
      for (const z of [-halfD, halfD]) {
        parts.push(taperedTube([
          new Vector3(x, 0.16, z),
          new Vector3(x, H, z),
        ], 0.024, 8))
      }
    }
    for (const x of [-0.27, 0.27]) {
      parts.push(tubeSection(0.022, DEPTH, [x, H, 0], [0, 0, 1], 10))
    }
    parts.push(taperedTube([
      new Vector3(-halfW, 0.16, -halfD),
      new Vector3(-halfW - 0.1, 0.58, -halfD),
      new Vector3(-halfW - 0.1, 0.58, halfD),
      new Vector3(-halfW, 0.16, halfD),
    ], 0.024, 10))
    emit('frame', mergeParts(parts, 'frame'), frameGroup, 'frame')

    const wheelParts: BufferGeometry[] = []
    for (const sx of [-1, 1] as const) {
      for (const sz of [-1, 1] as const) {
        const wheel = new CylinderGeometry(0.07, 0.07, 0.038, 14)
        wheel.rotateZ(Math.PI / 2)
        wheel.translate(sx * (halfW - 0.04), 0.07, sz * halfD)
        wheelParts.push(wheel)
      }
    }
    const wheelGeometry = mergeParts(wheelParts, 'wheels')
    generated.push(wheelGeometry)
    const wheels = new Mesh(wheelGeometry, kit.ink)
    wheels.name = 'wheels'
    frameGroup.add(wheels)

    const padParts: BufferGeometry[] = []
    for (const x of [-0.27, 0.27]) {
      const pad = bevelBox(0.075, 0.028, DEPTH * 0.76, 0.01)
      pad.translate(x, H + 0.046, 0)
      padParts.push(pad)
    }
    const padGeometry = mergeParts(padParts, 'retention-pads')
    generated.push(padGeometry)
    const pads = new Mesh(padGeometry, kit.fabric)
    pads.name = 'retention-pads'
    frameGroup.add(pads)

    const hoseParts: BufferGeometry[] = []
    for (const side of [-1, 1] as const) {
      const points: Vector3[] = []
      for (let i = 0; i <= 18; i++) {
        const angle = (i / 6) * Math.PI * 2
        points.push(new Vector3(-halfW - 0.08 + i * 0.006, 0.29 + Math.cos(angle) * 0.085, side * 0.15 + Math.sin(angle) * 0.085))
      }
      hoseParts.push(taperedTube(points, 0.011, 8))
    }
    const hoseGeometry = mergeParts(hoseParts, 'hose-coils')
    generated.push(hoseGeometry)
    const hoses = new Mesh(hoseGeometry, kit.ink)
    hoses.name = 'hose-coils'
    frameGroup.add(hoses)
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
      const z = count <= 1 ? 0 : (i / (count - 1) - 0.5) * (DEPTH * 0.62)
      gun.root.position.set(0, H + 0.15, z)
      gun.root.rotation.y = i % 2 === 0 ? 0 : 0.035
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
  return createF1Preview(createModel(), { aspect, target: [0, 0.3, 0], distance: 2.25, yaw: -0.58, pitch: 0.32 })
}
