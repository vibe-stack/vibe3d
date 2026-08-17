import { mkdir, copyFile } from 'node:fs/promises'
import { resolve, dirname } from 'node:path'
import { spawnSync } from 'node:child_process'
import sharp from 'sharp'

const root = resolve(import.meta.dirname, '..')
const outDir = resolve(root, 'docs/assets/f1-kit-previews')
const modulePath = resolve(root, 'assets/f1-prototypes/f1-start-lights/model.ts')
const cell = 512

await mkdir(outDir, { recursive: true })

const frames = []
for (let lit = 0; lit <= 5; lit++) {
  const output = resolve(outDir, `f1-start-lights-lit-${lit}.png`)
  const result = spawnSync(
    'bun',
    [
      'run',
      'vibe:model',
      'preview',
      '--module',
      modulePath,
      '--export',
      'createPreview',
      '--asset',
      'f1-start-lights',
      '--output',
      output,
      '--width',
      String(cell),
      '--height',
      String(cell),
    ],
    {
      cwd: root,
      env: { ...process.env, F1_START_LIGHTS_LIT: String(lit) },
      encoding: 'utf8',
    },
  )
  if (result.status !== 0) {
    console.error(result.stderr || result.stdout)
    throw new Error(`preview failed for lit=${lit}`)
  }
  if (!result.stdout.includes('"ok":true')) {
    throw new Error(`preview did not report ok for lit=${lit}`)
  }
  frames.push({ lit, path: output })
  console.log(`lit ${lit} -> ${output}`)
}

const stripPath = resolve(outDir, 'f1-start-lights-sequence.png')
const tiles = await Promise.all(
  frames.map(async ({ path }, index) => ({
    input: await sharp(path)
      .resize(cell, cell, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 1 } })
      .png()
      .toBuffer(),
    left: index * cell,
    top: 0,
  })),
)

await sharp({
  create: {
    width: cell * frames.length,
    height: cell,
    channels: 3,
    background: { r: 0, g: 0, b: 0 },
  },
})
  .composite(tiles)
  .png()
  .toFile(stripPath)

console.log(`sequence strip -> ${stripPath} (${frames.length} frames)`)
