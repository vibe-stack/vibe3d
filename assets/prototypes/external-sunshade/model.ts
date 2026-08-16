import { cylinder } from '../../../src/asset-forge/generator/index.ts'
import { AXIS_X, box, boltRun, type CargoPreview } from '../axiom-cargo-kit/index.ts'
import {
  APERTURE_HALF,
  PLATE_FRONT,
  WINDOW_KIT,
  buildBay,
  createWindowModel,
  createWindowPreview,
  glazing,
  signalLamp,
  type WindowModel,
  type WindowPreviewOptions,
} from '../axiom-window-kit/index.ts'

const BLADES = 6
/** Projection of the shade, and the reach of the arms that carry it. */
const PROJECTION = 0.46

/**
 * Axiom Relay external sunshade — the brise-soleil over a standard bay.
 *
 * A sunshade is the one module in the group that is mostly *outside* the wall,
 * and that is the whole design: aerofoil blades on two arms, projecting far
 * enough to cut a high sun and angled steeply enough to pass a low one. It is
 * fitted to the standard bay rather than replacing it, so the same window can be
 * shaded on a south elevation and bare on a north one without becoming two
 * different props.
 *
 * The blades rotate as one on a common tie bar. A shade whose blades are fixed
 * is a canopy; the thing that makes it a brise-soleil is that it tracks.
 */

export function createModel(): WindowModel {
  return createWindowModel({
    id: 'external-sunshade',
    condition: 0.56,
    envelope: { width: WINDOW_KIT.width, depth: WINDOW_KIT.depth + PROJECTION, height: WINDOW_KIT.height },
    build: ({ m, bundle, part }) => {
      const frame = part('frame')
      const blades = part('blades')
      const amber = signalLamp(bundle, 'AMBER-400', 3_400)

      buildBay(frame, m, amber)
      glazing(frame, m)

      // Support arms: two cantilevers off the head, each with a diagonal tie
      // back into the plate, because a 460 mm cantilever carrying six blades
      // does not hold itself up.
      const armY = WINDOW_KIT.centreY + APERTURE_HALF[1] + 0.12
      const armX = WINDOW_KIT.width * 0.5 - 0.26
      for (const sx of [-1, 1]) {
        box(frame, m.graphite, [0.055, 0.075, PROJECTION], [sx * armX, armY, PLATE_FRONT + PROJECTION * 0.5], {
          chamfer: 0.018, fillet: 0.007, bevel: 0.006,
        })
        box(frame, m.steel, [0.03, 0.24, 0.03], [sx * armX, armY - 0.11, PLATE_FRONT + 0.16], {
          chamfer: 0.009, fillet: 0.004, bevel: 0.003, rotation: [-0.86, 0, 0],
        })
        box(frame, m.graphiteEdge, [0.11, 0.12, 0.07], [sx * armX, armY, PLATE_FRONT + 0.03], {
          chamfer: 0.024, fillet: 0.009, bevel: 0.008,
        })
        boltRun(frame, m.steel, [sx * armX, armY - 0.04, PLATE_FRONT + 0.07], [sx * armX, armY + 0.04, PLATE_FRONT + 0.07], 2, 0.012, 'front')
      }

      // The blades, on a common tie bar. Each is a shallow aerofoil: a wide
      // plate with a rolled leading edge and a thinner trailing lip.
      const span = armX * 2 + 0.16
      for (let index = 0; index < BLADES; index += 1) {
        const z = PLATE_FRONT + 0.08 + (index / (BLADES - 1)) * (PROJECTION - 0.14)
        const blade = box(blades, m.shellLight, [span, 0.105, 0.028], [0, armY - 0.02, z], {
          chamfer: 0.014, fillet: 0.006, bevel: 0.007,
        })
        blade.rotation.x = -0.62
        blades.add(cylinder(m.steel, 0.014, span, [0, armY - 0.02 + 0.048, z - 0.026], AXIS_X, 8))
      }
      // Tie bar linking the blades' trailing edges, and its actuator crank.
      box(blades, m.graphiteEdge, [0.03, 0.03, PROJECTION - 0.1], [armX + 0.05, armY - 0.09, PLATE_FRONT + PROJECTION * 0.5], {
        chamfer: 0.008, fillet: 0.003, bevel: 0.003,
      })

      return {
        assemblies: [blades],
        cycleSeconds: 2.8,
        apply: (blend) => {
          // `open` rotates the blades flat, letting the light through; closed
          // is the steep shading angle they rest at.
          blades.rotation.x = blend * 0.62
        },
        sockets: {
          mount_shade_left: [-armX, armY, PLATE_FRONT + PROJECTION],
          mount_shade_right: [armX, armY, PLATE_FRONT + PROJECTION],
          fx_shade_pivot: [0, armY - 0.02, PLATE_FRONT + PROJECTION * 0.5],
        },
        tick: (elapsed) => {
          amber.emissiveIntensity = 0.64 + Math.sin(elapsed * 1.1) * 0.08
        },
      }
    },
  })
}

export function createPreview(options: WindowPreviewOptions = {}): CargoPreview {
  return createWindowPreview(createModel(), { distance: 3.7, pitch: 0.3, ...options })
}

export function createOpenPreview(options: WindowPreviewOptions = {}): CargoPreview {
  return createWindowPreview(createModel(), { ...options, state: 'open' })
}
