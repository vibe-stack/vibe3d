import { extrudeProfile } from '../../../src/asset-forge/generator/index.ts'
import { box, type CargoPreview } from '../axiom-cargo-kit/index.ts'
import {
  APERTURE_HALF,
  PLATE_FRONT,
  WINDOW_KIT,
  buildBay,
  createWindowModel,
  createWindowPreview,
  signalLamp,
  type WindowModel,
  type WindowPreviewOptions,
} from '../axiom-window-kit/index.ts'

/**
 * Axiom Relay damaged broken window — the same bay after an impact.
 *
 * The damage has one cause and everything else follows from it: something struck
 * the pane low and left of centre. So the shards that remain are the ones the
 * frame still grips — long slivers along the head and the two jambs, nothing at
 * the point of impact — the surviving glass is hinged outward where the bead let
 * go, the cill below carries the fallen fragments, and the aperture lamp on that
 * side is dark because the impact took its housing with it.
 *
 * The plate itself is undamaged. A thrown object breaks glass; it does not
 * deform a 160 mm alloy plate, and modelling both is how a damage variant stops
 * being legible as a *specific* event and turns into general grime.
 */

export function createModel(): WindowModel {
  return createWindowModel({
    id: 'damaged-broken-window',
    condition: 0.96,
    build: ({ m, bundle, part }) => {
      const frame = part('frame')
      const red = signalLamp(bundle, 'RED-500', 3_290)

      buildBay(frame, m, red)

      const [hx, hy] = APERTURE_HALF
      const z = PLATE_FRONT - 0.135

      // Surviving glass: slivers still held by the bead. Each is a wedge whose
      // wide end is at the frame and whose point aims at the impact, which is
      // how glass actually fails — radially, away from the strike.
      const impact: readonly [number, number] = [-hx * 0.42, WINDOW_KIT.centreY - hy * 0.44]
      const shards: readonly (readonly [number, number][])[] = [
        [[-hx, hy], [hx * 0.1, hy], [-hx * 0.2, hy * 0.42], [-hx, hy * 0.5]],
        [[hx * 0.22, hy], [hx, hy], [hx, hy * 0.1], [hx * 0.34, hy * 0.46]],
        [[hx, -hy * 0.06], [hx, -hy], [hx * 0.3, -hy], [hx * 0.42, -hy * 0.3]],
        [[-hx, hy * 0.34], [-hx * 0.34, hy * 0.2], [-hx * 0.5, -hy * 0.08], [-hx, -hy * 0.1]],
      ]
      for (const shard of shards) {
        frame.add(extrudeProfile(m.glass, shard.map(([x, y]) => [x, y] as [number, number]), 0.014, [
          0, WINDOW_KIT.centreY, z,
        ], { fillet: 0.003, bevel: 0.004 }))
      }

      // Failed bead along the bottom-left, peeled back from the opening.
      box(frame, m.shellShade, [hx * 0.7, 0.03, 0.03], [-hx * 0.4, WINDOW_KIT.centreY - hy + 0.03, z + 0.05], {
        chamfer: 0.008, fillet: 0.003, bevel: 0.003, rotation: [0, 0, -0.22],
      })

      // Fallen fragments caught on the cill.
      const cillY = WINDOW_KIT.centreY - hy - 0.048
      for (let index = 0; index < 7; index += 1) {
        const t = (index / 6 - 0.5) * 1.6
        box(frame, m.glass, [0.03 + (index % 3) * 0.018, 0.012, 0.028], [
          -hx * 0.35 + t * 0.28, cillY, 0.05 + (index % 2) * 0.05,
        ], { chamfer: 0.004, fillet: 0.002, bevel: 0.002, rotation: [0, index * 0.7, 0] })
      }

      // The dead lamp: fixture present, circuit gone. Its housing is crushed on
      // the impact side, which is what took the circuit out.
      box(frame, m.ink, [hx * 0.7, 0.048, 0.038], [-hx * 0.42, WINDOW_KIT.centreY - hy + 0.028, PLATE_FRONT - 0.05], {
        chamfer: 0.012, fillet: 0.005, bevel: 0.004, rotation: [0, 0, 0.09],
      })
      box(frame, m.amberDim, [hx * 0.5, 0.022, 0.024], [-hx * 0.42, WINDOW_KIT.centreY - hy + 0.028, PLATE_FRONT - 0.036], {
        chamfer: 0.007, fillet: 0.003, bevel: 0.003, rotation: [0, 0, 0.09],
      })

      // Impact scatter on the plate: a short scar, only around the strike.
      for (const [dx, dy, angle] of [[0.09, 0.05, 0.6], [-0.07, -0.04, -0.5], [0.03, -0.1, 1.1]] as const) {
        box(frame, m.shellShade, [0.11, 0.02, 0.014], [impact[0] + dx, impact[1] + dy, PLATE_FRONT + 0.02], {
          chamfer: 0.005, fillet: 0.002, bevel: 0.002, rotation: [0, 0, angle],
        })
      }

      return {
        sockets: {
          fx_impact: [impact[0], impact[1], z],
          cover_glazing: [0, WINDOW_KIT.centreY, z],
        },
        tick: (elapsed) => {
          // A fault flash, not the steady breathe the healthy bays use.
          red.emissiveIntensity = 0.3 + (Math.sin(elapsed * 5.1) > 0.3 ? 0.55 : 0)
        },
      }
    },
  })
}

export function createPreview(options: WindowPreviewOptions = {}): CargoPreview {
  return createWindowPreview(createModel(), options)
}
