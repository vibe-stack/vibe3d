// f1-service-truck — DAF XG+ high-roof cab-over + aero box trailer.
// EU 96/53 artic ≤ 16.50 m. Unbranded: no DAF / Cadillac / Tesla marks.
// Wheels live on axle hubs (configure({ wheelRpm }) + update). Lamps are a slot
// (configure({ lamps }) / setMaterial('lamps', shader)).

import { LoftGeometry } from 'three/examples/jsm/geometries/LoftGeometry.js'
import {
  BufferGeometry,
  CylinderGeometry,
  DataTexture,
  DirectionalLight,
  FrontSide,
  Group,
  Mesh,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  Vector3,
  type Material,
} from 'three/webgpu'

import {
  DRIVER,
  LAYER_CLEARANCE,
  TRUCK,
  acquireF1Materials,
  bevelBox,
  bevelPrism,
  createF1Preview,
  createLampMaterial,
  disposeF1Materials,
  isFasciaStyle,
  isTruckKind,
  loftRoundedBox,
  member,
  mergeParts,
  truckLiveryTexture,
  type FasciaStyle,
  type TruckKind,
} from '../f1-kit-core/index.ts'

type Slot = 'cab' | 'glass' | 'lamps' | 'chassis' | 'cargo' | 'wheels' | 'livery'

export interface F1ServiceTruckConfig {
  kind: TruckKind
  wheelbase: number
  boxLength: number
  axles: number
  livery: FasciaStyle
  lamps: boolean
  wheelRpm: number
}

export interface F1ServiceTruckOptions extends Partial<F1ServiceTruckConfig> {
  materials?: Partial<Record<Slot, Material>>
}

export interface F1ServiceTruckInstance {
  readonly root: Group
  readonly parts: {
    cab: Group
    chassis: Group
    cargo: Group
    wheels: Group
    fascia: Group
    lamps: Group
  }
  readonly materials: Readonly<Record<Slot, Material>>
  getConfig(): Readonly<F1ServiceTruckConfig>
  configure(patch: Partial<F1ServiceTruckConfig>): void
  setMaterial(slot: Slot, material: Material): void
  update(deltaSeconds: number): void
  dispose(): void
}

const TRACTOR = TRUCK.tractor
const CAB_LEN = TRUCK.cab
const WIDTH = TRUCK.width
const HEIGHT = TRUCK.height
const TYRE = TRUCK.tyreOd
const GAP = TRUCK.gap
const MAX_LEN = TRUCK.length
const CLEAR = LAYER_CLEARANCE * 3

const defaults: F1ServiceTruckConfig = {
  kind: 'box',
  wheelbase: TRUCK.wheelbase,
  boxLength: TRUCK.boxLength,
  axles: TRUCK.axles,
  livery: 'stamp',
  lamps: true,
  wheelRpm: 0,
}

/** Rounded-rect ring in YZ at X — same width at belt and roof (not a Semi teardrop). */
function boxRing(
  x: number,
  yBot: number,
  yTop: number,
  width: number,
  radius: number,
): Vector3[] {
  const h = yTop - yBot
  const r = Math.min(radius, width / 2 - 1e-4, h * 0.18)
  const hz = width / 2
  const seg = 6
  const pts: Vector3[] = []
  const corner = (cz: number, cy: number, a0: number, rad: number): void => {
    for (let j = 0; j <= seg; j++) {
      const a = a0 + (j / seg) * (Math.PI / 2)
      pts.push(new Vector3(x, cy + rad * Math.sin(a), cz + rad * Math.cos(a)))
    }
  }
  corner(hz - r, yBot + r, -Math.PI / 2, r)
  corner(hz - r, yTop - r, 0, r)
  corner(-(hz - r), yTop - r, Math.PI / 2, r)
  corner(-(hz - r), yBot + r, Math.PI, r)
  pts.reverse()
  return pts
}

function clampConfig(config: F1ServiceTruckConfig): void {
  config.kind = isTruckKind(config.kind) ? config.kind : 'box'
  config.axles = config.axles >= 3 ? 3 : 2
  const maxBox = MAX_LEN - TRACTOR - GAP
  config.boxLength = Math.min(maxBox, Math.max(6.0, config.boxLength))
  config.wheelbase = Math.min(4.2, Math.max(3.2, config.wheelbase))
  config.livery = isFasciaStyle(config.livery) ? config.livery : 'stamp'
  config.lamps = Boolean(config.lamps)
  config.wheelRpm = Math.max(0, config.wheelRpm)
}

export function createModel(options: F1ServiceTruckOptions = {}): F1ServiceTruckInstance {
  const config: F1ServiceTruckConfig = {
    kind: options.kind ?? defaults.kind,
    wheelbase: options.wheelbase ?? defaults.wheelbase,
    boxLength: options.boxLength ?? defaults.boxLength,
    axles: options.axles ?? defaults.axles,
    livery: options.livery ?? defaults.livery,
    lamps: options.lamps ?? defaults.lamps,
    wheelRpm: options.wheelRpm ?? defaults.wheelRpm,
  }
  clampConfig(config)

  const bundle = acquireF1Materials()
  const kit = bundle.materials
  const extras: Material[] = []
  const owned: Material[] = []
  const textures: DataTexture[] = []
  let ownsLivery = options.materials?.livery === undefined
  const ownsCab = options.materials?.cab === undefined
  const cabPaint = options.materials?.cab ?? new MeshPhysicalMaterial({
    name: 'f1-kit / cab paint',
    color: 0x0a0a0c,
    metalness: 0.28,
    roughness: 0.22,
    clearcoat: 1,
    clearcoatRoughness: 0.08,
    side: FrontSide,
  })
  if (ownsCab) owned.push(cabPaint)
  const glassMat = options.materials?.glass ?? new MeshPhysicalMaterial({
    name: 'f1-kit / cab glass',
    color: 0x5a6a78,
    metalness: 0.38,
    roughness: 0.04,
    clearcoat: 0.55,
    clearcoatRoughness: 0.06,
    side: FrontSide,
  })
  if (options.materials?.glass === undefined) owned.push(glassMat)
  const chrome = new MeshPhysicalMaterial({
    name: 'f1-kit / cab chrome',
    color: 0xc4ccd4,
    metalness: 0.94,
    roughness: 0.12,
    clearcoat: 0.5,
    clearcoatRoughness: 0.06,
    side: FrontSide,
  })
  owned.push(chrome)
  const bumperMat = new MeshStandardMaterial({
    name: 'f1-kit / cab bumper',
    color: 0x121416,
    roughness: 0.62,
    metalness: 0.08,
    side: FrontSide,
  })
  owned.push(bumperMat)
  const lampOn = options.materials?.lamps ?? createLampMaterial({
    on: true,
    color: 0xeef4ff,
    intensity: 5.4,
    name: 'f1-kit / cab lamp on',
  })
  const lampOff = createLampMaterial({
    on: false,
    color: 0xeef4ff,
    name: 'f1-kit / cab lamp off',
  })
  const amberOn = createLampMaterial({
    on: true,
    color: 0xffaa33,
    intensity: 4.2,
    name: 'f1-kit / marker on',
  })
  const amberOff = createLampMaterial({
    on: false,
    color: 0xffaa33,
    name: 'f1-kit / marker off',
  })
  if (options.materials?.lamps === undefined) owned.push(lampOn)
  owned.push(lampOff, amberOn, amberOff)
  const materialSlots: Record<Slot, Material> = {
    cab: cabPaint,
    glass: glassMat,
    lamps: lampOn,
    chassis: options.materials?.chassis ?? kit.graphite,
    cargo: options.materials?.cargo ?? cabPaint,
    wheels: options.materials?.wheels ?? kit.ink,
    livery: options.materials?.livery ?? kit.shell,
  }

  const root = new Group(); root.name = 'f1-service-truck'
  const cab = new Group(); cab.name = 'cab'
  const chassis = new Group(); chassis.name = 'chassis'
  const cargo = new Group(); cargo.name = 'cargo'
  const wheels = new Group(); wheels.name = 'wheels'
  const fascia = new Group(); fascia.name = 'fascia'
  const lamps = new Group(); lamps.name = 'lamps'
  root.add(cab, chassis, cargo, wheels, fascia, lamps)

  const generated: BufferGeometry[] = []
  const meshesBySlot: Record<Slot, Mesh[]> = {
    cab: [], glass: [], lamps: [], chassis: [], cargo: [], wheels: [], livery: [],
  }
  const amberMeshes: Mesh[] = []
  const hubs: Group[] = []
  let spin = 0

  const releaseOwnedLivery = (): void => {
    for (const texture of textures) texture.dispose()
    textures.length = 0
    for (const material of extras) material.dispose()
    extras.length = 0
  }

  const releaseGenerated = (): void => {
    cab.clear(); chassis.clear(); cargo.clear(); wheels.clear(); fascia.clear(); lamps.clear()
    hubs.length = 0
    amberMeshes.length = 0
    for (const geometry of generated) geometry.dispose()
    generated.length = 0
    for (const slot of Object.keys(meshesBySlot) as Slot[]) meshesBySlot[slot].length = 0
    if (ownsLivery) releaseOwnedLivery()
  }

  const emit = (
    slot: Slot,
    geometry: BufferGeometry,
    group: Group,
    name: string,
    material?: Material,
  ): Mesh => {
    generated.push(geometry)
    const mesh = new Mesh(geometry, material ?? materialSlots[slot])
    mesh.name = name
    mesh.castShadow = true
    mesh.receiveShadow = true
    meshesBySlot[slot].push(mesh)
    group.add(mesh)
    return mesh
  }

  const emitAmber = (geometry: BufferGeometry, name: string): void => {
    const mesh = emit('lamps', geometry, lamps, name, amberOn)
    amberMeshes.push(mesh)
  }

  const applySpin = (): void => {
    for (const hub of hubs) hub.rotation.z = spin
  }

  const applyLamps = (): void => {
    const white = config.lamps ? materialSlots.lamps : lampOff
    const amber = config.lamps ? amberOn : amberOff
    for (const mesh of meshesBySlot.lamps) {
      mesh.material = amberMeshes.includes(mesh) ? amber : white
    }
  }

  const rebuild = (): void => {
    releaseGenerated()
    const boxLen = config.boxLength
    const overall = TRACTOR + GAP + boxLen
    const nose = -overall / 2
    const cabX0 = nose
    const cabX1 = nose + CAB_LEN
    const fifth = nose + TRACTOR
    const boxX0 = fifth + GAP
    const boxX1 = boxX0 + boxLen
    const boxX = boxX0 + boxLen / 2
    const tyreR = TYRE / 2
    const steerX = nose + 1.38
    const driveX = steerX + config.wheelbase
    const trailerAxles = config.axles
    const bogie0 = overall / 2 - 1.02 - (trailerAxles - 1) * 1.32
    const axleXs = [steerX, driveX]
    for (let i = 0; i < trailerAxles; i++) axleXs.push(bogie0 + i * 1.32)
    const yFloor = 0.98
    const yBelt = 1.86
    const yRoof = HEIGHT - 0.02
    const hz = WIDTH / 2

    // Pinched, raked Super Space Cab: face narrower than body, glass top aft of the belt.
    const cabBody = new LoftGeometry(
      [
        boxRing(cabX0 + 0.10, yFloor, yBelt + 0.08, WIDTH - 0.62, 0.12),
        boxRing(cabX0 + 0.20, yFloor - 0.02, yRoof - 0.28, WIDTH - 0.46, 0.16),
        boxRing(cabX0 + 0.32, yFloor - 0.06, yRoof - 0.10, WIDTH - 0.28, 0.20),
        boxRing(cabX0 + 0.48, yFloor - 0.10, HEIGHT - 0.04, WIDTH - 0.12, 0.24),
        boxRing(cabX0 + 0.72, yFloor - 0.10, HEIGHT, WIDTH, 0.24),
        boxRing(cabX0 + 1.20, yFloor - 0.10, HEIGHT, WIDTH, 0.22),
        boxRing(cabX1 - 0.22, yFloor - 0.06, HEIGHT - 0.08, WIDTH - 0.04, 0.16),
        boxRing(cabX1, yFloor + 0.08, HEIGHT - 0.22, WIDTH - 0.18, 0.12),
      ],
      { closed: true, capStart: true, capEnd: true },
    )
    emit('cab', cabBody, cab, 'body')

    const bumper = bevelBox(0.36, 0.36, WIDTH - 0.18, 0.03)
    bumper.translate(cabX0 + 0.10, 0.52, 0)
    emit('cab', bumper, cab, 'bumper', bumperMat)

    const plate = bevelBox(0.04, 0.16, 0.38, 0.006)
    plate.translate(cabX0 - 0.01, 0.54, 0)
    emit('cab', plate, cab, 'plate-pocket', kit.graphite)

    const visor = bevelBox(0.38, 0.08, WIDTH - 0.32, 0.016)
    visor.translate(cabX0 + 0.18, HEIGHT - 0.06, 0)
    emit('cab', visor, cab, 'visor', bumperMat)

    const visorBar = bevelBox(0.10, 0.055, WIDTH - 0.40, 0.008)
    visorBar.translate(cabX0 + 0.06, HEIGHT - 0.08, 0)
    emit('lamps', visorBar, lamps, 'visor-bar')

    const cassette = bevelBox(0.14, 0.88, WIDTH - 0.36, 0.014)
    cassette.translate(cabX0 + 0.08, 1.34, 0)
    emit('cab', cassette, cab, 'grille-cassette', kit.ink)

    const slats: BufferGeometry[] = []
    for (let i = 0; i < 6; i++) {
      const slat = bevelBox(0.06, 0.08, WIDTH - 0.46, 0.008)
      slat.translate(cabX0 + 0.00 + i * 0.03, 1.02 + i * 0.12, 0)
      slats.push(slat)
    }
    emit('cab', mergeParts(slats, 'grille'), cab, 'grille', kit.steel)

    const screen = bevelBox(0.05, 1.55, WIDTH - 0.38, 0.012)
    screen.rotateZ(-0.28)
    screen.translate(cabX0 + 0.22, 2.62, 0)
    emit('glass', screen, cab, 'windshield')

    const header = bevelBox(0.05, 0.06, WIDTH - 0.58, 0.008)
    header.rotateZ(-0.16)
    header.translate(cabX0 + 0.18, 3.46, 0)
    emit('cab', header, cab, 'screen-header', chrome)

    for (const sz of [-1, 1] as const) {
      const zFace = sz * (hz + 0.04)
      const door = bevelBox(1.55, 0.82, 0.04, 0.01)
      door.translate(cabX0 + 1.45, 1.48, sz * (hz - 0.02))
      emit('cab', door, cab, `door-${sz}`, kit.ink)

      const pillar = bevelBox(0.08, 1.48, 0.06, 0.01)
      pillar.rotateZ(-0.16)
      pillar.translate(cabX0 + 0.22, 2.70, sz * (hz - 0.22))
      emit('cab', pillar, cab, `a-pillar-${sz}`, chrome)

      const sideGlass = bevelPrism(
        [[-0.72, -0.34], [0.58, -0.10], [0.72, 0.36], [-0.72, 0.34]],
        0.04,
        0.008,
      )
      sideGlass.translate(cabX0 + 1.58, 2.30, zFace)
      emit('glass', sideGlass, cab, `side-glass-${sz}`)

      const sleeper = bevelBox(0.62, 0.44, 0.035, 0.008)
      sleeper.translate(cabX0 + 2.85, 2.38, zFace)
      emit('glass', sleeper, cab, `sleeper-${sz}`)

      const trim = bevelBox(2.15, 0.045, 0.03, 0.006)
      trim.translate(cabX0 + 1.85, yBelt - 0.06, sz * (hz - 0.03))
      emit('cab', trim, cab, `chrome-${sz}`, chrome)

      const lamp = bevelBox(0.12, 0.16, 0.36, 0.016)
      lamp.translate(cabX0 + 0.00, 0.86, sz * (hz - 0.42))
      emit('lamps', lamp, lamps, `lamp-${sz}`)

      const brow = bevelBox(0.05, 0.05, 0.40, 0.006)
      brow.translate(cabX0 - 0.03, 1.02, sz * (hz - 0.38))
      emit('lamps', brow, lamps, `drl-brow-${sz}`)
      const hookV = bevelBox(0.05, 0.22, 0.05, 0.006)
      hookV.translate(cabX0 - 0.03, 0.92, sz * (hz - 0.22))
      emit('lamps', hookV, lamps, `drl-v-${sz}`)

      const fog = bevelBox(0.09, 0.09, 0.14, 0.01)
      fog.translate(cabX0 + 0.08, 0.54, sz * (hz - 0.58))
      emit('lamps', fog, lamps, `fog-${sz}`)

      const step: BufferGeometry[] = []
      for (let s = 0; s < 3; s++) {
        const tread = bevelBox(0.42, 0.05, 0.16, 0.006)
        tread.translate(cabX0 + 1.05, 0.48 + s * 0.22, sz * (hz + 0.05))
        step.push(tread)
      }
      emit('cab', mergeParts(step, `steps-${sz}`), cab, `steps-${sz}`, bumperMat)

      const arch = new CylinderGeometry(0.62, 0.62, 0.14, 16, 1, true, 0, Math.PI)
      arch.rotateZ(Math.PI / 2)
      arch.rotateY(sz > 0 ? 0 : Math.PI)
      arch.translate(steerX, tyreR + 0.04, sz * (hz - 0.04))
      emit('cab', arch, cab, `steer-arch-${sz}`, bumperMat)

      const arm = member(
        new Vector3(cabX0 + 0.62, 2.62, sz * (hz - 0.10)),
        new Vector3(cabX0 + 0.38, 2.48, sz * (hz + 0.52)),
        0.016,
        8,
      )
      emit('cab', arm, cab, `cam-arm-${sz}`, kit.ink)
      const cam = loftRoundedBox(0.10, 0.14, 0.16, 0.02)
      cam.translate(cabX0 + 0.48, 2.40, sz * (hz + 0.46))
      emit('cab', cam, cab, `cam-${sz}`, kit.graphite)

      const marker = new CylinderGeometry(0.035, 0.035, 0.06, 10)
      marker.translate(cabX0 + 0.55, HEIGHT - 0.02, sz * (hz - 0.18))
      emitAmber(marker, `roof-marker-${sz}`)

      const extender = bevelBox(0.55, 1.85, 0.06, 0.012)
      extender.translate(cabX1 + 0.18, 2.55, sz * (hz - 0.04))
      emit('cab', extender, cab, `extender-${sz}`)
    }

    const spoiler = new LoftGeometry(
      [
        boxRing(cabX1 - 0.12, HEIGHT - 0.18, HEIGHT, WIDTH - 0.12, 0.04),
        boxRing(cabX1 + 0.35, HEIGHT - 0.10, HEIGHT + 0.02, WIDTH - 0.08, 0.05),
        boxRing(fifth - 0.05, HEIGHT - 0.22, HEIGHT - 0.04, WIDTH - 0.22, 0.04),
      ],
      { closed: true, capStart: true, capEnd: true },
    )
    emit('cab', spoiler, cab, 'roof-spoiler')

    const board = bevelBox(TRACTOR - 0.5, 0.16, WIDTH - 1.15, 0.02)
    board.translate(nose + TRACTOR / 2, 0.40, 0)
    emit('chassis', board, chassis, 'frame')

    const kingpin = bevelBox(0.62, 0.12, 0.78, 0.02)
    kingpin.translate(fifth - 0.08, 1.08, 0)
    emit('chassis', kingpin, chassis, 'fifth-wheel')

    const tank = new CylinderGeometry(0.28, 0.28, 1.35, 16)
    tank.rotateZ(Math.PI / 2)
    tank.translate((steerX + driveX) / 2, 0.72, hz - 0.55)
    emit('chassis', tank, chassis, 'tank', kit.graphite)

    const tractorSpan = driveX - steerX - 1.15
    for (const sz of [-1, 1] as const) {
      const cabSkirt = bevelBox(tractorSpan, 0.48, 0.08, 0.012)
      cabSkirt.translate((steerX + driveX) / 2, 0.58, sz * (hz - 0.02))
      emit('chassis', cabSkirt, chassis, `cab-skirt-${sz}`, bumperMat)
    }

    const boxH = HEIGHT - 0.42
    const cargoH = config.kind === 'reefer' ? boxH : boxH - 0.02
    const yBot = 0.48
    const yTop = yBot + cargoH
    const cargoBox = new LoftGeometry(
      [
        boxRing(boxX0, yBot, yTop, WIDTH - 0.02, 0.12),
        boxRing(boxX0 + 0.28, yBot, yTop, WIDTH, 0.06),
        boxRing(boxX1 - 0.08, yBot, yTop, WIDTH, 0.03),
        boxRing(boxX1, yBot, yTop, WIDTH - 0.04, 0.03),
      ],
      { closed: true, capStart: true, capEnd: true },
    )
    emit('cargo', cargoBox, cargo, 'box')

    const noseCap = bevelBox(0.22, cargoH - 0.08, WIDTH - 0.12, 0.03)
    noseCap.translate(boxX0 + 0.08, yBot + cargoH / 2, 0)
    emit('cargo', noseCap, cargo, 'nose', cabPaint)

    const blackNose = bevelBox(2.15, cargoH - 0.18, 0.04, 0.01)
    blackNose.translate(boxX0 + 1.15, yBot + cargoH / 2, hz + 0.04)
    emit('cargo', blackNose, cargo, 'nose-side', cabPaint)

    for (const sz of [-1, 1] as const) {
      const beltFrame = bevelBox(boxLen - 1.6, 0.44, 0.04, 0.008)
      beltFrame.translate(boxX + 0.15, yTop - 0.36, sz * (hz - 0.01))
      emit('cab', beltFrame, cargo, `trailer-frame-${sz}`, kit.graphite)
      const beltGlass = bevelBox(boxLen - 1.75, 0.32, 0.035, 0.006)
      beltGlass.translate(boxX + 0.15, yTop - 0.36, sz * (hz + 0.04))
      emit('glass', beltGlass, cargo, `trailer-glass-${sz}`)

      const skirt = bevelBox(boxLen - 0.55, 0.62, 0.07, 0.012)
      skirt.translate(boxX, 0.78, sz * (hz - 0.02))
      emit('chassis', skirt, chassis, `trailer-skirt-${sz}`)

      const sideMark = new CylinderGeometry(0.028, 0.028, 0.05, 8)
      sideMark.rotateX(Math.PI / 2)
      sideMark.translate(boxX0 + 0.55, 1.15, sz * (hz + 0.02))
      emitAmber(sideMark, `trailer-marker-${sz}`)
    }

    const legs: BufferGeometry[] = []
    for (const sz of [-1, 1] as const) {
      const leg = bevelBox(0.10, 0.95, 0.10, 0.01)
      leg.translate(boxX0 + 0.85, 0.72, sz * 0.55)
      legs.push(leg)
    }
    emit('chassis', mergeParts(legs, 'landing-legs'), chassis, 'landing-legs')

    const underrun = bevelBox(0.12, 0.18, WIDTH - 0.35, 0.016)
    underrun.translate(boxX1 - 0.08, 0.58, 0)
    emit('chassis', underrun, chassis, 'underrun')

    const rearDoor = bevelBox(0.05, cargoH - 0.22, WIDTH - 0.22, 0.012)
    rearDoor.translate(boxX1 + CLEAR, yBot + cargoH / 2, 0)
    emit('cargo', rearDoor, cargo, 'rear-door', kit.shell)

    for (const sz of [-1, 1] as const) {
      const rearMark = bevelBox(0.04, 0.08, 0.18, 0.006)
      rearMark.translate(boxX1 + CLEAR * 2, yTop - 0.18, sz * (hz - 0.28))
      emitAmber(rearMark, `rear-marker-${sz}`)
    }

    if (config.kind === 'curtainside') {
      const ribs: BufferGeometry[] = []
      const count = Math.max(4, Math.round(boxLen / 1.2))
      for (let i = 0; i < count; i++) {
        const x = boxX0 + (i + 0.5) * (boxLen / count)
        for (const sz of [-1, 1] as const) {
          const rib = bevelBox(0.05, cargoH - 0.22, 0.04, 0.004)
          rib.translate(x, yBot + cargoH / 2, sz * (hz - 0.02))
          ribs.push(rib)
        }
      }
      emit('cargo', mergeParts(ribs, 'ribs'), cargo, 'ribs')
    }
    if (config.kind === 'reefer') {
      const unit = loftRoundedBox(0.80, 0.40, 1.2, 0.05)
      unit.translate(boxX0 + 0.85, HEIGHT + 0.06, 0)
      emit('cargo', unit, cargo, 'reefer-unit')
    }

    for (let a = 0; a < axleXs.length; a++) {
      const x = axleXs[a]!
      const dual = a > 0
      const axle = new CylinderGeometry(0.07, 0.07, WIDTH - 0.48, 12)
      axle.rotateX(Math.PI / 2)
      axle.translate(x, tyreR, 0)
      emit('chassis', axle, chassis, `axle-${a}`)
      if (a >= 2) {
        const guard = bevelBox(0.85, 0.08, WIDTH - 0.2, 0.012)
        guard.translate(x, tyreR + 0.58, 0)
        emit('chassis', guard, chassis, `mudguard-${a}`, bumperMat)
      }
      for (const sz of [-1, 1] as const) {
        const hub = new Group()
        hub.name = `hub-${a}-${sz}`
        hub.position.set(x, tyreR, sz * (hz - 0.30))
        wheels.add(hub)
        hubs.push(hub)
        const tyre = new CylinderGeometry(tyreR, tyreR, 0.315, 24)
        tyre.rotateX(Math.PI / 2)
        emit('wheels', tyre, hub, `tyre-${a}-${sz}`, kit.ink)
        const rim = new CylinderGeometry(tyreR * 0.58, tyreR * 0.58, 0.20, 18)
        rim.rotateX(Math.PI / 2)
        emit('wheels', rim, hub, `rim-${a}-${sz}`, kit.steel)
        const dish = new CylinderGeometry(tyreR * 0.22, tyreR * 0.22, 0.20, 12)
        dish.rotateX(Math.PI / 2)
        emit('wheels', dish, hub, `dish-${a}-${sz}`, kit.graphite)
        if (dual) {
          const inner = new CylinderGeometry(tyreR, tyreR, 0.315, 24)
          inner.rotateX(Math.PI / 2)
          inner.translate(0, 0, -sz * 0.34)
          emit('wheels', inner, hub, `tyre-inner-${a}-${sz}`)
        }
      }
    }

    const side = new PlaneGeometry(boxLen - 0.45, cargoH - 0.28)
    side.translate(boxX, yBot + cargoH / 2, hz + CLEAR)
    const rear = new PlaneGeometry(WIDTH - 0.28, cargoH - 0.28)
    rear.rotateY(Math.PI / 2)
    rear.translate(boxX1 + CLEAR * 2, yBot + cargoH / 2, 0)
    if (ownsLivery) {
      const tex = truckLiveryTexture({
        number: DRIVER.number,
        legend: config.livery === 'blank' ? '' : 'TEAM',
      })
      textures.push(tex)
      const mat = new MeshStandardMaterial({
        name: 'f1-kit / truck livery',
        map: tex,
        roughness: 0.38,
        metalness: 0.06,
      })
      extras.push(mat)
      emit('livery', side, fascia, 'side', mat)
      emit('livery', rear, fascia, 'rear', mat)
    } else {
      emit('livery', side, fascia, 'side')
      emit('livery', rear, fascia, 'rear')
    }

    applySpin()
    applyLamps()
  }
  rebuild()

  return {
    root,
    parts: { cab, chassis, cargo, wheels, fascia, lamps },
    materials: materialSlots,
    getConfig: () => ({ ...config }),
    configure(patch) {
      let dirty = false
      if (patch.kind !== undefined) { config.kind = patch.kind; dirty = true }
      if (patch.wheelbase !== undefined) { config.wheelbase = patch.wheelbase; dirty = true }
      if (patch.boxLength !== undefined) { config.boxLength = patch.boxLength; dirty = true }
      if (patch.axles !== undefined) { config.axles = patch.axles; dirty = true }
      if (patch.livery !== undefined) { config.livery = patch.livery; dirty = true }
      if (patch.wheelRpm !== undefined) config.wheelRpm = patch.wheelRpm
      if (patch.lamps !== undefined) config.lamps = patch.lamps
      clampConfig(config)
      if (dirty) rebuild()
      else {
        applySpin()
        applyLamps()
      }
    },
    setMaterial(slot, material) {
      if (slot === 'livery' && ownsLivery) {
        releaseOwnedLivery()
        ownsLivery = false
      }
      materialSlots[slot] = material
      if (slot === 'lamps') {
        if (config.lamps) applyLamps()
        return
      }
      for (const mesh of meshesBySlot[slot]) mesh.material = material
    },
    update(deltaSeconds) {
      if (config.wheelRpm <= 0 || deltaSeconds === 0) return
      spin += (config.wheelRpm / 60) * Math.PI * 2 * deltaSeconds
      applySpin()
    },
    dispose() {
      releaseGenerated()
      for (const material of owned) material.dispose()
      disposeF1Materials(bundle)
      root.removeFromParent()
    },
  }
}

export function createPreview({ aspect }: { aspect: number; time?: number }) {
  const preview = createF1Preview(createModel({ kind: 'box', axles: 3, lamps: true }), {
    aspect,
    target: [-3.8, 1.85, 0],
    distance: 16.5,
    fov: 30,
    yaw: -0.62,
    pitch: 0.12,
    ground: true,
    bloom: true,
  })
  const cabLight = new DirectionalLight(0xfff4e6, 3.6)
  cabLight.name = 'f1-kit / cab light'
  cabLight.userData.excludeFromExport = true
  cabLight.position.set(-8, 10, 6)
  cabLight.target.position.set(-2.2, 1.9, 0)
  cabLight.target.userData.excludeFromExport = true
  cabLight.visible = false
  preview.scene.add(cabLight, cabLight.target)
  let cabLightOn = false
  const inner = preview.dispose
  return {
    ...preview,
    isCabLightOn: () => cabLightOn,
    toggleCabLight() {
      cabLightOn = !cabLightOn
      cabLight.visible = cabLightOn
      return cabLightOn
    },
    dispose() {
      preview.scene.remove(cabLight, cabLight.target)
      cabLight.dispose()
      inner()
    },
  }
}
