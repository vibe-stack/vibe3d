import { createHash } from 'node:crypto'
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { basename, dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { registrySchema, type RegistryFile, type RegistryItem } from '@vibe3djs/schema'

const registryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const repositoryRoot = resolve(registryRoot, '../..')
const prototypesRoot = join(repositoryRoot, 'assets/f1-prototypes')
const outputRoot = join(registryRoot, 'dist')

function titleFromId(id: string): string {
  return id.split('-').map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(' ')
}

function categoryFromId(id: string): string {
  if (id.includes('tyre')) return 'Tyres'
  if (id.includes('jack') || id.includes('gun') || id.includes('rack')) return 'Pit Tools'
  if (id.includes('cabinet') || id.includes('extinguisher') || id.includes('reel')) return 'Garage Equipment'
  if (
    id.includes('oranje')
    || id.includes('catch-fence')
    || id.includes('crowd-fence')
    || id.includes('armco')
    || id.includes('tecpro')
    || id.includes('kerb')
    || id.includes('floodlight')
    || id.includes('timing-pylon')
    || id.includes('brake-marker')
    || id.includes('jumbotron')
    || id.includes('marshal')
    || id.includes('start-')
    || id.includes('grandstand')
    || id.includes('concrete-wall')
    || id.includes('jersey')
    || id.includes('access-gate')
    || id.includes('crash-cushion')
    || id.includes('gravel')
    || id.includes('astroturf')
    || id.includes('marker-post')
    || id.includes('slot-drain')
    || id.includes('stairs')
    || id.includes('circuit-sign')
    || id.includes('grid-box')
    || id.includes('fia-light')
    || id.includes('chevron')
    || id.includes('camera-tower')
    || id.includes('foam-monitor')
    || id.includes('cctv')
    || id.includes('pa-horn')
    || id.includes('race-control')
    || id.includes('spectator-bridge')
    || id.includes('podium')
    || id.includes('cone')
    || id.includes('bollard')
    || id.includes('weighbridge')
    || id.includes('parc-ferme')
    || id.includes('medical-post')
    || id.includes('generator')
    || id.includes('flag-pole')
    || id.includes('camera-platform')
    || id.includes('tunnel-portal')
    || id.includes('sector-gantry')
  ) return 'Trackside'
  if (id.includes('board') || id.includes('gantry')) return 'Signage & Structures'
  return 'Pit Lane'
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
  const dependencies = new Set<string>()
  const importPattern = /from\s+['"]\.\.\/([a-z0-9][a-z0-9-]*)\//g
  for (const match of content.matchAll(importPattern)) {
    const dependency = match[1]
    if (dependency && dependency !== modelId) dependencies.add(`@f1-kit/${dependency}`)
  }
  return [...dependencies]
}

async function registryFile(path: string, target: string): Promise<RegistryFile> {
  const content = await readFile(path, 'utf8')
  return { path: relative(repositoryRoot, path), target, content, hash: hash(content) }
}

async function buildSupportItem(itemId: string): Promise<RegistryItem> {
  const directory = join(prototypesRoot, itemId)
  const paths = await collectTypeScriptFiles(directory)
  const files = await Promise.all(paths.map((path) => registryFile(
    path,
    `{models}/f1-kit/${itemId}/${relative(directory, path).split(sep).join('/')}`,
  )))
  return {
    name: itemId,
    type: 'vibe3d:lib',
    title: titleFromId(itemId),
    description: 'Shared palette, materials, parts, geometry primitives, preview rig and the resource-disposal contract every prop in the kit builds on.',
    dependencies: ['three@>=0.185.0'],
    registryDependencies: [],
    files,
  }
}

async function buildModelItem(modelId: string): Promise<RegistryItem> {
  const directory = join(prototypesRoot, modelId)
  const paths = await collectTypeScriptFiles(directory)
  const contents = await Promise.all(paths.map((path) => readFile(path, 'utf8')))
  const dependencies = new Set<string>(['@f1-kit/f1-kit-core'])
  for (const content of contents) {
    for (const dependency of modelDependency(content, modelId)) dependencies.add(dependency)
  }
  const files = await Promise.all(paths.map((path) => registryFile(
    path,
    `{models}/f1-kit/${modelId}/${relative(directory, path).split(sep).join('/')}`,
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
      tags: [category.toLocaleLowerCase(), 'procedural', 'threejs', 'motorsport'],
      preview: `assets/f1-prototypes/${modelId}/model.ts#createPreview`,
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
    if (!entry.isDirectory() || entry.name === 'f1-kit-core') continue
    try {
      await readFile(join(prototypesRoot, entry.name, 'model.ts'))
      modelIds.push(entry.name)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
  }
  modelIds.sort()
  const items = [await buildSupportItem('f1-kit-core')]
  for (const modelId of modelIds) items.push(await buildModelItem(modelId))
  items.push({
    name: 'kit',
    type: 'vibe3d:kit',
    title: 'F1 Kit',
    description: 'Procedural Formula-1 pit-lane props, ready to own and adapt: tyres, pit tools, garage equipment, and signage.',
    dependencies: [],
    registryDependencies: modelIds.map((id) => `@f1-kit/${id}`),
    files: [],
  })

  const registry = registrySchema.parse({
    $schema: 'https://vibe3d.dev/schema/registry.json',
    schemaVersion: 1,
    namespace: '@f1-kit',
    name: 'F1 Kit',
    description: 'A procedural Formula-1 pit-lane prop library for building motorsport scenes in Three.js — tyres, pit tools, garage equipment, and signage, with no real-team branding baked in.',
    homepage: 'https://vibe3d.dev/kits/f1-kit',
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
