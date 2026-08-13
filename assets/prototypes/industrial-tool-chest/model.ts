import { Group, Object3D } from 'three/webgpu'

import { cylinder } from '../../../src/asset-forge/generator/index.ts'
import {
  AXIS_X,
  AXIS_Z,
  acquireCargoMaterials,
  addLabelDecal,
  bolt,
  box,
  cavityLiner,
  createCargoPreview,
  finishModel,
  paintMark,
  plaque,
  seam,
  slashProfile,
  socket,
  statusLens,
  toggleLatch,
  type CargoMaterialBundle,
  type CargoMaterials,
  type CargoPreview,
  type CargoPreviewOptions,
} from '../axiom-cargo-kit/index.ts'

/**
 * Axiom Relay bench tool chest — a lift-lid top box with three shallow drawers.
 *
 * The bench-top member of the storage family. It is deliberately *not* a
 * shrunken equipment chest: the lid lifts instead of the front opening, the
 * drawers are shallow and full-width, the whole thing has a carry handle on each
 * end, and it has feet rather than a plinth because it lives on a workbench.
 *
 * The open lid reveals a real tray, which is what a top box is for.
 */

const WIDTH = 0.66
const DEPTH = 0.32
const DRAWER = 0.075
const LID = 0.15

interface ToolChestSockets {
  lid_hinge: Object3D
  tray: Object3D
  drawer_top: Object3D
}

export type ToolChestState = 'closed' | 'open'

export interface ToolChestController {
  root: Group
  parts: { body: Group; lid: Group }
  sockets: ToolChestSockets
  readonly state: ToolChestState
  setState(state: ToolChestState): ToolChestState
  update(deltaSeconds: number): void
  dispose(): void
}

const DRAWERS = 3
const BODY_H = DRAWER * DRAWERS + 0.03
const TRAY = 0.09
/**
 * Hinge line, behind the lid's own back face.
 *
 * The lid box is offset forward by the amount the group is set back, so the
 * closed chest is unchanged and the pin becomes the axis the leaf turns about
 * rather than a rod drawn inside it, where it appeared in no frame.
 */
const LID_PIVOT = DEPTH * 0.5 + 0.019

function bodyBuild(body: Group, m: CargoMaterials, bundle: CargoMaterialBundle): void {
  const foot = 0.022
  const wall = 0.018
  const trayFloor = foot + BODY_H + 0.01
  const lidLine = foot + BODY_H + TRAY
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      box(body, m.rubber, [0.07, foot, 0.07], [
        sx * (WIDTH * 0.5 - 0.05), foot * 0.5, sz * (DEPTH * 0.5 - 0.05),
      ], { chamfer: 0.018, fillet: 0.007, bevel: 0.005 })
    }
  }
  // Carcass: sides, back, and a top rail; the front is open for the drawers.
  for (const sx of [-1, 1]) {
    box(body, m.shell, [0.03, BODY_H + TRAY, DEPTH], [sx * (WIDTH * 0.5 - 0.015), foot + (BODY_H + TRAY) * 0.5, 0], {
      chamfer: 0.026, fillet: 0.01, bevel: 0.009,
    })
  }
  box(body, m.shell, [WIDTH, BODY_H + TRAY, 0.03], [0, foot + (BODY_H + TRAY) * 0.5, -(DEPTH * 0.5 - 0.015)], {
    chamfer: 0.026, fillet: 0.01, bevel: 0.009,
  })
  // The bank the drawer fronts stand on. With nothing behind them the 8 mm gaps
  // between the fronts and the 26 mm band above the top one looked straight
  // through the chest at the backdrop, and so did the whole underside.
  box(body, m.ink, [WIDTH - 0.06, trayFloor - wall - foot, DEPTH - 0.02], [0, (foot + trayFloor - wall) * 0.5, 0], {
    chamfer: 0.02, fillet: 0.008, bevel: 0.006,
  })
  // Open tray above the drawer stack, with a divider. Five faces round a void:
  // as one solid block it contained both the divider and the clip strip, and a
  // lifted lid revealed neither.
  cavityLiner(body, m.ink, [WIDTH - 0.07, lidLine - trayFloor, DEPTH - 0.05], [0, (trayFloor + lidLine) * 0.5, 0], wall, 'top')
  // The tray's front wall is its lining, not the chest's face. The apron in
  // front of it carries the graphics and lands flush with the drawer fronts.
  box(body, m.shell, [WIDTH - 0.06, lidLine - trayFloor, 0.026], [0, (trayFloor + lidLine) * 0.5, DEPTH * 0.5 - 0.008], {
    chamfer: 0.014, fillet: 0.006, bevel: 0.005,
  })
  box(body, m.shellShade, [0.02, TRAY - 0.03, DEPTH - 0.08], [WIDTH * 0.18, trayFloor + (TRAY - 0.03) * 0.5 - 0.004, 0], {
    chamfer: 0.006, fillet: 0.003, bevel: 0.003,
  })
  box(body, m.graphiteEdge, [0.12, 0.03, 0.05], [-WIDTH * 0.2, trayFloor + 0.013, 0.02], {
    chamfer: 0.012, fillet: 0.005, bevel: 0.004,
  })

  // Drawer fronts. Shallow and full width, with a lipped pull along the top.
  const drawerFace = DEPTH * 0.5 + 0.005
  for (let index = 0; index < DRAWERS; index += 1) {
    const y = foot + DRAWER * (index + 0.5)
    box(body, m.shell, [WIDTH - 0.06, DRAWER - 0.008, 0.026], [0, y, DEPTH * 0.5 - 0.008], {
      chamfer: 0.014, fillet: 0.006, bevel: 0.005,
    })
    box(body, m.ink, [WIDTH - 0.16, DRAWER * 0.36, 0.018], [0, y + DRAWER * 0.22, DEPTH * 0.5 + 0.008], {
      chamfer: 0.008, fillet: 0.004, bevel: 0.003,
    })
    // On the front itself. Set at the drawer's own bottom edge the groove sat in
    // the gap below it, with no host under any part of its length.
    seam(body, m.shellLight, WIDTH - 0.1, [0, y - DRAWER * 0.34, drawerFace], 'front', 'across', 0.012, 0.008)
  }

  // Carry handles, one per end. The bar spans its two brackets, so its axis is
  // the axis they are separated along: on AXIS_X it ran fore and aft down the
  // centreline, 53 mm clear of both of them.
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      box(body, m.graphiteEdge, [0.075, 0.04, 0.04], [
        sx * (WIDTH * 0.5 + 0.005), foot + BODY_H * 0.6, sz * 0.07,
      ], { chamfer: 0.01, fillet: 0.004, bevel: 0.004 })
    }
    body.add(cylinder(m.rubber, 0.017, 0.16, [sx * (WIDTH * 0.5 + 0.03), foot + BODY_H * 0.6, 0], AXIS_Z, 8))
  }

  // Both graphics sit in the clear span between the two latches; the label used
  // to run under the left one, over what was then an open front.
  const label = addLabelDecal(bundle, { variant: 280 })
  const bandY = (trayFloor + lidLine) * 0.5
  plaque(body, m, label, [0.18, 0.03], [-0.04, bandY, drawerFace], 'front', m.shellLight)
  statusLens(body, m, [0.04, 0.016], [0.11, bandY, drawerFace], m.cyan, 'front')
  paintMark(body, m.amberPaint, slashProfile(0.028, 0.04, 0.45), [WIDTH * 0.415, foot + DRAWER * 0.5, drawerFace], 'front', 0.007)
  for (const sx of [-1, 1]) bolt(body, m.steel, [sx * (WIDTH * 0.5 - 0.05), foot + 0.02, -DEPTH * 0.5], 0.011, 'back')
}

function lidBuild(lid: Group, m: CargoMaterials): void {
  box(lid, m.shellLight, [WIDTH + 0.01, LID, DEPTH + 0.01], [0, LID * 0.5, LID_PIVOT], {
    chamfer: 0.04, fillet: 0.014, bevel: 0.012, capChamfer: 0.026,
  })
  box(lid, m.ink, [WIDTH - 0.14, 0.018, DEPTH - 0.1], [0, LID - 0.004, LID_PIVOT], {
    chamfer: 0.03, fillet: 0.011, bevel: 0.007,
  })
  box(lid, m.shellShade, [WIDTH - 0.2, 0.014, DEPTH - 0.14], [0, LID + 0.003, LID_PIVOT], {
    chamfer: 0.026, fillet: 0.01, bevel: 0.006,
  })
  // The underside is the face an open lid shows, so it gets a tool clip strip.
  box(lid, m.graphiteEdge, [WIDTH - 0.16, 0.012, 0.05], [0, 0.004, LID_PIVOT], {
    chamfer: 0.008, fillet: 0.004, bevel: 0.003,
  })
  for (const sx of [-1, 1]) {
    // Clips hang off the strip rather than sitting level with the skin it is
    // fixed to, where the whole run was inside the leaf.
    lid.add(cylinder(m.steel, 0.012, 0.09, [sx * 0.16, -0.006, LID_PIVOT], AXIS_X, 6))
    lid.add(cylinder(m.steel, 0.014, 0.1, [sx * 0.2, 0, 0], AXIS_X, 8))
  }
}

function build(): { root: Group; body: Group; lid: Group; sockets: ToolChestSockets; bundle: CargoMaterialBundle } {
  const bundle = acquireCargoMaterials(61_000, { condition: 0.7 })
  const m = bundle.materials

  const root = new Group()
  root.name = 'AXR_INDUSTRIAL_TOOL-CHEST_ROOT_CLOSED'
  const body = new Group()
  body.name = 'AXR_INDUSTRIAL_TOOL-CHEST_PART_BODY_DEFAULT'
  const lid = new Group()
  lid.name = 'AXR_INDUSTRIAL_TOOL-CHEST_PART_LID_CLOSED'
  root.add(body, lid)

  bodyBuild(body, m, bundle)
  const top = 0.022 + BODY_H + TRAY
  lid.position.set(0, top, -LID_PIVOT)
  lidBuild(lid, m)
  for (const x of [-WIDTH * 0.28, WIDTH * 0.28]) {
    toggleLatch(body, m, [x, top - 0.02, DEPTH * 0.5 + 0.005], 0.42, 'front')
  }

  const sockets: ToolChestSockets = {
    lid_hinge: socket('lid_hinge', [0, top, -LID_PIVOT]),
    tray: socket('tray', [0, 0.022 + BODY_H + 0.03, 0]),
    drawer_top: socket('drawer_top', [0, 0.022 + DRAWER * 2.5, DEPTH * 0.5 + 0.06]),
  }
  return { root, body, lid, sockets, bundle }
}

export function createModel(): ToolChestController {
  const { root, body, lid, sockets, bundle } = build()
  const finished = finishModel(root, bundle, {
    name: 'industrial-tool-chest',
    assemblies: [lid],
    reach: 0.08,
    sockets: Object.values(sockets),
  })

  let state: ToolChestState = 'closed'
  let blend = 0
  let elapsed = 0
  const applyBlend = (): void => {
    lid.rotation.x = -blend * 1.68
    lid.name = blend > 0.02
      ? 'AXR_INDUSTRIAL_TOOL-CHEST_PART_LID_OPEN'
      : 'AXR_INDUSTRIAL_TOOL-CHEST_PART_LID_CLOSED'
  }

  return {
    root,
    parts: { body, lid },
    sockets,
    get state() {
      return state
    },
    setState: (next: ToolChestState) => {
      state = next
      root.name = next === 'open'
        ? 'AXR_INDUSTRIAL_TOOL-CHEST_ROOT_OPEN'
        : 'AXR_INDUSTRIAL_TOOL-CHEST_ROOT_CLOSED'
      blend = next === 'open' ? 1 : 0
      applyBlend()
      return state
    },
    update: (deltaSeconds: number) => {
      const step = Math.min(Math.max(deltaSeconds, 0), 0.05)
      elapsed += step
      const target = state === 'open' ? 1 : 0
      if (Math.abs(target - blend) > 1e-4) {
        blend += Math.sign(target - blend) * Math.min(Math.abs(target - blend), step * 1.3)
        applyBlend()
      }
      bundle.materials.cyan.emissiveIntensity = 1.6 + Math.sin(elapsed * 2.1) * 0.2
    },
    dispose: finished.dispose,
  }
}

function preview(options: CargoPreviewOptions & { state?: ToolChestState } = {}): CargoPreview {
  const model = createModel()
  model.setState(options.state ?? 'closed')
  return createCargoPreview(model, {
    target: [0, 0.2, 0],
    distance: 1.8,
    yaw: 0.76,
    pitch: 0.32,
    fov: 30,
    ...options,
  })
}

export const createPreview = (options: CargoPreviewOptions = {}): CargoPreview => preview(options)
export const createOpenPreview = (options: CargoPreviewOptions = {}): CargoPreview =>
  preview({ ...options, state: 'open' })
