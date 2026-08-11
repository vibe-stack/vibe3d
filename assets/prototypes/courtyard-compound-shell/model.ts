import type { LayoutSpec } from '../axiom-modular-kit/layout.ts'
import { prefabExports } from '../axiom-modular-kit/prefab.ts'

/**
 * A ring of eight bays around an open courtyard. The empty centre cell is
 * ordinary open ground as far as the layout is concerned, so the four walls
 * facing it come out as exterior walls - ring beam, plinth and all - pointing
 * inward.
 */
const LAYOUT: LayoutSpec = {
  plan: ['AAA', 'A.A', 'AAA'],
  openings: [
    { cell: [1, 0], side: 'front', kind: 'door' },
    { cell: [0, 0], side: 'front', kind: 'window', width: 2.2 },
    { cell: [2, 0], side: 'front', kind: 'window', width: 2.2 },
    { cell: [0, 1], side: 'left', kind: 'window', width: 1.9 },
    { cell: [2, 1], side: 'right', kind: 'window', width: 1.9 },
    { cell: [1, 1], side: 'front', kind: 'door' },
    { cell: [1, 1], side: 'rear', kind: 'door' },
    { cell: [1, 2], side: 'rear', kind: 'window', width: 2.2 },
  ],
}

const shell = prefabExports('courtyard-compound-shell', LAYOUT)
export const createModel = shell.createModel
export const createPreview = shell.createPreview
export const createSidePreview = shell.createSidePreview
export const createRearPreview = shell.createRearPreview
export const createLowPreview = shell.createLowPreview
