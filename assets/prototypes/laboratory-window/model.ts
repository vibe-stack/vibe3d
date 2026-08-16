import { extrudeProfile } from '../../../src/asset-forge/generator/index.ts'
import { box, boltRun, slot, statusLens, type CargoPreview } from '../axiom-cargo-kit/index.ts'
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

/**
 * Axiom Relay laboratory window — the sealed, cleanable port.
 *
 * A laboratory window's requirement is not strength, it is that nothing can
 * collect in it: no ledge, no open fastener head, no gap a swab cannot reach.
 * So this is the one module in the group whose reveal is *coved* rather than
 * stepped, whose fixings are capped, and whose cill is flush with the plate
 * instead of throwing water clear — there is no weather on the inside of a
 * containment wall, and a drip board is somewhere for contamination to sit.
 *
 * The pass-through drawer beside the aperture is the module's real function:
 * samples cross the boundary, people do not.
 */

export function createModel(): WindowModel {
  return createWindowModel({
    id: 'laboratory-window',
    condition: 0.14,
    build: ({ m, bundle, part }) => {
      const frame = part('frame')
      const drawer = part('drawer')
      drawer.name = drawer.name.replace(/_DEFAULT$/, '_CLOSED')
      const cyan = signalLamp(bundle, 'CYAN-400', 3_070)

      buildBay(frame, m, cyan)
      glazing(frame, m, { thickness: 0.026 })

      // Coved seal ring: a soft rubber return between glass and reveal, so
      // there is no square internal corner anywhere in the aperture.
      const [hx, hy] = APERTURE_HALF
      frame.add(extrudeProfile(m.rubber, slot(hx + 0.014, hy + 0.014, WINDOW_KIT.clip - 0.008), 0.038, [
        0, WINDOW_KIT.centreY, PLATE_FRONT - 0.118,
      ], {
        fillet: 0.014,
        bevel: 0.016,
        holes: [slot(hx - 0.026, hy - 0.026, WINDOW_KIT.clip - 0.026)],
      }))

      // Capped fixings: the heads are covered rather than exposed.
      for (const sx of [-1, 1]) {
        for (const sy of [-1, 1]) {
          box(frame, m.shellLight, [0.055, 0.055, 0.022], [
            sx * (hx + 0.028), WINDOW_KIT.centreY + sy * (hy + 0.028), PLATE_FRONT + 0.03,
          ], { chamfer: 0.02, fillet: 0.008, bevel: 0.007 })
        }
      }

      // Pass-through drawer: a sealed tray in the plate below the aperture,
      // with its own interlock read. Interlocked, because a pass-through that
      // can be open on both sides at once is a hole in the containment.
      const drawerY = WINDOW_KIT.centreY - hy - 0.2
      box(frame, m.graphite, [0.42, 0.15, 0.07], [0, drawerY, PLATE_FRONT + 0.01], {
        chamfer: 0.03, fillet: 0.011, bevel: 0.009,
      })
      statusLens(frame, m, [0.04, 0.04], [0.24, drawerY, PLATE_FRONT + 0.05], cyan, 'front')
      box(drawer, m.shellLight, [0.37, 0.105, 0.12], [0, drawerY, PLATE_FRONT + 0.055], {
        chamfer: 0.024, fillet: 0.009, bevel: 0.008, capChamfer: [0.02, 0.01],
      })
      box(drawer, m.steel, [0.16, 0.03, 0.028], [0, drawerY, PLATE_FRONT + 0.125], {
        chamfer: 0.008, fillet: 0.004, bevel: 0.003,
      })
      boltRun(frame, m.steel, [-0.24, drawerY, PLATE_FRONT + 0.05], [-0.24, drawerY + 0.05, PLATE_FRONT + 0.05], 2, 0.011, 'front')

      return {
        assemblies: [drawer],
        cycleSeconds: 1.1,
        apply: (blend) => {
          drawer.position.z = blend * 0.22
        },
        sockets: {
          cover_pass_through: [0, drawerY, PLATE_FRONT + 0.055],
          fx_seal_ring: [0, WINDOW_KIT.centreY, PLATE_FRONT - 0.118],
        },
        tick: (elapsed) => {
          cyan.emissiveIntensity = 0.66 + Math.sin(elapsed * 0.9) * 0.06
        },
      }
    },
  })
}

export function createPreview(options: WindowPreviewOptions = {}): CargoPreview {
  return createWindowPreview(createModel(), options)
}

export function createOpenPreview(options: WindowPreviewOptions = {}): CargoPreview {
  return createWindowPreview(createModel(), { ...options, state: 'open' })
}
