import {
  AmbientLight,
  BoxGeometry,
  Color,
  DirectionalLight,
  Group,
  Mesh,
  MeshPhysicalMaterial,
  PerspectiveCamera,
  Scene,
  type Material,
} from 'three/webgpu'
import {
  MaterialLibrary,
  tuneMaterial,
  type MaterialHandle,
} from '../../../src/asset-forge/generator/index.ts'

export interface ModularWallConfig {
  width: number
  height: number
  thickness: number
  ribCount: number
}

export interface ModularWallOptions extends Partial<ModularWallConfig> {
  materialLibrary?: MaterialLibrary
  materials?: Partial<Record<'panel' | 'frame' | 'accent', Material>>
}

export interface ModularWallParts {
  panel: Mesh<BoxGeometry, Material>
  frame: Group
  ribs: Group
}

export interface ModularWallInstance {
  readonly root: Group
  readonly parts: ModularWallParts
  readonly materials: Readonly<Record<'panel' | 'frame' | 'accent', Material>>
  getConfig(): Readonly<ModularWallConfig>
  configure(patch: Partial<ModularWallConfig>): void
  setMaterial(slot: keyof ModularWallInstance['materials'], material: Material): void
  update(deltaSeconds: number): void
  dispose(): void
}

const defaults: ModularWallConfig = { width: 4, height: 3, thickness: 0.28, ribCount: 4 }

export function createModel(options: ModularWallOptions = {}): ModularWallInstance {
  const config: ModularWallConfig = {
    width: options.width ?? defaults.width,
    height: options.height ?? defaults.height,
    thickness: options.thickness ?? defaults.thickness,
    ribCount: options.ribCount ?? defaults.ribCount,
  }
  const library = options.materialLibrary ?? new MaterialLibrary()
  const handles: MaterialHandle[] = []
  const material = (slot: 'panel' | 'frame' | 'accent', color: number, roughness: number, metalness: number) => {
    const external = options.materials?.[slot]
    if (external) return external
    const handle = library.acquire({ recipeId: slot, palette: slot, condition: 'worked' })
    handles.push(handle)
    return tuneMaterial(handle, color, roughness, metalness)
  }
  const materials: Record<'panel' | 'frame' | 'accent', Material> = {
    panel: material('panel', 0x68737a, 0.58, 0.42),
    frame: material('frame', 0x252c31, 0.44, 0.72),
    accent: material('accent', 0xd98723, 0.4, 0.55),
  }

  const root = new Group()
  root.name = 'modular-wall'
  const panel = new Mesh(new BoxGeometry(1, 1, 1), materials.panel)
  panel.name = 'panel'
  panel.castShadow = panel.receiveShadow = true
  const frame = new Group()
  frame.name = 'frame'
  const ribs = new Group()
  ribs.name = 'ribs'
  frame.add(ribs)
  root.add(panel, frame)

  const replaceGeometry = (mesh: Mesh<BoxGeometry, Material>, dimensions: [number, number, number]) => {
    mesh.geometry.dispose()
    mesh.geometry = new BoxGeometry(...dimensions)
  }
  const rebuild = () => {
    config.width = Math.max(0.5, config.width)
    config.height = Math.max(0.5, config.height)
    config.thickness = Math.max(0.05, config.thickness)
    config.ribCount = Math.max(0, Math.round(config.ribCount))
    replaceGeometry(panel, [config.width, config.height, config.thickness])
    for (const child of [...ribs.children]) {
      if (child instanceof Mesh) child.geometry.dispose()
      ribs.remove(child)
    }
    const railThickness = Math.min(0.13, config.height * 0.06)
    for (const y of [-config.height / 2, config.height / 2]) {
      const rail = new Mesh(new BoxGeometry(config.width + 0.2, railThickness, config.thickness + 0.12), materials.frame)
      rail.position.y = y
      rail.castShadow = true
      ribs.add(rail)
    }
    const spacing = config.width / (config.ribCount + 1)
    for (let index = 1; index <= config.ribCount; index += 1) {
      const rib = new Mesh(new BoxGeometry(0.09, config.height, config.thickness + 0.09), index % 2 === 0 ? materials.accent : materials.frame)
      rib.position.x = -config.width / 2 + spacing * index
      rib.castShadow = true
      ribs.add(rib)
    }
  }
  rebuild()

  const parts = { panel, frame, ribs }
  return {
    root,
    parts,
    materials,
    getConfig: () => ({ ...config }),
    configure(patch) {
      Object.assign(config, patch)
      rebuild()
    },
    setMaterial(slot, next) {
      materials[slot] = next
      panel.material = materials.panel
      for (const [index, child] of ribs.children.entries()) {
        if (child instanceof Mesh) child.material = index > 1 && index % 2 === 1 ? materials.accent : materials.frame
      }
    },
    update: () => undefined,
    dispose() {
      root.traverse((object) => {
        if (object instanceof Mesh) object.geometry.dispose()
      })
      for (const handle of handles) handle.release()
      root.removeFromParent()
    },
  }
}

export function createPreview({ aspect }: { aspect: number; time?: number }) {
  const scene = new Scene()
  scene.background = new Color(0x11161b)
  const model = createModel()
  model.root.rotation.y = -0.35
  scene.add(model.root)
  scene.add(new AmbientLight(0xb7c7d8, 1.4))
  const key = new DirectionalLight(0xfff4dc, 5)
  key.position.set(5, 7, 6)
  scene.add(key)
  const camera = new PerspectiveCamera(28, aspect, 0.1, 100)
  camera.position.set(7, 4.5, 9)
  camera.lookAt(0, 0.3, 0)
  return {
    scene,
    root: model.root,
    camera,
    update: model.update,
    dispose() {
      model.dispose()
    },
  }
}
