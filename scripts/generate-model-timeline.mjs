import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

/**
 * Records when each prototype first appeared, so the recorder can offer a
 * "Latest" view without anybody hand-maintaining a list of what is new.
 *
 * The date comes from the commit that *added* the model's source file, which is
 * the only definition of "new" that cannot drift: a hand-kept array goes stale
 * the first time someone adds a prop and forgets, and file mtime is meaningless
 * after a fresh clone.
 *
 * The result is committed. Git is not available in every consumer's build
 * (published tarballs, some CI images), and a browser cannot shell out anyway,
 * so the generated file is the artefact and this script is how it is refreshed.
 *
 * Usage: node scripts/generate-model-timeline.mjs
 */

const prototypes = resolve('assets/prototypes')
const output = resolve('apps/recorder/src/model-timeline.json')

function addedAt(modelPath) {
  try {
    // --diff-filter=A with --follow gives the commit that introduced the path;
    // the last line is the earliest, which is the one wanted when a file has
    // been added, deleted, and re-added.
    const log = execFileSync('git', [
      'log', '--follow', '--diff-filter=A', '--format=%aI', '--', modelPath,
    ], { encoding: 'utf8' }).trim()
    if (!log) return undefined
    const lines = log.split('\n').filter(Boolean)
    return lines[lines.length - 1]
  } catch {
    return undefined
  }
}

const timeline = {}
let resolved = 0
for (const id of readdirSync(prototypes).sort()) {
  const modelPath = join('assets/prototypes', id, 'model.ts')
  if (!existsSync(resolve(modelPath))) continue
  const iso = addedAt(modelPath)
  if (iso) resolved += 1
  timeline[id] = iso ?? null
}

// Refuse to overwrite good data with nothing. Run outside a git checkout -
// a published tarball, a shallow CI clone - every lookup fails, and writing
// that result would silently empty the Latest view instead of leaving the
// committed dates in place.
if (resolved === 0 && Object.keys(timeline).length > 0) {
  console.error('No model could be dated (is this a git checkout?). Leaving the existing timeline untouched.')
  process.exit(1)
}

writeFileSync(output, `${JSON.stringify(timeline, null, 2)}\n`, 'utf8')

const dates = [...new Set(Object.values(timeline).filter(Boolean))].sort()
console.log(`${resolved}/${Object.keys(timeline).length} models dated -> ${output}`)
console.log(`${dates.length} distinct introduction date(s); newest ${dates[dates.length - 1] ?? 'none'}`)
