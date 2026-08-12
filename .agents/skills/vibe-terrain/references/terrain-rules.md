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

## Surface extraction and topology

6. Choose the representation from required negative space. Never use a
   heightfield for caves, arches, or overhangs.
7. Preserve sharp material boundaries and fracture planes during surface
   extraction. Do not smooth away the feature that identifies the formation.
8. Produce stable vertex identities and deterministic triangle ordering for a
   fixed compiler fingerprint.
9. Reject non-finite vertices, repeated triangle indices, unintended open
   boundaries, inconsistent winding, non-manifold edges, and sliver triangles
   below the profile threshold.
10. Store normalized domain coordinates and topology metadata in the compiled
    cache. Materialize final positions and normals from the recipe at runtime.

## Game readiness

11. Author LODs as part of compilation. Validate silhouette, chunk seams,
    material masks, collision correspondence, and transition behavior.
12. Use a separate simplified collision index buffer over the same bounded
    domain when practical. Collision must not expose visual cavities as walkable
    or seal gameplay openings.
13. Stress the full declared deformation envelope over multiple deterministic
    seeds. A good single mesh is not proof of a safe procedural family.
14. Keep generation and materialization budgets separately. The compiled path
    should avoid field extraction, repair, adjacency construction,
    simplification, and collision construction.

## Procedural materials

15. Derive stable masks from world/object position, geometric normal, slope,
    height, curvature, cavity, flow, and declared geological regions.
16. Use triplanar or field-aligned sampling where UV seams would reveal the
    generator. Keep texel and noise frequency stable in world units.
17. Make deposits directional: snow settles, water follows gravity and cavities,
    windward faces abrade, and moss follows moisture and exposure.
18. Keep geometry and material scale coherent. Shader microdetail must not
    contradict the fracture or grain size in the mesh.

## Runtime ownership

19. Keep the model root stable across regeneration. Replace generated children
    without invalidating consumer anchors.
20. Dispose GPU buffers, materials, and textures owned by the instance exactly
    once. Never dispose consumer-supplied resources.
21. Keep preview scenery and diagnostics outside the installed root or mark
    them with `userData.excludeFromExport = true`.
