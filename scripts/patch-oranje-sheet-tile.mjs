import { resolve } from 'node:path'
import sharp from 'sharp'

const root = resolve(import.meta.dirname, '..')
const tile = resolve(root, '.asset-forge/previews/f1-oranje-can/latest.png')
const cell = 320

const patches = [
  {
    sheet: resolve(root, 'docs/assets/f1-kit-previews/f1-kit-overview.png'),
    index: 24,
    columns: 5,
  },
  {
    sheet: resolve(root, 'docs/assets/f1-kit-previews/f1-kit-trackside.png'),
    index: 13,
    columns: 4,
  },
]

for (const { sheet, index, columns } of patches) {
  const left = (index % columns) * cell
  const top = Math.floor(index / columns) * cell
  const resized = await sharp(tile)
    .resize(cell, cell, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 1 } })
    .png()
    .toBuffer()
  const tmp = `${sheet}.tmp.png`
  await sharp(sheet)
    .composite([{ input: resized, left, top }])
    .png()
    .toFile(tmp)
  await sharp(tmp).toFile(sheet)
  console.log(`patched ${sheet} tile ${index} at (${left}, ${top})`)
}
