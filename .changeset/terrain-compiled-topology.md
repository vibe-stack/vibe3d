---
"@vibe3djs/schema": patch
"@vibe3djs/registry-sdk": patch
"@vibe3djs/registry": patch
"@vibe3djs/conformance": patch
"@vibe3djs/terrain": patch
"vibe3d": patch
"vibe-terrain": patch
---

Add schema-v2 source and compiled-topology representations for procedural
terrain while retaining complete schema-v1 compatibility. Compiled artifacts
are integrity-checked, replaceable acceleration data rather than final models.

Introduce the terrain runtime contracts, cache codec and validation, automatic
source fallback, and the distributable `vibe-terrain` authoring skill.
