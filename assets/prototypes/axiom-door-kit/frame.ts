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
import { CLEAR_HALF, DOOR_KIT } from './contract.ts'

/**
 * The shared portal: shell plate, graphite reveal ring, threshold, and the jamb
 * hardware every door in the family hangs off.
 *
 * Built as nested octagonal rings rather than four mitred members. Four members
 * give a rectangular hole, and the whole family's reference language is an
 * octagonal opening with clipped corners inside an outer plate carrying the
 * *same* cut at a larger radius. One prism with a centred octagonal hole says
 * that in a single part; four members plus corner blocks say it in eleven, and
 * the eleven never quite meet.
 */

export interface PortalOptions {
  /** Signal colour for the jamb strips and head lamp. */
  readonly signal?: MeshPhysicalMaterial
  /** Omit the hinge stack for sliding, rolling, and hatch modules. */
  readonly hinges?: boolean
  /** Omit the threshold where the module is not floor-mounted. */
  readonly threshold?: boolean
}

/** Frame plate front face; leaves are recessed behind this. */
export const PLATE_FRONT = DOOR_KIT.platePitch * 0.5

/**
 * Hinge knuckle centre. Outside the clear opening so a swinging leaf clears its
 * own jamb, and far enough forward that the barrel is not buried in the reveal.
 */
export const HINGE_X = -(CLEAR_HALF[0] - 0.105)
export const HINGE_Z = PLATE_FRONT - 0.155

/**
 * Every lit part in this family is mounted the same way: a dark housing standing
 * proud of the shell plate, and the lamp standing proud of *that*.
 *
 * The first pass placed both inside the plate's own thickness. Geometrically the
 * lamp was still in front of its housing, but both were buried in solid shell,
 * so a jamb strip rendered as a black slot and the head lamp as a dark blob —
 * the model had no lit surface anywhere except the one panel that happened to be
 * proud. Emissive material is not a light source here; it has to be visible.
 */
const HOUSING_Z = PLATE_FRONT + 0.014
const LAMP_Z = PLATE_FRONT + 0.036

export function portalPlate(parent: Group, m: CargoMaterials): void {
  // Outer shell plate with the family's two nested octagonal cuts.
  parent.add(prism(m.shell, [DOOR_KIT.width, DOOR_KIT.height, DOOR_KIT.platePitch], [0, DOOR_KIT.centreY, 0], {
    chamfer: DOOR_KIT.outerClip,
    fillet: 0.02,
    bevel: 0.018,
    capChamfer: [0.05, 0.03],
    holes: [slot(CLEAR_HALF[0] + 0.055, CLEAR_HALF[1] + 0.055, DOOR_KIT.clip + 0.02)],
  }))

  // Raised outer border. The reference plates all carry a stepped picture-frame
  // edge; without it the plate is one flat value across 1.6 m and the module
  // reads as a printed panel rather than a fabrication.
  parent.add(extrudeProfile(m.shellLight, slot(DOOR_KIT.width * 0.5, DOOR_KIT.height * 0.5, DOOR_KIT.outerClip), 0.035, [
    0, DOOR_KIT.centreY, PLATE_FRONT + 0.016,
  ], {
    fillet: 0.012,
    bevel: 0.016,
    holes: [slot(DOOR_KIT.width * 0.5 - 0.13, DOOR_KIT.height * 0.5 - 0.13, DOOR_KIT.outerClip - 0.05)],
  }))

  // The reveal ring: a chunky dark octagon standing proud of the plate and
  // running back through it. This is the family's strongest value break, and it
  // is a ring with real walls rather than a dark quad, so it catches the key on
  // one flank and goes black on the other.
  parent.add(extrudeProfile(m.graphite, slot(CLEAR_HALF[0] + 0.058, CLEAR_HALF[1] + 0.058, DOOR_KIT.clip + 0.02), 0.2, [
    0, DOOR_KIT.centreY, PLATE_FRONT - 0.078,
  ], {
    fillet: 0.01,
    bevel: 0.014,
    holes: [slot(CLEAR_HALF[0], CLEAR_HALF[1], DOOR_KIT.clip)],
  }))

  // Deep liner behind the ring, so the opening bottoms out in black instead of
  // showing whatever is behind the module.
  parent.add(extrudeProfile(m.ink, slot(CLEAR_HALF[0] + 0.03, CLEAR_HALF[1] + 0.03, DOOR_KIT.clip), 0.12, [
    0, DOOR_KIT.centreY, PLATE_FRONT - 0.238,
  ], {
    fillet: 0.008,
    bevel: 0.008,
    holes: [slot(CLEAR_HALF[0] - 0.012, CLEAR_HALF[1] - 0.012, DOOR_KIT.clip - 0.01)],
  }))

  // Panel breaks across head and sill, stopping short of the outer clip.
  for (const sy of [-1, 1]) {
    box(parent, m.shellShade, [DOOR_KIT.width - DOOR_KIT.outerClip * 2.4, 0.03, 0.014], [
      0,
      DOOR_KIT.centreY + sy * (DOOR_KIT.height * 0.5 - 0.075),
      PLATE_FRONT + 0.03,
    ], { chamfer: 0.01, fillet: 0.004, bevel: 0.004 })
  }

  // Corner fixings on the diagonal returns the outer clip creates.
  for (const sx of [-1, 1]) {
    for (const sy of [-1, 1]) {
      boltRun(
        parent,
        m.steel,
        [sx * (DOOR_KIT.width * 0.5 - 0.062), DOOR_KIT.centreY + sy * (DOOR_KIT.height * 0.5 - 0.3), PLATE_FRONT + 0.032],
        [sx * (DOOR_KIT.width * 0.5 - 0.062), DOOR_KIT.centreY + sy * (DOOR_KIT.height * 0.5 - 0.62), PLATE_FRONT + 0.032],
        3,
        0.014,
        'front',
      )
    }
  }
}

/** Recessed jamb light strips. The family's only large emissive area. */
export function jambStrips(parent: Group, m: CargoMaterials, signal: MeshPhysicalMaterial): void {
  for (const sx of [-1, 1]) {
    const x = sx * (DOOR_KIT.width * 0.5 - 0.066)
    box(parent, m.ink, [0.062, 0.92, 0.05], [x, DOOR_KIT.centreY - 0.24, HOUSING_Z], {
      chamfer: 0.022, fillet: 0.008, bevel: 0.006,
    })
    box(parent, signal, [0.03, 0.85, 0.032], [x, DOOR_KIT.centreY - 0.24, LAMP_Z], {
      chamfer: 0.011, fillet: 0.004, bevel: 0.004,
    })
  }
}

/**
 * Threshold plate and the shallow ramp that carries it down to the deck.
 *
 * The ramp length is solved from the drop it has to bridge rather than chosen,
 * so a changed threshold height cannot leave it hanging in air.
 */
export function threshold(parent: Group, m: CargoMaterials): void {
  const rise = 0.07
  const span = DOOR_KIT.width - 0.12
  const reach = DOOR_KIT.depth + 0.06

  // One ribbed plate with a chamfered leading edge, rather than a plate plus a
  // separate raked ramp. The first pass built the ramp as its own oxidised
  // wedge: at 1.38 m wide and rust-coloured it read as a loose board dropped in
  // front of the module, and it was the brightest warm mass in a frame whose
  // only warm accent is meant to be the signal.
  box(parent, m.graphiteEdge, [span, rise, reach], [0, rise * 0.5, 0.01], {
    chamfer: 0.018,
    fillet: 0.008,
    bevel: 0.007,
    capChamfer: [rise * 0.75, 0.02],
  })
  // Tread ribs across the walking surface. Repetition rather than texture, so
  // they collect the same cavity occlusion as everything else in the bake.
  for (let index = 0; index < 9; index += 1) {
    const t = (index - 4) / 8
    box(parent, m.ink, [0.026, 0.012, reach - 0.05], [t * (span - 0.18), rise + 0.003, 0.01], {
      chamfer: 0.005, fillet: 0.002, bevel: 0.002,
    })
  }
  // The sill's own warning line, inlaid at the opening's front edge.
  box(parent, m.amberPaint, [span - 0.08, 0.012, 0.03], [0, rise + 0.003, reach * 0.5 - 0.05], {
    chamfer: 0.005, fillet: 0.002, bevel: 0.002,
  })
}

/**
 * Hinge stack: two knuckle groups on a common pin, standing in the opening on
 * the leaf's left side.
 *
 * It stands *in* the opening rather than flat on the jamb wall. Set against the
 * wall it disappeared entirely at the family's capture angle — the near jamb
 * occludes its own inner face — and a swing door whose hinges are never visible
 * has no reason to open in the direction it opens.
 */
export function hingeStack(parent: Group, m: CargoMaterials): void {
  const heights = [DOOR_KIT.centreY - 0.66, DOOR_KIT.centreY + 0.66]
  parent.add(cylinder(m.steel, 0.026, 1.72, [HINGE_X, DOOR_KIT.centreY, HINGE_Z], AXIS_Y, 12))
  for (const y of heights) {
    for (const offset of [-0.1, 0, 0.1]) {
      parent.add(cylinder(m.graphiteEdge, 0.058, 0.085, [HINGE_X, y + offset, HINGE_Z], AXIS_Y, 12))
    }
    // Strap back to the jamb, so the pin is carried by something.
    box(parent, m.graphite, [0.14, 0.26, 0.07], [HINGE_X - 0.075, y, HINGE_Z - 0.03], {
      chamfer: 0.024, fillet: 0.009, bevel: 0.008,
    })
    boltRun(parent, m.steel, [HINGE_X - 0.12, y - 0.08, HINGE_Z + 0.038], [HINGE_X - 0.12, y + 0.08, HINGE_Z + 0.038], 2, 0.013, 'front')
  }
}

/**
 * Head lamp bar: a short lit segment inside a housing above the opening. The
 * family's state read at far distance, where a jamb strip is a single pixel.
 */
export function headLamp(parent: Group, m: CargoMaterials, signal: MeshPhysicalMaterial): void {
  const y = DOOR_KIT.centreY + CLEAR_HALF[1] + 0.155
  box(parent, m.graphite, [0.44, 0.075, 0.05], [0, y, HOUSING_Z], {
    chamfer: 0.022, fillet: 0.008, bevel: 0.006,
  })
  for (let index = 0; index < 4; index += 1) {
    statusLens(parent, m, [0.048, 0.03], [(index - 1.5) * 0.082, y, LAMP_Z], signal, 'front')
  }
}

/**
 * The wall-side control plate: a raised bezel carrying one large state lens and
 * two smaller reads. Sits on the jamb opposite the hinges.
 */
export function controlPlate(
  parent: Group,
  m: CargoMaterials,
  signal: MeshPhysicalMaterial,
  height = DOOR_KIT.centreY + 0.18,
): void {
  const x = DOOR_KIT.width * 0.5 - 0.185
  box(parent, m.graphite, [0.15, 0.4, 0.055], [x, height, HOUSING_Z + 0.008], {
    chamfer: 0.045, fillet: 0.012, bevel: 0.01, capChamfer: 0.02,
  })
  statusLens(parent, m, [0.075, 0.075], [x, height + 0.085, LAMP_Z + 0.008], signal, 'front')
  statusLens(parent, m, [0.065, 0.024], [x, height - 0.045, LAMP_Z + 0.008], m.cyan, 'front')
  box(parent, m.steel, [0.062, 0.026, 0.02], [x, height - 0.12, LAMP_Z + 0.012], {
    chamfer: 0.007, fillet: 0.003, bevel: 0.003,
  })
}

/** Skirt blocks under each jamb, with a painted direction mark. */
export function jambFeet(parent: Group, m: CargoMaterials): void {
  for (const sx of [-1, 1]) {
    const x = sx * (DOOR_KIT.width * 0.5 - 0.135)
    box(parent, m.graphite, [0.27, 0.26, DOOR_KIT.depth + 0.02], [x, 0.13, 0], {
      chamfer: 0.036, fillet: 0.012, bevel: 0.01,
    })
    parent.add(extrudeProfile(m.amberPaint, [[-0.042, 0.036], [0.042, 0.036], [0, -0.042]], 0.012, [
      x, 0.15, PLATE_FRONT + 0.05,
    ], { fillet: 0.004, bevel: 0.004 }))
    boltRun(parent, m.steel, [x - 0.085, 0.04, PLATE_FRONT + 0.05], [x + 0.085, 0.04, PLATE_FRONT + 0.05], 2, 0.013, 'front')
  }
}

/**
 * Rear bracing so the module still reads as built from behind.
 *
 * Kept off the opening's sightline. A cross-brace on the module's centreline is
 * correct engineering and a visible bar straight across an empty doorway, which
 * is the one thing a door frame must never have.
 */
export function rearBracing(parent: Group, m: CargoMaterials): void {
  const back = -DOOR_KIT.depth * 0.5 + 0.035
  for (const sx of [-1, 1]) {
    box(parent, m.graphiteEdge, [0.085, DOOR_KIT.height - 0.42, 0.07], [
      sx * (DOOR_KIT.width * 0.5 - 0.08), DOOR_KIT.centreY, back,
    ], { chamfer: 0.02, fillet: 0.008, bevel: 0.006 })
  }
  for (const sy of [-1, 1]) {
    box(parent, m.graphiteEdge, [DOOR_KIT.width - 0.2, 0.075, 0.07], [
      0, DOOR_KIT.centreY + sy * (DOOR_KIT.height * 0.5 - 0.12), back,
    ], { chamfer: 0.02, fillet: 0.008, bevel: 0.006 })
  }
}

/** Everything a portal shares, in the order the brief's construction plan lists. */
export function buildPortal(parent: Group, m: CargoMaterials, options: PortalOptions = {}): void {
  const signal = options.signal ?? m.amber
  portalPlate(parent, m)
  if (options.threshold ?? true) threshold(parent, m)
  jambFeet(parent, m)
  rearBracing(parent, m)
  jambStrips(parent, m, signal)
  headLamp(parent, m, signal)
  controlPlate(parent, m, signal)
  if (options.hinges ?? true) hingeStack(parent, m)
}
