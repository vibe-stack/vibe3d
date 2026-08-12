# Vibe3D architecture

Status: proposed architecture; not yet implemented.

Vibe3D is a source-distribution protocol, CLI, registry format, and
conformance suite for procedural Three.js models. It follows the central
ownership principle of source-installed libraries: consumers install readable source files into
their own application instead of depending on an opaque component runtime.

The sci-fi kit in this repository is one reference registry built on Vibe3D.
It is not the Vibe3D platform itself. Third parties can publish compatible
registries through npm or another supported source and consumers can install
their models through the same CLI.

## Goals

- Install model source into the consumer's codebase.
- Make installed models editable without forking an upstream package.
- Support individual models, complete kits, and shared registry dependencies.
- Use npm as the default distribution and discovery layer without requiring
  installed models to import their implementation from npm.
- Give models a consistent Three.js lifecycle and runtime anatomy.
- Make configurable dimensions, materials, semantic parts, sockets, and
  actions discoverable and type-safe.
- Let multiple independently published kits coexist in one application.
- Support local files and arbitrary registry URLs in addition to npm.
- Validate compatibility mechanically with schemas and conformance tests.
- Preserve local edits during inspection and updates.

## Non-goals

- Supporting React Three Fiber, Babylon.js, or other engines in the initial
  protocol.
- Hiding Three.js behind an engine-neutral scene abstraction.
- Publishing every model as a runtime npm dependency.
- Requiring all registries to use the sci-fi kit's material library, visual
  language, geometry helpers, or authoring pipeline.
- Guaranteeing that topology-changing configuration is cheap enough to run
  every frame.
- Treating schema compatibility as a security or quality endorsement.

## Product boundaries

Vibe3D and the sci-fi kit have separate responsibilities.

### Vibe3D

Vibe3D owns:

- the `vibe3d` CLI;
- registry and project configuration schemas;
- registry address resolution;
- source providers such as npm, URL, and local file;
- dependency resolution;
- safe file installation and update inspection;
- the minimal Three.js model protocol;
- conformance tests and registry build tooling;
- optional discovery and marketplace metadata.

### Sci-fi kit

The sci-fi kit owns:

- its visual language and model catalog;
- its kit context and material source;
- its CSG and geometry helpers when they are not generally reusable;
- its model implementations and configurable fields;
- its sockets, modular grid, pivots, envelopes, and assembly rules;
- its WebGPU or TSL capability requirements;
- its previews, references, and model-specific documentation.

### Consumer application

The consumer owns:

- the installed source files;
- the Three.js scene, renderer, camera, and render loop;
- project-level material overrides;
- local changes to installed models;
- the decision to accept or reject future upstream changes.

## CLI experience

The primary commands are:

```sh
bunx vibe3d init
bunx vibe3d add @scifi-kit/modular-wall
bunx vibe3d add @scifi-kit
```

Additional commands should be introduced around the same address model:

```sh
bunx vibe3d view @scifi-kit/modular-wall
bunx vibe3d diff
bunx vibe3d update @scifi-kit/modular-wall
bunx vibe3d search wall
bunx vibe3d doctor
```

Publisher-facing commands are:

```sh
bunx vibe3d registry init
bunx vibe3d registry build
bunx vibe3d registry test
```

### Command semantics

`vibe3d init`:

- detects TypeScript, source layout, import aliases, and the installed Three.js
  version;
- creates `models.json`;
- installs the minimal editable Vibe3D base source;
- creates an installation receipt file;
- does not install the sci-fi kit unless explicitly requested.

`vibe3d add @scifi-kit/modular-wall`:

1. resolves the `@scifi-kit` namespace through `models.json`;
2. obtains the registry manifest from its configured source;
3. resolves the `modular-wall` item and its registry dependencies;
4. checks Vibe3D, Three.js, and renderer capability compatibility;
5. shows conflicts and required npm dependency changes;
6. writes declared files only to configured target roots;
7. adds missing runtime npm dependencies after approval when necessary;
8. records exact versions, integrity, item hashes, and installed file hashes.

`vibe3d add @scifi-kit` resolves the namespace's default item. For this
registry, the default item is a bundle representing the entire sci-fi kit.

## Registry addresses are not npm package names

Vibe3D uses scoped logical registry addresses:

```text
@scifi-kit/modular-wall
|          `-- registry item
`------------- registry namespace
```

`@scifi-kit` is the registry namespace and its default bundle address. It is
not a valid npm package name by itself because npm scoped packages require both
a scope and a package name.

The initial npm distribution package can be:

```text
@scifi-kit/registry
```

The local `models.json` maps the logical namespace to that physical source.
This separation lets a publisher split or relocate storage without changing
the model addresses used by consumers.

An unconfigured registry can be addressed explicitly:

```sh
bunx vibe3d add npm:@acme/space-kit#airlock
```

After validation, the CLI may offer to save the registry's declared namespace
in `models.json`, allowing later use of `@acme-space/airlock`.

## Consumer configuration

### `models.json`

`models.json` is user-owned project configuration for
`components.json`.

An illustrative configuration is:

```json
{
  "$schema": "https://vibe3d.dev/schema/models.json",
  "engine": "three",
  "typescript": true,
  "aliases": {
    "vibe3d": "@/lib/vibe3d",
    "models": "@/models"
  },
  "registries": {
    "@scifi-kit": {
      "source": "npm:@scifi-kit/registry",
      "version": "^1.0.0"
    }
  }
}
```

The final schema should include:

- schema version;
- engine, fixed to `three` in the initial protocol;
- TypeScript preference;
- source and target aliases;
- allowed installation roots;
- configured registry namespaces and version ranges;
- npm registry configuration where necessary;
- optional material-source defaults;
- formatting preferences;
- dependency installation policy.

The file should contain configuration only. Installed state belongs in a
separate receipt.

### `models.lock.json`

`models.lock.json` is CLI-owned installation state. It records:

- source provider and source identity;
- exact registry package version;
- npm tarball integrity or remote content hash;
- installed registry items;
- resolved registry dependency graph;
- target file paths;
- original installed hash for every file;
- npm dependencies added for each item;
- Vibe3D schema version used for installation.

Separating configuration and receipts allows consumers to edit `models.json`
while the CLI can still distinguish unmodified installed files from locally
edited ones.

## Source providers

Registry resolution is provider-based. The address and registry protocols must
not assume that npm is the only source.

Planned providers are:

```text
npm:@scope/package
https://example.com/registry.json
github:owner/repository
file:../local-registry
```

Only npm is required for the first release. Local files should follow soon so
registry authors can test unpublished work.

For npm sources, Vibe3D downloads and inspects the published artifact. It does
not install the registry package into `node_modules` and does not execute its
lifecycle scripts. It reads the declared manifest and selected source payload,
verifies integrity when available, validates all paths, and copies only files
selected through resolved registry items.

## Registry package contract

A compatible npm package declares where its built Vibe3D registry is located.
An illustrative package manifest is:

```json
{
  "name": "@scifi-kit/registry",
  "version": "1.0.0",
  "keywords": ["vibe3d", "vibe3d-registry", "threejs"],
  "vibe3d": {
    "registry": "./dist/registry.json"
  },
  "files": ["dist"]
}
```

The registry manifest contains:

- registry schema version;
- namespace;
- title, description, author, license, and homepage;
- default bundle item;
- Vibe3D compatibility range;
- Three.js compatibility range;
- required renderer or shader capabilities;
- items and their dependency graph;
- source files and safe target hints;
- content hashes;
- optional thumbnails, previews, documentation, and search metadata.

An illustrative registry header is:

```json
{
  "$schema": "https://vibe3d.dev/schema/registry.json",
  "schemaVersion": 1,
  "namespace": "@scifi-kit",
  "defaultItem": "kit",
  "compatibility": {
    "vibe3d": "^1.0.0",
    "engine": "three",
    "three": ">=0.185.0",
    "capabilities": ["webgpu", "tsl"]
  }
}
```

Vibe3D itself targets the Three.js object model. Individual registries declare
more specific renderer requirements. The current sci-fi wear implementation,
for example, may require WebGPU and TSL even though another Vibe3D registry can
target standard WebGL materials.

## Registry items

Useful item types include:

- `vibe3d:model` for one installable model;
- `vibe3d:kit` for a bundle or kit entrypoint;
- `vibe3d:lib` for shared source such as primitives or ownership helpers;
- `vibe3d:materials` for a material source or kit theme;
- `vibe3d:file` for supporting source or static assets.

A model item declares files, npm dependencies, Vibe3D registry dependencies,
compatibility requirements, and model metadata.

```json
{
  "name": "modular-wall",
  "type": "vibe3d:model",
  "title": "Modular Wall",
  "registryDependencies": [
    "@vibe3d/core",
    "@scifi-kit/materials",
    "@scifi-kit/primitives"
  ],
  "dependencies": ["three@^0.185.0"],
  "files": [
    {
      "path": "src/models/modular-wall/index.ts",
      "target": "models/scifi-kit/modular-wall.ts"
    }
  ]
}
```

### Procedural source and compiled topology

Schema-v2 model items may declare a source representation plus disposable
compiled-topology representations. This is intended for procedural families
whose surface extraction, topology repair, LOD construction, adjacency, and
collision generation are expensive, while final positions and materials still
need to vary at runtime.

The source recipe remains authoritative. A compiled topology artifact contains
normalized domain coordinates, stable vertex IDs, triangle connectivity, LOD
index buffers, adjacency, collision indices, validation claims, and source and
compiler fingerprints. It must not contain a final GLB, final world-space
positions, final normals, textures, material values, or scene objects.

Representation capabilities are local to the representation. A procedural
source or compiled materializer may require WebGPU and TSL without forcing the
same requirements onto an independent portable representation.

Schema-v1 registries remain valid and retain their existing `files`-only
installation behavior. An installer promotes `models.lock.json` to version 2
only after installing a compiled artifact.

The complete kit is dependency composition rather than a second copy of every
file:

```json
{
  "name": "kit",
  "type": "vibe3d:kit",
  "registryDependencies": [
    "@scifi-kit/modular-wall",
    "@scifi-kit/road-curb",
    "@scifi-kit/armored-crate"
  ]
}
```

Source manifests may be split across directories for maintainability. The
registry build step validates and flattens them into installable artifacts.

## Installed source layout

The default target layout should separate universal Vibe3D support from
kit-owned code:

```text
src/
|-- lib/
|   `-- vibe3d/
|       |-- model.ts
|       |-- materials.ts
|       |-- ownership.ts
|       `-- primitives/
|-- kits/
|   `-- scifi-kit/
|       |-- context.ts
|       |-- materials.ts
|       `-- contract.ts
`-- models/
    `-- scifi-kit/
        |-- modular-wall.ts
        |-- road-curb.ts
        `-- armored-crate.ts
```

Registry files use canonical logical imports. During installation, Vibe3D
rewrites those imports to the aliases configured by the consumer. A registry
must not assume the consumer uses this exact folder layout.

## Three.js model protocol

The common protocol should be deliberately small. Registries can add strongly
typed configuration, actions, parts, and metadata without inheriting from a
shared base class.

```ts
export interface ModelInstance<
  Config,
  Parts = Record<string, PartHandle>,
  Actions = Record<string, never>,
> {
  readonly root: Group
  readonly parts: Parts
  readonly actions: Actions
  readonly materials: MaterialBindings
  readonly sockets: SocketMap

  getConfig(): Readonly<Config>
  configure(patch: Partial<Config>): ConfigureResult
  update(deltaSeconds: number): void
  dispose(): void
}
```

Models can use classes internally. The conventional public entrypoint remains
a factory so registries expose one consistent construction shape and retain
freedom to change the implementation.

```ts
const wall = createModularWall(kit, {
  width: 4,
  height: 3,
  thickness: 0.25,
})

scene.add(wall.root)
wall.configure({ width: 6 })
```

The consumer owns the scene, renderer, camera, and render loop:

```ts
wall.update(deltaSeconds)
renderer.render(scene, camera)

scene.remove(wall.root)
wall.dispose()
```

### Stable identity

`root` must retain object identity for the lifetime of a model instance.
Configuration changes that require new topology rebuild generated contents
inside that stable root. This preserves scene parenting, transform controls,
editor selection, and external references to the model root.

`configure()` can be expensive. Width, height, thickness, variants, and
material changes may regenerate geometry, rebake wear, and rebuild static
batches. It is intended for user-driven configuration, not continuous
per-frame animation.

Interactive state belongs in typed actions and `update()`:

```ts
crate.actions.setOpen(true)
crate.update(deltaSeconds)
```

## Accessible runtime anatomy

Installed source is the final escape hatch, but consumers also need reliable
runtime access without traversing anonymous meshes.

Each model exposes:

1. stable semantic part handles;
2. material bindings;
3. sockets and attachment points;
4. typed actions;
5. the complete raw Three.js root.

```ts
export interface ModularWallParts {
  frame: PartHandle<Group>
  panels: PartHandle<Group>
  serviceBay: PartHandle<Group>
  collision: PartHandle<Group>
}

export interface PartHandle<T extends Object3D = Object3D> {
  readonly anchor: T
  readonly content: Object3D
}
```

The semantic `anchor` is stable. Generated `content` may be replaced when the
model rebuilds. Consumer-owned lights, labels, effects, gameplay objects, and
other attachments are parented to the anchor so they survive rebuilds.

```ts
wall.parts.serviceBay.anchor.add(serviceLight)
wall.parts.frame.anchor.visible = false
```

Generated objects also carry durable names and metadata for raw inspection:

```ts
mesh.name = "modular-wall/frame/lower-rail"
mesh.userData.vibe3d = {
  model: "@scifi-kit/modular-wall",
  part: "frame.lowerRail",
  materialSlot: "frame"
}
```

Typed parts are the supported boundary. Consumers remain free to traverse
`root`, manipulate raw Three.js objects, or edit installed source.

## Kit contexts and material sources

A kit is an explicit dependency scope, not a scene object and not a global
singleton.

```ts
const kit = createSciFiKit({
  materials: createSciFiMaterialSource()
})

const wall = createModularWall(kit, config)
```

The material resolution order is:

```text
per-model-instance override
            |
            v
project or kit override
            |
            v
kit default material source
```

Materials use semantic slots such as:

```text
surface.shell
surface.graphite
hardware.steel
recess.ink
signal.amber
signal.cyan
```

Models expose inspectable bindings:

```ts
wall.materials.get("shell")
wall.materials.override("shell", customMaterial)
wall.materials.reset("shell")
```

Ownership rules are part of conformance:

- kit-created cached materials are reference-counted;
- model-created resources are disposed by the model;
- caller-supplied materials are borrowed and never disposed by the model;
- `dispose()` is idempotent;
- changing a material source invalidates affected models predictably.

The existing sci-fi wear system bakes surface identity into geometry and can
replace several source materials with one shader material. In the first
Vibe3D-compatible implementation, material overrides are resolved before that
bake and changing them can rebuild the model. Arbitrary external materials can
use a raw, unbatched path when they cannot participate in the baked-wear
pipeline.

## Model definitions and metadata

Every model exports a serializable definition alongside its factory. This
definition drives registry validation, generated documentation, catalog
controls, and conformance tests.

It includes:

- stable model ID;
- title, description, categories, and tags;
- default configuration;
- configurable fields with type, limits, step, units, and documentation;
- material slots;
- semantic parts;
- sockets;
- actions;
- envelope and pivot metadata where applicable;
- renderer capabilities;
- preview and thumbnail metadata.

The TypeScript configuration type remains the runtime source of truth. The
serializable control schema describes the subset that tools can inspect and
edit generically.

## Monorepo layout

The repository uses this workspace structure:

```text
vibe3d/
|-- apps/
|   `-- docs/                     # documentation and live model catalog
|-- packages/
|   |-- cli/                      # published as `vibe3d`
|   |-- schema/                   # JSON schemas and protocol types
|   |-- registry-sdk/             # registry authoring and build tools
|   |-- conformance/              # compatibility tests
|   |-- registry/                 # source loading, resolution, installation
|   `-- vibe-model/               # distributable authoring skill
|-- registries/
|   `-- scifi-kit/                # reference registry
|-- assets/prototypes/            # canonical sci-fi model source
|-- models.json                   # monorepo dogfooding configuration
|-- package.json
`-- bun.lock
```

Not every model becomes a workspace or npm package. Initially, one workspace
and npm package represents one registry. The root stays private.

The implementation maps responsibilities as follows:

- the model browser and documentation share `apps/docs`;
- the packaged authoring workflow lives in `packages/vibe-model`;
- stable universal contracts are installed from `packages/cli/templates`;
- shared primitives and mountable materials are compiled into the Sci-Fi Kit
  core item;
- `registries/scifi-kit` compiles canonical model sources from
  `assets/prototypes` into its npm-ready manifest;
- references and visual briefs remain authoring evidence and are not installed
  unless a registry item explicitly declares them.

## Publishing workflow

Third-party authors should be able to create a registry without joining a
central repository:

1. run `vibe3d registry init`;
2. author registry source and item manifests;
3. run `vibe3d registry build` to validate and flatten the registry;
4. run `vibe3d registry test` against the vanilla Three.js fixture;
5. inspect package contents;
6. publish the registry package to npm;
7. optionally submit it to a Vibe3D discovery index.

A registry can use its own model classes, factories, geometry code, material
system, and visual style. Compatibility depends only on the registry format,
declared dependencies, safe install behavior, and the minimal model protocol.

## Conformance

Conformance should be executable and versioned. Tests cover:

- registry and item schema validity;
- complete, acyclic dependency resolution;
- safe file targets and normalized paths;
- compatibility metadata;
- successful installation into a clean fixture;
- TypeScript compilation after installation;
- a valid Three.js model instance;
- stable root and semantic part anchors after configuration;
- finite geometry and valid bounds;
- material override precedence;
- preservation of caller-owned resources;
- idempotent disposal;
- correspondence between declared and runtime parts, materials, actions, and
  sockets;
- registry closure for a complete kit bundle.

Passing conformance means the package follows the protocol. It does not mean
the package is secure, performant, visually good, or endorsed.

Marketplace metadata should distinguish:

- schema valid;
- conformance tested;
- signed or provenance-backed artifact;
- verified publisher;
- Vibe3D-curated package;
- unverified community package.

## Security and installation safety

Vibe3D installs executable source into a consumer project, so inspection and
safe defaults are mandatory.

The CLI must:

- never execute registry package lifecycle scripts;
- validate every registry document before resolution;
- reject absolute paths and path traversal;
- restrict writes to configured project roots;
- resolve and validate the complete dependency graph before writing;
- verify npm integrity or remote content hashes when available;
- show new npm dependencies and capability requirements;
- provide `view` and dry-run behavior before installation;
- record exact resolved versions and hashes;
- avoid overwriting locally modified files without explicit confirmation;
- cap package, file, and expanded payload sizes;
- treat remote documentation and metadata as untrusted content.

Private npm registries should use the consumer's existing npm authentication
and registry configuration rather than introducing a second credentials store.

## Updates and local ownership

Installed files belong to the consumer. Vibe3D does not silently synchronize
them with upstream.

`vibe3d diff` compares:

- the originally installed file hash;
- the current local file;
- the newly resolved upstream file.

An update can replace an unchanged local file directly after confirmation. A
locally modified file requires a visible diff and explicit conflict decision.
The first implementation does not need an automatic three-way merge; a safe
side-by-side output is preferable to destructive automation.

Removing a model must also be conservative. Shared files and dependencies are
removed only when the receipt proves no remaining installed item depends on
them and their local content is unchanged.

## Package size and future sharding

One npm package per registry is the initial publishing unit. This keeps kit
versions coherent and avoids hundreds of independently published packages.

The tradeoff is that npm downloads the complete registry tarball even when a
consumer selects one item. This is acceptable while payloads are predominantly
TypeScript. The protocol must not assume a registry has only one package so a
large registry can later shard storage by collection:

```text
@scifi-kit/registry
@scifi-kit/architecture
@scifi-kit/industrial
@scifi-kit/medical
```

The public address remains `@scifi-kit/modular-wall`; the registry catalog
chooses the physical payload. Large binary textures and GLBs can eventually
use content-addressed external assets with declared hashes rather than making
every consumer download one large npm artifact.

## Migration plan

The migration is incremental; existing `model.ts` entrypoints remain usable
until converted.

### Phase 1: specification

1. Freeze registry address semantics.
2. Define `models.json` and `models.lock.json` schemas.
3. Define registry and registry-item schemas.
4. Define the minimum Three.js model protocol.
5. Define resource ownership and stable anatomy requirements.

### Phase 2: workspace boundaries

1. Add the Bun workspace layout.
2. Separate authoring-only forge code from installable source.
3. Create the base and sci-fi registry workspaces.
4. Move the model browser into an app workspace.
5. Preserve compatibility imports while migration is incomplete.

### Phase 3: reference conversions

Convert three archetypes first:

1. configurable modular wall;
2. static road curb;
3. interactive armored crate or toolbox.

Each conversion must exercise configuration, material overrides, semantic
parts, runtime actions, rebuilding, and ownership.

### Phase 4: registry tooling

1. Build registry composition and validation.
2. Build the conformance fixture and test runner.
3. Generate flattened installable artifacts.
4. Generate catalog metadata from the same definitions.

### Phase 5: consumer CLI

Implement in this order:

1. `vibe3d init`;
2. local registry resolution;
3. `vibe3d view`;
4. npm registry resolution;
5. recursive dependency resolution;
6. `vibe3d add`;
7. installation receipts;
8. `vibe3d diff`;
9. safe updates and removals.

### Phase 6: reference publication

1. Publish the Vibe3D CLI.
2. Publish the schema and registry tooling as needed.
3. Publish `@scifi-kit/registry`.
4. Install the published registry into the vanilla Three.js fixture.
5. Validate both individual and complete-kit installation paths.

### Phase 7: ecosystem

1. Document third-party publishing.
2. Support registry discovery and search.
3. Add validation badges and provenance metadata.
4. Add URL and GitHub providers.
5. Add sharded and external binary payload support when registry size requires
   it.

### Phase 8: catalog migration

Convert the remaining sci-fi models gradually. Do not block the Vibe3D
platform on converting every prototype, and do not move all model folders
before the three reference archetypes validate the architecture.

## Architecture decision summary

```text
vibe3d
  = protocol + CLI + schemas + resolver + conformance

@scifi-kit
  = logical registry namespace

@scifi-kit/modular-wall
  = logical registry item address

@scifi-kit/registry
  = initial physical npm distribution package

installed models
  = consumer-owned local Three.js source
```

The platform succeeds when a third-party registry can publish a compatible
model without depending on this repository, a consumer can inspect it before
installation, and the installed result is ordinary editable Three.js source
with stable runtime access to its materials, parts, sockets, configuration,
actions, and raw scene graph.

## External references

- [npm package specification](https://docs.npmjs.com/cli/v11/configuring-npm/package-json)
- [Three.js object model](https://threejs.org/manual/#en/scenegraph)
- [Bun workspaces](https://bun.sh/docs/pm/workspaces)
- [npm scopes](https://docs.npmjs.com/about-scopes/)
- [npm registry signatures](https://docs.npmjs.com/about-registry-signatures/)
