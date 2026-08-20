// f1-service-truck — EU 96/53 cab-over rigid. Assemble cab / chassis / cargo / wheels;
// hang a wrap with setMaterial('livery', …). Static VibeModel, not a drivetrain.

import {
  BufferGeometry,
  CylinderGeometry,
  DataTexture,
  Group,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  type Material,
} from 'three/webgpu'

import {
  LAYER_CLEARANCE,
  TRUCK,
  acquireF1Materials,
  bevelBox,
  createF1Preview,
  disposeF1Materials,
  fasciaTexture,
  isFasciaStyle,
  isTruckKind,
  loftAlongX,
  loftRoundedBox,
  mergeParts,
  type FasciaStyle,
  type TruckKind,
} from '../f1-kit-core/index.ts'

type Slot = 'cab' | 'chassis' | 'cargo' | 'wheels' | 'livery'

export interface F1ServiceTruckConfig {
  kind: TruckKind
  wheelbase: number
  boxLength: number
  axles: number
  livery: FasciaStyle
}

export interface F1ServiceTruckOptions extends Partial<F1ServiceTruckConfig> {
  materials?: Partial<Record<Slot, Material>>
}

export interface F1ServiceTruckInstance {
  readonly root: Group
  readonly parts: { cab: Group; chassis: Group; cargo: Group; wheels: Group; fascia: Group }
  readonly materials: Readonly<Record<Slot, Material>>
  getConfig(): Readonly<F1ServiceTruckConfig>
  configure(patch: Partial<F1ServiceTruckConfig>): void
  setMaterial(slot: Slot, material: Material): void
  update(deltaSeconds: number): void
  dispose(): void
}

const CAB = TRUCK.cab
const WIDTH = TRUCK.width
const HEIGHT = TRUCK.height
const TYRE = TRUCK.tyreOd
const GAP = TRUCK.gap
const MAX_LEN = TRUCK.length

const defaults: F1ServiceTruckConfig = {
  kind: 'box',
  wheelbase: TRUCK.wheelbase,
  boxLength: TRUCK.boxLength,
  axles: TRUCK.axles,
  livery: 'stamp',
}

function cabProfile(): Array<readonly [number, number]> {
  const half = CAB / 2
  return [
    [-half, 0.42],
    [-half, 3.05],
    [half - 1.05, 3.05],
    [half - 0.22, 1.75],
    [half, 1.35],
    [half, 0.42],
  ]
}

function clampConfig(config: F1ServiceTruckConfig): void {
  config.kind = isTruckKind(config.kind) ? config.kind : 'box'
  config.axles = config.axles >= 3 ? 3 : 2
  const maxBox = MAX_LEN - CAB - GAP
  config.boxLength = Math.min(maxBox, Math.max(5.0, config.boxLength))
  const overall = CAB + GAP + config.boxLength
  const maxWb = Math.max(3.5, overall - 2.4)
  config.wheelbase = Math.min(maxWb, Math.max(3.5, config.wheelbase))
  config.livery = isFasciaStyle(config.livery) ? config.livery : 'stamp'
}

export function createModel(options: F1ServiceTruckOptions = {}): F1ServiceTruckInstance {
  const config: F1ServiceTruckConfig = {
    kind: options.kind ?? defaults.kind,
    wheelbase: options.wheelbase ?? defaults.wheelbase,
    boxLength: options.boxLength ?? defaults.boxLength,
    axles: options.axles ?? defaults.axles,
    livery: options.livery ?? defaults.livery,
  }
  clampConfig(config)

  const bundle = acquireF1Materials()
  const kit = bundle.materials
  const extras: Material[] = []
  const textures: DataTexture[] = []
  let ownsLivery = options.materials?.livery === undefined
  const materialSlots: Record<Slot, Material> = {
    cab: options.materials?.cab ?? kit.shell,
    chassis: options.materials?.chassis ?? kit.graphite,
    cargo: options.materials?.cargo ?? kit.slate,
    wheels: options.materials?.wheels ?? kit.ink,
    livery: options.materials?.livery ?? kit.shell,
  }

  const root = new Group(); root.name = 'f1-service-truck'
  const cab = new Group(); cab.name = 'cab'
  const chassis = new Group(); chassis.name = 'chassis'
  const cargo = new Group(); cargo.name = 'cargo'
  const wheels = new Group(); wheels.name = 'wheels'
  const fascia = new Group(); fascia.name = 'fascia'
  root.add(cab, chassis, cargo, wheels, fascia)

  const generated: BufferGeometry[] = []
  const meshesBySlot: Record<Slot, Mesh[]> = {
    cab: [], chassis: [], cargo: [], wheels: [], livery: [],
  }

  const releaseOwnedLivery = (): void => {
    for (const texture of textures) texture.dispose()
    textures.length = 0
    for (const material of extras) material.dispose()
    extras.length = 0
  }

  const releaseGenerated = (): void => {
    cab.clear(); chassis.clear(); cargo.clear(); wheels.clear(); fascia.clear()
    for (const geometry of generated) geometry.dispose()
    generated.length = 0
    for (const slot of Object.keys(meshesBySlot) as Slot[]) meshesBySlot[slot].length = 0
    if (ownsLivery) releaseOwnedLivery()
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
    const boxLen = config.boxLength
    const overall = CAB + GAP + boxLen
    const cabX = -overall / 2 + CAB / 2
    const boxX = -overall / 2 + CAB + GAP + boxLen / 2
    const boxH = HEIGHT - 0.42
    const tyreR = TYRE / 2

    const cabBody = loftAlongX(cabProfile(), WIDTH - 0.08, { closed: true, stations: 5 })
    cabBody.rotateY(-Math.PI / 2)
    cabBody.translate(cabX, 0, 0)
    emit('cab', cabBody, cab, 'body')

    const glass = bevelBox(0.04, 1.15, WIDTH - 0.35, 0.006)
    glass.translate(cabX + CAB / 2 - 0.28, 2.15, 0)
    emit('cab', glass, cab, 'glass', kit.cyan)

    const visor = bevelBox(0.55, 0.08, WIDTH - 0.12, 0.008)
    visor.translate(cabX + CAB / 2 - 0.55, 3.12, 0)
    emit('cab', visor, cab, 'visor')

    for (const sz of [-1, 1] as const) {
      const arm = bevelBox(0.06, 0.04, 0.28, 0.004)
      arm.translate(cabX + 0.35, 2.05, sz * (WIDTH / 2 + 0.12))
      emit('cab', arm, cab, `mirror-arm-${sz}`)
      const glassM = bevelBox(0.18, 0.28, 0.06, 0.004)
      glassM.translate(cabX + 0.35, 2.05, sz * (WIDTH / 2 + 0.32))
      emit('cab', glassM, cab, `mirror-${sz}`)
    }

    const rail = bevelBox(overall - 0.4, 0.18, 0.22, 0.01)
    rail.translate(0, 0.55, 0)
    emit('chassis', rail, chassis, 'rail')
    const bumper = bevelBox(0.28, 0.32, WIDTH - 0.2, 0.01)
    bumper.translate(-overall / 2 + 0.16, 0.58, 0)
    emit('chassis', bumper, chassis, 'bumper')
    const lift = bevelBox(0.85, 0.08, WIDTH - 0.35, 0.008)
    lift.translate(overall / 2 - 0.43, 0.72, 0)
    emit('chassis', lift, chassis, 'tail-lift')

    const cargoH = config.kind === 'reefer' ? boxH : boxH - 0.08
    const cargoBox = loftRoundedBox(boxLen, cargoH, WIDTH - 0.06, 0.07)
    cargoBox.translate(boxX, 0.42 + cargoH / 2, 0)
    emit('cargo', cargoBox, cargo, 'box')

    if (config.kind === 'curtainside') {
      const ribs: BufferGeometry[] = []
      const count = Math.max(6, Math.round(boxLen / 1.1))
      for (let i = 0; i < count; i++) {
        const x = boxX - boxLen / 2 + (i + 0.5) * (boxLen / count)
        for (const sz of [-1, 1] as const) {
          const rib = bevelBox(0.05, cargoH - 0.2, 0.04, 0.004)
          rib.translate(x, 0.42 + cargoH / 2, sz * (WIDTH / 2 - 0.02))
          ribs.push(rib)
        }
      }
      emit('cargo', mergeParts(ribs, 'ribs'), cargo, 'ribs')
    }
    if (config.kind === 'reefer') {
      const unit = loftRoundedBox(1.4, 0.45, 0.85, 0.05)
      unit.translate(boxX - boxLen / 2 + 0.9, HEIGHT + 0.08, 0)
      emit('cargo', unit, cargo, 'reefer-unit')
    }

    const axleXs: number[] = []
    const frontX = -overall / 2 + CAB * 0.55
    axleXs.push(frontX)
    if (config.axles === 2) {
      axleXs.push(frontX + config.wheelbase)
    } else {
      const rear = frontX + config.wheelbase
      axleXs.push(rear - 1.35, rear)
    }
    for (let a = 0; a < axleXs.length; a++) {
      const x = axleXs[a]!
      const axle = new CylinderGeometry(0.06, 0.06, WIDTH - 0.3, 10)
      axle.rotateX(Math.PI / 2)
      axle.translate(x, tyreR, 0)
      emit('chassis', axle, chassis, `axle-${a}`)
      for (const sz of [-1, 1] as const) {
        const tyre = new CylinderGeometry(tyreR, tyreR, 0.32, 20)
        tyre.rotateX(Math.PI / 2)
        tyre.translate(x, tyreR, sz * (WIDTH / 2 - 0.22))
        emit('wheels', tyre, wheels, `tyre-${a}-${sz}`)
        const rim = new CylinderGeometry(tyreR * 0.52, tyreR * 0.52, 0.22, 16)
        rim.rotateX(Math.PI / 2)
        rim.translate(x, tyreR, sz * (WIDTH / 2 - 0.22))
        emit('wheels', rim, wheels, `rim-${a}-${sz}`, kit.steel)
      }
    }

    const side = new PlaneGeometry(boxLen - 0.4, cargoH - 0.5)
    side.translate(boxX, 0.42 + cargoH / 2, WIDTH / 2 + LAYER_CLEARANCE * 3)
    const rear = new PlaneGeometry(WIDTH - 0.4, cargoH - 0.5)
    rear.rotateY(Math.PI / 2)
    rear.translate(overall / 2 + LAYER_CLEARANCE * 3, 0.42 + cargoH / 2, 0)
    if (ownsLivery) {
      const tex = fasciaTexture({
        number: '12',
        legend: 'LOGISTICS',
        style: config.livery,
      })
      textures.push(tex)
      const mat = new MeshStandardMaterial({
        name: 'f1-kit / truck livery',
        map: tex,
        roughness: 0.55,
        metalness: 0.05,
      })
      extras.push(mat)
      emit('livery', side, fascia, 'side', mat)
      emit('livery', rear, fascia, 'rear', mat)
    } else {
      emit('livery', side, fascia, 'side')
      emit('livery', rear, fascia, 'rear')
    }
  }
  rebuild()

  return {
    root,
    parts: { cab, chassis, cargo, wheels, fascia },
    materials: materialSlots,
    getConfig: () => ({ ...config }),
    configure(patch) {
      if (patch.kind !== undefined) config.kind = patch.kind
      if (patch.wheelbase !== undefined) config.wheelbase = patch.wheelbase
      if (patch.boxLength !== undefined) config.boxLength = patch.boxLength
      if (patch.axles !== undefined) config.axles = patch.axles
      if (patch.livery !== undefined) config.livery = patch.livery
      clampConfig(config)
      rebuild()
    },
    setMaterial(slot, material) {
      if (slot === 'livery' && ownsLivery) {
        releaseOwnedLivery()
        ownsLivery = false
      }
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
  return createF1Preview(createModel({ kind: 'box', axles: 2 }), {
    aspect,
    target: [0, 1.8, 0],
    distance: 32,
    fov: 32,
    yaw: -0.72,
    pitch: 0.12,
  })
}
