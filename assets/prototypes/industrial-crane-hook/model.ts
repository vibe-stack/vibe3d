import {
  Color,
  DirectionalLight,
  ExtrudeGeometry,
  Group,
  HemisphereLight,
  Mesh,
  MeshPhysicalMaterial,
  Object3D,
  PerspectiveCamera,
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

type Point = readonly [number, number]
type CraneHookState = 'active' | 'service-off'

const X_AXIS: Vec3 = [0, 0, Math.PI / 2]
const FRONT: Vec3 = [Math.PI / 2, 0, 0]

interface CraneHookMaterials {
  shell: MeshPhysicalMaterial
  shellShade: MeshPhysicalMaterial
  graphite: MeshPhysicalMaterial
  ink: MeshPhysicalMaterial
  steel: MeshPhysicalMaterial
  rubber: MeshPhysicalMaterial
  amber: MeshPhysicalMaterial
  amberDim: MeshPhysicalMaterial
  cyan: MeshPhysicalMaterial
}

interface CraneHookParts {
  housing: Group
  hook: Group
  safetyLatch: Group
}

interface CraneHookSockets {
  mount_top: Object3D
  cable_top: Object3D
  load_throat: Object3D
  fx_status: Object3D
}

export interface CraneHookController {
  root: Group
  parts: CraneHookParts
  sockets: CraneHookSockets
  state: CraneHookState
  setState(state: CraneHookState): CraneHookState
  setLatchOpen(open: boolean): boolean
  update(deltaSeconds: number): void
  dispose(): void
}

interface PreviewController extends CraneHookController {
  scene: Scene
  camera: PerspectiveCamera
}

function acquireMaterials(): {
  materials: CraneHookMaterials
  handles: MaterialHandle[]
  wearProfiles: Map<MeshPhysicalMaterial, WearProfile>
} {
  const library = new MaterialLibrary()
  const shellHandle = library.acquire({ recipeId: 'MAT-04', palette: 'SHELL-200', condition: 'worked', seed: 36701 })
  const shellShadeHandle = library.acquire({ recipeId: 'MAT-04', palette: 'SLATE-650', condition: 'worked', seed: 36702 })
  const graphiteHandle = library.acquire({ recipeId: 'MAT-03', palette: 'GRAPHITE-800', condition: 'worked', seed: 36703 })
  const inkHandle = library.acquire({ recipeId: 'MAT-03', palette: 'INK-950', condition: 'maintained', seed: 36704 })
  const steelHandle = library.acquire({ recipeId: 'MAT-03', palette: 'SLATE-650', condition: 'worked', seed: 36705 })
  const rubberHandle = library.acquire({ recipeId: 'MAT-07', palette: 'INK-900', condition: 'worked', seed: 36706 })
  const amberHandle = library.acquire({ recipeId: 'MAT-17', palette: 'AMBER-400', condition: 'active', seed: 36707 })
  const amberDimHandle = library.acquire({ recipeId: 'MAT-17', palette: 'AMBER-400', condition: 'worked', seed: 36708 })
  const cyanHandle = library.acquire({ recipeId: 'MAT-17', palette: 'CYAN-400', condition: 'active', seed: 36709 })

  const materials: CraneHookMaterials = {
    shell: tuneMaterial(shellHandle, 0xd9e6e9, 0.48, 0.82, { clearcoat: 0.1, clearcoatRoughness: 0.42 }),
    shellShade: tuneMaterial(shellShadeHandle, 0x7d8b93, 0.55, 0.88, { clearcoat: 0.06 }),
    graphite: tuneMaterial(graphiteHandle, 0x182633, 0.5, 0.92, { clearcoat: 0.08 }),
    ink: tuneMaterial(inkHandle, 0x071019, 0.68, 0.86),
    steel: tuneMaterial(steelHandle, 0x56636b, 0.33, 0.97, { clearcoat: 0.13 }),
    rubber: tuneMaterial(rubberHandle, 0x111820, 0.72, 0.03),
    amber: tuneMaterial(amberHandle, 0xf3b33d, 0.2, 0.06, { emissive: 1.55 }),
    amberDim: tuneMaterial(amberDimHandle, 0xf3b33d, 0.42, 0.22, { emissive: 0.08 }),
    cyan: tuneMaterial(cyanHandle, 0x24dfff, 0.2, 0.05, { emissive: 0.72 }),
  }
  materials.amber.toneMapped = true
  materials.amberDim.toneMapped = true
  materials.cyan.toneMapped = true

  const wearProfiles = new Map<MeshPhysicalMaterial, WearProfile>([
    [materials.shell, { rub: 0.055, grime: 0.025, scratch: 0.008 }],
    [materials.shellShade, { rub: 0.08, grime: 0.04, scratch: 0.012 }],
    [materials.graphite, { rub: 0.08, grime: 0.05, scratch: 0.014 }],
    [materials.steel, { rub: 0.2, grime: 0.07, scratch: 0.028 }],
  ])

  return {
    materials,
    handles: [
      shellHandle,
      shellShadeHandle,
      graphiteHandle,
      inkHandle,
      steelHandle,
      rubberHandle,
      amberHandle,
      amberDimHandle,
      cyanHandle,
    ],
    wearProfiles,
  }
}

function profileBody(
  material: MeshPhysicalMaterial,
  points: ReadonlyArray<Point>,
  depth: number,
  position: Vec3,
  bevel = 0.025,
): Mesh {
  const shape = new Shape()
  shape.moveTo(points[0][0], points[0][1])
  for (let index = 1; index < points.length; index += 1) shape.lineTo(points[index][0], points[index][1])
  shape.closePath()
  const coreDepth = Math.max(0.01, depth - bevel * 2)
  const geometry = new ExtrudeGeometry(shape, {
    depth: coreDepth,
    bevelEnabled: true,
    bevelSegments: 1,
    bevelSize: bevel,
    bevelThickness: bevel,
    curveSegments: 1,
    steps: 1,
  })
  geometry.translate(0, 0, -coreDepth * 0.5)
  const mesh = new Mesh(geometry, material)
  mesh.position.set(...position)
  return mesh
}

function box(
  parent: Group,
  material: MeshPhysicalMaterial,
  size: Vec3,
  position: Vec3,
  chamfer = 0.045,
  bevel = 0.014,
  rotation: Vec3 = [0, 0, 0],
): Mesh {
  const mesh = prism(material, size, position, {
    chamfer,
    fillet: Math.min(0.025, Math.max(0.005, chamfer * 0.3)),
    bevel,
    rotation,
  })
  parent.add(mesh)
  return mesh
}

function addBolt(parent: Group, material: MeshPhysicalMaterial, x: number, y: number, z: number, radius = 0.026): void {
  parent.add(cylinder(material, radius, 0.045, [x, y, z], FRONT, 8))
}

function addTopSuspension(housing: Group, m: CraneHookMaterials): void {
  const earProfile: Point[] = [
    [-0.12, -0.18], [-0.12, 0.03], [-0.08, 0.13], [0, 0.18],
    [0.08, 0.13], [0.12, 0.03], [0.12, -0.18],
  ]
  for (const x of [-0.28, 0.28]) {
    housing.add(profileBody(m.graphite, earProfile, 0.28, [x, 0.035, -0.03], 0.02))
    housing.add(cylinder(m.steel, 0.105, 0.06, [x, 0.075, 0.15], FRONT, 16))
    housing.add(cylinder(m.ink, 0.052, 0.068, [x, 0.075, 0.188], FRONT, 12))
  }
  // The cross-pin visibly enters both cheek bearings and establishes the
  // suspended mounting origin at root-space (0, 0, 0).
  housing.add(cylinder(m.ink, 0.066, 0.68, [0, 0.075, -0.01], X_AXIS, 16))
  housing.add(cylinder(m.steel, 0.035, 0.76, [0, 0.075, -0.01], X_AXIS, 12))
  for (const x of [-0.355, 0.355]) housing.add(cylinder(m.graphite, 0.082, 0.055, [x, 0.075, -0.01], X_AXIS, 14))
}

function addHousing(housing: Group, m: CraneHookMaterials): Group {
  const core: Point[] = [
    [-0.48, -0.2], [-0.4, -0.1], [0.4, -0.1], [0.48, -0.2],
    [0.44, -0.76], [0.3, -1.03], [-0.3, -1.03], [-0.44, -0.76],
  ]
  housing.add(profileBody(m.graphite, core, 0.5, [0, 0, 0], 0.045))
  box(housing, m.ink, [0.74, 0.1, 0.34], [0, -0.17, 0], 0.03, 0.01)

  const leftArmor: Point[] = [
    [-0.43, -0.22], [-0.34, -0.13], [-0.1, -0.16], [-0.17, -0.3],
    [-0.18, -0.74], [-0.26, -0.96], [-0.34, -0.92], [-0.42, -0.69],
  ]
  const rightArmor = leftArmor.map(([x, y]) => [-x, y] as Point).reverse()
  housing.add(profileBody(m.shell, leftArmor, 0.56, [0, 0, 0.015], 0.035))
  housing.add(profileBody(m.shellShade, rightArmor, 0.56, [0, 0, 0.015], 0.035))

  // A physically layered operator face holds the state lens inside a dark
  // service recess instead of using a floating emissive decal.
  const panel = new Group()
  panel.name = 'AXR_INDUSTRIAL_CRANE-HOOK_PART_STATUS-PANEL_ACTIVE'
  housing.add(panel)
  box(panel, m.ink, [0.43, 0.56, 0.12], [0.04, -0.55, 0.31], 0.085, 0.022)
  box(panel, m.graphite, [0.31, 0.4, 0.08], [0.04, -0.56, 0.415], 0.065, 0.018)
  box(panel, m.amberDim, [0.19, 0.27, 0.05], [0.04, -0.56, 0.485], 0.045, 0.012)
  for (let row = 0; row < 5; row += 1) {
    for (let column = 0; column < 3; column += 1) {
      box(panel, m.amber, [0.035, 0.035, 0.018], [
        0.04 + (column - 1) * 0.048,
        -0.56 + (row - 2) * 0.046,
        0.522,
      ], 0.009, 0.004)
    }
  }
  box(panel, m.amber, [0.055, 0.025, 0.018], [0.04, -0.76, 0.485], 0.008, 0.003)
  addBolt(panel, m.steel, -0.1, -0.35, 0.485, 0.02)
  addBolt(panel, m.steel, 0.18, -0.35, 0.485, 0.02)

  // Side service access and the asymmetric signal bars keep front/back and
  // operational/service reads distinct at three-quarter view.
  box(housing, m.graphite, [0.19, 0.34, 0.1], [-0.33, -0.51, 0.31], 0.05, 0.014)
  box(housing, m.ink, [0.11, 0.22, 0.06], [-0.33, -0.51, 0.395], 0.032, 0.01)
  housing.add(cylinder(m.steel, 0.052, 0.055, [-0.33, -0.49, 0.445], FRONT, 12))
  housing.add(cylinder(m.ink, 0.024, 0.064, [-0.33, -0.49, 0.48], FRONT, 10))
  for (const x of [-0.3, 0.31]) {
    box(housing, m.ink, [0.072, 0.24, 0.055], [x, -0.74, 0.355], 0.026, 0.008)
    box(housing, m.amber, [0.028, 0.15, 0.022], [x, -0.74, 0.398], 0.009, 0.003)
  }
  box(housing, m.ink, [0.27, 0.08, 0.06], [0.02, -0.24, 0.36], 0.022, 0.007)
  box(housing, m.cyan, [0.1, 0.018, 0.018], [0.02, -0.24, 0.405], 0.005, 0.002)

  for (const x of [-0.37, 0.37]) {
    addBolt(housing, m.steel, x, -0.3, 0.315)
    addBolt(housing, m.steel, x, -0.82, 0.315)
  }
  return panel
}

function hookProfile(): Point[] {
  // A single concave forged silhouette carries the J-hook read. The open
  // throat is real negative space, with a wide heel and narrow upturned tip.
  return [
    [-0.17, 0.48], [-0.28, 0.38], [-0.39, 0.18], [-0.42, -0.06],
    [-0.34, -0.28], [-0.16, -0.43], [0.08, -0.47], [0.29, -0.38],
    [0.42, -0.19], [0.44, 0.02], [0.37, 0.18], [0.28, 0.26],
    [0.22, 0.18], [0.26, 0.05], [0.23, -0.08], [0.12, -0.2],
    [-0.02, -0.25], [-0.15, -0.21], [-0.24, -0.1], [-0.27, 0.05],
    [-0.22, 0.2], [-0.12, 0.34], [-0.05, 0.4], [0.05, 0.48],
  ]
}

function addHook(hook: Group, latch: Group, m: CraneHookMaterials): void {
  // Swivel stack overlaps both the lower housing and the forged neck.
  box(hook, m.ink, [0.34, 0.18, 0.38], [0, -0.91, 0], 0.065, 0.02)
  box(hook, m.graphite, [0.27, 0.14, 0.43], [0, -1.0, 0], 0.055, 0.016)
  hook.add(cylinder(m.steel, 0.075, 0.5, [0, -1.0, 0], X_AXIS, 14))
  hook.add(cylinder(m.ink, 0.033, 0.54, [0, -1.0, 0], X_AXIS, 10))

  const profile = hookProfile().map(([x, y]) => [x * 0.86, y * 0.92] as Point)
  hook.add(profileBody(m.ink, profile, 0.32, [-0.015, -1.38, -0.015], 0.035))
  const frontProfile = profile.map(([x, y]) => [x * 0.93, y * 0.94] as Point)
  hook.add(profileBody(m.steel, frontProfile, 0.18, [-0.01, -1.375, 0.13], 0.025))
  // A dark throat liner preserves the opening against bright surroundings.
  box(hook, m.graphite, [0.085, 0.24, 0.22], [-0.21, -1.27, 0.02], 0.036, 0.011, [0, 0, -0.2])

  latch.position.set(-0.035, -1.0, 0.205)
  const latchProfile: Point[] = [
    [-0.04, 0.035], [0.04, 0.035], [0.31, -0.12], [0.27, -0.19], [0.2, -0.16],
  ]
  latch.add(profileBody(m.amberDim, latchProfile, 0.12, [0, 0, 0], 0.018))
  box(latch, m.amber, [0.2, 0.032, 0.028], [0.15, -0.075, 0.08], 0.01, 0.003, [0, 0, -0.5])
  latch.add(cylinder(m.ink, 0.045, 0.15, [0, 0, 0.03], FRONT, 12))
  latch.add(cylinder(m.steel, 0.021, 0.17, [0, 0, 0.065], FRONT, 10))
}

function socket(name: string, position: Vec3): Object3D {
  const anchor = new Object3D()
  anchor.name = name
  anchor.position.set(...position)
  return anchor
}

function build() {
  const { materials, handles, wearProfiles } = acquireMaterials()
  const root = new Group()
  root.name = 'AXR_INDUSTRIAL_CRANE-HOOK_ROOT_DEFAULT'
  const housing = new Group()
  housing.name = 'AXR_INDUSTRIAL_CRANE-HOOK_PART_HOUSING_DEFAULT'
  const hook = new Group()
  hook.name = 'AXR_INDUSTRIAL_CRANE-HOOK_PART_HOOK_DEFAULT'
  const safetyLatch = new Group()
  safetyLatch.name = 'AXR_INDUSTRIAL_CRANE-HOOK_PART_SAFETY-LATCH_CLOSED'
  root.add(housing, hook, safetyLatch)

  addTopSuspension(housing, materials)
  const statusPanel = addHousing(housing, materials)
  addHook(hook, safetyLatch, materials)

  const sockets: CraneHookSockets = {
    mount_top: socket('mount_top', [0, 0.075, 0]),
    cable_top: socket('cable_top', [0, 0.2, 0]),
    load_throat: socket('load_throat', [-0.06, -1.42, 0]),
    fx_status: socket('fx_status', [0.04, -0.56, 0.54]),
  }
  root.add(...Object.values(sockets))

  bakeOcclusion(root, { reach: 0.08 })
  bakeSurfaceAttributes(root, wearProfiles)
  const wearMaterial = createWearMaterial({
    name: 'industrial-crane-hook / localized forged and shell wear',
    clearcoat: 0.08,
    clearcoatRoughness: 0.52,
  })
  root.traverse((object) => {
    if (object instanceof Mesh && !Array.isArray(object.material) && wearProfiles.has(object.material)) object.material = wearMaterial
  })
  const mergeOptions = {
    retainedAttributes: (material: unknown): readonly string[] => material === wearMaterial ? WEAR_ATTRIBUTES : [],
    meshName: (material: { name?: string }) => material.name ?? 'industrial crane hook batch',
  }
  const geometries = [
    ...mergeStaticByMaterial(housing, mergeOptions),
    ...mergeStaticByMaterial(hook, mergeOptions),
    ...mergeStaticByMaterial(safetyLatch, mergeOptions),
  ]

  return {
    root,
    parts: { housing, hook, safetyLatch } satisfies CraneHookParts,
    sockets,
    statusPanel,
    materials,
    handles,
    wearMaterial,
    geometries,
  }
}

export function createModel(): CraneHookController {
  const built = build()
  let state: CraneHookState = 'active'
  let latchOpen = false
  let elapsed = 0

  const applyState = (next: CraneHookState): CraneHookState => {
    state = next
    const active = state === 'active'
    built.materials.amber.emissiveIntensity = active ? 0.9 : 0
    built.materials.amberDim.emissiveIntensity = active ? 0.08 : 0
    built.materials.cyan.emissiveIntensity = active ? 0.52 : 0
    built.statusPanel.name = active
      ? 'AXR_INDUSTRIAL_CRANE-HOOK_PART_STATUS-PANEL_ACTIVE'
      : 'AXR_INDUSTRIAL_CRANE-HOOK_PART_STATUS-PANEL_SERVICE-OFF'
    return state
  }

  const controller: CraneHookController = {
    root: built.root,
    parts: built.parts,
    sockets: built.sockets,
    get state() {
      return state
    },
    setState: applyState,
    setLatchOpen: (open: boolean) => {
      latchOpen = open
      built.parts.safetyLatch.rotation.z = open ? -0.52 : 0
      built.parts.safetyLatch.name = open
        ? 'AXR_INDUSTRIAL_CRANE-HOOK_PART_SAFETY-LATCH_OPEN'
        : 'AXR_INDUSTRIAL_CRANE-HOOK_PART_SAFETY-LATCH_CLOSED'
      return latchOpen
    },
    update: (deltaSeconds: number) => {
      elapsed += Math.min(Math.max(deltaSeconds, 0), 0.05)
      if (state === 'active') built.materials.amber.emissiveIntensity = 0.84 + Math.sin(elapsed * 2.2) * 0.06
    },
    dispose: () => {
      for (const geometry of built.geometries) geometry.dispose()
      built.wearMaterial.dispose()
      for (const handle of built.handles) handle.release()
    },
  }
  applyState('active')
  return controller
}

function preview(options: { aspect?: number; state?: CraneHookState; latchOpen?: boolean } = {}): PreviewController {
  const model = createModel()
  model.setState(options.state ?? 'active')
  model.setLatchOpen(options.latchOpen ?? false)

  const scene = new Scene()
  scene.background = new Color(0x020304)
  scene.add(model.root, new HemisphereLight(0xb9c8d4, 0x020407, 0.76))
  const key = new DirectionalLight(0xffead3, 3.2)
  key.position.set(-2.4, 2.8, 3.8)
  scene.add(key)
  const fill = new DirectionalLight(0x78a8cf, 1.25)
  fill.position.set(3.6, 0.8, 3.1)
  scene.add(fill)
  const rim = new DirectionalLight(0x7fa8ba, 1.1)
  rim.position.set(2.8, 2.2, -3.5)
  scene.add(rim)

  const camera = new PerspectiveCamera(32, options.aspect ?? 1, 0.05, 30)
  camera.position.set(-2.25, -0.42, 3.55)
  camera.lookAt(0, -0.78, 0.02)
  scene.add(camera)

  return { ...model, scene, camera }
}

export const createPreview = (options: { aspect?: number } = {}) => preview(options)
export const createServiceOffPreview = (options: { aspect?: number } = {}) => preview({ ...options, state: 'service-off' })
export const createOpenLatchPreview = (options: { aspect?: number } = {}) => preview({ ...options, latchOpen: true })
