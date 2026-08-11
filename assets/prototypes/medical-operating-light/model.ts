import {
  Box3,
  Color,
  DirectionalLight,
  ExtrudeGeometry,
  Group,
  HemisphereLight,
  Mesh,
  MeshPhysicalMaterial,
  PerspectiveCamera,
  PointLight,
  Scene,
  Shape,
} from 'three/webgpu'

import {
  MaterialLibrary,
  WEAR_ATTRIBUTES,
  bakeOcclusion,
  bakeSurfaceAttributes,
  createWearMaterial,
  cylinder,
  mergeStaticByMaterial,
  prism,
  tuneMaterial,
  type MaterialHandle,
  type Vec3,
  type WearProfile,
} from '../../../src/asset-forge/generator/index.ts'

interface Materials {
  shell: MeshPhysicalMaterial
  shellShade: MeshPhysicalMaterial
  graphite: MeshPhysicalMaterial
  ink: MeshPhysicalMaterial
  steel: MeshPhysicalMaterial
  amberLens: MeshPhysicalMaterial
  amberRib: MeshPhysicalMaterial
  cyan: MeshPhysicalMaterial
}

interface Controller {
  root: Group
  update: (deltaSeconds: number) => void
  toggleLightPulse: (enabled?: boolean) => boolean
  dispose: () => void
}

interface Preview {
  scene: Scene
  root: Group
  camera: PerspectiveCamera
  update: (deltaSeconds: number) => void
  toggleLightPulse: (enabled?: boolean) => boolean
  dispose: () => void
}

const activePulseToggles = new Set<(enabled?: boolean) => boolean>()

/** Toggles the restrained diagnostic light pulse. New instances are static. */
export function toggleLightPulse(enabled?: boolean): boolean {
  let state = false
  for (const toggle of activePulseToggles) state = toggle(enabled)
  return state
}

function acquireMaterials(): { materials: Materials; handles: MaterialHandle[] } {
  const library = new MaterialLibrary()
  const shell = library.acquire({ recipeId: 'MAT-04', palette: 'SHELL-200', condition: 'worked', seed: 18801 })
  const shellShade = library.acquire({ recipeId: 'MAT-04', palette: 'SHELL-200', condition: 'worked', seed: 18802 })
  const graphite = library.acquire({ recipeId: 'MAT-03', palette: 'GRAPHITE-800', condition: 'worked', seed: 18803 })
  const ink = library.acquire({ recipeId: 'MAT-03', palette: 'INK-950', condition: 'maintained', seed: 18804 })
  const steel = library.acquire({ recipeId: 'MAT-02', palette: 'STEEL', condition: 'worked', seed: 18805 })
  const amberLens = library.acquire({ recipeId: 'MAT-09', palette: 'AMBER-400', condition: 'active', seed: 18806 })
  const amberRib = library.acquire({ recipeId: 'MAT-09', palette: 'AMBER-400', condition: 'active', seed: 18807 })
  const cyan = library.acquire({ recipeId: 'MAT-09', palette: 'CYAN-400', condition: 'active', seed: 18808 })
  const materials: Materials = {
    shell: tuneMaterial(shell, 0xc8ced0, 0.38, 0.3, { clearcoat: 0.17 }),
    shellShade: tuneMaterial(shellShade, 0x8f989c, 0.5, 0.28, { clearcoat: 0.1 }),
    graphite: tuneMaterial(graphite, 0x20272c, 0.56, 0.56, { clearcoat: 0.07 }),
    ink: tuneMaterial(ink, 0x05080a, 0.78, 0.18),
    steel: tuneMaterial(steel, 0x69777d, 0.3, 0.88),
    amberLens: tuneMaterial(amberLens, 0xcf7008, 0.24, 0.02, { emissive: 0.26 }),
    amberRib: tuneMaterial(amberRib, 0xea850c, 0.17, 0.01, { emissive: 0.58 }),
    cyan: tuneMaterial(cyan, 0x1ba7bf, 0.28, 0.04, { emissive: 0.44 }),
  }
  materials.amberLens.transmission = 0.2
  materials.amberLens.thickness = 0.1
  materials.amberLens.ior = 1.48
  materials.amberRib.transmission = 0.1
  materials.amberRib.thickness = 0.065
  return { materials, handles: [shell, shellShade, graphite, ink, steel, amberLens, amberRib, cyan] }
}

function triangleBadge(material: MeshPhysicalMaterial, position: Vec3, scale = 1): Mesh {
  const shape = new Shape()
  shape.moveTo(-0.11 * scale, 0.08 * scale)
  shape.lineTo(0.11 * scale, 0.08 * scale)
  shape.lineTo(0, -0.1 * scale)
  shape.closePath()
  const geometry = new ExtrudeGeometry(shape, { depth: 0.018, steps: 1, bevelEnabled: false })
  geometry.rotateX(Math.PI / 2)
  geometry.translate(...position)
  return new Mesh(geometry, material)
}

function addMountPlate(parent: Group, m: Materials): void {
  // The layered wall cassette reaches y=0 and is the physical browser datum.
  // Every forward mass overlaps the next member in the mounting load path.
  parent.add(
    prism(m.graphite, [3.92, 2.56, 0.22], [-0.56, 1.28, -0.72], { chamfer: [0.38, 0.28, 0.3, 0.22], fillet: 0.07, bevel: 0.056 }),
    prism(m.shellShade, [3.82, 2.47, 0.22], [-0.59, 1.29, -0.58], { chamfer: [0.35, 0.26, 0.27, 0.2], fillet: 0.065, bevel: 0.052 }),
    prism(m.cyan, [0.075, 1.92, 0.035], [-2.4, 1.31, -0.44], { chamfer: 0.018, fillet: 0.006, bevel: 0.005 }),
    prism(m.cyan, [3.18, 0.055, 0.035], [-0.45, 0.085, -0.44], { chamfer: 0.015, fillet: 0.005, bevel: 0.004 }),
    prism(m.shell, [3.64, 2.3, 0.16], [-0.5, 1.32, -0.43], { chamfer: [0.32, 0.24, 0.25, 0.18], fillet: 0.06, bevel: 0.048 }),
  )

  // Four recessed fasteners visibly pin the cassette to its datum.
  for (const [x, y] of [[-2.13, 2.18], [1.03, 2.16], [-2.15, 0.38], [1.0, 0.34]] as const) {
    parent.add(
      cylinder(m.graphite, 0.12, 0.055, [x, y, -0.31], [Math.PI / 2, 0, 0], 12),
      cylinder(m.steel, 0.057, 0.058, [x, y, -0.275], [Math.PI / 2, 0, 0], 10),
    )
  }
}

function addCompoundMount(parent: Group, m: Materials): void {
  parent.add(
    // Rear shock block, stepped knuckle and forward tongue overlap generously.
    prism(m.graphite, [1.04, 1.78, 0.74], [-1.35, 1.55, -0.08], { chamfer: [0.17, 0.17, 0.1, 0.1], fillet: 0.048, bevel: 0.038 }),
    prism(m.ink, [0.76, 1.38, 0.42], [-1.18, 1.62, 0.38], { chamfer: [0.13, 0.13, 0.08, 0.08], fillet: 0.038, bevel: 0.03, rotation: [0, 0, -0.08] }),
    prism(m.graphite, [1.18, 0.76, 0.86], [-0.68, 1.72, 0.28], { chamfer: [0.15, 0.15, 0.09, 0.09], fillet: 0.044, bevel: 0.035 }),
    cylinder(m.steel, 0.31, 0.78, [-1.16, 1.66, 0.2], [0, 0, Math.PI / 2], 14),
    cylinder(m.graphite, 0.22, 0.84, [-1.16, 1.66, 0.2], [0, 0, Math.PI / 2], 14),
    // The pale swept shoulder closes the L-shaped load path visible above the
    // graphite knuckle; it is part of the mount, not a floating hood greeble.
    prism(m.shell, [1.14, 0.34, 0.72], [-1.5, 2.35, -0.02], { chamfer: [0.13, 0.13, 0.08, 0.08], fillet: 0.035, bevel: 0.028, rotation: [0, 0, -0.15] }),
    // Nested front pivot and diagonal compression link articulate the mount
    // without leaving any implied or edge-only connection.
    prism(m.graphite, [1.02, 0.24, 0.58], [-0.94, 1.98, 0.24], { chamfer: 0.07, fillet: 0.022, bevel: 0.018, rotation: [0, 0, -0.42] }),
    cylinder(m.graphite, 0.28, 0.16, [-1.23, 1.55, 0.66], [Math.PI / 2, 0, 0], 14),
    cylinder(m.steel, 0.16, 0.18, [-1.23, 1.55, 0.76], [Math.PI / 2, 0, 0], 12),
    cylinder(m.ink, 0.075, 0.19, [-1.23, 1.55, 0.785], [Math.PI / 2, 0, 0], 10),
    triangleBadge(m.cyan, [-1.29, 1.66, 0.785], 0.88),
  )
}

function addRearService(parent: Group, m: Materials): void {
  // The reference never exposes the rear, but this mounted appliance needs a
  // credible closed service side. The hatch sits clear of the backplate face,
  // and all louvers are seated on the hatch rather than hanging in space.
  parent.add(
    prism(m.shellShade, [2.45, 1.22, 0.075], [0.05, 1.42, -0.89], { chamfer: [0.14, 0.14, 0.09, 0.09], fillet: 0.036, bevel: 0.029 }),
    prism(m.graphite, [1.94, 0.74, 0.045], [0.02, 1.42, -0.955], { chamfer: 0.08, fillet: 0.024, bevel: 0.019 }),
  )
  for (let index = 0; index < 7; index += 1) {
    parent.add(prism(m.ink, [0.12, 0.5, 0.025], [-0.54 + index * 0.19, 1.42, -0.995], {
      chamfer: 0.018,
      fillet: 0.006,
      bevel: 0.005,
      rotation: [0, 0, -0.08],
    }))
  }
  for (const x of [-0.94, 1.02]) parent.add(cylinder(m.steel, 0.055, 0.035, [x, 1.42, -0.99], [Math.PI / 2, 0, 0], 10))
}

function addLampHousing(parent: Group, m: Materials): void {
  // A deep graphite chassis carries the lens; the white armor is an overlapping
  // upper hood and end returns, leaving the characteristic undercut visible.
  parent.add(
    prism(m.graphite, [4.86, 1.76, 1.34], [0.42, 1.35, 0.49], { chamfer: [0.3, 0.3, 0.2, 0.2], fillet: 0.075, bevel: 0.06 }),
    prism(m.ink, [4.62, 1.42, 1.42], [0.48, 1.22, 0.63], { chamfer: [0.26, 0.26, 0.17, 0.17], fillet: 0.065, bevel: 0.052 }),
    prism(m.shellShade, [4.96, 0.82, 1.34], [0.42, 2.06, 0.46], { chamfer: [0.24, 0.24, 0.14, 0.14], fillet: 0.06, bevel: 0.048 }),
    prism(m.shell, [4.76, 0.73, 1.38], [0.37, 2.16, 0.5], { chamfer: [0.23, 0.23, 0.13, 0.13], fillet: 0.057, bevel: 0.046, rotation: [0, 0, -0.045] }),
    prism(m.shellShade, [0.35, 0.72, 1.28], [-1.89, 1.52, 0.48], { chamfer: 0.11, fillet: 0.032, bevel: 0.026 }),
    prism(m.shellShade, [0.28, 0.69, 1.26], [2.72, 1.5, 0.47], { chamfer: 0.1, fillet: 0.03, bevel: 0.024 }),
    // Raised hood seam and cyan datum stripe are physically proud, not decals.
    prism(m.graphite, [4.43, 0.075, 0.04], [0.44, 1.84, 1.165], { chamfer: 0.018, fillet: 0.006, bevel: 0.005 }),
    prism(m.cyan, [4.1, 0.035, 0.025], [0.34, 2.05, 1.205], { chamfer: 0.009, fillet: 0.003, bevel: 0.002, rotation: [0, 0, -0.045] }),
    triangleBadge(m.cyan, [1.18, 2.3, 1.205], 1.05),
  )

  for (const [x, y] of [[-1.56, 2.42], [2.56, 2.15]] as const) {
    parent.add(
      cylinder(m.graphite, 0.1, 0.05, [x, y, 1.19], [Math.PI / 2, 0, 0], 12),
      cylinder(m.steel, 0.048, 0.052, [x, y, 1.225], [Math.PI / 2, 0, 0], 10),
    )
  }
}

function addOptic(parent: Group, m: Materials): void {
  // Three nested depths form a true bezel, cavity, and seated optic. The amber
  // lens sits behind the outer bezel while its ribs project through the face.
  parent.add(
    prism(m.graphite, [4.14, 1.28, 0.38], [0.5, 1.23, 1.15], { chamfer: [0.22, 0.22, 0.14, 0.14], fillet: 0.057, bevel: 0.046 }),
    prism(m.ink, [3.86, 1.06, 0.27], [0.5, 1.25, 1.35], { chamfer: [0.19, 0.19, 0.12, 0.12], fillet: 0.048, bevel: 0.039 }),
    prism(m.amberLens, [3.57, 0.88, 0.12], [0.5, 1.27, 1.515], { chamfer: [0.16, 0.16, 0.1, 0.1], fillet: 0.042, bevel: 0.034 }),
    prism(m.amberRib, [3.31, 0.09, 0.045], [0.5, 1.61, 1.59], { chamfer: 0.018, fillet: 0.006, bevel: 0.005 }),
    prism(m.amberRib, [3.27, 0.075, 0.06], [0.5, 0.91, 1.605], { chamfer: 0.018, fillet: 0.006, bevel: 0.005 }),
  )
  for (let index = 0; index < 19; index += 1) {
    const x = -1.02 + index * 0.169
    parent.add(prism(m.amberRib, [0.075, 0.76, 0.075], [x, 1.27, 1.61], {
      chamfer: 0.018,
      fillet: 0.006,
      bevel: 0.005,
      rotation: [0, 0, (index - 9) * -0.0025],
    }))
  }
}

function addUndercut(parent: Group, m: Materials): void {
  parent.add(
    prism(m.graphite, [4.02, 0.3, 1.2], [0.43, 0.48, 0.42], { chamfer: [0.18, 0.18, 0.1, 0.1], fillet: 0.045, bevel: 0.036 }),
    prism(m.ink, [1.28, 0.075, 0.72], [1.08, 0.3, 0.45], { chamfer: 0.07, fillet: 0.022, bevel: 0.018 }),
  )
  for (let index = 0; index < 8; index += 1) {
    parent.add(prism(m.graphite, [0.075, 0.035, 0.48], [0.79 + index * 0.09, 0.245, 0.45], {
      chamfer: 0.012,
      fillet: 0.004,
      bevel: 0.003,
      rotation: [0, 0.12, 0],
    }))
  }
  parent.add(cylinder(m.steel, 0.06, 0.06, [-0.3, 0.27, 0.95], [0, 0, 0], 10))
}

function buildLight(): {
  root: Group
  materials: Materials
  handles: MaterialHandle[]
  wear: MeshPhysicalMaterial
  geometries: Array<{ dispose: () => void }>
} {
  const acquired = acquireMaterials()
  const m = acquired.materials
  const root = new Group()
  root.name = 'medical-operating-light'
  addMountPlate(root, m)
  addCompoundMount(root, m)
  addRearService(root, m)
  const head = new Group()
  head.name = 'operating light / forward lamp head'
  head.position.x = 0.36
  addLampHousing(head, m)
  addOptic(head, m)
  addUndercut(head, m)
  root.add(head)

  const profiles = new Map<MeshPhysicalMaterial, WearProfile>([
    [m.shell, { rub: 0.58, grime: 0.48, scratch: 0.21 }],
    [m.shellShade, { rub: 0.48, grime: 0.54, scratch: 0.18 }],
    [m.graphite, { rub: 0.17, grime: 0.28, scratch: 0.1 }],
    [m.steel, { rub: 0.16, grime: 0.2, scratch: 0.2 }],
  ])
  bakeOcclusion(root, { reach: 0.2 })
  bakeSurfaceAttributes(root, profiles)
  const wear = createWearMaterial({ name: 'operating light / localized edge wear', clearcoat: 0.14, clearcoatRoughness: 0.52 })
  root.traverse((object) => {
    if (!(object instanceof Mesh) || Array.isArray(object.material)) return
    if (profiles.has(object.material as MeshPhysicalMaterial)) object.material = wear
  })

  const geometries = mergeStaticByMaterial(root, {
    retainedAttributes: (material) => material === wear ? WEAR_ATTRIBUTES : [],
    meshName: (material) => `operating light / ${material.name}`,
  })
  root.updateMatrixWorld(true)
  const bounds = new Box3().setFromObject(root, true)
  root.position.y -= bounds.min.y
  root.updateMatrixWorld(true)
  return { root, materials: m, handles: acquired.handles, wear, geometries }
}

export function createModel(): Controller {
  const rig = buildLight()
  let pulseEnabled = false
  let elapsed = 0
  const localToggle = (enabled?: boolean): boolean => {
    pulseEnabled = enabled ?? !pulseEnabled
    return pulseEnabled
  }
  activePulseToggles.add(localToggle)
  return {
    root: rig.root,
    toggleLightPulse: localToggle,
    update: (deltaSeconds: number) => {
      const delta = Math.min(Math.max(deltaSeconds, 0), 0.05)
      if (pulseEnabled) elapsed += delta
      const wave = pulseEnabled ? Math.sin(elapsed * 2.2) : 0
      rig.materials.amberLens.emissiveIntensity = 0.26 + wave * 0.06
      rig.materials.amberRib.emissiveIntensity = 0.58 + wave * 0.12
    },
    dispose: () => {
      activePulseToggles.delete(localToggle)
      for (const geometry of rig.geometries) geometry.dispose()
      rig.wear.dispose()
      for (const handle of rig.handles) handle.release()
    },
  }
}

function camera(aspect: number, position: Vec3, target: Vec3, fov = 29): PerspectiveCamera {
  const result = new PerspectiveCamera(fov, aspect, 0.18, 60)
  result.position.set(...position)
  result.lookAt(...target)
  return result
}

function makePreview(options: { aspect: number }, view: 'beauty' | 'side' | 'rear' | 'low' | 'pulse'): Preview {
  const controller = createModel()
  if (view === 'pulse') {
    controller.toggleLightPulse(true)
    for (let step = 0; step < 31; step += 1) controller.update(0.05)
  }
  const scene = new Scene()
  scene.background = new Color(0x000000)
  scene.add(controller.root, new HemisphereLight(0xaab7bd, 0x050608, 0.48))
  const key = new DirectionalLight(0xffedda, 2.75); key.position.set(-5, 8, 8)
  const fill = new DirectionalLight(0x7495ac, 0.72); fill.position.set(8, 5, 7)
  const rim = new DirectionalLight(0x8aa5ba, 1.05); rim.position.set(6, 7, -7)
  const optic = new PointLight(0xff9b18, view === 'pulse' ? 0.5 : 0.3, 4.5); optic.position.set(0.86, 1.25, 2.15)
  optic.userData.excludeFromExport = true
  scene.add(key, fill, rim, optic)
  const aspect = Number.isFinite(options.aspect) && options.aspect > 0 ? options.aspect : 1
  const previewCamera = view === 'side'
    ? camera(aspect, [6.9, 2.65, 0.3], [0, 1.35, 0.15], 31)
    : view === 'rear'
      ? camera(aspect, [-5.8, 3.0, -6.4], [-0.2, 1.35, -0.2], 30)
      : view === 'low'
        ? camera(aspect, [5.6, 0.3, 6.5], [0.15, 1.15, 0.2], 31)
        : camera(aspect, [-6.55, 3.85, 9.8], [-0.05, 1.37, 0.18], 31)
  scene.add(previewCamera)
  return {
    scene,
    root: controller.root,
    camera: previewCamera,
    update: controller.update,
    toggleLightPulse: controller.toggleLightPulse,
    dispose: () => { scene.remove(controller.root); controller.dispose() },
  }
}

export function createPreview(options: { aspect: number }): Preview { return makePreview(options, 'beauty') }
export function createSidePreview(options: { aspect: number }): Preview { return makePreview(options, 'side') }
export function createRearPreview(options: { aspect: number }): Preview { return makePreview(options, 'rear') }
export function createLowPreview(options: { aspect: number }): Preview { return makePreview(options, 'low') }
export function createPulsePreview(options: { aspect: number }): Preview { return makePreview(options, 'pulse') }
