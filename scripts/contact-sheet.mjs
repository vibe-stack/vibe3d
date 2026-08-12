import { existsSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import sharp from 'sharp'

/**
 * Composes the latest preview of each named asset into one contact sheet.
 *
 * Reviewing a fifty-prop wave one 1024px render at a time hides the only defect
 * that matters at pack scale: whether the props look like they came from the
 * same catalogue. A grid makes value, saturation, and detail-density drift
 * obvious in a single glance.
 *
 * Usage: node scripts/contact-sheet.mjs out.png asset-a asset-b ...
 *        node scripts/contact-sheet.mjs out.png --all
 */

const [output, ...requested] = process.argv.slice(2)
if (!output) throw new Error('Usage: node scripts/contact-sheet.mjs <output.png> [assets...|--all]')

const root = resolve('.asset-forge/previews')
const assets = requested[0] === '--all'
  ? readdirSync(root).filter((name) => existsSync(resolve(root, name, 'latest.png'))).sort()
  : requested

const cell = 320
const columns = Math.min(6, Math.max(1, Math.ceil(Math.sqrt(assets.length))))
const rows = Math.ceil(assets.length / columns)

const tiles = await Promise.all(assets.map(async (asset, index) => {
  const source = resolve(root, asset, 'latest.png')
  if (!existsSync(source)) throw new Error(`No preview for ${asset}`)
  const buffer = await sharp(source).resize(cell, cell, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 1 } }).png().toBuffer()
  return {
    input: buffer,
    left: (index % columns) * cell,
    top: Math.floor(index / columns) * cell,
  }
}))

await sharp({
  create: {
    width: columns * cell,
    height: rows * cell,
    channels: 3,
    background: { r: 0, g: 0, b: 0 },
  },
})
  .composite(tiles)
  .png()
  .toFile(output)

console.log(`${assets.length} tiles -> ${output} (${columns} x ${rows})`)
