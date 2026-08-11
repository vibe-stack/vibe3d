import type { LayoutSpec } from '../axiom-modular-kit/layout.ts'
import { prefabExports } from '../axiom-modular-kit/prefab.ts'

/** The canonical one-bay room, built from the same plan system as every larger shell. */
const LAYOUT: LayoutSpec = {
  plan: ['A'],
  openings: [
    { cell: [0, 0], side: 'front', kind: 'door' },
    { cell: [0, 0], side: 'right', kind: 'window', width: 1.9 },
    { cell: [0, 0], side: 'rear', kind: 'window', width: 1.9 },
  ],
}

const shell = prefabExports('room-shell', LAYOUT)
export const createModel = shell.createModel
export const createPreview = shell.createPreview
export const createSidePreview = shell.createSidePreview
export const createRearPreview = shell.createRearPreview
export const createLowPreview = shell.createLowPreview
