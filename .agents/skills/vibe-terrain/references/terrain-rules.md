# Terrain generation rules

## Field construction

1. Establish formation, gravity direction, scale, contact patch, and negative
   space before noise.
2. Build named geological structure from primitives and field operators. Use
   smooth unions only where the material or process supports rounded blending.
3. Assign every noise layer a process and world-space wavelength. Large-scale
   form, fracture, erosion, grain, and shader breakup must not share one octave
   stack.
4. Keep geology separate from biome. Geology controls mass, strata, joints,
   fracture, and erosion response; biome controls deposits, moisture, snow,
   growth, ash, staining, and palette.
5. Bound topology-preserving displacement. If a control can open a hole, split
   a component, invert a face, or change chunk connectivity, include it in the
   topology key.
6. Respect Nyquist per band. A displacement band of wavelength L needs at least
   ~3 grid samples per L to appear in an extracted mesh. Compute the grid's
   shortest representable wavelength, report which bands fall below it, and move
   those bands to the surface bake. A band finer than the grid does not add
   detail; it adds nothing, and hides the fact that it adds nothing.
7. Cap amplitude by the fold limit, not by taste. Subtracting displacement d from
   a distance field keeps a usable surface only while |grad d| stays near or
   below 1, and for a band of amplitude A and wavelength L that gradient is about
   2*pi*A/L. Amplitude is therefore a fraction of wavelength. Measure the
   near-surface gradient distribution and state the folded fraction; a few
   percent is the crease regime and is intended, tens of percent tears.
8. Get hardness from booleans, not amplitude. Trim planes, subtracted chunks and
   ridged or cellular creases are sharp at any angle and have no fold limit.
   Cranking smooth displacement amplitude to make rock look rocky reaches the
   fold limit long before it reaches the intended read.
9. Express boolean cut offsets as a fraction of the mass's own extent along the
   cut normal. Absolute offsets compared against comparable radii produce planes
   that graze without removing anything, leaving a convex silhouette.
10. Never build a field by displacing a resampled coarser field. Trilinear
    resampling is a low-pass filter and cannot introduce frequency content above
    the grid it reads from, so chained displacement passes only blur. Evaluate
    the field analytically at every sample.

## Surface extraction and topology

11. Choose the representation from required negative space. Never use a
    heightfield for caves, arches, or overhangs.
12. Preserve sharp material boundaries and fracture planes during surface
    extraction. Solve for the feature (a QEF over the crossing normals) rather
    than averaging crossing positions: averaging rounds every feature by about
    half a cell, so an averaged extraction cannot express a fracture plane no
    matter how sharp the field is.
13. Produce stable vertex identities and deterministic triangle ordering for a
    fixed compiler fingerprint.
14. Reject non-finite vertices, repeated triangle indices, unintended open
    boundaries, inconsistent winding, non-manifold edges, and sliver triangles
    below the profile threshold.
15. Store normalized domain coordinates and topology metadata in the compiled
    cache. Materialize final positions and normals from the recipe at runtime.
16. For high-to-low assets, build detail on a dense disposable reference,
    reduce or retopologize the game surface, and bake the lost normal, height,
    AO, curvature, and material-region response into a declared bake domain.
    Never spend runtime triangles on detail already represented by a bake.
17. A bake must be measured against the authoritative surface. Procedural noise
    generated in texture space is not a bake: it is unrelated to the model and
    recovers none of what the reduction removed. Verify the link numerically by
    reporting the reduction error and the relief the bake recovers, and by
    confirming every channel the material samples is actually written. Prefer
    tracing the analytic field over a mesh BVH, since the dense mesh is itself
    only a sampled approximation of that field. For rigid assets prefer
    object-space normals, which need no tangent-basis agreement.
17a. Reduce by solving, not averaging, and do not key clusters by normal
    orientation to preserve edges: that fragments mesh connectivity and breaks
    downstream chart growth and unwrapping. A QEF solve preserves the arris
    without splitting the mesh.

## Game readiness

18. Author LODs as part of compilation. Validate silhouette, chunk seams,
    material masks, collision correspondence, and transition behavior.
19. Use a separate simplified collision index buffer over the same bounded
    domain when practical. Collision must not expose visual cavities as walkable
    or seal gameplay openings.
20. Stress the full declared deformation envelope over multiple deterministic
    seeds. A good single mesh is not proof of a safe procedural family.
21. Keep generation and materialization budgets separately. The compiled path
    should avoid dense field extraction, repair, adjacency construction,
    simplification, collision construction, and high-to-low ray baking.

## Procedural materials

22. Derive stable masks from world/object position, geometric normal, slope,
    height, curvature, cavity, flow, and declared geological regions.
23. Use triplanar or field-aligned sampling for generator-driven breakup where
    UV seams would reveal the generator, and keep texel and noise frequency
    stable in world units. A high-to-low bake is the exception and must be
    sampled by its atlas UVs: it is defined per texel against a specific surface
    point, so reading it by world position decouples the detail from the geometry
    it was measured on.
24. Make deposits directional: snow settles, water follows gravity and cavities,
    windward faces abrade, and moss follows moisture and exposure.
25. Budget preview lighting against the renderer's tonemap and exposure. Lights
    summing far above unit irradiance clip albedo into the highlight rolloff,
    which makes the surface read as washed-out white and makes every subsequent
    colour change look like it had no effect.
26. Keep geometry and material scale coherent. Shader microdetail must not
    contradict the fracture or grain size in the mesh.

## Runtime ownership

27. Keep the model root stable across regeneration. Replace generated children
    without invalidating consumer anchors.
28. Dispose GPU buffers, materials, and textures owned by the instance exactly
    once. Never dispose consumer-supplied resources.
29. Keep preview scenery and diagnostics outside the installed root or mark
    them with `userData.excludeFromExport = true`.
