/**
 * Delete cached scene artifacts no scene asks for any more.
 *
 * Artifact names encode their compile parameters, so changing a grid size, an
 * atlas policy or a world scale renames every file and leaves the old set behind.
 * That is not merely wasted disk: the previewer registers every artifact it can
 * glob, so stale files ship to the browser as dead weight. Two rounds of parameter
 * changes had left 45MB of them.
 *
 *   node --import tsx assets/terrain/shared/prune-artifacts.ts
 *   node --import tsx assets/terrain/shared/prune-artifacts.ts --dry-run
 */
import { readdir, stat, unlink } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  canyonArtifactName,
  canyonInstanceRequests,
} from '../red-sandstone-canyon/canyon-scene.ts'
import {
  cliffArtifactName,
  cliffInstanceRequests,
} from '../glacial-granite-boulder/cliff-scene.ts'

const dryRun = process.argv.includes('--dry-run')
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

// Every quality tier is kept, not just the default: pruning to `preview` alone
// would delete a hero set someone spent an hour compiling.
const targets = [
  {
    directory: resolve(root, 'red-sandstone-canyon/canyon'),
    names: [
      ...canyonInstanceRequests('preview').map(canyonArtifactName),
      ...canyonInstanceRequests('hero').map(canyonArtifactName),
    ],
  },
  {
    directory: resolve(root, 'glacial-granite-boulder/cliff'),
    names: [
      ...cliffInstanceRequests('preview').map(cliffArtifactName),
      ...cliffInstanceRequests('hero').map(cliffArtifactName),
    ],
  },
]

for (const target of targets) {
  const keep = new Set(target.names.flatMap((name) => [`${name}.vtopo`, `${name}.vbake`]))
  let files: string[]
  try {
    files = await readdir(target.directory)
  } catch {
    console.log(`${target.directory}: not present, skipped`)
    continue
  }
  let removed = 0
  let reclaimed = 0
  let kept = 0
  for (const file of files) {
    if (keep.has(file)) {
      kept += 1
      continue
    }
    reclaimed += (await stat(resolve(target.directory, file))).size
    if (!dryRun) await unlink(resolve(target.directory, file))
    removed += 1
  }
  const missing = [...keep].filter((file) => !files.includes(file))
  console.log(JSON.stringify({
    directory: target.directory.replace(`${process.cwd()}/`, ''),
    kept,
    removed,
    reclaimedMb: +(reclaimed / 1e6).toFixed(1),
    // A requested artifact that is not on disk means the scene will fail to load
    // it, so it is reported rather than passed over in silence.
    missing,
    dryRun,
  }))
}
