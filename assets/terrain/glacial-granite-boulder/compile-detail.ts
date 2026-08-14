/**
 * Compile the shared granite micro-detail tile.
 *
 * This artifact is deliberately not keyed to a topology. It is one seamless tile
 * at a fixed physical size, shared by every granite archetype and every placement
 * in the cliff scene, so its cost is paid once for the whole family rather than
 * per archetype the way the high-to-low atlas is. It only needs recompiling when
 * the detail recipe changes, not when a seed or a grid does.
 */

import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { encodeCompiledSurfaceBake } from '../../../packages/terrain/src/index.ts'
import { DETAIL_IDENTITY, DETAIL_SEED } from './detail.ts'
import { bakeGraniteDetail } from '../shared/detail-bake.ts'

const directory = dirname(fileURLToPath(import.meta.url))
const output = resolve(directory, 'granite-detail.vbake')

const started = Date.now()
const { bake, stats } = bakeGraniteDetail(DETAIL_IDENTITY, DETAIL_SEED)
const encoded = encodeCompiledSurfaceBake(bake)
await mkdir(dirname(output), { recursive: true })
await writeFile(output, encoded)

console.log(JSON.stringify({
  output,
  bytes: encoded.byteLength,
  compileMs: Date.now() - started,
  stats,
}, null, 2))
