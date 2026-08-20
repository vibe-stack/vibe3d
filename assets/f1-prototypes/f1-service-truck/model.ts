// f1-service-truck — unbranded electric tractor+box. Cab grammar is the Tesla
// Semi day cab (Dimensions.com millimetres); cargo fills the EU 96/53 12 m rigid.
// Assemble cab / chassis / cargo / wheels; hang a wrap with setMaterial('livery', …).
// Static VibeModel, not a drivetrain. No Tesla wordmark.

import { LoftGeometry } from 'three/examples/jsm/geometries/LoftGeometry.js'
import {
  BufferGeometry,
  CylinderGeometry,
  DataTexture,
  EquirectangularReflectionMapping,
  Group,
  LinearFilter,
  Mesh,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  RGBAFormat,
  SRGBColorSpace,
  DoubleSide,
  UnsignedByteType,
  Vector3,
  type Material,
} from 'three/webgpu'

import {
  LAYER_CLEARANCE,
  TRUCK,
  acquireF1Materials,
  bevelBox,
  createF1Preview,
  createLampMaterial,
  disposeF1Materials,
  fasciaTexture,
  isFasciaStyle,
  isTruckKind,
  loftRoundedBox,
  member,
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

const TRACTOR = TRUCK.tractor
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

/**
 * Tapered rounded section in YZ at X — wide at the belt, narrower at the roof
 * (Semi teardrop). `botW` / `topW` are full widths.
 */
function aeroRing(
  x: number,
  yBot: number,
  yTop: number,
  botW: number,
  topW: number,
  radius: number,
): Vector3[] {
  const h = yTop - yBot
  const br = Math.min(radius, botW / 2 - 1e-4, h * 0.22)
  const tr = Math.min(radius, topW / 2 - 1e-4, h * 0.22)
  const bz = botW / 2
  const tz = topW / 2
  const seg = 4
  const pts: Vector3[] = []
  const corner = (
    cx: number,
    cy: number,
    a0: number,
    r: number,
  ): void => {
    for (let j = 0; j <= seg; j++) {
      const a = a0 + (j / seg) * (Math.PI / 2)
      pts.push(new Vector3(x, cy + r * Math.sin(a), cx + r * Math.cos(a)))
    }
  }
  // YZ: +Z right, +Y up. Walk CCW from bottom-right as seen looking +X.
  corner(bz - br, yBot + br, -Math.PI / 2, br)
  corner(tz - tr, yTop - tr, 0, tr)
  corner(-(tz - tr), yTop - tr, Math.PI / 2, tr)
  corner(-(bz - br), yBot + br, Math.PI, br)
  pts.reverse()
  return pts
}


/** Studio lat-long so cab metal can spec without a kit-wide PMREM. */
function studioEnvMap(): DataTexture {
  const w = 64
  const h = 32
  const data = new Uint8Array(w * h * 4)
  for (let y = 0; y < h; y++) {
    const v = y / (h - 1)
    for (let x = 0; x < w; x++) {
      const u = x / (w - 1)
      const sky = Math.max(0, 1 - v * 1.12)
      const key = Math.max(0, 1 - Math.hypot((u - 0.22) * 1.7, (v - 0.15) * 2.2))
      const r = Math.min(255, 36 + sky * 188 + key * 92)
      const g = Math.min(255, 40 + sky * 196 + key * 78)
      const b = Math.min(255, 48 + sky * 208 + key * 58)
      const i = (y * w + x) * 4
      data[i] = r
      data[i + 1] = g
      data[i + 2] = b
      data[i + 3] = 255
    }
  }
  const tex = new DataTexture(data, w, h, RGBAFormat, UnsignedByteType)
  tex.mapping = EquirectangularReflectionMapping
  tex.magFilter = LinearFilter
  tex.minFilter = LinearFilter
  tex.colorSpace = SRGBColorSpace
  tex.needsUpdate = true
  return tex
}

function clampConfig(config: F1ServiceTruckConfig): void {
  config.kind = isTruckKind(config.kind) ? config.kind : 'box'
  config.axles = config.axles >= 3 ? 3 : 2
  const maxBox = MAX_LEN - TRACTOR - GAP
  config.boxLength = Math.min(maxBox, Math.max(4.0, config.boxLength))
  const maxWb = Math.max(3.5, TRACTOR - 1.4)
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
  const owned: Material[] = []
  const textures: DataTexture[] = []
  let ownsLivery = options.materials?.livery === undefined
  const ownsCab = options.materials?.cab === undefined
  const envTex = studioEnvMap()
  const cabPaint = options.materials?.cab ?? new MeshPhysicalMaterial({
    name: 'f1-kit / cab metal',
    color: 0xb0b8c0,
    metalness: 0.92,
    roughness: 0.05,
    clearcoat: 0.82,
    clearcoatRoughness: 0.04,
    envMap: envTex,
    envMapIntensity: 0.95,
    side: DoubleSide,
  })
  if (ownsCab) owned.push(cabPaint)
  const glassMat = new MeshStandardMaterial({
    name: 'f1-kit / cab glass',
    color: 0x1a222c,
    metalness: 0.22,
    roughness: 0.18,
    side: DoubleSide,
  })
  owned.push(glassMat)
  const lamp = createLampMaterial({ on: true, color: 0xe8f0ff, name: 'f1-kit / cab lamp' })
  owned.push(lamp)

  const materialSlots: Record<Slot, Material> = {
    cab: cabPaint,
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
    const overall = TRACTOR + GAP + boxLen
    const cabX = -overall / 2 + TRACTOR / 2
    const boxX = -overall / 2 + TRACTOR + GAP + boxLen / 2
    const half = TRACTOR / 2
    const tyreR = TYRE / 2
    const bot = WIDTH - 0.04
    const top = WIDTH * 0.78
    const frontX = -overall / 2 + 1.35
    const driveX = frontX + config.wheelbase
    const axleXs = [frontX, driveX]
    if (config.axles === 3) axleXs.push(overall / 2 - 1.15)

    // Side-view teardrop: low round bumper, then a continuous rake into a tall
    // day-cab roof. Station 0 must stay short — a 3.5 m nose wall reads as a chin.
    const cabBody = new LoftGeometry(
      [
        aeroRing(-half, 0.38, 1.72, bot - 0.48, top - 0.52, 0.42),
        aeroRing(-half + 0.80, 0.36, 2.72, bot - 0.16, top - 0.18, 0.28),
        aeroRing(-half + 1.75, 0.34, HEIGHT, bot, top + 0.04, 0.18),
        aeroRing(-half + 3.15, 0.34, HEIGHT - 0.06, bot, top + 0.06, 0.14),
        aeroRing(half, 0.38, HEIGHT - 0.30, bot - 0.08, top - 0.02, 0.12),
      ],
      { closed: true, capStart: true, capEnd: true },
    )
    cabBody.translate(cabX, 0, 0)
    emit('cab', cabBody, cab, 'body')

    // One wrap from the rising nose, over the roof, and ~1 m into the doors.
    const glass = new LoftGeometry(
      [
        aeroRing(-half + 0.22, 0.68, 2.15, bot - 0.18, top - 0.18, 0.28),
        aeroRing(-half + 1.20, 0.88, HEIGHT - 0.04, bot + 0.06, top + 0.14, 0.16),
        aeroRing(-half + 2.35, 1.02, HEIGHT - 0.06, bot + 0.02, top + 0.10, 0.12),
        aeroRing(-half + 3.85, 1.20, HEIGHT - 0.12, bot - 0.06, top + 0.02, 0.10),
      ],
      { closed: true, capStart: true, capEnd: true },
    )
    glass.translate(cabX, 0, 0)
    emit('cab', glass, cab, 'glass', glassMat)

    for (const sz of [-1, 1] as const) {
      // Recessed L-blade on the silver nose corners, not a visor hairline.
      const blade = bevelBox(0.10, 0.56, 0.14, 0.02)
      blade.translate(cabX - half + 0.22, 1.08, sz * (bot / 2 - 0.10))
      emit('cab', blade, cab, `lamp-${sz}`, lamp)
      // A-pillar camera wings, ~0.5 m outboard.
      const pillarX = cabX - half + 2.15
      const pillarY = 2.42
      const rootZ = sz * (bot / 2 - 0.04)
      const tipZ = sz * (bot / 2 + 0.38)
      emit(
        'cab',
        member(
          new Vector3(pillarX, pillarY, rootZ),
          new Vector3(pillarX - 0.06, pillarY - 0.02, tipZ),
          0.032,
          8,
        ),
        cab,
        `wing-arm-${sz}`,
        kit.ink,
      )
      const pod = loftRoundedBox(0.36, 0.18, 0.16, 0.045)
      pod.translate(pillarX - 0.06, pillarY - 0.02, tipZ)
      emit('cab', pod, cab, `wing-${sz}`, kit.ink)
    }

    // Inset skateboard so it does not fill the wheel openings as a dark slab.
    const board = bevelBox(overall - 0.55, 0.16, WIDTH - 1.15, 0.02)
    board.translate(0, 0.34, 0)
    emit('chassis', board, chassis, 'skateboard')

    const archHalf = tyreR + 0.28
    const zSkirt = WIDTH / 2 - 0.01
    const emitSkirt = (name: string, x0: number, x1: number, height: number, y: number, sz: -1 | 1): void => {
      const len = x1 - x0
      if (len < 0.18) return
      const slab = bevelBox(len, height, 0.07, 0.012)
      slab.translate((x0 + x1) / 2, y, sz * zSkirt)
      emit('chassis', slab, chassis, name)
    }
    for (const sz of [-1, 1] as const) {
      const nose = -overall / 2 + 0.05
      const tail = overall / 2 - 0.22
      emitSkirt(`valence-${sz}`, nose, frontX - archHalf, 0.26, 0.48, sz)
      emitSkirt(`mid-fairing-${sz}`, frontX + archHalf, driveX - archHalf, 0.92, 0.82, sz)
      const afterDrive = driveX + archHalf
      if (config.axles === 3) {
        const tag = axleXs[2]!
        emitSkirt(`drive-fairing-${sz}`, afterDrive, tag - archHalf, 0.92, 0.82, sz)
        emitSkirt(`tail-fairing-${sz}`, tag + archHalf, tail, 0.92, 0.82, sz)
      } else {
        emitSkirt(`tail-fairing-${sz}`, afterDrive, tail, 0.92, 0.82, sz)
      }
    }

    const lift = bevelBox(0.62, 0.07, WIDTH - 0.45, 0.008)
    lift.translate(overall / 2 - 0.32, 0.70, 0)
    emit('chassis', lift, chassis, 'tail-lift')

    const boxH = HEIGHT - 0.42
    const cargoH = config.kind === 'reefer' ? boxH : boxH - 0.04
    const cargoBox = loftRoundedBox(boxLen, cargoH, WIDTH - 0.02, 0.06)
    cargoBox.translate(boxX, 0.42 + cargoH / 2, 0)
    emit('cargo', cargoBox, cargo, 'box')

    if (config.kind === 'curtainside') {
      const ribs: BufferGeometry[] = []
      const count = Math.max(4, Math.round(boxLen / 1.1))
      for (let i = 0; i < count; i++) {
        const x = boxX - boxLen / 2 + (i + 0.5) * (boxLen / count)
        for (const sz of [-1, 1] as const) {
          const rib = bevelBox(0.05, cargoH - 0.22, 0.04, 0.004)
          rib.translate(x, 0.42 + cargoH / 2, sz * (WIDTH / 2 - 0.02))
          ribs.push(rib)
        }
      }
      emit('cargo', mergeParts(ribs, 'ribs'), cargo, 'ribs')
    }
    if (config.kind === 'reefer') {
      const unit = loftRoundedBox(1.2, 0.40, 0.80, 0.05)
      unit.translate(boxX - boxLen / 2 + 0.75, HEIGHT + 0.06, 0)
      emit('cargo', unit, cargo, 'reefer-unit')
    }

    for (let a = 0; a < axleXs.length; a++) {
      const x = axleXs[a]!
      const axle = new CylinderGeometry(0.07, 0.07, WIDTH - 0.55, 10)
      axle.rotateX(Math.PI / 2)
      axle.translate(x, tyreR, 0)
      emit('chassis', axle, chassis, `axle-${a}`)
      for (const sz of [-1, 1] as const) {
        const tyre = new CylinderGeometry(tyreR, tyreR, 0.28, 18)
        tyre.rotateX(Math.PI / 2)
        tyre.translate(x, tyreR, sz * (WIDTH / 2 - 0.32))
        emit('wheels', tyre, wheels, `tyre-${a}-${sz}`)
        const rim = new CylinderGeometry(tyreR * 0.48, tyreR * 0.48, 0.16, 14)
        rim.rotateX(Math.PI / 2)
        rim.translate(x, tyreR, sz * (WIDTH / 2 - 0.32))
        emit('wheels', rim, wheels, `rim-${a}-${sz}`, kit.steel)
      }
    }

    const side = new PlaneGeometry(boxLen - 0.30, cargoH - 0.40)
    side.translate(boxX, 0.42 + cargoH / 2, WIDTH / 2 + LAYER_CLEARANCE * 3)
    const rear = new PlaneGeometry(WIDTH - 0.30, cargoH - 0.40)
    rear.rotateY(Math.PI / 2)
    rear.translate(overall / 2 + LAYER_CLEARANCE * 3, 0.42 + cargoH / 2, 0)
    if (ownsLivery) {
      const tex = fasciaTexture({
        number: '12',
        legend: 'HAUL',
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
      for (const material of owned) material.dispose()
      envTex.dispose()
      disposeF1Materials(bundle)
      root.removeFromParent()
    },
  }
}

export function createPreview({ aspect }: { aspect: number; time?: number }) {
  const preview = createF1Preview(createModel({ kind: 'box', axles: 2 }), {
    aspect,
    target: [0, 1.7, 0],
    distance: 28,
    fov: 28,
    yaw: -0.95,
    pitch: 0.08,
  })
  const env = studioEnvMap()
  preview.scene.environment = env
  const inner = preview.dispose
  return {
    ...preview,
    dispose() {
      env.dispose()
      inner()
    },
  }
}
