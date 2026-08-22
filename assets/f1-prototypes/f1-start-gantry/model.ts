// f1-start-gantry — start/finish overhead: lattice posts, lofted box-truss beam, walkway, cameras,
// a blank banner slot, and a five-column start-light panel hung UNDER the beam (clear of the truss).
//
// Datums: 14 m span, 7.2 m soffit, 0.7 × 0.7 m box truss. No circuit or championship lettering.

import {
  BufferGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  SpotLight,
  Vector3,
  type Material,
} from 'three/webgpu'

import {
  acquireF1Materials,
  applyPolarCapUVs,
  bevelBox,
  bevelDisc,
  bevelRing,
  createF1Preview,
  disposeF1Materials,
  loftAlongX,
  loftRoundedBox,
  member,
  mergeParts,
  LAYER_CLEARANCE,
  createLampMaterial,
} from '../f1-kit-core/index.ts'

type Slot = 'post' | 'beam' | 'banner'

export interface F1StartGantryConfig {
  span: number
  height: number
}

export interface F1StartGantryOptions extends Partial<F1StartGantryConfig> {
  materials?: Partial<Record<Slot, Material>>
}

export interface F1StartGantryInstance {
  readonly root: Group
  readonly parts: { posts: Group; beam: Group; banner: Group }
  readonly materials: Readonly<Record<Slot, Material>>
  getConfig(): Readonly<F1StartGantryConfig>
  configure(patch: Partial<F1StartGantryConfig>): void
  setMaterial(slot: Slot, material: Material): void
  update(deltaSeconds: number): void
  dispose(): void
}

const defaults: F1StartGantryConfig = { span: 14, height: 7.2 }
const LIGHT_PITCH = 0.5
const HOUSE_W = 0.26
const HOUSE_H = 0.9
const HOUSE_D = 0.18
const LAMP_R = 0.055
const LENS_THICK = 0.01
const WELL_DEPTH = 0.012
const DOME_THICK = 0.003

export function createModel(options: F1StartGantryOptions = {}): F1StartGantryInstance {
  const config: F1StartGantryConfig = {
    span: Math.max(6, options.span ?? defaults.span),
    height: Math.max(4, options.height ?? defaults.height),
  }

  const bundle = acquireF1Materials()
  const kit = bundle.materials
  const extras: Material[] = []
  const lampOn = createLampMaterial({ on: true, name: 'f1-kit / gantry-lamp' })
  extras.push(lampOn)
  const glassMat = new MeshStandardMaterial({
    name: 'f1-kit / gantry-lamp dome',
    color: 0x8aa0b0,
    roughness: 0.15,
    metalness: 0,
    transparent: true,
    opacity: 0.22,
    toneMapped: false,
    depthWrite: false,
  })
  extras.push(glassMat)
  const fasciaMat = options.materials?.banner ?? new MeshStandardMaterial({
    name: 'f1-kit / gantry sponsor fascia',
    color: 0x0b3b2d,
    roughness: 0.56,
    metalness: 0.08,
  })
  if (options.materials?.banner === undefined) extras.push(fasciaMat)

  const materialSlots: Record<Slot, Material> = {
    post: options.materials?.post ?? kit.steel,
    beam: options.materials?.beam ?? kit.slate,
    banner: fasciaMat,
  }

  const root = new Group()
  root.name = 'f1-start-gantry'
  const posts = new Group(); posts.name = 'posts'
  const beam = new Group(); beam.name = 'beam'
  const banner = new Group(); banner.name = 'banner'
  root.add(posts, beam, banner)

  const generated: BufferGeometry[] = []
  const meshesBySlot: Record<Slot, Mesh[]> = { post: [], beam: [], banner: [] }

  const releaseGenerated = (): void => {
    for (const group of [posts, beam, banner]) group.clear()
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
    const { span, height } = config
    const half = span / 2
    const postParts: BufferGeometry[] = []
    for (const sx of [-1, 1] as const) {
      const x = sx * half
      const pole = new CylinderGeometry(0.055, 0.062, height, 16)
      pole.translate(x, height / 2, 0)
      postParts.push(pole)
      const plate = bevelBox(0.28, 0.05, 0.28, 0.01)
      plate.translate(x, 0.025, 0)
      postParts.push(plate)
      const bracket = bevelBox(0.22, 0.12, 0.22, 0.012)
      bracket.translate(x, height - 0.04, 0)
      postParts.push(bracket)
    }
    emit('post', mergeParts(postParts, 'posts'), posts, 'posts')

    const chord: Array<readonly [number, number]> = [
      [0.18, -0.18],
      [0.18, 0.18],
      [-0.18, 0.18],
      [-0.18, -0.18],
    ]
    const box = loftAlongX(chord, span + 0.5, { closed: true })
    box.translate(0, height + 0.03, 0)
    const beamParts: BufferGeometry[] = [box]
    const segs = Math.max(7, Math.round(span / 1.35))
    for (let i = 0; i < segs; i++) {
      const x0 = -half + (i / segs) * span
      const x1 = -half + ((i + 1) / segs) * span
      const frontZ = 0.2
      const backZ = -0.2
      const lo = height - 0.12
      const hi = height + 0.18
      beamParts.push(member(
        new Vector3(x0, i % 2 === 0 ? lo : hi, frontZ),
        new Vector3(x1, i % 2 === 0 ? hi : lo, frontZ),
        0.018,
        6,
      ))
      beamParts.push(member(
        new Vector3(x0, i % 2 === 0 ? hi : lo, backZ),
        new Vector3(x1, i % 2 === 0 ? lo : hi, backZ),
        0.018,
        6,
      ))
    }
    const walk = bevelBox(span * 0.9, 0.035, 0.5, 0.006)
    walk.translate(0, height - 0.18, -0.3)
    beamParts.push(walk)
    for (const sx of [-span * 0.22, span * 0.22] as const) {
      const pod = loftRoundedBox(0.28, 0.18, 0.32, 0.04)
      pod.rotateX(0.4)
      pod.translate(sx, height - 0.42, -0.35)
      beamParts.push(pod)
    }
    emit('beam', mergeParts(beamParts, 'beam'), beam, 'beam')

    const fascia = bevelBox(span + 0.35, 0.58, 0.1, 0.015)
    fascia.translate(0, height + 0.03, 0.28)
    emit('banner', fascia, banner, 'sponsor-fascia')
    const fasciaMarks: BufferGeometry[] = []
    for (const x of [-0.38, -0.19, 0, 0.19, 0.38].map((v) => v * span)) {
      const badge = bevelBox(0.16, 0.16, 0.018, 0.025)
      badge.translate(x - 0.26, height + 0.03, 0.345)
      fasciaMarks.push(badge)
      const wordmark = bevelBox(0.42, 0.055, 0.018, 0.012)
      wordmark.translate(x + 0.08, height + 0.03, 0.345)
      fasciaMarks.push(wordmark)
    }
    emit('banner', mergeParts(fasciaMarks, 'generic-sponsor-marks'), banner, 'generic-sponsor-marks', kit.shell)

    const bannerY = height - HOUSE_H / 2 - 0.48
    const boardW = Math.min(span * 0.22, 2.45)
    const boardOffset = LIGHT_PITCH * 2.5 + boardW / 2
    const placards: BufferGeometry[] = []
    for (const sx of [-1, 1] as const) {
      const placard = bevelBox(boardW, HOUSE_H, 0.08, 0.012)
      placard.translate(sx * boardOffset, bannerY, -0.05)
      placards.push(placard)
    }
    emit('banner', mergeParts(placards, 'display-boards'), banner, 'display-boards', kit.graphite)

    const mounts: BufferGeometry[] = []
    const subBar = bevelBox(LIGHT_PITCH * 6.2, 0.06, 0.08, 0.012)
    subBar.translate(0, bannerY + HOUSE_H / 2 + 0.08, 0.22)
    mounts.push(subBar)
    for (const x of [-LIGHT_PITCH * 1.6, LIGHT_PITCH * 1.6] as const) {
      mounts.push(member(
        new Vector3(x, height - 0.10, 0.06),
        new Vector3(x, bannerY + HOUSE_H / 2 + 0.10, 0.22),
        0.016,
        8,
      ))
    }
    emit('banner', mergeParts(mounts, 'hangers'), banner, 'hangers', kit.steel)

    const housings: BufferGeometry[] = []
    const lamps: BufferGeometry[] = []
    const bezels: BufferGeometry[] = []
    const domes: BufferGeometry[] = []
    const houseZ = HOUSE_D / 2 + 0.42
    const housingFaceZ = houseZ + HOUSE_D / 2
    const lensZ = housingFaceZ + LAYER_CLEARANCE + LENS_THICK / 2
    const lipZ = housingFaceZ + WELL_DEPTH / 2
    const domeZ = housingFaceZ + WELL_DEPTH + LAYER_CLEARANCE + DOME_THICK / 2
    for (let c = 0; c < 5; c++) {
      const x = (c - 2) * LIGHT_PITCH
      const house = loftRoundedBox(HOUSE_W, HOUSE_H, HOUSE_D, 0.04)
      house.translate(x, bannerY, houseZ)
      housings.push(house)
      for (let r = 0; r < 2; r++) {
        const y = bannerY + (0.5 - r) * 0.28
        const lamp = new CylinderGeometry(LAMP_R * 0.78, LAMP_R * 0.74, LENS_THICK, 14)
        lamp.rotateX(Math.PI / 2)
        applyPolarCapUVs(lamp)
        lamp.translate(x, y, lensZ)
        lamps.push(lamp)
        const step = bevelRing(LAMP_R * 0.72, LAMP_R * 0.92, 0.004, 0.001, 20)
        step.translate(x, y, housingFaceZ + 0.002)
        bezels.push(step)
        const lip = bevelRing(LAMP_R * 0.92, LAMP_R * 1.18, WELL_DEPTH, 0.001, 20)
        lip.translate(x, y, lipZ)
        bezels.push(lip)
        const dome = bevelDisc(LAMP_R * 0.88, DOME_THICK, 0.001, 16)
        dome.translate(x, y, domeZ)
        domes.push(dome)
      }
      const spot = new SpotLight(0xc41820, 0.9, 2.0, Math.PI / 7, 0.55, 2)
      spot.name = `spot-${c}`
      spot.position.set(x, bannerY, domeZ)
      spot.target.position.set(x, bannerY - 0.5, domeZ + 4)
      banner.add(spot, spot.target)
    }
    emit('banner', mergeParts(housings, 'housings'), banner, 'housings', kit.graphite)
    emit('banner', mergeParts(bezels, 'bezels'), banner, 'bezels', kit.slate)
    emit('banner', mergeParts(lamps, 'lights'), banner, 'lights', lampOn)
    const domeGeo = mergeParts(domes, 'domes')
    generated.push(domeGeo)
    const domeMesh = new Mesh(domeGeo, glassMat)
    domeMesh.name = 'domes'
    domeMesh.castShadow = false
    domeMesh.receiveShadow = false
    banner.add(domeMesh)
  }
  rebuild()

  return {
    root,
    parts: { posts, beam, banner },
    materials: materialSlots,
    getConfig: () => ({ ...config }),
    configure(patch) {
      if (patch.span !== undefined) config.span = Math.max(6, patch.span)
      if (patch.height !== undefined) config.height = Math.max(4, patch.height)
      rebuild()
    },
    setMaterial(slot, material) {
      materialSlots[slot] = material
      for (const mesh of meshesBySlot[slot]) mesh.material = material
    },
    update: () => {},
    dispose() {
      releaseGenerated()
      for (const material of extras) material.dispose()
      disposeF1Materials(bundle)
      root.removeFromParent()
    },
  }
}

export function createPreview({ aspect }: { aspect: number; time?: number }) {
  return createF1Preview(createModel({ span: 10, height: 6.2 }), {
    aspect,
    target: [0, 4, 0.25],
    distance: 18.5,
    fov: 36,
    pitch: 0.03,
    yaw: -0.12,
    ground: true,
    bloom: true,
  })
}
