// f1-catch-fence — a straight run of ~5 m debris catch-fencing: steel posts with base plates,
// top + mid rails, stay cables, and layered chain-link. Mesh is a coarse DataTexture (headless
// preview has no document / canvas; a fine 16 px diamond greys out at catalogue 320 px).

import {
  BufferGeometry,
  DataTexture,
  DoubleSide,
  Group,
  LinearFilter,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  RepeatWrapping,
  RGBAFormat,
  UnsignedByteType,
  Vector3,
  type Material,
} from 'three/webgpu'

import {
  acquireF1Materials,
  bevelBox,
  createF1Preview,
  disposeF1Materials,
  member,
  mergeParts,
  tubeSection,
} from '../f1-kit-core/index.ts'

type Slot = 'post' | 'mesh' | 'rail'

export interface F1CatchFenceConfig {
  length: number
  height: number
}

export interface F1CatchFenceOptions extends Partial<F1CatchFenceConfig> {
  materials?: Partial<Record<Slot, Material>>
}

export interface F1CatchFenceInstance {
  readonly root: Group
  readonly parts: { posts: Group; mesh: Group }
  readonly materials: Readonly<Record<Slot, Material>>
  getConfig(): Readonly<F1CatchFenceConfig>
  configure(patch: Partial<F1CatchFenceConfig>): void
  setMaterial(slot: Slot, material: Material): void
  update(deltaSeconds: number): void
  dispose(): void
}

const defaults: F1CatchFenceConfig = { length: 12, height: 5 }

function chainLinkTexture(): DataTexture {
  const n = 32
  const period = 8
  const data = new Uint8Array(n * n * 4)
  const half = period / 2
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const i = (y * n + x) * 4
      const d1 = Math.abs(((x + y) % period) - half)
      const d2 = Math.abs(((x - y + n * 8) % period) - half)
      const on = d1 < 0.72 || d2 < 0.72
      data[i] = on ? 148 : 0
      data[i + 1] = on ? 152 : 0
      data[i + 2] = on ? 156 : 0
      data[i + 3] = on ? 210 : 0
    }
  }
  const tex = new DataTexture(data, n, n, RGBAFormat, UnsignedByteType)
  tex.wrapS = RepeatWrapping
  tex.wrapT = RepeatWrapping
  tex.minFilter = LinearFilter
  tex.magFilter = LinearFilter
  tex.needsUpdate = true
  return tex
}

export function createModel(options: F1CatchFenceOptions = {}): F1CatchFenceInstance {
  const config: F1CatchFenceConfig = {
    length: Math.max(2, options.length ?? defaults.length),
    height: Math.max(2, options.height ?? defaults.height),
  }

  const bundle = acquireF1Materials()
  const kit = bundle.materials
  const extras: Material[] = []
  const textures: DataTexture[] = []
  const own = (material: Material): Material => {
    extras.push(material)
    return material
  }

  const tex = chainLinkTexture()
  textures.push(tex)
  const meshMat = options.materials?.mesh ?? own(new MeshStandardMaterial({
    name: 'f1-kit / catch-fence mesh',
    map: tex,
    transparent: true,
    opacity: 0.92,
    alphaTest: 0.12,
    depthWrite: false,
    roughness: 0.55,
    metalness: 0.72,
    side: DoubleSide,
  }))

  const materialSlots: Record<Slot, Material> = {
    post: options.materials?.post ?? kit.graphite,
    mesh: meshMat,
    rail: options.materials?.rail ?? kit.steel,
  }

  const root = new Group()
  root.name = 'f1-catch-fence'
  const posts = new Group(); posts.name = 'posts'
  const meshGroup = new Group(); meshGroup.name = 'mesh'
  root.add(posts, meshGroup)

  const generated: BufferGeometry[] = []
  const meshesBySlot: Record<Slot, Mesh[]> = { post: [], mesh: [], rail: [] }

  const releaseGenerated = (): void => {
    for (const group of [posts, meshGroup]) group.clear()
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
    const { length, height } = config
    const extension = Math.min(0.65, height * 0.18)
    const verticalTop = height - extension
    const spacing = 3
    const count = Math.max(2, Math.round(length / spacing) + 1)
    const half = length / 2

    const postParts: BufferGeometry[] = []
    const railParts: BufferGeometry[] = []
    const railHeights = [verticalTop, verticalTop * 0.7, verticalTop * 0.4, 0.18]
    for (let i = 0; i < count; i++) {
      const x = -half + (i / (count - 1)) * length
      postParts.push(tubeSection(0.075, verticalTop + 0.16, [x, (verticalTop + 0.16) / 2, 0], [0, 1, 0], 12))
      postParts.push(member(
        new Vector3(x, verticalTop, 0),
        new Vector3(x, height, extension),
        0.065,
        12,
      ))
      const base = bevelBox(0.32, 0.09, 0.32, 0.01)
      base.translate(x, 0.045, 0)
      postParts.push(base)
      for (const ax of [-0.11, 0.11] as const) {
        for (const az of [-0.1, 0.1] as const) {
          const anchor = bevelBox(0.045, 0.035, 0.045, 0.007)
          anchor.translate(x + ax, 0.105, az)
          postParts.push(anchor)
        }
      }
      const gusset = bevelBox(0.06, 0.22, 0.16, 0.006)
      gusset.translate(x, 0.18, -0.08)
      postParts.push(gusset)
      const tensionBar = bevelBox(0.028, verticalTop - 0.22, 0.035, 0.005)
      tensionBar.translate(x + (i === count - 1 ? -0.11 : 0.11), verticalTop / 2 + 0.05, 0.055)
      railParts.push(tensionBar)
      for (const y of railHeights) {
        const clamp = bevelBox(0.17, 0.055, 0.095, 0.008)
        clamp.translate(x, y, 0.045)
        railParts.push(clamp)
      }
      const cap = bevelBox(0.14, 0.05, 0.14, 0.006)
      cap.translate(x, height + 0.02, extension)
      railParts.push(cap)
      railParts.push(member(
        new Vector3(x, verticalTop, 0),
        new Vector3(x, 0.08, -0.95),
        0.012,
        6,
      ))
      railParts.push(member(
        new Vector3(x, verticalTop * 0.55, 0),
        new Vector3(x, 0.08, -0.55),
        0.01,
        6,
      ))
      if (i < count - 1) {
        const x1 = -half + ((i + 1) / (count - 1)) * length
        railParts.push(member(
          new Vector3(x, 0.45, 0.02),
          new Vector3(x1, verticalTop * 0.82, 0.02),
          0.012,
          6,
        ))
      }
    }
    for (const y of railHeights) {
      const rail = bevelBox(length + 0.1, y === verticalTop ? 0.045 : 0.032, 0.045, 0.005)
      rail.translate(0, y, 0)
      railParts.push(rail)
    }
    railParts.push(tubeSection(0.008, length, [0, height, extension + 0.04], [1, 0, 0], 6))
    emit('post', mergeParts(postParts, 'posts'), posts, 'posts')
    emit('rail', mergeParts(railParts, 'rails'), posts, 'rails')

    const tile = 0.85
    tex.repeat.set(Math.max(1, length / tile), Math.max(1, verticalTop / tile))
    tex.needsUpdate = true
    const front = new PlaneGeometry(length, verticalTop - 0.12, 1, 1)
    front.translate(0, verticalTop / 2 + 0.06, 0.03)
    emit('mesh', front, meshGroup, 'chain-link')
    const overhang = new PlaneGeometry(length, Math.SQRT2 * extension, 1, 1)
    overhang.rotateX(Math.PI / 4)
    overhang.translate(0, verticalTop + extension / 2, extension / 2)
    emit('mesh', overhang, meshGroup, 'trackward-overhang')
  }
  rebuild()

  return {
    root,
    parts: { posts, mesh: meshGroup },
    materials: materialSlots,
    getConfig: () => ({ ...config }),
    configure(patch) {
      if (patch.length !== undefined) config.length = Math.max(2, patch.length)
      if (patch.height !== undefined) config.height = Math.max(2, patch.height)
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
      for (const material of extras) material.dispose()
      disposeF1Materials(bundle)
      root.removeFromParent()
    },
  }
}

export function createPreview({ aspect }: { aspect: number; time?: number }) {
  return createF1Preview(createModel({ length: 9, height: 4.2 }), {
    aspect,
    target: [0, 2.0, 0.1],
    distance: 9.2,
    fov: 30,
    yaw: -0.72,
    pitch: 0.14,
  })
}
