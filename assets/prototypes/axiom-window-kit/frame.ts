import { Group, type MeshPhysicalMaterial } from 'three/webgpu'

import { cylinder, extrudeProfile, prism } from '../../../src/asset-forge/generator/index.ts'
import {
  AXIS_Y,
  boltRun,
  box,
  slot,
  statusLens,
  type CargoMaterials,
} from '../axiom-cargo-kit/index.ts'
import { APERTURE_HALF, PLATE_FRONT, WINDOW_KIT } from './contract.ts'

/**
 * The shared window bay: shell plate, graphite reveal ring, glazing seat, and
 * the jamb hardware every module in the group hangs off.
 *
 * Same construction as the doors group, turned landscape: nested octagonal cuts
 * rather than four mitred members, because the reference sheets' aperture has
 * clipped corners at two radii and four members cannot produce them.
 *
 * Every lit part stands proud of the plate. Housed inside the plate's own
 * thickness an emissive strip is buried in solid shell and renders as a black
 * slot — emissive material here is a visible surface, not a light source.
 */

const HOUSING_Z = PLATE_FRONT + 0.012
const LAMP_Z = PLATE_FRONT + 0.03

export interface BayOptions {
  /** Horizontal centre, for multi-bay modules. */
  readonly centreX?: number
  /** Aperture half-extents, where a module narrows or deepens the opening. */
  readonly half?: readonly [number, number]
  /** Overall plate width, for the outer bays of a tiled module. */
  readonly width?: number
  readonly height?: number
  /** Omit the outer plate on interior bays of a tiled run. */
  readonly plate?: boolean
  /**
   * Omit the stepped picture-frame border.
   *
   * A tiled run draws one border around the whole run instead. Per-bay borders
   * make three bays read as three windows bolted edge to edge — the border is
   * what says "this is one fabrication", so a run that repeats it is saying the
   * opposite of what it means.
   */
  readonly border?: boolean
}

/** The stepped outer border, drawn once per fabrication rather than per bay. */
export function plateBorder(parent: Group, m: CargoMaterials, options: BayOptions = {}): void {
  const cx = options.centreX ?? 0
  const width = options.width ?? WINDOW_KIT.width
  const height = options.height ?? WINDOW_KIT.height
  parent.add(extrudeProfile(m.shellLight, slot(width * 0.5, height * 0.5, WINDOW_KIT.outerClip), 0.028, [
    cx, WINDOW_KIT.centreY, PLATE_FRONT + 0.013,
  ], {
    fillet: 0.01,
    bevel: 0.013,
    holes: [slot(width * 0.5 - 0.1, height * 0.5 - 0.1, WINDOW_KIT.outerClip - 0.04)],
  }))
}

/** Plate and reveal for one bay. */
export function bayPlate(parent: Group, m: CargoMaterials, options: BayOptions = {}): void {
  const cx = options.centreX ?? 0
  const [hx, hy] = options.half ?? APERTURE_HALF
  const width = options.width ?? WINDOW_KIT.width
  const height = options.height ?? WINDOW_KIT.height

  if (options.plate ?? true) {
    parent.add(prism(m.shell, [width, height, WINDOW_KIT.platePitch], [cx, WINDOW_KIT.centreY, 0], {
      chamfer: WINDOW_KIT.outerClip,
      fillet: 0.016,
      bevel: 0.014,
      capChamfer: [0.04, 0.024],
      holes: [slot(hx + 0.05, hy + 0.05, WINDOW_KIT.clip + 0.015)],
    }))
    if (options.border ?? true) plateBorder(parent, m, options)
  }

  // Reveal ring: a chunky dark octagon standing proud and running back through
  // the plate. The group's strongest value break, with real walls rather than a
  // dark quad, so it catches the key on one flank and goes black on the other.
  parent.add(extrudeProfile(m.graphite, slot(hx + 0.052, hy + 0.052, WINDOW_KIT.clip + 0.015), 0.15, [
    cx, WINDOW_KIT.centreY, PLATE_FRONT - 0.058,
  ], {
    fillet: 0.009,
    bevel: 0.012,
    holes: [slot(hx, hy, WINDOW_KIT.clip)],
  }))
  // Inner liner, the seat the glazing beds into.
  parent.add(extrudeProfile(m.ink, slot(hx + 0.022, hy + 0.022, WINDOW_KIT.clip - 0.01), 0.09, [
    cx, WINDOW_KIT.centreY, PLATE_FRONT - 0.17,
  ], {
    fillet: 0.006,
    bevel: 0.007,
    holes: [slot(hx - 0.012, hy - 0.012, WINDOW_KIT.clip - 0.02)],
  }))
}

/**
 * The aperture's edge lighting: a lit line inset just inside the reveal on the
 * head and cill. It is what makes a glazed hole read as a fitted window rather
 * than as a hole, and it is the group's dominant signal surface.
 */
export function apertureLamps(
  parent: Group,
  m: CargoMaterials,
  signal: MeshPhysicalMaterial,
  options: BayOptions = {},
): void {
  const cx = options.centreX ?? 0
  const [hx, hy] = options.half ?? APERTURE_HALF
  for (const sy of [-1, 1]) {
    const y = WINDOW_KIT.centreY + sy * (hy - 0.028)
    box(parent, m.ink, [hx * 1.5, 0.05, 0.04], [cx, y, PLATE_FRONT - 0.055], {
      chamfer: 0.014, fillet: 0.006, bevel: 0.005,
    })
    box(parent, signal, [hx * 1.42, 0.026, 0.028], [cx, y, PLATE_FRONT - 0.038], {
      chamfer: 0.009, fillet: 0.004, bevel: 0.003,
    })
  }
}

/** Cyan status strips on the head and cill of the outer plate. */
export function plateStrips(parent: Group, m: CargoMaterials, options: BayOptions = {}): void {
  const cx = options.centreX ?? 0
  const height = options.height ?? WINDOW_KIT.height
  for (const sy of [-1, 1]) {
    const y = WINDOW_KIT.centreY + sy * (height * 0.5 - 0.075)
    box(parent, m.ink, [0.34, 0.05, 0.045], [cx, y, HOUSING_Z], {
      chamfer: 0.016, fillet: 0.006, bevel: 0.005,
    })
    box(parent, m.cyan, [0.28, 0.026, 0.03], [cx, y, LAMP_Z], {
      chamfer: 0.009, fillet: 0.004, bevel: 0.003,
    })
  }
}

/**
 * The jamb control paddle: a raised bezel carrying one large paddle switch and
 * a small state read. Sits on the jamb opposite the actuator.
 */
export function controlPaddle(
  parent: Group,
  m: CargoMaterials,
  signal: MeshPhysicalMaterial,
  options: BayOptions = {},
): void {
  const width = options.width ?? WINDOW_KIT.width
  const x = (options.centreX ?? 0) + width * 0.5 - 0.135
  box(parent, m.graphite, [0.13, 0.36, 0.05], [x, WINDOW_KIT.centreY, HOUSING_Z + 0.008], {
    chamfer: 0.04, fillet: 0.011, bevel: 0.009, capChamfer: 0.018,
  })
  statusLens(parent, m, [0.07, 0.155], [x, WINDOW_KIT.centreY - 0.02, LAMP_Z + 0.008], signal, 'front')
  statusLens(parent, m, [0.055, 0.022], [x, WINDOW_KIT.centreY + 0.13, LAMP_Z + 0.008], m.cyan, 'front')
  box(parent, m.steel, [0.055, 0.022, 0.018], [x, WINDOW_KIT.centreY - 0.135, LAMP_Z + 0.01], {
    chamfer: 0.006, fillet: 0.003, bevel: 0.003,
  })
}

/**
 * Shutter actuator: a ram on the aperture's left jamb.
 *
 * It is the physical reason the group's shutter and blast variants can close.
 * On the modules that never close it is still present, because the bay is one
 * fabrication and a window that omits the ram is a different casting.
 */
export function actuatorRam(parent: Group, m: CargoMaterials, options: BayOptions = {}): void {
  const cx = options.centreX ?? 0
  const [hx, hy] = options.half ?? APERTURE_HALF
  // Inside the aperture, not on the jamb behind it. Set one ram-radius outboard
  // of the clear opening the ram sits *inside* the reveal ring's own material
  // and is invisible from every angle the bay is ever seen from.
  const x = cx - hx + 0.055
  const z = PLATE_FRONT - 0.105
  parent.add(cylinder(m.steel, 0.024, hy * 1.55, [x, WINDOW_KIT.centreY, z], AXIS_Y, 12))
  for (const sy of [-1, 1]) {
    parent.add(cylinder(m.graphiteEdge, 0.046, 0.12, [x, WINDOW_KIT.centreY + sy * hy * 0.62, z], AXIS_Y, 12))
    box(parent, m.graphite, [0.1, 0.12, 0.06], [x - 0.045, WINDOW_KIT.centreY + sy * hy * 0.62, z - 0.03], {
      chamfer: 0.02, fillet: 0.008, bevel: 0.007,
    })
  }
  parent.add(cylinder(m.ironOxide, 0.034, 0.2, [x, WINDOW_KIT.centreY, z], AXIS_Y, 12))
}

/**
 * Cill: a drip board that throws water clear of the plate below, plus the
 * ribbed board itself. This is where the module stops being symmetric.
 */
export function cill(parent: Group, m: CargoMaterials, options: BayOptions = {}): void {
  const cx = options.centreX ?? 0
  const width = options.width ?? WINDOW_KIT.width
  const y = WINDOW_KIT.centreY - (options.half ?? APERTURE_HALF)[1] - 0.075
  // Reaches 50 mm past the plate, not 90. A cill drawn as far forward as the
  // whole module is deep stops reading as part of the bay and starts reading as
  // a rail bolted across it.
  const reach = WINDOW_KIT.depth + 0.05
  box(parent, m.graphiteEdge, [width - 0.3, 0.05, reach], [cx, y, 0.022], {
    chamfer: 0.014, fillet: 0.006, bevel: 0.005, capChamfer: [0.026, 0.012],
  })
  for (let index = 0; index < 6; index += 1) {
    box(parent, m.ink, [0.02, 0.009, reach - 0.05], [
      cx + (index - 2.5) * (width - 0.48) / 5, y + 0.029, 0.022,
    ], { chamfer: 0.004, fillet: 0.002, bevel: 0.002 })
  }
  box(parent, m.amberPaint, [width - 0.38, 0.009, 0.024], [cx, y + 0.029, reach * 0.5 - 0.02], {
    chamfer: 0.004, fillet: 0.002, bevel: 0.002,
  })
}

/** Corner fixings on the diagonal returns the outer clip creates. */
export function plateFixings(parent: Group, m: CargoMaterials, options: BayOptions = {}): void {
  const cx = options.centreX ?? 0
  const width = options.width ?? WINDOW_KIT.width
  const height = options.height ?? WINDOW_KIT.height
  for (const sx of [-1, 1]) {
    for (const sy of [-1, 1]) {
      boltRun(
        parent,
        m.steel,
        [cx + sx * (width * 0.5 - 0.052), WINDOW_KIT.centreY + sy * (height * 0.5 - 0.19), PLATE_FRONT + 0.028],
        [cx + sx * (width * 0.5 - 0.052), WINDOW_KIT.centreY + sy * (height * 0.5 - 0.42), PLATE_FRONT + 0.028],
        2,
        0.013,
        'front',
      )
    }
  }
}

/** Everything a standard single-bay window shares. */
export function buildBay(
  parent: Group,
  m: CargoMaterials,
  signal: MeshPhysicalMaterial,
  options: BayOptions = {},
): void {
  bayPlate(parent, m, options)
  plateFixings(parent, m, options)
  cill(parent, m, options)
  apertureLamps(parent, m, signal, options)
  plateStrips(parent, m, options)
  controlPaddle(parent, m, signal, options)
  actuatorRam(parent, m, options)
}
