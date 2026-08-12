import {
  Color,
  DirectionalLight,
  Group,
  HemisphereLight,
  Mesh,
  MeshPhysicalMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
} from 'three/webgpu'

import {
  WEAR_ATTRIBUTES,
  bakeOcclusion,
  bakeSurfaceAttributes,
  createWearMaterial,
  cylinder,
  mergeStaticByMaterial,
  prism,
  type Vec3,
  type WearProfile,
} from '../../../src/asset-forge/generator/index.ts'

const Z_AXIS: Vec3 = [Math.PI / 2, 0, 0]

/** Half width and half depth of the ivory shell; the front face lives at +Z. */
const HALF_W = 1.45
const HALF_D = 1.45
/** Shell sits on the skid; body height is 1.38x the front-face width. */
const SHELL_BOTTOM = 0.55
const SHELL_TOP = 4.69
const FRONT = HALF_D
/** Recessed cavity floor sitting behind the proud graphite bezel lip. */
const CAVITY = FRONT + 0.02
/** Front stack: drive array, cooling band, and data bay inside the bezel. */
const DRIVE_Y = 3.19
const BAND_Y = 1.95
const IO_Y = 1.26

interface CabinetMaterials {
  shell: MeshPhysicalMaterial
  shellShade: MeshPhysicalMaterial
  graphite: MeshPhysicalMaterial
  edge: MeshPhysicalMaterial
  ink: MeshPhysicalMaterial
  steel: MeshPhysicalMaterial
  grime: MeshPhysicalMaterial
  amber: MeshPhysicalMaterial
  amberDim: MeshPhysicalMaterial
  cyan: MeshPhysicalMaterial
}

interface CabinetController {
  powered: boolean
}

interface CabinetRig {
  root: Group
  controller: CabinetController
  materials: CabinetMaterials
  wear: MeshPhysicalMaterial
  geometries: Array<{ dispose: () => void }>
}

let cabinetPowered = true
const liveControllers = new Set<CabinetController>()

/** Toggles every live cabinet's drive and signal emission. The default state is powered. */
export function toggleServerCabinet(force?: boolean): boolean {
  cabinetPowered = force ?? !cabinetPowered
  for (const controller of liveControllers) controller.powered = cabinetPowered
  return cabinetPowered
}

function materials(): CabinetMaterials {
  return {
    shell: new MeshPhysicalMaterial({
      name: 'server-cabinet / maintained ivory armor',
      color: 0xb8bcb7, roughness: 0.44, metalness: 0.34,
      clearcoat: 0.16, clearcoatRoughness: 0.4,
    }),
    shellShade: new MeshPhysicalMaterial({
      name: 'server-cabinet / shadowed shell armor',
      color: 0x8f9795, roughness: 0.5, metalness: 0.46,
      clearcoat: 0.09,
    }),
    graphite: new MeshPhysicalMaterial({
      name: 'server-cabinet / graphite corner armor',
      color: 0x24262a, roughness: 0.57, metalness: 0.6,
      clearcoat: 0.08,
    }),
    edge: new MeshPhysicalMaterial({
      name: 'server-cabinet / rubbed structural steel',
      color: 0x3e4042, roughness: 0.4, metalness: 0.74,
      clearcoat: 0.12,
    }),
    ink: new MeshPhysicalMaterial({
      name: 'server-cabinet / service cavity',
      color: 0x0f1113, roughness: 0.62, metalness: 0.46,
    }),
    steel: new MeshPhysicalMaterial({
      name: 'server-cabinet / fastener and latch steel',
      color: 0x9ea5a4, roughness: 0.25, metalness: 0.96,
      clearcoat: 0.2,
    }),
    grime: new MeshPhysicalMaterial({
      name: 'server-cabinet / seam and vent grime',
      color: 0x272420, roughness: 0.85, metalness: 0.14,
    }),
    amber: new MeshPhysicalMaterial({
      name: 'server-cabinet / amber interaction hardware',
      color: 0xd97709, roughness: 0.28, metalness: 0.1,
      emissive: new Color(0xff5c00), emissiveIntensity: 0.6,
    }),
    amberDim: new MeshPhysicalMaterial({
      name: 'server-cabinet / amber drive status lenses',
      color: 0xc9720c, roughness: 0.24, metalness: 0.05,
      emissive: new Color(0xff6200), emissiveIntensity: 0.6,
    }),
    cyan: new MeshPhysicalMaterial({
      name: 'server-cabinet / cyan data-bay witness',
      color: 0x1fb6c4, roughness: 0.2, metalness: 0.05,
      emissive: new Color(0x14a8b6), emissiveIntensity: 0.85,
    }),
  }
}

function box(
  parent: Group,
  material: MeshPhysicalMaterial,
  size: Vec3,
  position: Vec3,
  chamfer = 0.05,
  bevel = 0.016,
  rotation: Vec3 = [0, 0, 0],
): Mesh {
  const mesh = prism(material, size, position, {
    chamfer,
    fillet: Math.min(0.035, Math.max(0.006, chamfer * 0.32)),
    bevel,
    rotation,
  })
  parent.add(mesh)
  return mesh
}

function boltZ(parent: Group, m: CabinetMaterials, x: number, y: number, z: number, radius = 0.035): void {
  parent.add(cylinder(m.steel, radius, 0.06, [x, y, z], Z_AXIS, 8))
}

function addSkid(root: Group, m: CabinetMaterials): void {
  // Closed graphite skirt: an opaque part of the prop, not a pallet under it.
  box(root, m.graphite, [2.94, 0.5, 2.94], [0, 0.25, 0], 0.1, 0.026)
  box(root, m.graphite, [2.98, 0.13, 2.98], [0, 0.48, 0], 0.12, 0.03)
  box(root, m.ink, [2.9, 0.1, 2.9], [0, 0.06, 0], 0.1, 0.026)

  // Two fork pockets punched into a lighter front skirt band so the openings
  // hold their value against the near-black skid.
  box(root, m.steel, [2.86, 0.36, 0.05], [0, 0.25, HALF_D - 0.05], 0.05, 0.014)
  box(root, m.edge, [2.8, 0.3, 0.05], [0, 0.25, HALF_D - 0.04], 0.045, 0.012)
  for (const x of [-0.72, 0.72]) {
    box(root, m.ink, [0.88, 0.24, 0.22], [x, 0.25, HALF_D - 0.16], 0.04, 0.01)
  }
  box(root, m.ink, [2.4, 0.2, 0.09], [0, 0.25, -(HALF_D - 0.03)], 0.04, 0.01)

  // Skid corner bumpers pick up the amber handling language of the crown caps.
  for (const x of [-1.36, 1.36]) {
    for (const z of [-1.36, 1.36]) {
      box(root, m.graphite, [0.32, 0.42, 0.32], [x, 0.3, z], 0.04, 0.012)
      box(root, m.amber, [0.14, 0.11, 0.14], [x * 1.01, 0.49, z * 1.01], 0.03, 0.008)
    }
  }
}

function addShell(root: Group, m: CabinetMaterials): void {
  const height = SHELL_TOP - SHELL_BOTTOM
  const midY = (SHELL_TOP + SHELL_BOTTOM) / 2

  // Shaded backing body reads as the sheet behind the pale bolted armor plates.
  box(root, m.shellShade, [2.94, height, 2.94], [0, midY, 0], 0.2, 0.05)
  box(root, m.shell, [2.9, height - 0.14, 2.98], [0, midY, 0], 0.19, 0.048)
  box(root, m.shell, [2.98, height - 0.14, 2.9], [0, midY, 0], 0.19, 0.048)

  // Crown plate and its perforated exhaust strip.
  box(root, m.shell, [2.92, 0.18, 2.92], [0, SHELL_TOP + 0.06, 0], 0.2, 0.045)
  box(root, m.edge, [1.36, 0.09, 0.46], [0.18, SHELL_TOP + 0.15, 0.62], 0.06, 0.016)
  box(root, m.ink, [1.2, 0.07, 0.32], [0.18, SHELL_TOP + 0.19, 0.62], 0.05, 0.012)
  for (let index = 0; index < 7; index += 1) {
    box(root, m.edge, [1.1, 0.04, 0.022], [0.18, SHELL_TOP + 0.22, 0.48 + index * 0.047], 0.008, 0.003)
  }
  box(root, m.grime, [1.9, 0.03, 0.05], [0, SHELL_TOP + 0.16, -0.68], 0.012, 0.004)

  // Eight flat wedge caps wrap the vertical corners near-flush with the armor.
  for (const x of [-1.3, 1.3]) {
    for (const z of [-1.3, 1.3]) {
      // Flat faceted wedges hugging the plate perimeter, not rounded pills.
      box(root, m.graphite, [0.46, 0.3, 0.46], [x, SHELL_TOP + 0.02, z], 0.03, 0.006)
      box(root, m.amber, [0.19, 0.05, 0.19], [x, SHELL_TOP + 0.16, z], 0.025, 0.005)
      box(root, m.graphite, [0.44, 0.28, 0.44], [x, SHELL_BOTTOM + 0.1, z], 0.03, 0.006)
    }
  }

  // Corner splines stay at shell value so only the caps read dark; a dark
  // spline the full height would turn the case into a roll cage at distance.
  for (const x of [-1.36, 1.36]) {
    for (const z of [-1.36, 1.36]) {
      box(root, m.shellShade, [0.16, height - 0.6, 0.16], [x, midY, z], 0.05, 0.014)
    }
  }
}

function addSidePanel(root: Group, m: CabinetMaterials, side: number): void {
  const x = side * (HALF_W - 0.02)
  const midY = (SHELL_TOP + SHELL_BOTTOM) / 2 - 0.05

  // Recessed mesh field braced by a welded X; both are real applied hardware.
  box(root, m.edge, [0.1, 3.0, 1.76], [x, midY, 0.06], 0.09, 0.024)
  box(root, m.ink, [0.12, 2.62, 1.46], [x + side * 0.04, midY, 0.06], 0.08, 0.02)
  box(root, m.grime, [0.09, 2.5, 1.34], [x + side * 0.07, midY, 0.06], 0.06, 0.016)
  for (let index = 0; index < 9; index += 1) {
    box(root, m.ink, [0.05, 2.44, 0.055], [x + side * 0.1, midY, -0.56 + index * 0.14], 0.012, 0.004)
  }
  // Chunky strap ribs: a silhouette-level landmark, held inside the vent frame.
  for (const angle of [0.53, -0.53]) {
    box(root, m.graphite, [0.16, 2.66, 0.3], [x + side * 0.1, midY, 0.06], 0.045, 0.014, [angle, 0, 0])
  }
  box(root, m.edge, [0.14, 0.16, 1.68], [x + side * 0.08, midY + 1.42, 0.06], 0.05, 0.016)
  box(root, m.edge, [0.14, 0.16, 1.68], [x + side * 0.08, midY - 1.42, 0.06], 0.05, 0.016)

  // Carry handle recessed into the ivory face, clear of the top edge.
  const handleY = SHELL_TOP - 0.78
  box(root, m.edge, [0.12, 0.26, 0.96], [x, handleY, 0.4], 0.07, 0.02)
  box(root, m.ink, [0.09, 0.16, 0.82], [x + side * 0.04, handleY, 0.4], 0.05, 0.014)
  box(root, m.steel, [0.07, 0.07, 0.76], [x + side * 0.07, handleY - 0.04, 0.4], 0.025, 0.008)
  box(root, m.amberDim, [0.04, 0.06, 0.08], [x + side * 0.08, handleY + 0.04, 0.78], 0.018, 0.005)

  // Draw latches and hinge knuckles on both vertical seams.
  for (const z of [1.24, -1.24]) {
    for (const y of [SHELL_BOTTOM + 0.72, SHELL_TOP - 0.86]) {
      box(root, m.edge, [0.16, 0.34, 0.22], [x - side * 0.02, y, z], 0.07, 0.018)
      box(root, m.steel, [0.1, 0.16, 0.14], [x + side * 0.07, y, z], 0.04, 0.012)
    }
  }
  for (const y of [SHELL_BOTTOM + 1.5, SHELL_TOP - 1.68]) {
    box(root, m.amber, [0.11, 0.2, 0.15], [x + side * 0.02, y, 1.24], 0.045, 0.012)
  }
}

function addRear(root: Group, m: CabinetMaterials): void {
  const z = -(HALF_D + 0.02)
  const midY = (SHELL_TOP + SHELL_BOTTOM) / 2

  box(root, m.shellShade, [2.4, 2.5, 0.12], [0, midY + 0.15, z], 0.16, 0.036)
  box(root, m.ink, [2.06, 1.28, 0.09], [0, midY + 0.66, z - 0.04], 0.12, 0.028)
  for (let index = 0; index < 9; index += 1) {
    box(root, m.edge, [1.9, 0.05, 0.05], [0, midY + 0.12 + index * 0.135, z - 0.08], 0.016, 0.005)
  }
  box(root, m.edge, [1.5, 0.6, 0.1], [0, midY - 0.72, z - 0.05], 0.1, 0.026)
  box(root, m.graphite, [1.24, 0.38, 0.08], [0, midY - 0.72, z - 0.1], 0.08, 0.02)
  for (const x of [-1.06, 1.06]) {
    for (const y of [SHELL_BOTTOM + 0.3, SHELL_TOP - 0.3]) boltZ(root, m, x, y, z - 0.04)
  }
}

function addBezel(root: Group, m: CabinetMaterials): void {
  // Level 1: graphite bezel frame sitting inside a 0.18 ivory border, its own
  // face proud of the shell so the whole front stack reads as a stepped well.
  box(root, m.edge, [2.54, 3.36, 0.12], [0, 2.49, FRONT + 0.03], 0.14, 0.032)
  box(root, m.graphite, [2.3, 3.14, 0.1], [0, 2.49, FRONT - 0.02], 0.12, 0.028)

  // Bezel fasteners follow the real panel boundary.
  for (const x of [-1.18, 1.18]) {
    for (const y of [1.0, 2.49, 3.98]) boltZ(root, m, x, y, FRONT + 0.08, 0.03)
  }
}

function addDriveBay(root: Group, m: CabinetMaterials): void {
  // Level 2: the drive well, recessed a further step behind its own lip.
  box(root, m.edge, [2.16, 1.98, 0.09], [0, DRIVE_Y, CAVITY + 0.03], 0.09, 0.024)
  box(root, m.ink, [1.98, 1.8, 0.1], [0, DRIVE_Y, CAVITY - 0.03], 0.08, 0.022)

  // Level 3: twelve caddies proud of the well floor, each with a real lip.
  for (let column = 0; column < 2; column += 1) {
    const cx = column === 0 ? -0.5 : 0.5
    for (let row = 0; row < 6; row += 1) {
      const y = 2.38 + row * 0.295
      box(root, m.edge, [0.88, 0.235, 0.09], [cx, y, CAVITY + 0.06], 0.035, 0.01)
      box(root, m.graphite, [0.78, 0.15, 0.05], [cx, y, CAVITY + 0.11], 0.028, 0.008)
      box(root, m.ink, [0.44, 0.085, 0.03], [cx + 0.06, y, CAVITY + 0.14], 0.018, 0.005)
      box(root, m.amberDim, [0.05, 0.07, 0.025], [cx - 0.32, y, CAVITY + 0.14], 0.014, 0.004)
      box(root, m.amberDim, [0.035, 0.05, 0.02], [cx + 0.31, y, CAVITY + 0.14], 0.012, 0.004)
    }
  }

  // Light guides sit on the well's side walls and wash the recess.
  for (const x of [-1.03, 1.03]) {
    box(root, m.edge, [0.14, 1.74, 0.11], [x, DRIVE_Y, CAVITY + 0.01], 0.045, 0.012)
    box(root, m.amber, [0.07, 1.54, 0.04], [x, DRIVE_Y, CAVITY + 0.08], 0.024, 0.007)
  }
}

function addServiceBand(root: Group, m: CabinetMaterials): void {
  // Cooling band: two intake grilles framing the illuminated power control.
  box(root, m.edge, [2.16, 0.52, 0.09], [0, BAND_Y, CAVITY + 0.03], 0.07, 0.02)
  box(root, m.ink, [1.98, 0.34, 0.1], [0, BAND_Y, CAVITY - 0.03], 0.06, 0.018)
  for (const x of [-0.58, 0.58]) {
    box(root, m.graphite, [0.6, 0.3, 0.07], [x, BAND_Y, CAVITY + 0.06], 0.05, 0.014)
    box(root, m.grime, [0.52, 0.22, 0.03], [x, BAND_Y, CAVITY + 0.1], 0.04, 0.01)
    for (let index = 0; index < 5; index += 1) {
      box(root, m.edge, [0.48, 0.022, 0.025], [x, BAND_Y - 0.08 + index * 0.042, CAVITY + 0.11], 0.008, 0.003)
    }
  }
  box(root, m.edge, [0.4, 0.4, 0.13], [0, BAND_Y, CAVITY + 0.05], 0.06, 0.016)
  box(root, m.amber, [0.32, 0.32, 0.05], [0, BAND_Y, CAVITY + 0.12], 0.05, 0.012)
  root.add(cylinder(m.ink, 0.085, 0.035, [0, BAND_Y, CAVITY + 0.16], Z_AXIS, 14))
  box(root, m.ink, [0.035, 0.11, 0.03], [0, BAND_Y + 0.07, CAVITY + 0.17], 0.008, 0.003)
  for (const x of [-1.0, 1.0]) {
    box(root, m.amberDim, [0.05, 0.09, 0.03], [x, BAND_Y, CAVITY + 0.07], 0.016, 0.005)
  }
}

function addIoPanel(root: Group, m: CabinetMaterials): void {
  // Data bay: the only cyan-keyed face on the cabinet, framed by a real bezel.
  box(root, m.edge, [2.16, 0.82, 0.09], [0, IO_Y, CAVITY + 0.03], 0.08, 0.022)
  box(root, m.ink, [1.98, 0.64, 0.1], [0, IO_Y, CAVITY - 0.03], 0.07, 0.02)

  for (const x of [-0.68, -0.22]) {
    root.add(cylinder(m.edge, 0.175, 0.07, [x, IO_Y - 0.02, CAVITY + 0.09], Z_AXIS, 8))
    // Cyan appears only as the thin keyed ring lighting each connector shroud.
    root.add(cylinder(m.cyan, 0.162, 0.06, [x, IO_Y - 0.02, CAVITY + 0.13], Z_AXIS, 8))
    root.add(cylinder(m.ink, 0.125, 0.07, [x, IO_Y - 0.02, CAVITY + 0.15], Z_AXIS, 12))
    root.add(cylinder(m.steel, 0.058, 0.05, [x, IO_Y - 0.02, CAVITY + 0.18], Z_AXIS, 10))
    box(root, m.amberDim, [0.07, 0.035, 0.02], [x, IO_Y + 0.24, CAVITY + 0.12], 0.01, 0.004)
  }

  for (let index = 0; index < 3; index += 1) {
    const y = IO_Y - 0.19 + index * 0.19
    box(root, m.edge, [0.2, 0.15, 0.07], [0.34, y, CAVITY + 0.08], 0.025, 0.008)
    box(root, m.ink, [0.14, 0.09, 0.04], [0.34, y, CAVITY + 0.12], 0.016, 0.005)
  }
  box(root, m.edge, [0.42, 0.5, 0.08], [0.78, IO_Y, CAVITY + 0.07], 0.05, 0.014)
  box(root, m.grime, [0.34, 0.42, 0.03], [0.78, IO_Y, CAVITY + 0.11], 0.04, 0.01)
  for (let index = 0; index < 6; index += 1) {
    box(root, m.edge, [0.3, 0.025, 0.025], [0.78, IO_Y - 0.18 + index * 0.07, CAVITY + 0.12], 0.008, 0.003)
  }
}

function addCrownStatus(root: Group, m: CabinetMaterials): void {
  // Segmented capacity readout inside a physical hood above the drive bay.
  const hoodY = 4.36
  box(root, m.edge, [1.32, 0.3, 0.18], [0.2, hoodY, FRONT + 0.04], 0.07, 0.02)
  box(root, m.ink, [1.12, 0.16, 0.1], [0.2, hoodY, FRONT + 0.11], 0.05, 0.014)
  for (let index = 0; index < 5; index += 1) {
    root.add(cylinder(m.amber, 0.037, 0.03, [-0.22 + index * 0.21, hoodY, FRONT + 0.16], Z_AXIS, 10))
  }
  box(root, m.shellShade, [1.36, 0.1, 0.14], [0.2, hoodY + 0.17, FRONT + 0.02], 0.05, 0.014)

  // Ownership plate and seam grime keep the pale door from reading as blank.
  box(root, m.edge, [0.7, 0.14, 0.06], [-0.86, hoodY, FRONT + 0.04], 0.035, 0.01)
  box(root, m.grime, [2.6, 0.035, 0.04], [0, 4.2, FRONT + 0.02], 0.012, 0.004)
  box(root, m.grime, [2.6, 0.035, 0.04], [0, 0.63, FRONT + 0.02], 0.012, 0.004)
}

function buildRig(): CabinetRig {
  const m = materials()
  const root = new Group()
  root.name = 'server cabinet'
  const chassis = new Group()
  chassis.name = 'ruggedised server chassis'
  root.add(chassis)

  addSkid(chassis, m)
  addShell(chassis, m)
  addSidePanel(chassis, m, -1)
  addSidePanel(chassis, m, 1)
  addRear(chassis, m)
  addBezel(chassis, m)
  addDriveBay(chassis, m)
  addServiceBand(chassis, m)
  addIoPanel(chassis, m)
  addCrownStatus(chassis, m)

  const profiles = new Map<MeshPhysicalMaterial, WearProfile>([
    [m.shell, { rub: 0.08, grime: 0.035, scratch: 0.013 }],
    [m.shellShade, { rub: 0.1, grime: 0.06, scratch: 0.017 }],
    [m.graphite, { rub: 0.13, grime: 0.12, scratch: 0.022 }],
    [m.edge, { rub: 0.16, grime: 0.09, scratch: 0.026 }],
    [m.ink, { rub: 0.06, grime: 0.16, scratch: 0.01 }],
    [m.steel, { rub: 0.2, grime: 0.05, scratch: 0.031 }],
    [m.grime, { rub: 0.03, grime: 0.3, scratch: 0.006 }],
  ])
  bakeOcclusion(root, { reach: 0.16 })
  bakeSurfaceAttributes(root, profiles)
  const wear = createWearMaterial({
    name: 'server-cabinet / localized service wear',
    clearcoat: 0.12,
    clearcoatRoughness: 0.44,
  })
  root.traverse((object) => {
    if (!(object instanceof Mesh) || Array.isArray(object.material)) return
    if (profiles.has(object.material)) object.material = wear
  })

  const geometries = mergeStaticByMaterial(chassis, {
    retainedAttributes: (material: unknown): readonly string[] => material === wear ? WEAR_ATTRIBUTES : [],
    meshName: (material: { name?: string }): string => material.name ?? 'server-cabinet batch',
  })
  const controller = { powered: cabinetPowered }
  liveControllers.add(controller)
  root.userData.toggleServerCabinet = toggleServerCabinet
  root.userData.powered = controller.powered
  return { root, controller, materials: m, wear, geometries }
}

export function createModel(): { root: Group; update: (deltaSeconds: number) => void; dispose: () => void } {
  const rig = buildRig()
  let elapsed = 0
  return {
    root: rig.root,
    update: (deltaSeconds: number) => {
      const delta = Math.min(Math.max(deltaSeconds, 0), 0.05)
      elapsed += delta
      rig.root.userData.powered = rig.controller.powered
      const blend = 1 - Math.exp(-delta * 6)
      const driveTarget = rig.controller.powered ? 0.6 + Math.sin(elapsed * 3.1) * 0.14 : 0.04
      const signalTarget = rig.controller.powered ? 0.6 : 0.05
      const cyanTarget = rig.controller.powered ? 0.85 : 0.06
      rig.materials.amberDim.emissiveIntensity += (driveTarget - rig.materials.amberDim.emissiveIntensity) * blend
      rig.materials.amber.emissiveIntensity += (signalTarget - rig.materials.amber.emissiveIntensity) * blend
      rig.materials.cyan.emissiveIntensity += (cyanTarget - rig.materials.cyan.emissiveIntensity) * blend
    },
    dispose: () => {
      liveControllers.delete(rig.controller)
      for (const geometry of rig.geometries) geometry.dispose()
      rig.wear.dispose()
      for (const material of Object.values(rig.materials)) material.dispose()
    },
  }
}

function preview(options: { aspect?: number; mode?: 'beauty' | 'side' | 'rear' | 'low' } = {}) {
  const model = createModel()
  const scene = new Scene()
  scene.background = new Color(0x030405)
  scene.add(model.root)
  scene.add(new HemisphereLight(0xcdd0cb, 0x090909, 0.8))
  const key = new DirectionalLight(0xffeedd, 3.0)
  key.position.set(-6, 11, 9)
  scene.add(key)
  const fill = new DirectionalLight(0x9fa8ab, 0.9)
  fill.position.set(9, 4, 6)
  scene.add(fill)
  const rim = new DirectionalLight(0xb6b2a8, 1.0)
  rim.position.set(6, 8, -9)
  scene.add(rim)

  const floorMaterial = new MeshPhysicalMaterial({ color: 0x080b0d, roughness: 0.9, metalness: 0.06 })
  const floorGeometry = new PlaneGeometry(16, 16)
  const floor = new Mesh(floorGeometry, floorMaterial)
  floor.rotation.x = -Math.PI / 2
  floor.position.y = -0.004
  floor.userData.excludeFromExport = true
  scene.add(floor)

  const aspect = Number.isFinite(options.aspect) && (options.aspect ?? 0) > 0 ? options.aspect! : 1
  const camera = new PerspectiveCamera(32, aspect, 0.12, 100)
  if (options.mode === 'side') camera.position.set(-9.4, 3.1, 0.1)
  else if (options.mode === 'rear') camera.position.set(6.2, 4.0, -9.2)
  else if (options.mode === 'low') camera.position.set(-5.2, 1.0, 8.6)
  else camera.position.set(-5.0, 3.95, 9.6)
  camera.lookAt(0, options.mode === 'low' ? 1.8 : 2.42, 0.1)
  scene.add(camera)

  return {
    scene,
    root: model.root,
    camera,
    update: model.update,
    dispose: () => {
      floorGeometry.dispose()
      floorMaterial.dispose()
      model.dispose()
    },
  }
}

export const createPreview = (options: { aspect?: number } = {}) => preview({ ...options, mode: 'beauty' })
export const createSidePreview = (options: { aspect?: number } = {}) => preview({ ...options, mode: 'side' })
export const createRearPreview = (options: { aspect?: number } = {}) => preview({ ...options, mode: 'rear' })
export const createLowPreview = (options: { aspect?: number } = {}) => preview({ ...options, mode: 'low' })
