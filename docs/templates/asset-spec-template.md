# Asset spec template

This is the contract used by generated briefs. Keep the headings stable so
focused agents can find information quickly.

## Identity

- **Asset ID:** `asset.<family>.<slug>`
- **Source label:**
- **Level:** `L1` / `L2` / `L3` / `L4`
- **Family / place family:**
- **Owner / story role:**

## Intent

State what the asset is, why it exists in the world, and what a player should
understand from its silhouette and state.

## Reference render

Link the same-folder `<asset-slug>.png` generated from the approved Axiom Relay
render prompt. Keep the Markdown link next to the prop brief so agents can
compare the render without searching the index.

## Public contract

- footprint and height;
- pivot and orientation;
- sockets and attachment points;
- interaction states;
- collision/readability notes;
- LOD and instancing intent.

## Visual brief

Describe primary silhouette, service layer, signal layer, proportions, edge
language, clutter limits, and what makes this particular asset distinct.

## Construction

Explain the recommended part breakdown, reusable modules, articulation, and
damage seams. Keep the construction testable and procedural-friendly.

## Performance and implementation

Document LOD0/LOD1/LOD2 intent, instancing candidates, collision simplification,
preview conditions, and any state-driven geometry or FX budget.

## Materials and color

List `MAT-*` IDs and exact color tokens from the central world docs. Explain
where each appears and which state changes it participates in.

## Variants and states

Document clean/default, active, damaged, destroyed, legacy, or location variants
without turning each variant into a new art style.

## Dependencies

Link to shared rules and direct blocking or optional assets.

## Acceptance checklist

- [ ] silhouette reads at far distance;
- [ ] function reads at mid distance;
- [ ] public dimensions and pivot are preserved;
- [ ] material and color tokens are canonical;
- [ ] state/variant behavior is documented;
- [ ] dependencies and sockets are explicit;
- [ ] collision/LOD intent is clear.
