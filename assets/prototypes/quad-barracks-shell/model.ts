import type { LayoutSpec } from '../axiom-modular-kit/layout.ts'
import { prefabExports } from '../axiom-modular-kit/prefab.ts'

/**
 * Four separate rooms on a 2x2 plan. Every internal cell edge divides two
 * different room letters, so the layout raises a full partition cross with a
 * four-way junction post at the centre.
 */
const LAYOUT: LayoutSpec = {
  plan: ['AB', 'CD'],
  openings: [
    { cell: [0, 0], side: 'front', kind: 'door' },
    { cell: [1, 0], side: 'front', kind: 'window', width: 2.2 },
    { cell: [0, 0], side: 'left', kind: 'window', width: 1.9 },
    { cell: [1, 0], side: 'right', kind: 'window', width: 1.9 },
    { cell: [0, 1], side: 'left', kind: 'door' },
    { cell: [1, 1], side: 'right', kind: 'window', width: 1.9 },
    { cell: [0, 1], side: 'rear', kind: 'window', width: 2.2 },
    { cell: [1, 1], side: 'rear', kind: 'window', width: 2.2 },
  ],
}

const shell = prefabExports('quad-barracks-shell', LAYOUT)
export const createModel = shell.createModel
export const createPreview = shell.createPreview
export const createSidePreview = shell.createSidePreview
export const createRearPreview = shell.createRearPreview
export const createLowPreview = shell.createLowPreview
