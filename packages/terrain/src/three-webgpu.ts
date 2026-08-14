import {
  BufferAttribute,
  BufferGeometry,
  StorageBufferAttribute,
} from 'three/webgpu'
import { storage } from 'three/tsl'
import { assertCompiledTopology, type CompiledTopology } from './index.js'

export function createWebGpuTopologyBuffers(topology: CompiledTopology) {
  assertCompiledTopology(topology)
  const vertexCount = topology.domainCoordinates.length / 3
  const geometry = new BufferGeometry()
  const domain = new StorageBufferAttribute(topology.domainCoordinates.slice(), 3)
  const position = new StorageBufferAttribute(vertexCount, 3)
  const normal = new StorageBufferAttribute(vertexCount, 3)
  const stableVertexId = new StorageBufferAttribute(topology.stableVertexIds.slice(), 1)

  geometry.setIndex(new BufferAttribute(topology.indices.slice(), 1))
  geometry.setAttribute('position', position)
  geometry.setAttribute('normal', normal)
  geometry.setAttribute('terrainDomain', domain)
  geometry.setAttribute('terrainStableVertexId', stableVertexId)

  let disposed = false
  return {
    geometry,
    attributes: { domain, position, normal, stableVertexId },
    nodes: {
      domain: storage(domain, 'vec3', vertexCount),
      position: storage(position, 'vec3', vertexCount),
      normal: storage(normal, 'vec3', vertexCount),
      stableVertexId: storage(stableVertexId, 'uint', vertexCount),
    },
    collisionIndices: topology.collisionIndices.slice(),
    lods: topology.lods.map((lod) => ({ ...lod, indices: lod.indices.slice() })),
    dispose(): void {
      if (disposed) return
      disposed = true
      geometry.dispose()
    },
  }
}
