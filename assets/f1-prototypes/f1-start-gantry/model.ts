// f1-start-gantry — start/finish overhead: lattice posts, lofted box-truss beam, walkway, cameras,
// a blank banner slot, and a five-column start-light panel hung under the beam.
//
// Datums: 14 m span, 7.2 m soffit, 0.7 × 0.7 m box truss. No circuit or championship lettering.

import {
  BufferGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  Vector3,
  type Material,
} from 'three/webgpu'

import {
  TOKEN,
  acquireF1Materials,
  bevelBox,
  createF1Preview,
  disposeF1Materials,
  loftAlongX,
  loftRoundedBox,
  member,
  mergeParts,
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

export function createModel(options: F1StartGantryOptions = {}): F1StartGantryInstance {
  const config: F1StartGantryConfig = {
    span: Math.max(6, options.span ?? defaults.span),
    height: Math.max(4, options.height ?? defaults.height),
  }

  const bundle = acquireF1Materials()
  const kit = bundle.materials
  const extras: Material[] = []
  const own = (material: Material): Material => {
    extras.push(material)
    return material
  }
  const lampOn = own(new MeshStandardMaterial({
    name: 'f1-kit / gantry-lamp',
    color: 0x000000,
    emissive: TOKEN.RED_500,
    emissiveIntensity: 2.0,
    roughness: 0.3,
    metalness: 0,
    toneMapped: false,
  }))

  const materialSlots: Record<Slot, Material> = {
    post: options.materials?.post ?? kit.graphite,
    beam: options.materials?.beam ?? kit.slate,
    banner: options.materials?.banner ?? kit.shell,
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
      postParts.push(member(new Vector3(x, 0, -0.22), new Vector3(x, height, -0.22), 0.07, 8))
      postParts.push(member(new Vector3(x, 0, 0.22), new Vector3(x, height, 0.22), 0.07, 8))
      postParts.push(member(new Vector3(x - 0.22, 0, 0), new Vector3(x - 0.22, height, 0), 0.07, 8))
      postParts.push(member(new Vector3(x + 0.22, 0, 0), new Vector3(x + 0.22, height, 0), 0.07, 8))
      const bays = 5
      for (let i = 0; i < bays; i++) {
        const y0 = (i / bays) * height
        const y1 = ((i + 1) / bays) * height
        postParts.push(member(new Vector3(x, y0, -0.22), new Vector3(x, y1, 0.22), 0.032, 6))
        postParts.push(member(new Vector3(x, y0, 0.22), new Vector3(x, y1, -0.22), 0.032, 6))
      }
      const plate = bevelBox(0.9, 0.1, 0.9, 0.015)
      plate.translate(x, 0.05, 0)
      postParts.push(plate)
    }
    emit('post', mergeParts(postParts, 'posts'), posts, 'posts')

    // Box-truss beam: rectangular chord lofted along X, plus internal diagonals.
    const chord: Array<readonly [number, number]> = [
      [0.32, -0.22],
      [0.32, 0.28],
      [-0.32, 0.28],
      [-0.32, -0.22],
    ]
    const box = loftAlongX(chord, span + 0.8, { closed: true })
    box.translate(0, height + 0.05, 0)
    const beamParts: BufferGeometry[] = [box]
    const segs = Math.max(4, Math.round(span / 2.2))
    for (let i = 0; i <= segs; i++) {
      const x = -half + (i / segs) * span
      beamParts.push(member(
        new Vector3(x, height - 0.16, -0.28),
        new Vector3(x, height + 0.26, 0.28),
        0.03,
        6,
      ))
    }
    const walk = bevelBox(span * 0.92, 0.04, 0.7, 0.008)
    walk.translate(0, height - 0.22, 0.05)
    beamParts.push(walk)
    // Camera pods on the beam soffit.
    for (const sx of [-span * 0.22, span * 0.22] as const) {
      const pod = loftRoundedBox(0.28, 0.18, 0.32, 0.04)
      pod.rotateX(0.4)
      pod.translate(sx, height - 0.42, 0.22)
      beamParts.push(pod)
    }
    emit('beam', mergeParts(beamParts, 'beam'), beam, 'beam')

    const panel = bevelBox(span * 0.62, 1.05, 0.08, 0.012)
    panel.translate(0, height - 0.85, 0.38)
    emit('banner', panel, banner, 'banner')

    // Five-column start-light cluster hung under the beam centre.
    const lights: BufferGeometry[] = []
    for (let c = 0; c < 5; c++) {
      const x = (c - 2) * 0.38
      const house = loftRoundedBox(0.24, 0.9, 0.18, 0.04)
      house.rotateY(Math.PI / 2)
      house.translate(x, height - 0.55, 0.55)
      lights.push(house)
      for (let r = 0; r < 4; r++) {
        const lamp = new CylinderGeometry(0.07, 0.065, 0.04, 14)
        lamp.rotateX(Math.PI / 2)
        lamp.translate(x, height - 0.55 + (1.5 - r) * 0.18, 0.68)
        lights.push(lamp)
      }
    }
    emit('banner', mergeParts(lights, 'lights'), banner, 'lights', lampOn)
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
  return createF1Preview(createModel({ span: 12, height: 6.4 }), {
    aspect,
    target: [0, 5.2, 0.2],
    distance: 16,
    fov: 34,
  })
}
