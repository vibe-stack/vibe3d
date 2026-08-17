// f1-marshal-post — trackside observers' hut: painted GRP cabin, corrugated roof, recessed
// track window, numbered board, planted yellow flag, pad-mounted extinguisher. No crew figures.
//
// Datums from a typical FIA marshal post (Silverstone-style hut, ~2.2 m wide):
// hut 2.2 × 2.05 × 1.8 m, roof overhang 0.18 m, window 1.15 × 0.72 m on the track face.

import {
  BufferGeometry,
  Float32BufferAttribute,
  Group,
  Mesh,
  MeshPhysicalMaterial,
  PlaneGeometry,
  type Material,
} from 'three/webgpu'

import {
  acquireF1Materials,
  bevelBox,
  bevelDisc,
  createF1Preview,
  disposeF1Materials,
  loftAlongX,
  marshalPlateTexture,
  mergeParts,
  revolve,
  roofSheetTexture,
  tubeSection,
  uvAlongX,
  LAYER_CLEARANCE,
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
  const config: F1MarshalPostConfig = {}
  const bundle = acquireF1Materials()
  const kit = bundle.materials
  const extras: Material[] = []
  const own = (material: Material): Material => {
    extras.push(material)
    return material
  }

  const roofMap = roofSheetTexture(128)
  const plateMap = marshalPlateTexture('12')
  const paint = options.materials?.hut ?? own(new MeshPhysicalMaterial({
    name: 'f1-kit / marshal paint',
    color: 0xd9e6e9,
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
  const plateMat = own(new MeshPhysicalMaterial({
    name: 'f1-kit / marshal plate',
    map: plateMap,
    roughness: 0.55,
    metalness: 0.08,
  }))

  const materialSlots: Record<Slot, Material> = {
    hut: paint,
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
    for (const sx of [-1, 1] as const) {
      const side = bevelBox(wallT, HUT_H, HUT_D, 0.01)
      side.translate(sx * (HUT_W / 2 - wallT / 2), midY, 0)
      paintParts.push(side)
    }
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

    const door = bevelBox(0.62, 1.55, 0.04, 0.006)
    door.translate(HUT_W / 2 + 0.01, y0 + 0.78, -0.15)
    paintParts.push(door)
    const kick = bevelBox(0.58, 0.22, 0.02, 0.004)
    kick.translate(HUT_W / 2 + 0.03, y0 + 0.22, -0.15)
    emit('hut', kick, hut, 'kick', kit.graphite)
    const knob = bevelDisc(0.03, 0.03, 0.004, 10)
    knob.rotateY(Math.PI / 2)
    knob.translate(HUT_W / 2 + 0.04, y0 + 0.85, -0.02)
    emit('hut', knob, hut, 'knob', kit.steel)

    emit('hut', uvPlanar(mergeParts(paintParts, 'cabin')), hut, 'cabin', paint)

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

    const plate = bevelBox(0.52, 0.38, 0.04, 0.006)
    plate.translate(-0.72, 1.62, HUT_D / 2 + 0.04)
    emit('hut', plate, hut, 'plate-back', kit.graphite)
    const face = new PlaneGeometry(0.46, 0.32)
    face.translate(-0.72, 1.62, HUT_D / 2 + 0.04 + LAYER_CLEARANCE + 0.02)
    emit('hut', face, hut, 'plate', plateMat)

    const zFace = HUT_D / 2 + 0.02
    const winY = y0 + 0.55 + 0.34
    const glass = bevelBox(winW - 0.16, 0.58, 0.018, 0.003)
    glass.translate(0, winY, HUT_D / 2 - wallT - LAYER_CLEARANCE)
    emit('hut', glass, hut, 'window', glassMat)
    const cavity = bevelBox(winW - 0.2, 0.54, 0.08, 0.004)
    cavity.translate(0, winY, HUT_D / 2 - wallT - 0.08)
    emit('hut', cavity, hut, 'cavity', kit.ink)

    const frameParts: BufferGeometry[] = []
    frameParts.push(bevelBox(winW - 0.04, 0.045, 0.035, 0.004).translate(0, winY + 0.33, zFace))
    frameParts.push(bevelBox(winW - 0.04, 0.045, 0.035, 0.004).translate(0, winY - 0.33, zFace))
    frameParts.push(bevelBox(0.045, 0.66, 0.035, 0.004).translate(-(winW / 2 - 0.1), winY, zFace))
    frameParts.push(bevelBox(0.045, 0.66, 0.035, 0.004).translate(winW / 2 - 0.1, winY, zFace))
    frameParts.push(bevelBox(0.035, 0.66, 0.035, 0.004).translate(0, winY, zFace))
    emit('hut', mergeParts(frameParts, 'frame'), hut, 'window-frame', kit.graphite)

    const flagParts: BufferGeometry[] = []
    const poleX = 1.15
    const poleZ = HUT_D / 2 + 0.55
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
    distance: 6.2,
    fov: 30,
    pitch: 0.16,
    ground: true,
  })
}
