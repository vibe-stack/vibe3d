# @vibe3djs/terrain

Runtime-neutral contracts for procedural terrain with disposable,
game-ready compiled topology caches.

```ts
import {
  createTerrainAsset,
  decodeCompiledTopology,
} from '@vibe3djs/terrain'

import { createWebGpuTopologyBuffers } from '@vibe3djs/terrain/three-webgpu'
```

The procedural recipe remains authoritative. Compiled topology stores domain
coordinates, connectivity, LODs, adjacency, and collision data—not a final
rendered model or GLB. A compatible cache skips surface extraction and topology
processing; incompatible or missing caches fall back to source generation.

Released under the MIT License.
