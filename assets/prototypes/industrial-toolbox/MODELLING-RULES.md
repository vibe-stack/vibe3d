# Modelling rules learned building industrial-toolbox

Hand these over with `model.ts`. The generator shows *what* was built; these are
the things that cost iterations to learn and are not obvious from reading it.

## 1. The primitive decides whether it looks hand-authored

A prop built from hard 45° clips with flat-shaded normals reads as
"mathematical" no matter how good the proportions are. The fix is one building
block that carries:

- a **fillet** on every ring corner (tangent arcs, so the tangent points inherit
  the arc normal, which equals the adjacent edge normal);
- a **bevel** rolling the front and back face edges into the side walls;
- **normals shared across those bands**.

Straight runs then stay perfectly flat while every edge picks up a soft
highlight. This single change did more for the "hand-authored" read than any
amount of proportion tuning.

## 2. One bevel facet, budgeted by role

A 3-segment fillet plus a 2-segment edge roll applied uniformly — including to
4 cm engraved slots — cost **28,873 triangles**. Dropping to *one* facet with
smoothed normals (the standard game-art bevel trick), letting only hero masses
opt into a second segment, and making engraved marks flat quads (2 triangles
each) gave **9,135 triangles and a better silhouette**.

A hand modeller bevels the masses that read and leaves small detail flat. Match
that distribution, not a uniform setting.

## 3. Grade corner cuts per corner, and break the mirror

Uniform chamfers look generated. Take a `Corners` tuple, not a scalar: a large
cut on the outer bottom, a small one inboard. Mirrored parts should differ
slightly in their detail placement — a perfect mirror is more obvious than any
noise pattern.

## 4. Pick the extrusion axis for the facet you need

A ring-based prism can only chamfer in its **ring plane**. The lid needed a 45°
facet on its front-top edge, which is impossible in the default orientation and
made it read as a slab through several iterations. Extruding along X instead —
so the ring lies in ZY — put the cuts on the front-top and back-top edges, and a
large end bevel supplied the matching chamfer at both ends in the same
primitive.

Decide the extrusion axis from which edges carry the silhouette.

## 5. Winding flips when a ring insets inward

Two separate winding bugs cost several iterations, and both looked like
"transparent faces":

- inverted cap fans made every prism's front face cull, so you could see
  through the whole model;
- an inset rim ring runs *inward* from the rim, which reverses its winding
  relative to the outward-facing wall bands, leaving a ring-shaped hole around
  the perimeter of every broad face.

Whenever a ring moves inward, assume its winding flips. Verify by taking the
first triangle's edge cross product and checking its sign against the intended
face normal — it is a two-minute check that saves a render cycle.

## 6. Clamp chamfers to ~0.6 of the half-extent

Clamping to 0.85 leaves a thin prism with only 15% of its side as straight edge;
filleting both ends of that collapses it into zero-area slivers. 0.6 leaves real
straight edge between clips.

## 7. Feature sizes are constant in world units, not proportional

Anything meant to read as a physical feature — a bevel, a wear band, a seam —
must be a fixed world size. Scaling it with the part it sits on is the classic
tell of a generated asset: a bolt and a lid end up with the same *relative*
detail instead of the same *absolute* detail.

For a constant-width band across faces of different sizes, add an inset ring at
a fixed distance from the rim rather than interpolating from rim to centre.

## 8. Compute clearance for every layered detail

Two different failures, same root cause — nobody checked the front-face depth:

- The signature amber strips sat at `z = 2.197` while the door plates in front
  of them reached `z = 2.285`. The most distinctive landmark on the prop was
  fully buried and survived only as nubs at the outer edges.
- Marks sitting 0.002–0.004 off their panel z-fought permanently.

For every applied detail, compute the front face of the detail *and* of whatever
it sits on. Give applied detail ≥ 0.015 clearance. Then push the camera near
plane as far out as the scene allows — going 0.1 → 0.5 on a 6-unit prop viewed
from 17 units fixed more z-fighting than the offsets did, because a near plane
that close throws away nearly all depth precision on empty space.

## 9. Build → bake → merge, in that order

Merging by material is a delivery step and it constrains everything upstream:

- `mergeGeometries` requires **identical attribute sets** across a batch, so
  normalise or strip attributes per batch; different primitives authoring
  different subsets will fail the merge.
- Anything derived from part adjacency — occlusion, surface identity — must be
  baked while the parts are still separate. After the merge there is nothing
  left to derive it from.
- WebGPU allows **8 vertex buffers**; position/normal/uv take three. Plan the
  attribute layout, and pack into vec4s rather than adding buffers.

## 10. Measure the reference, and treat the camera as part of the match

Pixel-measure the silhouette bounding box and column profiles rather than
eyeballing proportions — but know the reference's traps. This one is rendered
over a reflective floor, so scans of its left columns report a silhouette
extending well below the actual case, inventing a left/right asymmetry that
reads as a camera error and sends you chasing yaw and focal length for nothing.
Only the clean half is comparable.

The camera is part of the match. Correct proportions look wrong under the wrong
yaw, pitch and focal length: 32°/13° made the case read deep and squat when
~22°/18–20° was correct, and too short a lens made the near end tower over the
far one in a way the reference never does.

Finally: a single visual-critic score is not a gradient. Four fresh critics
scored 62 / 70 / 66 / 68 while the model improved monotonically, and two of them
gave directly opposite instructions on the same mass. Act on notes that repeat
across independent passes; where critics contradict each other, that dimension
is probably already close.
