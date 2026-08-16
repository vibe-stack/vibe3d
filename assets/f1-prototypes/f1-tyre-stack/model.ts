// f1-tyre-stack — a blanketed stack of loose tyres (garage dressing): N `f1-wheel-assembly` tyres laid
// flat and stacked, wrapped in a coloured warmer-blanket sleeve with a dangling power cable. Depends on
// `f1-wheel-assembly` for the individual tyres, matching the kit's registry-dependency pattern for props
// composed from other props. Ported from a private racing project's pit-box garage dressing.

import {
  CylinderGeometry,
  DirectionalLight,
  Group,
  HemisphereLight,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  Scene,
  Vector3,
  type Material,
} from 'three/webgpu'

import { taperedTube } from '../f1-kit-core/sculpt.ts'
import { ResourceBag } from '../f1-kit-core/resourceBag.ts'
import { createModel as createWheel, type F1WheelAssemblyInstance } from '../f1-wheel-assembly/model.ts'

export interface F1TyreStackConfig {
  /** Number of tyres in the stack. */
  count: number
  /** Aero cover disc colour, passed through to every tyre's `cover` slot. */
  coverColor: number
  /** Accent ring colour, passed through to every tyre's `accent` slot. */
  accentColor: number
}

export interface F1TyreStackOptions extends Partial<F1TyreStackConfig> {
  materials?: Partial<Record<'blanket' | 'cable', Material>>
}

export interface F1TyreStackInstance {
  readonly root: Group
  readonly parts: { tyres: Group; blanket: Group; cable: Group }
  readonly materials: Readonly<Record<'blanket' | 'cable', Material>>
  getConfig(): Readonly<F1TyreStackConfig>
  configure(patch: Partial<F1TyreStackConfig>): void
  setMaterial(slot: 'blanket' | 'cable', material: Material): void
  update(deltaSeconds: number): void
  dispose(): void
}

const defaults: F1TyreStackConfig = {
  count: 4,
  coverColor: 0x0b0c0e,
  accentColor: 0xc6ff2a,
}

const TH = 0.38 // stacked pitch (tyre width laid flat)
const R = 0.36 // stack radius (matches a default f1-wheel-assembly's ~0.33 m tyre)

export function createModel(options: F1TyreStackOptions = {}): F1TyreStackInstance {
  const config: F1TyreStackConfig = {
    count: Math.max(1, Math.round(options.count ?? defaults.count)),
    coverColor: options.coverColor ?? defaults.coverColor,
    accentColor: options.accentColor ?? defaults.accentColor,
  }

  const bag = new ResourceBag()
  const blanket = (options.materials?.blanket ?? bag.mat(new MeshStandardMaterial({ color: config.accentColor, roughness: 0.85, metalness: 0.0 }))) as Material
  const cable = (options.materials?.cable ?? bag.mat(new MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.9, metalness: 0.0 }))) as Material
  const materialSlots: Record<'blanket' | 'cable', Material> = { blanket, cable }

  const root = new Group()
  root.name = 'f1-tyre-stack'
  const tyresGroup = new Group(); tyresGroup.name = 'tyres'
  const blanketGroup = new Group(); blanketGroup.name = 'blanket'
  const cableGroup = new Group(); cableGroup.name = 'cable'
  root.add(tyresGroup, blanketGroup, cableGroup)

  // Shared cover/accent materials handed to every tyre instance (one pair, not one per tyre) — owned here
  // so recolouring the stack recolours every tyre in one place.
  const tyreCover = bag.mat(new MeshStandardMaterial({ color: config.coverColor, roughness: 0.4, metalness: 0.2 }))
  const tyreAccent = bag.mat(new MeshStandardMaterial({ color: config.accentColor, roughness: 0.5, metalness: 0.1 }))

  let wheels: F1WheelAssemblyInstance[] = []
  const generatedGeometries: import('three/webgpu').BufferGeometry[] = []

  const clearGenerated = (): void => {
    for (const wheel of wheels) wheel.dispose()
    wheels = []
    blanketGroup.clear()
    cableGroup.clear()
    for (const g of generatedGeometries) g.dispose()
    generatedGeometries.length = 0
  }

  const rebuild = (): void => {
    clearGenerated()
    const { count } = config

    for (let i = 0; i < count; i++) {
      const wheel = createWheel({ materials: { cover: tyreCover, accent: tyreAccent } })
      wheel.root.rotation.x = Math.PI / 2 // axle Z -> vertical, tyre lies flat
      wheel.root.position.y = R + i * TH
      tyresGroup.add(wheel.root)
      wheels.push(wheel)
    }

    // Warmer blanket sleeve — a coloured cylinder skin hugging the stack, open-ended top and bottom.
    const h = count * TH
    const blanketGeo = new CylinderGeometry(R + 0.02, R + 0.02, h, 24, 1, true)
    generatedGeometries.push(blanketGeo)
    const blanketMesh = new Mesh(blanketGeo, blanket)
    blanketMesh.position.y = R + h / 2 - TH / 2
    blanketGroup.add(blanketMesh)

    // A dangling power cable stub from the top of the stack.
    const cableGeo = taperedTube([
      new Vector3(R, R + h - TH, 0),
      new Vector3(R + 0.25, R + 0.2, 0.1),
      new Vector3(R + 0.35, 0.02, 0.2),
    ], 0.02, 6)
    generatedGeometries.push(cableGeo)
    cableGroup.add(new Mesh(cableGeo, cable))
  }
  rebuild()

  return {
    root,
    parts: { tyres: tyresGroup, blanket: blanketGroup, cable: cableGroup },
    materials: materialSlots,
    getConfig: () => ({ ...config }),
    configure(patch) {
      if (patch.count !== undefined) config.count = Math.max(1, Math.round(patch.count))
      if (patch.coverColor !== undefined) { config.coverColor = patch.coverColor; tyreCover.color.set(patch.coverColor) }
      if (patch.accentColor !== undefined) { config.accentColor = patch.accentColor; tyreAccent.color.set(patch.accentColor) }
      rebuild()
    },
    setMaterial(slot, material) {
      materialSlots[slot] = material
      if (slot === 'blanket') blanketGroup.traverse((o) => { if (o instanceof Mesh) o.material = material })
      if (slot === 'cable') cableGroup.traverse((o) => { if (o instanceof Mesh) o.material = material })
    },
    update: () => {},
    dispose() {
      clearGenerated()
      bag.dispose()
      root.removeFromParent()
    },
  }
}

export function createPreview({ aspect }: { aspect: number; time?: number }) {
  const model = createModel()
  const scene = new Scene()
  scene.add(model.root, new HemisphereLight(0x8ea3b2, 0x0a0c10, 0.6))
  const key = new DirectionalLight(0xfff2e2, 1.2)
  key.position.set(-2.5, 3.5, 3)
  scene.add(key)
  const camera = new PerspectiveCamera(30, aspect, 0.05, 40)
  camera.position.set(2.1, 1.4, 2.1)
  camera.lookAt(0, 0.6, 0)
  scene.add(camera)
  return { scene, root: model.root, camera, update: model.update, dispose: model.dispose }
}
