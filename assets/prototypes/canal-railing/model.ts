import {
  Color,
  CylinderGeometry,
  DirectionalLight,
  Group,
  HemisphereLight,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  Vector3,
} from 'three/webgpu'

import {
  MaterialLibrary,
  mergeStaticByMaterial,
  prism,
  tuneMaterial,
  type MaterialHandle,
  type Vec3,
} from '../../../src/asset-forge/generator/index.ts'

interface Materials {
  shell: MeshPhysicalMaterial
  shellShade: MeshPhysicalMaterial
  graphite: MeshPhysicalMaterial
  ink: MeshPhysicalMaterial
  steel: MeshPhysicalMaterial
  amber: MeshPhysicalMaterial
  glass: MeshPhysicalMaterial
}

interface Controller {
  root: Group
  update: (deltaSeconds: number) => void
  dispose: () => void
}

interface Preview extends Controller {
  scene: Scene
  camera: PerspectiveCamera
}

const UP = new Vector3(0, 1, 0)
const FORWARD = new Vector3(0, 0, 1)

function acquireMaterials(): { materials: Materials; handles: MaterialHandle[] } {
  const library = new MaterialLibrary()
  const shell = library.acquire({ recipeId: 'MAT-04', palette: 'SHELL-200', condition: 'maintained', seed: 30101 })
  const shellShade = library.acquire({ recipeId: 'MAT-04', palette: 'SHELL-500', condition: 'maintained', seed: 30102 })
  const graphite = library.acquire({ recipeId: 'MAT-03', palette: 'GRAPHITE-800', condition: 'maintained', seed: 30103 })
  const ink = library.acquire({ recipeId: 'MAT-03', palette: 'INK-950', condition: 'maintained', seed: 30104 })
  const steel = library.acquire({ recipeId: 'MAT-02', palette: 'STEEL', condition: 'worked', seed: 30105 })
  const amber = library.acquire({ recipeId: 'MAT-09', palette: 'AMBER-400', condition: 'active', seed: 30106 })
  return {
    handles: [shell, shellShade, graphite, ink, steel, amber],
    materials: {
      shell: tuneMaterial(shell, 0xcbd1d2, 0.48, 0.22, { clearcoat: 0.08 }),
      shellShade: tuneMaterial(shellShade, 0x7e898e, 0.52, 0.42),
      graphite: tuneMaterial(graphite, 0x242b33, 0.52, 0.64),
      ink: tuneMaterial(ink, 0x07090c, 0.82, 0.16),
      steel: tuneMaterial(steel, 0x9ba5a8, 0.3, 0.84),
      amber: tuneMaterial(amber, 0xe18716, 0.23, 0.04, { emissive: 0.72, clearcoat: 0.24 }),
      glass: new MeshPhysicalMaterial({
        name: 'canal-railing / smoked tube glass',
        color: 0x283039,
        roughness: 0.18,
        metalness: 0.18,
        transparent: true,
        opacity: 0.44,
        transmission: 0.28,
        thickness: 0.1,
        depthWrite: false,
      }),
    },
  }
}

function box(
  parent: Group,
  material: MeshPhysicalMaterial,
  size: Vec3,
  position: Vec3,
  chamfer = 0.06,
  bevel = 0.02,
): Mesh {
  const mesh = prism(material, size, position, {
    chamfer,
    fillet: Math.min(0.045, Math.max(0.008, chamfer * 0.3)),
    bevel,
  })
  parent.add(mesh)
  return mesh
}

function cylinderBetween(
  parent: Group,
  material: MeshPhysicalMaterial,
  radius: number,
  start: Vector3,
  end: Vector3,
  segments = 18,
): Mesh {
  const direction = end.clone().sub(start)
  const geometry = new CylinderGeometry(radius, radius, direction.length(), segments, 1, false)
  const mesh = new Mesh(geometry, material)
  mesh.position.copy(start).add(end).multiplyScalar(0.5)
  mesh.quaternion.setFromUnitVectors(UP, direction.normalize())
  parent.add(mesh)
  return mesh
}

function beamBetween(
  parent: Group,
  material: MeshPhysicalMaterial,
  width: number,
  height: number,
  start: Vector3,
  end: Vector3,
): Mesh {
  const direction = end.clone().sub(start)
  const midpoint = start.clone().add(end).multiplyScalar(0.5)
  const beam = box(parent, material, [width, height, direction.length()], [midpoint.x, midpoint.y, midpoint.z], 0.055, 0.018)
  beam.quaternion.setFromUnitVectors(FORWARD, direction.normalize())
  return beam
}

function addTubeEdgeRails(parent: Group, material: MeshPhysicalMaterial, start: Vector3, end: Vector3): void {
  const direction = end.clone().sub(start).normalize()
  const side = direction.clone().cross(UP).normalize()
  const offsets = [
    UP.clone().multiplyScalar(0.145),
    UP.clone().multiplyScalar(-0.145),
    side.clone().multiplyScalar(0.145),
    side.clone().multiplyScalar(-0.145),
  ]
  for (const offset of offsets) {
    cylinderBetween(parent, material, 0.026, start.clone().add(offset), end.clone().add(offset), 10)
  }
}

function addPost(root: Group, materials: Materials, position: Vector3, center = false): void {
  const post = new Group()
  post.position.copy(position)
  root.add(post)

  box(post, materials.ink, [1.14, 0.14, 1.02], [0, 0.07, 0], 0.1, 0.025)
  box(post, materials.graphite, [1.04, 0.22, 0.92], [0, 0.2, 0], 0.1, 0.025)
  box(post, materials.shellShade, [0.82, 0.56, 0.72], [0, 0.48, 0], 0.12, 0.03)
  box(post, materials.graphite, [0.66, 0.48, 0.62], [0, 0.5, 0], 0.1, 0.025)
  box(post, materials.shell, [0.68, center ? 2.18 : 2.34, 0.64], [0, center ? 1.55 : 1.63, 0], 0.15, 0.038)
  box(post, materials.shellShade, [0.5, 0.28, 0.54], [0, center ? 2.7 : 2.86, 0], 0.1, 0.026)

  // Deep front service channel with a physically retained amber lens.
  box(post, materials.graphite, [0.36, 1.12, 0.16], [0, 1.58, 0.31], 0.1, 0.026)
  box(post, materials.ink, [0.22, 0.86, 0.08], [0, 1.58, 0.42], 0.06, 0.015)
  box(post, materials.amber, [0.09, 0.64, 0.045], [0, 1.58, 0.48], 0.025, 0.007)

  // Four seated foot fasteners and lower access recess.
  for (const x of [-0.4, 0.4]) {
    for (const z of [-0.32, 0.32]) {
      const bolt = new Mesh(new CylinderGeometry(0.05, 0.05, 0.06, 10), materials.steel)
      bolt.position.set(x, 0.34, z)
      post.add(bolt)
    }
  }
  box(post, materials.ink, [0.34, 0.16, 0.08], [0, 0.36, 0.4], 0.04, 0.012)
  for (const y of [1.2, 1.96]) {
    const fastener = new Mesh(new CylinderGeometry(0.045, 0.045, 0.07, 10), materials.steel)
    fastener.rotation.x = Math.PI / 2
    fastener.position.set(0, y, 0.515)
    post.add(fastener)
  }
}

function addRailBracket(root: Group, materials: Materials, post: Vector3, target: Vector3, y: number): void {
  const direction = target.clone().sub(post).setY(0).normalize()
  const position = post.clone().addScaledVector(direction, 0.35)
  const bracket = box(root, materials.graphite, [0.5, 0.42, 0.28], [position.x, y, position.z], 0.1, 0.026)
  bracket.quaternion.setFromUnitVectors(FORWARD, direction)
  for (const yOffset of [-0.11, 0.11]) {
    box(root, materials.steel, [0.07, 0.07, 0.045], [position.x, y + yOffset, position.z + 0.17], 0.018, 0.005)
  }
}

function build(): { root: Group; handles: MaterialHandle[]; glass: MeshPhysicalMaterial; geometries: Array<{ dispose: () => void }> } {
  const acquired = acquireMaterials()
  const root = new Group()
  root.name = 'canal railing'
  const { materials: m } = acquired

  const left = new Vector3(-3.15, 0, -2.05)
  const center = new Vector3(0, 0, 0)
  const right = new Vector3(3.15, 0, -2.05)
  addPost(root, m, left)
  addPost(root, m, center, true)
  addPost(root, m, right)

  for (const [startPost, endPost] of [[left, center], [center, right]] as const) {
    const startTop = startPost === center ? new Vector3(startPost.x, 2.7, startPost.z) : new Vector3(startPost.x, 3.04, startPost.z)
    const endTop = endPost === center ? new Vector3(endPost.x, 2.7, endPost.z) : new Vector3(endPost.x, 3.04, endPost.z)
    cylinderBetween(root, m.amber, 0.058, startTop, endTop, 16)
    cylinderBetween(root, m.glass, 0.17, startTop, endTop, 20)
    addTubeEdgeRails(root, m.graphite, startTop, endTop)
    for (const t of [0.0, 0.36, 0.72, 1.0]) {
      const point = startTop.clone().lerp(endTop, t)
      const next = startTop.clone().lerp(endTop, Math.min(1, t + 0.055))
      cylinderBetween(root, m.graphite, 0.215, point, next, 16)
    }

    for (const [yStart, yEnd] of [[1.34, 1.18], [2.02, 1.86]] as const) {
      const planarDirection = endPost.clone().sub(startPost).setY(0).normalize()
      const a = new Vector3(startPost.x, startPost === center ? yEnd : yStart, startPost.z).addScaledVector(planarDirection, 0.22)
      const b = new Vector3(endPost.x, endPost === center ? yEnd : yStart, endPost.z).addScaledVector(planarDirection, -0.22)
      beamBetween(root, m.graphite, 0.18, 0.18, a, b)
      addRailBracket(root, m, startPost, endPost, a.y)
      addRailBracket(root, m, endPost, startPost, b.y)
    }
  }

  // Compound center crown and terminal capture housings swallow all rail ends.
  box(root, m.shellShade, [0.94, 0.56, 0.88], [0, 2.76, 0], 0.21, 0.052)
  box(root, m.shell, [0.8, 0.46, 0.74], [0, 2.8, 0.03], 0.18, 0.045)
  box(root, m.graphite, [0.6, 0.25, 0.58], [0, 2.82, -0.1], 0.11, 0.028)
  box(root, m.amber, [0.11, 0.28, 0.05], [0, 2.78, 0.43], 0.028, 0.007)
  for (const endpoint of [left, right]) {
    box(root, m.shellShade, [0.7, 0.5, 0.68], [endpoint.x, 3.04, endpoint.z], 0.16, 0.04)
    box(root, m.shell, [0.6, 0.4, 0.58], [endpoint.x, 3.06, endpoint.z + 0.02], 0.14, 0.035)
    box(root, m.graphite, [0.46, 0.28, 0.52], [endpoint.x, 3.04, endpoint.z], 0.09, 0.023)
    box(root, m.amber, [0.1, 0.22, 0.05], [endpoint.x, 3.04, endpoint.z + 0.35], 0.026, 0.007)
  }

  const geometries = mergeStaticByMaterial(root, {
    meshName: (material: { name?: string }): string => material.name ?? 'canal-railing batch',
  })
  root.traverse((object) => {
    if (object instanceof Mesh && object.material === m.glass) object.renderOrder = 10
  })
  return { root, handles: acquired.handles, glass: m.glass, geometries }
}

export function createModel(): Controller {
  const built = build()
  return {
    root: built.root,
    update: () => {},
    dispose: () => {
      for (const geometry of built.geometries) geometry.dispose()
      built.glass.dispose()
      for (const handle of built.handles) handle.release()
    },
  }
}

function makePreview(options: { aspect?: number; mode?: 'beauty' | 'side' | 'rear' | 'low' } = {}): Preview {
  const model = createModel()
  const scene = new Scene()
  scene.background = new Color(0x020304)
  scene.add(model.root)
  scene.add(new HemisphereLight(0xc9d0d2, 0x07090c, 0.82))
  const key = new DirectionalLight(0xffead7, 2.75); key.position.set(-8, 10, 11); scene.add(key)
  const fill = new DirectionalLight(0x7799c3, 1.05); fill.position.set(9, 6, 8); scene.add(fill)
  const rim = new DirectionalLight(0x8eb6be, 0.82); rim.position.set(6, 8, -10); scene.add(rim)
  const floorMaterial = new MeshBasicMaterial({ color: 0x010203 })
  const floorGeometry = new PlaneGeometry(16, 12)
  const floor = new Mesh(floorGeometry, floorMaterial)
  floor.rotation.x = -Math.PI / 2
  floor.position.y = -0.005
  floor.userData.excludeFromExport = true
  scene.add(floor)
  const camera = new PerspectiveCamera(32, options.aspect ?? 1, 0.12, 80)
  if (options.mode === 'side') camera.position.set(-8.7, 3.1, -1.65)
  else if (options.mode === 'rear') camera.position.set(6.9, 3.7, -8.6)
  else if (options.mode === 'low') camera.position.set(6.5, 0.75, 7.4)
  else camera.position.set(0, 4.25, 11.8)
  camera.lookAt(0, options.mode === 'low' ? 1.35 : 1.5, -0.65)
  scene.add(camera)
  return {
    ...model,
    scene,
    camera,
    dispose: () => {
      floorGeometry.dispose()
      floorMaterial.dispose()
      model.dispose()
    },
  }
}

export const createPreview = (options: { aspect?: number } = {}) => makePreview({ ...options, mode: 'beauty' })
export const createSidePreview = (options: { aspect?: number } = {}) => makePreview({ ...options, mode: 'side' })
export const createRearPreview = (options: { aspect?: number } = {}) => makePreview({ ...options, mode: 'rear' })
export const createLowPreview = (options: { aspect?: number } = {}) => makePreview({ ...options, mode: 'low' })
