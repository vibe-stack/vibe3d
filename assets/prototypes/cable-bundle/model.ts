import { cylinder } from '../../../src/asset-forge/generator/index.ts'
import { AXIS_X, box, type CargoPreview, type CargoPreviewOptions } from '../axiom-cargo-kit/index.ts'
import { createConsoleModel, createConsolePreview, type ConsoleModel } from '../axiom-console-kit/index.ts'

/**
 * Axiom Relay cable bundle — a dressed run on its tray.
 *
 * The dressing is the asset. Loose cable is trivial to model and reads as
 * spaghetti; a *bundle* is cable combed into parallel runs, tied at a regular
 * pitch, labelled at both ends of every tie, and turned with a radius rather
 * than a corner. That discipline is what makes an equipment room look
 * maintained instead of abandoned, and it is the difference this module exists
 * to carry.
 *
 * The minimum bend radius is why the run turns the way it does. Cable bent
 * tighter than its own radius is damaged cable, so the turn here is generous and
 * the tray under it is generous with it.
 */

const LENGTH = 1.8
const TIES = 6
const ENVELOPE = { width: LENGTH + 0.1, depth: 0.34, height: 0.24 }

export function createModel(): ConsoleModel {
  return createConsoleModel({
    id: 'cable-bundle',
    condition: 0.66,
    envelope: ENVELOPE,
    build: ({ m, part }) => {
      const run = part('bundle');

      // Tray: two side rails and the rungs between them.
      for (const side of [-1, 1] as const) {
        box(run, m.steel, [LENGTH, 0.05, 0.012], [0, 0.05, side * 0.11], { chamfer: 0.008, fillet: 0.003, bevel: 0.003 })
      }
      for (let index = 0; index < 9; index += 1) {
        box(run, m.steel, [0.022, 0.01, 0.22], [-LENGTH * 0.5 + 0.1 + index * ((LENGTH - 0.2) / 8), 0.032, 0], {
          chamfer: 0.004, fillet: 0.002, bevel: 0.002,
        })
      }
      // Tray hangers, so the run is carried rather than lying on the floor.
      for (const x of [-LENGTH * 0.32, LENGTH * 0.32]) {
        box(run, m.graphite, [0.03, 0.16, 0.03], [x, 0.13, -0.13], { chamfer: 0.008, fillet: 0.003, bevel: 0.003 })
        box(run, m.graphite, [0.03, 0.03, 0.28], [x, 0.2, 0], { chamfer: 0.008, fillet: 0.003, bevel: 0.003 })
      }

      // Combed cores: three rows of parallel runs, each row a different gauge.
      const rows = [
        { radius: 0.018, count: 5, y: 0.075, material: m.ink },
        { radius: 0.013, count: 7, y: 0.108, material: m.graphiteEdge },
        { radius: 0.009, count: 9, y: 0.132, material: m.ink },
      ] as const
      for (const row of rows) {
        for (let index = 0; index < row.count; index += 1) {
          const z = (index - (row.count - 1) / 2) * (row.radius * 2.2)
          run.add(cylinder(row.material, row.radius, LENGTH - 0.04, [0, row.y, z], AXIS_X, 8))
        }
      }

      // Ties at a regular pitch, with a label plate on each.
      for (let index = 0; index < TIES; index += 1) {
        const x = -LENGTH * 0.5 + 0.16 + index * ((LENGTH - 0.32) / (TIES - 1))
        box(run, m.webbing, [0.016, 0.115, 0.24], [x, 0.105, 0], { chamfer: 0.006, fillet: 0.003, bevel: 0.003 })
        box(run, m.shellShade, [0.01, 0.028, 0.05], [x, 0.168, 0.02], { chamfer: 0.004, fillet: 0.002, bevel: 0.002 })
      }
    },
  })
}

export function createPreview(options: CargoPreviewOptions = {}): CargoPreview {
  return createConsolePreview(createModel(), ENVELOPE, { distance: 3.1, pitch: 0.36, ...options })
}
