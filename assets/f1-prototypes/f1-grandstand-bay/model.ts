// f1-grandstand-bay — one seating bay: lofted staircase bowl, instanced L-profile seats, rear wall,
// cantilever roof. configure({ rows, width }).
//
// Datums from a typical F1 grandstand bay: 0.42 m rise, 0.85 m tread, cantilever roof dropping 0.6 m
// toward the track. Seat backs 0.42 m wide, instanced along the bay. Amber nosings and a red fascia
// board are the catalogue tells — not a grey shed.

import {
  BufferGeometry,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  Vector3,
  type Material,
} from 'three/webgpu'

import {
  acquireF1Materials,
  bevelBox,
  createF1Preview,
  disposeF1Materials,
  loftAlongX,
  member,
  mergeParts,
} from '../f1-kit-core/index.ts'

type Slot = 'structure' | 'seat' | 'roof'

export interface F1GrandstandBayConfig {
  rows: number
  width: number
}

export interface F1GrandstandBayOptions extends Partial<F1GrandstandBayConfig> {
  materials?: Partial<Record<Slot, Material>>
}

export interface F1GrandstandBayInstance {
  readonly root: Group
  readonly parts: { bowl: Group; roof: Group }
  readonly materials: Readonly<Record<Slot, Material>>
  getConfig(): Readonly<F1GrandstandBayConfig>
  configure(patch: Partial<F1GrandstandBayConfig>): void
  setMaterial(slot: Slot, material: Material): void
  update(deltaSeconds: number): void
  dispose(): void
}

const defaults: F1GrandstandBayConfig = { rows: 8, width: 10 }
const RISE = 0.42
const TREAD = 0.85
const FASCIA = 0.32

export function createModel(options: F1GrandstandBayOptions = {}): F1GrandstandBayInstance {
  const config: F1GrandstandBayConfig = {
    rows: Math.max(4, Math.round(options.rows ?? defaults.rows)),
    width: Math.max(4, options.width ?? defaults.width),
  }

  const bundle = acquireF1Materials()
  const kit = bundle.materials
  const materialSlots: Record<Slot, Material> = {
    structure: options.materials?.structure ?? kit.graphite,
    seat: options.materials?.seat ?? kit.cobalt,
    roof: options.materials?.roof ?? kit.shell,
  }

  const root = new Group()
  root.name = 'f1-grandstand-bay'
  const bowl = new Group(); bowl.name = 'bowl'
  const roof = new Group(); roof.name = 'roof'
  root.add(bowl, roof)

  const generated: BufferGeometry[] = []
  const meshesBySlot: Record<Slot, Mesh[]> = { structure: [], seat: [], roof: [] }

  const releaseGenerated = (): void => {
    for (const group of [bowl, roof]) group.clear()
    for (const geometry of generated) geometry.dispose()
    generated.length = 0
    for (const slot of Object.keys(meshesBySlot) as Slot[]) meshesBySlot[slot].length = 0
  }

  const emit = (
    slot: Slot,
    geometry: BufferGeometry,
    group: Group,
    name: string,
    material?: Material,
  ): void => {
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
    const { rows, width } = config
    const depth = rows * TREAD
    const halfD = depth / 2
    const height = FASCIA + rows * RISE

    const profile: Array<readonly [number, number]> = []
    profile.push([halfD, 0])
    profile.push([halfD, FASCIA])
    for (let t = 0; t < rows; t++) {
      const yTop = FASCIA + t * RISE
      const zFront = halfD - t * TREAD
      const zBack = halfD - (t + 1) * TREAD
      profile.push([zFront, yTop])
      profile.push([zBack, yTop])
      profile.push([zBack, yTop + RISE])
    }
    profile.push([-halfD, 0])
    emit('structure', loftAlongX(profile, width, { closed: true }), bowl, 'bowl')

    const rear = bevelBox(width + 0.6, height + 0.4, 0.55, 0.03)
    rear.translate(0, (height + 0.4) / 2, -halfD - 0.28)
    emit('structure', rear, bowl, 'rear-wall')

    const fascia = bevelBox(width, FASCIA * 0.7, 0.16, 0.02)
    fascia.translate(0, FASCIA * 0.45, halfD + 0.1)
    emit('structure', fascia, bowl, 'fascia')

    const back = bevelBox(0.36, 0.48, 0.05, 0.008)
    back.translate(0, 0.12, -0.12)
    const pan = bevelBox(0.36, 0.05, 0.32, 0.006)
    pan.translate(0, -0.14, 0.05)
    const seatGeo = mergeParts([back, pan], 'seat')
    generated.push(seatGeo)

    const seatsAcross = Math.max(8, Math.floor(width / 0.42))
    const seatPositions: Vector3[] = []
    for (let r = 0; r < rows; r++) {
      const y = FASCIA + r * RISE + 0.28
      const z = halfD - (r + 0.55) * TREAD
      for (let s = 0; s < seatsAcross; s++) {
        const x = -width / 2 + (s + 0.5) * (width / seatsAcross)
        if (Math.abs(x) < 0.52) continue
        seatPositions.push(new Vector3(x, y, z))
      }
    }
    const seats = new InstancedMesh(seatGeo, materialSlots.seat, seatPositions.length)
    seats.name = 'seats'
    seats.castShadow = true
    seats.receiveShadow = true
    const m = new Matrix4()
    for (let i = 0; i < seatPositions.length; i++) {
      m.makeTranslation(seatPositions[i]!.x, seatPositions[i]!.y, seatPositions[i]!.z)
      seats.setMatrixAt(i, m)
    }
    seats.instanceMatrix.needsUpdate = true
    meshesBySlot.seat.push(seats)
    bowl.add(seats)

    const accessParts: BufferGeometry[] = []
    const nosings: BufferGeometry[] = []
    for (let r = 0; r < rows; r++) {
      const tread = bevelBox(1.0, 0.025, TREAD * 0.88, 0.006)
      tread.translate(0, FASCIA + r * RISE + 0.015, halfD - (r + 0.5) * TREAD)
      accessParts.push(tread)
      const nose = bevelBox(1.0, 0.03, 0.06, 0.006)
      nose.translate(0, FASCIA + r * RISE + 0.028, halfD - r * TREAD - 0.04)
      nosings.push(nose)
      if (r % 2 === 0) {
        for (const sx of [-1, 1] as const) {
          accessParts.push(member(
            new Vector3(sx * 0.54, FASCIA + r * RISE + 0.02, halfD - (r + 0.5) * TREAD),
            new Vector3(sx * 0.54, FASCIA + r * RISE + 0.78, halfD - (r + 0.5) * TREAD),
            0.025,
            8,
          ))
        }
      }
    }
    for (const sx of [-1, 1] as const) {
      accessParts.push(member(
        new Vector3(sx * 0.54, FASCIA + 0.75, halfD - 0.4),
        new Vector3(sx * 0.54, height + 0.65, -halfD + 0.4),
        0.035,
        8,
      ))
    }
    emit('structure', mergeParts(accessParts, 'central-gangway'), bowl, 'central-gangway')
    emit('structure', mergeParts(nosings, 'nosings'), bowl, 'nosings', kit.amber)

    const safetyParts: BufferGeometry[] = []
    const fenceZ = halfD + 0.18
    for (const y of [0.72, 1.08] as const) {
      safetyParts.push(member(new Vector3(-width / 2, y, fenceZ), new Vector3(-0.62, y, fenceZ), 0.026, 8))
      safetyParts.push(member(new Vector3(0.62, y, fenceZ), new Vector3(width / 2, y, fenceZ), 0.026, 8))
    }
    const fencePosts = Math.max(4, Math.ceil(width / 1.6))
    for (let p = 0; p <= fencePosts; p++) {
      const x = -width / 2 + (p / fencePosts) * width
      if (Math.abs(x) < 0.62) continue
      safetyParts.push(member(new Vector3(x, 0.24, fenceZ), new Vector3(x, 1.12, fenceZ), 0.03, 8))
    }
    for (const sx of [-1, 1] as const) {
      safetyParts.push(member(
        new Vector3(sx * width / 2, 0.55, halfD),
        new Vector3(sx * width / 2, height + 0.45, -halfD),
        0.035,
        8,
      ))
    }
    emit('structure', mergeParts(safetyParts, 'safety-rails'), bowl, 'safety-rails')

    const roofY = height + 1.6
    const roofParts: BufferGeometry[] = []
    const frameParts: BufferGeometry[] = []
    const reach = depth * 0.92
    const zBack = -halfD - 0.28
    const zFront = zBack + reach
    const yBack = roofY
    const yFront = roofY - 0.7
    const th = 0.035
    const N = 12
    const top: Array<readonly [number, number]> = []
    for (let k = 0; k <= N; k++) {
      const u = k / N
      const z = zBack + (zFront - zBack) * u
      const y = yBack + (yFront - yBack) * u - Math.sin(u * Math.PI) * 0.22
      top.push([z, y])
    }
    const ring: Array<readonly [number, number]> = [...top]
    for (let k = N; k >= 0; k--) ring.push([top[k]![0], top[k]![1] - th])
    roofParts.push(loftAlongX(ring, width + 1.2, { closed: true }))
    const lip = bevelBox(width + 1.2, 0.08, 0.12, 0.015)
    lip.translate(0, yFront - 0.05, zFront)
    roofParts.push(lip)
    const banner = bevelBox(width * 0.88, 0.62, 0.07, 0.012)
    banner.translate(0, yFront - 0.42, zFront + 0.05)
    const frameCount = Math.max(4, Math.ceil(width / 2.4))
    for (let frame = 0; frame < frameCount; frame++) {
      const x = -width / 2 + (frame / (frameCount - 1)) * width
      frameParts.push(member(
        new Vector3(x, height * 0.35, zBack),
        new Vector3(x, yBack - 0.1, zBack),
        0.075,
        8,
      ))
      frameParts.push(member(
        new Vector3(x, yBack - 0.12, zBack),
        new Vector3(x, yFront - 0.12, zFront),
        0.055,
        8,
      ))
      frameParts.push(member(
        new Vector3(x, height * 0.7, zBack),
        new Vector3(x, yFront - 0.16, zFront),
        0.04,
        8,
      ))
    }
    frameParts.push(member(
      new Vector3(-width / 2, yFront - 0.11, zFront),
      new Vector3(width / 2, yFront - 0.11, zFront),
      0.045,
      8,
    ))
    frameParts.push(member(
      new Vector3(-width / 2, yBack - 0.11, zBack),
      new Vector3(width / 2, yBack - 0.11, zBack),
      0.045,
      8,
    ))
    for (const sx of [-1, 1] as const) {
      frameParts.push(member(
        new Vector3(sx * width / 2, height * 0.35, zBack),
        new Vector3(sx * width / 2, yFront - 0.16, zFront),
        0.04,
        8,
      ))
    }
    emit('roof', mergeParts(roofParts, 'roof'), roof, 'roof')
    emit('structure', mergeParts(frameParts, 'roof-frames'), roof, 'roof-frames')
    emit('roof', banner, roof, 'fascia-board', kit.red)
  }
  rebuild()

  return {
    root,
    parts: { bowl, roof },
    materials: materialSlots,
    getConfig: () => ({ ...config }),
    configure(patch) {
      if (patch.rows !== undefined) config.rows = Math.max(4, Math.round(patch.rows))
      if (patch.width !== undefined) config.width = Math.max(4, patch.width)
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
  return createF1Preview(createModel({ rows: 6, width: 8 }), {
    aspect,
    target: [0, 1.85, 0.4],
    distance: 12.2,
    fov: 30,
    yaw: -0.82,
    pitch: 0.22,
  })
}
