import { Group, Mesh } from 'three/webgpu'
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { add, addFastenerZ, buildKitController, makeAssemblyPreview, makeKitPreview, prism, type KitSocket, type KitController, type KitPreview } from '../building-threshold/kit-shared.ts'
import { createModel as createFloorModel } from '../floor-slab-tile/model.ts'

const SOCKETS = [
  { name: 'wall_snap_left', kind: 'wall', position: [0, 1, -0.125], normal: [-1, 0, 0] },
  { name: 'wall_snap_right', kind: 'wall', position: [2, 1, -0.125], normal: [1, 0, 0] },
  { name: 'window_insert_center', kind: 'window', position: [1, 1, -0.125], normal: [0, 0, 1] },
  { name: 'sunshade_center', kind: 'dressing', position: [1, 2, -0.125], normal: [0, 1, 0] },
  { name: 'floor_snap_center', kind: 'floor', position: [1, 0, -0.125], normal: [0, -1, 0] },
  { name: 'service_access_right', kind: 'service', position: [1.75, 0.25, 0], normal: [0, 0, 1] },
  { name: 'prefab_mount_back', kind: 'window', position: [1, 1, -0.25], normal: [0, 0, -1], up: [0, 1, 0] },
] as const satisfies readonly KitSocket[]

function author(root: Group, m: Parameters<Parameters<typeof buildKitController>[2]>[1]): void {
  // Exact glazing seat: x .25..1.75 and y .30..1.70.
  add(root,
    // Jambs terminate on the .30 m sill datum; separate grounded shoes below
    // carry the load instead of duplicating a broad y=0 face.
    prism(m.shellShade, [0.25, 1.7, 0.18], [0.125, 1.15, -0.16], { chamfer: 0.07, fillet: 0.018, bevel: 0.012 }),
    prism(m.shellShade, [0.25, 1.7, 0.18], [1.875, 1.15, -0.16], { chamfer: 0.07, fillet: 0.018, bevel: 0.012 }),
    prism(m.shellShade, [1.5, 0.3, 0.18], [1, 0.15, -0.16], { chamfer: 0.065, fillet: 0.016, bevel: 0.011 }),
    prism(m.shellShade, [1.5, 0.3, 0.18], [1, 1.85, -0.16], { chamfer: 0.065, fillet: 0.016, bevel: 0.011 }),
    prism(m.edge, [1.58, 0.1, 0.09], [1, 0.26, -0.085], { chamfer: 0.035, fillet: 0.009, bevel: 0.006 }),
    prism(m.edge, [1.58, 0.1, 0.09], [1, 1.74, -0.085], { chamfer: 0.035, fillet: 0.009, bevel: 0.006 }),
    prism(m.edge, [0.1, 1.4, 0.09], [0.19, 1, -0.085], { chamfer: 0.035, fillet: 0.009, bevel: 0.006 }),
    prism(m.edge, [0.1, 1.4, 0.09], [1.81, 1, -0.085], { chamfer: 0.035, fillet: 0.009, bevel: 0.006 }),
    // The reveal is a real inset that runs beneath the four frame legs.  The
    // 10 mm keyed overlap avoids four coincident opening-boundary planes.
    // The glazing is deliberately smaller than the receiver aperture so the
    // rear and mid throat rings remain visible instead of being hidden by a
    // front-sized black plate.
    prism(m.graphite, [1.2, 1.16, 0.03], [1, 1, -0.225], { chamfer: 0.065, fillet: 0.012, bevel: 0.006 }),
    prism(m.steel, [1.44, 0.025, 0.035], [1, 0.292, -0.0175], { chamfer: 0.006 }),
    prism(m.steel, [1.44, 0.025, 0.035], [1, 1.708, -0.0175], { chamfer: 0.006 }),
    prism(m.graphite, [0.7, 0.075, 0.05], [1, 1.78, -0.04], { chamfer: 0.022 }),
    prism(m.cyan, [0.56, 0.04, 0.025], [1, 1.78, -0.0125], { chamfer: 0.01 }),
    prism(m.graphite, [1.5, 0.08, 0.08], [1, 0.255, -0.052], { chamfer: 0.018 }),
  )
  // Three mechanically nested throat depths: rear gasket, mid metal receiver,
  // and the existing proud front lip. Each ring owns a distinct Z band.
  add(root,
    prism(m.graphite, [0.075, 1.36, 0.045], [0.205, 1, -0.2175], { chamfer: 0.018, fillet: 0.005, bevel: 0.003 }),
    prism(m.graphite, [0.075, 1.36, 0.045], [1.795, 1, -0.2175], { chamfer: 0.018, fillet: 0.005, bevel: 0.003 }),
    prism(m.graphite, [1.515, 0.075, 0.045], [1, 0.285, -0.2175], { chamfer: 0.018, fillet: 0.005, bevel: 0.003 }),
    prism(m.graphite, [1.515, 0.075, 0.045], [1, 1.715, -0.2175], { chamfer: 0.018, fillet: 0.005, bevel: 0.003 }),
    prism(m.steel, [0.055, 1.39, 0.045], [0.225, 1, -0.1475], { chamfer: 0.014, fillet: 0.004, bevel: 0.003 }),
    prism(m.steel, [0.055, 1.39, 0.045], [1.775, 1, -0.1475], { chamfer: 0.014, fillet: 0.004, bevel: 0.003 }),
    prism(m.steel, [1.485, 0.055, 0.045], [1, 0.275, -0.1475], { chamfer: 0.014, fillet: 0.004, bevel: 0.003 }),
    prism(m.steel, [1.485, 0.055, 0.045], [1, 1.725, -0.1475], { chamfer: 0.014, fillet: 0.004, bevel: 0.003 }),
    prism(m.steel, [0.025, 1.38, 0.035], [0.278, 1, -0.0175], { chamfer: 0.006 }),
    prism(m.steel, [0.025, 1.38, 0.035], [1.722, 1, -0.0175], { chamfer: 0.006 }),
  )
  add(root,
    prism(m.shell, [0.3, 1.37, 0.08], [0.15, 1, -0.05], { chamfer: 0.07, fillet: 0.02, bevel: 0.013 }),
    prism(m.shell, [0.3, 1.37, 0.08], [1.85, 1, -0.05], { chamfer: 0.07, fillet: 0.02, bevel: 0.013 }),
  )
  // Deep front bezel and its narrower inner return shrink the glazing aperture
  // to the reference ratio while leaving the rear glass visibly recessed.
  add(root,
    prism(m.edge, [0.1, 1.24, 0.08], [0.36, 1, -0.12], { chamfer: 0.028, fillet: 0.008, bevel: 0.005 }),
    prism(m.edge, [0.1, 1.24, 0.08], [1.64, 1, -0.12], { chamfer: 0.028, fillet: 0.008, bevel: 0.005 }),
    prism(m.edge, [1.28, 0.12, 0.08], [1, 0.37, -0.12], { chamfer: 0.032, fillet: 0.009, bevel: 0.006 }),
    prism(m.edge, [1.28, 0.12, 0.08], [1, 1.63, -0.12], { chamfer: 0.032, fillet: 0.009, bevel: 0.006 }),
    prism(m.graphite, [0.06, 1.16, 0.06], [0.42, 1, -0.18], { chamfer: 0.018, fillet: 0.005, bevel: 0.003 }),
    prism(m.graphite, [0.06, 1.16, 0.06], [1.58, 1, -0.18], { chamfer: 0.018, fillet: 0.005, bevel: 0.003 }),
    prism(m.graphite, [1.16, 0.06, 0.06], [1, 0.42, -0.18], { chamfer: 0.02, fillet: 0.006, bevel: 0.004 }),
    prism(m.graphite, [1.16, 0.06, 0.06], [1, 1.58, -0.18], { chamfer: 0.02, fillet: 0.006, bevel: 0.004 }),
  )
  for (const y of [0.52, 1.02, 1.52]) for (const x of [0.03, 1.97]) {
    add(root,
      prism(m.edge, [0.055, 0.2, 0.16], [x, y, -0.125], { chamfer: 0.016, fillet: 0.006, bevel: 0.004 }),
      prism(m.cyan, [0.014, 0.1, 0.012], [x < 1 ? 0.012 : 1.988, y, -0.125], { chamfer: 0.004 }),
    )
  }
  add(root,
    prism(m.shell, [0.57, 0.32, 0.07], [0.305, 1.81, -0.055], { chamfer: 0.052, fillet: 0.015, bevel: 0.01 }),
    prism(m.shell, [0.78, 0.32, 0.07], [1, 1.81, -0.055], { chamfer: 0.052, fillet: 0.015, bevel: 0.01 }),
    prism(m.shell, [0.57, 0.32, 0.07], [1.695, 1.81, -0.055], { chamfer: 0.052, fillet: 0.015, bevel: 0.01 }),
  )
  // Captured front service housings expose the cyan interface landmarks in the
  // hero view while remaining physically embedded in the white piers.
  for (const x of [0.13, 1.87]) for (const y of [0.62, 1, 1.38]) add(root,
    prism(m.edge, [0.12, 0.22, 0.018], [x, y, -0.013], { chamfer: 0.024, fillet: 0.007, bevel: 0.005 }),
    prism(m.cyan, [0.025, 0.1, 0.008], [x, y, -0.004], { chamfer: 0.006, fillet: 0.002, bevel: 0.001 }),
  )
  // Broad corner shoes reproduce the reference's load-bearing lower shoulders
  // and meet the floor at y=0 without overlapping the central sill footprint.
  for (const x of [0.125, 1.875]) add(root,
    prism(m.edge, [0.22, 0.34, 0.14], [x < 1 ? 0.13 : 1.87, 0.17, -0.17], { chamfer: 0.055, fillet: 0.016, bevel: 0.011 }),
    prism(m.shell, [0.25, 0.38, 0.08], [x, 0.19, -0.05], { chamfer: 0.062, fillet: 0.018, bevel: 0.012 }),
  )
  add(root,
    prism(m.shell, [1.5, 0.26, 0.08], [1, 0.13, -0.05], { chamfer: 0.055, fillet: 0.016, bevel: 0.011 }),
  )
  // Recessed sill drainage/vent slots are seated on the shell, not floating
  // decoration; the small proud depth leaves their sidewalls visible.
  for (const x of [0.48, 0.63, 0.78, 0.93, 1.08, 1.23, 1.38, 1.53]) add(root,
    prism(m.grime, [0.075, 0.026, 0.008], [x, 0.18, -0.004], { chamfer: 0.006, fillet: 0.002, bevel: 0.001 }),
  )
  for (const x of [0.125, 1.875]) for (const y of [0.18, 1, 1.82]) addFastenerZ(root, m.steel, x, y, -0.081, 0.017)
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

export function createModel(): KitController { return indexController(buildKitController('window-bay', SOCKETS, author)) }
function preview(options: { aspect: number }, view: 'beauty' | 'side' | 'rear' | 'low'): KitPreview { return makeKitPreview(options, 'window-bay', createModel, view) }
export function createPreview(options: { aspect: number }): KitPreview { return preview(options, 'beauty') }
export function createSidePreview(options: { aspect: number }): KitPreview { return preview(options, 'side') }
export function createRearPreview(options: { aspect: number }): KitPreview { return preview(options, 'rear') }
export function createLowPreview(options: { aspect: number }): KitPreview { return preview(options, 'low') }

export function createWallDatumAssemblyPreview(options: { aspect: number }): KitPreview {
  return makeAssemblyPreview(options, 'window-wall-datum', { width: 2, depth: 2, height: 2.2 }, () => {
    const floor = createFloorModel()
    const window = createModel()
    window.root.position.set(0, 0.2, -1.75)
    const root = new Group()
    root.name = 'window-wall-datum compatibility assembly'
    root.add(floor.root, window.root)
    return { root, update: () => {}, dispose: () => { floor.dispose(); window.dispose() } }
  })
}
