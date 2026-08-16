import {
  Color,
  DirectionalLight,
  Group,
  HemisphereLight,
  Mesh,
  MeshPhysicalMaterial,
  PerspectiveCamera,
  Scene,
  Vector3,
  type BufferGeometry,
} from 'three/webgpu'

import {
  WEAR_ATTRIBUTES,
  bakeOcclusion,
  bakeSurfaceAttributes,
  createWearMaterial,
  mergeStaticByMaterial,
  prism,
  type Vec3,
  type WearProfile,
} from '../../../src/asset-forge/generator/index.ts'
import { AXIOM_KIT } from '../axiom-modular-kit/contract.ts'
import { KIT_BUILD, createKitMaterials, type KitMaterials } from '../axiom-modular-kit/parts.ts'

/**
 * The roof group: everything that happens on top of an Axiom shell.
 *
 * The kit's roof datum is not invented here. `axiom-modular-kit` already fixes
 * the ring beam at 3.30 m and ships a roof/floor edge module, so a roof deck's
 * underside is a known height and its edge already has a section. What was
 * missing is the deck itself and the things that stand on it.
 *
 * Every module in the group is authored about the deck's *top* surface at y=0,
 * with the structure hanging below into negative Y. That is deliberate: a roof
 * fitting is positioned by where it sits, not by how thick the deck under it
 * happens to be, so a machinery pad dropped onto a thicker deck later does not
 * need re-authoring.
 */

export const ROOF = Object.freeze({
  /** Structural bay, shared with the wall and shell grid. */
  grid: AXIOM_KIT.grid,
  increment: AXIOM_KIT.structuralIncrement,
  /** Deck slab thickness, matching the kit's floor slab. */
  deck: KIT_BUILD.floorThickness ?? 0.24,
  /** Height of the ring beam this deck lands on, for assembly reference. */
  beamTop: KIT_BUILD.beamTop,
  /** Standard parapet height above the deck surface. */
  parapet: 1,
  /** Deck falls this much per metre toward its outlets. */
  fall: 0.02,
  front: '+Z',
  pivot: 'deck-centre',
} as const)

export interface RoofEnvelope {
  readonly width: number
  readonly depth: number
  readonly height: number
}

export interface RoofModel {
  readonly root: Group
  readonly parts: Record<string, Group>
  update(deltaSeconds: number): void
  dispose(): void
}

export interface RoofBuild {
  readonly id: string
  readonly envelope: RoofEnvelope
  build(context: {
    root: Group
    m: KitMaterials
    part(name: string): Group
    /** A chamfered block in module space; the group's only primitive. */
    block(parent: Group, material: MeshPhysicalMaterial, size: Vec3, position: Vec3, rotation?: Vec3): Mesh
  }): { readonly tick?: (elapsed: number) => void } | void
}

const PROFILES = (m: KitMaterials): Map<MeshPhysicalMaterial, WearProfile> => new Map([
  // A roof is the one surface nobody maintains for looks, so its grime tier runs
  // above the rest of the kit's while its rub stays low — nothing rubs a roof.
  [m.shell, { rub: 0.008, grime: 0.05, scratch: 0 }],
  [m.porcelain, { rub: 0.006, grime: 0.04, scratch: 0 }],
  [m.graphite, { rub: 0.012, grime: 0.06, scratch: 0.002 }],
  [m.deck, { rub: 0.014, grime: 0.09, scratch: 0.004 }],
  [m.ink, { rub: 0.01, grime: 0.11, scratch: 0.004 }],
])

export function createRoofModel(spec: RoofBuild): RoofModel {
  const { materials, handles } = createKitMaterials(8_400 + spec.id.length * 191)
  const root = new Group()
  root.name = `AXR_ARCH_${spec.id.toUpperCase()}_ROOT_DEFAULT`

  const parts: Record<string, Group> = {}
  const part = (name: string): Group => {
    const existing = parts[name]
    if (existing) return existing
    const group = new Group()
    group.name = `AXR_ARCH_${spec.id.toUpperCase()}_PART_${name.toUpperCase()}_DEFAULT`
    parts[name] = group
    root.add(group)
    return group
  }

  const block = (parent: Group, material: MeshPhysicalMaterial, size: Vec3, position: Vec3, rotation?: Vec3): Mesh => {
    const smallest = Math.min(...size)
    const mesh = prism(material, size, position, {
      chamfer: Math.min(0.06, smallest * 0.24),
      fillet: Math.min(0.018, smallest * 0.1),
      bevel: Math.min(0.016, smallest * 0.13),
      ...(rotation ? { rotation } : {}),
    })
    parent.add(mesh)
    return mesh
  }

  const built = spec.build({ root, m: materials, part, block })

  root.userData.roofKit = {
    version: 1,
    moduleId: spec.id,
    pivot: ROOF.pivot,
    front: ROOF.front,
    envelope: spec.envelope,
    grid: ROOF.grid,
    deck: ROOF.deck,
  }

  bakeOcclusion(root, { reach: 0.2 })
  const profiles = PROFILES(materials)
  bakeSurfaceAttributes(root, profiles)
  const wearMaterial = createWearMaterial({
    name: `${spec.id} / weathered roof surfaces`,
    clearcoat: 0.06,
    clearcoatRoughness: 0.62,
  })
  const worn = new Set(profiles.keys())
  const geometries: BufferGeometry[] = [...mergeStaticByMaterial(root, {
    resolveMaterial: (source: MeshPhysicalMaterial) => worn.has(source) ? wearMaterial : source,
    retainedAttributes: (resolved: unknown) => resolved === wearMaterial ? WEAR_ATTRIBUTES : [],
    meshName: (material: { name?: string }) => `${spec.id} / ${material.name || 'batch'}`,
  } as Parameters<typeof mergeStaticByMaterial>[1])]

  let elapsed = 0
  return {
    root,
    parts,
    update: (deltaSeconds: number) => {
      elapsed += Math.min(Math.max(deltaSeconds, 0), 0.05)
      built?.tick?.(elapsed)
    },
    dispose: () => {
      for (const geometry of geometries) geometry.dispose()
      wearMaterial.dispose()
      for (const handle of handles) handle.release()
      root.traverse((object) => {
        if (object instanceof Mesh) object.geometry.dispose()
      })
    },
  }
}

export interface RoofPreview {
  readonly scene: Scene
  readonly root: Group
  readonly camera: PerspectiveCamera
  update(deltaSeconds: number): void
  dispose(): void
}

/**
 * The group's shared capture rig, matching the modular kit's lighting exactly,
 * but pitched down: a roof piece read from eye level is a silhouette, and the
 * whole point of these modules is what is on the deck.
 */
export function createRoofPreview(
  model: RoofModel,
  envelope: RoofEnvelope,
  options: { aspect?: number; distance?: number; yaw?: number; pitch?: number } = {},
): RoofPreview {
  const scene = new Scene()
  scene.background = new Color(0x04070a)
  scene.add(model.root)
  scene.add(new HemisphereLight(0xa8bbc5, 0x07090c, 0.86))
  const key = new DirectionalLight(0xffedd6, 2.5)
  key.position.set(-7, 10, 11)
  scene.add(key)
  const fill = new DirectionalLight(0x758bd0, 0.9)
  fill.position.set(9, 5, 6)
  scene.add(fill)
  const rim = new DirectionalLight(0x82aabd, 0.72)
  rim.position.set(6, 8, -9)
  scene.add(rim)

  const span = Math.max(envelope.width, envelope.depth, envelope.height)
  const target = new Vector3(0, envelope.height * 0.28 - ROOF.deck * 0.5, 0)
  const distance = options.distance ?? span * 1.5 + 2
  const yaw = options.yaw ?? -0.66
  const pitch = options.pitch ?? 0.46
  const aspect = Number.isFinite(options.aspect) && (options.aspect ?? 0) > 0 ? options.aspect! : 1

  const camera = new PerspectiveCamera(34, aspect, 0.08, 200)
  camera.position.set(
    target.x + Math.sin(yaw) * Math.cos(pitch) * distance,
    target.y + Math.sin(pitch) * distance,
    target.z + Math.cos(yaw) * Math.cos(pitch) * distance,
  )
  camera.lookAt(target)
  scene.add(camera)

  return {
    scene,
    root: model.root,
    camera,
    update: (deltaSeconds: number) => model.update(deltaSeconds),
    dispose: () => {
      scene.remove(model.root)
      model.dispose()
    },
  }
}

export { type KitMaterials } from '../axiom-modular-kit/parts.ts'
