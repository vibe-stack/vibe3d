# @vibe3djs/schema

Zod schemas and TypeScript contracts for Vibe3D registry manifests,
`models.json`, and installation lockfiles.

```ts
import { registrySchema, type Registry } from '@vibe3djs/schema'

const registry: Registry = registrySchema.parse(input)
```

Most application developers do not need this package directly. It is intended
for registry authors, tooling, and Vibe3D integrations.

Released under the MIT License.
