# Terrain preview loop

## Capture matrix

Capture early, after macro structure and extraction work:

- seeds 1, 2, and 3 from one fixed hero camera;
- one orthographic or low-distortion shape view;
- one wireframe/topology diagnostic;
- each declared LOD from the hero camera;
- neutral light and one biome context;
- contact/collision overlay when placement affects gameplay.

Use deterministic camera, light, environment, time, seed, recipe hash, compiler
hash, and profile. Record them with every accepted capture.

## Critique order

1. Geological identity and formation.
2. Macro silhouette, balance, contact, and negative space.
3. Structural hierarchy: strata, joints, fractures, erosion, deposits.
4. Repetition or isotropic noise artifacts.
5. Material scale and biome response.
6. Topology health, normals, seams, and LOD transitions.
7. Source compile time, compiled materialization time, memory, and triangle
   budgets.

Ask an independent critic for a resemblance/read score, what works, and no more
than three prioritized corrections. Give the critic only the catalogue brief,
reference evidence, beauty matrix, and relevant diagnostics.

Accept at 85 or higher only if technical validation also passes. Stop after two
plateauing scores or ten iterations. When seeds fail in different ways, tighten
the procedural family or split it into separate topology domains rather than
tuning toward one lucky seed.
