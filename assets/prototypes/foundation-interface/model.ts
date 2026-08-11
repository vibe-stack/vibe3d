import { Group } from 'three/webgpu'
import { add, addFastenerY, buildKitController, makeAssemblyPreview, makeKitPreview, prism, cylinder, type KitSocket, type KitController, type KitPreview } from '../building-threshold/kit-shared.ts'
import { createModel as createFloorModel } from '../floor-slab-tile/model.ts'

const SOCKETS = [
  { name: 'foundation_snap_n', kind: 'foundation', position: [1, 0, 0], normal: [0, 0, 1] },
  { name: 'foundation_snap_s', kind: 'foundation', position: [1, 0, -2], normal: [0, 0, -1] },
  { name: 'foundation_snap_e', kind: 'foundation', position: [2, 0, -1], normal: [1, 0, 0] },
  { name: 'foundation_snap_w', kind: 'foundation', position: [0, 0, -1], normal: [-1, 0, 0] },
  { name: 'floor_mount_center', kind: 'floor', position: [1, 0.4, -1], normal: [0, 1, 0] },
  { name: 'wall_mount_front', kind: 'wall', position: [1, 0.4, 0], normal: [0, 0, 1] },
  { name: 'drain_front', kind: 'service', position: [1, 0, 0], normal: [0, 0, 1] },
  { name: 'anchor_center', kind: 'foundation', position: [1, 0, -1], normal: [0, -1, 0] },
  { name: 'terrain_contact_center', kind: 'foundation', position: [1, 0, -1], normal: [0, -1, 0] },
] as const satisfies readonly KitSocket[]

function author(root: Group, m: Parameters<Parameters<typeof buildKitController>[2]>[1]): void {
  add(root,
    prism(m.graphite, [1.68, 0.06, 1.68], [1, 0.03, -1], { chamfer: 0.12, fillet: 0.018, bevel: 0.012 }),
    prism(m.edge, [1.8, 0.08, 1.8], [1, 0.2, -1], { chamfer: 0.13, fillet: 0.022, bevel: 0.014 }),
    prism(m.shellShade, [1.9, 0.12, 1.9], [1, 0.29, -1], { chamfer: 0.13, fillet: 0.022, bevel: 0.014 }),
    prism(m.grime, [0.82, 0.035, 0.07], [1, 0.375, -0.035], { chamfer: 0.01 }),
  )
  // Four genuinely separate load plates expose the recessed graphite cross
  // instead of drawing panel seams over one broad coplanar lid.
  for (const [x, z] of [[0.67, -0.67], [1.33, -0.67], [0.67, -1.33], [1.33, -1.33]] as const) {
    add(root, prism(m.shell, [0.6, 0.08, 0.6], [x, 0.36, z], { chamfer: 0.085, fillet: 0.016, bevel: 0.01 }))
  }
  add(root,
    prism(m.graphite, [0.62, 0.06, 0.18], [1, 0.355, -1], { chamfer: 0.045, fillet: 0.011, bevel: 0.007 }),
    prism(m.graphite, [0.18, 0.06, 0.62], [1, 0.355, -1], { chamfer: 0.045, fillet: 0.011, bevel: 0.007 }),
    cylinder(m.edge, 0.15, 0.05, [1, 0.365, -1], [0, 0, 0], 12),
    cylinder(m.graphite, 0.09, 0.04, [1, 0.372, -1], [0, 0, 0], 12),
    cylinder(m.steel, 0.025, 0.025, [1, 0.385, -1], [0, 0, 0], 10),
  )
  for (const [x, z] of [[0.22, -0.22], [1.78, -0.22], [0.22, -1.78], [1.78, -1.78]] as const) {
    add(root,
      // The foot shoe keys into the base by 5 mm; its underside must never share
      // the base cap plane or the contact flashes under grazing light.
      prism(m.steel, [0.44, 0.04, 0.44], [x, 0.075, z], { chamfer: 0.095, fillet: 0.016, bevel: 0.01 }),
      cylinder(m.graphite, 0.165, 0.07, [x, 0.12, z], [0, 0, 0], 18),
      cylinder(m.steel, 0.145, 0.055, [x, 0.165, z], [0, 0, 0], 18),
      cylinder(m.graphite, 0.13, 0.05, [x, 0.205, z], [0, 0, 0], 18),
      // A short shoulder above a visibly exposed three-collar piston gives the
      // shallow contract the same readable load path as the tall reference.
      prism(m.edge, [0.44, 0.12, 0.44], [x, 0.32, z], { chamfer: 0.1, fillet: 0.018, bevel: 0.011 }),
      prism(m.shellShade, [0.32, 0.075, 0.32], [x, 0.35, z], { chamfer: 0.075, fillet: 0.014, bevel: 0.009 }),
      cylinder(m.edge, 0.15, 0.03, [x, 0.365, z], [0, 0, 0], 16),
      cylinder(m.graphite, 0.105, 0.025, [x, 0.378, z], [0, 0, 0], 16),
      cylinder(m.steel, 0.03, 0.018, [x, 0.389, z], [0, 0, 0], 10),
    )
  }
  for (const [x, z] of [[0.022, -0.55], [0.022, -1.45], [1.978, -0.55], [1.978, -1.45]] as const) {
    add(root,
      prism(m.edge, [0.06, 0.16, 0.62], [x < 1 ? 0.05 : 1.95, 0.22, z], { chamfer: 0.018, fillet: 0.006, bevel: 0.004 }),
      prism(m.graphite, [0.024, 0.09, 0.44], [x < 1 ? 0.016 : 1.984, 0.22, z], { chamfer: 0.008 }),
    )
  }
  for (const x of [0.55, 1.45]) {
    add(root,
      prism(m.edge, [0.68, 0.13, 0.07], [x, 0.19, -0.055], { chamfer: 0.045, fillet: 0.009, bevel: 0.006 }),
      prism(m.graphite, [0.48, 0.06, 0.04], [x, 0.19, -0.032], { chamfer: 0.022 }),
    )
  }
  // The front service manifold is a recessed mechanical bay, not a row of
  // circles pasted onto the outer shell.
  add(root,
    prism(m.graphite, [1.18, 0.16, 0.045], [1, 0.19, -0.026], { chamfer: 0.045, fillet: 0.01, bevel: 0.006 }),
      prism(m.edge, [1.02, 0.105, 0.028], [1, 0.19, -0.012], { chamfer: 0.032, fillet: 0.008, bevel: 0.005 }),
  )
  for (const x of [0.56, 0.78, 1, 1.22, 1.44]) add(root, cylinder(m.steel, 0.035, 0.04, [x, 0.234, -0.025], [Math.PI / 2, 0, 0], 10))
  // Matching circular utility banks on the side faces make the foundation's
  // service role legible from snapped runs, not only from the hero front.
  for (const z of [-0.7, -0.9, -1.1, -1.3]) {
    add(root,
      cylinder(m.edge, 0.055, 0.035, [1.982, 0.205, z], [0, 0, Math.PI / 2], 12),
      cylinder(m.steel, 0.027, 0.026, [1.995, 0.205, z], [0, 0, Math.PI / 2], 10),
    )
  }
  for (const x of [0.33, 1.67]) for (const z of [-0.33, -1.67]) addFastenerY(root, m.steel, x, 0.38, z, 0.016)
}

export function createModel(): KitController { return buildKitController('foundation-interface', SOCKETS, author) }
function preview(options: { aspect: number }, view: 'beauty' | 'side' | 'rear' | 'low'): KitPreview { return makeKitPreview(options, 'foundation-interface', createModel, view) }
export function createPreview(options: { aspect: number }): KitPreview { return preview(options, 'beauty') }
export function createSidePreview(options: { aspect: number }): KitPreview { return preview(options, 'side') }
export function createRearPreview(options: { aspect: number }): KitPreview { return preview(options, 'rear') }
export function createLowPreview(options: { aspect: number }): KitPreview { return preview(options, 'low') }

export function createFloorAssemblyPreview(options: { aspect: number }): KitPreview {
  return makeAssemblyPreview(options, 'foundation-floor', { width: 2, depth: 2, height: 0.6 }, () => {
    const foundation = createModel()
    const floor = createFloorModel()
    floor.root.position.y = 0.4
    const root = new Group()
    root.name = 'foundation-floor compatibility assembly'
    root.add(foundation.root, floor.root)
    return { root, update: () => {}, dispose: () => { foundation.dispose(); floor.dispose() } }
  })
}
