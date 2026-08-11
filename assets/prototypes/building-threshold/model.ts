import { Group } from 'three/webgpu'
import { add, addFastenerY, buildKitController, cylinder, makeKitPreview, prism, type KitSocket, type KitController, type KitPreview } from './kit-shared.ts'

const SOCKETS = [
  { name: 'floor_snap_left', kind: 'floor', position: [0, 0, -0.25], normal: [-1, 0, 0] },
  { name: 'floor_snap_right', kind: 'floor', position: [2, 0, -0.25], normal: [1, 0, 0] },
  // The bay socket lives on the rear shoulder so the threshold projects as a
  // true approach ramp while its rear 0.2 m keys beneath the door sill.
  { name: 'door_bay_center', kind: 'door', position: [1, 0, -0.45], normal: [0, 1, 0] },
  { name: 'drainage_front', kind: 'service', position: [1, 0, 0], normal: [0, 0, 1] },
  { name: 'cable_crossing_rear', kind: 'service', position: [1, 0, -0.5], normal: [0, 0, -1] },
  { name: 'ramp_attach_front', kind: 'dressing', position: [1, 0, 0], normal: [0, 0, 1] },
] as const satisfies readonly KitSocket[]

function author(root: Group, m: Parameters<Parameters<typeof buildKitController>[2]>[1]): void {
  add(root,
    // The removable ramp fits between the 1.6 m clear jambs; its raised end
    // housings and socket collars still establish the exact 2 m envelope.
    prism(m.edge, [1.58, 0.08, 0.5], [1, 0.04, -0.25], { chamfer: 0.06, fillet: 0.02, bevel: 0.015 }),
    prism(m.shellShade, [1.54, 0.065, 0.44], [1, 0.1, -0.25], { chamfer: 0.07, fillet: 0.016, bevel: 0.01 }),
    prism(m.shell, [1.46, 0.045, 0.4], [1, 0.145, -0.25], { chamfer: 0.065, fillet: 0.014, bevel: 0.009 }),
    prism(m.graphite, [0.65, 0.038, 0.32], [0.425, 0.176, -0.246]),
    prism(m.graphite, [0.65, 0.038, 0.32], [1.575, 0.176, -0.254]),
    prism(m.edge, [0.42, 0.045, 0.42], [1, 0.17, -0.25], { chamfer: 0.06, fillet: 0.01, bevel: 0.007 }),
    prism(m.edge, [0.3, 0.115, 0.48], [0.17, 0.135, -0.25], { chamfer: 0.055, fillet: 0.012, bevel: 0.008 }),
    prism(m.edge, [0.3, 0.115, 0.48], [1.83, 0.135, -0.25], { chamfer: 0.055, fillet: 0.012, bevel: 0.008 }),
    prism(m.amber, [0.58, 0.032, 0.025], [0.48, 0.184, -0.075]),
    prism(m.amber, [0.58, 0.032, 0.025], [1.52, 0.184, -0.078]),
  )
  for (const [index, x] of [0.88, 0.96, 1.04, 1.12].entries()) add(root, cylinder(m.graphite, 0.021, 0.334 - index * 0.003, [x, 0.178, -0.247 - index * 0.003], [Math.PI / 2, 0, 0], 8))
  for (const x of [0.82, 1.18]) add(root, prism(m.steel, [0.025, 0.014, 0.32], [x, 0.193, -0.25], { chamfer: 0.004 }))
  for (const x of [0.03, 1.97]) {
    add(root,
      cylinder(m.graphite, 0.055, 0.06, [x < 1 ? 0.056 : 1.944, 0.12, -0.25], [0, 0, Math.PI / 2], 12),
      cylinder(m.steel, 0.035, 0.035, [x < 1 ? 0.0175 : 1.9825, 0.12, -0.25], [0, 0, Math.PI / 2], 10),
    )
  }
  for (const [index, x] of [0.34, 0.48, 0.62, 0.76, 0.9, 1.1, 1.24, 1.38, 1.52, 1.66].entries()) add(root, prism(m.graphite, [0.075, 0.04, 0.018], [x, 0.105, -0.012 - (index % 3) * 0.002]))
  for (const x of [0.15, 0.4, 0.7, 1.3, 1.6, 1.85]) for (const z of [-0.1, -0.4]) addFastenerY(root, m.steel, x, 0.172, z, 0.014)
}

export function createModel(): KitController { return buildKitController('building-threshold', SOCKETS, author) }
function preview(options: { aspect: number }, view: 'beauty' | 'side' | 'rear' | 'low'): KitPreview { return makeKitPreview(options, 'building-threshold', createModel, view) }
export function createPreview(options: { aspect: number }): KitPreview { return preview(options, 'beauty') }
export function createSidePreview(options: { aspect: number }): KitPreview { return preview(options, 'side') }
export function createRearPreview(options: { aspect: number }): KitPreview { return preview(options, 'rear') }
export function createLowPreview(options: { aspect: number }): KitPreview { return preview(options, 'low') }
