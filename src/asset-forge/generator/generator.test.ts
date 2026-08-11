import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import {
  Float32BufferAttribute,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshPhysicalMaterial,
  SphereGeometry,
} from 'three/webgpu'
import {
  createWearMaterial,
  createSmokeTexture,
  createStaticGlbSnapshot,
  bakeSurfaceAttributes,
  filletRing,
  flatPlate,
  mergeStaticByMaterial,
  MaterialLibrary,
  mountMaterialSource,
  prism,
  tuneMaterial,
  type MaterialHandle,
} from './index.ts'

describe('generator primitives', () => {
  test('prism authors the geometry and wear attributes expected by the shared helpers', () => {
    const material = new MeshPhysicalMaterial()
    const mesh = prism(material, [2, 1, 0.5], [1, 2, 3], {
      chamfer: [0.2, 0.1, 0.05, 0],
      fillet: 0.04,
      bevel: 0.03,
    })

    assert.deepEqual(mesh.position.toArray(), [1, 2, 3])
    assert.ok(mesh.geometry.getAttribute('position').count > 0)
    assert.equal(mesh.geometry.getAttribute('normal').count,
      mesh.geometry.getAttribute('position').count,
    )
    assert.equal(mesh.geometry.getAttribute('aEdge').itemSize, 1)
    assert.equal(mesh.geometry.getAttribute('aPlane').itemSize, 2)

    mesh.geometry.dispose()
    material.dispose()
  })

  test('filletRing and flatPlate expose reusable authoring metadata', () => {
    const ring = filletRing([[1, 1], [-1, 1], [-1, -1], [1, -1]], 0.1, 2)
    assert.equal(ring.length, 12)
    assert.ok(ring.every((point) => Number.isFinite(point.nx + point.ny)))

    const material = new MeshPhysicalMaterial()
    const engraved = flatPlate(material, [2, 0.25], [0, 0, 0])
    const painted = flatPlate(material, [2, 0.25], [0, 0, 0], [0, 0, 0], false)
    assert.equal(engraved.userData.grooveCross, 'y')
    assert.equal(painted.userData.grooveCross, undefined)
    engraved.geometry.dispose()
    painted.geometry.dispose()
    material.dispose()
  })
})

describe('generator assembly helpers', () => {
  test('static GLB snapshots bake wear and omit explicitly excluded effects', () => {
    const root = new Group()
    const sourceMaterial = new MeshPhysicalMaterial({ color: 0x8b9294, roughness: 0.5, metalness: 0.3 })
    const worn = prism(sourceMaterial, [2, 1, 0.5], [0, 0, 0])
    const smoke = new Group()
    smoke.name = 'preview smoke'
    smoke.userData.excludeFromExport = true
    const orbGeometry = new SphereGeometry(0.1, 8, 6)
    const orbMaterial = new MeshPhysicalMaterial({ color: 0x55ffff })
    const orbs = new InstancedMesh(orbGeometry, orbMaterial, 2)
    const instanceMatrix = new Matrix4()
    orbs.setMatrixAt(0, instanceMatrix.makeTranslation(-0.2, 0, 0))
    orbs.setMatrixAt(1, instanceMatrix.makeTranslation(0.2, 0, 0))
    root.add(worn, smoke, orbs)
    const wornUv = worn.geometry.getAttribute('uv')
    wornUv.setXY(0, 0.5, 0.5)
    wornUv.setXY(1, 0.5, 0.5)
    wornUv.setXY(2, 0.5, 0.5)
    bakeSurfaceAttributes(root, new Map([
      [sourceMaterial, { rub: 1, grime: 0.8, scratch: 0.9 }],
    ]))

    const snapshot = createStaticGlbSnapshot(root, { textureSize: 32 })
    assert.equal(snapshot.root.getObjectByName('preview smoke'), undefined)
    assert.equal(snapshot.root.getObjectByProperty('isInstancedMesh', true), undefined)
    let bakedMeshes = 0
    let bakedSurface: Mesh | undefined
    snapshot.root.traverse((object) => {
      if (!(object instanceof Mesh)) return
      bakedMeshes += 1
      if (object.name.includes('baked surface')) bakedSurface = object
      assert.ok(object.material instanceof MeshPhysicalMaterial)
      const material = object.material as MeshPhysicalMaterial
      assert.equal(object.geometry.getAttribute('aMask'), undefined)
      if (material.normalMap) {
        const tangent = object.geometry.getAttribute('tangent')
        assert.ok(tangent)
        for (let index = 0; index < tangent.count; index += 1) {
          const length = Math.hypot(tangent.getX(index), tangent.getY(index), tangent.getZ(index))
          assert.ok(Math.abs(length - 1) < 1e-5, `tangent ${index} has length ${length}`)
          assert.equal(Math.abs(tangent.getW(index)), 1)
        }
      }
      if (!material.map && !material.normalMap && !material.roughnessMap && !material.metalnessMap) {
        assert.equal(object.geometry.getAttribute('uv'), undefined)
      }
    })
    assert.ok(bakedMeshes >= 3)
    const bakedMaterial = bakedSurface?.material as MeshPhysicalMaterial | undefined
    assert.ok(bakedSurface?.geometry.getAttribute('color'))
    assert.ok(bakedMaterial?.map)
    assert.ok(bakedMaterial?.normalMap)
    assert.ok(bakedMaterial?.roughnessMap)
    assert.ok(worn.geometry.getAttribute('aMask'), 'the live model must remain unchanged')

    snapshot.dispose()
    worn.geometry.dispose()
    sourceMaterial.dispose()
    orbGeometry.dispose()
    orbMaterial.dispose()
  })

  test('smoke textures are deterministic and do not require a DOM canvas', () => {
    const first = createSmokeTexture({ size: 16 })
    const second = createSmokeTexture({ size: 16 })
    assert.equal(first.image.width, 16)
    assert.equal(first.image.height, 16)
    assert.deepEqual(first.image.data, second.image.data)
    assert.ok((first.image.data as Uint8Array).some((value, index) => index % 4 === 3 && value > 0))
    first.dispose()
    second.dispose()
  })

  test('mergeStaticByMaterial remaps batches and retains requested attributes', () => {
    const root = new Group()
    const sourceA = new MeshPhysicalMaterial({ name: 'source-a' })
    const sourceB = new MeshPhysicalMaterial({ name: 'source-b' })
    const resolved = new MeshPhysicalMaterial({ name: 'resolved' })
    const first = prism(sourceA, [1, 1, 1], [-1, 0, 0])
    const second = prism(sourceB, [1, 1, 1], [1, 0, 0])
    const tag = (mesh: Mesh) => {
      const count = mesh.geometry.getAttribute('position').count
      mesh.geometry.setAttribute('batchTag', new Float32BufferAttribute(new Float32Array(count), 1))
    }
    tag(first)
    tag(second)
    root.add(first, second)

    const geometries = mergeStaticByMaterial(root, {
      resolveMaterial: () => resolved,
      retainedAttributes: () => ['aEdge', 'aPlane', 'batchTag'],
      meshName: () => 'merged-test-batch',
    })

    assert.equal(geometries.length, 1)
    assert.equal(root.children.length, 1)
    const merged = root.children[0] as Mesh
    assert.equal(merged.material, resolved)
    assert.equal(merged.name, 'merged-test-batch')
    assert.ok(merged.geometry.getAttribute('batchTag'))
    assert.ok(merged.geometry.index, 'merged batches should be re-indexed after attribute normalization')
    assert.ok(
      merged.geometry.getAttribute('position').count < (merged.geometry.index?.count ?? 0),
      're-indexing should share visually identical triangle vertices',
    )
    merged.geometry.computeBoundingBox()
    assert.ok((merged.geometry.boundingBox?.min.x ?? 0) < -1.4)
    assert.ok((merged.geometry.boundingBox?.max.x ?? 0) > 1.4)

    merged.geometry.dispose()
    sourceA.dispose()
    sourceB.dispose()
    resolved.dispose()
  })

  test('material helpers are configurable without asset-specific names', () => {
    const material = new MeshPhysicalMaterial()
    const handle: MaterialHandle = { key: 'test', material, release: () => undefined }
    tuneMaterial(handle, 0x123456, 0.7, 0.4, { clearcoat: 0.2, emissive: 1.5 })
    assert.equal(material.color.getHex(), 0x123456)
    assert.equal(material.roughness, 0.7)
    assert.equal(material.metalness, 0.4)
    assert.equal(material.emissiveIntensity, 1.5)

    const wear = createWearMaterial({ name: 'generator-test / wear', clearcoat: 0.1 })
    assert.equal(wear.name, 'generator-test / wear')
    assert.equal(wear.clearcoat, 0.1)
    wear.dispose()
    material.dispose()
  })

  test('material sources can be mounted and restored', () => {
    const material = new MeshPhysicalMaterial()
    let acquired = 0
    const restore = mountMaterialSource({
      acquire(_options, key) {
        acquired += 1
        return { key, material, release: () => undefined }
      },
    })
    const handle = new MaterialLibrary().acquire({ recipeId: 'paint', palette: 'blue' })
    assert.equal(handle.material, material)
    assert.equal(acquired, 1)
    restore()
    material.dispose()
  })
})
