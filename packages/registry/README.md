# @vibe3djs/registry

Registry loading, dependency resolution, and safe source installation for
Vibe3D.

```ts
import {
  installRegistryItems,
  loadRegistry,
  resolveRegistryItems,
} from '@vibe3djs/registry'
```

This is the programmatic layer used by the `vibe3d` CLI. Installed model source
belongs to the consuming application rather than remaining behind a runtime
package boundary.

Released under the MIT License.
