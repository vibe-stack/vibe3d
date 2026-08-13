import { Group, Object3D } from 'three/webgpu'

import { cylinder } from '../../../src/asset-forge/generator/index.ts'
import {
  AXIS_Y,
  AXIS_Z,
  acquireCargoMaterials,
  addLabelDecal,
  bolt,
  box,
  createCargoPreview,
  drum,
  finishModel,
  radialFitting,
  radialMark,
  radialPlaque,
  slashProfile,
  socket,
  statusLens,
  type CargoMaterialBundle,
  type CargoPreview,
  type CargoPreviewOptions,
} from '../axiom-cargo-kit/index.ts'

/**
 * Axiom Relay sealed barrel.
 *
 * A one-way vessel: welded closed at the factory and cut open at the other end,
 * so it has no lid ring, no bolts, and no ports. Its whole story is the
 * circumferential weld bead at the crown and the tamper seal band - the two
 * details that say this cannot be opened and re-closed.
 *
 * It is deliberately the plainest drum in the wave. A depot needs one silhouette
 * that reads as "bulk, uninteresting, do not interact", or every barrel in the
 * scene competes for the same attention.
 */

const RADIUS = 0.31
const BODY = 0.76
const HOOPS = [0.28, 0.52, 0.76]

interface SealedBarrelSockets {
  seal_band: Object3D
  stack_top: Object3D
  fx_status: Object3D
}

export interface SealedBarrelController {
  root: Group
  sockets: SealedBarrelSockets
  update(deltaSeconds: number): void
  dispose(): void
}

function build(): { root: Group; sockets: SealedBarrelSockets; bundle: CargoMaterialBundle } {
  const bundle = acquireCargoMaterials(54_400, { condition: 0.75 })
  const m = bundle.materials

  const root = new Group()
  root.name = 'AXR_CARGO_SEALED-BARREL_ROOT_DEFAULT'

  const shell = drum(root, m, RADIUS, BODY, [0, 0, 0], {
    hoops: HOOPS,
    chime: 0.028,
    body: m.shellShade,
    band: m.ironOxide,
  })

  // Three hoops and two chimes leave four narrow fields of bare flank, and each
  // ring stands 22 mm prouder than anything applied, so a band, a graphic, or a
  // fastener laid across one is inside it rather than on the barrel. `drum`
  // reports the band its outer chimes clear; the inner rings are a centimetre
  // taller again, which is what the trim here allows for.
  const clearFoot = shell.clearY[0] + 0.01
  const clearHead = shell.clearY[1] - 0.01
  const bandY = (below: number, above: number): number => BODY * (HOOPS[below] + HOOPS[above]) * 0.5
  const sealY = (BODY * HOOPS[2] + 0.026 + clearHead) * 0.5

  // Domed crown with a raised weld bead. Two stepped discs read as a dome at
  // this scale and cost a fraction of a lathe. The bead rings the upper disc,
  // above the top chime - drawn level with the body top it was inside the chime
  // for all but the last three millimetres of its height.
  root.add(cylinder(m.shellShade, RADIUS - 0.035, 0.06, [0, BODY + 0.02, 0], AXIS_Y, 20))
  root.add(cylinder(m.shellShade, RADIUS - 0.11, 0.05, [0, BODY + 0.06, 0], AXIS_Y, 18))
  root.add(cylinder(m.ironOxide, RADIUS - 0.02, 0.022, [0, BODY + 0.028, 0], AXIS_Y, 20))
  root.add(cylinder(m.ink, 0.05, 0.03, [0, BODY + 0.09, 0], AXIS_Y, 10))

  // Tamper seal: a thin painted band with a broken-strap catch on one flank.
  const catchZ = shell.radius + 0.012
  root.add(cylinder(m.amberPaint, RADIUS + 0.006, 0.035, [0, sealY, 0], AXIS_Y, 20))
  box(root, m.graphiteEdge, [0.09, 0.07, 0.035], [0, sealY, catchZ], {
    chamfer: 0.024, fillet: 0.008, bevel: 0.007,
  })
  root.add(cylinder(m.steel, 0.014, 0.05, [0, sealY, catchZ + 0.0175], AXIS_Z, 8))

  const label = addLabelDecal(bundle, { variant: 23 })
  radialPlaque(root, m, label, [0.048, 0.085], RADIUS, bandY(1, 2), 0.5, m.ink)
  radialMark(root, m.amberPaint, slashProfile(0.058, 0.115, 0.42), RADIUS, bandY(0, 1), -0.17, 20, 0.016)
  radialMark(root, m.amberPaint, slashProfile(0.03, 0.115, 0.42), RADIUS, bandY(0, 1), 0.17, 20, 0.016)
  const lamp = radialFitting(RADIUS, bandY(1, 2), -0.75)
  statusLens(root, m, [0.05, 0.02], lamp.position, m.cyan, 'front', 0, lamp.rotation)
  // Seam fasteners turned to face out of the shell. Left to the six box faces
  // every one of these came out along +Z - the outer pair 51 degrees off the
  // surface they are screwed into.
  for (let index = 0; index < 3; index += 1) {
    const seat = radialFitting(RADIUS, (clearFoot + BODY * HOOPS[0] - 0.026) * 0.5, -0.9 + index * 0.9)
    bolt(root, m.steel, seat.position, 0.015, 'front', 0.023, seat.rotation)
  }

  const sockets: SealedBarrelSockets = {
    seal_band: socket('seal_band', [0, sealY, RADIUS + 0.06]),
    stack_top: socket('stack_top', [0, BODY + 0.11, 0]),
    fx_status: socket('fx_status', radialFitting(RADIUS + 0.05, bandY(1, 2), -0.75).position),
  }
  return { root, sockets, bundle }
}

export function createModel(): SealedBarrelController {
  const { root, sockets, bundle } = build()
  const finished = finishModel(root, bundle, {
    name: 'sealed-barrel',
    reach: 0.12,
    sockets: Object.values(sockets),
  })
  let elapsed = 0
  return {
    root,
    sockets,
    update: (deltaSeconds: number) => {
      elapsed += Math.min(Math.max(deltaSeconds, 0), 0.05)
      bundle.materials.cyan.emissiveIntensity = 1.5 + Math.sin(elapsed * 1.3) * 0.18
    },
    dispose: finished.dispose,
  }
}

export const createPreview = (options: CargoPreviewOptions = {}): CargoPreview =>
  createCargoPreview(createModel(), {
    target: [0, BODY * 0.52, 0],
    distance: 2.25,
    yaw: 0.4,
    pitch: 0.29,
    fov: 30,
    ...options,
  })
