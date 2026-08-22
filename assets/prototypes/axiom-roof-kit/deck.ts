import type { Group, Mesh, MeshPhysicalMaterial } from 'three/webgpu'

import { cylinder, prism, type Vec3 } from '../../../src/asset-forge/generator/index.ts'
import { ROOF } from './index.ts'
import type { KitMaterials } from '../axiom-modular-kit/parts.ts'

/** The one primitive the group builds everything from. */
export function block(
  parent: Group,
  material: MeshPhysicalMaterial,
  size: Vec3,
  position: Vec3,
  rotation?: Vec3,
): Mesh {
  const smallest = Math.min(...size)
  const mesh = prism(material, size, position, {
    chamfer: Math.min(0.06, smallest * 0.24),
    fillet: Math.min(0.018, smallest * 0.1),
    bevel: Math.min(0.016, smallest * 0.13),
    ...(rotation ? { rotation } : {}),
  })
  parent.add(mesh)
  return mesh
}

/**
 * A roof deck: the slab, its membrane, and the bay joints in it.
 *
 * The membrane is a separate 12 mm layer rather than a colour on the slab,
 * because every other module in the group has to *penetrate* it — a curb, a
 * post base, an outlet — and a penetration through a painted-on membrane has
 * nothing to flash against.
 */
export function deck(parent: Group, m: KitMaterials, width: number, depth: number): void {
  block(parent, m.graphite, [width, ROOF.deck, depth], [0, -ROOF.deck * 0.5, 0])
  block(parent, m.deck, [width - 0.04, 0.012, depth - 0.04], [0, -0.006, 0])
  // Bay joints on the structural grid, in both directions.
  for (const [along, across] of [[width, depth], [depth, width]] as const) {
    const bays = Math.max(1, Math.round(along / ROOF.grid))
    for (let index = 1; index < bays; index += 1) {
      const offset = -along / 2 + (index / bays) * along
      const size: Vec3 = along === width ? [0.05, 0.016, across - 0.08] : [across - 0.08, 0.016, 0.05]
      const position: Vec3 = along === width ? [offset, -0.004, 0] : [0, -0.004, offset]
      block(parent, m.ink, size, position)
    }
  }
}

/**
 * A curb: the raised upstand every roof penetration sits on.
 *
 * Nothing on an Axiom roof is bolted flat to the deck. A curb lifts the fitting
 * clear of standing water and gives the membrane something to turn up against,
 * and the counter-flashing over it is what actually keeps the water out. Fittings
 * drawn sitting directly on the deck are the single clearest sign a roof was
 * modelled rather than built.
 */
export function curb(parent: Group, m: KitMaterials, width: number, depth: number, height = 0.28, centre: Vec3 = [0, 0, 0]): void {
  const [cx, , cz] = centre
  block(parent, m.graphite, [width, height, depth], [cx, height * 0.5, cz])
  block(parent, m.shell, [width + 0.06, 0.05, depth + 0.06], [cx, height + 0.02, cz])
  // Membrane turn-up: the reason the curb exists, drawn as the thing it is.
  block(parent, m.ink, [width + 0.09, 0.09, depth + 0.09], [cx, 0.045, cz])
}

/**
 * A rainwater outlet: sump, grating, and the fall lines that feed it. The one
 * part of a roof that explains where the water goes.
 */
export function outlet(parent: Group, m: KitMaterials, centre: Vec3): void {
  const [cx, , cz] = centre
  block(parent, m.ink, [0.42, 0.09, 0.42], [cx, -0.04, cz])
  block(parent, m.porcelain, [0.3, 0.03, 0.3], [cx, -0.005, cz])
  for (let index = 0; index < 4; index += 1) {
    block(parent, m.ink, [0.26, 0.02, 0.028], [cx, 0.006, cz - 0.09 + index * 0.06])
  }
  parent.add(cylinder(m.graphite, 0.13, 0.34, [cx, -ROOF.deck - 0.1, cz], [0, 0, 0], 12))
}

/** Parapet: the upstand around a deck edge, with its coping and drip. */
export function parapet(
  parent: Group,
  m: KitMaterials,
  width: number,
  depth: number,
  height = ROOF.parapet,
  sides: readonly ('front' | 'back' | 'left' | 'right')[] = ['front', 'back', 'left', 'right'],
): void {
  const t = 0.18
  const run = (size: Vec3, position: Vec3): void => {
    block(parent, m.graphite, size, [position[0], height * 0.5, position[2]])
    // Coping in the light tier, not another shade of the wall under it.
    //
    // The whole roof group was built from graphite, ink, steel and deck — 97
    // uses against 5 from the light tier — so ten models came out as one flat
    // value and the batch read as grey slabs. A coping is capping metal and is
    // genuinely lighter than the upstand; making it so gives every parapet in
    // the group a horizontal highlight to read against the sky.
    block(parent, m.porcelain, [size[0] + 0.1, 0.09, size[2] + 0.1], [position[0], height + 0.045, position[2]])
    block(parent, m.ink, [size[0] + 0.04, 0.1, size[2] + 0.04], [position[0], 0.05, position[2]])
  }
  if (sides.includes('front')) run([width, height, t], [0, 0, depth / 2 - t / 2])
  if (sides.includes('back')) run([width, height, t], [0, 0, -depth / 2 + t / 2])
  if (sides.includes('left')) run([t, height, depth - t * 2], [-width / 2 + t / 2, 0, 0])
  if (sides.includes('right')) run([t, height, depth - t * 2], [width / 2 - t / 2, 0, 0])
}
