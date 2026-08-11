import type { LayoutSpec } from '../axiom-modular-kit/layout.ts'
import { prefabExports } from '../axiom-modular-kit/prefab.ts'

/**
 * The reference plate: a long rectangle split into two square bays by a
 * full-height partition, a wide doorway in the left bay's front wall, a broad
 * window in the right bay's front wall, and a window on each outer side wall.
 *
 * Two cells, two rooms. Everything else - walls, posts, beams, plinth, floors -
 * is derived from the plan by the layout grid.
 */
const LAYOUT: LayoutSpec = {
  plan: ['AB'],
  openings: [
    { cell: [0, 0], side: 'front', kind: 'door', offset: 0.16 },
    { cell: [1, 0], side: 'front', kind: 'window', offset: -0.15, width: 2 },
    { cell: [0, 0], side: 'left', kind: 'window', width: 1.55 },
    { cell: [1, 0], side: 'right', kind: 'window', width: 1.55 },
  ],
}

const shell = prefabExports('small-building-shell', LAYOUT)
export const createModel = shell.createModel
export const createPreview = shell.createPreview
export const createSidePreview = shell.createSidePreview
export const createRearPreview = shell.createRearPreview
export const createLowPreview = shell.createLowPreview
