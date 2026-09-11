// f1-marshal-post — trackside observers' hut: painted GRP cabin, mono-pitch corrugated
// roof, recessed track aperture, numbered board, bracket-mounted flag, pad-mounted
// extinguishers. No crew figures.
//
// Datums from a typical FIA marshal post (Silverstone-style hut, ~2.2 m wide):
// hut 2.2 × 2.05 × 1.8 m. The roof is a single 7° pitch whose high eave faces the track,
// so its 0.36 m brow shades a 1.24 × 0.86 m aperture set 0.17 m back into the wall.
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
    mesh.userData.topologyRole = name.includes('glass') || name.includes('lamp') || name.includes('flag') ? 'detail' : 'hull'
    mesh.castShadow = true
    mesh.receiveShadow = true
    meshesBySlot[slot].push(mesh)
    group.add(mesh)
  }

  const rebuild = (): void => {
    releaseGenerated()
    const wallT = 0.08
    // The track face is the thick one: its thickness is the reveal the aperture sits back in.
    const frontT = 0.17
    const y0 = 0.14
    const midY = y0 + HUT_H / 2
    const wallTop = y0 + HUT_H
    const zOut = HUT_D / 2

    // One 7° pitch with the high eave on the track face, so the brow shades the aperture and
    // both eaves stay straight lines. `underAt` is the deck soffit, which the wall head meets.
    const zEaveRear = -(HUT_D / 2 + 0.14)
    const zEaveFront = HUT_D / 2 + 0.36
    const eaveRearY = wallTop + 0.05
    const eaveFrontY = wallTop + 0.33
    const deckT = 0.05
    const deckRun = zEaveFront - zEaveRear
    const deckRise = eaveFrontY - eaveRearY
    const deckPitch = Math.atan2(deckRise, deckRun)
    const underAt = (z: number): number =>
      eaveRearY - deckT + ((z - zEaveRear) / deckRun) * deckRise

    const paintParts: BufferGeometry[] = []

    const pad = bevelBox(3.3, 0.09, 2.5, 0.012)
    pad.translate(-0.02, 0.045, 0.1)
    emit('hut', pad, hut, 'pad', kit.slate)

    const floor = bevelBox(HUT_W, 0.07, HUT_D, 0.008)
    floor.translate(0, 0.115, 0)
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

    const winW = 1.24
    const jambW = (HUT_W - winW) / 2
    const sillH = 0.86
    const headY = y0 + 1.72
    const zFrontMid = zOut - frontT / 2
    for (const sx of [-1, 1] as const) {
      const jamb = bevelBox(jambW, HUT_H, frontT, 0.012)
      jamb.translate(sx * (winW / 2 + jambW / 2), midY, zFrontMid)
      paintParts.push(jamb)
    }
    const sill = bevelBox(winW, sillH, frontT, 0.01)
    sill.translate(0, y0 + sillH / 2, zFrontMid)
    paintParts.push(sill)
    const lintel = bevelBox(winW, wallTop - headY, frontT, 0.01)
    lintel.translate(0, (headY + wallTop) / 2, zFrontMid)
    paintParts.push(lintel)

    // The mono-pitch leaves a wedge between the wall head and the soffit: an upstand across
    // the track face, a matching wedge on each side wall.
    paintParts.push(loftAlongX(
      [
        [zOut - frontT, underAt(zOut - frontT)],
        [zOut, underAt(zOut)],
        [zOut, wallTop],
        [zOut - frontT, wallTop],
      ],
      HUT_W,
    ))
    for (const sx of [-1, 1] as const) {
      const wedge = loftAlongX(
        [
          [-zOut, underAt(-zOut)],
          [zOut, underAt(zOut)],
          [zOut, wallTop],
          [-zOut, wallTop],
        ],
        wallT,
      )
      wedge.translate(sx * (HUT_W / 2 - wallT / 2), 0, 0)
      paintParts.push(wedge)
    }

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

    const sideOver = 0.14
    const deckW = HUT_W + sideOver * 2
    const deck = loftAlongX(
      [
        [zEaveRear, eaveRearY],
        [zEaveFront, eaveFrontY],
        [zEaveFront, eaveFrontY - deckT],
        [zEaveRear, eaveRearY - deckT],
      ],
      deckW,
      { closed: true, stations: 3 },
    )
    uvAlongX(deck, deckW, deckRun)
    emit('hut', deck, hut, 'roof', roofMat)

    // Corrugation runs down the slope like real sheet, so it never enters the eave silhouette.
    const ribRun = deckRun / Math.cos(deckPitch)
    const deckMidZ = (zEaveRear + zEaveFront) / 2
    const deckMidY = eaveRearY + deckRise / 2
    const ribCount = 22
    const ribStep = deckW / ribCount
    const ribs: BufferGeometry[] = []
    for (let i = 0; i < ribCount; i++) {
      const rib = bevelBox(ribStep * 0.54, 0.042, ribRun - 0.06, 0.007)
      rib.rotateX(-deckPitch)
      rib.translate(-deckW / 2 + ribStep * (i + 0.5), deckMidY + 0.019, deckMidZ)
      ribs.push(rib)
    }
    emit('hut', mergeParts(ribs, 'corrugation'), hut, 'roof-corrugation', roofMat)

    const trims: BufferGeometry[] = []
    for (const sx of [-1, 1] as const) {
      const rake = bevelBox(0.05, 0.075, ribRun, 0.006)
      rake.rotateX(-deckPitch)
      rake.translate(sx * (deckW / 2 - 0.02), deckMidY - 0.005, deckMidZ)
      trims.push(rake)
    }
    emit('hut', mergeParts(trims, 'rake'), hut, 'roof-trim', kit.steel)
    const ridge = bevelBox(deckW + 0.02, 0.095, 0.055, 0.008)
    ridge.translate(0, eaveFrontY - 0.022, zEaveFront + 0.022)
    emit('hut', ridge, hut, 'ridge', kit.steel)
    const eaveTrim = bevelBox(deckW + 0.02, 0.07, 0.055, 0.008)
    eaveTrim.translate(0, eaveRearY + 0.006, zEaveRear + 0.016)
    emit('hut', eaveTrim, hut, 'roof-eave-trim', kit.steel)
    const gutter = bevelBox(deckW, 0.055, 0.075, 0.006)
    gutter.translate(0, eaveRearY - deckT - 0.02, zEaveRear - 0.02)
    emit('hut', gutter, hut, 'gutter', kit.graphite)
    const purlin = bevelBox(deckW - 0.1, 0.055, 0.07, 0.006)
    purlin.translate(0, underAt(zEaveFront - 0.12) - 0.03, zEaveFront - 0.12)
    emit('hut', purlin, hut, 'roof-purlin', kit.graphite)
    for (const sx of [-1, 1] as const) {
      const knee = member(
        new Vector3(sx * 0.94, wallTop - 0.22, zOut - 0.02),
        new Vector3(sx * 0.94, underAt(zEaveFront - 0.14) - 0.04, zEaveFront - 0.14),
        0.015,
        8,
      )
      emit('hut', knee, hut, `roof-brace-${sx > 0 ? 'r' : 'l'}`, kit.steel)
    }

    // Number board on the left jamb, in the 3:2 the plate atlas is drawn at.
    const plateX = -(winW / 2 + jambW / 2)
    const plateY = y0 + 1.34
    const plateZ = zOut + 0.018
    const plate = bevelBox(0.42, 0.29, 0.05, 0.006)
    plate.translate(plateX, plateY, plateZ)
    emit('hut', plate, hut, 'plate-back', kit.graphite)
    const face = new PlaneGeometry(0.345, 0.23)
    face.translate(plateX, plateY, plateZ + 0.025 + LAYER_CLEARANCE)
    emit('hut', face, hut, 'plate', plateMat)
    for (const sx of [-1, 1] as const) {
      for (const sy of [-1, 1] as const) {
        emit(
          'hut',
          bolt([plateX + sx * 0.175, plateY + sy * 0.115, plateZ + 0.018], 0.009, 0.013, AXIS_Z),
          hut,
          `plate-bolt-${sy > 0 ? 't' : 'b'}${sx > 0 ? 'r' : 'l'}`,
          kit.steel,
        )
      }
    }

    const zRev = zOut - frontT
    const zFrame = zRev + 0.045
    const winH = headY - (y0 + sillH)
    const winY = (headY + y0 + sillH) / 2
    const glass = bevelBox(winW - 0.08, winH - 0.08, 0.016, 0.003)
    glass.translate(0, winY, zFrame - 0.045)
    emit('hut', glass, hut, 'window-lower', glassMat)
    // Top-hung sash propped open inside the reveal, so nothing breaks the wall plane.
    const sash = bevelBox(winW - 0.14, 0.30, 0.018, 0.003)
    sash.rotateX(-0.34)
    sash.translate(0, headY - 0.16, zFrame + 0.035)
    emit('hut', sash, hut, 'window-hinged', glassMat)
    const stay = member(
      new Vector3(winW / 2 - 0.18, headY - 0.30, zFrame + 0.085),
      new Vector3(winW / 2 - 0.18, headY - 0.05, zFrame - 0.01),
      0.008,
      6,
    )
    emit('hut', stay, hut, 'window-stay', kit.steel)
    const cavity = bevelBox(winW - 0.04, winH - 0.04, 0.12, 0.004)
    cavity.translate(0, winY, zRev - 0.085)
    emit('hut', cavity, hut, 'cavity', kit.ink)
    const workShelf = bevelBox(winW - 0.06, 0.05, 0.44, 0.008)
    workShelf.translate(0, y0 + sillH + 0.025, zRev - 0.2)
    emit('hut', workShelf, hut, 'observer-work-shelf', kit.slate)
    const drip = bevelBox(winW + 0.14, 0.05, 0.11, 0.008)
    drip.translate(0, y0 + sillH - 0.01, zOut + 0.03)
    emit('hut', drip, hut, 'window-sill-drip', kit.graphite)

    const frameParts: BufferGeometry[] = []
    frameParts.push(bevelBox(winW, 0.05, 0.055, 0.005).translate(0, headY - 0.025, zFrame))
    frameParts.push(bevelBox(winW, 0.05, 0.055, 0.005).translate(0, y0 + sillH + 0.025, zFrame))
    for (const sx of [-1, 1] as const) {
      frameParts.push(bevelBox(0.05, winH, 0.055, 0.005).translate(sx * (winW / 2 - 0.025), winY, zFrame))
    }
    frameParts.push(bevelBox(0.04, winH, 0.05, 0.004).translate(0, winY, zFrame))
    emit('hut', mergeParts(frameParts, 'frame'), hut, 'window-frame', kit.graphite)
    const bz = zOut + 0.018
    for (const sx of [-1, 1] as const) {
      for (const sy of [-1, 1] as const) {
        emit(
          'hut',
          bolt([sx * (winW / 2 + 0.07), winY + sy * (winH / 2 - 0.06), bz], 0.009, 0.012, AXIS_Z),
          hut,
          `win-bolt-${sy > 0 ? 't' : 'b'}${sx > 0 ? 'r' : 'l'}`,
          kit.steel,
        )
      }
    }

    // The flag is bracket hardware first: a bolted plate, two cleats gripping the staff and a
    // lanyard to a horn cleat. The cloth then hangs off that staff instead of floating beside
    // the hut, which is what a free-standing pole read costs you.
    const braceX = winW / 2 + jambW / 2
    const braceY = y0 + 1.10
    const braceZ = zOut + 0.013
    const bracket = bevelBox(0.15, 0.34, 0.04, 0.006)
    bracket.translate(braceX, braceY + 0.12, braceZ)
    emit('hut', bracket, hut, 'flag-bracket-plate', kit.graphite)
    for (const sy of [-1, 1] as const) {
      emit(
        'hut',
        bolt([braceX, braceY + 0.12 + sy * 0.13, braceZ + 0.014], 0.009, 0.013, AXIS_Z),
        hut,
        `flag-bracket-bolt-${sy > 0 ? 't' : 'b'}`,
        kit.steel,
      )
    }
    const staffLean = 0.60
    const staffSwing = 0.46
    const staffDir = new Vector3(
      Math.cos(staffLean) * Math.cos(staffSwing),
      Math.sin(staffLean),
      Math.cos(staffLean) * Math.sin(staffSwing),
    )
    const staffRoot = new Vector3(braceX, braceY, braceZ + 0.05)
    emit(
      'hut',
      member(staffRoot, staffRoot.clone().addScaledVector(staffDir, 1.12), 0.016, 10),
      hut,
      'flag-staff',
      kit.steel,
    )
    for (const [index, t] of [0.07, 0.26].entries()) {
      const at = staffRoot.clone().addScaledVector(staffDir, t)
      emit(
        'hut',
        member(
          at.clone().addScaledVector(staffDir, -0.03),
          at.clone().addScaledVector(staffDir, 0.03),
          0.037,
          10,
        ),
        hut,
        `flag-cleat-${index + 1}`,
        kit.steel,
      )
    }
    const horn = bevelBox(0.05, 0.10, 0.06, 0.008)
    horn.translate(braceX, braceY - 0.14, braceZ + 0.05)
    emit('hut', horn, hut, 'flag-cleat-horn', kit.steel)
    emit(
      'hut',
      member(
        new Vector3(braceX, braceY - 0.13, braceZ + 0.07),
        staffRoot.clone().addScaledVector(staffDir, 0.62),
        0.006,
        6,
      ),
      hut,
      'flag-lanyard',
      kit.graphite,
    )
    // A drape roughly 20 mm thick over a 0.6 m drop. Anything fatter reads as a rolled mat.
    emit(
      'flag',
      member(
        staffRoot.clone().addScaledVector(staffDir, 0.4),
        staffRoot.clone().addScaledVector(staffDir, 1.04),
        0.055,
        12,
      ),
      crew,
      'flag',
    )
    for (const [index, t] of [0.56, 0.9].entries()) {
      const at = staffRoot.clone().addScaledVector(staffDir, t)
      emit(
        'hut',
        member(
          at.clone().addScaledVector(staffDir, -0.011),
          at.clone().addScaledVector(staffDir, 0.011),
          0.063,
          12,
        ),
        hut,
        `flag-tie-${index + 1}`,
        kit.graphite,
      )
    }
    // The loose corner is what tells you the furl is cloth and not a tube.
    const tailLen = 0.3
    const tail = loftAlongX(
      [
        [0.0, 0.0],
        [0.02, -0.1],
        [0.006, -0.2],
        [0.024, -0.29],
        [0.002, -0.37],
        [-0.014, -0.29],
        [-0.002, -0.2],
        [-0.016, -0.1],
      ],
      tailLen,
      { closed: true, stations: 5 },
    )
    tail.translate(0.74 + tailLen / 2, -0.042, 0)
    tail.rotateZ(staffLean)
    tail.rotateY(-staffSwing)
    tail.translate(staffRoot.x, staffRoot.y, staffRoot.z)
    emit('flag', tail, crew, 'flag-tail')

    const rackX = -0.82
    const rackZ = zOut + 0.34
    const rackBack = bevelBox(0.92, 0.62, 0.08, 0.008)
    rackBack.translate(rackX, 0.37, rackZ - 0.17)
    emit('hut', rackBack, hut, 'extinguisher-rack', kit.graphite)
    const rackCanopy = bevelBox(1.0, 0.055, 0.46, 0.012)
    rackCanopy.translate(rackX, 0.73, rackZ - 0.06)
    emit('hut', rackCanopy, hut, 'extinguisher-weather-cover', kit.slate)
    for (let i = 0; i < 3; i++) {
      const x = rackX - 0.28 + i * 0.28
      const bottle = new CylinderGeometry(0.105, 0.105, 0.48, 16)
      bottle.translate(x, 0.32, rackZ)
      emit('flag', bottle, hut, `extinguisher-${i + 1}`, kit.red)
      const shoulder = new CylinderGeometry(0.055, 0.095, 0.10, 12)
      shoulder.translate(x, 0.61, rackZ)
      emit('flag', shoulder, hut, `extinguisher-shoulder-${i + 1}`, kit.red)
      const valve = tubeSection(0.025, 0.10, [x, 0.71, rackZ], [0, 1, 0], 8)
      emit('hut', valve, hut, `extinguisher-valve-${i + 1}`, kit.steel)
      const handle = bevelBox(0.15, 0.10, 0.04, 0.008)
      handle.translate(x, 0.72, rackZ)
      emit('hut', handle, hut, `extinguisher-handle-${i + 1}`, kit.graphite)
      const hose = member(
        new Vector3(x + 0.07, 0.66, rackZ + 0.05),
        new Vector3(x + 0.13, 0.39, rackZ + 0.07),
        0.012,
        8,
      )
      emit('hut', hose, hut, `extinguisher-hose-${i + 1}`, kit.graphite)
      const label = bevelBox(0.11, 0.18, 0.015, 0.004)
      label.translate(x, 0.34, rackZ + 0.108)
      emit('hut', label, hut, `extinguisher-label-${i + 1}`, kit.shell)
      const restraint = bevelBox(0.28, 0.055, 0.025, 0.006)
      restraint.translate(x, 0.42, rackZ + 0.115)
      emit('hut', restraint, hut, `extinguisher-restraint-${i + 1}`, kit.graphite)
    }

    // Spares are furled around their staffs and leaning in the bin, not standing as bare rods.
    const binX = HUT_W / 2 + 0.3
    const binZ = 0.3
    const flagStore = bevelBox(0.32, 0.36, 0.44, 0.012)
    flagStore.translate(binX, 0.264, binZ)
    emit('hut', flagStore, hut, 'flag-storage-bin', kit.graphite)
    for (let i = 0; i < 2; i++) {
      const lean = 0.19 + i * 0.055
      const foot = new Vector3(binX - 0.04, 0.36, binZ - 0.11 + i * 0.18)
      const head = foot.clone().add(new Vector3(Math.sin(lean) * 0.86, 0.84, -Math.sin(lean) * 0.18))
      emit('hut', member(foot, head, 0.012, 6), hut, `stored-pole-${i + 1}`, kit.steel)
      emit(
        'flag',
        member(foot.clone().lerp(head, 0.52), foot.clone().lerp(head, 0.98), 0.024, 8),
        crew,
        `stored-flag-${i + 1}`,
      )
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
    target: [0.02, 1.1, 0.06],
    distance: 8.2,
    fov: 30,
    yaw: 0.44,
    pitch: 0.31,
    ground: true,
  })
}
