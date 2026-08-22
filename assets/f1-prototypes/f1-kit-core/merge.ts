// merge — the kit's "build, bake, then merge" step (modeling rule 9) and the normal-creasing that keeps
// merged hard-surface edges crisp. Every prop that batches its geometry per material slot uses these, so
// they live here rather than being copied into each model file.

import type { BufferGeometry } from 'three/webgpu'
import { MathUtils } from 'three/webgpu'
import { mergeGeometries, toCreasedNormals } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

/**
 * Strip a geometry to the exact shape `mergeGeometries` needs: non-indexed, with `position`, `normal` and
 * `uv` and nothing else. Mixing indexed and non-indexed sources, or sources with differing attribute
 * sets, is what makes `mergeGeometries` return null.
 */
export function mergeReady(geometry: BufferGeometry): BufferGeometry {
  const flat = geometry.index ? geometry.toNonIndexed() : geometry
  if (flat !== geometry) geometry.dispose()
  if (!flat.getAttribute('normal')) flat.computeVertexNormals()
  if (!flat.getAttribute('uv')) {
    const count = flat.getAttribute('position').count
    flat.setAttribute('uv', new Float32Array(count * 2) as unknown as never)
  }
  for (const name of Object.keys(flat.attributes)) {
    if (name !== 'position' && name !== 'normal' && name !== 'uv') flat.deleteAttribute(name)
  }
  flat.clearGroups()
  return flat
}

/**
 * Merge parts into one geometry, disposing every input. Throws rather than returning `mergeGeometries`'
 * silent `null`, which is otherwise invisible until the part is simply missing from the render.
 *
 * `label` identifies the batch in that error — pass something like `"f1-hose-reel: stand"`.
 */
export function mergeParts(parts: BufferGeometry[], label: string): BufferGeometry {
  const ready = parts.map(mergeReady)
  if (ready.length === 1) return ready[0]!
  const merged = mergeGeometries(ready, false)
  for (const part of ready) part.dispose()
  if (!merged) throw new Error(`mergeParts: failed to merge "${label}" (${ready.length} parts)`)
  return merged
}

/**
 * Re-shade a geometry so edges sharper than `angleDeg` stay crisp.
 *
 * `LatheGeometry` and friends smooth normals along the whole profile, which rounds square-cut grooves
 * into soft dents. `toCreasedNormals` converts an indexed input to non-indexed and does NOT dispose the
 * original, so the guard here is what stops that leak.
 */
export function creased(geometry: BufferGeometry, angleDeg = 40): BufferGeometry {
  const out = toCreasedNormals(geometry, MathUtils.degToRad(angleDeg))
  if (out !== geometry) geometry.dispose()
  return out
}
