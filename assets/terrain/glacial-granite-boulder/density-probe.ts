import { compileAssetFor, materializePositions } from './topology.ts'

// World surface area of LOD0 under a given non-uniform instance scale.
function worldArea(positions: Float32Array, indices: Uint32Array, scale: [number, number, number]): number {
  let total = 0
  for (let o = 0; o < indices.length; o += 3) {
    const a = indices[o]!, b = indices[o + 1]!, c = indices[o + 2]!
    const ax = positions[a * 3]! * scale[0], ay = positions[a * 3 + 1]! * scale[1], az = positions[a * 3 + 2]! * scale[2]
    const abx = positions[b * 3]! * scale[0] - ax, aby = positions[b * 3 + 1]! * scale[1] - ay, abz = positions[b * 3 + 2]! * scale[2] - az
    const acx = positions[c * 3]! * scale[0] - ax, acy = positions[c * 3 + 1]! * scale[1] - ay, acz = positions[c * 3 + 2]! * scale[2] - az
    const x = aby * acz - abz * acy, y = abz * acx - abx * acz, z = abx * acy - aby * acx
    total += Math.sqrt(x * x + y * y + z * z) * 0.5
  }
  return total
}

const cases = [
  { label: 'rear wall (bg 256)', seed: 5, cells: 128, atlas: 256, scale: [2.2, 3.1, 1.9] as [number,number,number] },
  { label: 'rear wall (bg 256)', seed: 2, cells: 128, atlas: 256, scale: [1.8, 2.4, 1.8] as [number,number,number] },
  { label: 'hero terrace (512)', seed: 1, cells: 192, atlas: 512, scale: [1.25, 1.15, 1.2] as [number,number,number] },
  { label: 'scree      (bg 256)', seed: 2, cells: 128, atlas: 256, scale: [0.5, 0.42, 0.46] as [number,number,number] },
  { label: 'small scree(bg 256)', seed: 6, cells: 128, atlas: 256, scale: [0.22, 0.18, 0.21] as [number,number,number] },
]

console.log('instance                area m^2   texels    texels/m^2   mm per texel')
for (const c of cases) {
  const a = compileAssetFor(c.seed, c.cells, c.atlas)
  const pos = materializePositions(a.topology, c.seed)
  const area = worldArea(pos, a.topology.indices, c.scale)
  const texels = a.stats.bakeCoverage * c.atlas * c.atlas
  const perM2 = texels / area
  const mm = Math.sqrt(1 / perM2) * 1000
  console.log(`${c.label}  seed${c.seed}  ${area.toFixed(1).padStart(7)}  ${texels.toFixed(0).padStart(7)}  ${perM2.toFixed(0).padStart(10)}  ${mm.toFixed(1).padStart(8)}`)
}
