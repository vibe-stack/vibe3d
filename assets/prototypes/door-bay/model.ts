import { Group, Mesh } from 'three/webgpu'
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { add, addFastenerZ, buildKitController, makeAssemblyPreview, makeKitPreview, prism, type KitSocket, type KitController, type KitPreview } from '../building-threshold/kit-shared.ts'
import { createModel as createThresholdModel } from '../building-threshold/model.ts'

const SOCKETS = [
  { name: 'wall_snap_left', kind: 'wall', position: [0, 1.5, -0.125], normal: [-1, 0, 0] },
  { name: 'wall_snap_right', kind: 'wall', position: [2, 1.5, -0.125], normal: [1, 0, 0] },
  { name: 'door_leaf_center', kind: 'door', position: [1, 1.3, -0.15], normal: [0, 0, 1] },
  { name: 'door_control_right', kind: 'service', position: [1.75, 1.25, 0], normal: [0, 0, 1] },
  { name: 'floor_snap_center', kind: 'floor', position: [1, 0, -0.15], normal: [0, -1, 0] },
  { name: 'threshold_center', kind: 'door', position: [1, 0, -0.15], normal: [0, -1, 0] },
  { name: 'prefab_mount_back', kind: 'door', position: [1, 1.5, -0.3], normal: [0, 0, -1], up: [0, 1, 0] },
] as const satisfies readonly KitSocket[]

function author(root: Group, m: Parameters<Parameters<typeof buildKitController>[2]>[1]): void {
  // Exact 1.6 x 2.6 clear opening: 0.2 m jambs and a 0.4 m lintel.
  add(root,
    // The broad host stops 12.5 mm short of the rear snap plane so it cannot
    // duplicate the prefab wall skin. A compact keyed tongue below reaches the
    // immutable -300 mm envelope inside the actual doorway void.
    prism(m.shellShade, [0.2, 2.75, 0.205], [0.1, 1.625, -0.185], { chamfer: 0.075, fillet: 0.018, bevel: 0.013 }),
    prism(m.shellShade, [0.2, 2.75, 0.205], [1.9, 1.625, -0.185], { chamfer: 0.075, fillet: 0.018, bevel: 0.013 }),
    prism(m.shellShade, [1.6, 0.4, 0.205], [1, 2.8, -0.185], { chamfer: 0.075, fillet: 0.018, bevel: 0.013 }),
    prism(m.graphite, [0.18, 0.06, 0.03], [1, 2.56, -0.285], { chamfer: 0.01, fillet: 0.003, bevel: 0.002 }),
    // Triple nested reveal remains entirely on the jamb/lintel load path; the 1.6 x 2.6 opening stays clear.
    prism(m.edge, [0.12, 2.58, 0.1], [0.13, 1.3, -0.08], { chamfer: 0.03, fillet: 0.009, bevel: 0.006 }),
    prism(m.edge, [0.12, 2.58, 0.1], [1.87, 1.3, -0.08], { chamfer: 0.03, fillet: 0.009, bevel: 0.006 }),
    // The head reveal keys 10 mm into both jambs instead of terminating on
    // their exact inner planes.
    prism(m.edge, [1.62, 0.12, 0.1], [1, 2.67, -0.08], { chamfer: 0.035, fillet: 0.009, bevel: 0.006 }),
    prism(m.steel, [0.018, 2.5, 0.04], [0.165, 1.3, -0.02], { chamfer: 0.007 }),
    prism(m.steel, [0.018, 2.5, 0.04], [1.835, 1.3, -0.02], { chamfer: 0.007 }),
    prism(m.steel, [1.54, 0.018, 0.04], [1, 2.635, -0.02], { chamfer: 0.007 }),
    prism(m.graphite, [0.075, 2.46, 0.05], [0.185, 1.3, -0.037], { chamfer: 0.018, fillet: 0.005, bevel: 0.004 }),
    prism(m.graphite, [0.075, 2.46, 0.05], [1.815, 1.3, -0.037], { chamfer: 0.018, fillet: 0.005, bevel: 0.004 }),
    prism(m.graphite, [1.56, 0.075, 0.05], [1, 2.61, -0.037], { chamfer: 0.022, fillet: 0.006, bevel: 0.004 }),
    prism(m.edge, [0.18, 0.72, 0.1], [1.88, 1.28, -0.095], { chamfer: 0.04, fillet: 0.012, bevel: 0.008 }),
    prism(m.graphite, [0.12, 0.48, 0.06], [1.88, 1.28, -0.055], { chamfer: 0.026 }),
    prism(m.steel, [0.07, 0.34, 0.035], [1.88, 1.28, -0.03], { chamfer: 0.014 }),
    prism(m.amber, [0.05, 0.28, 0.035], [1.88, 1.28, -0.0175], { chamfer: 0.009 }),
    // Shallow three-step receiver under the removable threshold. Each cap
    // owns a distinct height so the inserted ramp does not duplicate planes.
    prism(m.edge, [1.64, 0.064, 0.3], [1, 0.044, -0.15], { chamfer: 0.04, fillet: 0.01, bevel: 0.008 }),
    prism(m.graphite, [1.56, 0.03, 0.25], [1, 0.09, -0.15], { chamfer: 0.028, fillet: 0.007, bevel: 0.005 }),
    prism(m.steel, [1.48, 0.014, 0.2], [1, 0.116, -0.15], { chamfer: 0.022 }),
  )
  // A dark rear gasket, mid-depth reveal and bright front lip use the full
  // 300 mm envelope; oblique views now read three real throat rings.
  add(root,
    prism(m.graphite, [0.07, 2.48, 0.055], [0.16, 1.3, -0.245], { chamfer: 0.02, fillet: 0.006, bevel: 0.004 }),
    prism(m.graphite, [0.07, 2.48, 0.055], [1.84, 1.3, -0.245], { chamfer: 0.02, fillet: 0.006, bevel: 0.004 }),
    prism(m.graphite, [1.55, 0.08, 0.055], [1, 2.585, -0.245], { chamfer: 0.025, fillet: 0.007, bevel: 0.005 }),
    prism(m.graphite, [0.06, 2.5, 0.065], [0.12, 1.3, -0.18], { chamfer: 0.02, fillet: 0.006, bevel: 0.004 }),
    prism(m.graphite, [0.06, 2.5, 0.065], [1.88, 1.3, -0.18], { chamfer: 0.02, fillet: 0.006, bevel: 0.004 }),
    prism(m.graphite, [1.58, 0.08, 0.065], [1, 2.58, -0.18], { chamfer: 0.028, fillet: 0.008, bevel: 0.005 }),
  )
  // Deep load-bearing gasket: a broad recessed receiver plus a narrower inner
  // lip make the portal read as a four-step mechanical throat from oblique views.
  add(root,
    prism(m.edge, [0.12, 2.38, 0.07], [0.21, 1.31, -0.11], { chamfer: 0.03, fillet: 0.009, bevel: 0.006 }),
    prism(m.edge, [0.12, 2.38, 0.07], [1.79, 1.31, -0.11], { chamfer: 0.03, fillet: 0.009, bevel: 0.006 }),
    prism(m.edge, [1.58, 0.14, 0.07], [1, 2.55, -0.11], { chamfer: 0.038, fillet: 0.011, bevel: 0.007 }),
    prism(m.graphite, [0.08, 2.34, 0.055], [0.245, 1.3, -0.065], { chamfer: 0.022, fillet: 0.006, bevel: 0.004 }),
    prism(m.graphite, [0.08, 2.34, 0.055], [1.755, 1.3, -0.065], { chamfer: 0.022, fillet: 0.006, bevel: 0.004 }),
    prism(m.graphite, [1.51, 0.085, 0.055], [1, 2.515, -0.065], { chamfer: 0.026, fillet: 0.007, bevel: 0.005 }),
    prism(m.edge, [1.48, 0.22, 0.1], [1, 2.47, -0.14], { chamfer: 0.048, fillet: 0.014, bevel: 0.009 }),
    prism(m.graphite, [1.4, 0.11, 0.05], [1, 2.385, -0.06], { chamfer: 0.03, fillet: 0.008, bevel: 0.006 }),
  )
  // Broad structural shoulder courses replace the earlier capsule rhythm.
  // Their small shadow gaps are real breaks between load-bearing panels.
  for (const [y, height] of [[0.565, 0.47], [1.15, 0.72], [2.05, 1.02]] as const) add(root,
    prism(m.shell, [0.28, height, 0.045], [0.14, y, -0.025], { chamfer: 0.05, fillet: 0.015, bevel: 0.01 }),
  )
  for (const [y, height] of [[0.565, 0.47], [2.05, 1.02]] as const) add(root,
    prism(m.shell, [0.28, height, 0.045], [1.86, y, -0.025], { chamfer: 0.05, fillet: 0.015, bevel: 0.01 }),
  )
  for (const y of [0.62, 1.38, 2.14]) for (const x of [0.07, 1.93]) {
    add(root,
      prism(m.graphite, [0.1, 0.24, 0.055], [x, y, -0.0475], { chamfer: 0.022, fillet: 0.006, bevel: 0.004 }),
      prism(m.steel, [0.032, 0.12, 0.035], [x, y, -0.0175], { chamfer: 0.008 }),
    )
  }
  for (const y of [0.55, 1.45, 2.35]) for (const x of [0.045, 1.955]) {
    add(root, prism(m.edge, [0.07, 0.32, 0.2], [x, y, -0.15], { chamfer: 0.027, fillet: 0.009, bevel: 0.006 }))
  }
  add(root,
    prism(m.shell, [0.58, 0.32, 0.095], [0.31, 2.82, -0.0725], { chamfer: 0.045, fillet: 0.013, bevel: 0.009 }),
    prism(m.shell, [0.68, 0.32, 0.095], [1, 2.82, -0.0725], { chamfer: 0.045, fillet: 0.013, bevel: 0.009 }),
    prism(m.shell, [0.58, 0.32, 0.095], [1.69, 2.82, -0.0725], { chamfer: 0.045, fillet: 0.013, bevel: 0.009 }),
    prism(m.graphite, [0.56, 0.1, 0.05], [1, 2.72, -0.045], { chamfer: 0.025 }),
    prism(m.amber, [0.42, 0.05, 0.035], [1, 2.72, -0.0175], { chamfer: 0.012 }),
  )
  // Faceted, grounded corner shoes carry the jamb load into the removable
  // threshold. Their uncommon face datums avoid duplicating either shell skin.
  for (const x of [0.16, 1.84]) add(root,
    prism(m.graphite, [0.32, 0.38, 0.17], [x, 0.19, -0.18], { chamfer: 0.07, fillet: 0.02, bevel: 0.014 }),
  )
  for (const x of [0.38, 0.62, 0.86, 1.1, 1.34, 1.58]) add(root, prism(m.steel, [0.04, 0.035, 0.22], [x, 0.138, -0.15], { chamfer: 0.008 }))
  for (const x of [0.1, 1.9]) for (const y of [0.25, 1.5, 2.75]) addFastenerZ(root, m.steel, x, y, -0.077, 0.018)
}

function indexController(controller: KitController): KitController {
  const indexedGeometries: Array<ReturnType<typeof mergeVertices>> = []
  controller.root.traverse((object) => {
    if (!(object instanceof Mesh)) return
    const indexed = mergeVertices(object.geometry, 1e-5)
    object.geometry = indexed
    indexedGeometries.push(indexed)
  })
  return {
    root: controller.root,
    update: controller.update,
    dispose: () => {
      for (const geometry of indexedGeometries) geometry.dispose()
      controller.dispose()
    },
  }
}

export function createModel(): KitController { return indexController(buildKitController('door-bay', SOCKETS, author)) }
function preview(options: { aspect: number }, view: 'beauty' | 'side' | 'rear' | 'low'): KitPreview { return makeKitPreview(options, 'door-bay', createModel, view) }
export function createPreview(options: { aspect: number }): KitPreview { return preview(options, 'beauty') }
export function createSidePreview(options: { aspect: number }): KitPreview { return preview(options, 'side') }
export function createRearPreview(options: { aspect: number }): KitPreview { return preview(options, 'rear') }
export function createLowPreview(options: { aspect: number }): KitPreview { return preview(options, 'low') }

export function createThresholdAssemblyPreview(options: { aspect: number }): KitPreview {
  return makeAssemblyPreview(options, 'door-threshold', { width: 2, depth: 0.5, height: 3 }, () => {
    const door = createModel()
    const threshold = createThresholdModel()
    const root = new Group()
    root.name = 'door-threshold compatibility assembly'
    root.add(door.root, threshold.root)
    return { root, update: () => {}, dispose: () => { door.dispose(); threshold.dispose() } }
  })
}
