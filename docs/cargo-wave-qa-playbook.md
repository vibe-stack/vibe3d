# Cargo wave QA playbook — layering, joinery, and the four systemic defects

Scope: the 50-prop cargo/storage/logistics wave on `feat/axiom-pack-wave-2`, all built on
`assets/prototypes/axiom-cargo-kit/`. This is a **fix specification**, not a review. Every rule
below is numeric so that fifty fixer agents produce one answer instead of fifty.

Read this file top to bottom before touching a model. Sections 1–3 are the contract, section 4 is
the per-class fix procedure, section 5 lists the fixes that belong in the shared kit (do those
first — several per-model defects disappear when the kit lands), section 6 is the per-model table.

---

## 1. The layering convention as it exists today

### 1.1 What the kit actually does

`parts.ts` exports `LAYER_CLEARANCE = 0.016` and `lift(position, face, distance)`.
**Nothing in the kit references `LAYER_CLEARANCE`.** Every helper hard-codes its own offset. The
real, measured contract is the table below. All numbers are metres, measured **along the host face
normal, relative to the position argument you pass in**.

| Helper | Layer geometry | Back face | Front face |
| --- | --- | ---: | ---: |
| `bolt(pos, r, face)` | cyl ⌀2r × 0.03 at `+0.008` | −0.007 | +0.023 |
| `seam` / `seamRun` | open groove, rim at `+0.002` | floor at `+0.002 − depth` | rim +0.002 |
| `plaque()` plate | prism t=0.022 at `+0.008` | −0.003 | +0.019 |
| `plaque()` decal plane | `PlaneGeometry` at `+0.0205` | — | +0.0205 |
| `radialPlaque()` plate | prism t=0.02 at `r+0.006` | r−0.004 | r+0.016 |
| `radialPlaque()` decal | plane at `r+0.019` | — | r+0.019 |
| `stencil()` | bare plane at `+0.004` | — | +0.004 |
| `tick()` | bare quad at `+0.003` | — | +0.003 |
| `paintMark(t)` | extrusion t at `+0.36·t` | −0.14·t | +0.86·t |
| `statusLens()` bezel | prism t=0.04 at `+0.010` | −0.010 | +0.030 |
| `statusLens()` lamp | prism t=0.026 at `+0.032` | +0.019 | +0.045 |
| `recessedHandle()` well | prism t=0.055 at `−0.005` | −0.0325 | +0.0225 |
| `recessedHandle()` bar | prism t=0.038 at `+0.026` | +0.007 | +0.045 |
| `toggleLatch(s)` keeper | prism t=0.05s at `+0.012s` | −0.013s | +0.037s |
| `toggleLatch(s)` paint | prism t=0.055s at `+0.045s` | +0.0175s | +0.0725s |
| `toggleLatch(s)` lever | prism t=0.03s at `+0.075s` | +0.060s | +0.090s |
| `louvreVent()` surround | prism t=0.045 at `+0.010` | −0.0125 | +0.0325 |
| `louvreVent()` well | prism t=0.05 at `+0.032` | +0.007 | +0.057 |
| `louvreVent()` slats | prism t=0.032 at `+0.050` | +0.034 | +0.066 |
| `forkPocket()` plate | prism t=0.05 at `+0.012` | −0.013 | +0.037 |
| `forkPocket()` tunnel | prism t=depth at `−depth/2` | −depth | 0 |

**The implied convention — the one the helpers were designed around — is:**
`position` is the host's **outer surface**, not its centre plane and not the surface plus a
hand-rolled epsilon. Every helper that needs to embed already embeds (note the negative back-face
numbers) and every helper that needs to stand proud already stands proud.

Everything else is a volume **centred** on the position you give it: `box`, `prism`, `cylinder`,
`member`, `tubeSection`, `cornerCasting`.

Four helpers are **not** centred, and assuming they are is a defect source in its own right
(see **K12**):

| Helper | Origin | Extents relative to the position |
| --- | --- | --- |
| `drum(r, h, pos)` | base | body `y … y + h`; chimes at `y+0.035` and `y+h−0.035` |
| `castor(pos, radius)` | axle | tyre bottom `y − radius`; mount plate top `y + 1.85·radius + 0.0175` |
| `hookBlock(pos, s)` | shackle cross pin | ears to `−0.31s`; swivel nut `−0.425s`; hook body `−0.55s … −1.17s` |
| `extrudeProfile(profile, …)` | **the profile's own authored coordinates**; `position` is an *offset* added on top | the mesh occupies `authored profile + position`. See §1.2 pattern 5 and **K11** |

### 1.2 Where the convention is violated, and how

Five failure patterns, in descending order of frequency across the wave:

1. **Position given as a centre plane, not a face.** `container.ts sideWall()` places every
   side-wall detail at `z + side*0.055`, which is the *centre* of the 0.052-thick corrugation rib.
   The rib's outer face is at `z + side*0.081`. So the manifest plaque (front face at
   `z + side*0.075`), the amber slash `paintMark` and the seams all sit **inside** the ribs and are
   sliced by them.
2. **Position given as face + an ad-hoc epsilon.** There are **87 such call sites across 42 of the
   50 models** (`grep -rcE "(plaque|stencil|paintMark|statusLens|seam|boltRun|bolt|tick)\(.*\+ 0\.0"
   assets/prototypes/*/model.ts`). `+0.002`, `+0.004`, `+0.03` appear all over the
   models (`industrial-hoist` uses `BODY_D*0.5 + 0.004`, `wooden-pallet` uses
   `WIDTH*0.5 + 0.002`). Because `plaque`'s plate is designed to embed 3 mm, adding 4 mm turns a
   3 mm embed into a **1 mm float** — a hairline slit the rim light finds.
3. **Position given from a dimension that is not the face.** `industrial-forklift-loader` details
   its counterweight at `BODY_W*0.5 − 0.02 = 0.54`, but the counterweight is extruded
   `BODY_W − 0.06 = 1.06` deep, so its face is at **0.53**. Every plaque, seam and bolt run on that
   flank floats 7–12 mm.
4. **Axis-aligned helper applied to a curved body.** `plaque`/`paintMark`/`statusLens`/`stencil`
   only know the six box faces. `fuel-drum` puts its manifest plaque at
   `[R*0.72, y, R*0.72]` with face `'front'`: a flat plate at 45° to a cylinder, buried 89 mm at one
   end and hanging in mid-air past the silhouette at the other. `radialPlaque` exists for exactly
   this and is used by only a handful of models.
5. **A caller "compensating" for an `extrudeProfile` re-centring that does not happen.** The
   primitive normalises the profile to its bounding-box centre internally (lines 409–420) and then
   **adds that centre straight back** at line 625, so a profile lands at its authored coordinates
   plus `position`. The normalisation exists only so `rotation` pivots about the profile's centre.
   A caller who adds `height * 0.5` to correct for a shift that was already undone double-shifts its
   part — see **K11**.

### 1.3 Faceted cylinders

`cylinder()` builds N flat facets. **The visible surface is at `r·cos(π/N)`, not `r`.**

| N | sagitta (inside r) | at r = 0.38 | at r = 1.05 |
| ---: | ---: | ---: | ---: |
| 8 | 0.0761·r | 28.9 mm | 79.9 mm |
| 12 | 0.0341·r | 13.0 mm | 35.8 mm |
| 16 | 0.0192·r | 7.3 mm | 20.2 mm |
| 20 (`drum` default) | 0.0123·r | 4.7 mm | 12.9 mm |
| 22 | 0.0102·r | 3.9 mm | 10.7 mm |

`radialPlaque` puts its plate back face at `r − 0.004`. On a 20-facet drum of r = 0.38 the facet is
at 0.3753, so the plate back is 0.3 mm proud — **coplanar, z-fights**. On the r = 1.05 silo the same
plate back at 1.046 floats **6.7 mm** off the facet. Same helper, both failure modes, purely as a
function of radius.

## 2. The joinery convention as it exists today

There isn't one. Masses are butt-jointed on a shared plane and the pack relies on backface culling
to hide the coincidence. That works for a lid sitting on a body (opposite-facing caps) and fails
everywhere the two faces point the same way, and it produces a see-through slit the moment the two
spans do not actually meet. `containerShell()` is the worst case and it is shared by seven models:

| Joint | Panel span | Mating part span | Result |
| --- | --- | --- | --- |
| side/end panel ↔ top rail | y 0.46 … **2.25** | rail y **2.355** … 2.525 | **105 mm open slit** the full length of both sides and both ends |
| side/end panel ↔ skirt band | y **0.46** … 2.25 | skirt y 0.02 … **0.44** | **20 mm open slit** the full length |
| end panel ↔ corner post (z) | z ±**0.94** | post z ±(0.9755…1.1645) | **35.5 mm vertical slit** at each end-wall edge |
| door leaf ↔ door leaf | leaf A z −0.9…**−0.03**, leaf B **+0.03**…+0.9 | — | **60 mm centre gap**, you see straight into the box |

(Numbers for `shipping-container-standard`: length 6.06, width 2.44, height 2.59, casting 0.3,
skirt 0.42. The formulas in `containerMetrics()` produce the same slits at every other length.)

## 3. Depth precision — how big an offset actually has to be

Both capture paths matter, but the QA sheets go through the kit rig, so size to that.

- **`axiom-cargo-kit/preview.ts`** (`createCargoPreview`, used by `scripts/qa-sheet.mjs`):
  `new PerspectiveCamera(fov, aspect, 0.05, 200)` — near **0.05 m**, far **200 m**.
- **`scripts/asset-forge/preview.ts`** (`autoFrame`, only used for models that export a bare root):
  near `max(diag·0.005, 0.01)`, far `max(distance + diag·2, 10)`. For a 7 m container that is
  ≈ 0.035 / 30 — a *worse* ratio per metre than the kit rig by about 1.4×.

For a `[0,1]` depth buffer, `d = f/(f−n)·(1 − n/z)`, so one 24-bit ULP is worth

```
Δz  =  z² · (f − n) / (f · n · 2²⁴)  =  1.19e-6 · z²   metres      (kit rig)
```

| distance z | 1 ULP | 3 mm is worth |
| ---: | ---: | ---: |
| 2 m | 0.005 mm | 630 ULP |
| 5 m | 0.030 mm | 100 ULP |
| 8 m | 0.076 mm | 39 ULP |
| 12 m (container hero) | 0.17 mm | 17 ULP |
| 16 m | 0.31 mm | 10 ULP |
| 20 m (silo far side) | 0.48 mm | 6 ULP |

**Therefore:**

- **Hard floor: 3 mm** between any two same-facing surfaces anywhere in the wave. Below that you
  are inside the interpolation error at the far end of the biggest props.
- **`LAYER_CLEARANCE` (16 mm) is 33 ULP at 20 m** — comfortably safe, and it is the right unit for
  a *stacked* layer.
- **Do not rely on `polygonOffset`.** `createDecalMaterial()` sets `polygonOffsetFactor/Units` to
  −1/−1. The backend *does* honour it —
  `node_modules/three/src/renderers/webgpu/utils/WebGPUPipelineUtils.js:241` maps
  `polygonOffsetUnits → depthStencil.depthBias` and `polygonOffsetFactor → depthBiasSlopeScale` —
  but for a fixed-point depth attachment `depthBias` is measured in **ULPs**, so −1 buys 0.17 mm at
  12 m. It cannot rescue a coplanar pair. Treat it as a tie-breaker on top of real geometric
  clearance, never as the clearance itself. (The capture session requests `depthBuffer: true` with
  no stencil, i.e. `depth24plus`; if a backend promotes that to `depth32float` the far-field figures
  are of the same order, so size to the table above either way.)
- **Exactly coplanar is the actual bug.** Almost everything the user is seeing flicker is at
  **0.0 mm**, not at 0.5 mm. Hunt for shared planes, not for small numbers.

---

## 4. The four defect classes: root cause, rule, verification

### Class 1 — Z-index fighting (coplanar / near-coplanar)

**Root causes**

1. A detail positioned from a host's centre plane rather than its outer face, so a plate's back cap
   lands on a rib's mid-plane or exactly on the host skin (`cargo-trolley`: `plaque` at `z=−0.038`
   on a back panel whose face is at `z=−0.035` → the plate's inner cap is at **exactly −0.035**).
2. Two parts of the same size sharing a plane: `wooden-pallet` stringers are `0.1` deep at
   `z ∈ {−0.35, 0, 0.35}` and the blocks are `0.1` deep at the same z — four coincident, same-facing
   side planes per block.
3. Two copies of a mirrored part whose spans cross the centreline and overlap each other:
   `containerDoorLeaf` amber lock bars occupy `z −0.265…+0.095` and `−0.095…+0.265` — **190 mm of
   duplicated box**, same material, identical faces.
4. `cornerCasting`'s bore plug is `hexagon(socketRadius*0.99)` — a **0.55 mm** radial gap between
   the plug wall and the bore wall, which face each other.
5. A part fully contained inside another: `industrial-silo`'s slide gate (0.035 thick at
   `apex−0.03`) lives entirely inside the 0.14-thick gate frame at the same centre.

**The rule**

> **R1 — layer ladder.** The position you pass to any face-applied helper is
> `lift(hostOuterFace, face, LAYER_CLEARANCE * (n − 1))`, where `n` is the stacking index:
> `n = 1` for the first thing on the shell → pass the **exact outer face**;
> `n = 2` for anything mounted on that thing → face `+ 0.016`;
> `n = 3` → face `+ 0.032`.
> Never pass a centre plane. Never pass `face + 0.002 / 0.004 / 0.03`. Never pass `0`-clearance.
>
> **R2 — no shared planes.** If two solids must abut, one of them shrinks by **4 mm per shared
> face** (8 mm on the dimension). If two solids must overlap, see R5.
>
> **R3 — no duplicated volume.** A mirrored pair must not cross the mirror plane. Clamp the
> half-extent to the plane, or shorten the part.

**Verify in the QA sheet:** compare `front` (yaw 0, pitch 10) against `hero 3/4` (yaw 45, pitch 12)
and `top` (yaw 45, pitch 70). A coplanar pair changes which one wins between two tiles — the graphic
is clean in one and mottled or missing in the other. `top` and `below` change the depth slope the
most, so they expose it first.

### Class 2 — Elements off-centre

**Root causes**

1. **A constant offset applied to both members of a mirrored pair.** `storage-rack.upright()`
   receives `z = ±DEPTH*0.5` and then punches its slots at `z + UPRIGHT*0.5` **unconditionally**,
   so the front upright gets its punchings on its aisle face and the rear upright gets them on its
   *inner* face. It needs `z + Math.sign(z) * UPRIGHT*0.5`.
2. **A lone hard-coded coordinate that lands outside its host.** `storage-rack` paints its slash at
   `x = −BAY − 0.14 = −2.44`; the leftmost upright spans `−2.355 … −2.245`. The mark is 85 mm off
   the end of the rack, in mid-air.
3. **A pair that straddles nothing.** `fuel-drum`'s two crown lift lugs are mirrored in x
   (`±(R−0.11)`) but both sit at `z = +0.12`, so the pair is 120 mm off the crown's axis while the
   fill cap it flanks is at `z = 0`.
4. **The wrong axis constant.** `AXIS_X`, `AXIS_Y` and `AXIS_Z` are one token apart and the mistake
   is invisible in code review. `hard-equipment-case`'s tow-handle grip uses `AXIS_Z`, so a 400 mm
   bar runs aft into the lid at x = 0 instead of spanning the two stiles at x = ±0.19.
   `industrial-tool-chest`'s handle uses `AXIS_X` and ends up 53 mm clear of both its brackets.
   Check every `cylinder(..., AXIS_*)` against the axis its two mounts are separated along.
5. **An inverted sign on a mirrored rotation.** `industrial-dumpster` rakes its end walls with
   `rotation: [0, 0, sx * slant]` when the side profile rakes the other way — a 420 mm triangular
   hole at the tail. `industrial-tool-cabinet` opens both doors with the signs swapped, so each leaf
   sweeps through the carcass. `industrial-tool-cabinet` also computes `hingeX = side * leaf`, which
   is the leaf's *leading* edge, putting both piano hinges on the centre seam as exact duplicates.
6. **Compensating for an `extrudeProfile` shift that does not happen.** `sacks/model.ts:80` passes
   `position[1] + height * 0.5` to a profile already authored 0…height, so every sack lands half its
   own height too high — the whole stack floats **155–170 mm** above its sheet, and the neck and tie
   (authored in the un-shifted frame) end up buried at mid-height. See **K11**.

**The rule**

> **R4 — symmetry is computed, never typed.** Any detail on a mirrored host takes the host's own
> sign: `host + sign * offset`, never `host + offset`. Write the loop over `[-1, 1]` and multiply.
> A detail that is meant to be on the axis is placed at literal `0`, not at a value that happens to
> look centred.
>
> **R4a — a part is only "invisible" once.** Before adding detail, check it is not *inside* its
> host. A liner sized to the cavity, a knuckle at a small positive local z, a foot shorter than the
> plinth it sits in, a divider inside a solid tray block — all render as nothing. Nine models in
> this wave ship parts that never appear in any frame.
>
> **R4b — a profile keeps its authored coordinates.** `extrudeProfile` places the mesh at
> `authored profile + position`; `position` is an offset, not a centre. Do not "correct" for a
> re-centring — the primitive undoes its own normalisation at line 625. Verify: the mesh occupies
> `profileRange + position`, **not** `position ± bboxSize/2`.

**Verify in the QA sheet:** `front` and `back` are mirror views. A genuinely centred detail sits the
same distance from the left and right silhouette edges in **both** tiles. A mirrored pair swaps sides
between the two; if it does not swap, one of the two got a raw offset. `top` (yaw 45, pitch 70) is
the plan view — use it for anything that straddles an axis.

### Class 3 — Floating items

**Root causes**

1. **The face the author aimed at is not the face that exists** (`forklift` counterweight, above:
   0.54 vs 0.53; `industrial-hoist` `BODY_D*0.5 + 0.004` vs a 0.16 face; `storage-rack` plaque at
   `DEPTH*0.5 + 0.06 = 0.585` over a column guard whose face is at 0.575 → 7 mm).
2. **A flat helper on a curved body** (§1.2 pattern 4, and the facet sagitta of §1.3).
3. **A structural member whose end simply does not reach.** `industrial-silo`: four legs top out at
   `y = LEG = 2.2` at radius 0.85; the hopper cone passes through radius 0.85 at `y = 3.079`. The
   silo hangs **879 mm** above its own legs. `cargo-net`: the four corner hooks are at
   `±(SPAN/2+0.05), ±(DEPTH/2+0.05)` while the perimeter rope they should pull on is at
   `±(loadX+0.012), ±(loadZ+0.012)` — 68 mm short in both axes, and the claw profile also drops
   15 mm below y = 0. `cargo-trolley`: the axle is at `z = −0.09`, the frame's axle brackets span
   `z −0.069 … +0.021` after the 0.16 rad rake — 21 mm short, so the wheels hang off nothing; the
   rear stand feet at `z = −0.24` touch nothing at all.
4. **A part hung from a socket whose origin is not what the author assumed.** `castor()`'s origin is
   the axle (tyre bottom at `y − radius`, mount plate at `y + 1.85·radius`). `hookBlock()`'s origin
   is the shackle cross pin (hook body centred at `−0.86·scale`). Anything mounted to those without
   reading the helper lands in space.

**The rule**

> **R5 — everything applied embeds; everything structural overlaps.**
> An applied layer's back face is **≥ 3 mm inside** its host face (the kit helpers already do this
> if you obey R1 — do not defeat them with an epsilon).
> A structural member overlaps its mount by **≥ 20 mm, and ≥ 2× the thinner part's wall**. Never
> "just touching", never a butt at 0.
> A contact patch (wheel, foot, skid, pallet block) sits at **exactly y = 0** or below; never above.
>
> **R6 — curved hosts use curved helpers.** On any cylinder/drum/tank/silo flank, use
> `radialPlaque` (after the kit fix in §5.K3) and place the reference surface at
> `r·cos(π/segments)`, not `r`. Never place a box-face helper at a 45° position like
> `[r*0.72, y, r*0.72]`.

**Verify in the QA sheet:** the **`below` tile (yaw 45, pitch −22)** is the money shot — it looks
under every applied layer and under the whole prop. The kit rig's rim light sits at (4.5, 6, −7),
so a gap under a plate shows as a bright hairline. `left`/`right` at pitch 10 catch anything hanging
off a flank. For structural floats (silo legs, cart wheels) any of the four orthographic-ish tiles
shows it immediately.

### Class 4 — Containers where not every gap is closed

**Root causes**

1. **`containerMetrics()` sizes the wall panel from magic constants that do not add up to the
   frame.** `panelHeight = height − skirt − 0.38` and `panelCentre = skirt + panelHeight/2 + 0.04`
   leave the 105 mm and 20 mm slits of §2.
2. **End panel width `o.width − casting*2 + 0.04` stops 35.5 mm short of the corner posts.**
3. **Two door leaves sized to half the clear opening each**, so they meet at a mathematical point
   and the 0.1 subtracted for clearance becomes a 60 mm hole.
4. **A shell built from separate panels with butt joints and no lap** — the same disease in the
   crates and cases: a lid whose bottom face is exactly the body's top face reads sealed only from
   outside; the instant the lid opens or the camera drops below the joint, the joint line is a slit.

**The rule**

> **R7 — panels lap, they never butt.** A skin panel overlaps the frame member it seals against by
> **≥ 30 mm** in the direction of the joint, on every edge. A lid skirt laps its body by **≥ 20 mm**.
> A door leaf laps its frame by **≥ 30 mm** and laps its opposite leaf by **≥ 20 mm** (give one
> leaf a closing strip; do not split the difference).
> **R8 — after any dimension change, re-derive the span arithmetic and write it in a comment.**
> `panelTop ≥ railBottom + 0.03` and `panelBottom ≤ skirtTop − 0.03` are checkable statements; a
> magic `− 0.38` is not.

**Verify in the QA sheet:** `below` and `top`. A slit shows as a hard black line (the unlit interior
or the background) that runs the full length of a wall and does not shade like a groove — a real
groove has a lit wall and a dark wall, a slit is uniformly black from every angle. For door leaves,
`right`/`left` (whichever faces the doors) shows the centre gap directly; in
`renders/qa/shipping-container-standard.png` the **`right` tile** shows the interior ladder of cross
members through the 60 mm centre gap, and the **`back` tile** shows the dark band under the roof rail.

---

## 5. Fixes that belong in the shared kit

Do these **before** the per-model pass. Each one removes the same defect from many models at once.
Numbers are exact; apply them literally.

Priority order:

| | Fix | Reach |
| --- | --- | --- |
| **K1** | make `LAYER_CLEARANCE` the datum, add `layer()` | all 50 |
| **K2** | `plaque()` decal clearance 1.5 mm → 5 mm | 37 models |
| **K13** | `louvreVent()` / `recessedHandle()` layered inside-out | every vent and handle |
| **K16** | `statusLens()` absolute bezel margins | every lamp, worst on small ones |
| **K8**–**K10** | `containerShell` rib face, wall closure, door leaves | 7 container variants |
| **K3**, **K4**, **K15** | curved-body helpers and the facet sagitta | 9 drums / tanks / silos |
| **K12** | `castor` / `hookBlock` / `drum` mount origins | every wheeled and lifting prop |
| **K14**, **K18** | `lidHinge()`, `cavityLiner()` | 7 lidded props, 3 cabinets |
| **K19** | `member()` silently drops `dz` | 3 models with XZ-plane diagonals |
| **K5**–**K7**, **K11**, **K17** | bare planes, `seam` lift, bore plug, profile anchoring, face spin | scattered |

### K1 — make `LAYER_CLEARANCE` mean something
`assets/prototypes/axiom-cargo-kit/parts.ts`. Nothing references it today. Add and export:

```ts
/** Position for stacked surface detail. `n` = 1 for the first layer on a face. */
export function layer(face: Face, hostFace: Vec3, n = 1): Vec3 {
  return lift(hostFace, face, LAYER_CLEARANCE * (n - 1))
}
```

and re-export from `index.ts`. Every model then reads `layer('front', [x, y, faceZ], 2)` instead of
`[x, y, faceZ + 0.03]`. **Affects: all 50.**

### K2 — `plaque()` decal clearance
`parts.ts`, `plaque()`: the plate's front face is at `+0.019`, the decal plane at `+0.0205` — a
**1.5 mm** clearance, 3 ULP at 20 m and the single most-reported flicker in the wave.
Change `lift(position, face, 0.0205)` → `lift(position, face, 0.024)` (5 mm above the plate).
**Affects 37 models** (`grep -lE "[^a-zA-Z]plaque\(" assets/prototypes/*/model.ts`) plus every
container variant via `container.ts`.

### K3 — `radialPlaque()` must respect the facet sagitta
`parts.ts`, `radialPlaque()`. Add a `segments = 20` parameter and compute the reference radius from
the facet plane, not the nominal radius:

```ts
const facet = radius * Math.cos(Math.PI / segments)
const place = (out: number): Vec3 => [Math.sin(angle) * (facet + out), height, Math.cos(angle) * (facet + out)]
// plate at place(0.006)  (back face lands 4 mm inside the facet)
// decal at place(0.024)  (5 mm above the plate front, per K2)
```

Callers must pass the same `segments` they built the body with.
**Affects: `industrial-silo`, `chemical-drum`, `sealed-barrel`, `stacked-drums`,
`industrial-fuel-tank`, `industrial-horizontal-tank`, `industrial-pressure-vessel`, `gas-bottles`,
`fuel-drum`.**

### K4 — add radial equivalents of the flat marks
`parts.ts`. There is no curved-body version of `paintMark`, `stencil`, `statusLens` or `bolt`, so
every drum/tank/silo hand-rolls a flat one and gets §1.2 pattern 4. Add:

```ts
export function radialMark(parent, material, profile, radius, height, angle, segments = 20, thickness = 0.013): Mesh
export function radialFitting(parent, radius, height, angle, segments = 20): { position: Vec3; rotation: Vec3 }
```

both anchored on `radius * Math.cos(Math.PI / segments)` and rotated `[0, angle, 0]`.
`radialFitting` returns the position/rotation a caller should hand to `statusLens`/`box`/`bolt` so a
fitting seats on the flank instead of at a 45° corner.
**Affects: the nine models above plus `cargo-bag`, `sacks` (rounded bodies).**

### K5 — raise the two bare-plane helpers off zero
`parts.ts`: `stencil()` `0.004 → 0.008` (`LAYER_CLEARANCE/2`), `tick()` `0.003 → 0.006`. Both are
single planes with no plate behind them and no geometry to hide a coincidence.
**Affects: every model calling `stencil` or `tick`.**

### K6 — stop `seam()` double-lifting
`parts.ts`, `seam()`: the groove is an open channel; a rim standing 2 mm proud of the host shows
daylight under its lip at grazing angles, and callers routinely add their own `+0.002` on top
(`industrial-hoist`, `forklift`), doubling it. Set the internal lift to `0` and document
"pass the exact outer face". The groove's draft angle means no coplanar faces are created.
**Affects: `container.ts` (roof, side walls), `cargo-crate-large`, `wooden-pallet`,
`industrial-hoist`, `industrial-forklift-loader`, and every crate/case with panel lines.**

### K7 — `cornerCasting()` bore plug clearance
`parts.ts`: `hexagon(socketRadius * 0.99)` gives a 0.55 mm radial gap between two facing walls, and
the two rings get different fillets, so the plug wall and the bore wall interleave.
Change to `hexagon(socketRadius * 0.88)` and the plug depth `depth * 0.5 → depth * 0.6`.
**Affects:** the seven `containerShell` models (eight castings each) plus the direct callers
`armored-cargo-crate`, `cargo-crate-large`, `cargo-trailer`, `container-door`, `commercial-dumpster`,
`freight-cart`, `industrial-crane-trolley`, `industrial-hoist`, `square-cargo-crate`.

### K8 — `containerShell()` must publish the rib face, and detail from it
`container.ts`. Add to `ContainerMetrics`:

```ts
/** Outward offset from the wall panel's z to the corrugation's outer face. */
readonly ribFace: number   // = 0.081
```

and in `sideWall()` replace every `z + side * 0.055` / `z + side * 0.056` detail position with
`z + side * k.ribFace`. That is: the two `seam()` calls, the `paintMark`, the `plaque`, and both
`statusLens` calls. Same treatment in `endWall()` — the end ribs are 0.055 thick at `x + sign*0.055`,
so their face is `x + sign*0.0825`, and the `plaque` there currently sits at `x + sign*0.058`.
**Affects: `shipping-container-standard`, `-short`, `-open`, `container-small`, `container-stack`,
`damaged-container`, `container-door`.**

### K9 — `containerMetrics()` must close the wall
`container.ts`. Replace:

```ts
const panelHeight = options.height - skirt - 0.38
panelCentre: skirt + panelHeight * 0.5 + 0.04
```

with (derivation: rail bottom = `height − casting*0.5 − 0.085`; skirt top = `skirt + 0.02`; we want
30 mm lap at both):

```ts
const panelHeight = options.height - skirt - casting * 0.5 - 0.045
panelCentre: skirt - 0.01 + panelHeight * 0.5
```

For the standard container that gives panel y **0.410 … 2.385** against skirt top 0.44 and rail
bottom 2.355 — a 30 mm lap at both ends instead of a 20 mm and a 105 mm hole.
Also in `endWall()`, widen the panel from `o.width - casting*2 + 0.04` to
`o.width - casting*2 + 0.18` so it laps the corner posts (inner face ±0.9755) by 30 mm.
The slit scales with the casting size, so it is worse on the small variants: `container-small`
(casting 0.22) has a **145 mm** slit (panel top 1.40, rail bottom 1.545).
**Affects: the same seven container models.**

### K10 — `containerDoorLeaf()`: four fixes
`container.ts`.
1. **Centre gap.** `width = (o.width - casting*2 - 0.1)*0.5` = 0.87, but the models hinge at
   `o.width*0.5 - casting - 0.02` = 0.90, so the leaves span −0.90…−0.03 and 0.03…0.90 — a **60 mm
   slit** (**70 mm** on `container-small`). Cleanest fix is at the hinge, not the leaf:
   `hinge = o.width*0.5 - casting - 0.05` (= 0.87). If you want a real lap instead, give the
   `side === 1` leaf a closing strip that runs 20 mm past z = 0.
2. **Detail plane.** Every face detail is placed at leaf-local `x = 0.108`, but the leaf skin is a
   0.1-thick panel centred at `x = 0`, so its face is at **0.05**. The `recessedHandle`, the hazard
   `plaque` and the `boltRun` float 25–55 mm. Either thicken the skin to `0.216` (face at 0.108) or
   — preferred — move the details to `x = 0.05` (`n = 1`) and `x = 0.066` (`n = 2`, on the 0.04
   sub-panels whose face is 0.075 → use 0.075).
3. **Lock bars.** `prism(m.amberPaint, [0.1, 0.09, 0.36], [0.16, height*0.5, z + side*0.14])` — the
   two inner bars overlap over **190 mm** of identical volume across the centreline. Change the
   z-size to `0.26` and the offset to `side * 0.09`, giving world spans `−0.305…−0.045` and
   `+0.045…+0.305`.
4. **The leaves are inside the frame.** `containerDoorFrame()`'s head and sill bars are
   `[0.2, …]` at `x = length*0.5 − 0.14` → x **2.79 … 2.99**, while the leaf skins occupy
   2.76 … 2.86 and the lock rods 2.879 … 2.931 — **70–140 mm of interpenetration** across the whole
   door. Move the leaf group to `x = length*0.5 − 0.285` (skin 2.695 … 2.795).

**Affects: `shipping-container-standard`, `-short`, `-open`, `container-door`, `damaged-container`,
`container-stack`.**

### K11 — document what `extrudeProfile` actually does with `position`

> **Correction.** An earlier draft of this playbook claimed the opposite of what follows and named
> five models as victims. That was wrong; the note below is the verified behaviour. If you are
> holding a copy that lists sunken dumpsters, ramps and counterweights, discard it.

`src/asset-forge/generator/primitives.ts` normalises every profile to its bounding-box centre at
lines 409–420 — and then **adds that centre straight back** at line 625:

```ts
mesh.position.set(position[0] + centreX, position[1] + centreY, position[2])
```

So a profile lands at **its authored coordinates plus `position`**; `position` is an *offset*, and
the normalisation exists solely so `options.rotation` pivots about the profile's centre rather than
about the world origin. A profile authored 0…h with `position.y = 0` therefore occupies 0…h,
exactly as written. `commercial-dumpster`, `industrial-dumpster`, `loading-dock-ramp`, `cargo-bag`
and `industrial-forklift-loader` all rely on this and are **correct**.

The defect is the mirror image: **a caller that compensates for a shift that never happens.**

| Model | Call | Consequence |
| --- | --- | --- |
| `sacks` | `sack()` passes `position[1] + height*0.5` to a profile authored 0…height | every sack lands half its own height too high — bases at 0.185…0.48 against a sheet top of 0.032, i.e. **155–170 mm of air** under the bottom course; the neck and tie, authored in the un-shifted frame, end up buried at mid-height so no sack shows a gathered neck. Confirmed in the `front` and `right` tiles: the whole stack hovers. Fix: pass `position[1]`. |

Kit action: the primitive is fine — **document it in the doc comment** (the existing comment says
"`position` is an offset applied on top of the profile's own centre", which is true but is being
misread). If you want belt and braces, add an explicit `anchor?: 'authored' | 'bboxCentre'` option
so the intent is stated at the call site.

### K12 — the assembled helpers hide their mount heights
`castor()`'s origin is the **axle**: tyre bottom at `y − radius`, mount plate top at
`y + 1.85·radius + 0.0175`. A caller who passes `y = radius` (so the tyre touches the ground)
therefore needs its chassis underside at **1.85·radius + 0.0175** — `commercial-dumpster` passes
`y = WHEEL` and buries the whole fork and plate inside its 70 mm floor slab, which is why it renders
as a bin sitting flat on the ground with no wheels. Either export that constant or change the
signature to take the **mount plane** and derive the wheel centre.
Same class of trap: `hookBlock()`'s origin is the **shackle cross pin** (ears to `−0.31s`, hook body
`−0.55s … −1.17s`); `drum()`'s origin is the **base** (body spans `y … y + height`). Document all
three in `parts.ts`.

### K13 — `louvreVent()` and `recessedHandle()` are layered inside-out
`parts.ts:306` / `:356`. The `ink` "sunk well" of `louvreVent` sits at **+0.007 … +0.057** and its
slats at **+0.034 … +0.066** — both entirely *in front of* the surround's rim at +0.0325. Every vent
in the wave renders as a proud black brick, not a cavity (confirmed on the equipment rack's roof and
plinth, the tool-cabinet doors and the shelving back panel). `recessedHandle`'s well ends at +0.0225,
also proud of the host face.
Fix: ink at `lift(…, 0.004)` → −0.021 … +0.029; slats at `lift(…, 0.016)` → 0 … +0.032;
`recessedHandle` well at `−0.026` → −0.0535 … −0.0015.
**Affects: every model calling either helper.**

### K14 — add `lidHinge()` to `parts.ts`
Seven models hand-roll the same hinge and make the same mistake: the knuckle lugs are placed at a
local z **inside** the lid box, so they never render. `weapon-crate`'s lugs span z −0.017…0.053
inside a lid spanning −0.037…0.497; `polymer-case`'s living hinge is 39 mm inside its lid and the
`back` tile shows a completely smooth back with no hinge at all. A shared helper that seats the
knuckles **proud of the leaf's back face** fixes all of them.
**Affects: `cargo-crate-medium`, `long-cargo-crate`, `weapon-crate`, `open-crate`,
`hard-equipment-case`, `military-case`, `polymer-case`.**

### K15 — add a cylinder-wrap strap helper
`shipping-container-open`'s tarp straps are flat quads laid tangent to a cylinder: each touches at
one line and its ends stand **~160 mm** off the roll. Any banded drum or lashed roll needs a
3-chord segment run, not a tangent quad.

### K16 — `statusLens()` uses absolute margins
`parts.ts:426` adds a flat `+0.05` to both bezel dimensions and uses fixed 0.04 / 0.026 depths
regardless of lamp size. A 20 × 12 mm rack lamp gets a **70 × 62 mm, 40 mm-deep** bezel that
overhangs its host and collides with its neighbour (see `industrial-equipment-rack`, where a pair of
server lamps overlap by 20.8 mm and each overhangs the faceplate by 9 mm).
Fix: `margin = Math.min(0.05, Math.min(width, height) * 0.6)` and scale both depths with it.

### K17 — the face helpers cannot be rotated within their face
`plaque()`, `stencil()`, `tick()` and `statusLens()` take only the six axis faces. `paintMark()`
already routes through `faceSpin` and can. Every raked or sloped host in this wave — the dock ramp's
deck, the skip's rake, the dumpster's slope — is forced to fake it with an axis-aligned plate and
gets it wrong (`loading-dock-ramp` puts a **1.54 m horizontal** hazard band on a 16.3° deck: flush at
one end, 232 mm below the deck at the other, and 430 mm past the ramp toe over bare ground).
Add the same `spin` / rotation override to all four.

### K18 — add `cavityLiner()`; the "solid ink interior" idiom swallows its contents
`equipment-chest`, `industrial-tool-cabinet` and `industrial-tool-chest` each build the interior as
one solid `m.ink` box, which then contains — and therefore hides — the shelves, stock boxes, drawer
liners and tray dividers placed inside it. `industrial-tool-cabinet`'s ink box front face is at
z **0.18, exactly coplanar** with both the shelf front and the shelf lip front: three co-facing
surfaces. A helper that builds five thin faces instead of one block fixes all three.

### K19 — `member()` silently drops `dz`
`parts.ts:618`. It computes `length = Math.hypot(dx, dy)` and rotates only about Z, so a caller who
passes two points differing in **z** gets an axis-aligned bar of the wrong length at the midpoint z,
with no error. Three models author XZ-plane diagonals through it: `industrial-horizontal-tank`'s
saddle gussets (which end up wholly inside the saddle box and never render), `freight-cart`'s frame
diagonals (3 mm short at each outboard end) and `cargo-trailer`'s drawbar (**305 mm** short of the
hitch plate). Either make it 3-D (yaw + pitch, the way `cargo-net.cord()` already does it) or throw
when `from[2] !== to[2]`.

### K20 — `radialPlaque()` has no width limit and no centre
Two more gaps beyond **K3**:
- **Corner lift.** A flat plate on a curve lifts its corners by `r − √(r² − ((w+0.05)/2)²)`, and the
  plate is only 0.02 thick. Every caller in the wave exceeds that: 32 mm on `sealed-barrel`, 39 mm
  on `chemical-drum`, 43 mm on `industrial-pressure-vessel`, 31 mm on `industrial-fuel-tank`. Either
  bow the plate into three chords, or clamp and document `w ≤ 2·√(0.008·r) − 0.05`.
- **No centre parameter.** It assumes the cylinder's axis is the group origin, which is why
  `stacked-drums` puts a drum label on the world axis, buried inside a drum.

### K21 — `drum()` should publish its clear band
The chimes occupy `y 0…0.07` and `y h−0.07…h` at radius `r + chime`, well proud of the body. Models
keep placing bands, bolts and marks in that zone at radius `r` and lose them entirely
(`sealed-barrel`'s tamper band, its catch and three of its bolts are all swallowed). Have `drum()`
return `{ clearY: [0.07, h − 0.07], radius: r }`.

### K22 — add `groundPad()`
The "pad inside a base, both bottom faces at y = 0" idiom z-fights in `chemical-drum`,
`gas-bottles`, `industrial-pressure-vessel` and `cargo-pallet` — same plane, same facing, every time.
A helper that insets the pad 1 mm kills all four.

### K23 — promote `nozzle()` into the kit, with the stud plane derived from the axis
`industrial-pressure-vessel` keeps a local `nozzle()` whose stud placement branches on
`rotation[0] !== 0`. That test is **wrong for two of the three axes**: with `AXIS_Y` it offsets the
studs in y and z, i.e. strung along the nozzle's own axis instead of around its flange, and with
`AXIS_Z` it offsets in x and z — again along the axis. Only `AXIS_X` is currently correct. Derive
the two in-flange axes from the nozzle axis, and share the part.

---

## 6. Per-model defect table

Classes: **1** z-fighting/coplanar · **2** off-centre · **3** floating · **4** unclosed gap.
**All 50 models were opened and their arithmetic checked.**

| Asset | Classes | What to fix |
| --- | --- | --- |
| `shipping-container-standard` | 1, 3, 4 | All defects are in the shared `containerShell`/`containerDoorLeaf` — apply **K8, K9, K10** and this model needs no local edit. Confirmed in `renders/qa/shipping-container-standard.png`: the `right` tile shows the interior through the 60 mm door centre gap and the two inner amber lock bars reading as one over-long bar (the 190 mm duplicated volume); the `front` tile, left third, shows the manifest plaque **sliced by a corrugation rib** — the K8 symptom; the `back` tile shows the dark band where the 105 mm slit under the roof rail sits. |
| `cargo-crate-large` | 1, 3 | `hullBody()`: `statusLens`/`plaque`/`boltRun` are placed at `frontZ + 0.03` where `frontZ = DEPTH*0.5 − 0.03` is already the body face and the graphite service panel's face is at `frontZ + 0.03` — that part is correct; but the panel itself (`box … [0.34,0.42,0.06] at frontZ`) is half-buried, so the plaque's plate back at `frontZ+0.019` is only 11 mm inside a 60 mm panel. Leave. Real fixes: (3) `plinth()` fork-pocket z `side*(DEPTH*0.5 − 0.02)` = 0.73 vs body face 0.72 and plinth face 0.75 — pick one, use 0.75 (the plinth is the host). (1) `hullBody` body bottom y = SKIRT = plinth top y = SKIRT: shrink the body to `bodyY = SKIRT + bodyHeight*0.5 − 0.01` so it laps the plinth 10 mm (**R5**). (1) `lidBody` lid bottom y = HEIGHT−LID = body top: drop the lid 10 mm and lengthen it, per **R7**. |
| `fuel-drum` | 1, 2, 3 | (3) `plaque(... [RADIUS*0.72, y, RADIUS*0.72], 'front')` — flat plate at 45° to the drum: 89 mm buried at one end, past the silhouette at the other. Replace with `radialPlaque(..., RADIUS, y, Math.PI/4, 20)` after **K3**. (3) same for `statusLens` at `[−R*0.72, y, R*0.72]` — use **K4** `radialFitting`. (3) both `paintMark`s at `z = −RADIUS − 0.004` with `x = −0.1 / 0.04`: the flank at x = −0.1 is at z = −0.3666, so the mark floats **15.7 mm**. Replace with `radialMark`. (1) the three strakes at `RADIUS + 0.005 = 0.385`, half-thickness 0.01 → back face 0.375 against a 20-facet surface at 0.3753 — **0.3 mm, z-fights**. Move to `0.38*cos(π/20) + 0.012 = 0.3873`. (2) crown lift lugs are mirrored in x but both at `z = +0.12`; mirror them in z as well or put them at `z = 0`. Confirmed in `renders/qa/fuel-drum.png`: the `front` tile shows the manifest plaque standing off the flank as a flat card that overhangs the silhouette; the `back` and `left` tiles show both orange slashes hovering clear of the curve. |
| `storage-rack` | 2, 3 | (2) `upright()` punches its slots at `z + UPRIGHT*0.5` for both `z = ±DEPTH*0.5` — the rear upright's punchings face inward. Use `z + Math.sign(z) * UPRIGHT*0.5`. (2) `paintMark` at `x = −BAY − 0.14 = −2.44` is 85 mm off the end of the leftmost upright (`−2.355 … −2.245`); move to `x = −BAY`. (3) aisle `plaque` at `DEPTH*0.5 + 0.035 = 0.56` over a beam whose face is 0.5525 → plate back floats 4.5 mm; use 0.5525. (3) load-rating `plaque` at `DEPTH*0.5 + 0.06 = 0.585` over the amber column guard whose face is 0.575 → 7 mm; use 0.575. (4) beam webs stop 20 mm short of the uprights and only the 50 mm connector bridges — widen the connector to 0.075 deep so no slit shows at the joint. Confirmed in `renders/qa/storage-rack.png`: in the `back` tile the near uprights carry no punchings at all while the far ones do. |
| `industrial-silo` | 1, 3 | (3) **headline:** the four legs top out at `y = LEG = 2.2` at radius 0.85, but the hopper cone reaches radius 0.85 at `y = 3.079` — the silo floats **879 mm** above its own legs (visible in every side tile of `renders/qa/industrial-silo.png`). Either raise the legs to `LEG = 3.08` or add a ring beam at `y = 2.2` joining the four legs to the cone. (3) fill-line pipe clamps at `y = 2.8` and `3.9` sit at radius 1.076 against a cone whose radius there is 0.643 / a barrel that starts at 3.35 — the two lower clamps clamp air. (1) the slide gate (0.035 thick at `apex − 0.03`) is entirely inside the 0.14-thick gate frame at the same centre — drop it to `apex − 0.11`. (3) `paintMark`s at `z = RADIUS + 0.004` with `x = −0.2 / 0.02` float **24.9 mm** off the barrel; use **K4** `radialMark`. (3) `radialPlaque` at nominal `RADIUS` floats 2–7 mm depending on angle — fixed by **K3**. (2) the control-box tie `member(... z = 0.1 …)` misses the control box (z ±0.07) by 5 mm; put it at z = 0. |
| `industrial-hoist` | 1, 3 | (3) `plaque`/`statusLens` at `BODY_D*0.5 + 0.004 = 0.164` over a face at 0.16 — the plate back lands at 0.161, a **1 mm float**. Pass 0.16 (**R1**, n = 1). (1/3) `seam` at `BODY_D*0.5 + 0.002` double-lifts to a 4 mm proud rim — fixed by **K6** plus passing 0.16. (3) hazard `plaque` at `[BODY_W*0.34, …, BODY_D*0.42 = 0.1344]` over the chain-guide box whose face is 0.128 → 3.4 mm float, **and** the 0.24-wide plate overhangs the 0.168-wide host by 36 mm each side — shrink to `[0.14, 0.05]` and place at 0.128. |
| `cargo-trolley` | 1, 3 | (1) `plaque(… [0, 0.9, −0.038], 'back')` — the plate's inner cap lands at **exactly −0.035**, the back panel's face. Pass `−0.035`. (3) `paintMark` at `[−0.14, 0.24, 0.026]` is in **empty space** — there is no geometry at that x/y/z. Move it onto the toe plate or the back panel. (3) the axle/wheels sit at `z = −0.09` but the raked frame's axle brackets span `z −0.069 … +0.021` → 21 mm gap; move `axleZ` to `−0.03` or extend the brackets. (3) rear stand feet at `z = −0.24` touch nothing — add a stub leg from the stile or move them to `z = −0.05`. (1) the two `member` X-braces share the z-slab `0.01 ± 0.015` and interpenetrate at the crossing — offset one by 0.032. |
| `cargo-net` | 3 | (3) **headline:** the four corner hooks at `±(SPAN/2+0.05), ±(DEPTH/2+0.05)` are **68 mm** clear of the perimeter rope at `±(loadX+0.012), ±(loadZ+0.012)` and hang in mid-air (blatant in every tile of `renders/qa/cargo-net.png`). Move the hooks to the rope corners, or route a lashing from each rope corner to its hook. (3) the claw profile spans y **−0.015 … 0.11** — 15 mm below the floor. (3) `crown = LOAD + 0.035 = 0.695` with cord radius 0.008 → the net's cord bottoms sit **4 mm** above the load's cap (top 0.683). Set `crown = LOAD + 0.023`. (3) the side cords start at `±shoulderX = ±0.5` (50 mm **inside** the load flank at ±0.55) and end at `±0.562` (12 mm outside) — they cut through the shoulder. Route from `±0.556`. (3) the amber tensioner at `z = DEPTH*0.5 + 0.055 = 0.485` floats 55 mm off the skid face (0.43) and touches no rope. |
| `wooden-pallet` | 1, 3 | (1) the stringer boards (`[LENGTH, BOARD, 0.1]` at `z ∈ {−0.35, 0, 0.35}`) are exactly as deep as the blocks (`[0.12, BLOCK, 0.1]` at the same z) and their tops coincide at `y = 0.112` — **four coincident same-facing planes per block**, visible along both long sides. Make the stringers `0.092` deep and `topY − BOARD − 0.002` high, or delete them (they are entirely inside the block volume). (3) the `box(m.shellShade, [0.1, 0.05, 0.008] … WIDTH*0.5 + 0.006)` placard floats 2 mm off the 0.4 board face — use `WIDTH*0.5 + 0.004`. The `seam` and `bolt` calls on the deck are **correct** (they pass `topY + BOARD*0.5`, the true top face) — use them as the reference example. |
| `industrial-forklift-loader` | 1, 3 | (1) `louvreVent` at `x = −1.02, face 'left'` is **buried inside the counterweight**, whose real span is x −1.2…−0.2 (profile −0.9…0.1 plus the −0.3 offset): the surround occupies −1.0075…−1.0525, ~180 mm in from the rear face it should sit on. Pass `x = −1.2`. (3) all flank detail uses `BODY_W*0.5 − 0.02 = 0.54` while the counterweight face is `(BODY_W−0.06)/2 = 0.53` — the two `plaque`s float 7 mm, the `paintMark` 8.5 mm, the `seam` rim 12 mm, the `boltRun` 3 mm. Pass 0.53. (3) the four overhead-guard posts stand at `x = −0.78 / 0.22`, `z = ±0.47`, over a floor plate spanning `x −0.6…0.12`, `z ±0.44` — they rest on nothing. (3) `statusLens` at `x = 0.28` overhangs the guard roof (`x −0.85…0.29`) by 75 mm. (3) the two guard-to-mast `member`s end at `x = 0.5, z = ±0.47`; the mast tubes are at `x = 0.8, z = ±0.3`. |
| `shipping-container-short` | 3 (+ **K8, K9, K10**) | (3) `panelZ = -(SPEC.width*0.5 − 0.02)` = −1.20 → the service panel (0.06 deep) is only **4 mm proud** of the ribs at −1.226; 30 mm of it is swallowed by the corrugation. Use −1.226. (3) `plaque(… panelZ − 0.045 …)` floats **12 mm** off the panel face and its bottom edge **overhangs the panel by 55 mm**. (3) the shared `paintMark` chevron is placed at `side*-o.length*0.4`, which on a 3.02 m unit puts **75 of its 210 mm off the end of the panel field into air** — visible far-left in the `front` tile. Snap the x to a rib centre (see **K8**). |
| `shipping-container-open` | 1, 4 (+ **K8, K9**) | (4) `interior()`: the liner's outer face is 1.02 vs the side panel's inner face 1.09 → a **70 mm open slot** down both sides, seen from above in the `top` tile; `innerX` leaves a **175 mm gap** at the closed end and **80 mm** at the door end. (1) the tarp roll (r 0.14) reaches z −1.18 against a top rail whose inner face is −1.085 → **95 mm interpenetration**. (3) its straps are flat quads tangent to the roll — ends stand **~160 mm** off (see **K15**). (1) the roll's end caps (r 0.05, x ±2.4) are entirely inside a roll that runs to x ±2.53 → invisible. (1) `statusLens` bezel back lands **exactly** on the header face. |
| `container-small` | 1, 3 (+ **K8, K9, K10**) | Worst **K9** case: casting 0.22 → a **145 mm** slit (panel top 1.40, rail bottom 1.545), and a **70 mm** door centre gap. (3) `louvreVent` at z 0.36 against a vent-stack face of **0.25** → **97.5 mm float**. (3) the roof canopy's underside is 1.725 against a roof deck topping at 1.695 → **30 mm gap**. (1) the roof `plaque` tops out at 1.8105 inside a canopy topping at **1.815** → the plaque is entirely inside the canopy and never renders; the adjacent `statusLens` clears it by only 5 mm. |
| `container-stack` | 1, 3 (+ **K8, K9, K10**) | (3) the aft twistlock pair lands on the mid-roof of tier B — cones span y 5.29…5.40 against a roof deck topping at **5.245** → **45 mm float** (visible under the top unit's left end in the `front` tile). (3) `rodZ = width*0.5 + 0.06` puts the lashing rods 9–28 mm off the ribs and rails **over their full 5.4 m**. (1) a turnbuckle's back face lands **exactly** on the skirt-band face. (1) a roof lift-pad pin pokes 25 mm into the tier above. |
| `container-door` | 1, 3, 4 (+ **K10**) | (1) `cornerCasting` is called with `length = 0.44` while `casting*2 = 0.6`, so the two 0.3 cubes sit at x = ±0.07 and **overlap by 160 mm through the centreline** — a mirrored pair crossing its own mirror plane (**R3**). Use one casting per corner spanning the full length. (3) the portal `plaque` and both `statusLens` calls sit at y 2.165…2.335 while the portal head only exists above 2.29 → **125 of 170 mm hangs over the open doorway**, 43 mm clear of the nearest surface. (3/4) the sill ramp's inner corner is at y 0.211 against a threshold top of **0.315** — a 104 mm step plus a 23 mm gap — and its outer corner hovers **69 mm** above the deck. |
| `damaged-container` | 1, 3, 4 (+ **K8, K9, K10**) | (1) the breach backer is at z 1.095…1.145, **behind the intact panel skin at 1.20** → invisible, so the "hole" shows the light wall through it (the `front` tile reads as a rust outline on an unbroken wall). (3) the oxide bands are at z 1.294 against rib faces at 1.226 → **68 mm float**, reading as bars hanging in front of the flank. (3/4) the two "bent" reinforcing bars lean *away* from their base and their ends are **0.57 m apart** — one bar drawn as two disconnected sticks (`right` tile). (1) the sagging roof plate lies inside the intact roof deck, so the sag never reads; set `roof: false` and own the deck. (1) the crushed casting tops at 0.222 while the pristine `cornerCasting` under it tops at **0.30** — 78 mm of undamaged casting sticks out of the crush. (4) `fold()` rotates each half about its own centre, opening a **38 mm** slit at the crease. |
| `armored-cargo-crate` | 1, 3 | (3) the back `plaque` back face is at −0.589 against an armour face of **−0.577** → 12 mm float. (3) the hatch bar's nearest point is 7.5 mm clear of the leaf face — a detached stub in the `front` and `below` tiles. (1) body bottom **y 0.2 = skirt top y 0.2**, 0 mm overlap (**R5**). (—) `drop = HEIGHT − SKIRT − 0.3` sends the released hatch to y −0.28…0.36, i.e. **280 mm underground**. |
| `cargo-crate-medium` | 1 | (1) the lid hinge lugs and pin lie **entirely inside** the lid box (local z −0.02…0.07 within −0.055…0.825) → invisible. See **K14**. (1) the crown seams' rims are under the crown plates — **70 % of each groove is buried**. (1) lid bottom **= body top** and skirt top **= body bottom**, both 0 mm. |
| `long-cargo-crate` | 1 | (1) the rubber pad's bottom face is at **y = 0**, exactly the saddle foot's bottom face, both down-facing — z-fighting over the entire contact patch. (1) one chevron stroke is 4.5 mm inside a rib and the other floats 8.5 mm in a valley, so the `back` tile shows **only one of the two strokes**. (1) lid lugs buried (**K14**); crown seams buried under the spine; the foot stripe's plate back lands **exactly** on the saddle-foot face; `statusLens` bezel back lands **exactly** on the shell skin. |
| `open-crate` | 1, 3 | (3) a `boltRun` sits at y 0.505…0.535 while the shell walls top out at **0.50** → the whole run floats above the rim with no host. (3) the skirt `plaque` floats 11 mm. (1) the lid hinge at z −0.35 is 30 mm inside the back wall's outer face, so the opening leaf sweeps **through the rim**. (1) all four liner walls land **exactly** on the shell's inner faces, 0 mm bite. (1) `loot_bay_a`'s socket is inside solid geometry; the "bays cut into" the pad actually stand 10 mm proud of it. |
| `square-cargo-crate` | 1, 3 | (3) the second brace stroke floats 7 mm except where it crosses stroke 1; (3) the `plaque` spans y 0.69…0.86 on a field ending at **0.765**, so its top 95 mm floats. (1) `statusLens` bezel back lands **exactly** on the shell face. (1) skirt top **= body bottom**. (2) `lift_north` / `lift_south` sockets sit on the top-edge midpoints, on no casting — the castings are at (±0.365, ±0.365). |
| `weapon-crate` | 1 | (1) lid lugs buried inside the lid box (**K14**). (1) lid bottom **= body top**; foot top **= body bottom**. Everything else — bail, bands, latches, seams — checks out; use this model's latch and band placement as a positive reference. |
| `stacked-crates` | 1, 2, 3 | (3) both horizontal strap runs use one shared `top`, so the +X run floats **32 mm** above the crate under it; the vertical runs are at z 0.484…0.496 against crate faces at **0.44** → **44 mm float over 0.73 m**; and both horizontal runs terminate at z −0.495 **in mid-air** because there is no −Z vertical run. (2) the label and chevron decals are applied to `UNITS[0]`/`[1]`, which are the **−Z back row** — their +Z faces look into the 40 mm inter-row gap, so both decals are invisible. Use units 2 / 3. (1) the skid `plaque` and its two bolts are **entirely inside** the front runner. (1) the second course interpenetrates the base crates' crown plates by 14 mm. |
| `hard-equipment-case` | 1, 2, 3 | (2) **`towHandle` grip uses `AXIS_Z`** — the bar runs along world Z, spearing 400 mm aft into the lid at x = 0, while the stiles it should join are at x = ±0.19 with nothing between them. Use `AXIS_X`. Confirmed: the `back` tile shows the grip end-on as a dot; `right`/`left`/`top` show a rod pointing aft. (3) the handle stiles protrude 8 mm out the back of their own channels. (3) lid hinge knuckles are 52 mm inside the shell → invisible (**K14**). (1) two of three `boltRun` bolts are buried in the guide channels. (3) the `paintMark` floats 2.7 mm and sits outside the front panel. |
| `military-case` | 1, 3 | (3) the `paintMark` at x = 0.28 has no rib under it — the host there is the bare shell at 0.24, so it floats **12.7 mm**. (3) the lower `seam` is a 16 mm-proud rail standing 3 mm off the skin (the ribs start above it). (3) hinge knuckles 48 mm inside the lid → invisible (**K14**). (1) `bumper()`'s inner block is **fully enclosed** by the rubber block at the same centre → never rendered. (1) the lid pivot at z −0.21 is inboard of the body's back face at −0.24, so the opening leaf interpenetrates the hull. |
| `polymer-case` | 3 | (3) the `paintMark` is off the end of its panel and floats **12.9 mm** (an orange tab standing off the panel edge in `front`/`hero`). (3) the four "blade rib" feet are wholly inside the base band → the case rests on the band, not the feet. (3) the living hinge is 39 mm inside the lid — the `back` tile shows a completely smooth back with **no hinge at all** (**K14**). |
| `equipment-chest` | 1, 3, 4 | (3) the skirt `plaque` floats **23 mm** off the plinth face (clear in `hero`). (3) the locking bar floats **27.5 mm** off the drawer fronts over its full 890 mm (`right`/`hero`). (3) the levelling feet are entirely inside the plinth → invisible; the chest sits on the plinth. (3/4) the label `plaque` straddles a 30 mm void between the drawer stack top and the top slab's underside. (1) the drawer's ink liner is fully inside its shellShade box → never visible; use **K18**. |
| `industrial-tool-chest` | 2, 3, 4 | (2) the handle bar uses `AXIS_X` and runs x 0.28…0.44 while its two brackets sit at z = ±0.07 — **53 mm clear in Z, connected to nothing** (`right`/`left` tiles show the bar end-on flanked by two orphan brackets). Use `AXIS_Z`. (4) the carcass has sides, back and deck only: a **24 mm full-width see-through slot** above the top drawer plus two 8 mm slots with 300 mm of nothing behind them. Add an interior shell. (3) all three `seam`s land in the inter-drawer gaps, so each floats with no host. (3) the front `plaque`, `statusLens` and `toggleLatch` are placed over the open front — the plaque floats **19 mm** and reads as a label on a black void. (3) the tray divider and clip are wholly inside the solid tray block (**K18**). |
| `industrial-tool-cabinet` | 1, 2, 4 | (1/2) **`const hingeX = side * leaf` is the inner edge, not the outer one the comment claims.** Verified: `hinge = WIDTH*0.5 − 0.04 = 0.42` and `leaf = (WIDTH − 0.08)*0.5 = 0.42` are equal, so `doorLeft` (at x −0.42, side +1) puts its hinge rod at world **0** and `doorRight` (at x +0.42, side −1) puts its rod at world **0** too — two exactly coincident 1.72 m cylinders plus six overlapping knuckle pairs down the centre seam (the `front` tile shows the bolt line down the middle). Use `hingeX = 0`. (2) the espagnolette rod, keeps, lever and lens use `centre − side*(leaf*0.5 − 0.06)`, putting them 60 mm from the **hinge** edge instead of the leading edge — the lever ends up at the far outer edge. Flip the sign. (1) the interior ink box's front face is at z **0.18, exactly coplanar** with both the shelf front and the shelf lip front — three co-facing surfaces — and it encloses every shelf and stock box (**K18**). (1) the door open rotations are signed backwards, so each leaf sweeps through the carcass side wall. (4) door top 1.88 vs top-slab underside 1.91 → a **30 mm full-width gap** into the carcass. (1) the door `seam` rim is buried 5 mm in the recessed panel it crosses. (3) levelling feet inside the plinth → invisible. |
| `commercial-dumpster` | 1, 3, 4 | (1) `plaque(… WIDTH*0.5 + 0.016 = 0.516 …)` — the pressed pan's front face is at **exactly 0.513** and the plate's back face lands at **exactly 0.513**. Pass 0.513 (n = 1) or 0.529 (n = 2); over the panel gaps the host is the wall at 0.50, so the plate also floats 13 mm there. (3) `paintMark` at the same 0.516 floats 1.5 mm off the pan. (4) each lid leaf spans z ±0.485 against a 1.0-wide body — a 15 mm slit down each side; widen `leaf` to `WIDTH*0.5 + 0.01`. (3) **`castor()` needs its mount plate at `1.85·radius + 0.0175` = 0.3025 above the wheel centre**, but the bin's floor slab is y 0…0.07, so the entire fork and top plate sit inside the floor — which is why all eight tiles of `renders/qa/commercial-dumpster.png` show a bin flat on the ground with **no wheels at all**, most obviously in `below`. Raise the whole body by 0.30 (**K12**). (1) `lid.position.set(0, HEIGHT, −side*0.005)` makes the two leaves **interpenetrate by 10 mm over the full 1.32 m**, with their top faces coplanar — flip to `+side*0.005` for a shut line. (1/3) the lid box is placed about a pivot at its **middle** despite the comment claiming a back-edge hinge, so at the default ajar angle the +X edge drops to y 0.913 — **247 mm through the front wall** (`front`/`top`/`hero`). Set `lid.position.x = −0.58`, box local x = +0.66, and flip the rotation sign. (3) the foot-pedal linkage is 5 mm clear of the front wall. |
| `industrial-dumpster` | 2, 3, 4 | (4/2) **the raked end walls have their rotation sign inverted** (`rotation: [0, 0, sx * slant]`): the −X wall runs (−2.02, 0) → (−1.60, 1.05) while the side profile rakes the opposite way, leaving a **420 mm triangular hole at the top of the tail** and a foot jutting 370 mm past the floor slab into thin air (168 mm / 118 mm at the +X end). Unmistakable in `left`, `right`, `hero` and `below`. Use `-sx * slant`. (3) every flank graphic is at `WIDTH*0.5 + 0.036` = 0.876 against a skin at 0.8395 and ribs at 0.861 → the plaque floats **33.5 mm**, the paint mark 34.8 mm, the lens 26.5 mm. (3) the skids are entirely inside the floor slab, so the "empty skip does not sit flush" comment describes exactly what happens; the tail rollers intersect both the floor slab and the side skin. (3) the lift eye floats 30 mm above the nose block. (3) the whole rubble load hangs **430–700 mm in mid-air** above the skip floor (`top` tile). |
| `loading-dock-ramp` | 2, 3 | (3) **`beamTop(t)` does not describe the beam.** The real top chord is `0.055 + (x + 1.46)·0.31629`; the helper returns 0.254 at t = −0.3 where the beam is actually at **0.175** (stanchion foot floats 64 mm, post floats 69 mm) and 0.990 at t = 0.44 where it is 1.018 (sinks 28 mm) — precisely the failure its comment claims to have solved. (3/2) the deck hazard band is a **1.54 m horizontal** `plaque` on a 16.3° deck: flush at one end, **232 mm below the deck** at the other, and 430 mm past the ramp toe over bare ground (`left`/`top`/`front`). Shorten to 0.5 m and tilt it — needs **K17**. (3) the `paintMark` is **entirely inside the beam web**. (1/3) the cross bracing's slope does not match the deck's, so at t = −0.34 the brace sits **on the running deck**, 33 mm above the beam chord it should follow. (3) `statusLens` floats 10 mm off the control box. (—) `beamProfile()` dips 30 mm below y = 0. |
| `industrial-cable-tray` | 2, 3 | (2) the branch cover is placed at `z = WIDTH * 0.06` = 0.0264 — almost certainly a typo for `0` — so it swallows the +Z rail and leaves the −Z rail sticking **10.4 mm** out. (3) the hanger strut's bottom is 5 mm clear of the rail top along the whole run; the ceiling plate is 5 mm clear of the rod top. (3) the `paintMark` floats 4.9 mm and the `plaque` floats 3 mm while overhanging its 0.09 rail by 20 mm top and bottom. |
| `equipment-shelving` | 3 | (3) `louvreVent` floats **15 mm** off the back panel (`back`/`rear 3/4`). (3) the fourth-level outlet spans y 1.79…1.93 while the back panel ends at **1.79** → the whole outlet hangs unsupported (top-right in `front`). (3) the top `plaque` floats **90 mm** above the top tray. (3) the busbar is 12.5 mm clear of the panel down its full 1.52 m. (3) the cable basket floats 60 mm under the top tray with no hangers. (3) the earth strap is 10 mm clear at one end and 55 mm short at the other — it connects nothing. (—) the rubber pads are inside the foot boxes → invisible. |
| `warehouse-shelf` | 3 | (3) the rear X-brace is `WIDTH − POST` long but rotated 35.5°, so it spans only x ±0.665 against uprights at ±0.82 — **each of the four ends floats 155 mm short** (obvious in `back` and `rear 3/4`). Length should be `(WIDTH − POST)/cos(0.62)` = 2.015. (3) the `plaque` hangs **~55 %** into the open bay with only a 0.5 mm bite on the deck lip; the `statusLens`'s lower 43 mm is unsupported. Bins and stock boxes are correct — they bottom 2–3 mm into the wire deck at every level. |
| `industrial-equipment-rack` | 1, 3, 4 | (1) the roof `plaque` is **buried inside the +Z roof louvre** — the `top` tile shows two vents and no label. Move it to z = 0. (3) `const z = DEPTH*0.5 − 0.02` puts **every faceplate 5 mm off the mounting rails it is bolted to**. (1/3) the server lamp pairs overlap by 20.8 mm and each overhangs the faceplate by 9 mm — a direct consequence of **K16**. (3) the rubber feet are inside the plinth → invisible. (4) the 32 U stack tops out at 1.594 against a roof underside of 1.8245 — **230 mm of unblanked opening** onto an empty shell. |
| `chemical-drum` | 1, 3 | (1) all four `radialPlaque` calls put the plate back at 0.336 against a 20-facet surface of **0.33581**, and the angles land exactly on facet mid-points → **0.19 mm** → z-fight. Pass `RADIUS − 0.008`. (3) those plates are 0.28 wide, so their corners stand **38.7 mm** off the curve (**K20**); drop to 0.12. (3) `paintMark` at `RADIUS + 0.002` is **7.8 mm proud** at its centre and 20 mm at its outer edge, and its 0.30 height crosses both the bottom chime and the 0.3-hoop — both prouder than the mark — so it is swallowed at both ends. (1) the rubber pad and the skid ring share a bottom face at **y = 0** (**K22**). (3) a steel stub at `RADIUS + 0.03` leaves a 5 mm gap to the shell. |
| `sealed-barrel` | 1, 3 | (1/3) `radialPlaque` back face 0.306 vs facet **0.3063** → z-fight, and its 0.24 width lifts the corners **32 mm** — visible in the `right` tile as a label plate standing off the curve. (1) the amber tamper band at `RADIUS + 0.006` is **100 % buried** inside the top chime (r 0.338) — invisible in every tile; so is 60 % of the catch. (3) three `bolt`s at y 0.06 are inside the bottom chime, 20–50 mm in, and their `AXIS_Z` is **51° off the radial normal**. (3) `statusLens` at `[−R*0.62, …, R*0.66]` is at radius **0.2807**, 29 mm *inside* the r 0.31 shell → the bezel never shows, only 6 mm of lamp tip. (3) `paintMark` is 3–11 mm proud and crosses a hoop mid-length. (—) the "raised weld bead" is at `RADIUS − 0.02`, inside its own shell. |
| `stacked-drums` | 2, 3, 4 | (3) the vertical straps are at z 0.603–0.617 against drum flanks at **0.6242** and chimes at 0.654 → **37–51 mm inside the drums**; the ratchet is jammed in the same way. (3) the top strap is **23 mm clear** of the drum crowns and touches only the bung caps. (2) both `paintMark` chevrons omit `+ SPREAD`, landing 55 mm inside a drum → absent from every tile. (2) `radialPlaque` is measured about the **world** axis, so a drum label ends up buried inside a drum with the wrong tangent (**K20**). (3) the locator cups leave a **3.5 mm slit** under all four upper drums. (3) the pallet `radialPlaque` hangs in the void between stringers (`front` tile). (4) pallet deck top 0.1295 vs drum bases 0.13 → 0.5 mm slit. |
| `gas-bottles` | 1, 3, 4 | (1) the uprights at x ±0.4625 **interpenetrate the outer bottles by 40 mm**. (3) the waist rails and chain are 104–131 mm outboard of the uprights — they **connect to nothing**, and their ends visibly float in `hero`/`rear 3/4`. (3) the four braces leave a **20 mm gap** above the base top; a `bolt` floats 158 mm in open air. (3) `radialPlaque` on a box host leaves a 6 mm gap — use `plaque(…,'front')`. (1/3) `paintMark` at `BOTTLE_R + 0.002` is **0.74 mm** off the bottle vertex (z-fight) and 3.7 mm off at its edges. (1) the rubber pad and base share a bottom face at y = 0 (**K22**). (4) the valve guard engages the uprights by only **2.5 mm**. |
| `industrial-fuel-tank` | 1, 3, 4 | (3) **the shell bottom is at 0.95 and the bund floor top at 0.12 — 830 mm of void under the tank**, hidden only by the bund wall (`top`/`below`). Add a skirt or drop the shell. (3) two guard rods run to y 4.5 while the last hoop is at 3.26 → **1.24 m of unattached rod above the roof** (`right`/`left`/`rear`). (3) the ladder leaves an 80 mm gap under its stiles and (4) 815 mm of rung-free stile at the top. (3) the feed line's riser is 145 mm clear of the shell and its horizontal run ends **630 mm above** the cabinet — both ends unterminated. (1) `statusLens` back face lands **exactly** on the cabinet face; the fill-point box's bottom cap is **exactly** on the roof disc top. (1) the six strakes range from 1.2 mm buried to 4.2 mm floating along their rays → z-fight (**K3**). (3) both `radialPlaque`s lift their corners 22–31 mm (**K20**). (3) `paintMark` is **27 mm proud**. |
| `industrial-horizontal-tank` | 1, 2, 3 | (2) **`member()` drops `dz`** on the saddle gussets, so each becomes a vertical bar wholly inside the saddle box and never renders (**K19**). (1) a strake's back face is **0.4 mm** off its facet ray → z-fight. (1) the saddle seat chords are 0.34 deep but the shell only meets that plane within ±0.12, so **ten chord corners pierce the shell by 10 mm** (`right` tile shows the tabs outside the tank circle). (3) `paintMark` is **88 mm proud** at its centre, rising to 214 mm over its height (`hero` shows the chevrons hovering); the `plaque` floats up to 39 mm; the instrument column is 76 mm off at its top edge; the skirt `plaque` is 7 mm clear. (3) the manway ring floats 37 mm and its bolts 3 mm; the anchor plate 5 mm. **Highest epsilon count in the wave (7).** |
| `industrial-pressure-vessel` | 1, 2, 3 | (2) **`nozzle()`'s stud plane is derived from `rotation[0] !== 0`, which is wrong for two of three axes** — crown studs end up strung along the nozzle's own axis, up to 55 mm floating; the AXIS_Z set is half inside the shell and half 61 mm proud (**K23**). (2) the vent riser's `+0.34` X-rotation tilts it the wrong way: its bottom lands **280 mm** from the valve stub and its top 290 mm from the cap — a negative angle lines both up. The `top` tile shows a lone black disc floating clear of the riser. (3) a nozzle neck leaves a 17 mm gap to the shell; the drain is 29 mm clear; a `member` stub 18 mm clear. (3) the skirt "openings" **protrude 109 mm** instead of reading as recesses. (3) `statusLens` overhangs its 0.08-deep bracket by **30 mm each side** (`left` tile) — a **K16** symptom. (1) the base ring and skirt share a bottom face at y = 0 (**K22**); a crown stud clears its flange by 0.5 mm. (1/3) both `radialPlaque`s z-fight (0.2 mm / 4.4 mm) and lift their corners 27–43 mm (**K3**, **K20**). (3) `paintMark` is **22 mm proud**, 48 mm at its edge. |
| `freight-cart` | 2, 3, 4 | (2) **the wheels use `AXIS_X`** but the cart's length is X and the wheels are paired in Z — the tyres face ±X and project as 0.055 × 0.18 bars in side view (`front` tile shows the far wheel as a bar, not a circle). Use `AXIS_Z`. (2) **the grip bar also uses `AXIS_X`**, so it runs fore-and-aft at z = 0, never touching the stiles at z ±0.28 and overhanging 0.31 m each way. (4) the cross brace leaves a **7.5 mm gap** at each stile. (3) the fixed-wheel bracket is 10 mm short of the chassis rail; the tow eye floats 10 mm; the skid `plaque` is 3–5.5 mm clear. (2) four `member` diagonals drop their `dz` and stop 3 mm short (**K19**). |
| `cargo-trailer` | 1, 2, 3 | (2) **all six wheel/hub/axle cylinders use `AXIS_X`**, so the 1.76 m cross-axle runs fore-and-aft down the centreline and the mudguard arcs (built in XY, correct for a Z axle) no longer wrap their tyres (`hero` tile). Use `AXIS_Z`. (1) the axle tubes sit inside a `for (const sz …)` loop but never use `sz` → **each is built twice at an identical transform**. (1) the leaf packs pass **through both tyres**. (3/2) the drawbar `member`s drop their `dz`: the front ends are **305 mm** from the hitch plate and the rear ends 55 mm short (**K19**), and the amber marker between them touches nothing. (1) the label `plaque`, `paintMark` and a 7-bolt run are **all fully inside the longitudinal rail** (0.807–0.829 vs a face at 0.87). (3) the tail `plaque` hangs in the air behind the trailer; (1) the tail `statusLens` back face lands **exactly** on the bar face. (3) the underrun bar hangs off nothing. (1/3) the jack tube **pierces the deck plate and stands 60 mm proud**, and its foot never reaches the floor (bottoms at y 0.115 while its socket says 0). |
| `industrial-crane-trolley` | 1, 3, 4 | (3) the `plaque` is **157 mm out in the air** — at y = 0 the only body is the web, whose face is z 0.025, and the plate back is 0.182 (`hero` tile). (3) the festoon rail is 40 mm outboard of the bottom flange. (1) the running wheels straddle the flange they should roll on — half inside it. (4) the web stiffeners leave a **10 mm slit** top and bottom. (—) `statusLens` is entirely inside the carriage deck box → no cyan appears anywhere in the sheet. (4) the dead-end anchor leaves a 7.5–10 mm slit above the hook block (`front` tile). (3) the rope falls pass 4 mm outside the shackle pin, attached to nothing. (—) `drumY` is computed two different ways in `carriageBuild` and `build()`, leaving the rope origin 80 mm low. |
| `cargo-bag` | 1, 3 | (3) **the whole handle assembly is buried.** The loft's crown sits at ≈0.42 across x −0.13…0.11, but the straps are placed at `HEIGHT*0.84 / 0.87`, the spine at `HEIGHT*0.9` and the grip at `0.92 / 0.95` → tops of 0.368, 0.380, 0.389 and 0.419, i.e. **20–40 mm below the surface**. The `front` and `top` tiles show no handle at all, only strap tips. Raise to 0.93·H / 0.99·H, spine 0.404, risers 0.42, grip 0.44. (3) `strap()` reuses the crown `depth` for its side runs and buckle, so those land at z ±0.186–0.216 against a flank at **0.22** — 27 mm inside the fabric; only the amber tongue shows. Key the side runs off `DEPTH` (±0.215, buckle 0.224). (3) `plaque` floats 7 mm off the flank while (—) `paintMark` at `DEPTH*0.5 − 0.01` is entirely **inside** it — the two disagree in sign. (1) the base pan spans y −0.0015…0.0335, **1.5 mm below the floor plane**. |
| `sacks` | 3 | (3) **`model.ts:80` passes `position[1] + height*0.5`** to a profile already authored 0…height, double-shifting every sack (**K11**). Bases land at 0.185…0.48 against a sheet top of **0.032** — the whole stack hovers 155–170 mm in the air (`front` and `right` tiles). Pass `position[1]`. (3) the neck and tie, authored in the un-shifted frame at `height*0.99` / `*1.03`, consequently sit at ~50 % of the sack's height and are buried — no sack shows a gathered neck. Fixed by the same change. (3) the `plaque` and both `paintMark`s sit in the void under the lifted stack (the loose fin in the `right` tile); re-seat them at z ≈ 0.10 and 0.13 afterwards. |
| `cargo-strap` | 2, 3 | Every tile shows the parts flying apart. (2) the two tail boxes use `rotation: [0, +0.3, 0]` and `[0, +0.85, 0]`, but Ry gives direction (cos θ, −sin θ): tail 1 ends at (0.433, 0.006) and tail 2 starts at (0.417, 0.080) → a **117 mm gap**, with the rivet and the free hook missing too. **Negate both** (the −Z tail already uses −0.5) and all four pieces meet within 25 mm. (3) both `hook()` calls sit at y 0.081–0.119 — **81 mm above the deck**; use y = 0.019. (2) `hook()`'s `rotation: [π/2, yaw, 0]` composes to an extrusion axis of (sin yaw, −cos yaw, 0), tipping the claw **29–49° out of horizontal** instead of spinning it in plane — use `[π/2, 0, yaw]`, which is the kit's own `faceSpin` rule. (3) the coil's first turn floats 4 mm; the ratchet frame is 6 mm above the top coil. |
| `cargo-pallet` | 1 | **Cleanest model in the wave** — deck, pans, locators, reader and marks all have 4–13 mm bite. Two fixes: (—) the two end-beam `plaque`s are **31 mm inside** the 0.1-thick end beam (plate 0.567–0.589 against faces at ±0.62), so no stripe appears in any tile — use `±(LENGTH*0.5 − 0.003)`. (1) the three rubber pads share a bottom face at **y = 0** with the runners, same facing → z-fight on the underside of all three (**K22**). |

### 6.1 Triage, and the machine-derived risk order

As a first pass on any model — and as the order to work the wave in — this is the mechanical triage.
The count is the number of face-applied helper calls that pass **face + an ad-hoc epsilon**, §1.2
pattern 2, the most common defect source in the wave.

```
grep -rcE "(plaque|stencil|paintMark|statusLens|seam|boltRun|bolt|tick)\(.*\+ 0\.0" \
  assets/prototypes/*/model.ts | grep -v ':0$'
```

| epsilon sites | models |
| ---: | --- |
| 7 | `industrial-horizontal-tank` |
| 6 | `industrial-equipment-rack`, `freight-cart` |
| 5 | `stacked-crates`, `polymer-case`, `long-cargo-crate`, `industrial-dumpster`, `equipment-chest`, `commercial-dumpster` |
| 4 | `industrial-crane-trolley`, `chemical-drum`, `cargo-trailer` |
| 3 | `stacked-drums`, `military-case`, `industrial-tool-chest`, `industrial-pressure-vessel`, `industrial-fuel-tank`, `industrial-cable-tray`, `hard-equipment-case`, `gas-bottles`, `container-door`, `cargo-crate-medium`, `armored-cargo-crate` |
| 2 | `weapon-crate`, `sealed-barrel`, `loading-dock-ramp`, `equipment-shelving`, `container-small`, `cargo-bag` |
| 1 | `square-cargo-crate`, `open-crate`, `industrial-tool-cabinet`, `cargo-pallet` |
| 0 | `shipping-container-short`, `shipping-container-open`, `container-stack`, `damaged-container`, `warehouse-shelf`, `sacks`, `cargo-strap` — these inherit their defects from the kit (**K8–K10**) or from curved-body / structural issues, not from epsilons |

Second axis — **curved-body hosts**, where §1.3 (facet sagitta) and **K3/K4** apply:
`chemical-drum`, `sealed-barrel`, `stacked-drums`, `gas-bottles`, `fuel-drum`,
`industrial-fuel-tank`, `industrial-horizontal-tank`, `industrial-pressure-vessel`,
`industrial-silo`. Of these, `fuel-drum` is the only one that does **not** call `radialPlaque` at
all — it uses the flat box-face helpers throughout.

Third axis — **`member()` callers**, where **K19** applies: any call whose two endpoints differ in
`z` silently produces an axis-aligned bar of the wrong length. Confirmed in
`industrial-horizontal-tank`, `freight-cart` and `cargo-trailer`; grep the rest with
`grep -n "member(" assets/prototypes/*/model.ts` and check the third component of both endpoints.

Fourth axis — **models with a visible lid/leaf/roof joint**, where **R7** applies:
every crate, case, chest, cabinet and dumpster. `renders/qa/commercial-dumpster.png` is the clearest
worked example in the sheet set: in `front`, `right`, `back` and `hero` the two lids hover clear of
the body with daylight visible under the whole lid line, and in `left` the lid reads as a plate
floating in space above the shell.

---

## 7. Fixer workflow

1. Apply the kit fixes **K1–K19** as one change, and re-render the whole sweep
   (`bash scripts/qa-sweep.sh`). Many per-model rows will already be gone.
2. Take one model. Open `renders/qa/<asset>.png` and look at `below` and `top` before reading code.
3. For every face-applied helper call in the model, write down the host's **outer face** coordinate
   and check the call passes exactly that (n = 1) or that plus `LAYER_CLEARANCE·(n−1)`.
4. For every structural pair, write the two spans and check the lap is ≥ 20 mm (≥ 30 mm for skins).
5. For every mirrored loop, check the offset is multiplied by the sign.
6. Re-render with `node scripts/qa-sheet.mjs <asset>` (needs real GPU access — run it outside the
   sandbox) and compare `below`, `top`, `front`/`back` against the checks in §4.
7. Never "nudge until it looks right". If a number is not derived from a face position or a span,
   it will drift again the next time the prop is resized.
