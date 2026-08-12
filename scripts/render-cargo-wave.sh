#!/usr/bin/env bash
# Renders every prop in the cargo, storage, and logistics wave through the
# deterministic preview rig, then composes one contact sheet.
#
# The whole wave is re-rendered rather than only what changed, because the point
# of the sheet is cross-model comparison: a stale tile beside fresh ones is
# worse than no sheet at all.
set -euo pipefail

SHEET="${1:-cargo-wave.png}"

ASSETS=(
  shipping-container-standard shipping-container-short shipping-container-open
  container-small container-stack container-door damaged-container
  cargo-crate-large cargo-crate-medium square-cargo-crate long-cargo-crate
  open-crate armored-cargo-crate weapon-crate stacked-crates
  military-case polymer-case hard-equipment-case equipment-chest
  fuel-drum chemical-drum sealed-barrel stacked-drums gas-bottles
  wooden-pallet cargo-pallet sacks cargo-bag cargo-net cargo-strap
  storage-rack warehouse-shelf equipment-shelving
  cargo-trolley freight-cart cargo-trailer loading-dock-ramp
  industrial-fuel-tank industrial-horizontal-tank industrial-silo
  industrial-pressure-vessel industrial-cable-tray industrial-equipment-rack
  industrial-tool-chest industrial-tool-cabinet
  industrial-hoist industrial-crane-trolley industrial-forklift-loader
  industrial-dumpster commercial-dumpster
)

for asset in "${ASSETS[@]}"; do
  printf '%-34s' "$asset"
  node --import tsx scripts/asset-forge/cli.ts preview \
    --module "assets/prototypes/${asset}/model.ts" \
    --export createPreview \
    --asset "$asset" >/dev/null 2>&1 && echo ok || echo FAILED
done

node scripts/contact-sheet.mjs "$SHEET" "${ASSETS[@]}"
