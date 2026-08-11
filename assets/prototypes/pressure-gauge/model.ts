import {
  Color,
  DirectionalLight,
  ExtrudeGeometry,
  Float32BufferAttribute,
  Group,
  HemisphereLight,
  Mesh,
  MeshPhysicalMaterial,
  PerspectiveCamera,
  Scene,
  Shape,
  SphereGeometry,
  TorusGeometry,
} from 'three/webgpu'
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js'

import {
  MaterialLibrary,
  WEAR_ATTRIBUTES,
  bakeOcclusion,
  bakeSurfaceAttributes,
  createWearMaterial,
  cylinder,
  flatPlate,
  mergeStaticByMaterial,
  prism,
  tuneMaterial,
  type MaterialHandle,
  type Vec3,
  type WearProfile,
} from '../../../src/asset-forge/generator/index.ts'

const FACE_Y = 3.12
const OUTER_RADIUS = 2.46
const BEZEL_RADIUS = 2
const DIAL_RADIUS = 1.48
const FRONT_Z = 0.82

interface GaugeMaterials {
  shell: MeshPhysicalMaterial
  shellShade: MeshPhysicalMaterial
  graphite: MeshPhysicalMaterial
  graphiteEdge: MeshPhysicalMaterial
  ink: MeshPhysicalMaterial
  dial: MeshPhysicalMaterial
  brass: MeshPhysicalMaterial
  amber: MeshPhysicalMaterial
  amberDim: MeshPhysicalMaterial
  cyan: MeshPhysicalMaterial
}

function disk(
  material: MeshPhysicalMaterial,
  radius: number,
  depth: number,
  position: Vec3,
  segments = 48,
): Mesh {
  return cylinder(material, radius, depth, position, [Math.PI / 2, 0, 0], segments)
}

function torus(
  material: MeshPhysicalMaterial,
  radius: number,
  tube: number,
  position: Vec3,
  radialSegments = 6,
  tubularSegments = 24,
): Mesh {
  const mesh = new Mesh(new TorusGeometry(radius, tube, radialSegments, tubularSegments), material)
  mesh.position.set(...position)
  return mesh
}

function arcPanel(
  material: MeshPhysicalMaterial,
  innerRadius: number,
  outerRadius: number,
  start: number,
  sweep: number,
  z: number,
  depth = 0.16,
): Mesh {
  const end = start + sweep
  const shape = new Shape()
  shape.moveTo(Math.cos(start) * outerRadius, Math.sin(start) * outerRadius)
  shape.absarc(0, 0, outerRadius, start, end, false)
  shape.lineTo(Math.cos(end) * innerRadius, Math.sin(end) * innerRadius)
  shape.absarc(0, 0, innerRadius, end, start, true)
  shape.closePath()
  const bevel = Math.min(0.035, depth * 0.25, (outerRadius - innerRadius) * 0.12)
  const geometry = new ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: true,
    bevelSegments: 1,
    bevelSize: bevel,
    bevelThickness: bevel,
    curveSegments: 1,
  })
  const normals = geometry.getAttribute('normal')
  const edge = new Float32Array(normals.count)
  for (let index = 0; index < normals.count; index += 1) {
    const facing = Math.abs(normals.getZ(index))
    edge[index] = facing > 0.92 ? 0.16 : facing < 0.2 ? 0.92 : 0.58
  }
  geometry.setAttribute('aEdge', new Float32BufferAttribute(edge, 1))
  const mesh = new Mesh(geometry, material)
  mesh.position.set(0, FACE_Y, z - depth * 0.5)
  return mesh
}

function addMount(parent: Group, m: GaugeMaterials): void {
  // The offset wall plate and its two stand-off braces are visible beyond the
  // gauge's right flank. They make the object read as mounted instrumentation,
  // not a freestanding clock.
  parent.add(
    prism(m.graphite, [1.56, 3.45, 0.34], [2.38, FACE_Y, -0.98], {
      chamfer: [0.2, 0.18, 0.18, 0.2],
      fillet: 0.06,
      bevel: 0.06,
    }),
  )
  parent.add(
    prism(m.graphiteEdge, [1.62, 1.62, 0.5], [1.86, FACE_Y, -0.69], {
      chamfer: 0.18,
      fillet: 0.06,
      bevel: 0.05,
      rotation: [0, 0, Math.PI * 0.25],
    }),
  )
  parent.add(
    prism(m.graphiteEdge, [1.45, 0.34, 0.9], [2.05, FACE_Y + 0.62, -0.58], {
      chamfer: 0.11,
      fillet: 0.04,
      bevel: 0.04,
      rotation: [0, -0.16, -0.72],
    }),
  )
  parent.add(
    prism(m.graphiteEdge, [1.45, 0.34, 0.9], [2.05, FACE_Y - 0.62, -0.58], {
      chamfer: 0.11,
      fillet: 0.04,
      bevel: 0.04,
      rotation: [0, 0.16, 0.72],
    }),
  )

  for (const y of [FACE_Y - 1.14, FACE_Y + 1.14]) {
    // Dark inset plus a smaller inner wall makes each mounting hole read as a
    // real bored opening from the beauty camera.
    parent.add(disk(m.ink, 0.21, 0.035, [2.86, y, -0.79], 24))
    parent.add(disk(m.graphiteEdge, 0.11, 0.04, [2.86, y, -0.765], 24))
    parent.add(disk(m.ink, 0.07, 0.044, [2.86, y, -0.74], 24))
  }
}

function addHousing(parent: Group, m: GaugeMaterials): void {
  // Deep white instrument shell with a dark rear gasket and stepped front lip.
  parent.add(disk(m.ink, OUTER_RADIUS + 0.08, 0.36, [0, FACE_Y, -0.52]))
  parent.add(disk(m.shellShade, OUTER_RADIUS + 0.05, 1.34, [0, FACE_Y, -0.02], 16))
  parent.add(disk(m.shell, OUTER_RADIUS, 0.76, [0, FACE_Y, 0.29], 16))
  parent.add(torus(m.graphite, 2.29, 0.235, [0, FACE_Y, 0.61], 8, 64))

  // Broad annular armor segments replace a generic continuous ring. Unequal
  // gaps and slightly different radial depths reproduce the reference's shell
  // assembly while the sixteen-sided body carries the faceted silhouette.
  for (const [start, sweep, inner, outer, material] of [
    [0.07, 0.63, 2.07, 2.52, m.shell],
    [0.76, 0.69, 2.1, 2.49, m.shell],
    [1.52, 0.83, 2.08, 2.5, m.shell],
    [2.43, 0.71, 2.11, 2.48, m.shellShade],
    [3.21, 0.79, 2.06, 2.5, m.shell],
    [4.07, 0.83, 2.04, 2.53, m.shell],
    [4.98, 0.69, 2.09, 2.48, m.shellShade],
    [5.74, 0.47, 2.07, 2.51, m.shell],
  ] as const) {
    parent.add(arcPanel(material, inner, outer, start, sweep, 0.75))
  }

  // Raised caps bridge selected segment breaks instead of decorating every
  // radial division. These are large enough to shape the protective shell.
  for (const [angle, width] of [[0.73, 0.58], [2.38, 0.68], [3.98, 0.56], [5.69, 0.72]] as const) {
    const radius = 2.34
    parent.add(
      prism(m.shellShade, [width, 0.32, 0.34], [
        Math.cos(angle) * radius,
        FACE_Y + Math.sin(angle) * radius,
        0.78,
      ], {
        chamfer: 0.08,
        fillet: 0.035,
        bevel: 0.035,
        rotation: [0, 0, angle - Math.PI * 0.5],
      }),
    )
  }

  // The reference carries extra armor weight on the lower-right quadrant.
  // This stepped plate also provides a believable base for the vial pod.
  parent.add(prism(m.shell, [1.28, 0.56, 0.44], [1.48, 1.32, 0.58], {
    chamfer: [0.1, 0.24, 0.2, 0.08],
    fillet: 0.055,
    bevel: 0.05,
    rotation: [0, 0, 0.48],
  }))
  parent.add(arcPanel(m.cyan, 2.36, 2.42, 1.22, 0.42, 0.91, 0.035))
}

function addFace(parent: Group, m: GaugeMaterials): Group {
  // The reference flange is a stack of flat machined rings, not a soft tire.
  // Overlapping faceted disks leave visible annuli while preserving a deep,
  // physically layered front assembly.
  parent.add(disk(m.graphite, BEZEL_RADIUS + 0.16, 0.44, [0, FACE_Y, FRONT_Z + 0.04], 24))
  parent.add(disk(m.graphiteEdge, 1.98, 0.18, [0, FACE_Y, 1.15], 24))
  parent.add(disk(m.graphite, 1.74, 0.14, [0, FACE_Y, 1.26], 32))
  parent.add(torus(m.ink, 1.55, 0.07, [0, FACE_Y, 1.34], 8, 64))
  parent.add(disk(m.dial, DIAL_RADIUS, 0.085, [0, FACE_Y, 1.3], 40))

  // Four heavy retention clamps at the cardinal axes are the reference's
  // characteristic flange landmarks.
  for (let index = 0; index < 4; index += 1) {
    const angle = (index / 4) * Math.PI * 2
    const x = Math.sin(angle) * 2
    const y = FACE_Y + Math.cos(angle) * 2
    parent.add(
      prism(m.graphiteEdge, [index === 0 ? 0.66 : 0.56, 0.34, 0.28], [x, y, 1.39], {
        chamfer: 0.08,
        fillet: 0.035,
        bevel: 0.03,
        rotation: [0, 0, -angle],
      }),
    )
  }

  // Four recessed fasteners at the diagonal quadrants.
  for (const angle of [Math.PI * 0.25, Math.PI * 0.75, Math.PI * 1.25, Math.PI * 1.75]) {
    const x = Math.sin(angle) * 1.83
    const y = FACE_Y + Math.cos(angle) * 1.83
    parent.add(disk(m.ink, 0.21, 0.055, [x, y, 1.255], 16))
    parent.add(disk(m.shellShade, 0.135, 0.065, [x, y, 1.29], 6))
    parent.add(disk(m.ink, 0.06, 0.07, [x, y, 1.33], 8))
  }

  // Readable analogue scale: long major marks every fifth division and short
  // minor marks between. The open lower sector mirrors the reference dial.
  const start = -2.15
  const end = 2.15
  const divisions = 30
  for (let index = 0; index <= divisions; index += 1) {
    const angle = start + ((end - start) * index) / divisions
    const major = index % 5 === 0
    const length = major ? 0.34 : 0.2
    const radius = DIAL_RADIUS - 0.16 - length * 0.5
    const x = Math.sin(angle) * radius
    const y = FACE_Y + Math.cos(angle) * radius
    parent.add(
      flatPlate(m.graphite, [major ? 0.075 : 0.04, length], [x, y, 1.355], [0, 0, -angle], false),
    )
  }

  // Needle, counterweight, and stacked pivot hub.
  const needleAngle = 0.72
  const needleLength = 1.25
  const needlePivot = new Group()
  needlePivot.name = 'pressure-gauge / animated needle'
  needlePivot.position.set(0, FACE_Y, 1.43)
  parent.add(needlePivot)
  needlePivot.add(
    prism(m.graphite, [0.105, needleLength, 0.055], [
      Math.sin(needleAngle) * needleLength * 0.44,
      Math.cos(needleAngle) * needleLength * 0.44,
      0,
    ], {
      chamfer: [0.045, 0.045, 0.025, 0.025],
      fillet: 0.02,
      bevel: 0.018,
      rotation: [0, 0, -needleAngle],
    }),
  )
  const tailLength = 0.55
  needlePivot.add(
    prism(m.graphite, [0.13, tailLength, 0.06], [
      -Math.sin(needleAngle) * tailLength * 0.46,
      -Math.cos(needleAngle) * tailLength * 0.46,
      0,
    ], {
      chamfer: 0.04,
      fillet: 0.02,
      bevel: 0.018,
      rotation: [0, 0, -needleAngle],
    }),
  )
  parent.add(disk(m.graphite, 0.27, 0.09, [0, FACE_Y, 1.45], 32))
  parent.add(disk(m.graphiteEdge, 0.1, 0.095, [0, FACE_Y, 1.51], 24))

  // Small amber status lamp in the quiet lower quadrant.
  parent.add(disk(m.graphite, 0.19, 0.055, [0, FACE_Y - 1.08, 1.38], 24))
  parent.add(disk(m.amber, 0.105, 0.06, [0, FACE_Y - 1.08, 1.42], 24))
  return needlePivot
}

function addSideIndicator(parent: Group, m: GaugeMaterials): void {
  // A raised white service pod shelters the amber level tube. Its negative
  // space separates it from the circular bezel and makes it a landmark.
  parent.add(
    prism(m.shell, [0.84, 2.46, 0.48], [2.13, FACE_Y - 0.04, 0.85], {
      chamfer: [0.2, 0.2, 0.15, 0.15],
      fillet: 0.055,
      bevel: 0.055,
    }),
  )
  parent.add(
    prism(m.graphite, [0.54, 1.72, 0.19], [2.13, FACE_Y - 0.04, 1.14], {
      chamfer: 0.18,
      fillet: 0.08,
      bevel: 0.025,
    }),
  )
  parent.add(prism(m.ink, [0.34, 1.42, 0.08], [2.13, FACE_Y - 0.04, 1.265], {
    chamfer: 0.15,
    fillet: 0.07,
    bevel: 0.018,
  }))
  parent.add(cylinder(m.amberDim, 0.105, 1.12, [2.13, FACE_Y - 0.04, 1.34], [0, 0, 0], 12))
  const sphereGeometry = new SphereGeometry(0.105, 12, 8)
  for (const y of [FACE_Y - 0.54, FACE_Y + 0.54]) {
    const cap = new Mesh(sphereGeometry.clone(), m.amber)
    cap.position.set(2.13, y - 0.04, 1.34)
    parent.add(cap)
  }
  for (const x of [1.92, 2.34]) {
    for (const y of [FACE_Y - 0.83, FACE_Y + 0.75]) {
      parent.add(disk(m.ink, 0.085, 0.04, [x, y, 1.32], 12))
      parent.add(disk(m.graphiteEdge, 0.04, 0.045, [x, y, 1.345], 8))
    }
  }
}

function addConnector(parent: Group, m: GaugeMaterials): void {
  const axisX = 0.24
  const bodyBottom = FACE_Y - OUTER_RADIUS
  parent.add(prism(m.graphite, [0.96, 0.56, 0.82], [axisX, bodyBottom - 0.11, -0.04], {
    chamfer: 0.13,
    fillet: 0.045,
    bevel: 0.045,
  }))
  parent.add(cylinder(m.graphiteEdge, 0.5, 0.34, [axisX, bodyBottom - 0.52, -0.02], [0, 0, 0], 8))
  parent.add(cylinder(m.brass, 0.35, 0.34, [axisX, bodyBottom - 0.84, -0.02], [0, 0, 0], 12))
  parent.add(cylinder(m.graphite, 0.47, 0.5, [axisX, bodyBottom - 1.25, -0.02], [0, 0, 0], 12))

  // Grip flutes around the coupling are geometry rather than a procedural
  // normal pattern, so the silhouette survives thumbnail scale.
  for (let index = 0; index < 12; index += 1) {
    const angle = (index / 12) * Math.PI * 2
    const x = axisX + Math.sin(angle) * 0.47
    const z = -0.02 + Math.cos(angle) * 0.47
    parent.add(prism(m.graphiteEdge, [0.065, 0.4, 0.085], [x, bodyBottom - 1.25, z], {
      chamfer: 0.02,
      fillet: 0.012,
      bevel: 0.012,
      rotation: [0, angle, 0],
    }))
  }
  const cyanRing = new Mesh(new TorusGeometry(0.43, 0.04, 8, 32), m.cyan)
  cyanRing.position.set(axisX, bodyBottom - 1.55, -0.02)
  cyanRing.rotation.x = Math.PI / 2
  parent.add(cyanRing)
  parent.add(cylinder(m.graphite, 0.28, 0.62, [axisX, bodyBottom - 1.85, -0.02], [0, 0, 0], 12))
  parent.add(cylinder(m.ink, 0.18, 0.24, [axisX, bodyBottom - 2.28, -0.02], [0, 0, 0], 12))
}

function acquireMaterials(): {
  materials: GaugeMaterials
  handles: MaterialHandle[]
  profiles: Map<MeshPhysicalMaterial, WearProfile>
} {
  const library = new MaterialLibrary()
  const shell = library.acquire({ recipeId: 'MAT-04', palette: 'SHELL-200', condition: 'maintained', seed: 3301 })
  const shellShade = library.acquire({ recipeId: 'MAT-04', palette: 'SHELL-300', condition: 'maintained', seed: 3302 })
  const graphite = library.acquire({ recipeId: 'MAT-03', palette: 'GRAPHITE-800', condition: 'maintained', seed: 3303 })
  const graphiteEdge = library.acquire({ recipeId: 'MAT-03', palette: 'GRAPHITE-700', condition: 'maintained', seed: 3304 })
  const ink = library.acquire({ recipeId: 'MAT-03', palette: 'INK-950', condition: 'maintained', seed: 3305 })
  const dial = library.acquire({ recipeId: 'MAT-07', palette: 'AMBER-050', condition: 'maintained', seed: 3306 })
  const brass = library.acquire({ recipeId: 'MAT-07', palette: 'BRASS', condition: 'maintained', seed: 3307 })
  const amber = library.acquire({ recipeId: 'MAT-09', palette: 'AMBER-400', condition: 'active', seed: 3308 })
  const amberDim = library.acquire({ recipeId: 'MAT-09', palette: 'AMBER-400', condition: 'active', seed: 3309 })
  const cyan = library.acquire({ recipeId: 'MAT-09', palette: 'CYAN-400', condition: 'active', seed: 3310 })

  const materials: GaugeMaterials = {
      shell: tuneMaterial(shell, 0xb6bab8, 0.52, 0.16, { clearcoat: 0.2 }),
      shellShade: tuneMaterial(shellShade, 0x81898b, 0.58, 0.2, { clearcoat: 0.12 }),
    graphite: tuneMaterial(graphite, 0x242a30, 0.43, 0.52, { clearcoat: 0.22 }),
    graphiteEdge: tuneMaterial(graphiteEdge, 0x444b50, 0.39, 0.58, { clearcoat: 0.25 }),
    ink: tuneMaterial(ink, 0x090d11, 0.68, 0.3),
    dial: tuneMaterial(dial, 0xc79643, 0.5, 0.16, { emissive: 0.34 }),
    brass: tuneMaterial(brass, 0x8c6427, 0.34, 0.72, { clearcoat: 0.18 }),
    amber: tuneMaterial(amber, 0xffa21a, 0.22, 0, { emissive: 3.2 }),
    amberDim: tuneMaterial(amberDim, 0xe77b08, 0.25, 0, { emissive: 1.7 }),
    cyan: tuneMaterial(cyan, 0x43e7e9, 0.25, 0, { emissive: 1.8 }),
  }
  const profiles = new Map<MeshPhysicalMaterial, WearProfile>([
    [materials.shell, { rub: 0.78, grime: 0.66, scratch: 0.92 }],
    [materials.shellShade, { rub: 0.62, grime: 0.78, scratch: 0.74 }],
    [materials.brass, { rub: 0.24, grime: 0.4, scratch: 0.25 }],
  ])

  return {
    handles: [shell, shellShade, graphite, graphiteEdge, ink, dial, brass, amber, amberDim, cyan],
    materials,
    profiles,
  }
}

export function createModel(): {
  root: Group
  update: (deltaSeconds: number) => void
  triggerPressureTest: () => void
  dispose: () => void
} {
  const { materials, handles, profiles } = acquireMaterials()
  const root = new Group()
  root.name = 'pressure-gauge'

  addMount(root, materials)
  addHousing(root, materials)
  const needlePivot = addFace(root, materials)
  addSideIndicator(root, materials)
  addConnector(root, materials)

  // Bake form-aware grime and edge wear while every authored part still has
  // its own source material and spatial relationship. Signals and the warm
  // dial intentionally retain their clean emissive materials.
  bakeOcclusion(root)
  bakeSurfaceAttributes(root, profiles)
  const wearMaterial = createWearMaterial({ name: 'pressure-gauge / worn chassis' })
  root.traverse((object) => {
    if (!(object instanceof Mesh) || Array.isArray(object.material)) return
    if (profiles.has(object.material as MeshPhysicalMaterial)) object.material = wearMaterial
  })

  // Collapse the static prop to one draw per resolved material. The needle is
  // the only moving assembly, so it stays outside the batches and is restored
  // under its pivot after the static geometry has been flattened.
  root.remove(needlePivot)
  const mergedGeometries = mergeStaticByMaterial(root, {
    retainedAttributes: (material) => material === wearMaterial ? WEAR_ATTRIBUTES : [],
    meshName: (material) => `pressure-gauge / ${material.name}`,
  })
  const staticMeshes = root.children.filter((object): object is Mesh => object instanceof Mesh)
  const batchedGeometries = staticMeshes.map((mesh, index) => {
    const source = mergedGeometries[index]
    const indexed = mergeVertices(source, 1e-5)
    mesh.geometry = indexed
    source.dispose()
    return indexed
  })
  root.add(needlePivot)

  let testElapsed = -1
  const testDuration = 2.3
  const smooth = (value: number): number => value * value * (3 - 2 * value)

  return {
    root,
    update: (deltaSeconds: number) => {
      if (testElapsed < 0) return
      testElapsed = Math.min(testDuration, testElapsed + Math.min(Math.max(deltaSeconds, 0), 0.05))
      const response = testElapsed < 0.82
        ? smooth(testElapsed / 0.82)
        : 1 - smooth((testElapsed - 0.82) / (testDuration - 0.82))
      needlePivot.rotation.z = -response * 1.3
      materials.amber.emissiveIntensity = 3.2 + response * 2.2
      materials.amberDim.emissiveIntensity = 1.7 + response * 3.1
      if (testElapsed >= testDuration) {
        testElapsed = -1
        needlePivot.rotation.z = 0
        materials.amber.emissiveIntensity = 3.2
        materials.amberDim.emissiveIntensity = 1.7
      }
    },
    triggerPressureTest: () => {
      testElapsed = 0
    },
    dispose: () => {
      needlePivot.traverse((object) => {
        if (object instanceof Mesh) object.geometry.dispose()
      })
      for (const geometry of batchedGeometries) geometry.dispose()
      wearMaterial.dispose()
      for (const handle of handles) handle.release()
    },
  }
}

export function createPreview(options: { aspect: number }): {
  scene: Scene
  root: Group
  camera: PerspectiveCamera
  update: (deltaSeconds: number) => void
  triggerPressureTest: () => void
  dispose: () => void
} {
  const controller = createModel()
  const scene = new Scene()
  scene.name = 'pressure-gauge / reference-matched preview'
  scene.background = new Color(0x000000)
  scene.add(controller.root)

  scene.add(new HemisphereLight(0x94a9b5, 0x080a0d, 0.65))
  const key = new DirectionalLight(0xfff0dc, 2.05)
  key.position.set(-7, 10, 11)
  scene.add(key)
  const fill = new DirectionalLight(0x9ec4db, 0.75)
  fill.position.set(9, 4, 8)
  scene.add(fill)
  const rim = new DirectionalLight(0x8ba9c0, 0.85)
  rim.position.set(6, 8, -9)
  scene.add(rim)

  const aspect = Number.isFinite(options.aspect) && options.aspect > 0 ? options.aspect : 1
  const camera = new PerspectiveCamera(31, aspect, 0.15, 80)
  camera.name = 'pressure-gauge / reference camera'
  camera.position.set(5.3, 6.15, 13.5)
  camera.lookAt(0.25, 2.55, 0)
  scene.add(camera)

  return {
    scene,
    root: controller.root,
    camera,
    update: controller.update,
    triggerPressureTest: controller.triggerPressureTest,
    dispose: () => {
      scene.remove(controller.root)
      controller.dispose()
    },
  }
}
