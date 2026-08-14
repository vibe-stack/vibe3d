import { describe, expect, test } from 'bun:test'
import {
  BufferGeometry,
  Float32BufferAttribute,
  Group,
  InstancedMesh,
  Mesh,
  MeshBasicMaterial,
  PerspectiveCamera,
  Scene,
  Vector3,
} from 'three/webgpu'
import type { ModelPreview } from '../src/catalog.ts'
import { frameModel, modelStatsFor } from '../src/stage.tsx'

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

describe('recorder model framing', () => {
  test('centers an offset model in the camera without moving the model', () => {
    const root = new Group()
    const mesh = new Mesh(geometry(8), new MeshBasicMaterial())
    mesh.geometry.setAttribute('position', new Float32BufferAttribute([
      8, -2, -1, 12, -2, -1, 8, 4, -1, 12, 4, 3,
    ], 3))
    root.add(mesh)
    const scene = new Scene()
    scene.add(root)
    const camera = new PerspectiveCamera(40, 16 / 9, 0.1, 20)
    camera.position.set(0, 2, 8)
    camera.lookAt(0, 0, 0)
    const model = { scene, root, camera } as ModelPreview

    const target = frameModel(model)

    expect(target?.toArray()).toEqual([10, 1, 1])
    expect(root.position.toArray()).toEqual([0, 0, 0])
    expect(camera.getWorldDirection(new Vector3()).dot(target!.clone().sub(camera.position).normalize())).toBeCloseTo(1)
    expect(camera.near).toBe(0.01)
    expect(camera.far).toBeGreaterThan(20)
  })
})
