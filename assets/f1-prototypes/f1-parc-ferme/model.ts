// f1-parc-ferme — fenced compound with a marshal gate and a PF plate.
// Identity is the enclosure + gate, not a three-rail paddock fence.

import { BufferGeometry, Group, Mesh, MeshStandardMaterial, PlaneGeometry, Vector3, type Material } from 'three/webgpu'

import {
  LAYER_CLEARANCE,
  acquireF1Materials,
  bevelBox,
  createF1Preview,
  disposeF1Materials,
  marshalPlateTexture,
  member,
  mergeParts,
  tubeSection,
  AXIS_Y,
} from '../f1-kit-core/index.ts'

type Slot = 'post' | 'rail'

export interface F1ParcFermeConfig {
  bays: number
}

export interface F1ParcFermeOptions extends Partial<F1ParcFermeConfig> {
  materials?: Partial<Record<Slot, Material>>
}

export interface F1ParcFermeInstance {
  readonly root: Group
  readonly parts: { posts: Group; rails: Group }
  readonly materials: Readonly<Record<Slot, Material>>
  getConfig(): Readonly<F1ParcFermeConfig>
  configure(patch: Partial<F1ParcFermeConfig>): void
  setMaterial(slot: Slot, material: Material): void
  update(deltaSeconds: number): void
  dispose(): void
}

const defaults: F1ParcFermeConfig = { bays: 4 }
const PITCH = 2.0
const HEIGHT = 1.2
const DEPTH = 5.2
const MESH = 0.09

export function createModel(options: F1ParcFermeOptions = {}): F1ParcFermeInstance {
  const config: F1ParcFermeConfig = {
    bays: Math.max(2, Math.round(options.bays ?? defaults.bays)),
  }

  const bundle = acquireF1Materials()
  const kit = bundle.materials
  const extras: Material[] = []
  const textures: ReturnType<typeof marshalPlateTexture>[] = []
  const materialSlots: Record<Slot, Material> = {
    post: options.materials?.post ?? kit.graphite,
    rail: options.materials?.rail ?? kit.steel,
  }

  const root = new Group(); root.name = 'f1-parc-ferme'
  const posts = new Group(); posts.name = 'posts'
  const rails = new Group(); rails.name = 'rails'
  root.add(posts, rails)

  const generated: BufferGeometry[] = []
  const meshesBySlot: Record<Slot, Mesh[]> = { post: [], rail: [] }

  const releaseGenerated = (): void => {
    posts.clear(); rails.clear()
    for (const geometry of generated) geometry.dispose()
    generated.length = 0
    for (const slot of Object.keys(meshesBySlot) as Slot[]) meshesBySlot[slot].length = 0
    for (const texture of textures) texture.dispose()
    textures.length = 0
    for (const material of extras) material.dispose()
    extras.length = 0
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
    const bays = config.bays
    const span = bays * PITCH
    const half = span / 2
    const halfD = DEPTH / 2
    const gateW = 1.6
    const postParts: BufferGeometry[] = []
    const railParts: BufferGeometry[] = []

    const addPost = (x: number, z: number) => {
      postParts.push(tubeSection(0.024, HEIGHT, [x, HEIGHT / 2, z], AXIS_Y, 10))
      const foot = bevelBox(0.12, 0.04, 0.12, 0.006)
      foot.translate(x, 0.02, z)
      postParts.push(foot)
    }

    for (let i = 0; i <= bays; i++) {
      const x = -half + i * PITCH
      addPost(x, halfD)
      addPost(x, -halfD)
    }
    const zPosts = Math.max(2, Math.round(DEPTH / PITCH))
    for (let i = 1; i < zPosts; i++) {
      const z = -halfD + i * (DEPTH / zPosts)
      addPost(-half, z)
      addPost(half, z)
    }
    emit('post', mergeParts(postParts, 'posts'), posts, 'posts')

    const meshRun = (x0: number, z0: number, x1: number, z1: number) => {
      const dx = x1 - x0
      const dz = z1 - z0
      const len = Math.hypot(dx, dz)
      const verts = Math.max(6, Math.round(len / MESH))
      for (let i = 0; i < verts; i++) {
        const t = (i + 0.5) / verts
        const x = x0 + dx * t
        const z = z0 + dz * t
        railParts.push(member(new Vector3(x, 0.12, z), new Vector3(x, HEIGHT - 0.08, z), 0.005, 5))
      }
      for (const y of [0.12, HEIGHT * 0.5, HEIGHT - 0.06]) {
        railParts.push(member(new Vector3(x0, y, z0), new Vector3(x1, y, z1), 0.012, 6))
      }
    }

    meshRun(-half, -halfD, half, -halfD)
    meshRun(-half, halfD, -gateW / 2, halfD)
    meshRun(gateW / 2, halfD, half, halfD)
    meshRun(-half, -halfD, -half, halfD)
    meshRun(half, -halfD, half, halfD)
    emit('rail', mergeParts(railParts, 'mesh'), rails, 'mesh')

    const gate: BufferGeometry[] = []
    gate.push(member(new Vector3(-gateW / 2, 0.08, halfD), new Vector3(-gateW / 2, HEIGHT, halfD), 0.02, 8))
    gate.push(member(new Vector3(gateW / 2, 0.08, halfD), new Vector3(gateW / 2, HEIGHT, halfD), 0.02, 8))
    gate.push(member(new Vector3(-gateW / 2, HEIGHT - 0.04, halfD), new Vector3(gateW / 2, HEIGHT - 0.04, halfD), 0.016, 8))
    const leaf = bevelBox(gateW * 0.46, HEIGHT - 0.2, 0.03, 0.004)
    leaf.rotateY(-0.55)
    leaf.translate(-gateW * 0.18, HEIGHT / 2, halfD + 0.35)
    gate.push(leaf)
    emit('rail', mergeParts(gate, 'gate'), rails, 'gate', kit.graphite)

    const plate = bevelBox(0.42, 0.28, 0.03, 0.004)
    plate.translate(gateW / 2 + 0.28, HEIGHT + 0.12, halfD)
    emit('post', plate, posts, 'sign-back', kit.amber)
    const tex = marshalPlateTexture('PF')
    textures.push(tex)
    const mat = new MeshStandardMaterial({
      name: 'f1-kit / parc-ferme plate',
      map: tex,
      roughness: 0.55,
      metalness: 0.04,
    })
    extras.push(mat)
    const face = new PlaneGeometry(0.36, 0.22)
    face.translate(gateW / 2 + 0.28, HEIGHT + 0.12, halfD + 0.02 + LAYER_CLEARANCE)
    emit('post', face, posts, 'sign', mat)
  }
  rebuild()

  return {
    root,
    parts: { posts, rails },
    materials: materialSlots,
    getConfig: () => ({ ...config }),
    configure(patch) {
      if (patch.bays !== undefined) config.bays = Math.max(2, Math.round(patch.bays))
      rebuild()
    },
    setMaterial(slot, material) {
      materialSlots[slot] = material
      for (const mesh of meshesBySlot[slot]) mesh.material = material
    },
    update: () => {},
    dispose() {
      releaseGenerated()
      for (const texture of textures) texture.dispose()
      textures.length = 0
      for (const material of extras) material.dispose()
      disposeF1Materials(bundle)
      root.removeFromParent()
    },
  }
}

export function createPreview({ aspect }: { aspect: number; time?: number }) {
  return createF1Preview(createModel({ bays: 3 }), {
    aspect,
    target: [0, 0.7, 1.4],
    distance: 8.5,
    fov: 30,
    yaw: -0.55,
    pitch: 0.28,
  })
}
