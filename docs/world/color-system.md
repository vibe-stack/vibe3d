# Color system

Color is a gameplay and world-building language, not decoration. The palette
uses a quiet neutral chassis and a small number of saturated semantic signals.
The exact tokens below are canonical; asset briefs should reference token IDs,
not invent near-duplicates.

## Core tokens

| Token | Hex | Role | Usage rule |
| --- | --- | --- | --- |
| `INK-950` | `#071019` | deepest service cavity | backs, vents, underside, critical text on light surfaces |
| `INK-900` | `#111820` | dark structural metal | frames, brackets, machinery, shadows with readable detail |
| `GRAPHITE-800` | `#182633` | secondary service plane | panels, housings, rails, equipment backs |
| `SLATE-650` | `#4A5963` | mid-value utility plane | worn metal, concrete shadow, low-priority structure |
| `SHELL-200` | `#D9E6E9` | standard technical shell | clean coated alloy and structural polymer base |
| `SHELL-050` | `#F5FBFB` | clean highlight shell | civic, laboratory, medical, selected hero planes |
| `PAPER-000` | `#FFFFFF` | reserved text/highlight | UI/wayfinding only; not a dominant world material |
| `COBALT-500` | `#3E6CFF` | active navigation / civic identity | wayfinding, powered systems, controlled brand blocks |
| `CYAN-400` | `#24DFFF` | active data / traversal | powered edges, screens, ziplines, safe interactive read |
| `VIOLET-500` | `#8B6CFF` | phase / anomaly | portals, rifts, gravity, unstable energy |
| `MAGENTA-400` | `#FF4FC8` | social/nightlife signal | E-District, celebration, entertainment, selected relay accents |
| `LIME-400` | `#B8E95B` | biological / approved safe | ecology, cultivation, medical-safe state, foliage accents |
| `AMBER-400` | `#F3B33D` | caution / service attention | warning lamps, temporary work zones, active maintenance |
| `ORANGE-500` | `#FF7A3D` | heat / thermal process | lava, furnace, high-temperature exhaust, thermal state |
| `RED-500` | `#EB514E` | critical danger / damage | alarm, breach, fire, severe damage; use sparingly |
| `RUST-500` | `#B85C43` | aged oxide / frontier warmth | weathering, old steel, local repairs, not an alert |
| `FIELD-500` | `#57B57A` | field operations / environmental monitor | camps, storm/wildlife research, approved monitoring |
| `DUST-300` | `#C9B99E` | dry mineral / old-world dust | desert, lunar dust, rubble tint, terrain dressing |
| `ICE-300` | `#A9D5E5` | frozen mineral / cold atmosphere | ice edges, frost, frozen POIs, cool glass tint |

## Semantic states

| State | Primary token | Optional secondary | Meaning |
| --- | --- | --- | --- |
| `available` | `CYAN-400` | `SHELL-050` | active, usable, or safe traversal |
| `navigation` | `COBALT-500` | `CYAN-400` | direction, ownership, route, objective |
| `phase` | `VIOLET-500` | `MAGENTA-400` | phase energy, rift, gravity anomaly |
| `social` | `MAGENTA-400` | `VIOLET-500` | nightlife, commerce, celebration |
| `biological` | `LIME-400` | `FIELD-500` | plant, wildlife, medical-safe, ecological monitoring |
| `caution` | `AMBER-400` | `ORANGE-500` | attention, maintenance, heat boundary |
| `critical` | `RED-500` | `AMBER-400` | active danger, breach, fire, severe damage |
| `inactive` | `SLATE-650` | `INK-900` | unpowered or retired system |

## Palette application by place family

| Family | Base neutrals | Signal allowance | Accent limit |
| --- | --- | --- | --- |
| Frontier / military | `INK-900`, `GRAPHITE-800`, `SHELL-200` | `AMBER-400`, `RED-500`, `COBALT-500` | one dominant signal + one warning |
| Industrial / thermal | `INK-950`, `GRAPHITE-800`, `RUST-500` | `AMBER-400`, `ORANGE-500`, `CYAN-400` | two signals only when systems overlap |
| Clean civic / scientific | `SHELL-050`, `SHELL-200`, `INK-900` | `COBALT-500`, `CYAN-400`, `VIOLET-500` | one saturated signal per facade plane |
| Dense urban / night | `INK-950`, `INK-900`, `SLATE-650` | `MAGENTA-400`, `CYAN-400`, `LIME-400` | sign clusters share a district cadence |
| Ecology / lunar / disaster | `DUST-300`, `ICE-300`, `SLATE-650`, terrain colors | `LIME-400`, `FIELD-500`, `ORANGE-500`, `RED-500` | state signals must beat natural color only at gameplay points |

## Contrast and clarity rules

- Use `PAPER-000` or `SHELL-050` text on `INK-950`/`INK-900`; use `INK-950`
  text on `SHELL-050`/`SHELL-200`. These are the default high-contrast pairs.
- Do not use cyan, magenta, violet, lime, or amber as long-form text colors on
  mid-value surfaces. Use them as short labels, lamps, borders, or icons with
  a dark keyline or plate behind them.
- Keep interactable-state signals at least one value step away from their
  background. A light cyan bar on a white shell needs a dark recess or dark
  outline to remain legible.
- Reserve `RED-500` for a meaningful critical state; never use it as generic
  decoration. Reserve `MAGENTA-400` for social/phase contexts so it does not
  compete with damage.
- A color signal should be reinforced by shape, placement, pulse, label, or
  material response. Color must not be the only carrier of a state.
- At thumbnail distance, a prop should still separate into a neutral silhouette,
  a dark service layer, and one semantic accent group.

## Reference implementation seed

The current procedural Axiom Relay uses the following exact colors and is the
first validation target: `INK-950` `#071019`, `GRAPHITE-800` `#182633`,
`SHELL-200` `#D9E6E9`, `SHELL-050` `#F5FBFB`, `CYAN-400` `#24DFFF`, and
`MAGENTA-400` `#FF4FC8`. New props should look like relatives of that seed.
