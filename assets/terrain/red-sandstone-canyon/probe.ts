/**
 * Field probe. Reports fold safety, bed representability and an ASCII section
 * through the mass, so the recipe can be judged before a 70s compile is spent on
 * it. Run: node --import tsx assets/terrain/red-sandstone-canyon/probe.ts
 */
import {
  DOMAIN_TO_METRES_X,
  bedBudget,
  bedCount,
  bedHardness,
  fieldDiagnostics,
  formationOf,
  jointCount,
  massSdf,
  octaveBudget,
  surfaceSdf,
} from './field.ts'

const LOD0_CELLS = Number(process.env.LOD0_CELLS ?? 52)

for (const seed of [1, 5, 8]) {
  const budget = octaveBudget(LOD0_CELLS)
  const beds = bedBudget(seed, LOD0_CELLS)
  const diagnostics = fieldDiagnostics(seed, budget.minimumWavelength)
  console.log(JSON.stringify({
    seed,
    formation: formationOf(seed),
    beds: bedCount(seed),
    joints: jointCount(seed),
    thinnestBedVoxels: +beds.thinnestBedVoxels.toFixed(2),
    thinnestBedCm: +(beds.thinnestBedDomain * DOMAIN_TO_METRES_X * 100).toFixed(1),
    bedsRepresentable: beds.representable,
    bands: budget.bands,
    bakeOnly: budget.bakeOnly,
    peakDisplacementCm: +(diagnostics.peakDisplacement * DOMAIN_TO_METRES_X * 100).toFixed(2),
    meanBandGradient: +diagnostics.meanNearSurfaceGradient.toFixed(3),
    maxBandGradient: +diagnostics.maximumNearSurfaceGradient.toFixed(3),
    foldedFraction: +diagnostics.foldedFraction.toFixed(4),
    meanFieldGradient: +diagnostics.meanFieldGradient.toFixed(3),
    maxFieldGradient: +diagnostics.maximumFieldGradient.toFixed(3),
  }))
}

// Vertical section through x=0 for the wall seed: the stack has to be legible
// here or no amount of banding in the material will rescue it.
const seed = 1
const rows = 46
const columns = 74
let section = ''
for (let row = 0; row < rows; row += 1) {
  const y = 1 - (row / (rows - 1)) * 2
  let line = ''
  for (let column = 0; column < columns; column += 1) {
    const z = -1 + (column / (columns - 1)) * 2
    const inside = surfaceSdf(0.12, y, z, seed, 0) < 0
    if (!inside) { line += ' '; continue }
    const hardness = bedHardness(0.12, y, z, seed)
    line += hardness > 0.7 ? '#' : hardness > 0.35 ? '+' : '.'
  }
  section += `${line}\n`
}
console.log('\nsection through x=0.12 (# hard bed, + medium, . soft), z across, y down:')
console.log(section)

// Plan section at a hard bed and at a soft bed, to confirm the inset is visible.
for (const [label, y] of [['hard', 0], ['soft', 0]] as const) void label, y
let plan = ''
const hardY = (() => {
  for (let step = 0; step <= 200; step += 1) {
    const y = -0.9 + (step / 200) * 1.8
    if (bedHardness(0, y, 0, seed) > 0.75 && massSdf(0, y, 0, seed) < 0) return y
  }
  return 0
})()
const softY = (() => {
  for (let step = 0; step <= 200; step += 1) {
    const y = -0.9 + (step / 200) * 1.8
    if (bedHardness(0, y, 0, seed) < 0.2 && massSdf(0, y, 0, seed) < 0) return y
  }
  return 0
})()
for (let row = 0; row < 24; row += 1) {
  const z = -1 + (row / 23) * 2
  let line = ''
  for (let column = 0; column < columns; column += 1) {
    const x = -1 + (column / (columns - 1)) * 2
    const hard = massSdf(x, hardY, z, seed) < 0
    const soft = massSdf(x, softY, z, seed) < 0
    line += hard && soft ? '#' : hard ? 'H' : soft ? 's' : ' '
  }
  plan += `${line}\n`
}
console.log(`plan overlay, hard bed y=${hardY.toFixed(2)} vs soft bed y=${softY.toFixed(2)}`)
console.log('(# both, H hard only = the protruding ledge, s soft only)')
console.log(plan)
