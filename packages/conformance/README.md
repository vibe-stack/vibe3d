# @vibe3djs/conformance

Compatibility and safety validation for Vibe3D registries.

```ts
import { checkRegistry } from '@vibe3djs/conformance'

const report = checkRegistry(registryJson)
```

The validator checks schema conformance, dependency closure, safe target paths,
duplicate writes, and published source hashes.

Released under the MIT License.
