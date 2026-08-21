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
    metalness: 0.35,
    roughness: 0.18,
    clearcoat: 1,
    clearcoatRoughness: 0.06,
    side: FrontSide,
  })
  if (ownsCab) owned.push(cabPaint)
  const glassMat = options.materials?.glass ?? new MeshPhysicalMaterial({
    name: 'f1-kit / cab glass',
    color: 0x141a22,
    metalness: 0.18,
    roughness: 0.06,
    clearcoat: 0.4,
    clearcoatRoughness: 0.08,
    side: FrontSide,
  })
  if (options.materials?.glass === undefined) owned.push(glassMat)
  const chrome = new MeshPhysicalMaterial({
    name: 'f1-kit / cab chrome',
    color: 0xb8c0c8,
    metalness: 0.92,
    roughness: 0.16,
    clearcoat: 0.4,
    clearcoatRoughness: 0.08,
    side: FrontSide,
  })
  owned.push(chrome)
  const lampOn = options.materials?.lamps ?? createLampMaterial({
    on: true,
    color: 0xe8f0ff,
    intensity: 2.1,
    name: 'f1-kit / cab lamp on',
  })
  const lampOff = createLampMaterial({
    on: false,
    color: 0xe8f0ff,
    name: 'f1-kit / cab lamp off',
  })
  if (options.materials?.lamps === undefined) owned.push(lampOn)
  owned.push(lampOff)
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

  const applySpin = (): void => {
    for (const hub of hubs) hub.rotation.z = spin
  }

  const applyLamps = (): void => {
    const mat = config.lamps ? materialSlots.lamps : lampOff
    for (const mesh of meshesBySlot.lamps) mesh.material = mat
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
    const boxX = boxX0 + boxLen / 2
    const tyreR = TYRE / 2
    const steerX = nose + 1.45
    const driveX = steerX + config.wheelbase
    const trailerAxles = config.axles
    const bogie0 = overall / 2 - 1.05 - (trailerAxles - 1) * 1.32
    const axleXs = [steerX, driveX]
    for (let i = 0; i < trailerAxles; i++) axleXs.push(bogie0 + i * 1.32)

    const cabBody = new LoftGeometry(
      [
        boxRing(cabX0 + 0.02, 0.50, 2.18, WIDTH - 0.12, 0.05),
        boxRing(cabX0 + 0.12, 0.46, 2.42, WIDTH - 0.02, 0.06),
        boxRing(cabX0 + 0.24, 0.46, HEIGHT - 0.08, WIDTH, 0.08),
        boxRing(cabX0 + 0.48, 0.46, HEIGHT, WIDTH, 0.09),
        boxRing(cabX1 - 0.10, 0.48, HEIGHT, WIDTH, 0.08),
        boxRing(cabX1, 0.52, HEIGHT - 0.02, WIDTH - 0.04, 0.07),
      ],
      { closed: true, capStart: true, capEnd: true },
    )
    emit('cab', cabBody, cab, 'body')

    const bumper = bevelBox(0.28, 0.38, WIDTH - 0.12, 0.04)
    bumper.translate(cabX0 + 0.16, 0.62, 0)
    emit('cab', bumper, cab, 'bumper')

    const visor = bevelBox(0.22, 0.10, WIDTH - 0.18, 0.02)
    visor.translate(cabX0 + 0.55, HEIGHT - 0.08, 0)
    emit('cab', visor, cab, 'visor')

    const slats: BufferGeometry[] = []
    for (let i = 0; i < 12; i++) {
      const slat = bevelBox(0.05, 0.07, WIDTH - 0.42, 0.008)
      slat.translate(cabX0 + 0.06, 0.88 + i * 0.10, 0)
      slats.push(slat)
    }
    emit('cab', mergeParts(slats, 'grille'), cab, 'grille', kit.graphite)

    const screen = bevelBox(0.05, 1.28, WIDTH - 0.22, 0.02)
    screen.translate(cabX0 + 0.22, 3.18, 0)
    emit('glass', screen, cab, 'windshield')

    for (const sz of [-1, 1] as const) {
      const sideGlass = bevelBox(1.85, 0.72, 0.04, 0.01)
      sideGlass.translate(cabX0 + 1.55, 2.05, sz * (WIDTH / 2 + 0.01))
      emit('glass', sideGlass, cab, `side-glass-${sz}`)
      const trim = bevelBox(1.92, 0.06, 0.03, 0.008)
      trim.translate(cabX0 + 1.55, 1.66, sz * (WIDTH / 2 - 0.03))
      emit('cab', trim, cab, `chrome-${sz}`, chrome)
      const lamp = bevelBox(0.16, 0.14, 0.42, 0.03)
      lamp.translate(cabX0 + 0.12, 0.92, sz * (WIDTH / 2 - 0.38))
      emit('lamps', lamp, lamps, `lamp-${sz}`)
      const drl = bevelBox(0.05, 0.04, 0.72, 0.01)
      drl.translate(cabX0 + 0.14, 1.08, sz * (WIDTH / 2 - 0.42))
      emit('lamps', drl, lamps, `drl-${sz}`)
      const arm = member(
        new Vector3(cabX0 + 1.15, 2.22, sz * (WIDTH / 2 - 0.04)),
        new Vector3(cabX0 + 1.05, 2.18, sz * (WIDTH / 2 + 0.42)),
        0.028,
        8,
      )
      emit('cab', arm, cab, `mirror-arm-${sz}`, kit.ink)
      const mirror = loftRoundedBox(0.08, 0.32, 0.18, 0.02)
      mirror.translate(cabX0 + 1.05, 2.18, sz * (WIDTH / 2 + 0.42))
      emit('cab', mirror, cab, `mirror-${sz}`, kit.ink)
    }

    const board = bevelBox(TRACTOR - 0.4, 0.18, WIDTH - 1.05, 0.02)
    board.translate(nose + TRACTOR / 2, 0.42, 0)
    emit('chassis', board, chassis, 'frame')

    const kingpin = bevelBox(0.55, 0.12, 0.70, 0.02)
    kingpin.translate(fifth - 0.1, 1.05, 0)
    emit('chassis', kingpin, chassis, 'fifth-wheel')

    const boxH = HEIGHT - 0.48
    const cargoH = config.kind === 'reefer' ? boxH : boxH - 0.02
    const cargoBox = loftRoundedBox(boxLen, cargoH, WIDTH - 0.04, 0.10)
    cargoBox.translate(boxX, 0.48 + cargoH / 2, 0)
    emit('cargo', cargoBox, cargo, 'box')

    const noseCap = loftRoundedBox(0.55, cargoH - 0.12, WIDTH - 0.18, 0.12)
    noseCap.translate(boxX0 + 0.22, 0.48 + cargoH / 2, 0)
    emit('cargo', noseCap, cargo, 'nose', cabPaint)

    for (const sz of [-1, 1] as const) {
      const wins: BufferGeometry[] = []
      for (let i = 0; i < 5; i++) {
        const win = bevelBox(0.55, 0.38, 0.04, 0.01)
        win.translate(boxX0 + 1.6 + i * 1.35, 0.48 + cargoH - 0.42, sz * (WIDTH / 2 + 0.01))
        wins.push(win)
      }
      emit('glass', mergeParts(wins, `trailer-glass-${sz}`), cargo, `trailer-glass-${sz}`)
    }

    if (config.kind === 'curtainside') {
      const ribs: BufferGeometry[] = []
      const count = Math.max(4, Math.round(boxLen / 1.2))
      for (let i = 0; i < count; i++) {
        const x = boxX0 + (i + 0.5) * (boxLen / count)
        for (const sz of [-1, 1] as const) {
          const rib = bevelBox(0.05, cargoH - 0.22, 0.04, 0.004)
          rib.translate(x, 0.48 + cargoH / 2, sz * (WIDTH / 2 - 0.02))
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

    const zSkirt = WIDTH / 2 - 0.02
    for (const sz of [-1, 1] as const) {
      const skirt = bevelBox(boxLen - 0.4, 0.55, 0.06, 0.012)
      skirt.translate(boxX, 0.78, sz * zSkirt)
      emit('chassis', skirt, chassis, `trailer-skirt-${sz}`)
    }

    for (let a = 0; a < axleXs.length; a++) {
      const x = axleXs[a]!
      const axle = new CylinderGeometry(0.07, 0.07, WIDTH - 0.55, 12)
      axle.rotateX(Math.PI / 2)
      axle.translate(x, tyreR, 0)
      emit('chassis', axle, chassis, `axle-${a}`)
      for (const sz of [-1, 1] as const) {
        const hub = new Group()
        hub.name = `hub-${a}-${sz}`
        hub.position.set(x, tyreR, sz * (WIDTH / 2 - 0.32))
        wheels.add(hub)
        hubs.push(hub)
        const tyre = new CylinderGeometry(tyreR, tyreR, 0.28, 24)
        tyre.rotateX(Math.PI / 2)
        emit('wheels', tyre, hub, `tyre-${a}-${sz}`)
        const rim = new CylinderGeometry(tyreR * 0.48, tyreR * 0.48, 0.16, 16)
        rim.rotateX(Math.PI / 2)
        emit('wheels', rim, hub, `rim-${a}-${sz}`, kit.steel)
      }
    }

    const side = new PlaneGeometry(boxLen - 0.35, cargoH - 0.35)
    side.translate(boxX, 0.48 + cargoH / 2, WIDTH / 2 + LAYER_CLEARANCE * 3)
    const rear = new PlaneGeometry(WIDTH - 0.28, cargoH - 0.35)
    rear.rotateY(Math.PI / 2)
    rear.translate(overall / 2 + LAYER_CLEARANCE * 3, 0.48 + cargoH / 2, 0)
    if (ownsLivery) {
      const tex = truckLiveryTexture({
        number: DRIVER.number,
        legend: config.livery === 'blank' ? '' : 'TEAM',
      })
      textures.push(tex)
      const mat = new MeshStandardMaterial({
        name: 'f1-kit / truck livery',
        map: tex,
        roughness: 0.42,
        metalness: 0.08,
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
    target: [0, 1.8, 0],
    distance: 36,
    fov: 28,
    yaw: -0.95,
    pitch: 0.08,
  })
  const cabLight = new DirectionalLight(0xfff4e6, 3.6)
  cabLight.name = 'f1-kit / cab light'
  cabLight.userData.excludeFromExport = true
  cabLight.position.set(-8, 10, 6)
  cabLight.target.position.set(0, 1.8, 0)
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
