# Hard-surface modeling rules

## Shape language and edges

1. Make the primitive carry the authored look. Use tangent corner fillets, a
   bevel band between broad faces and side walls, and shared normals across
   those bands. Keep straight runs flat.
2. Budget bevels by perceptual role. One bevel facet with smoothed normals is
   the default. Add a second segment only to hero masses whose silhouette or
   highlight needs it. Keep tiny marks and inset details flat and inexpensive.
3. Grade cuts per corner and break perfect mirrors. Accept per-corner chamfer
   values where they affect the silhouette and vary mirrored detail placement
   deliberately.
4. Choose the extrusion axis from the required facets. Decide which edges must
   affect the silhouette, orient the ring into that plane, then extrude along
   the remaining axis.

## Geometry correctness

5. Assume winding changes when a ring insets. For a suspect cap or inward rim,
   compare the first triangle's edge cross product with the intended outward
   normal.
6. Keep chamfers below roughly sixty percent of the affected half-extent.
   Clamp against the thinnest dimension and inspect for finite,
   non-degenerate triangles.
7. Size physical features in world units. Bevels, seams, wear bands, bolts, and
   clearances represent physical dimensions; do not scale them as a percentage
   of every host part.

## Layering, depth, and batching

8. Calculate clearance for every applied layer. Compare the host face with the
   detail's back and front faces. In this metre-scale kit, begin with at least
   0.015 units of clearance and verify from the actual camera.
9. Build, bake, then merge. Derive adjacency data, surface identity, semantic
   parts, and material ownership while objects remain separate. Merge only
   afterward. Normalize vertex attributes before merging and respect the
   renderer's vertex-buffer budget.
10. Keep runtime anchors outside replaceable generated content. Configuration
    can rebuild geometry without invalidating consumer attachments.

## Reference matching

11. Measure the reference and solve the camera with the model. Compare clean
    silhouette bounds and cross-sections rather than reflections, smoke,
    shadows, or effects that extend the apparent shape.
12. Tune yaw, pitch, focal length, and target together. Incorrect perspective
    can make correct dimensions look wrong.
13. Treat critic feedback as evidence, not a numeric gradient. Prefer changes
    that recur across independent critiques. If critics disagree about the same
    dimension, spend the next iteration on a more stable mismatch.

## Vibe3D runtime contract

14. Keep the model root stable for its entire lifetime. Rebuild generated
    children inside it when topology changes.
15. Expose meaningful runtime anatomy through stable semantic part anchors,
    sockets, material slots, and typed actions. Do not make consumers depend on
    anonymous mesh order.
16. Respect ownership. Dispose model-owned resources exactly once and never
    dispose materials or textures supplied by the consumer.
17. Keep preview scenery, lights, floors, cameras, smoke, and diagnostic effects
    out of the installed model root or mark them for export exclusion.
