// f1-marshal-post — a trackside observers' hut: white cabin, track window, numbered board,
// two orange-suited marshals in white helmets (visor + radio), a held yellow flag, and a
// pad-mounted extinguisher.
//
// Datums from a typical FIA marshal post (Silverstone-style hut, ~2.2 m wide):
// hut 2.2 × 2.05 × 1.8 m, roof overhang 0.18 m, window 1.15 × 0.72 m on the track face.

import {
  BufferGeometry,
  CapsuleGeometry,
  Group,
  Mesh,
  SphereGeometry,
  type Material,
} from 'three/webgpu'

import {
  acquireF1Materials,
  bevelBox,
  bevelDisc,
  createF1Preview,
  disposeF1Materials,
  loftAlongX,
  mergeParts,
  revolve,
  tubeSection,
} from '../f1-kit-core/index.ts'

type Slot = 'hut' | 'crew' | 'flag'

export interface F1MarshalPostConfig {}

export interface F1MarshalPostOptions extends Partial<F1MarshalPostConfig> {
  materials?: Partial<Record<Slot, Material>>
}

export interface F1MarshalPostInstance {
  readonly root: Group
  readonly parts: { hut: Group; crew: Group }
  readonly materials: Readonly<Record<Slot, Material>>
  getConfig(): Readonly<F1MarshalPostConfig>
  configure(patch: Partial<F1MarshalPostConfig>): void
  setMaterial(slot: Slot, material: Material): void
  update(deltaSeconds: number): void
  dispose(): void
}

const HUT_W = 2.2
const HUT_D = 1.8
const HUT_H = 2.05

function marshalFigure(x: number, z: number, yaw: number): BufferGeometry[] {
  const parts: BufferGeometry[] = []
  const torso = new CapsuleGeometry(0.16, 0.55, 4, 10)
  torso.translate(0, 1.05, 0)
  parts.push(torso)
  const hip = new CapsuleGeometry(0.14, 0.12, 3, 8)
  hip.translate(0, 0.68, 0)
  parts.push(hip)
  for (const side of [-1, 1] as const) {
    const thigh = new CapsuleGeometry(0.075, 0.32, 3, 8)
    thigh.translate(side * 0.09, 0.42, 0)
    parts.push(thigh)
    const boot = bevelBox(0.11, 0.08, 0.22, 0.012)
    boot.translate(side * 0.09, 0.05, 0.04)
    parts.push(boot)
  }
  const armL = new CapsuleGeometry(0.05, 0.42, 3, 8)
  armL.rotateZ(0.45)
  armL.translate(-0.28, 1.15, 0.08)
  parts.push(armL)
  const armR = new CapsuleGeometry(0.05, 0.48, 3, 8)
  armR.rotateZ(-0.9)
  armR.rotateX(-0.4)
  armR.translate(0.32, 1.28, 0.18)
  parts.push(armR)
  const radio = bevelBox(0.07, 0.1, 0.04, 0.006)
  radio.translate(0.12, 1.18, 0.18)
  parts.push(radio)
  for (const geo of parts) {
    geo.rotateY(yaw)
    geo.translate(x, 0, z)
  }
  return parts
}

function helmet(x: number, z: number, yaw: number): BufferGeometry {
  const shell = new SphereGeometry(0.13, 16, 12)
  shell.scale(1, 1.08, 1.05)
  shell.translate(0, 1.58, 0.02)
  shell.rotateY(yaw)
  shell.translate(x, 0, z)
  return shell
}

function visor(x: number, z: number, yaw: number): BufferGeometry {
  const disc = bevelDisc(0.09, 0.018, 0.004, 12)
  disc.rotateX(-0.4)
  disc.translate(0, 1.55, 0.14)
  disc.rotateY(yaw)
  disc.translate(x, 0, z)
  return disc
}

export function createModel(options: F1MarshalPostOptions = {}): F1MarshalPostInstance {
  const config: F1MarshalPostConfig = {}
  const bundle = acquireF1Materials()
  const kit = bundle.materials
  const materialSlots: Record<Slot, Material> = {
    hut: options.materials?.hut ?? kit.shell,
    crew: options.materials?.crew ?? kit.orange,
    flag: options.materials?.flag ?? kit.amber,
  }

  const root = new Group()
  root.name = 'f1-marshal-post'
  const hut = new Group(); hut.name = 'hut'
  const crew = new Group(); crew.name = 'crew'
  root.add(hut, crew)

  const generated: BufferGeometry[] = []
  const meshesBySlot: Record<Slot, Mesh[]> = { hut: [], crew: [], flag: [] }

  const releaseGenerated = (): void => {
    for (const group of [hut, crew]) group.clear()
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
    const hutParts: BufferGeometry[] = []
    const darkParts: BufferGeometry[] = []
    const frameParts: BufferGeometry[] = []

    const pad = bevelBox(2.8, 0.08, 2.4, 0.01)
    pad.translate(0, 0.04, 0.1)
    hutParts.push(pad)

    const floor = bevelBox(HUT_W, 0.06, HUT_D, 0.008)
    floor.translate(0, 0.11, 0)
    hutParts.push(floor)

    const wallT = 0.08
    const rear = bevelBox(HUT_W, HUT_H, wallT, 0.01)
    rear.translate(0, 0.14 + HUT_H / 2, -HUT_D / 2 + wallT / 2)
    hutParts.push(rear)
    for (const sx of [-1, 1] as const) {
      const side = bevelBox(wallT, HUT_H, HUT_D, 0.01)
      side.translate(sx * (HUT_W / 2 - wallT / 2), 0.14 + HUT_H / 2, 0)
      hutParts.push(side)
    }
    const winW = 1.15
    const jambW = (HUT_W - winW) / 2
    for (const sx of [-1, 1] as const) {
      const jamb = bevelBox(jambW, HUT_H, wallT, 0.01)
      jamb.translate(sx * (winW / 2 + jambW / 2), 0.14 + HUT_H / 2, HUT_D / 2 - wallT / 2)
      hutParts.push(jamb)
    }
    const sill = bevelBox(winW, 0.55, wallT, 0.008)
    sill.translate(0, 0.14 + 0.275, HUT_D / 2 - wallT / 2)
    hutParts.push(sill)
    const lintel = bevelBox(winW, 0.78, wallT, 0.008)
    lintel.translate(0, 0.14 + HUT_H - 0.39, HUT_D / 2 - wallT / 2)
    hutParts.push(lintel)

    const door = bevelBox(0.62, 1.55, 0.04, 0.006)
    door.translate(HUT_W / 2 + 0.01, 0.14 + 0.78, -0.15)
    hutParts.push(door)
    const knob = bevelDisc(0.03, 0.03, 0.004, 10)
    knob.rotateY(Math.PI / 2)
    knob.translate(HUT_W / 2 + 0.04, 0.14 + 0.85, -0.02)
    hutParts.push(knob)

    const roofOver = 0.18
    const roofProfile: Array<readonly [number, number]> = [
      [HUT_D / 2 + roofOver, HUT_H + 0.08],
      [0, HUT_H + 0.38],
      [-HUT_D / 2 - roofOver, HUT_H + 0.14],
      [-HUT_D / 2 - roofOver, HUT_H + 0.06],
      [0, HUT_H + 0.28],
      [HUT_D / 2 + roofOver, HUT_H],
    ]
    const roof = loftAlongX(roofProfile, HUT_W + roofOver * 2, { closed: true })
    roof.translate(0, 0.14, 0)
    hutParts.push(roof)

    const plate = bevelBox(0.48, 0.36, 0.05, 0.006)
    plate.translate(-0.72, 1.62, HUT_D / 2 + 0.05)
    hutParts.push(plate)
    const glyph = (ox: number, cells: number[]): void => {
      for (let gy = 0; gy < 5; gy++) {
        for (let gx = 0; gx < 3; gx++) {
          if (!cells[gy * 3 + gx]) continue
          const bit = bevelBox(0.04, 0.04, 0.02, 0.002)
          bit.translate(-0.72 + ox + gx * 0.05, 1.74 - gy * 0.05, HUT_D / 2 + 0.08)
          hutParts.push(bit)
        }
      }
    }
    glyph(-0.12, [0, 1, 0, 1, 1, 0, 0, 1, 0, 0, 1, 0, 1, 1, 1])
    glyph(0.06, [1, 1, 1, 0, 0, 1, 1, 1, 1, 1, 0, 0, 1, 1, 1])

    emit('hut', mergeParts(hutParts, 'hut'), hut, 'hut')

    const glass = bevelBox(winW - 0.12, 0.62, 0.016, 0.003)
    glass.translate(0, 0.14 + 0.55 + 0.34, HUT_D / 2 - 0.02)
    darkParts.push(glass)
    emit('hut', mergeParts(darkParts, 'glass'), hut, 'window', kit.ink)

    const zFace = HUT_D / 2 + 0.02
    const winY = 0.14 + 0.55 + 0.34
    frameParts.push(bevelBox(winW - 0.04, 0.04, 0.03, 0.004).translate(0, winY + 0.33, zFace))
    frameParts.push(bevelBox(winW - 0.04, 0.04, 0.03, 0.004).translate(0, winY - 0.33, zFace))
    frameParts.push(bevelBox(0.04, 0.66, 0.03, 0.004).translate(-(winW / 2 - 0.1), winY, zFace))
    frameParts.push(bevelBox(0.04, 0.66, 0.03, 0.004).translate(winW / 2 - 0.1, winY, zFace))
    frameParts.push(bevelBox(0.03, 0.66, 0.03, 0.004).translate(0, winY, zFace))
    emit('hut', mergeParts(frameParts, 'frame'), hut, 'window-frame', kit.graphite)

    const crewParts: BufferGeometry[] = []
    const helmetParts: BufferGeometry[] = []
    const visorParts: BufferGeometry[] = []
    const poses: Array<readonly [number, number, number]> = [
      [-0.62, HUT_D / 2 + 0.55, 0.15],
      [0.72, HUT_D / 2 + 0.7, -0.25],
    ]
    for (const [x, z, yaw] of poses) {
      crewParts.push(...marshalFigure(x, z, yaw))
      helmetParts.push(helmet(x, z, yaw))
      visorParts.push(visor(x, z, yaw))
    }
    emit('crew', mergeParts(crewParts, 'crew'), crew, 'crew')
    emit('hut', mergeParts(helmetParts, 'helmets'), crew, 'helmets')
    emit('hut', mergeParts(visorParts, 'visors'), crew, 'visors', kit.ink)

    const flagParts: BufferGeometry[] = []
    const poleX = 1.15
    const poleZ = HUT_D / 2 + 0.85
    flagParts.push(tubeSection(0.016, 2.15, [poleX, 1.15, poleZ], [0, 1, 0], 8))
    const cloth = bevelBox(0.72, 0.48, 0.018, 0.004)
    cloth.translate(poleX + 0.38, 1.95, poleZ)
    flagParts.push(cloth)
    emit('flag', mergeParts(flagParts, 'flag'), crew, 'flag')

    const bottle = revolve(
      [[0, 0.04], [0.12, 0.14], [0.55, 0.14], [0.78, 0.1], [0.92, 0.06], [1, 0.02]],
      { yBot: 0.08, yTop: 0.55, scaleW: 0.55, segments: 16 },
    )
    bottle.translate(-HUT_W / 2 - 0.28, 0, HUT_D / 2 + 0.15)
    emit('flag', bottle, hut, 'extinguisher', kit.red)
  }
  rebuild()

  return {
    root,
    parts: { hut, crew },
    materials: materialSlots,
    getConfig: () => ({ ...config }),
    configure() {},
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
  return createF1Preview(createModel(), {
    aspect,
    target: [0.2, 1.2, 0.7],
    distance: 5.8,
    fov: 30,
    pitch: 0.18,
  })
}
