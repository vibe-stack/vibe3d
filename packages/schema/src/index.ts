import { z } from 'zod'

export const registryAddressSchema = z.string().regex(
  /^@[a-z0-9][a-z0-9-]*(?:\/[a-z0-9][a-z0-9-]*)?$/,
  'Expected a Vibe3D address such as @scifi-kit or @scifi-kit/modular-wall',
)

export const registrySourceSchema = z.object({
  source: z.string().min(1),
  version: z.string().min(1).default('latest'),
}).strict()

export const modelsConfigSchema = z.object({
  $schema: z.string().url().optional(),
  engine: z.literal('three'),
  typescript: z.boolean().default(true),
  paths: z.object({
    vibe3d: z.string().min(1),
    models: z.string().min(1),
  }).strict(),
  aliases: z.object({
    vibe3d: z.string().min(1),
    models: z.string().min(1),
  }).strict(),
  registries: z.record(z.string(), registrySourceSchema),
}).strict()

export const registryFileSchema = z.object({
  path: z.string().min(1),
  target: z.string().min(1),
  content: z.string(),
  hash: z.string().min(1).optional(),
}).strict()

export const registryArtifactSchema = z.object({
  path: z.string().min(1),
  target: z.string().min(1),
  mediaType: z.string().min(1),
  encoding: z.literal('base64'),
  content: z.string(),
  hash: z.string().regex(/^[a-f0-9]{64}$/),
  byteLength: z.number().int().nonnegative(),
}).strict()

export const sourceRepresentationSchema = z.object({
  entry: z.string().min(1),
  capabilities: z.array(z.string()).default([]),
}).strict()

export const compiledTopologyRepresentationSchema = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9-]*$/),
  kind: z.literal('compiled-topology'),
  artifact: z.string().min(1),
  format: z.literal('vibe3d-topology@1'),
  topologyKey: z.string().min(1),
  recipeHash: z.string().min(1),
  compilerHash: z.string().min(1),
  profile: z.string().min(1),
  capabilities: z.array(z.string()).default([]),
}).strict()

export const modelRepresentationsSchema = z.object({
  source: sourceRepresentationSchema,
  compiled: z.array(compiledTopologyRepresentationSchema).default([]),
}).strict()

export const modelControlSchema = z.object({
  type: z.enum(['number', 'boolean', 'select', 'color']),
  label: z.string().min(1),
  description: z.string().optional(),
  default: z.unknown().optional(),
  min: z.number().optional(),
  max: z.number().optional(),
  step: z.number().positive().optional(),
  unit: z.string().optional(),
  options: z.array(z.string()).optional(),
}).strict()

export const modelMetadataSchema = z.object({
  title: z.string().min(1),
  description: z.string().min(1),
  category: z.string().min(1),
  tags: z.array(z.string()).default([]),
  preview: z.string().optional(),
  controls: z.record(z.string(), modelControlSchema).default({}),
  materialSlots: z.array(z.string()).default([]),
  parts: z.array(z.string()).default([]),
  sockets: z.array(z.string()).default([]),
}).strict()

const registryItemShape = {
  name: z.string().regex(/^[a-z0-9][a-z0-9-]*$/),
  type: z.enum([
    'vibe3d:model',
    'vibe3d:kit',
    'vibe3d:lib',
    'vibe3d:materials',
    'vibe3d:file',
  ]),
  title: z.string().min(1),
  description: z.string().min(1),
  dependencies: z.array(z.string()).default([]),
  registryDependencies: z.array(registryAddressSchema).default([]),
  files: z.array(registryFileSchema).default([]),
  meta: modelMetadataSchema.optional(),
}

export const registryItemV1Schema = z.object(registryItemShape).strict()

export const registryItemV2Schema = z.object({
  ...registryItemShape,
  artifacts: z.array(registryArtifactSchema).default([]),
  representations: modelRepresentationsSchema.optional(),
}).strict().superRefine((item, context) => {
  if (item.representations && item.type !== 'vibe3d:model') {
    context.addIssue({
      code: 'custom',
      path: ['representations'],
      message: 'Only vibe3d:model items can declare model representations',
    })
  }
  const artifacts = new Map(item.artifacts.map((artifact) => [artifact.path, artifact]))
  for (const [index, compiled] of (item.representations?.compiled ?? []).entries()) {
    const artifact = artifacts.get(compiled.artifact)
    if (!artifact) {
      context.addIssue({
        code: 'custom',
        path: ['representations', 'compiled', index, 'artifact'],
        message: `Compiled representation references missing artifact: ${compiled.artifact}`,
      })
    } else if (artifact.mediaType !== 'application/vnd.vibe3d.compiled-topology+json;version=1') {
      context.addIssue({
        code: 'custom',
        path: ['representations', 'compiled', index, 'artifact'],
        message: `Compiled topology artifact has incompatible media type: ${artifact.mediaType}`,
      })
    }
  }
})

export const registryItemSchema = z.union([registryItemV1Schema, registryItemV2Schema])

const registryCompatibilitySchema = z.object({
  vibe3d: z.string().min(1),
  engine: z.literal('three'),
  three: z.string().min(1),
  capabilities: z.array(z.string()).default([]),
}).strict()

const registryShape = {
  $schema: z.string().url().optional(),
  namespace: z.string().regex(/^@[a-z0-9][a-z0-9-]*$/),
  name: z.string().min(1),
  description: z.string().min(1),
  homepage: z.string().url().optional(),
  license: z.literal('MIT'),
  defaultItem: z.string().regex(/^[a-z0-9][a-z0-9-]*$/),
  compatibility: registryCompatibilitySchema,
}

export const registryV1Schema = z.object({
  ...registryShape,
  schemaVersion: z.literal(1),
  items: z.array(registryItemV1Schema),
}).strict()

export const registryV2Schema = z.object({
  ...registryShape,
  schemaVersion: z.literal(2),
  items: z.array(registryItemV2Schema),
}).strict()

function refineRegistry(registry: {
  namespace: string
  defaultItem: string
  items: Array<{
    name: string
    registryDependencies: string[]
  }>
}, context: z.RefinementCtx): void {
  const names = new Set<string>()
  for (const [index, item] of registry.items.entries()) {
    if (names.has(item.name)) {
      context.addIssue({
        code: 'custom',
        path: ['items', index, 'name'],
        message: `Duplicate registry item: ${item.name}`,
      })
    }
    names.add(item.name)
  }
  if (!names.has(registry.defaultItem)) {
    context.addIssue({
      code: 'custom',
      path: ['defaultItem'],
      message: `Default item does not exist: ${registry.defaultItem}`,
    })
  }
  for (const [itemIndex, item] of registry.items.entries()) {
    for (const [dependencyIndex, dependency] of item.registryDependencies.entries()) {
      const prefix = `${registry.namespace}/`
      if (dependency.startsWith(prefix) && !names.has(dependency.slice(prefix.length))) {
        context.addIssue({
          code: 'custom',
          path: ['items', itemIndex, 'registryDependencies', dependencyIndex],
          message: `Registry dependency does not exist: ${dependency}`,
        })
      }
    }
  }
}

export const registrySchema = z.discriminatedUnion('schemaVersion', [
  registryV1Schema,
  registryV2Schema,
]).superRefine(refineRegistry)

export const installedFileSchema = z.object({
  path: z.string(),
  sourceHash: z.string(),
}).strict()

export const installedArtifactSchema = z.object({
  path: z.string(),
  sourceHash: z.string(),
  mediaType: z.string().min(1),
}).strict()

export const installedItemV1Schema = z.object({
  address: registryAddressSchema,
  source: z.string(),
  version: z.string(),
  installedAt: z.string(),
  files: z.array(installedFileSchema),
  dependencies: z.array(z.string()),
}).strict()

export const installedItemV2Schema = installedItemV1Schema.extend({
  artifacts: z.array(installedArtifactSchema),
}).strict()

export const modelsLockV1Schema = z.object({
  schemaVersion: z.literal(1),
  items: z.record(z.string(), installedItemV1Schema),
}).strict()

export const modelsLockV2Schema = z.object({
  schemaVersion: z.literal(2),
  items: z.record(z.string(), installedItemV2Schema),
}).strict()

export const modelsLockSchema = z.discriminatedUnion('schemaVersion', [
  modelsLockV1Schema,
  modelsLockV2Schema,
])

export type ModelsConfig = z.infer<typeof modelsConfigSchema>
export type ModelsLock = z.infer<typeof modelsLockSchema>
export type Registry = z.infer<typeof registrySchema>
export type RegistryV1 = z.infer<typeof registryV1Schema>
export type RegistryV2 = z.infer<typeof registryV2Schema>
export type RegistryFile = z.infer<typeof registryFileSchema>
export type RegistryItem = z.infer<typeof registryItemSchema>
export type RegistryItemV1 = z.infer<typeof registryItemV1Schema>
export type RegistryItemV2 = z.infer<typeof registryItemV2Schema>
export type RegistryArtifact = z.infer<typeof registryArtifactSchema>
export type RegistrySource = z.infer<typeof registrySourceSchema>
