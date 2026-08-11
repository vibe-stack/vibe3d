import type { LayoutSpec } from '../axiom-modular-kit/layout.ts'
import { prefabExports } from '../axiom-modular-kit/prefab.ts'

/**
 * An L: a two-bay front range and a wing running back off its right end. The
 * re-entrant corner is derived like any other - the vertex where three wall
 * segments meet is given a junction post, and the plinth expands only on the
 * cell sides that face open ground.
 */
const LAYOUT: LayoutSpec = {
  plan: ['AAB', '..B'],
  openings: [
    { cell: [0, 0], side: 'front', kind: 'door' },
    { cell: [1, 0], side: 'front', kind: 'window', width: 2.2 },
    { cell: [2, 0], side: 'front', kind: 'window', width: 2.2 },
    { cell: [0, 0], side: 'left', kind: 'window', width: 1.9 },
    { cell: [1, 0], side: 'rear', kind: 'window', width: 2.2 },
    { cell: [2, 1], side: 'right', kind: 'window', width: 1.9 },
    { cell: [2, 1], side: 'left', kind: 'door' },
    { cell: [2, 1], side: 'rear', kind: 'window', width: 2.2 },
  ],
}

const shell = prefabExports('l-wing-shell', LAYOUT)
export const createModel = shell.createModel
export const createPreview = shell.createPreview
export const createSidePreview = shell.createSidePreview
export const createRearPreview = shell.createRearPreview
export const createLowPreview = shell.createLowPreview
