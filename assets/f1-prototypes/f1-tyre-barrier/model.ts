// f1-tyre-barrier — tightly compressed bare touring-tyre packs with deterministic weather cycling,
// interlocked courses, and continuous FIA-style webbing that wraps to credible rear anchors.

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
const R = 0.32
const W = 0.22
const PITCH_X = R * 2 * 0.88
const PITCH_Y = W * 0.86
const PITCH_Z = R * 2 * 0.82

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
  const materialSlots: Record<Slot, Material> = { tyre: options.materials?.tyre ?? kit.ink }
  const weatherOwned = options.materials?.tyre ? [] : [kit.ink.clone(), kit.ink.clone(), kit.ink.clone()]
  if (weatherOwned.length > 0) {
    weatherOwned[0]!.color.multiplyScalar(0.72)
    weatherOwned[1]!.color.multiplyScalar(0.84)
    weatherOwned[2]!.color.multiplyScalar(0.94)
  }
  const weatherMaterials: Material[] = options.materials?.tyre ? [options.materials.tyre] : weatherOwned
  let useWeather = options.materials?.tyre === undefined
  let disposed = false
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
    const tyreMaterial = materialSlots.tyre
    prototype = createTyre({
      radius: R,
      width: W,
      treadSegments: 10,
      compound: config.compound,
      tread: 'slick',
      materials: {
        rubber: tyreMaterial,
        tread: tyreMaterial,
        rim: tyreMaterial,
        metal: tyreMaterial,
        cover: tyreMaterial,
        accent: tyreMaterial,
        band: tyreMaterial,
      },
    })
    prototype.root.updateMatrixWorld(true)
    materialSlots.tyre = prototype.materials.rubber

    const pose = new Matrix4()
    const twist = new Matrix4()
    const composed = new Matrix4()
    const halfX = ((columns - 1) * PITCH_X) / 2
    prototype.root.traverse((object) => {
      const mesh = object as Mesh
      if (!mesh.isMesh || mesh.parent?.name !== 'tire') return
      let index = 0
      for (let d = 0; d < depth; d++) {
        for (let r = 0; r < rows; r++) {
          const stagger = (r % 2) * PITCH_X * 0.46
          for (let c = 0; c < columns; c++) {
            const x = -halfX + c * PITCH_X + stagger
            const y = W / 2 + r * PITCH_Y + ((index % 3) - 1) * 0.004
            const z = (d - (depth - 1) / 2) * PITCH_Z
            pose.makeRotationX(Math.PI / 2)
            twist.makeRotationY(((index % 5) - 2) * 0.018)
            pose.multiply(twist)
            pose.setPosition(x, y, z)
            composed.copy(pose).multiply(mesh.matrixWorld)
            const material = useWeather ? weatherMaterials[index % weatherMaterials.length]! : materialSlots.tyre
            const instanced = new InstancedMesh(mesh.geometry, material, 1)
            instanced.name = mesh.name
            instanced.castShadow = true
            instanced.receiveShadow = true
            instanced.setMatrixAt(0, composed)
            instanced.instanceMatrix.needsUpdate = true
            tyres.add(instanced)
            index++
          }
        }
      }
    })

    const hardware: BufferGeometry[] = []
    const wallH = rows * PITCH_Y
    const frontZ = ((depth - 1) / 2) * PITCH_Z + R + 0.025
    const rearZ = -frontZ
    const wrapDepth = frontZ - rearZ
    for (let c = 0; c < columns; c++) {
      const x = -halfX + c * PITCH_X + (c % 2) * 0.018
      const frontBand = bevelBox(0.09, wallH + 0.08, 0.009, 0.003)
      frontBand.translate(x, wallH / 2, frontZ)
      hardware.push(frontBand)
      const topBand = bevelBox(0.09, 0.009, wrapDepth, 0.003)
      topBand.translate(x, wallH + 0.035, 0)
      hardware.push(topBand)
      const rearBand = bevelBox(0.09, wallH + 0.08, 0.009, 0.003)
      rearBand.translate(x, wallH / 2, rearZ)
      hardware.push(rearBand)
      const anchor = bevelBox(0.15, 0.08, 0.055, 0.008)
      anchor.translate(x, 0.055, rearZ - 0.03)
      hardware.push(anchor)
    }
    const merged = mergeParts(hardware, 'straps')
    generated.push(merged)
    const strapMesh = new Mesh(merged, kit.fabric)
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
      useWeather = false
      tyres.traverse((object) => {
        const mesh = object as Mesh
        if (mesh.isMesh && mesh.name !== 'straps') mesh.material = material
      })
    },
    update: () => {},
    dispose() {
      releaseGenerated()
      if (!disposed) {
        disposeF1Materials(bundle)
        for (const material of weatherOwned) material.dispose()
        disposed = true
      }
      root.removeFromParent()
    },
  }
}

export function createPreview({ aspect }: { aspect: number; time?: number }) {
  return createF1Preview(createModel({ columns: 4, rows: 5, depth: 2 }), {
    aspect,
    target: [0, 0.5, 0.08],
    distance: 4.15,
    fov: 30,
    yaw: -0.62,
    pitch: 0.38,
  })
}
