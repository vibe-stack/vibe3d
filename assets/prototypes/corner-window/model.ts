import { box, type CargoPreview } from '../axiom-cargo-kit/index.ts'
import {
  APERTURE_HALF,
  PLATE_FRONT,
  WINDOW_KIT,
  actuatorRam,
  apertureLamps,
  bayPlate,
  cill,
  createWindowModel,
  createWindowPreview,
  glazing,
  plateBorder,
  plateFixings,
  signalLamp,
  type WindowModel,
  type WindowPreviewOptions,
} from '../axiom-window-kit/index.ts'

const HALF = WINDOW_KIT.bayPitch * 0.5

/**
 * Axiom Relay corner window — one bay turned through the corner of a building.
 *
 * The whole design problem is the corner post. A corner window's appeal is that
 * there *isn't* one, so the glass has to meet the glass — but something still
 * has to carry the wall above, and pretending otherwise is the difference
 * between a corner window and two windows near each other.
 *
 * The answer here is the kit's honest one: a slim structural post set *behind*
 * the glass line at the mitre, carrying a bracket back into each return. The
 * corner reads as glass-to-glass from outside, and from inside it is obvious
 * what is holding the building up.
 */

export function createModel(): WindowModel {
  return createWindowModel({
    id: 'corner-window',
    condition: 0.3,
    bays: 2,
    envelope: { width: WINDOW_KIT.bayPitch, depth: WINDOW_KIT.bayPitch, height: WINDOW_KIT.height },
    build: ({ m, bundle, part }) => {
      const amber = signalLamp(bundle, 'AMBER-400', 2_960)

      // Two returns, each a standard bay, meeting at the origin. The leg groups
      // are rotated rather than the geometry re-authored, so both returns are
      // literally the same bay and cannot drift apart.
      const legs = [part('return-front'), part('return-side')]
      // Splayed symmetrically about +Z, and each return authored running *away*
      // from the corner rather than toward it.
      //
      // Both halves of that matter. Laid on the world axes the corner's bisector
      // runs diagonally, so an external-corner view has to look down the
      // bisector — and looking down the bisector puts both leg centres on one
      // view ray, where the far return hides exactly behind the near one.
      // Splaying 45 degrees each way fixes the bisector on +Z. But a return
      // whose bay is authored at +HALF then swings *forward* of the corner
      // instead of back from it, and the two ends up side by side on the same
      // plane rather than meeting at an edge. The left return is therefore
      // authored at -HALF: mirrored about the corner, not rotated onto it.
      legs[0]!.rotation.y = -Math.PI / 4
      legs[1]!.rotation.y = Math.PI / 4

      for (const [index, leg] of legs.entries()) {
        const centreX = index === 0 ? -HALF : HALF
        bayPlate(leg, m, { centreX, width: WINDOW_KIT.bayPitch, border: false })
        plateBorder(leg, m, { centreX, width: WINDOW_KIT.bayPitch })
        plateFixings(leg, m, { centreX, width: WINDOW_KIT.bayPitch })
        apertureLamps(leg, m, amber, { centreX })
        glazing(leg, m, { centreX })
        cill(leg, m, { centreX, width: WINDOW_KIT.bayPitch })
        // One actuator for the pair, on the right return: two rams on a corner
        // window would both have to drive into the same corner post.
        if (index === 1) actuatorRam(leg, m, { centreX })
      }

      // The corner post, behind the glass line, with a bracket into each return.
      const post = part('corner-post')
      box(post, m.graphite, [0.09, WINDOW_KIT.height - 0.06, 0.09], [0, WINDOW_KIT.centreY, 0], {
        chamfer: 0.024, fillet: 0.009, bevel: 0.008,
      })
      for (const [dx, dz] of [[0.13, 0], [0, 0.13]] as const) {
        box(post, m.graphiteEdge, [dx > 0 ? 0.18 : 0.06, 0.08, dz > 0 ? 0.18 : 0.06], [dx, WINDOW_KIT.centreY + 0.5, dz], {
          chamfer: 0.016, fillet: 0.006, bevel: 0.005,
        })
        box(post, m.graphiteEdge, [dx > 0 ? 0.18 : 0.06, 0.08, dz > 0 ? 0.18 : 0.06], [dx, WINDOW_KIT.centreY - 0.5, dz], {
          chamfer: 0.016, fillet: 0.006, bevel: 0.005,
        })
      }
      // Mitre cover: the slim external cap over the glass-to-glass joint.
      box(post, m.shellShade, [0.05, WINDOW_KIT.height - 0.24, 0.05], [
        PLATE_FRONT - 0.02, WINDOW_KIT.centreY, PLATE_FRONT - 0.02,
      ], { chamfer: 0.014, fillet: 0.005, bevel: 0.005, rotation: [0, Math.PI / 4, 0] })

      return {
        sockets: {
          mount_left: [0, WINDOW_KIT.centreY, WINDOW_KIT.bayPitch],
          mount_right: [WINDOW_KIT.bayPitch, WINDOW_KIT.centreY, 0],
          window_head: [0, WINDOW_KIT.centreY + APERTURE_HALF[1], 0],
          window_cill: [0, WINDOW_KIT.centreY - APERTURE_HALF[1] - 0.075, 0],
          mount_corner_post: [0, WINDOW_KIT.centreY, 0],
        },
        tick: (elapsed) => {
          amber.emissiveIntensity = 0.7 + Math.sin(elapsed * 1.2) * 0.1
        },
      }
    },
  })
}

/**
 * Framed on the *external* corner.
 *
 * The two outward faces are the +Z face of the front return and the -X face of
 * the side return, so the camera has to sit in the -X/+Z quadrant. From the
 * opposite quadrant the module reads as an inside corner and the side return
 * shows nothing but its back.
 */
export function createPreview(options: WindowPreviewOptions = {}): CargoPreview {
  return createWindowPreview(createModel(), {
    target: [0, WINDOW_KIT.centreY, -HALF * 0.5],
    distance: 6.4,
    yaw: 0,
    pitch: 0.2,
    ...options,
  })
}
