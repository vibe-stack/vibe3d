import { existsSync } from 'node:fs'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import sharp from 'sharp'

/**
 * Photographs one prop from every angle a defect can hide behind, on one sheet.
 *
 * The pack's preview rig frames each prop from a single three-quarter hero
 * angle - the angle its author was looking at while building it. That is
 * exactly the angle at which a part floating a millimetre off its mount, a seam
 * that never closed, or two coplanar faces trading places will not show.
 * Orbiting the model and looking at it from underneath is the cheapest way to
 * find those.
 *
 * The orbit goes through each model's own createPreview rather than the CLI's
 * auto-framing, so the lights, distance, and target stay exactly what the pack
 * ships. Judging a value or a paint mark under a different rig than the
 * catalogue's would just trade one class of false positive for another.
 *
 * Usage: node scripts/qa-sheet.mjs <asset> [out.png]
 */

const DEG = Math.PI / 180

const VIEWS = [
  { label: 'front', yaw: 0, pitch: 10 },
  { label: 'right', yaw: 90, pitch: 10 },
  { label: 'back', yaw: 180, pitch: 10 },
  { label: 'left', yaw: 270, pitch: 10 },
  { label: 'hero 3/4', yaw: 45, pitch: 12 },
  { label: 'rear 3/4', yaw: 225, pitch: 12 },
  { label: 'top', yaw: 45, pitch: 70 },
  { label: 'below', yaw: 45, pitch: -22 },
]

const [asset, output = `renders/qa/${asset}.png`] = process.argv.slice(2)
if (!asset) throw new Error('Usage: node scripts/qa-sheet.mjs <asset> [out.png]')

const cell = 512
// The camera-override modules have to sit beside the prototypes for their
// relative imports to resolve, and several of these run at once during a wave
// review, so each run gets its own directory to delete on the way out.
const viewRoot = resolve('assets/prototypes', `.qa-views-${process.pid}`)

function render(modulePath, file) {
  return new Promise((done, fail) => {
    const child = spawn('node', [
      '--import', 'tsx', 'scripts/asset-forge/cli.ts', 'preview',
      '--module', modulePath,
      '--export', 'createPreview',
      '--asset', `qa-${asset}`,
      '--width', '640', '--height', '640',
      '--output', file,
    ], { stdio: ['ignore', 'ignore', 'pipe'] })
    let stderr = ''
    child.stderr.on('data', (chunk) => { stderr += chunk })
    // The capture backend exits non-zero on harmless Dawn limit warnings, so a
    // written file is the only reliable success signal.
    child.on('close', () => (existsSync(file) ? done() : fail(new Error(`${asset} ${modulePath}: ${stderr.trim()}`))))
  })
}

// A caption per tile, because a defect spotted on an unnamed tile still has to
// be located before it can be fixed.
function caption(view) {
  const text = `${view.label}  ·  yaw ${view.yaw}°  pitch ${view.pitch}°`
  return Buffer.from(
    `<svg width="${cell}" height="28"><rect width="${cell}" height="28" fill="#101418"/>`
    + `<text x="10" y="19" font-family="monospace" font-size="15" fill="#c8d4dc">${text}</text></svg>`,
  )
}

const scratch = await mkdtemp(join(tmpdir(), 'qa-sheet-'))
await mkdir(viewRoot, { recursive: true })
try {
  // Serial on purpose: the capture backend holds one GPU device at a time.
  const tiles = []
  for (const [index, view] of VIEWS.entries()) {
    const modulePath = join(viewRoot, `${asset}-${index}.ts`)
    await writeFile(
      modulePath,
      `import { createPreview as base } from '../${asset}/model.ts'\n`
      + `export const createPreview = () => base({ yaw: ${(view.yaw * DEG).toFixed(6)}, pitch: ${(view.pitch * DEG).toFixed(6)} })\n`,
    )
    const file = join(scratch, `${index}.png`)
    await render(modulePath, file)
    const left = (index % 4) * cell
    const top = Math.floor(index / 4) * (cell + 28)
    tiles.push(
      { input: await sharp(file).resize(cell, cell, { fit: 'contain', background: '#000' }).png().toBuffer(), left, top },
      { input: caption(view), left, top: top + cell },
    )
  }

  await mkdir(resolve(output, '..'), { recursive: true })
  await sharp({
    create: { width: 4 * cell, height: 2 * (cell + 28), channels: 3, background: '#000' },
  })
    .composite(tiles)
    .png()
    .toFile(resolve(output))

  console.log(`${asset}: ${VIEWS.length} views -> ${output}`)
} finally {
  await rm(scratch, { recursive: true, force: true })
  await rm(viewRoot, { recursive: true, force: true })
}
