

import { cylinder, extrudeProfile } from '../../../src/asset-forge/generator/index.ts'
import {
  AXIS_X,
  box,
  boltRun,
  recessedHandle,
  slot,
  statusLens,
  type CargoPreview,
} from '../axiom-cargo-kit/index.ts'
import {
  createDoorModel,
  createDoorPreview,
  signalLamp,
  type DoorModel,
  type DoorPreviewOptions,
} from '../axiom-door-kit/index.ts'

/**
 * Axiom Relay floor hatch — the doors group turned through ninety degrees.
 *
 * A hatch is not a small door lying down. Gravity now acts along the leaf's
 * opening axis instead of across it, and every difference follows from that: the
 * lid needs a gas strut because it has to be lifted rather than pushed, the
 * handle is recessed because anything proud on a walked-on surface is a trip
 * hazard, the frame has a raised kerb so water and swarf do not run into the
 * void, and the signal is on the deck around the opening rather than on the lid
 * — a lamp on a lid faces the ceiling when the hatch is open and the floor when
 * it is shut, which is to say it is never facing anyone.
 */

const HATCH = Object.freeze({
  width: 1.2,
  depth: 1.2,
  height: 0.22,
  /** Clear opening, and the kerb that surrounds it. */
  clear: 0.92,
  kerb: 0.06,
})

const CLEAR_HALF = HATCH.clear * 0.5
const DECK_Y = 0.12

export function createModel(): DoorModel {
  return createDoorModel({
    id: 'floor-hatch',
    condition: 0.78,
    envelope: { width: HATCH.width, depth: HATCH.depth, height: HATCH.height },
    build: ({ m, bundle, part }) => {
      const frame = part('frame')
      const lid = part('lid')
      const amber = signalLamp(bundle, 'AMBER-400', 13_800)

      // Deck plate with the octagonal opening, laid flat. Same profile language
      // as the standing doors, rotated onto the XZ plane.
      frame.add(extrudeProfile(m.graphite, slot(HATCH.width * 0.5, HATCH.depth * 0.5, 0.16), DECK_Y, [
        0, DECK_Y * 0.5, 0,
      ], {
        fillet: 0.014,
        bevel: 0.016,
        holes: [slot(CLEAR_HALF, CLEAR_HALF, 0.12)],
        rotation: [Math.PI / 2, 0, 0],
      }))
      // Raised kerb around the opening.
      frame.add(extrudeProfile(m.graphiteEdge, slot(CLEAR_HALF + 0.075, CLEAR_HALF + 0.075, 0.13), HATCH.kerb, [
        0, DECK_Y + HATCH.kerb * 0.5, 0,
      ], {
        fillet: 0.008,
        bevel: 0.01,
        holes: [slot(CLEAR_HALF, CLEAR_HALF, 0.12)],
        rotation: [Math.PI / 2, 0, 0],
      }))
      // Void liner, so the opening bottoms out in black.
      frame.add(extrudeProfile(m.ink, slot(CLEAR_HALF + 0.02, CLEAR_HALF + 0.02, 0.12), 0.26, [
        0, -0.1, 0,
      ], {
        fillet: 0.006,
        bevel: 0.006,
        holes: [slot(CLEAR_HALF - 0.03, CLEAR_HALF - 0.03, 0.1)],
        rotation: [Math.PI / 2, 0, 0],
      }))

      // Deck signal: two lamps set into the plate at the approach edge, where a
      // boot arrives. This is the module's whole state read.
      for (const sx of [-1, 1]) {
        box(frame, m.ink, [0.24, 0.04, 0.07], [sx * 0.3, DECK_Y - 0.012, HATCH.depth * 0.5 - 0.075], {
          chamfer: 0.016, fillet: 0.006, bevel: 0.005,
        })
        box(frame, amber, [0.2, 0.03, 0.04], [sx * 0.3, DECK_Y + 0.004, HATCH.depth * 0.5 - 0.075], {
          chamfer: 0.01, fillet: 0.004, bevel: 0.003,
        })
      }
      boltRun(frame, m.steel, [-HATCH.width * 0.5 + 0.09, DECK_Y, -HATCH.depth * 0.5 + 0.09], [HATCH.width * 0.5 - 0.09, DECK_Y, -HATCH.depth * 0.5 + 0.09], 4, 0.016, 'top')
      boltRun(frame, m.steel, [-HATCH.width * 0.5 + 0.09, DECK_Y, HATCH.depth * 0.5 - 0.09], [HATCH.width * 0.5 - 0.09, DECK_Y, HATCH.depth * 0.5 - 0.09], 4, 0.016, 'top')

      // Hinge barrels along the far edge, and the pin they share.
      const hingeZ = -CLEAR_HALF - 0.04
      const hingeY = DECK_Y + HATCH.kerb + 0.03
      frame.add(cylinder(m.steel, 0.022, HATCH.clear * 0.7, [0, hingeY, hingeZ], AXIS_X, 10))
      for (const sx of [-1, 1]) {
        frame.add(cylinder(m.graphiteEdge, 0.048, 0.1, [sx * 0.26, hingeY, hingeZ], AXIS_X, 12))
      }

      // The lid: tread plate, a stiffening rib pair, and a flush grab recess.
      const lidY = DECK_Y + HATCH.kerb + 0.028
      lid.add(extrudeProfile(m.shell, slot(CLEAR_HALF - 0.012, CLEAR_HALF - 0.012, 0.11), 0.055, [
        0, lidY, 0,
      ], { fillet: 0.01, bevel: 0.014, capChamfer: [0.02, 0.015], rotation: [Math.PI / 2, 0, 0] }))
      for (const sz of [-1, 1]) {
        box(lid, m.graphiteEdge, [CLEAR_HALF * 1.6, 0.035, 0.07], [0, lidY - 0.045, sz * 0.24], {
          chamfer: 0.018, fillet: 0.007, bevel: 0.006,
        })
      }
      // Tread ribs on the walking face.
      for (let index = 0; index < 7; index += 1) {
        box(lid, m.ink, [CLEAR_HALF * 1.5, 0.012, 0.026], [0, lidY + 0.03, (index - 3) * 0.11], {
          chamfer: 0.005, fillet: 0.002, bevel: 0.002,
        })
      }
      recessedHandle(lid, m, [0.24, 0.11], [0, lidY + 0.028, CLEAR_HALF * 0.52], 'top')
      statusLens(lid, m, [0.05, 0.05], [-CLEAR_HALF * 0.55, lidY + 0.028, CLEAR_HALF * 0.52], m.cyan, 'top')

      // Hinge the lid about the far edge, not its own centre.
      lid.position.set(0, 0, hingeZ)
      for (const child of lid.children) child.position.z -= hingeZ

      // Gas strut: the reason the lid stays up.
      //
      // Anchored to the deck and animated as its own assembly, because that is
      // what it physically is — a strut carried by the lid swings *with* the
      // lid and would drive itself through the deck. It is also a sibling of
      // the lid rather than a child: a nested assembly is deleted by the batch
      // merge, which is how the bunker door lost its hand wheel.
      //
      // A closed hatch's strut is folded almost flat, not stood upright. Drawn
      // vertical it was a 440 mm pole rising out of a walked-on deck — a trip
      // hazard modelled as a feature.
      const strut = part('strut')
      strut.position.set(0.3, hingeY, hingeZ)
      strut.rotation.x = -1.42
      strut.add(cylinder(m.steel, 0.016, 0.34, [0, 0.17, 0], [0, 0, 0], 8))
      strut.add(cylinder(m.graphiteEdge, 0.024, 0.16, [0, 0.08, 0], [0, 0, 0], 10))

      return {
        assemblies: [lid, strut],
        cycleSeconds: 2.4,
        apply: (blend) => {
          lid.rotation.x = -blend * 1.62
          // The strut extends and swings up out of its folded rest as the lid
          // rises, so the two are never in contradiction about how far open it is.
          strut.rotation.x = -1.42 + blend * 0.78
          strut.scale.y = 1 + blend * 0.55
        },
        sockets: {
          door_threshold: [0, DECK_Y, HATCH.depth * 0.5],
          door_head: [0, DECK_Y + HATCH.kerb, 0],
          mount_left: [-HATCH.width * 0.5, DECK_Y * 0.5, 0],
          mount_right: [HATCH.width * 0.5, DECK_Y * 0.5, 0],
          power_head: [HATCH.width * 0.5 - 0.12, DECK_Y, -HATCH.depth * 0.5 + 0.1],
          door_hinge_line: [0, hingeY, hingeZ],
          cover_void: [0, -0.1, 0],
        },
        tick: (elapsed) => {
          amber.emissiveIntensity = 0.6 + Math.sin(elapsed * 1.4) * 0.12
        },
      }
    },
  })
}

/** Framed from above, because a floor hatch is only ever seen from above. */
export function createPreview(options: DoorPreviewOptions = {}): CargoPreview {
  return createDoorPreview(createModel(), {
    target: [0, 0.16, 0],
    distance: 2.5,
    yaw: -0.7,
    pitch: 0.62,
    fov: 34,
    ...options,
  })
}

export function createOpenPreview(options: DoorPreviewOptions = {}): CargoPreview {
  return createPreview({ ...options, state: 'open' })
}
