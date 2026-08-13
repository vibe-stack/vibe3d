#!/usr/bin/env bash
# Renders a QA orbit sheet for every asset named in renders/qa/wave-assets.txt.
#
# One sheet per prop rather than one contact sheet for the wave: the defects
# this hunts - a floating bracket, an unclosed seam, coplanar faces - are only
# legible at close to full render size, and only from angles the hero framing
# never shows.
set -uo pipefail

while read -r asset; do
  [ -n "$asset" ] || continue
  printf '%-36s' "$asset"
  if node scripts/qa-sheet.mjs "$asset" >/dev/null 2>&1; then echo ok; else echo FAILED; fi
done < renders/qa/wave-assets.txt
