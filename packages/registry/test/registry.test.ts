import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
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
      const lock = JSON.parse(await readFile(join(cwd, 'models.lock.json'), 'utf8')) as { schemaVersion: number }
      assert.equal(lock.schemaVersion, 1)
    } finally {
      await rm(cwd, { recursive: true, force: true })
    }
  })

  test('installs replaceable compiled-topology artifacts without changing source semantics', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'vibe3d-registry-artifact-test-'))
    try {
      const content = new TextEncoder().encode('{"format":"vibe3d-topology@1"}')
      const current = registrySchema.parse({
        schemaVersion: 2,
        namespace: '@terrain-fixture',
        name: 'Terrain Fixture',
        description: 'Compiled topology installer fixture.',
        license: 'MIT',
        defaultItem: 'rock',
        compatibility: { vibe3d: '^0.0.2', engine: 'three', three: '>=0.185', capabilities: [] },
        items: [{
          name: 'rock',
          type: 'vibe3d:model',
          title: 'Rock',
          description: 'Procedural rock fixture.',
          dependencies: [],
          registryDependencies: [],
          files: [{ path: 'rock.ts', target: '{models}/terrain/rock.ts', content: 'export const recipe = true\n' }],
          artifacts: [{
            path: 'rock-game.vtopo',
            target: '{models}/terrain/.compiled/rock-game.vtopo',
            mediaType: 'application/vnd.vibe3d.compiled-topology+json;version=1',
            encoding: 'base64',
            content: Buffer.from(content).toString('base64'),
            hash: createHash('sha256').update(content).digest('hex'),
            byteLength: content.byteLength,
          }],
          representations: {
            source: { entry: 'rock.ts#createTerrain', capabilities: ['webgpu', 'tsl'] },
            compiled: [{
              id: 'game',
              kind: 'compiled-topology',
              artifact: 'rock-game.vtopo',
              format: 'vibe3d-topology@1',
              topologyKey: 'rock-shell',
              recipeHash: 'recipe-1',
              compilerHash: 'compiler-1',
              profile: 'game',
              capabilities: ['webgpu', 'tsl'],
            }],
          },
        }],
      })
      const result = await installRegistryItems({
        cwd, config, registry: current, source: 'fixture', version: '1', items: resolveRegistryItems(current),
      })
      assert.deepEqual(result.artifacts, ['src/models/terrain/.compiled/rock-game.vtopo'])
      assert.deepEqual(
        new Uint8Array(await readFile(join(cwd, 'src/models/terrain/.compiled/rock-game.vtopo'))),
        content,
      )
      const lock = JSON.parse(await readFile(join(cwd, 'models.lock.json'), 'utf8')) as { schemaVersion: number }
      assert.equal(lock.schemaVersion, 2)
    } finally {
      await rm(cwd, { recursive: true, force: true })
    }
  })
})
