import { describe, expect, test } from 'bun:test'
import {
  BufferGeometry,
  Float32BufferAttribute,
  Group,
  InstancedMesh,
  Mesh,
  MeshBasicMaterial,
} from 'three/webgpu'
import type { ModelPreview } from '../src/catalog.ts'
import { modelStatsFor } from '../src/stage.tsx'

function geometry(vertices: number, name = ''): BufferGeometry {
  const result = new BufferGeometry()
  result.name = name
  result.setAttribute('position', new Float32BufferAttribute(new Float32Array(vertices * 3), 3))
  return result
}

function preview(root: Group): ModelPreview {
  return { root } as ModelPreview
}

describe('recorder model stats', () => {
  test('counts rendered instanced vertices and ignores hidden branches', () => {
    const root = new Group()
    root.add(new Mesh(geometry(3), new MeshBasicMaterial()))
    root.add(new InstancedMesh(geometry(5), new MeshBasicMaterial(), 2))

    const hidden = new Group()
    hidden.visible = false
    hidden.add(new Mesh(geometry(20), new MeshBasicMaterial()))
    root.add(hidden)

    expect(modelStatsFor(preview(root))).toEqual({ vertices: 13, activeLod: undefined })
  })

  test('reports and counts only the dominant terrain LOD during a cross-fade', () => {
    const root = new Group()
    root.userData.terrain = { lodWeights: [0.2, 0.7, 0.1] }
    root.add(
      new Mesh(geometry(12, 'compact LOD0'), new MeshBasicMaterial()),
      new Mesh(geometry(7, 'compact LOD1'), new MeshBasicMaterial()),
      new Mesh(geometry(4, 'compact LOD2'), new MeshBasicMaterial()),
    )

    expect(modelStatsFor(preview(root))).toEqual({ vertices: 7, activeLod: 'LOD 1' })
  })

  test('summarizes mixed LODs in a multi-formation scene', () => {
    const root = new Group()
    const near = new Group()
    near.userData.terrain = { lodWeights: [1, 0, 0] }
    near.add(new Mesh(geometry(9, 'LOD0'), new MeshBasicMaterial()))
    const far = new Group()
    far.userData.terrain = { lodWeights: [0, 0, 1] }
    far.add(new Mesh(geometry(3, 'LOD2'), new MeshBasicMaterial()))
    root.add(near, far)

    expect(modelStatsFor(preview(root))).toEqual({ vertices: 12, activeLod: 'LOD 0 / LOD 2' })
  })
})
