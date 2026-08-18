// f1-grandstand-bay — one seating bay: lofted staircase bowl, instanced L-profile seats, rear wall,
// cantilever roof. configure({ rows, width }).
//
// Datums from a typical F1 grandstand bay: 0.42 m rise, 0.85 m tread, cantilever roof dropping 0.6 m
// toward the track. Seat backs 0.42 m wide, instanced along the bay.

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

    const back = bevelBox(0.38, 0.42, 0.06, 0.008)
    back.translate(0, 0.08, -0.13)
    const pan = bevelBox(0.38, 0.05, 0.32, 0.006)
    pan.translate(0, -0.15, 0.04)
    const seatGeo = mergeParts([back, pan], 'seat')
    generated.push(seatGeo)

    const seatsAcross = Math.max(6, Math.floor(width / 0.48))
    const count = seatsAcross * rows
    const seats = new InstancedMesh(seatGeo, materialSlots.seat, count)
    seats.name = 'seats'
    seats.castShadow = true
    seats.receiveShadow = true
    const m = new Matrix4()
    let i = 0
    for (let r = 0; r < rows; r++) {
      const y = FASCIA + r * RISE + 0.28
      const z = halfD - (r + 0.55) * TREAD
      for (let s = 0; s < seatsAcross; s++) {
        const x = -width / 2 + (s + 0.5) * (width / seatsAcross)
        m.makeTranslation(x, y, z)
        seats.setMatrixAt(i, m)
        i++
      }
    }
    seats.instanceMatrix.needsUpdate = true
    meshesBySlot.seat.push(seats)
    bowl.add(seats)

    const roofY = height + 1.6
    const roofParts: BufferGeometry[] = []
    const frameParts: BufferGeometry[] = []
    const reach = depth * 0.92
    const zBack = -halfD - 0.28
    const zFront = zBack + reach
    const yBack = roofY
    const yFront = roofY - 0.7
    const th = 0.1
    const N = 8
    const top: Array<readonly [number, number]> = []
    for (let k = 0; k <= N; k++) {
      const u = k / N
      const z = zBack + (zFront - zBack) * u
      const y = yBack + (yFront - yBack) * u - Math.sin(u * Math.PI) * 0.45
      top.push([z, y])
    }
    const ring: Array<readonly [number, number]> = [...top]
    for (let k = N; k >= 0; k--) ring.push([top[k]![0], top[k]![1] - th])
    roofParts.push(loftAlongX(ring, width + 1.2, { closed: true }))
    const lip = bevelBox(width + 1.2, 0.22, 0.28, 0.02)
    lip.translate(0, yFront - 0.08, zFront)
    roofParts.push(lip)
    const frameCount = Math.max(3, Math.ceil(width / 3))
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
    emit('roof', mergeParts(roofParts, 'roof'), roof, 'roof')
    emit('structure', mergeParts(frameParts, 'roof-frames'), roof, 'roof-frames')
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
    target: [0, 2.0, 0.2],
    distance: 14,
    fov: 32,
    yaw: -0.95,
    pitch: 0.28,
  })
}
