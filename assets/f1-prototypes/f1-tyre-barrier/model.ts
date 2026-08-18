// f1-tyre-barrier — a catch-fence tyre wall of kit f1-tyres laid on their sidewalls and stacked
// like a real FIA barrier (not standing on the tread), with through-bolts and front wrap bands.

import {
  BufferGeometry,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  type Material,
} from 'three/webgpu'

import {
  acquireF1Materials,
  bevelBox,
  createF1Preview,
  disposeF1Materials,
  mergeParts,
  tubeSection,
  type Compound,
} from '../f1-kit-core/index.ts'
import { createModel as createTyre, type F1TyreInstance } from '../f1-tyre/model.ts'

type Slot = 'tyre'

export interface F1TyreBarrierConfig {
  columns: number
  rows: number
  depth: number
  /** Sidewall grading for every tyre in the wall. */
  compound: Compound
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

const defaults: F1TyreBarrierConfig = { columns: 5, rows: 5, depth: 2, compound: 'intermediate' }
const R = 0.36
const W = 0.33
const PITCH_X = R * 2 * 0.96
const PITCH_Y = W * 0.94
const PITCH_Z = R * 2 * 0.92

export function createModel(options: F1TyreBarrierOptions = {}): F1TyreBarrierInstance {
  const config: F1TyreBarrierConfig = {
    columns: Math.max(1, Math.round(options.columns ?? defaults.columns)),
    rows: Math.max(1, Math.round(options.rows ?? defaults.rows)),
    depth: Math.max(1, Math.round(options.depth ?? defaults.depth)),
    compound: options.compound ?? defaults.compound,
  }

  const bundle = acquireF1Materials()
  const kit = bundle.materials

  const root = new Group()
  root.name = 'f1-tyre-barrier'
  const tyres = new Group(); tyres.name = 'tyres'
  root.add(tyres)

  let prototype: F1TyreInstance | null = null
  const materialSlots: Record<Slot, Material> = { tyre: options.materials?.tyre as Material }
  const generated: BufferGeometry[] = []

  const releaseGenerated = (): void => {
    tyres.clear()
    for (const geometry of generated) geometry.dispose()
    generated.length = 0
    prototype?.dispose()
    prototype = null
  }

  const rebuild = (): void => {
    releaseGenerated()
    const { columns, rows, depth } = config
    const count = columns * rows * depth
    prototype = createTyre({
      treadSegments: 10,
      compound: config.compound,
      materials: options.materials?.tyre ? { rubber: options.materials.tyre } : undefined,
    })
    prototype.root.updateMatrixWorld(true)
    materialSlots.tyre = prototype.materials.rubber

    const pose = new Matrix4()
    const twist = new Matrix4()
    const composed = new Matrix4()
    const halfX = ((columns - 1) * PITCH_X) / 2
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
          const stagger = (r % 2) * R
          for (let c = 0; c < columns; c++) {
            const x = -halfX + c * PITCH_X + stagger
            const y = W / 2 + r * PITCH_Y
            const z = (d - (depth - 1) / 2) * PITCH_Z
            pose.makeRotationX(Math.PI / 2)
            twist.makeRotationY(d * 0.06 + c * 0.02)
            pose.multiply(twist)
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

    const hardware: BufferGeometry[] = []
    const wallH = rows * PITCH_Y
    const wallW = columns * PITCH_X + R
    const frontZ = ((depth - 1) / 2) * PITCH_Z + R + 0.04
    for (let d = 0; d < depth; d++) {
      const z = (d - (depth - 1) / 2) * PITCH_Z
      for (let c = 0; c < columns; c++) {
        const x = -halfX + c * PITCH_X
        hardware.push(tubeSection(0.016, wallH + 0.08, [x, wallH / 2, z], [0, 1, 0], 8))
      }
    }
    for (let r = 0; r < rows; r++) {
      const y = W / 2 + r * PITCH_Y
      const band = bevelBox(wallW * 0.9, 0.04, 0.032, 0.006)
      band.translate(0, y, frontZ)
      hardware.push(band)
    }
    const merged = mergeParts(hardware, 'straps')
    generated.push(merged)
    const strapMesh = new Mesh(merged, kit.steel)
    strapMesh.name = 'straps'
    strapMesh.castShadow = true
    tyres.add(strapMesh)
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
      if (patch.compound !== undefined) config.compound = patch.compound
      rebuild()
    },
    setMaterial(slot, material) {
      materialSlots[slot] = material
      tyres.traverse((object) => {
        const mesh = object as Mesh
        if (mesh.isMesh && mesh.name !== 'straps') mesh.material = material
      })
    },
    update: () => {},
    dispose() {
      releaseGenerated()
      disposeF1Materials(bundle)
      root.removeFromParent()
    },
  }
}

export function createPreview({ aspect }: { aspect: number; time?: number }) {
  return createF1Preview(createModel({ columns: 4, rows: 5, depth: 2 }), {
    aspect,
    target: [0, 0.75, 0.15],
    distance: 5.8,
    fov: 30,
    yaw: -0.62,
    pitch: 0.38,
  })
}
