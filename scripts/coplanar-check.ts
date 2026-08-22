/**
 * Coincident-face check ("tearing").
 *
 * Parts here are interpenetrating solids, so overlap is normal. Two faces on
 * exactly the SAME PLANE facing the SAME WAY are not: the depth buffer cannot
 * order two surfaces at one depth, so the winner is decided per pixel by
 * floating-point noise and the overlap shimmers as the camera moves. At a
 * distance that reads as a broken shader rather than a modelling mistake, which
 * is why it survives a resemblance critique, and a still frame can hide it.
 *
 * Only the VISIBLE part of a shared patch can tear. Roughly half of every model
 * is sealed inside another solid, where a shared plane sits behind an opaque
 * surface from every direction and is never rasterised. So each patch is
 * sampled, each sample nudged along the facing normal, and samples landing
 * inside a third part are dropped; what is reported is the area left. An
 * occluder must contain a sample by a real margin, so the test errs toward
 * reporting — rounded parts over-claim their bounding box, and that margin is
 * what stops the over-claim from hiding a real fault.
 *
 * To fix, separate the two surfaces: a proud part goes 0.02-0.03 further out, a
 * lapping part 0.01-0.02 further in, a marking sinks its base into its host.
 * Flush is the bug, not the fix.
 *
 * Usage:  node --import tsx scripts/coplanar-check.ts <model-id> [more-ids...]
 *         node --import tsx scripts/coplanar-check.ts --all
 * Exits 1 if any pair exceeds --max-area (default 0.02 m2).
 */
import { readdirSync } from 'node:fs'
import { Box3, Group, Mesh } from 'three/webgpu'

const EPS = 1e-4
const AXES = ['x', 'y', 'z'] as const
type Axis = (typeof AXES)[number]

const argv = process.argv.slice(2)
const maxAreaArg = argv.findIndex((a) => a === '--max-area')
const MAX_AREA = maxAreaArg >= 0 ? Number(argv[maxAreaArg + 1]) : 0.02
const ids = argv[0] === '--all'
  ? readdirSync('assets/prototypes', { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name)
  : argv.filter((a) => !a.startsWith('--') && a !== String(MAX_AREA))

if (ids.length === 0) {
  console.error('usage: coplanar-check.ts <model-id> [...] | --all   [--max-area 0.02]')
  process.exit(2)
}

// Record every mesh as it is added, which is BEFORE mergeStaticByMaterial folds
// them into one mesh per material. Merged meshes are skipped: their bbox is the
// whole model, so every part would look coincident with them.
const parts: Array<{ box: Box3; mat: string }> = []
const realAdd = Group.prototype.add
let capturing = false
;(Group.prototype as unknown as { add: (...o: unknown[]) => Group }).add = function (this: Group, ...objects: never[]) {
  if (capturing) {
    for (const object of objects as unknown[]) {
      if (object instanceof Mesh && !String(object.name).includes(' / ')) {
        const material = object.material as { name?: string } | undefined
        parts.push({ box: new Box3().setFromObject(object), mat: String(material?.name ?? '?') })
      }
    }
  }
  return realAdd.apply(this, objects)
}

interface Hit { area: number; total: number; axis: Axis; side: 'min' | 'max'; plane: number; at: string; a: string; b: string }

/** How far inside an occluder a sample must sit before it counts as buried. */
const BURIED_MARGIN = 0.015
/** How far along the outward normal a sample is pushed off its own plane. */
const NUDGE = 0.002

/**
 * The fraction of a shared patch that is NOT sealed inside some third solid.
 *
 * Sampled rather than solved: with fillets and chamfers in play an exact
 * boolean is the wrong tool, and a 6 x 6 grid resolves anything big enough to
 * see. Returns 1 when nothing occludes it and 0 when it is entirely buried.
 */
function visibleFraction(
  axis: Axis, plane: number, side: 'min' | 'max',
  rect: Record<string, [number, number]>,
  parts: ReadonlyArray<{ box: Box3 }>, skipA: number, skipB: number,
): number {
  const dir = side === 'max' ? 1 : -1
  const tangents = AXES.filter((o) => o !== axis)
  const N = 6
  let seen = 0
  for (let u = 0; u < N; u += 1) {
    for (let v = 0; v < N; v += 1) {
      const point: Record<string, number> = { [axis]: plane + dir * NUDGE }
      const t0 = rect[tangents[0]]
      const t1 = rect[tangents[1]]
      point[tangents[0]] = t0[0] + ((u + 0.5) / N) * (t0[1] - t0[0])
      point[tangents[1]] = t1[0] + ((v + 0.5) / N) * (t1[1] - t1[0])
      let buried = false
      for (let k = 0; k < parts.length && !buried; k += 1) {
        if (k === skipA || k === skipB) continue
        const c = parts[k].box
        buried = AXES.every((o) => point[o] >= c.min[o] + BURIED_MARGIN && point[o] <= c.max[o] - BURIED_MARGIN)
      }
      if (!buried) seen += 1
    }
  }
  return seen / (N * N)
}

let failed = false
for (const id of ids) {
  parts.length = 0
  capturing = true
  let model: { root: Group; dispose(): void }
  try {
    const mod = await import(`../assets/prototypes/${id}/model.ts`)
    model = mod.createModel()
  } catch (error) {
    capturing = false
    console.log(`\n== ${id}: SKIPPED (${(error as Error).message.split('\n')[0]})`)
    continue
  }
  capturing = false

  const hits: Hit[] = []
  for (let i = 0; i < parts.length; i += 1) {
    for (let j = i + 1; j < parts.length; j += 1) {
      const a = parts[i].box
      const b = parts[j].box
      for (const axis of AXES) {
        // A `max` face and a `min` face on one plane are back to back — each is
        // only ever seen from its own side, so that pair never tears.
        for (const side of ['min', 'max'] as const) {
          if (Math.abs(a[side][axis] - b[side][axis]) > EPS) continue
          // The underside is never in shot for a top-down camera.
          if (axis === 'y' && side === 'min') continue
          let area = 1
          let overlaps = true
          for (const other of AXES) {
            if (other === axis) continue
            const lo = Math.max(a.min[other], b.min[other])
            const hi = Math.min(a.max[other], b.max[other])
            if (hi - lo <= EPS) { overlaps = false; break }
            area *= hi - lo
          }
          if (!overlaps || area < MAX_AREA) continue
          // Only the part of the patch that is not sealed inside something else
          // can ever be rasterised, so only that part can tear.
          const rect: Record<string, [number, number]> = {}
          for (const other of AXES) {
            if (other === axis) continue
            rect[other] = [Math.max(a.min[other], b.min[other]), Math.min(a.max[other], b.max[other])]
          }
          const visible = area * visibleFraction(axis, a[side][axis], side, rect, parts, i, j)
          if (visible < MAX_AREA) continue
          // Where to LOOK: the centre of the shared patch, in model space.
          const centre = AXES.map((o) => (o === axis
            ? a[side][axis]
            : (Math.max(a.min[o], b.min[o]) + Math.min(a.max[o], b.max[o])) / 2).toFixed(2)).join(', ')
          hits.push({ area: visible, total: area, axis, side, plane: a[side][axis], at: centre, a: parts[i].mat, b: parts[j].mat })
        }
      }
    }
  }
  hits.sort((p, q) => q.area - p.area)
  const verdict = hits.length === 0 ? 'clean' : `${hits.length} FAIL`
  console.log(`\n== ${id}: ${parts.length} authored parts, ${verdict} (>= ${MAX_AREA} m2 VISIBLE)`)
  for (const h of hits.slice(0, 20)) {
    const hidden = h.total > h.area + 1e-6 ? ` (of ${h.total.toFixed(3)} shared)` : ''
    console.log(`   ${h.area.toFixed(3)} m2 visible${hidden}  ${h.axis}.${h.side}=${h.plane.toFixed(3)}  at (${h.at})  ${h.a} <-> ${h.b}`)
  }
  if (hits.length > 20) console.log(`   ... ${hits.length - 20} more`)
  if (hits.length > 0) failed = true
  model.dispose()
}

if (failed) {
  console.log('\nFIX: move one of the two surfaces by 0.01-0.03 m so they no longer share a plane.')
  console.log('     A proud part goes further OUT; a lapping part goes further IN; paint sinks INTO its host.')
  console.log('     Making them exactly flush is the bug, not the fix.')
}
process.exit(failed ? 1 : 0)
