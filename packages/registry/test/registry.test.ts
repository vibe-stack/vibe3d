import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { modelsConfigSchema, registrySchema } from '@vibe3djs/schema'
import { installRegistryItems } from '../src/install.ts'
import { resolveRegistryItems } from '../src/resolve.ts'

const config = modelsConfigSchema.parse({
  engine: 'three',
  typescript: true,
  paths: { vibe3d: 'src/lib/vibe3d', models: 'src/models' },
  aliases: { vibe3d: '@/lib/vibe3d', models: '@/models' },
  registries: {},
})

function registry(content: string) {
  return registrySchema.parse({
    schemaVersion: 1,
    namespace: '@fixture',
    name: 'Fixture',
    description: 'Installer fixture.',
    license: 'MIT',
    defaultItem: 'model',
    compatibility: { vibe3d: '^0.0.1', engine: 'three', three: '>=0.185', capabilities: [] },
    items: [{
      name: 'model',
      type: 'vibe3d:model',
      title: 'Model',
      description: 'Fixture model.',
      dependencies: [],
      registryDependencies: [],
      files: [{ path: 'model.ts', target: '{models}/fixture/model.ts', content }],
      meta: {
        title: 'Model', description: 'Fixture model.', category: 'Test', tags: [], controls: {}, materialSlots: [], parts: [], sockets: [],
      },
    }],
  })
}

describe('source installer', () => {
  test('updates unchanged source and preserves consumer edits', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'vibe3d-registry-test-'))
    try {
      for (const content of ['export const version = 1\n', 'export const version = 2\n']) {
        const current = registry(content)
        await installRegistryItems({
          cwd, config, registry: current, source: 'fixture', version: '1', items: resolveRegistryItems(current),
        })
      }
      const path = join(cwd, 'src/models/fixture/model.ts')
      assert.equal(await readFile(path, 'utf8'), 'export const version = 2\n')
      await writeFile(path, 'export const consumerEdit = true\n', 'utf8')
      const upstream = registry('export const version = 3\n')
      const result = await installRegistryItems({
        cwd, config, registry: upstream, source: 'fixture', version: '2', items: resolveRegistryItems(upstream),
      })
      assert.deepEqual(result.skipped, ['src/models/fixture/model.ts'])
      assert.equal(await readFile(path, 'utf8'), 'export const consumerEdit = true\n')
    } finally {
      await rm(cwd, { recursive: true, force: true })
    }
  })
})
