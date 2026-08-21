// f1-marshal-post — trackside observers' hut: painted GRP cabin, corrugated roof, recessed
// track window, numbered board, planted flag, pad-mounted extinguisher. No crew figures.
//
// Datums from a typical FIA marshal post (Silverstone-style hut, ~2.2 m wide):
// hut 2.2 × 2.05 × 1.8 m, roof overhang 0.18 m, window 1.15 × 0.72 m on the track face.
// configure({ number, flag }).

import {
  BufferGeometry,
  CylinderGeometry,
  Float32BufferAttribute,
  Group,
  Mesh,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  Vector3,
  type Material,
} from 'three/webgpu'

import {
  TOKEN,
  AXIS_X,
  AXIS_Z,
  acquireF1Materials,
  bevelBox,
  bevelDisc,
  bolt,
  createF1Preview,
  disposeF1Materials,
  loftAlongX,
  marshalPlateTexture,
  paintedShellTexture,
  member,
  mergeParts,
  roofSheetTexture,
  tubeSection,
  uvAlongX,
  LAYER_CLEARANCE,
} from '../f1-kit-core/index.ts'

type Slot = 'hut' | 'crew' | 'flag'

export type F1MarshalFlag = 'yellow' | 'green' | 'blue' | 'red'

export interface F1MarshalPostConfig {
  /** 1–3 character post number, drawn from the shared 3×5 atlas. */
  number: string
  flag: F1MarshalFlag
}

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

const FLAG_COLOR: Record<F1MarshalFlag, number> = {
  yellow: TOKEN.AMBER_400,
  green: TOKEN.FIELD_500,
  blue: TOKEN.COBALT_500,
  red: TOKEN.RED_500,
}

function sanitizeNumber(value: string): string {
  const next = value.replace(/[^0-9A-Za-z]/g, '').slice(0, 3).toUpperCase()
  return next || '11'
}

function uvPlanar(geometry: BufferGeometry): BufferGeometry {
  const pos = geometry.getAttribute('position')
  if (!pos) return geometry
  const uvs = new Float32Array(pos.count * 2)
  for (let i = 0; i < pos.count; i++) {
    uvs[i * 2] = pos.getX(i) * 0.4 + 0.5
    uvs[i * 2 + 1] = pos.getY(i) * 0.4
  }
  geometry.setAttribute('uv', new Float32BufferAttribute(uvs, 2))
  return geometry
}

export function createModel(options: F1MarshalPostOptions = {}): F1MarshalPostInstance {
  const config: F1MarshalPostConfig = {
    number: sanitizeNumber(options.number ?? '11'),
    flag: options.flag ?? 'yellow',
  }
  const bundle = acquireF1Materials()
  const kit = bundle.materials
  const extras: Material[] = []
  const own = (material: Material): Material => {
    extras.push(material)
    return material
  }

  const paintMap = paintedShellTexture(128)
  const roofMap = roofSheetTexture(128)
  let plateMap = marshalPlateTexture(config.number)
  const paint = options.materials?.hut ?? own(new MeshPhysicalMaterial({
    name: 'f1-kit / marshal paint',
    map: paintMap,
    color: 0xffffff,
    roughness: 0.36,
    metalness: 0.08,
    clearcoat: 0.42,
    clearcoatRoughness: 0.32,
  }))
  const roofMat = own(new MeshPhysicalMaterial({
    name: 'f1-kit / marshal roof',
    map: roofMap,
    color: 0xc8d0d4,
    roughness: 0.38,
    metalness: 0.62,
    clearcoat: 0.08,
  }))
  const glassMat = own(new MeshPhysicalMaterial({
    name: 'f1-kit / marshal glass',
    color: 0x0a1218,
    roughness: 0.06,
    metalness: 0.12,
    transparent: true,
    opacity: 0.72,
    transmission: 0.35,
    thickness: 0.02,
  }))
  const plateMat = new MeshPhysicalMaterial({
    name: 'f1-kit / marshal plate',
    map: plateMap,
    roughness: 0.55,
    metalness: 0.08,
  })
  own(plateMat)
  const ownsFlag = options.materials?.flag === undefined
  const flagMat = options.materials?.flag ?? own(kit.amber.clone())
  if (ownsFlag) (flagMat as MeshStandardMaterial).color.set(FLAG_COLOR[config.flag])

  const materialSlots: Record<Slot, Material> = {
    hut: paint,
    crew: options.materials?.crew ?? kit.orange,
    flag: flagMat,
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
    const wallT = 0.08
    const y0 = 0.14
    const midY = y0 + HUT_H / 2
    const paintParts: BufferGeometry[] = []

    const pad = bevelBox(2.8, 0.08, 2.4, 0.01)
    pad.translate(0, 0.04, 0.1)
    emit('hut', pad, hut, 'pad', kit.slate)

    const floor = bevelBox(HUT_W, 0.06, HUT_D, 0.008)
    floor.translate(0, 0.11, 0)
    emit('hut', floor, hut, 'floor', kit.graphite)

    const rear = bevelBox(HUT_W, HUT_H, wallT, 0.01)
    rear.translate(0, midY, -HUT_D / 2 + wallT / 2)
    paintParts.push(rear)
    const leftSide = bevelBox(wallT, HUT_H, HUT_D, 0.01)
    leftSide.translate(-(HUT_W / 2 - wallT / 2), midY, 0)
    paintParts.push(leftSide)
    const doorCentreZ = -0.15
    const doorW = 0.72
    const doorH = 1.84
    const rearSide = bevelBox(wallT, HUT_H, 0.39, 0.01)
    rearSide.translate(HUT_W / 2 - wallT / 2, midY, -0.705)
    paintParts.push(rearSide)
    const frontSide = bevelBox(wallT, HUT_H, 0.69, 0.01)
    frontSide.translate(HUT_W / 2 - wallT / 2, midY, 0.555)
    paintParts.push(frontSide)
    const doorLintel = bevelBox(wallT, HUT_H - doorH, doorW, 0.008)
    doorLintel.translate(HUT_W / 2 - wallT / 2, y0 + doorH + (HUT_H - doorH) / 2, doorCentreZ)
    paintParts.push(doorLintel)
    const winW = 1.15
    const jambW = (HUT_W - winW) / 2
    for (const sx of [-1, 1] as const) {
      const jamb = bevelBox(jambW, HUT_H, wallT, 0.01)
      jamb.translate(sx * (winW / 2 + jambW / 2), midY, HUT_D / 2 - wallT / 2)
      paintParts.push(jamb)
    }
    const sill = bevelBox(winW, 0.55, wallT, 0.008)
    sill.translate(0, y0 + 0.275, HUT_D / 2 - wallT / 2)
    paintParts.push(sill)
    const lintel = bevelBox(winW, 0.78, wallT, 0.008)
    lintel.translate(0, y0 + HUT_H - 0.39, HUT_D / 2 - wallT / 2)
    paintParts.push(lintel)

    const doorX = HUT_W / 2 + 0.025
    const door = bevelBox(0.045, doorH - 0.04, doorW - 0.04, 0.008)
    door.translate(doorX, y0 + doorH / 2, doorCentreZ)
    emit('hut', uvPlanar(door), hut, 'door', paint)
    const kick = bevelBox(0.026, 0.24, doorW - 0.10, 0.004)
    kick.translate(doorX + 0.026, y0 + 0.22, doorCentreZ)
    emit('hut', kick, hut, 'door-kick', kit.graphite)
    const knob = bevelDisc(0.03, 0.03, 0.004, 10)
    knob.rotateY(Math.PI / 2)
    knob.translate(doorX + 0.045, y0 + 0.96, doorCentreZ + doorW * 0.30)
    emit('hut', knob, hut, 'door-knob', kit.steel)
    for (const hingeY of [y0 + 0.36, y0 + 1.46] as const) {
      const hinge = tubeSection(0.018, 0.18, [doorX + 0.045, hingeY, doorCentreZ - doorW / 2], [0, 1, 0], 8)
      emit('hut', hinge, hut, `door-hinge-${hingeY}`, kit.steel)
      emit('hut', bolt([doorX + 0.05, hingeY, doorCentreZ - doorW / 2 + 0.05], 0.01, 0.014, AXIS_X), hut, `door-bolt-${hingeY}`, kit.steel)
    }

    for (const part of paintParts) uvPlanar(part)
    emit('hut', mergeParts(paintParts, 'cabin'), hut, 'cabin', paint)

    const roofOver = 0.18
    const z0 = -HUT_D / 2 - roofOver
    const z1 = HUT_D / 2 + roofOver
    const corrugations = 16
    const outer: Array<readonly [number, number]> = []
    const inner: Array<readonly [number, number]> = []
    for (let i = 0; i <= corrugations; i++) {
      const t = i / corrugations
      const z = z0 + (z1 - z0) * t
      const gable = t < 0.5
        ? HUT_H + 0.08 + t * 2 * 0.3
        : HUT_H + 0.38 - (t - 0.5) * 2 * 0.24
      const wave = (i % 2 === 0 ? 0 : 0.045)
      outer.push([z, gable + wave])
      inner.push([z, gable + wave - 0.035])
    }
    const roofProfile = [...outer, ...inner.reverse()]
    const roof = loftAlongX(roofProfile, HUT_W + roofOver * 2, { closed: true, stations: 4 })
    roof.translate(0, y0, 0)
    uvAlongX(roof, HUT_W + roofOver * 2, HUT_D + roofOver * 2)
    emit('hut', roof, hut, 'roof', roofMat)
    const ridge = bevelBox(HUT_W + roofOver * 2, 0.04, 0.08, 0.006)
    ridge.translate(0, y0 + HUT_H + 0.4, 0)
    emit('hut', ridge, hut, 'ridge', kit.steel)
    const gutter = bevelBox(HUT_W + roofOver * 2, 0.04, 0.06, 0.004)
    gutter.translate(0, y0 + HUT_H + 0.02, HUT_D / 2 + roofOver)
    emit('hut', gutter, hut, 'gutter', kit.graphite)

    const plate = bevelBox(0.70, 0.50, 0.04, 0.006)
    plate.translate(-0.70, 1.62, HUT_D / 2 + 0.04)
    emit('hut', plate, hut, 'plate-back', kit.graphite)
    const face = new PlaneGeometry(0.62, 0.42)
    face.translate(-0.70, 1.62, HUT_D / 2 + 0.04 + LAYER_CLEARANCE + 0.02)
    emit('hut', face, hut, 'plate', plateMat)

    const zFace = HUT_D / 2 + 0.02
    const winY = y0 + 0.55 + 0.34
    const lowerGlass = bevelBox(winW - 0.16, 0.25, 0.018, 0.003)
    lowerGlass.translate(0, winY - 0.16, HUT_D / 2 - wallT - LAYER_CLEARANCE)
    emit('hut', lowerGlass, hut, 'window-lower', glassMat)
    const upperGlass = bevelBox(winW - 0.16, 0.27, 0.018, 0.003)
    upperGlass.rotateX(-0.22)
    upperGlass.translate(0, winY + 0.17, zFace + 0.12)
    emit('hut', upperGlass, hut, 'window-hinged', glassMat)
    const cavity = bevelBox(winW - 0.2, 0.54, 0.08, 0.004)
    cavity.translate(0, winY, HUT_D / 2 - wallT - 0.08)
    emit('hut', cavity, hut, 'cavity', kit.ink)
    const workShelf = bevelBox(winW - 0.20, 0.045, 0.34, 0.008)
    workShelf.translate(0, winY - 0.34, HUT_D / 2 - 0.24)
    emit('hut', workShelf, hut, 'observer-work-shelf', kit.slate)

    const frameParts: BufferGeometry[] = []
    frameParts.push(bevelBox(winW - 0.04, 0.045, 0.035, 0.004).translate(0, winY + 0.33, zFace))
    frameParts.push(bevelBox(winW - 0.04, 0.045, 0.035, 0.004).translate(0, winY - 0.33, zFace))
    frameParts.push(bevelBox(0.045, 0.66, 0.035, 0.004).translate(-(winW / 2 - 0.1), winY, zFace))
    frameParts.push(bevelBox(0.045, 0.66, 0.035, 0.004).translate(winW / 2 - 0.1, winY, zFace))
    frameParts.push(bevelBox(0.035, 0.66, 0.035, 0.004).translate(0, winY, zFace))
    emit('hut', mergeParts(frameParts, 'frame'), hut, 'window-frame', kit.graphite)
    const bz = zFace + 0.02
    emit('hut', bolt([-(winW / 2 - 0.1), winY + 0.28, bz], 0.009, 0.012, AXIS_Z), hut, 'win-bolt-tl', kit.steel)
    emit('hut', bolt([winW / 2 - 0.1, winY + 0.28, bz], 0.009, 0.012, AXIS_Z), hut, 'win-bolt-tr', kit.steel)
    emit('hut', bolt([-(winW / 2 - 0.1), winY - 0.28, bz], 0.009, 0.012, AXIS_Z), hut, 'win-bolt-bl', kit.steel)
    emit('hut', bolt([winW / 2 - 0.1, winY - 0.28, bz], 0.009, 0.012, AXIS_Z), hut, 'win-bolt-br', kit.steel)

    const flagParts: BufferGeometry[] = []
    const poleX = 1.15
    const poleZ = HUT_D / 2 + 0.55
    flagParts.push(tubeSection(0.016, 2.15, [poleX, 1.15, poleZ], [0, 1, 0], 8))
    const cloth = loftAlongX(
      [[0.0, 0.0], [0.012, 0.02], [0.01, 0.46], [0.0, 0.48], [-0.004, 0.24]],
      0.72,
      { closed: true, stations: 6 },
    )
    cloth.translate(poleX + 0.38, 1.71, poleZ)
    flagParts.push(cloth)
    emit('flag', mergeParts(flagParts, 'flag'), crew, 'flag')

    const rackBack = bevelBox(0.08, 0.62, 1.20, 0.008)
    rackBack.translate(-HUT_W / 2 - 0.18, 0.37, 0.42)
    emit('hut', rackBack, hut, 'extinguisher-rack', kit.graphite)
    const rackCanopy = bevelBox(0.46, 0.055, 1.28, 0.012)
    rackCanopy.translate(-HUT_W / 2 - 0.28, 0.73, 0.42)
    emit('hut', rackCanopy, hut, 'extinguisher-weather-cover', kit.slate)
    for (let i = 0; i < 3; i++) {
      const z = 0.04 + i * 0.38
      const bottle = new CylinderGeometry(0.105, 0.105, 0.48, 16)
      bottle.translate(-HUT_W / 2 - 0.29, 0.32, z)
      emit('flag', bottle, hut, `extinguisher-${i + 1}`, kit.red)
      const shoulder = new CylinderGeometry(0.055, 0.095, 0.10, 12)
      shoulder.translate(-HUT_W / 2 - 0.29, 0.61, z)
      emit('flag', shoulder, hut, `extinguisher-shoulder-${i + 1}`, kit.red)
      const valve = tubeSection(0.025, 0.10, [-HUT_W / 2 - 0.29, 0.71, z], [0, 1, 0], 8)
      emit('hut', valve, hut, `extinguisher-valve-${i + 1}`, kit.steel)
      const handle = bevelBox(0.04, 0.10, 0.15, 0.008)
      handle.translate(-HUT_W / 2 - 0.29, 0.72, z)
      emit('hut', handle, hut, `extinguisher-handle-${i + 1}`, kit.graphite)
      const hose = member(
        new Vector3(-HUT_W / 2 - 0.34, 0.66, z + 0.07),
        new Vector3(-HUT_W / 2 - 0.36, 0.39, z + 0.13),
        0.012,
        8,
      )
      emit('hut', hose, hut, `extinguisher-hose-${i + 1}`, kit.graphite)
      const label = bevelBox(0.015, 0.18, 0.11, 0.004)
      label.translate(-HUT_W / 2 - 0.40, 0.34, z)
      emit('hut', label, hut, `extinguisher-label-${i + 1}`, kit.shell)
      const restraint = bevelBox(0.025, 0.055, 0.28, 0.006)
      restraint.translate(-HUT_W / 2 - 0.41, 0.42, z)
      emit('hut', restraint, hut, `extinguisher-restraint-${i + 1}`, kit.graphite)
    }

    const flagStore = bevelBox(0.52, 0.34, 0.28, 0.012)
    flagStore.translate(0.82, 0.25, HUT_D / 2 + 0.32)
    emit('hut', flagStore, hut, 'flag-storage-bin', kit.graphite)
    for (let i = 0; i < 3; i++) {
      const storedPole = tubeSection(0.012, 0.82, [0.67 + i * 0.15, 0.73, HUT_D / 2 + 0.32], [0, 1, 0], 6)
      emit('flag', storedPole, crew, `stored-flag-${i + 1}`)
    }
  }
  rebuild()

  return {
    root,
    parts: { hut, crew },
    materials: materialSlots,
    getConfig: () => ({ ...config }),
    configure(patch) {
      if (patch.number !== undefined) {
        config.number = sanitizeNumber(patch.number)
        plateMap.dispose()
        plateMap = marshalPlateTexture(config.number)
        plateMat.map = plateMap
        plateMat.needsUpdate = true
      }
      if (patch.flag !== undefined) {
        config.flag = patch.flag
        if (ownsFlag) (materialSlots.flag as MeshStandardMaterial).color.set(FLAG_COLOR[config.flag])
      }
    },
    setMaterial(slot, material) {
      materialSlots[slot] = material
      for (const mesh of meshesBySlot[slot]) mesh.material = material
    },
    update: () => {},
    dispose() {
      releaseGenerated()
      paintMap.dispose()
      roofMap.dispose()
      plateMap.dispose()
      for (const material of extras) material.dispose()
      disposeF1Materials(bundle)
      root.removeFromParent()
    },
  }
}

export function createPreview({ aspect }: { aspect: number; time?: number }) {
  return createF1Preview(createModel(), {
    aspect,
    target: [0.1, 1.25, 0.15],
    distance: 6.8,
    fov: 30,
    yaw: 0.52,
    pitch: 0.16,
    ground: true,
  })
}
