import { createHash } from 'node:crypto'
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { basename, dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { registrySchema, type RegistryFile, type RegistryItem } from '@vibe3djs/schema'

const registryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const repositoryRoot = resolve(registryRoot, '../..')
const prototypesRoot = join(repositoryRoot, 'assets/prototypes')
const generatorRoot = join(repositoryRoot, 'src/asset-forge/generator')
const outputRoot = join(registryRoot, 'dist')

function titleFromId(id: string): string {
  return id.split('-').map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(' ')
}

function categoryFromId(id: string): string {
  if (id.startsWith('medical-') || id.includes('microscope') || id.includes('clinic') || id.includes('treatment')) return 'Medical'
  if (id.startsWith('military-') || id.includes('checkpoint')) return 'Military'
  if (id.includes('wall') || id.includes('building') || id.includes('floor') || id.includes('roof')) return 'Architecture'
  if (id.includes('street') || id.includes('road') || id.includes('curb') || id.includes('sidewalk')) return 'Streets'
  return 'Industrial'
}

function hash(content: string): string {
  return createHash('sha256').update(content).digest('hex')
}

async function collectTypeScriptFiles(root: string): Promise<string[]> {
  const files: string[] = []
  const visit = async (directory: string): Promise<void> => {
    const entries = await readdir(directory, { withFileTypes: true })
    for (const entry of entries) {
      const path = join(directory, entry.name)
      if (entry.isDirectory()) await visit(path)
      else if (entry.isFile() && entry.name.endsWith('.ts')) files.push(path)
    }
  }
  await visit(root)
  return files.sort()
}

function modelDependency(content: string, modelId: string): string[] {
  const dependencies = new Set<string>(['@scifi-kit/core'])
  const importPattern = /from\s+['"]\.\.\/([a-z0-9][a-z0-9-]*)\//g
  for (const match of content.matchAll(importPattern)) {
    const dependency = match[1]
    if (dependency && dependency !== modelId) dependencies.add(`@scifi-kit/${dependency}`)
  }
  return [...dependencies]
}

async function registryFile(path: string, target: string): Promise<RegistryFile> {
  const content = (await readFile(path, 'utf8'))
    .replaceAll('../../../src/asset-forge/generator/index.ts', '@vibe3d/scifi-kit/generator/index.ts')
  return { path: relative(repositoryRoot, path), target, content, hash: hash(content) }
}

async function buildCoreItem(): Promise<RegistryItem> {
  const paths = await collectTypeScriptFiles(generatorRoot)
  const files = await Promise.all(paths.map((path) => registryFile(
    path,
    `{vibe3d}/scifi-kit/generator/${relative(generatorRoot, path).split(sep).join('/')}`,
  )))
  return {
    name: 'core',
    type: 'vibe3d:lib',
    title: 'Sci-fi Kit Core',
    description: 'Procedural primitives, materials, wear, batching, and GLB export shared by the sci-fi catalog.',
    dependencies: ['three@>=0.185.0'],
    registryDependencies: [],
    files,
  }
}

async function buildSupportItem(itemId: string): Promise<RegistryItem> {
  const directory = join(prototypesRoot, itemId)
  const paths = (await collectTypeScriptFiles(directory))
    .filter((path) => basename(path) !== 'assembly.ts')
  const files = await Promise.all(paths.map((path) => registryFile(
    path,
    `{models}/scifi-kit/${itemId}/${relative(directory, path).split(sep).join('/')}`,
  )))
  return {
    name: itemId,
    type: 'vibe3d:lib',
    title: titleFromId(itemId),
    description: 'Shared contracts, layout helpers, and kit construction utilities.',
    dependencies: ['three@>=0.185.0'],
    registryDependencies: ['@scifi-kit/core'],
    files,
  }
}

async function buildModelItem(modelId: string): Promise<RegistryItem> {
  const directory = join(prototypesRoot, modelId)
  const paths = await collectTypeScriptFiles(directory)
  const contents = await Promise.all(paths.map((path) => readFile(path, 'utf8')))
  const dependencies = new Set<string>()
  for (const content of contents) {
    for (const dependency of modelDependency(content, modelId)) dependencies.add(dependency)
  }
  const files = await Promise.all(paths.map((path) => registryFile(
    path,
    `{models}/scifi-kit/${modelId}/${relative(directory, path).split(sep).join('/')}`,
  )))
  const title = titleFromId(modelId)
  const category = categoryFromId(modelId)
  return {
    name: modelId,
    type: 'vibe3d:model',
    title,
    description: `A procedural ${title.toLocaleLowerCase()} built for real-time Three.js scenes.`,
    dependencies: ['three@>=0.185.0'],
    registryDependencies: [...dependencies].sort(),
    files,
    meta: {
      title,
      description: `Inspect, configure, and export the ${title.toLocaleLowerCase()} directly from your project.`,
      category,
      tags: [category.toLocaleLowerCase(), 'procedural', 'threejs'],
      preview: `assets/prototypes/${modelId}/model.ts#createPreview`,
      controls: {},
      materialSlots: [],
      parts: [],
      sockets: [],
    },
  }
}

async function main(): Promise<void> {
  const entries = await readdir(prototypesRoot, { withFileTypes: true })
  const modelIds: string[] = []
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    try {
      await readFile(join(prototypesRoot, entry.name, 'model.ts'))
      modelIds.push(entry.name)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
  }
  modelIds.sort()
  const items = [
    await buildCoreItem(),
    await buildSupportItem('axiom-modular-kit'),
    await buildSupportItem('axiom-cargo-kit'),
    await buildSupportItem('axiom-door-kit'),
  ]
  for (const modelId of modelIds) items.push(await buildModelItem(modelId))
  items.push({
    name: 'kit',
    type: 'vibe3d:kit',
    title: 'Sci-fi Kit',
    description: 'The complete procedural sci-fi model library, ready to own and adapt.',
    dependencies: [],
    registryDependencies: modelIds.map((id) => `@scifi-kit/${id}`),
    files: [],
  })

  const registry = registrySchema.parse({
    $schema: 'https://vibe3d.dev/schema/registry.json',
    schemaVersion: 1,
    namespace: '@scifi-kit',
    name: 'Sci-fi Kit',
    description: 'A production-ready procedural model library for building dense science-fiction worlds in Three.js.',
    homepage: 'https://vibe3d.dev/kits/scifi-kit',
    license: 'MIT',
    defaultItem: 'kit',
    compatibility: {
      vibe3d: '^0.0.1',
      engine: 'three',
      three: '>=0.185.0',
      capabilities: ['webgpu', 'tsl'],
    },
    items,
  })
  await mkdir(outputRoot, { recursive: true })
  await writeFile(join(outputRoot, 'registry.json'), `${JSON.stringify(registry, null, 2)}\n`, 'utf8')
  console.log(`Built ${registry.items.length} registry items from ${modelIds.length} models.`)
}

await main()
