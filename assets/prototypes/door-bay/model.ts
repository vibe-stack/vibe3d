import type { KitSocket } from '../axiom-modular-kit/contract.ts'
import { createAxiomComponent, createAxiomComponentPreview } from '../axiom-modular-kit/component.ts'
import { buildWallSection } from '../axiom-modular-kit/layout.ts'
import { KIT_BUILD, facePrism, wallFace } from '../axiom-modular-kit/parts.ts'

const WIDTH = 2
const DEPTH = 0.67
const CENTRE_Z = -DEPTH / 2

const SOCKETS = [
  { name: 'wall_snap_left', kind: 'wall', position: [0, 1.5, CENTRE_Z], normal: [-1, 0, 0] },
  { name: 'wall_snap_right', kind: 'wall', position: [WIDTH, 1.5, CENTRE_Z], normal: [1, 0, 0] },
  { name: 'door_leaf_center', kind: 'door', position: [WIDTH / 2, KIT_BUILD.floorY, CENTRE_Z], normal: [0, 0, 1] },
  { name: 'door_control_right', kind: 'service', position: [WIDTH - 0.12, 1.5, 0], normal: [0, 0, 1] },
  { name: 'floor_snap_center', kind: 'floor', position: [WIDTH / 2, KIT_BUILD.floorY, CENTRE_Z], normal: [0, -1, 0] },
  { name: 'threshold_center', kind: 'door', position: [WIDTH / 2, 0, CENTRE_Z], normal: [0, -1, 0] },
  { name: 'prefab_mount_back', kind: 'door', position: [WIDTH / 2, KIT_BUILD.floorY, -DEPTH], normal: [0, 0, -1], up: [0, 1, 0] },
] as const satisfies readonly KitSocket[]

export function createModel() {
  return createAxiomComponent('door-bay', SOCKETS, (root, materials) => {
    const face = wallFace([0, 0, CENTRE_Z], 0)
    buildWallSection(root, materials, face, 0, WIDTH, {
      ring: false,
      opening: {
        kind: 'door',
        spec: {
          centre: WIDTH / 2,
          width: 1.56,
          sill: KIT_BUILD.floorY,
          head: 2.6,
          clip: [0.3, 0.3, 0, 0],
        },
      },
    })
    // Loose modules carry the slices of plinth and top datum that the prefab
    // layout supplies around the same opening.
    for (const u of [0.11, WIDTH - 0.11]) {
      facePrism(root, face, materials.graphite, [0.22, KIT_BUILD.floorY, DEPTH], u, KIT_BUILD.floorY / 2, 0,
        { fillet: 0.018, bevel: 0.014 })
    }
    facePrism(root, face, materials.graphite, [WIDTH, 0.05, DEPTH], WIDTH / 2, 2.975, 0,
      { fillet: 0.016, bevel: 0.012 })
  })
}

export function createPreview(options: { aspect: number }) {
  return createAxiomComponentPreview(options, 'door-bay', createModel)
}

export const createSidePreview = createPreview
export const createRearPreview = createPreview
export const createLowPreview = createPreview
