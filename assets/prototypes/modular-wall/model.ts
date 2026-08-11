import {
  Color,
  DirectionalLight,
  Group,
  HemisphereLight,
  Mesh,
  PerspectiveCamera,
  Scene,
  type Material,
  type MeshPhysicalMaterial,
} from 'three/webgpu'

import { buildWallSection } from '../axiom-modular-kit/layout.ts'
import { KIT_BUILD, createKitMaterials, wallFace, type KitMaterials } from '../axiom-modular-kit/parts.ts'

export interface ModularWallConfig {
  width: number
  /** @deprecated Axiom wall height is fixed by the shared kit datum. */
  height: number
  /** @deprecated Axiom wall thickness is fixed by the shared kit datum. */
  thickness: number
  /** @deprecated Cassette rhythm is derived from width by the shared builder. */
  ribCount: number
}

export interface ModularWallOptions extends Partial<ModularWallConfig> {
  materials?: Partial<Record<'panel' | 'frame' | 'accent', Material>>
}

export interface ModularWallInstance {
  readonly root: Group
  readonly parts: { panel: Group; frame: Group; ribs: Group }
  readonly materials: Readonly<Record<'panel' | 'frame' | 'accent', Material>>
  getConfig(): Readonly<ModularWallConfig>
  configure(patch: Partial<ModularWallConfig>): void
  setMaterial(slot: 'panel' | 'frame' | 'accent', material: Material): void
  update(deltaSeconds: number): void
  dispose(): void
}

const defaults: ModularWallConfig = {
  width: 4,
  height: KIT_BUILD.wallTop,
  thickness: KIT_BUILD.wallThickness,
  ribCount: 2,
}

export function createModel(options: ModularWallOptions = {}): ModularWallInstance {
  const acquired = createKitMaterials(4200)
  const config = { ...defaults, width: Math.max(0.75, options.width ?? defaults.width) }
  const generated = new Group()
  generated.name = 'generated-wall-section'
  const root = new Group()
  root.name = 'modular-wall'
  root.add(generated)

  const materialSlots: Record<'panel' | 'frame' | 'accent', Material> = {
    panel: options.materials?.panel ?? acquired.materials.shell,
    frame: options.materials?.frame ?? acquired.materials.graphite,
    accent: options.materials?.accent ?? acquired.materials.amber,
  }

  const resolvedMaterials = (): KitMaterials => ({
    ...acquired.materials,
    shell: materialSlots.panel as MeshPhysicalMaterial,
    graphite: materialSlots.frame as MeshPhysicalMaterial,
    amber: materialSlots.accent as MeshPhysicalMaterial,
  })

  const clearGenerated = (): void => {
    generated.traverse((object) => {
      if (object instanceof Mesh) object.geometry.dispose()
    })
    generated.clear()
  }

  const rebuild = (): void => {
    clearGenerated()
    const width = Math.max(0.75, config.width)
    buildWallSection(generated, resolvedMaterials(), wallFace([-width / 2, 0, -KIT_BUILD.wallThickness / 2], 0), 0, width)
  }
  rebuild()

  // Stable semantic anchors remain valid when configure() rebuilds geometry.
  const panel = new Group(); panel.name = 'panel'
  const frame = new Group(); frame.name = 'frame'
  const ribs = new Group(); ribs.name = 'ribs'
  root.add(panel, frame, ribs)

  return {
    root,
    parts: { panel, frame, ribs },
    materials: materialSlots,
    getConfig: () => ({ ...config }),
    configure(patch) {
      if (patch.width !== undefined) config.width = Math.max(0.75, patch.width)
      // Legacy controls resolve to the shared Axiom datums instead of creating
      // a visually incompatible second wall system.
      config.height = defaults.height
      config.thickness = defaults.thickness
      config.ribCount = Math.max(1, Math.round(config.width / 2.2))
      rebuild()
    },
    setMaterial(slot, material) {
      materialSlots[slot] = material
      rebuild()
    },
    update: () => {},
    dispose() {
      clearGenerated()
      for (const handle of acquired.handles) handle.release()
      root.removeFromParent()
    },
  }
}

export function createPreview({ aspect }: { aspect: number; time?: number }) {
  const model = createModel()
  const scene = new Scene()
  scene.background = new Color(0x000000)
  scene.add(model.root, new HemisphereLight(0x8ea3b2, 0x0a0c10, 0.3))
  const key = new DirectionalLight(0xfff2e2, 1.25)
  key.position.set(-5, 8, 7)
  scene.add(key)
  const camera = new PerspectiveCamera(28, aspect, 0.05, 80)
  camera.position.set(6.5, 4.4, 8)
  camera.lookAt(0, 1.5, -0.15)
  scene.add(camera)
  return { scene, root: model.root, camera, update: model.update, dispose: model.dispose }
}
