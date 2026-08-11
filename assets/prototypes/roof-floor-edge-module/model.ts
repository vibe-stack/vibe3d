import { Group } from 'three/webgpu'
import { add, buildKitController, cylinder, makeAssemblyPreview, makeKitPreview, prism, type KitSocket, type KitController, type KitPreview } from '../building-threshold/kit-shared.ts'
import { createModel as createCeilingModel } from '../ceiling-slab-panel/model.ts'

const SOCKETS = [
  { name: 'wall_snap_center', kind: 'wall', position: [1, 0, -0.25], normal: [0, -1, 0] },
  { name: 'floor_snap_rear', kind: 'floor', position: [1, 0, -0.5], normal: [0, 0, -1] },
  { name: 'roof_snap_center', kind: 'roof-edge', position: [1, 0, -0.25], normal: [0, -1, 0] },
  { name: 'parapet_center', kind: 'roof-edge', position: [1, 0.35, 0], normal: [0, 0, 1] },
  { name: 'service_access_rear', kind: 'service', position: [1, 0.25, -0.5], normal: [0, 0, -1] },
] as const satisfies readonly KitSocket[]

function author(root: Group, m: Parameters<Parameters<typeof buildKitController>[2]>[1]): void {
  add(root,
    prism(m.edge, [2, 0.08, 0.5], [1, 0.04, -0.25], { chamfer: 0.07, fillet: 0.018, bevel: 0.012 }),
    prism(m.graphite, [1.82, 0.09, 0.42], [1, 0.115, -0.253], { chamfer: 0.07, fillet: 0.016, bevel: 0.01 }),
    prism(m.shellShade, [1.9, 0.11, 0.46], [1, 0.205, -0.25], { chamfer: 0.075, fillet: 0.018, bevel: 0.012 }),
    prism(m.edge, [1.5, 0.035, 0.075], [1, 0.105, -0.041], { chamfer: 0.018 }),
    prism(m.edge, [1.5, 0.035, 0.075], [1, 0.205, -0.041], { chamfer: 0.018 }),
    cylinder(m.steel, 0.03, 1.3, [1, 0.155, -0.03], [0, 0, Math.PI / 2], 10),
    cylinder(m.edge, 0.075, 0.13, [0.35, 0.155, -0.075], [0, 0, Math.PI / 2], 12),
    cylinder(m.edge, 0.075, 0.13, [1.65, 0.155, -0.075], [0, 0, Math.PI / 2], 12),
    cylinder(m.steel, 0.052, 0.08, [0.35, 0.155, -0.052], [0, 0, Math.PI / 2], 10),
    cylinder(m.steel, 0.052, 0.08, [1.65, 0.155, -0.052], [0, 0, Math.PI / 2], 10),
    prism(m.edge, [0.25, 0.23, 0.48], [0.14, 0.225, -0.25], { chamfer: 0.06, fillet: 0.014, bevel: 0.009 }),
    prism(m.edge, [0.25, 0.23, 0.48], [1.86, 0.225, -0.25], { chamfer: 0.06, fillet: 0.014, bevel: 0.009 }),
    prism(m.shellShade, [0.18, 0.3, 0.38], [0.11, 0.2, -0.25], { chamfer: 0.05, fillet: 0.012, bevel: 0.008 }),
    prism(m.shellShade, [0.18, 0.3, 0.38], [1.89, 0.2, -0.25], { chamfer: 0.05, fillet: 0.012, bevel: 0.008 }),
    prism(m.graphite, [0.068, 0.2, 0.08], [0.046, 0.2, -0.049], { chamfer: 0.025, fillet: 0.007, bevel: 0.004 }),
    prism(m.graphite, [0.068, 0.2, 0.08], [1.954, 0.2, -0.049], { chamfer: 0.025, fillet: 0.007, bevel: 0.004 }),
    prism(m.amber, [0.035, 0.1, 0.012], [0.0175, 0.2, -0.045], { chamfer: 0.008 }),
    prism(m.amber, [0.035, 0.1, 0.012], [1.9825, 0.2, -0.045], { chamfer: 0.008 }),
    prism(m.graphite, [1.52, 0.16, 0.11], [1, 0.25, -0.43], { chamfer: 0.035, fillet: 0.009, bevel: 0.006 }),
    prism(m.shellShade, [1.42, 0.11, 0.08], [1, 0.295, -0.44], { chamfer: 0.025, fillet: 0.007, bevel: 0.005 }),
    prism(m.amber, [0.36, 0.03, 0.02], [1, 0.335, -0.045], { chamfer: 0.009 }),
  )
  // Three separate cap plates reveal real dark expansion joints while keeping
  // the exact 2m x .5m x .35m module envelope.
  for (const [x, width] of [[0.595, 0.77], [1.405, 0.77]] as const) {
    add(root, prism(m.shell, [width, 0.1, 0.36], [x, 0.3, -0.25], { chamfer: 0.06, fillet: 0.015, bevel: 0.01 }))
  }
  // Three deep cantilever brackets physically carry the front race and pipe;
  // they terminate inside the base shell rather than ending as decorative tabs.
  for (const x of [0.46, 1, 1.54]) {
    add(root,
      prism(m.edge, [0.13, 0.135, 0.16], [x, 0.115, -0.12], { chamfer: 0.03, fillet: 0.008, bevel: 0.005 }),
    )
  }
  // Deep rear service race with three explicit captured sockets. These sit on
  // the rear face of the existing machinery bay rather than sharing its plane.
  for (const x of [0.48, 1, 1.52]) {
    add(root,
      prism(m.edge, [0.3, 0.105, 0.045], [x, 0.16, -0.472], { chamfer: 0.026, fillet: 0.007, bevel: 0.004 }),
      prism(m.graphite, [0.18, 0.065, 0.026], [x, 0.16, -0.493], { chamfer: 0.018, fillet: 0.005, bevel: 0.003 }),
      cylinder(m.steel, 0.025, 0.025, [x, 0.16, -0.499], [Math.PI / 2, 0, 0], 10),
    )
  }
  for (const x of [0.24, 1.76]) {
    add(root,
      cylinder(m.edge, 0.095, 0.09, [x, 0.155, -0.095], [0, 0, Math.PI / 2], 14),
      cylinder(m.steel, 0.062, 0.06, [x, 0.155, -0.062], [0, 0, Math.PI / 2], 12),
    )
  }
  // Repeated paper-thin rear grime tabs and boundary-coplanar front bolts were removed.
}

export function createModel(): KitController { return buildKitController('roof-floor-edge-module', SOCKETS, author) }
function preview(options: { aspect: number }, view: 'beauty' | 'side' | 'rear' | 'low'): KitPreview { return makeKitPreview(options, 'roof-floor-edge-module', createModel, view) }
export function createPreview(options: { aspect: number }): KitPreview { return preview(options, 'beauty') }
export function createSidePreview(options: { aspect: number }): KitPreview { return preview(options, 'side') }
export function createRearPreview(options: { aspect: number }): KitPreview { return preview(options, 'rear') }
export function createLowPreview(options: { aspect: number }): KitPreview { return preview(options, 'low') }

export function createCeilingEdgeAssemblyPreview(options: { aspect: number }): KitPreview {
  return makeAssemblyPreview(options, 'ceiling-roof-edge', { width: 2, depth: 2, height: 0.53 }, () => {
    const ceiling = createCeilingModel()
    const edge = createModel()
    edge.root.position.y = 0.18
    const root = new Group()
    root.name = 'ceiling-roof-edge compatibility assembly'
    root.add(ceiling.root, edge.root)
    return { root, update: () => {}, dispose: () => { ceiling.dispose(); edge.dispose() } }
  })
}
