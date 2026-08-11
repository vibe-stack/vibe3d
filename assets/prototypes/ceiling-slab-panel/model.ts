import { Group } from 'three/webgpu'
import { add, buildKitController, cylinder, makeKitPreview, prism, type KitSocket, type KitController, type KitPreview } from '../building-threshold/kit-shared.ts'

const SOCKETS = [
  { name: 'ceiling_snap_n', kind: 'ceiling', position: [1, 0, 0], normal: [0, 0, 1] },
  { name: 'ceiling_snap_s', kind: 'ceiling', position: [1, 0, -2], normal: [0, 0, -1] },
  { name: 'ceiling_snap_e', kind: 'ceiling', position: [2, 0, -1], normal: [1, 0, 0] },
  { name: 'ceiling_snap_w', kind: 'ceiling', position: [0, 0, -1], normal: [-1, 0, 0] },
  { name: 'roof_mount_center', kind: 'roof-edge', position: [1, 0.18, -1], normal: [0, 1, 0] },
  { name: 'ceiling_mount_bottom', kind: 'ceiling', position: [1, 0, -1], normal: [0, -1, 0] },
  { name: 'service_access_center', kind: 'service', position: [1, 0, -1], normal: [0, -1, 0] },
  { name: 'light_mount_center', kind: 'service', position: [1, 0, -1], normal: [0, -1, 0] },
] as const satisfies readonly KitSocket[]

function author(root: Group, m: Parameters<Parameters<typeof buildKitController>[2]>[1]): void {
  add(root,
    prism(m.shell, [2, 0.06, 2], [1, 0.15, -1], { chamfer: 0.1, fillet: 0.02, bevel: 0.014 }),
    prism(m.edge, [1.82, 0.06, 1.82], [1, 0.105, -1], { chamfer: 0.1, fillet: 0.02, bevel: 0.012 }),
    prism(m.graphite, [1.68, 0.055, 1.68], [1, 0.07, -1], { chamfer: 0.15, fillet: 0.024, bevel: 0.014 }),
    prism(m.shellShade, [1.52, 0.04, 1.52], [1, 0.034, -1], { chamfer: 0.14, fillet: 0.021, bevel: 0.012 }),
    prism(m.edge, [1.4, 0.035, 1.4], [1, 0.03, -1], { chamfer: 0.13, fillet: 0.019, bevel: 0.01 }),
    prism(m.shellShade, [1.7, 0.018, 0.07], [1, 0.073, -0.18], { chamfer: 0.018 }),
    prism(m.shellShade, [1.7, 0.018, 0.07], [1, 0.073, -1.82], { chamfer: 0.018 }),
    prism(m.shellShade, [0.07, 0.018, 1.56], [0.18, 0.073, -1], { chamfer: 0.018 }),
    prism(m.shellShade, [0.07, 0.018, 1.56], [1.82, 0.073, -1], { chamfer: 0.018 }),
  )
  for (const [x, z] of [[0.7, -0.7], [1.3, -0.7], [0.7, -1.3], [1.3, -1.3]] as const) {
    add(root, prism(m.graphite, [0.5, 0.024, 0.5], [x, 0.02, z], { chamfer: 0.055, fillet: 0.008, bevel: 0.004 }))
    // Two real welded grille layers: the longitudinal bars own the underside
    // plane, while the transverse layer is recessed 12 mm and lands in the
    // cassette backing. Their broad faces can no longer cross at one depth.
    for (const dx of [-0.17, -0.085, 0, 0.085, 0.17]) add(root, prism(m.steel, [0.025, 0.008, 0.4], [x + dx, 0.004, z], { chamfer: 0.004 }))
    for (const dz of [-0.17, -0.085, 0, 0.085, 0.17]) add(root, prism(m.steel, [0.4, 0.008, 0.025], [x, 0.022, z + dz], { chamfer: 0.004 }))
  }
  add(root, prism(m.amber, [0.52, 0.02, 0.045], [1, 0.01, -0.22], { chamfer: 0.008 }))
  add(root,
    prism(m.steel, [0.06, 0.008, 1.18], [1, 0.004, -1], { chamfer: 0.008 }),
    prism(m.steel, [1.18, 0.008, 0.06], [1, 0.022, -1], { chamfer: 0.008 }),
  )
  for (const [x, z] of [[0.22, -0.22], [1.78, -0.22], [0.22, -1.78], [1.78, -1.78]] as const) {
    add(root,
      cylinder(m.graphite, 0.045, 0.08, [x, 0.052, z], [0, 0, 0], 10),
      cylinder(m.steel, 0.065, 0.02, [x, 0.01, z], [0, 0, 0], 10),
    )
  }
  for (const [x, z, rotation] of [[0.38, -0.38, -Math.PI / 4], [1.62, -0.38, Math.PI / 4], [0.38, -1.62, Math.PI / 4], [1.62, -1.62, -Math.PI / 4]] as const) {
    const brace = prism(m.edge, [0.48, 0.026, 0.055], [x, 0.06, z], { chamfer: 0.012 })
    brace.rotation.y = rotation
    root.add(brace)
  }
  // The reference hero read is the underside; top-face micro-fasteners were removed to avoid coincident caps.
}

export function createModel(): KitController { return buildKitController('ceiling-slab-panel', SOCKETS, author) }
function preview(options: { aspect: number }, view: 'beauty' | 'side' | 'rear' | 'low'): KitPreview { return makeKitPreview(options, 'ceiling-slab-panel', createModel, view) }
export function createPreview(options: { aspect: number }): KitPreview { return preview(options, 'beauty') }
export function createSidePreview(options: { aspect: number }): KitPreview { return preview(options, 'side') }
export function createRearPreview(options: { aspect: number }): KitPreview { return preview(options, 'rear') }
export function createLowPreview(options: { aspect: number }): KitPreview { return preview(options, 'low') }
export function createUndersidePreview(options: { aspect: number }): KitPreview { return makeKitPreview(options, 'ceiling-slab-panel', createModel, 'underside') }
