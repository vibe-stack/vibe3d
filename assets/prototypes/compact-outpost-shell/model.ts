import type { LayoutSpec } from '../axiom-modular-kit/layout.ts'
import { prefabExports } from '../axiom-modular-kit/prefab.ts'

/** One bay. The smallest thing the kit can make that is still a building. */
const LAYOUT: LayoutSpec = {
  plan: ['A'],
  openings: [
    { cell: [0, 0], side: 'front', kind: 'door' },
    { cell: [0, 0], side: 'right', kind: 'window', width: 1.9 },
    { cell: [0, 0], side: 'rear', kind: 'window', width: 1.55, offset: 0.4 },
  ],
}

const shell = prefabExports('compact-outpost-shell', LAYOUT)
export const createModel = shell.createModel
export const createPreview = shell.createPreview
export const createSidePreview = shell.createSidePreview
export const createRearPreview = shell.createRearPreview
export const createLowPreview = shell.createLowPreview
