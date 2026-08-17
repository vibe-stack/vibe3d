import { describe, expect, test } from 'bun:test'
import type { CatalogItem } from '../src/catalog.ts'
import { formatImportPrompt } from '../src/import-prompt.ts'

const item = (id: string, name: string, category = 'Industrial'): CatalogItem => ({
  id,
  name,
  category,
  animated: false,
  preview: null,
  addedAt: null,
  controls: [],
  load: async () => { throw new Error('not used by this test') },
})

describe('model import prompt', () => {
  test('includes every selected model and its install command', () => {
    const prompt = formatImportPrompt([
      item('gantry-crane', 'Gantry Crane'),
      item('pressure-gauge', 'Pressure Gauge'),
    ])

    expect(prompt).toContain('- Gantry Crane (`@scifi-kit/gantry-crane`)')
    expect(prompt).toContain('- Pressure Gauge (`@scifi-kit/pressure-gauge`)')
    expect(prompt).toContain('bunx vibe3d add @scifi-kit/gantry-crane')
    expect(prompt).toContain('bunx vibe3d add @scifi-kit/pressure-gauge')
    expect(prompt).toContain('instantiate it in the existing Three.js scene')
  })

  test('uses the complete source directory for terrain instead of a missing registry item', () => {
    const prompt = formatImportPrompt([
      item('glacial-granite-boulder-cliff-scene', 'Glacial Granite Boulder Cliff Scene', 'Terrain'),
    ])

    expect(prompt).toContain('`assets/terrain/glacial-granite-boulder`')
    expect(prompt).toContain('bun add three @vibe3djs/terrain')
    expect(prompt).not.toContain('bunx vibe3d add @scifi-kit/glacial-granite-boulder-cliff-scene')
  })
})
