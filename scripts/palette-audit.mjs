import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import sharp from 'sharp'

/**
 * Measures the rendered palette of every prototype preview so two waves of
 * models can be compared with numbers instead of impressions.
 *
 * Eyeballing a contact sheet reliably detects that something is off and just as
 * reliably misattributes it - a prop can read "too blue" because its albedo is
 * blue, because its own preview rig is cool, or because it is simply darker and
 * the eye reads low-value neutrals as cold. Separating value, saturation, and
 * hue makes it possible to say which.
 *
 * Usage: node scripts/palette-audit.mjs [--json]
 */

const root = resolve('.asset-forge/previews')
const prototypes = resolve('assets/prototypes')

/** Anything this dark is preview backdrop, not prop. */
const BACKDROP = 0.055

function toHsl(r, g, b) {
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const lightness = (max + min) * 0.5
  const delta = max - min
  if (delta < 1e-6) return [0, 0, lightness]
  const saturation = lightness > 0.5 ? delta / (2 - max - min) : delta / (max + min)
  let hue
  if (max === r) hue = ((g - b) / delta + (g < b ? 6 : 0)) / 6
  else if (max === g) hue = ((b - r) / delta + 2) / 6
  else hue = ((r - g) / delta + 4) / 6
  return [hue * 360, saturation, lightness]
}

async function measure(asset) {
  const file = join(root, asset, 'latest.png')
  if (!existsSync(file)) return undefined
  const { data, info } = await sharp(file).resize(256, 256, { fit: 'inside' }).raw().toBuffer({ resolveWithObject: true })
  const channels = info.channels

  let count = 0
  let sumL = 0
  let sumS = 0
  // Hue is circular, so it is averaged as a unit vector and weighted by
  // saturation - an unsaturated pixel has a hue but no opinion about it.
  let sumHx = 0
  let sumHy = 0
  let sumWeight = 0
  let bright = 0
  const values = []

  for (let i = 0; i < data.length; i += channels) {
    const r = data[i] / 255
    const g = data[i + 1] / 255
    const b = data[i + 2] / 255
    const [hue, saturation, lightness] = toHsl(r, g, b)
    if (lightness < BACKDROP) continue
    count += 1
    sumL += lightness
    sumS += saturation
    values.push(lightness)
    if (lightness > 0.72) bright += 1
    const radians = (hue * Math.PI) / 180
    sumHx += Math.cos(radians) * saturation
    sumHy += Math.sin(radians) * saturation
    sumWeight += saturation
  }
  if (count < 200) return undefined

  values.sort((a, b) => a - b)
  const hue = sumWeight > 1e-6
    ? ((Math.atan2(sumHy / sumWeight, sumHx / sumWeight) * 180) / Math.PI + 360) % 360
    : 0

  return {
    asset,
    coverage: count / (info.width * info.height),
    meanL: sumL / count,
    medianL: values[Math.floor(values.length * 0.5)],
    p90L: values[Math.floor(values.length * 0.9)],
    meanS: sumS / count,
    hue,
    brightShare: bright / count,
    chroma: Math.hypot(sumHx, sumHy) / count,
  }
}

function stats(rows, key) {
  const values = rows.map((row) => row[key]).sort((a, b) => a - b)
  return {
    min: values[0],
    p25: values[Math.floor(values.length * 0.25)],
    median: values[Math.floor(values.length * 0.5)],
    p75: values[Math.floor(values.length * 0.75)],
    max: values[values.length - 1],
    mean: values.reduce((sum, value) => sum + value, 0) / values.length,
  }
}

const waveFile = resolve('scripts/render-cargo-wave.sh')
const wave = new Set(
  readFileSync(waveFile, 'utf8')
    .split(/ASSETS=\(/)[1]
    .split(')')[0]
    .trim()
    .split(/\s+/),
)

const assets = readdirSync(prototypes).filter((id) => existsSync(join(prototypes, id, 'model.ts')))
const rows = (await Promise.all(assets.map(measure))).filter(Boolean)
for (const row of rows) row.wave = wave.has(row.asset) ? 'cargo' : 'original'

const cargo = rows.filter((row) => row.wave === 'cargo')
const original = rows.filter((row) => row.wave === 'original')

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(rows, null, 2))
} else {
  const show = (label, group) => {
    console.log(`\n${label}  (n=${group.length})`)
    for (const key of ['medianL', 'p90L', 'meanS', 'hue', 'brightShare']) {
      const s = stats(group, key)
      const f = (value) => key === 'hue' ? value.toFixed(0).padStart(5) : value.toFixed(3).padStart(6)
      console.log(`  ${key.padEnd(12)} min${f(s.min)}  p25${f(s.p25)}  med${f(s.median)}  p75${f(s.p75)}  max${f(s.max)}`)
    }
  }
  show('ORIGINAL WAVE', original)
  show('CARGO WAVE', cargo)

  console.log('\nCargo props furthest from the original median value:')
  const originalMedian = stats(original, 'medianL').median
  const originalHue = stats(original, 'hue').median
  const drift = cargo
    .map((row) => ({ ...row, dL: row.medianL - originalMedian, dH: ((row.hue - originalHue + 540) % 360) - 180 }))
    .sort((a, b) => Math.abs(b.dL) - Math.abs(a.dL))
  for (const row of drift.slice(0, 12)) {
    console.log(`  ${row.asset.padEnd(30)} L ${row.medianL.toFixed(3)} (${row.dL >= 0 ? '+' : ''}${row.dL.toFixed(3)})  hue ${row.hue.toFixed(0)}  sat ${row.meanS.toFixed(3)}`)
  }
}
