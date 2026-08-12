#!/usr/bin/env node
import { createHash } from 'node:crypto'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Command } from 'commander'
import pc from 'picocolors'
import { checkRegistry } from '@vibe3djs/conformance'
import { modelsLockSchema, type ModelsConfig } from '@vibe3djs/schema'
import {
  installRegistryItems,
  loadModelsConfig,
  loadRegistry,
  parseRegistryAddress,
  resolveRegistryItems,
} from '@vibe3djs/registry'

const VERSION = '0.0.1'

function projectPath(value: string): string {
  return resolve(process.cwd(), value)
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await readFile(path)
    return true
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false
    throw error
  }
}

async function writeNewFile(path: string, content: string): Promise<boolean> {
  if (await fileExists(path)) return false
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, content, 'utf8')
  return true
}

async function initialize(cwd: string): Promise<void> {
  const configPath = join(cwd, 'models.json')
  const lockPath = join(cwd, 'models.lock.json')
  const config = {
    $schema: 'https://vibe3d.dev/schema/models.json',
    engine: 'three',
    typescript: true,
    paths: { vibe3d: 'src/lib/vibe3d', models: 'src/models' },
    aliases: { vibe3d: '@/lib/vibe3d', models: '@/models' },
    registries: {
      '@scifi-kit': { source: 'npm:@scifi-kit/registry', version: 'latest' },
    },
  }
  const createdConfig = await writeNewFile(configPath, `${JSON.stringify(config, null, 2)}\n`)
  await writeNewFile(lockPath, `${JSON.stringify({ schemaVersion: 1, items: {} }, null, 2)}\n`)

  const moduleDirectory = dirname(fileURLToPath(import.meta.url))
  const packageRoot = resolve(moduleDirectory, '..')
  const templates = ['model.ts', 'materials.ts', 'ownership.ts']
  for (const template of templates) {
    const content = await readFile(join(packageRoot, 'templates', template), 'utf8')
    await writeNewFile(join(cwd, 'src/lib/vibe3d', template), content)
  }

  console.log(createdConfig
    ? `${pc.green('Created')} ${relative(process.cwd(), configPath) || 'models.json'}`
    : `${pc.yellow('Kept')} existing models.json`)
  console.log(`${pc.green('Ready')} Add a registry, then install your first model.`)
}

interface RegistryBatch {
  address: string
  source: ModelsConfig['registries'][string]
  registry: Awaited<ReturnType<typeof loadRegistry>>
  items: ReturnType<typeof resolveRegistryItems>
}

async function resolveRequest(cwd: string, address: string) {
  const config = await loadModelsConfig(cwd)
  const batches: RegistryBatch[] = []
  const visited = new Set<string>()
  const active = new Set<string>()

  const visit = async (requestedAddress: string): Promise<void> => {
    if (visited.has(requestedAddress)) return
    if (active.has(requestedAddress)) throw new Error(`Registry dependency cycle at ${requestedAddress}`)
    active.add(requestedAddress)
    const parsed = parseRegistryAddress(requestedAddress)
    const source = config.registries[parsed.namespace]
    if (!source) throw new Error(`Registry ${parsed.namespace} is not configured in models.json`)
    const registry = await loadRegistry(cwd, source)
    if (registry.namespace !== parsed.namespace) {
      throw new Error(`Registry source declares ${registry.namespace}, expected ${parsed.namespace}`)
    }
    const items = resolveRegistryItems(registry, parsed.item)
    const external = new Set(items.flatMap(({ item }) => item.registryDependencies)
      .filter((dependency) => parseRegistryAddress(dependency).namespace !== registry.namespace))
    for (const dependency of external) await visit(dependency)
    batches.push({ address: requestedAddress, source, registry, items })
    active.delete(requestedAddress)
    visited.add(requestedAddress)
  }

  await visit(address)
  return { config, batches }
}

async function loadAddressRegistry(cwd: string, address: string) {
  const config = await loadModelsConfig(cwd)
  const parsed = parseRegistryAddress(address)
  const source = config.registries[parsed.namespace]
  if (!source) {
    throw new Error(`Registry ${parsed.namespace} is not configured in models.json`)
  }
  const registry = await loadRegistry(cwd, source)
  if (registry.namespace !== parsed.namespace) {
    throw new Error(`Registry source declares ${registry.namespace}, expected ${parsed.namespace}`)
  }
  return { config, source, registry, parsed }
}

async function view(cwd: string, address: string): Promise<void> {
  const { registry, parsed } = await loadAddressRegistry(cwd, address)
  const items = resolveRegistryItems(registry, parsed.item)
  const selected = items.at(-1)!
  console.log(pc.bold(selected.item.title))
  console.log(selected.item.description)
  console.log('')
  console.log(`${pc.dim('Registry')}     ${registry.namespace}`)
  console.log(`${pc.dim('Type')}         ${selected.item.type}`)
  console.log(`${pc.dim('Files')}        ${items.reduce((total, item) => total + item.item.files.length, 0)}`)
  console.log(`${pc.dim('Artifacts')}    ${items.reduce((total, item) => total + ('artifacts' in item.item ? item.item.artifacts.length : 0), 0)}`)
  console.log(`${pc.dim('Dependencies')} ${items.map((item) => item.address).join(', ')}`)
}

async function add(
  cwd: string,
  address: string,
  options: { overwrite?: boolean; dryRun?: boolean },
): Promise<void> {
  const { config, batches } = await resolveRequest(cwd, address)
  const results = []
  for (const batch of batches) {
    results.push(await installRegistryItems({
      cwd,
      config,
      registry: batch.registry,
      source: batch.source.source,
      version: batch.source.version,
      items: batch.items,
      overwrite: options.overwrite,
      dryRun: options.dryRun,
    }))
  }
  const result = {
    files: results.flatMap((entry) => entry.files),
    artifacts: results.flatMap((entry) => entry.artifacts),
    dependencies: [...new Set(results.flatMap((entry) => entry.dependencies))],
    skipped: results.flatMap((entry) => entry.skipped),
  }
  const verb = options.dryRun ? 'Would install' : 'Installed'
  console.log(`${pc.green(verb)} ${pc.bold(address)} · ${result.files.length} files · ${result.artifacts.length} compiled artifacts`)
  if (result.dependencies.length > 0) {
    console.log(`${pc.yellow('Add dependencies')} ${result.dependencies.join(' ')}`)
  }
  if (result.skipped.length > 0) {
    console.log(`${pc.yellow('Preserved local files')} ${result.skipped.join(', ')}`)
  }
}

async function list(cwd: string, query = ''): Promise<void> {
  const config = await loadModelsConfig(cwd)
  const needle = query.toLowerCase()
  let count = 0
  for (const [namespace, source] of Object.entries(config.registries)) {
    const registry = await loadRegistry(cwd, source)
    for (const item of registry.items) {
      if (item.type === 'vibe3d:lib' || item.type === 'vibe3d:file') continue
      const haystack = `${item.name} ${item.title} ${item.description} ${item.meta?.tags.join(' ')}`.toLowerCase()
      if (needle && !haystack.includes(needle)) continue
      console.log(`${pc.cyan(`${namespace}/${item.name}`)}  ${item.title}`)
      count += 1
    }
  }
  console.log(pc.dim(`${count} matching ${count === 1 ? 'item' : 'items'}`))
}

async function doctor(cwd: string): Promise<void> {
  const config = await loadModelsConfig(cwd)
  const checks: string[] = []
  for (const [namespace, source] of Object.entries(config.registries)) {
    const registry = await loadRegistry(cwd, source)
    if (registry.namespace !== namespace) throw new Error(`${namespace} resolves to ${registry.namespace}`)
    checks.push(`${namespace} · ${registry.items.length} items`)
  }
  console.log(pc.green('Configuration is valid.'))
  for (const check of checks) console.log(pc.dim(check))
}

async function validateRegistryFile(cwd: string, file: string): Promise<void> {
  const value = JSON.parse(await readFile(resolve(cwd, file), 'utf8')) as unknown
  const report = checkRegistry(value)
  console.log(`${pc.green('Conformant')} ${report.registry.namespace} · ${report.checkedItems} items · ${report.checkedFiles} files · ${report.checkedArtifacts} compiled artifacts · ${report.registry.license}`)
}

async function diff(cwd: string): Promise<void> {
  const lock = modelsLockSchema.parse(JSON.parse(await readFile(join(cwd, 'models.lock.json'), 'utf8')) as unknown)
  let changes = 0
  for (const item of Object.values(lock.items)) {
    for (const file of item.files) {
      try {
        const content = await readFile(join(cwd, file.path), 'utf8')
        const actual = createHash('sha256').update(content).digest('hex')
        if (actual !== file.sourceHash) {
          console.log(`${pc.yellow('modified')} ${file.path}`)
          changes += 1
        }
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
        console.log(`${pc.red('missing')}  ${file.path}`)
        changes += 1
      }
    }
  }
  if (lock.schemaVersion === 2) {
    for (const item of Object.values(lock.items)) {
      for (const artifact of item.artifacts) {
        try {
          const content = await readFile(join(cwd, artifact.path))
          const actual = createHash('sha256').update(content).digest('hex')
          if (actual !== artifact.sourceHash) {
            console.log(`${pc.yellow('stale')}    ${artifact.path}`)
            changes += 1
          }
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
          console.log(`${pc.red('missing')}  ${artifact.path}`)
          changes += 1
        }
      }
    }
  }
  if (changes === 0) console.log(pc.green('Installed model sources match the lock receipt.'))
}

async function remove(cwd: string, address: string, force = false): Promise<void> {
  const lockPath = join(cwd, 'models.lock.json')
  const lock = modelsLockSchema.parse(JSON.parse(await readFile(lockPath, 'utf8')) as unknown)
  const item = lock.items[address]
  if (!item) throw new Error(`${address} is not recorded in models.lock.json`)
  for (const file of item.files) {
    const path = join(cwd, file.path)
    try {
      const content = await readFile(path, 'utf8')
      const actual = createHash('sha256').update(content).digest('hex')
      if (actual !== file.sourceHash && !force) {
        throw new Error(`${file.path} has local changes; pass --force to remove it`)
      }
      await rm(path)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
  }
  if (lock.schemaVersion === 2) {
    for (const artifact of lock.items[address]!.artifacts) {
      try {
        await rm(join(cwd, artifact.path))
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
      }
    }
  }
  delete lock.items[address]
  await writeFile(lockPath, `${JSON.stringify(lock, null, 2)}\n`, 'utf8')
  console.log(`${pc.green('Removed')} ${address}`)
}

const program = new Command()
  .name('vibe3d')
  .description('Install production-ready Three.js models as source you own.')
  .version(VERSION)

program.command('init')
  .description('Prepare a Three.js project for source-installed models.')
  .option('--cwd <path>', 'project directory', projectPath, process.cwd())
  .action(async ({ cwd }: { cwd: string }) => initialize(cwd))

program.command('view')
  .description('Inspect a model or kit before installing it.')
  .argument('<address>', 'registry address, such as @scifi-kit/modular-wall')
  .option('--cwd <path>', 'project directory', projectPath, process.cwd())
  .action(async (address: string, { cwd }: { cwd: string }) => view(cwd, address))

program.command('add')
  .description('Install a model or complete kit into your project.')
  .argument('<address>', 'registry address, such as @scifi-kit/modular-wall')
  .option('--cwd <path>', 'project directory', projectPath, process.cwd())
  .option('--overwrite', 'replace existing files')
  .option('--dry-run', 'show the installation without writing files')
  .action(async (
    address: string,
    options: { cwd: string; overwrite?: boolean; dryRun?: boolean },
  ) => add(options.cwd, address, options))

program.command('update')
  .description('Update an installed item while preserving locally edited files.')
  .argument('<address>', 'installed registry address')
  .option('--cwd <path>', 'project directory', projectPath, process.cwd())
  .option('--overwrite', 'replace locally edited files')
  .option('--dry-run', 'show the update without writing files')
  .action((address: string, options: { cwd: string; overwrite?: boolean; dryRun?: boolean }) => add(options.cwd, address, options))

program.command('list')
  .alias('search')
  .description('Browse items in configured registries.')
  .argument('[query]', 'optional name, category, or tag filter', '')
  .option('--cwd <path>', 'project directory', projectPath, process.cwd())
  .action((query: string, { cwd }: { cwd: string }) => list(cwd, query))

program.command('diff')
  .description('Show installed model files changed since installation.')
  .option('--cwd <path>', 'project directory', projectPath, process.cwd())
  .action(({ cwd }: { cwd: string }) => diff(cwd))

program.command('remove')
  .description('Remove an installed item when its source is unchanged.')
  .argument('<address>', 'installed registry address')
  .option('--cwd <path>', 'project directory', projectPath, process.cwd())
  .option('--force', 'remove files with local edits')
  .action((address: string, { cwd, force }: { cwd: string; force?: boolean }) => remove(cwd, address, force))

program.command('doctor')
  .description('Validate project configuration and registry access.')
  .option('--cwd <path>', 'project directory', projectPath, process.cwd())
  .action(({ cwd }: { cwd: string }) => doctor(cwd))

const registryCommand = program.command('registry').description('Tools for registry authors.')
registryCommand.command('validate')
  .description('Validate a built registry manifest.')
  .argument('<file>', 'path to registry.json')
  .option('--cwd <path>', 'project directory', projectPath, process.cwd())
  .action((file: string, { cwd }: { cwd: string }) => validateRegistryFile(cwd, file))

program.parseAsync().catch((error: unknown) => {
  console.error(pc.red(error instanceof Error ? error.message : String(error)))
  process.exitCode = 1
})
