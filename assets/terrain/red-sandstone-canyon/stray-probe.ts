/**
 * Locate detached shells rather than guessing at them. Reports the size and
 * bounding box of every component beyond the largest, plus where charts fragment.
 * Run: node --import tsx assets/terrain/red-sandstone-canyon/stray-probe.ts
 */
import { extractDenseSurface } from '../shared/dual-contour.ts'
import { unwrap } from '../shared/unwrap.ts'
import { canyonMeshField } from './field.ts'

const cells = Number(process.env.CELLS ?? 96)
const seed = Number(process.env.CANYON_SEED ?? 1)
const surface = extractDenseSurface({ field: canyonMeshField, seed, cells })

const triangleCount = surface.indices.length / 3
const edgeTriangles = new Map<number, number[]>()
for (let triangle = 0; triangle < triangleCount; triangle += 1) {
  for (let edge = 0; edge < 3; edge += 1) {
    const a = surface.indices[triangle * 3 + edge]!
    const b = surface.indices[triangle * 3 + ((edge + 1) % 3)]!
    const key = a < b ? a * 4294967 + b : b * 4294967 + a
    const bucket = edgeTriangles.get(key)
    if (bucket) bucket.push(triangle)
    else edgeTriangles.set(key, [triangle])
  }
}

const component = new Int32Array(triangleCount).fill(-1)
interface Shell { size: number; minY: number; maxY: number; minX: number; maxX: number; minZ: number; maxZ: number }
const shells: Shell[] = []
for (let start = 0; start < triangleCount; start += 1) {
  if (component[start] !== -1) continue
  const label = shells.length
  const shell: Shell = {
    size: 0,
    minY: Infinity, maxY: -Infinity,
    minX: Infinity, maxX: -Infinity,
    minZ: Infinity, maxZ: -Infinity,
  }
  const queue = [start]
  component[start] = label
  let cursor = 0
  while (cursor < queue.length) {
    const current = queue[cursor]!
    cursor += 1
    shell.size += 1
    for (let corner = 0; corner < 3; corner += 1) {
      const vertex = surface.indices[current * 3 + corner]!
      const x = surface.positions[vertex * 3]!
      const y = surface.positions[vertex * 3 + 1]!
      const z = surface.positions[vertex * 3 + 2]!
      if (x < shell.minX) shell.minX = x
      if (x > shell.maxX) shell.maxX = x
      if (y < shell.minY) shell.minY = y
      if (y > shell.maxY) shell.maxY = y
      if (z < shell.minZ) shell.minZ = z
      if (z > shell.maxZ) shell.maxZ = z
    }
    for (let edge = 0; edge < 3; edge += 1) {
      const a = surface.indices[current * 3 + edge]!
      const b = surface.indices[current * 3 + ((edge + 1) % 3)]!
      const key = a < b ? a * 4294967 + b : b * 4294967 + a
      for (const neighbor of edgeTriangles.get(key) ?? []) {
        if (component[neighbor] !== -1) continue
        component[neighbor] = label
        queue.push(neighbor)
      }
    }
  }
  shells.push(shell)
}
shells.sort((left, right) => right.size - left.size)
const strays = shells.slice(1)
const round = (value: number) => +value.toFixed(2)

console.log(JSON.stringify({
  cells,
  seed,
  triangles: triangleCount,
  components: shells.length,
  largest: shells[0]?.size,
  strayTriangles: strays.reduce((total, shell) => total + shell.size, 0),
  strayFraction: +(strays.reduce((total, shell) => total + shell.size, 0) / triangleCount).toFixed(4),
  straySizeHistogram: {
    '1-2': strays.filter((shell) => shell.size <= 2).length,
    '3-10': strays.filter((shell) => shell.size > 2 && shell.size <= 10).length,
    '11-50': strays.filter((shell) => shell.size > 10 && shell.size <= 50).length,
    '51+': strays.filter((shell) => shell.size > 50).length,
  },
  biggestStrays: strays.slice(0, 6).map((shell) => ({
    size: shell.size,
    x: [round(shell.minX), round(shell.maxX)],
    y: [round(shell.minY), round(shell.maxY)],
    z: [round(shell.minZ), round(shell.maxZ)],
  })),
}, null, 2))

// Where in Y do strays concentrate? If they cluster at bed boundaries the cause
// is lip detachment; if they spread evenly it is the displacement bands.
const buckets = new Array(20).fill(0)
for (const shell of strays) {
  const centre = (shell.minY + shell.maxY) / 2
  const bucket = Math.max(0, Math.min(19, Math.floor(((centre + 1) / 2) * 20)))
  buckets[bucket] += shell.size
}
console.log('stray triangles by Y band (y=-1 first):')
buckets.forEach((count, index) => {
  const y = -1 + (index / 20) * 2
  console.log(`  y ${y.toFixed(2)}..${(y + 0.1).toFixed(2)}: ${'#'.repeat(Math.min(60, Math.ceil(count / 20)))} ${count}`)
})

// Chart fragmentation at the shipped grid.
const reduced = {
  positions: surface.positions,
  vertexCount: surface.vertexCount,
  indices: surface.indices,
  normals: surface.normals,
}
for (const mode of ['axis', 'cone'] as const) {
  const result = unwrap(reduced, { atlasSize: 1024, padding: 6, mode })
  const sizes = new Map<number, number>()
  for (let index = 0; index < result.indices.length; index += 3) void index
  console.log(`${mode}: charts=${result.chartCount} packing=${result.packingEfficiency.toFixed(3)}`)
  void sizes
}
