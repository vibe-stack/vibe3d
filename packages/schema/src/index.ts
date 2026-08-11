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

export const registryItemSchema = z.object({
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
}).strict()

export const registrySchema = z.object({
  $schema: z.string().url().optional(),
  schemaVersion: z.literal(1),
  namespace: z.string().regex(/^@[a-z0-9][a-z0-9-]*$/),
  name: z.string().min(1),
  description: z.string().min(1),
  homepage: z.string().url().optional(),
  license: z.literal('MIT'),
  defaultItem: z.string().regex(/^[a-z0-9][a-z0-9-]*$/),
  compatibility: z.object({
    vibe3d: z.string().min(1),
    engine: z.literal('three'),
    three: z.string().min(1),
    capabilities: z.array(z.string()).default([]),
  }).strict(),
  items: z.array(registryItemSchema),
}).strict().superRefine((registry, context) => {
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
})

export const installedFileSchema = z.object({
  path: z.string(),
  sourceHash: z.string(),
}).strict()

export const installedItemSchema = z.object({
  address: registryAddressSchema,
  source: z.string(),
  version: z.string(),
  installedAt: z.string(),
  files: z.array(installedFileSchema),
  dependencies: z.array(z.string()),
}).strict()

export const modelsLockSchema = z.object({
  schemaVersion: z.literal(1),
  items: z.record(z.string(), installedItemSchema),
}).strict()

export type ModelsConfig = z.infer<typeof modelsConfigSchema>
export type ModelsLock = z.infer<typeof modelsLockSchema>
export type Registry = z.infer<typeof registrySchema>
export type RegistryFile = z.infer<typeof registryFileSchema>
export type RegistryItem = z.infer<typeof registryItemSchema>
export type RegistrySource = z.infer<typeof registrySourceSchema>
