#!/usr/bin/env bash
# Renders every prototype that exposes createPreview, so old and new waves can
# be compared under identical capture settings.
#
# Each model still supplies its own camera and lights - that is deliberate. The
# question this supports is whether the *pack* reads as one catalogue, and a
# model's own rig is part of how it reads.
set -uo pipefail

for dir in assets/prototypes/*/; do
  asset="$(basename "$dir")"
  [ -f "$dir/model.ts" ] || continue
  grep -q 'createPreview' "$dir/model.ts" || continue
  printf '%-36s' "$asset"
  node --import tsx scripts/asset-forge/cli.ts preview \
    --module "${dir}model.ts" \
    --export createPreview \
    --asset "$asset" >/dev/null 2>&1 && echo ok || echo FAILED
done
