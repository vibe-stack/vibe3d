import { Group } from 'three/webgpu'
import { add, addFastenerY, buildKitController, makeKitPreview, prism, cylinder, type KitSocket, type KitController, type KitPreview } from '../building-threshold/kit-shared.ts'

const SOCKETS = [
  { name: 'floor_snap_n', kind: 'floor', position: [1, 0, 0], normal: [0, 0, 1] },
  { name: 'floor_snap_s', kind: 'floor', position: [1, 0, -2], normal: [0, 0, -1] },
  { name: 'floor_snap_e', kind: 'floor', position: [2, 0, -1], normal: [1, 0, 0] },
  { name: 'floor_snap_w', kind: 'floor', position: [0, 0, -1], normal: [-1, 0, 0] },
  { name: 'foundation_mount_center', kind: 'foundation', position: [1, 0, -1], normal: [0, -1, 0] },
  { name: 'service_access_center', kind: 'service', position: [1, 0.2, -1], normal: [0, 1, 0] },
] as const satisfies readonly KitSocket[]

function author(root: Group, m: Parameters<Parameters<typeof buildKitController>[2]>[1]): void {
  add(root,
    prism(m.edge, [2, 0.08, 2], [1, 0.04, -1], { chamfer: 0.1, fillet: 0.02, bevel: 0.015 }),
    prism(m.shellShade, [1.84, 0.06, 1.84], [1, 0.1, -1], { chamfer: 0.1, fillet: 0.018, bevel: 0.012 }),
    prism(m.shell, [1.64, 0.06, 1.64], [1, 0.15, -1], { chamfer: 0.12, fillet: 0.018, bevel: 0.01 }),
    prism(m.edge, [1.34, 0.025, 1.26], [1, 0.177, -1], { chamfer: 0.09, fillet: 0.01, bevel: 0.006 }),
    prism(m.graphite, [1.18, 0.024, 1.1], [1, 0.186, -1], { chamfer: 0.08, fillet: 0.008, bevel: 0.004 }),
    prism(m.shell, [1.08, 0.02, 1], [1, 0.19, -1], { chamfer: 0.07, fillet: 0.006, bevel: 0.003 }),
    prism(m.steel, [1.74, 0.018, 0.035], [1, 0.174, -0.095], { chamfer: 0.008 }),
    prism(m.steel, [1.74, 0.018, 0.035], [1, 0.174, -1.905], { chamfer: 0.008 }),
    prism(m.steel, [0.035, 0.018, 1.74], [0.095, 0.174, -1], { chamfer: 0.008 }),
    prism(m.steel, [0.035, 0.018, 1.74], [1.905, 0.174, -1], { chamfer: 0.008 }),
  )
  for (const [x, z] of [[0.15, -0.15], [1.85, -0.15], [0.15, -1.85], [1.85, -1.85]] as const) {
    add(root,
      prism(m.edge, [0.3, 0.055, 0.3], [x, 0.16, z], { chamfer: 0.075, fillet: 0.012, bevel: 0.008 }),
      cylinder(m.graphite, 0.082, 0.024, [x, 0.181, z], [0, 0, 0], 14),
      cylinder(m.steel, 0.067, 0.012, [x, 0.191, z], [0, 0, 0], 14),
      cylinder(m.graphite, 0.044, 0.025, [x, 0.1875, z], [0, 0, 0], 12),
    )
  }
  for (const [x, z] of [[0.018, -0.55], [0.018, -1.45], [1.982, -0.55], [1.982, -1.45]] as const) {
    add(root,
      prism(m.edge, [0.06, 0.085, 0.52], [x < 1 ? 0.05 : 1.95, 0.08, z], { chamfer: 0.014, fillet: 0.005, bevel: 0.003 }),
      prism(m.graphite, [0.028, 0.05, 0.34], [x < 1 ? 0.014 : 1.986, 0.08, z], { chamfer: 0.006 }),
    )
  }
  for (const x of [0.46, 1.54]) {
    add(root,
      prism(m.edge, [0.62, 0.09, 0.07], [x, 0.075, -0.055], { chamfer: 0.045, fillet: 0.008, bevel: 0.006 }),
      prism(m.graphite, [0.4, 0.05, 0.04], [x, 0.075, -0.032], { chamfer: 0.02 }),
      prism(m.amber, [0.18, 0.022, 0.025], [x, 0.075, -0.0125], { chamfer: 0.006 }),
    )
  }
  for (const [x, z, sx, sz] of [[1, -0.07, 0.68, 0.03], [1, -1.93, 0.68, 0.03], [0.07, -1, 0.03, 0.68], [1.93, -1, 0.03, 0.68]] as const) {
    add(root, prism(m.graphite, [sx, 0.018, sz], [x, 0.181, z], { chamfer: 0.01 }), prism(m.amber, [sx * 0.5, 0.008, sz * 0.45], [x, 0.194, z], { chamfer: 0.004 }))
  }
  for (const x of [0.5, 1.5]) for (const z of [-0.5, -1.5]) addFastenerY(root, m.steel, x, 0.18, z, 0.016)
}

export function createModel(): KitController { return buildKitController('floor-slab-tile', SOCKETS, author) }
function preview(options: { aspect: number }, view: 'beauty' | 'side' | 'rear' | 'low'): KitPreview { return makeKitPreview(options, 'floor-slab-tile', createModel, view) }
export function createPreview(options: { aspect: number }): KitPreview { return preview(options, 'beauty') }
export function createSidePreview(options: { aspect: number }): KitPreview { return preview(options, 'side') }
export function createRearPreview(options: { aspect: number }): KitPreview { return preview(options, 'rear') }
export function createLowPreview(options: { aspect: number }): KitPreview { return preview(options, 'low') }
