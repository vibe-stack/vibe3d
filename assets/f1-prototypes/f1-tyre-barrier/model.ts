// f1-tyre-barrier — a 3-high, 2-deep tyre wall built by instancing the kit f1-tyre.
// Source in the racing game used torus doughnuts; composing the real tyre is the quality pass.

import {
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  type Material,
} from 'three/webgpu'

import { createF1Preview } from '../f1-kit-core/index.ts'
import { createModel as createTyre, type F1TyreInstance } from '../f1-tyre/model.ts'

type Slot = 'tyre'

export interface F1TyreBarrierConfig {
  columns: number
  rows: number
  depth: number
}

export interface F1TyreBarrierOptions extends Partial<F1TyreBarrierConfig> {
  materials?: Partial<Record<Slot, Material>>
}

export interface F1TyreBarrierInstance {
  readonly root: Group
  readonly parts: { tyres: Group }
  readonly materials: Readonly<Record<Slot, Material>>
  getConfig(): Readonly<F1TyreBarrierConfig>
  configure(patch: Partial<F1TyreBarrierConfig>): void
  setMaterial(slot: Slot, material: Material): void
  update(deltaSeconds: number): void
  dispose(): void
}

const defaults: F1TyreBarrierConfig = { columns: 5, rows: 3, depth: 2 }
const R = 0.36
const W = 0.33

export function createModel(options: F1TyreBarrierOptions = {}): F1TyreBarrierInstance {
  const config: F1TyreBarrierConfig = {
    columns: Math.max(1, Math.round(options.columns ?? defaults.columns)),
    rows: Math.max(1, Math.round(options.rows ?? defaults.rows)),
    depth: Math.max(1, Math.round(options.depth ?? defaults.depth)),
  }

  const root = new Group()
  root.name = 'f1-tyre-barrier'
  const tyres = new Group(); tyres.name = 'tyres'
  root.add(tyres)

  let prototype: F1TyreInstance | null = null
  const materialSlots: Record<Slot, Material> = { tyre: options.materials?.tyre as Material }

  const releaseGenerated = (): void => {
    tyres.clear()
    prototype?.dispose()
    prototype = null
  }

  const rebuild = (): void => {
    releaseGenerated()
    const { columns, rows, depth } = config
    const count = columns * rows * depth
    prototype = createTyre({
      treadSegments: 10,
      materials: options.materials?.tyre ? { rubber: options.materials.tyre } : undefined,
    })
    prototype.root.updateMatrixWorld(true)
    materialSlots.tyre = prototype.materials.rubber

    const pose = new Matrix4()
    const composed = new Matrix4()
    const halfX = ((columns - 1) * R * 2) / 2
    prototype.root.traverse((object) => {
      const mesh = object as Mesh
      if (!mesh.isMesh) return
      const instanced = new InstancedMesh(mesh.geometry, mesh.material, count)
      instanced.name = mesh.name
      instanced.castShadow = true
      instanced.receiveShadow = true
      let i = 0
      for (let d = 0; d < depth; d++) {
        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < columns; c++) {
            const x = -halfX + c * R * 2
            const y = R + r * R * 2 * 0.92
            const z = (d - (depth - 1) / 2) * W
            pose.makeRotationY(d * 0.08)
            pose.setPosition(x, y, z)
            composed.copy(pose).multiply(mesh.matrixWorld)
            instanced.setMatrixAt(i, composed)
            i++
          }
        }
      }
      instanced.instanceMatrix.needsUpdate = true
      tyres.add(instanced)
    })
  }
  rebuild()

  return {
    root,
    parts: { tyres },
    materials: materialSlots,
    getConfig: () => ({ ...config }),
    configure(patch) {
      if (patch.columns !== undefined) config.columns = Math.max(1, Math.round(patch.columns))
      if (patch.rows !== undefined) config.rows = Math.max(1, Math.round(patch.rows))
      if (patch.depth !== undefined) config.depth = Math.max(1, Math.round(patch.depth))
      rebuild()
    },
    setMaterial(slot, material) {
      materialSlots[slot] = material
      tyres.traverse((object) => {
        const mesh = object as Mesh
        if (mesh.isMesh) mesh.material = material
      })
    },
    update: () => {},
    dispose() {
      releaseGenerated()
      root.removeFromParent()
    },
  }
}

export function createPreview({ aspect }: { aspect: number; time?: number }) {
  return createF1Preview(createModel({ columns: 4, rows: 3, depth: 2 }), {
    aspect,
    target: [0, 0.9, 0],
    distance: 8.5,
    fov: 32,
  })
}
