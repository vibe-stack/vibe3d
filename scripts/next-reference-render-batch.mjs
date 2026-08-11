import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { resolve } from 'node:path'

const requestedCount = Math.max(1, Number(process.argv[2] || 4))
const assetRoot = resolve('docs/assets')
const files = []

function walk(directory) {
  for (const name of readdirSync(directory)) {
    const path = resolve(directory, name)
    if (statSync(path).isDirectory()) walk(path)
    else if (name.endsWith('.md') && !name.endsWith('_assembly.md')) files.push(path)
  }
}

function metadata(text) {
  return Object.fromEntries(
    [...text.matchAll(/^([a-z_]+): "?([^"\n]+)"?$/gm)].map((match) => [match[1], match[2]]),
  )
}

function promptFor(item) {
  return `Use case: stylized-concept
Asset type: isolated 3D prop reference render for the Axiom Relay game art bible
Primary request: Create the asset named "${item.heading}" as one original, high-fidelity stylized hard-surface or authored 3D reference render. This image will sit beside the asset's Markdown brief so future agents can compare their model against it.
Asset family: ${item.meta.source_section ?? 'Axiom Relay kit'}; subgroup or POI: ${item.meta.source_group ?? 'General'}; level: ${item.meta.level ?? 'planned'}; owner: ${item.meta.owner ?? 'Axiom operators'}.
Subject-specific visual brief: ${item.visual}
State/signal direction: ${item.state}
Scene/backdrop: perfectly flat pure black background (#000000), no environment, no floor plane, no scenery, no extra objects. A very subtle tight grounding shadow is allowed only if it keeps the silhouette readable.
Style/medium: match the approved Axiom Relay Supply Bin reference-render language: bold readable silhouette, clean planar forms, controlled chamfers, matte shell → dark service recess → precise accent, visible construction logic, restrained functional detail, polished stylized game-ready 3D render. It should feel like a relative of the approved test, not a copy and not a recognizable third-party game asset.
Color/material contract: use only canonical Axiom palette and material logic — SHELL-200 #D9E6E9, SHELL-050 #F5FBFB, INK-950 #071019, GRAPHITE-800 #182633, with semantic accents CYAN-400 #24DFFF, COBALT-500 #3E6CFF, VIOLET-500 #8B6CFF, MAGENTA-400 #FF4FC8, LIME-400 #B8E95B, AMBER-400 #F3B33D, ORANGE-500 #FF7A3D, RED-500 #EB514E, FIELD-500 #57B57A, DUST-300 #C9B99E, or ICE-300 #A9D5E5 only when the brief calls for them. Use coated alloy, structural polymer, brushed alloy, safety rubber, technical fabric, concrete, glass, biological, terrain, or decal surfaces as appropriate.
Composition/framing: one asset only, centered, fully visible, generous black padding, 3/4 product-reference view unless the form is a flat graphic, terrain patch, or large hero component that reads better front-on. No cutaway, no exploded view, no floating parts.
Lighting/mood: neutral-cool studio key from upper left, soft rim light, crisp highlights on chamfers, dark recesses still readable, emission localized to physical lenses, strips, screens, tubes, or projectors.
Constraints: preserve the named asset's silhouette and functional purpose; show chassis, service, and signal layers; keep the background truly black; no legible text unless the asset is explicitly a signage/graphic item; no brand marks or third-party logos; no watermark; no UI; no characters; no unrelated props.
Avoid: photoreal product photography, cartoon toy proportions, excessive neon, rainbow lighting, glossy chrome, random greebles, dense cyberpunk clutter, generic fantasy shapes, illegible text, extra copies of the asset, colored backgrounds, visible grid, turntable, or environment.`
}

walk(assetRoot)
files.sort()
const items = files
  .filter((path) => !existsSync(path.replace(/\.md$/i, '.png')))
  .slice(0, requestedCount)
  .map((path) => {
    const text = readFileSync(path, 'utf8')
    const heading = text.match(/^# (.+)$/m)?.[1] ?? path.split('/').pop().replace(/\.md$/, '')
    const visual = text.match(/## Visual brief\n\n([\s\S]*?)(?=\n### State signal|\n## Construction plan)/)?.[1]?.replace(/\s+/g, ' ').trim() ?? ''
    const state = text.match(/### State signal\n\n([\s\S]*?)(?=\n## Construction plan)/)?.[1]?.replace(/\s+/g, ' ').trim() ?? ''
    const item = {
      briefPath: path,
      imagePath: path.replace(/\.md$/i, '.png'),
      heading,
      meta: metadata(text),
      visual,
      state,
    }
    return { ...item, prompt: promptFor(item) }
  })

console.log(JSON.stringify(items))

