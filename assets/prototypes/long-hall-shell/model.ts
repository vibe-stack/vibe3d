import type { LayoutSpec } from '../axiom-modular-kit/layout.ts'
import { prefabExports } from '../axiom-modular-kit/prefab.ts'

/**
 * Three bays, one undivided room: a hangar, mess or workshop. With no room
 * letter change anywhere in the plan the layout emits no partitions, so the
 * interior is a single 11.7 m span under a continuous ring beam.
 */
const LAYOUT: LayoutSpec = {
  plan: ['AAA'],
  openings: [
    { cell: [1, 0], side: 'front', kind: 'door' },
    { cell: [0, 0], side: 'front', kind: 'window', width: 2.2 },
    { cell: [2, 0], side: 'front', kind: 'window', width: 2.2 },
    { cell: [0, 0], side: 'left', kind: 'window', width: 1.9 },
    { cell: [2, 0], side: 'right', kind: 'window', width: 1.9 },
    { cell: [1, 0], side: 'rear', kind: 'window', width: 2.2 },
  ],
}

const shell = prefabExports('long-hall-shell', LAYOUT)
export const createModel = shell.createModel
export const createPreview = shell.createPreview
export const createSidePreview = shell.createSidePreview
export const createRearPreview = shell.createRearPreview
export const createLowPreview = shell.createLowPreview
