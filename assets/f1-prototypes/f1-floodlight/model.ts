// f1-floodlight — a circuit flood mast: segmented taper, access hardware, articulated rail,
// and a compact 2×2 head of broad Musco TLC-style wedge luminaires.
//
// Datums: 12 m mast (configurable), 0.12→0.28 m segmented taper, 1.45 m head rail, each can
// 0.58 × 0.34 × 0.38 m based on the TLC-LED-550 envelope and pitched down onto the track.

import {
  BufferGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  PlaneGeometry,
  SpotLight,
  Vector3,
  type Material,
} from 'three/webgpu'

import {
  TOKEN,
  acquireF1Materials,
  bevelBox,
  bolt,
  createF1Preview,
  disposeF1Materials,
  groundPad,
  loftRoundedBox,
  member,
  mergeParts,
  AXIS_Y,
  createLampMaterial,
} from '../f1-kit-core/index.ts'

type Slot = 'mast' | 'can' | 'lens'

export interface F1FloodlightConfig {
  height: number
}

export interface F1FloodlightOptions extends Partial<F1FloodlightConfig> {
  materials?: Partial<Record<Slot, Material>>
}

export interface F1FloodlightInstance {
  readonly root: Group
  readonly parts: { mast: Group; head: Group }
  readonly materials: Readonly<Record<Slot, Material>>
  getConfig(): Readonly<F1FloodlightConfig>
  configure(patch: Partial<F1FloodlightConfig>): void
  setMaterial(slot: Slot, material: Material): void
  update(deltaSeconds: number): void
  dispose(): void
}

const defaults: F1FloodlightConfig = { height: 12 }

export function createModel(options: F1FloodlightOptions = {}): F1FloodlightInstance {
  const config: F1FloodlightConfig = { height: Math.max(6, options.height ?? defaults.height) }

  const bundle = acquireF1Materials()
  const kit = bundle.materials
  const extras: Material[] = []
  const own = (material: Material): Material => {
    extras.push(material)
    return material
  }
  const lensMat = options.materials?.lens ?? own(createLampMaterial({
    on: true,
    color: TOKEN.SHELL_050,
    name: 'f1-kit / flood lens',
    intensity: 0.28,
  }))

  const materialSlots: Record<Slot, Material> = {
    mast: options.materials?.mast ?? kit.graphite,
    can: options.materials?.can ?? kit.slate,
    lens: lensMat,
  }

  const root = new Group()
  root.name = 'f1-floodlight'
  const mast = new Group(); mast.name = 'mast'
  const head = new Group(); head.name = 'head'
  root.add(mast, head)

  const generated: BufferGeometry[] = []
  const meshesBySlot: Record<Slot, Mesh[]> = { mast: [], can: [], lens: [] }

  const releaseGenerated = (): void => {
    for (const group of [mast, head]) group.clear()
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
    const { height } = config
    const lowerH = height * 0.56
    const upperH = height - lowerH
    const lowerPole = new CylinderGeometry(0.09, 0.14, lowerH, 16)
    lowerPole.translate(0, lowerH / 2, 0)
    emit('mast', lowerPole, mast, 'lower-pole')
    const upperPole = new CylinderGeometry(0.06, 0.09, upperH, 16)
    upperPole.translate(0, lowerH + upperH / 2, 0)
    emit('mast', upperPole, mast, 'upper-pole')
    const seam = new CylinderGeometry(0.1, 0.1, 0.08, 16)
    seam.translate(0, lowerH, 0)
    emit('mast', seam, mast, 'segment-collar')

    emit('mast', groundPad([0.58, 0.58], [0, 0, 0], 0.07), mast, 'pad')
    const collar = bevelBox(0.3, 0.07, 0.3, 0.01)
    collar.translate(0, 0.1, 0)
    emit('mast', collar, mast, 'base-collar')
    for (const x of [-0.15, 0.15] as const) {
      for (const z of [-0.15, 0.15] as const) {
        emit('mast', bolt([x, 0.14, z], 0.012, 0.016, AXIS_Y), mast, `anchor-${x}-${z}`)
      }
    }

    const door = bevelBox(0.18, 0.42, 0.025, 0.012)
    door.translate(0, 1.05, 0.145)
    emit('mast', door, mast, 'access-door')
    const handle = member(new Vector3(0.055, 1.03, 0.165), new Vector3(0.055, 1.13, 0.165), 0.008, 6)
    emit('mast', handle, mast, 'access-handle')

    const rungs: BufferGeometry[] = []
    const rungN = Math.max(5, Math.round((height - 1.8) / 0.58))
    for (let i = 0; i < rungN; i++) {
      const y = 1.8 + (i / Math.max(1, rungN - 1)) * (height - 2.5)
      rungs.push(member(new Vector3(-0.08, y, 0.1), new Vector3(0.08, y, 0.1), 0.009, 6))
    }
    emit('mast', mergeParts(rungs, 'ladder'), mast, 'ladder')

    const yoke = bevelBox(1.45, 0.12, 0.16, 0.018)
    yoke.translate(0, height - 0.08, 0)
    emit('can', yoke, head, 'yoke')
    emit('can', member(new Vector3(0, height - 0.28, 0), new Vector3(0, height, 0.03), 0.035, 10), head, 'pivot')

    const cans: BufferGeometry[] = []
    const details: BufferGeometry[] = []
    const lenses: BufferGeometry[] = []
    const mounts: BufferGeometry[] = []
    const tilt = 0.42
    const lampPositions = [
      [-0.36, 0.23],
      [0.36, 0.23],
      [-0.36, -0.23],
      [0.36, -0.23],
    ] as const
    const placeOnCan = (geo: BufferGeometry, sx: number, cy: number): BufferGeometry => {
      geo.rotateX(tilt)
      geo.translate(sx, cy, 0.34)
      return geo
    }
    for (const [sx, sy] of lampPositions) {
      const cy = height - 0.08 + sy
      const can = loftRoundedBox(0.58, 0.34, 0.38, 0.055)
      const canPosition = can.getAttribute('position')
      for (let i = 0; i < canPosition.count; i++) {
        const t = canPosition.getZ(i) / 0.38 + 0.5
        const scale = 0.72 + Math.min(1, Math.max(0, t)) * 0.28
        canPosition.setX(i, canPosition.getX(i) * scale)
        canPosition.setY(i, canPosition.getY(i) * scale)
      }
      canPosition.needsUpdate = true
      can.computeVertexNormals()
      cans.push(placeOnCan(can, sx, cy))

      const driver = bevelBox(0.28, 0.18, 0.13, 0.025)
      driver.translate(0, 0, -0.23)
      details.push(placeOnCan(driver, sx, cy))
      const visor = bevelBox(0.6, 0.022, 0.16, 0.004)
      visor.rotateX(-0.18)
      visor.translate(0, 0.18, 0.16)
      details.push(placeOnCan(visor, sx, cy))
      for (const edgeY of [-0.13, 0.13] as const) {
        const seam = bevelBox(0.5, 0.012, 0.012, 0.002)
        seam.translate(0, edgeY, 0.196)
        details.push(placeOnCan(seam, sx, cy))
      }
      for (const edgeX of [-0.25, 0.25] as const) {
        const seam = bevelBox(0.012, 0.25, 0.012, 0.002)
        seam.translate(edgeX, 0, 0.196)
        details.push(placeOnCan(seam, sx, cy))
      }

      const lens = new PlaneGeometry(0.46, 0.22)
      lens.translate(0, 0, 0.225)
      lenses.push(placeOnCan(lens, sx, cy))
      mounts.push(member(
        new Vector3(sx, height - 0.08, 0.04),
        new Vector3(sx, cy, 0.16),
        0.018,
        8,
      ))
      mounts.push(bolt([sx, height - 0.08, 0.08], 0.014, 0.024, AXIS_Y))
    }
    emit('can', mergeParts(cans, 'cans'), head, 'cans')
    emit('can', mergeParts(details, 'drivers-and-seams'), head, 'drivers-and-seams')
    emit('can', mergeParts(mounts, 'articulated-mounts'), head, 'articulated-mounts')
    emit('lens', mergeParts(lenses, 'lenses'), head, 'lenses')
    for (const [sx, sy] of lampPositions) {
      const cy = height - 0.08 + sy
      const spot = new SpotLight(0xfff3e0, 7, 14, Math.PI / 5, 0.45, 1.8)
      spot.name = `spot-${sx}-${sy}`
      const origin = new Vector3(sx, cy, 0.34)
      const aim = new Vector3(0, -Math.sin(tilt), Math.cos(tilt))
      spot.position.copy(origin).addScaledVector(aim, 0.22)
      spot.target.position.copy(spot.position).addScaledVector(aim, 10)
      head.add(spot)
      head.add(spot.target)
    }
  }
  rebuild()

  return {
    root,
    parts: { mast, head },
    materials: materialSlots,
    getConfig: () => ({ ...config }),
    configure(patch) {
      if (patch.height !== undefined) config.height = Math.max(6, patch.height)
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
  const model = createModel({ height: 6 })
  return createF1Preview(model, {
    aspect,
    target: [0, 3.2, 0.2],
    distance: 11,
    fov: 34,
    yaw: 0.58,
    pitch: 0.03,
    ground: true,
    bloom: true,
  })
}
