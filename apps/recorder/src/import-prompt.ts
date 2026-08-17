import type { CatalogItem } from './catalog.ts'

/** A paste-ready request for a coding agent working inside the target game. */
export function formatImportPrompt(items: readonly CatalogItem[]): string {
  const models = items
    .map((item) => item.category === 'Terrain'
      ? `- ${item.name} (\`assets/terrain/${item.id.replace(/-(?:cliff|canyon)-scene$/, '')}\`)`
      : `- ${item.name} (\`@scifi-kit/${item.id}\`)`)
    .join('\n')
  const registryCommands = items
    .filter((item) => item.category !== 'Terrain')
    .map((item) => `bunx vibe3d add @scifi-kit/${item.id}`)
    .join('\n')
  const terrainDirectories = [...new Set(items
    .filter((item) => item.category === 'Terrain')
    .map((item) => `assets/terrain/${item.id.replace(/-(?:cliff|canyon)-scene$/, '')}`))]

  const registrySection = registryCommands
    ? `Install the selected registry models with:

\`\`\`sh
${registryCommands}
\`\`\``
    : ''
  const terrainSection = terrainDirectories.length > 0
    ? `Copy each selected terrain asset's complete source directory into the game, including its compiled topology and surface-bake files, then install its runtime with \`bun add three @vibe3djs/terrain\`:

${terrainDirectories.map((directory) => `- \`${directory}\``).join('\n')}`
    : ''

  return `Import these Sci-Fi Kit models into this game:

${models}

${[registrySection, terrainSection].filter(Boolean).join('\n\n')}

Then inspect each installed model's factory, instantiate it in the existing Three.js scene, and place it at a sensible scale and position. Reuse the game's current renderer, lighting, materials, and update loop. Keep the installed model source editable and preserve any animation or interaction hooks it exposes.`
}
