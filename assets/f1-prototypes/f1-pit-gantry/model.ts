// f1-pit-gantry — an overhead post-and-beam gantry: two posts flank a span, a top beam runs across, and a
// plain banner hangs just under the beam. The original prop took an external `spanDir` to orient itself
// along a scene-composed pit-lane direction; a standalone kit prop has no external lane to align to, so
// that parameter is dropped and the gantry always runs along local +X. `span`/`height` size the structure.
// The banner colour is genericised (no team livery — plain corporate blue by default).
// Ported from a private racing project's pit-lane gantry prop.

import {
  BoxGeometry,
  CylinderGeometry,
  DirectionalLight,
  Group,
  HemisphereLight,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  Scene,
  type Material,
} from 'three/webgpu'

import { ResourceBag } from '../f1-kit-core/resourceBag.ts'

export interface F1PitGantryConfig {
  /** Distance between the two posts along local +X, metres. */
  span: number
  /** Post height / beam elevation, metres. */
  height: number
}

export interface F1PitGantryOptions extends Partial<F1PitGantryConfig> {
  materials?: Partial<Record<'post' | 'banner', Material>>
}

export interface F1PitGantryInstance {
  readonly root: Group
  readonly parts: { posts: Group; beam: Group; banner: Group }
  readonly materials: Readonly<Record<'post' | 'banner', Material>>
  getConfig(): Readonly<F1PitGantryConfig>
  configure(patch: Partial<F1PitGantryConfig>): void
  setMaterial(slot: 'post' | 'banner', material: Material): void
  update(deltaSeconds: number): void
  dispose(): void
}

const defaults: F1PitGantryConfig = { span: 8.0, height: 4.6 }

export function createModel(options: F1PitGantryOptions = {}): F1PitGantryInstance {
  const config: F1PitGantryConfig = {
    span: Math.max(2, options.span ?? defaults.span),
    height: Math.max(1.5, options.height ?? defaults.height),
  }

  const bag = new ResourceBag()
  const postMat = (options.materials?.post ?? bag.mat(new MeshStandardMaterial({ color: 0x2a2e33, metalness: 0.6, roughness: 0.5 }))) as Material
  const bannerMat = (options.materials?.banner ?? bag.mat(new MeshStandardMaterial({ color: 0x1a4d7a, metalness: 0.0, roughness: 0.6 }))) as Material
  const materialSlots: Record<'post' | 'banner', Material> = { post: postMat, banner: bannerMat }

  const root = new Group()
  root.name = 'f1-pit-gantry'
  const posts = new Group(); posts.name = 'posts'
  const beam = new Group(); beam.name = 'beam'
  const banner = new Group(); banner.name = 'banner'
  root.add(posts, beam, banner)

  // Track every mesh that uses a given material slot, so setMaterial can reassign all of them at once.
  // The beam shares the `post` slot (it's the same structural steel as the posts).
  const meshesBySlot: Record<'post' | 'banner', Mesh[]> = { post: [], banner: [] }

  const clearGenerated = (): void => {
    for (const group of [posts, beam, banner]) {
      for (const object of group.children) {
        if (object instanceof Mesh) object.geometry.dispose()
      }
      group.clear()
    }
    meshesBySlot.post.length = 0
    meshesBySlot.banner.length = 0
  }

  const rebuild = (): void => {
    clearGenerated()
    const { span, height } = config

    // Posts run fore/aft along local +X (no external spanDir — always local +X).
    for (const s of [-1, 1] as const) {
      const post = new Mesh(bag.geo(new CylinderGeometry(0.11, 0.13, height, 12)), materialSlots.post)
      post.position.set(s * (span / 2), height / 2, 0)
      post.castShadow = true
      meshesBySlot.post.push(post)
      posts.add(post)
    }

    const beamMesh = new Mesh(bag.geo(new BoxGeometry(span, 0.4, 0.3)), materialSlots.post)
    beamMesh.position.set(0, height, 0)
    beamMesh.castShadow = true
    meshesBySlot.post.push(beamMesh)
    beam.add(beamMesh)

    const bannerMesh = new Mesh(bag.geo(new BoxGeometry(span * 0.9, 0.6, 0.05)), materialSlots.banner)
    bannerMesh.position.set(0, height - 0.5, 0)
    bannerMesh.castShadow = true
    meshesBySlot.banner.push(bannerMesh)
    banner.add(bannerMesh)
  }
  rebuild()

  return {
    root,
    parts: { posts, beam, banner },
    materials: materialSlots,
    getConfig: () => ({ ...config }),
    configure(patch) {
      if (patch.span !== undefined) config.span = Math.max(2, patch.span)
      if (patch.height !== undefined) config.height = Math.max(1.5, patch.height)
      rebuild()
    },
    setMaterial(slot, material) {
      materialSlots[slot] = material
      for (const mesh of meshesBySlot[slot]) mesh.material = material
    },
    update: () => {},
    dispose() {
      clearGenerated()
      bag.dispose()
      root.removeFromParent()
    },
  }
}

export function createPreview({ aspect }: { aspect: number; time?: number }) {
  const model = createModel()
  const scene = new Scene()
  scene.add(model.root, new HemisphereLight(0x8ea3b2, 0x0a0c10, 0.6))
  const key = new DirectionalLight(0xfff2e2, 1.2)
  key.position.set(-4, 8, 6)
  scene.add(key)
  const camera = new PerspectiveCamera(42, aspect, 0.1, 60)
  camera.position.set(9, 5, 9)
  camera.lookAt(0, 2.6, 0)
  scene.add(camera)
  return { scene, root: model.root, camera, update: model.update, dispose: model.dispose }
}
