// f1-tyre-stack — individually blanketed F1 tyres staged on a chrome two-tier wheeled garage rack.
// Each padded warmer fully covers its tyre, carries flat identifying webbing and a closure, and terminates
// in its own short lead and connector. Depends on `f1-tyre` for the concealed tyre anatomy while keeping
// stable stack-level runtime anchors and configuration.

import {
  BufferGeometry,
  CylinderGeometry,
  Group,
  InstancedMesh,
  LatheGeometry,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  Vector2,
  Vector3,
  type Material,
} from 'three/webgpu'

import {
  TOKEN,
  acquireF1Materials,
  bevelBox,
  createF1Preview,
  disposeF1Materials,
  mergeParts,
  shade,
  taperedTube,
} from '../f1-kit-core/index.ts'
import {
  createModel as createTyre,
  type F1Compound,
  type F1TyreInstance,
} from '../f1-tyre/model.ts'

type Slot = 'blanket' | 'strap' | 'cable'

export interface F1TyreStackConfig {
  /** Number of tyres in the stack. */
  count: number
  /** Which compound the stacked tyres are graded as, using the sport's official sidewall colour key. */
  compound: F1Compound
  /** Rim colour, passed through to every tyre's `cover` slot. */
  coverColor: number
  /** Livery accent, passed through to every tyre's `accent` slot. */
  accentColor: number
}

export interface F1TyreStackOptions extends Partial<F1TyreStackConfig> {
  materials?: Partial<Record<Slot, Material>>
}

export interface F1TyreStackInstance {
  readonly root: Group
  readonly parts: { tyres: Group; blanket: Group; cable: Group }
  readonly materials: Readonly<Record<Slot, Material>>
  getConfig(): Readonly<F1TyreStackConfig>
  configure(patch: Partial<F1TyreStackConfig>): void
  setMaterial(slot: Slot, material: Material): void
  update(deltaSeconds: number): void
  dispose(): void
}

const defaults: F1TyreStackConfig = {
  count: 4,
  compound: 'medium',
  coverColor: shade(TOKEN.INK_950, 0.04),
  accentColor: TOKEN.LIME_400,
}

const TH = 0.345      // stacked pitch — a default tyre is 0.33 m wide, so courses very nearly touch
const R = 0.36        // tyre outer radius, matching a default f1-tyre (720 mm OD)
const TYRE_HALF = 0.165 // half a default tyre's width: the distance from a course's centre to its face

// Buried tyres do not need the hero tread resolution — the blanket hides most of the crown, and only the
// bottom course and the top sidewall are ever seen. This is the tyre's single LOD knob.
const STACK_TREAD_SEGMENTS = 12

// ---------------------------------------------------------------------------------------------------
// Local geometry helpers, deliberately private to this file rather than shared through f1-kit-core:
// every `.ts` under f1-kit-core ships to kit consumers as permanent public surface.
// ---------------------------------------------------------------------------------------------------

/** A solid of revolution about +Y from an absolute `[radius, y]` profile. */
function latheY(profile: ReadonlyArray<readonly [number, number]>, segments: number): BufferGeometry {
  return new LatheGeometry(profile.map(([r, y]) => new Vector2(Math.max(1e-4, r), y)), segments)
}

/**
 * Wobble a revolve's radius as a smooth function of angle and height.
 *
 * A LatheGeometry is a machined arc by construction: every horizontal cross-section is a perfect circle,
 * which is exactly what makes a swept blanket read as a moulded drum however well the vertical profile is
 * shaped. Perturbing the radius per vertex breaks that circle without needing a hand-authored sweep.
 */
function wobble(geometry: BufferGeometry, amount: number): BufferGeometry {
  const position = geometry.getAttribute('position')
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i)
    const y = position.getY(i)
    const z = position.getZ(i)
    const radius = Math.hypot(x, z)
    if (radius < 1e-5) continue
    const angle = Math.atan2(z, x)
    // Two incommensurate harmonics, so the section never repeats cleanly around the circumference and
    // drifts course to course up the stack.
    const scale = 1 + amount * (Math.sin(angle * 3 + y * 4.1) * 0.6 + Math.sin(angle * 5 - y * 2.7) * 0.4)
    position.setX(i, x * scale)
    position.setZ(i, z * scale)
  }
  position.needsUpdate = true
  geometry.computeVertexNormals()
  return geometry
}

export function createModel(options: F1TyreStackOptions = {}): F1TyreStackInstance {
  const config: F1TyreStackConfig = {
    count: Math.max(1, Math.round(options.count ?? defaults.count)),
    compound: options.compound ?? defaults.compound,
    coverColor: options.coverColor ?? defaults.coverColor,
    accentColor: options.accentColor ?? defaults.accentColor,
  }

  const bundle = acquireF1Materials()
  const kit = bundle.materials
  const extras: Material[] = []
  const own = (material: Material): Material => {
    extras.push(material)
    return material
  }
  const materialSlots: Record<Slot, Material> = {
    blanket: options.materials?.blanket ?? kit.fabric,
    strap: options.materials?.strap ?? kit.orange,
    cable: options.materials?.cable ?? kit.ink,
  }

  // Runtime anchors: created once, never replaced (rules 10, 14).
  const root = new Group()
  root.name = 'f1-tyre-stack'
  const tyresGroup = new Group(); tyresGroup.name = 'tyres'
  const blanketGroup = new Group(); blanketGroup.name = 'blanket'
  const cableGroup = new Group(); cableGroup.name = 'cable'
  root.add(tyresGroup, blanketGroup, cableGroup)

  // Shared cover/accent materials handed to every tyre instance (one pair, not one per tyre) — owned here
  // so recolouring the stack recolours every tyre in one place. The children treat these as
  // consumer-supplied and never dispose them, so ownership stays here (rule 16).
  const tyreCover = own(new MeshStandardMaterial({ color: config.coverColor, roughness: 0.4, metalness: 0.2 })) as MeshStandardMaterial
  const tyreAccent = own(new MeshStandardMaterial({ color: config.accentColor, roughness: 0.5, metalness: 0.1 })) as MeshStandardMaterial

  let prototype: F1TyreInstance | null = null
  const generated: BufferGeometry[] = []
  const meshesBySlot: Record<Slot, Mesh[]> = { blanket: [], strap: [], cable: [] }

  const releaseGenerated = (): void => {
    tyresGroup.clear()
    prototype?.dispose()
    prototype = null
    blanketGroup.clear()
    cableGroup.clear()
    for (const geometry of generated) geometry.dispose()
    generated.length = 0
    for (const slot of Object.keys(meshesBySlot) as Slot[]) meshesBySlot[slot].length = 0
  }

  const emit = (slot: Slot, geometry: BufferGeometry, group: Group, name: string): void => {
    generated.push(geometry)
    const mesh = new Mesh(geometry, materialSlots[slot])
    mesh.name = name
    mesh.castShadow = true
    mesh.receiveShadow = true
    meshesBySlot[slot].push(mesh)
    group.add(mesh)
  }

  const rebuild = (): void => {
    releaseGenerated()
    const { count, compound } = config

    // --- The tyres themselves ------------------------------------------------------------------------
    // One tyre geometry set, drawn `count` times via InstancedMesh. GPU buffers exist once; dispose
    // runs once on the prototype. The prototype root stays off-scene so its meshes are not extra draws.
    prototype = createTyre({
      compound,
      treadSegments: STACK_TREAD_SEGMENTS,
      materials: { cover: tyreCover, accent: tyreAccent },
    })
    prototype.root.updateMatrixWorld(true)
    const columns = Math.ceil(count / 2)
    const rackWidth = Math.max(1.1, columns * TH + 0.28)
    const tierY = [0.46, 1.25] as const
    const tyrePosition = (index: number): Vector3 => {
      const tier = index < columns ? 0 : 1
      const column = index % columns
      return new Vector3((column - (columns - 1) / 2) * TH, tierY[tier], 0)
    }
    const pose = new Matrix4()
    const composed = new Matrix4()
    prototype.root.traverse((object) => {
      const mesh = object as Mesh
      if (!mesh.isMesh) return
      const instanced = new InstancedMesh(mesh.geometry, mesh.material, count)
      instanced.name = mesh.name
      instanced.castShadow = true
      instanced.receiveShadow = true
      for (let i = 0; i < count; i++) {
        pose.makeRotationY(Math.PI / 2)
        pose.setPosition(tyrePosition(i))
        composed.copy(pose).multiply(mesh.matrixWorld)
        instanced.setMatrixAt(i, composed)
      }
      instanced.instanceMatrix.needsUpdate = true
      tyresGroup.add(instanced)
    })

    // --- Individual full-coverage warmers ------------------------------------------------------------
    const blanketParts: BufferGeometry[] = []
    for (let i = 0; i < count; i++) {
      const position = tyrePosition(i)
      const half = TYRE_HALF + 0.018
      const profile: Array<readonly [number, number]> = [
        [0.001, -half],
        [R * 0.82, -half],
        [R + 0.025, -half + 0.028],
        [R + 0.045, -half + 0.075],
        [R + 0.048, 0],
        [R + 0.045, half - 0.075],
        [R + 0.025, half - 0.028],
        [R * 0.82, half],
        [0.001, half],
      ]
      const warmer = wobble(latheY(profile, 48), 0.006)
      warmer.rotateZ(-Math.PI / 2)
      warmer.translate(position.x, position.y, position.z)
      blanketParts.push(warmer)
    }
    emit('blanket', mergeParts(blanketParts, 'blankets'), blanketGroup, 'blankets')

    // --- Flat webbing, closures and label tabs --------------------------------------------------------
    const strapParts: BufferGeometry[] = []
    for (let i = 0; i < count; i++) {
      const position = tyrePosition(i)
      const band = latheY([
        [R + 0.049, -0.038],
        [R + 0.061, -0.038],
        [R + 0.061, 0.038],
        [R + 0.049, 0.038],
        [R + 0.049, -0.038],
      ], 40)
      band.rotateZ(-Math.PI / 2)
      band.translate(position.x, position.y, position.z)
      strapParts.push(band)
      const closure = bevelBox(0.07, 0.048, 0.026, 0.005)
      closure.translate(position.x, position.y, R + 0.064)
      strapParts.push(closure)
      const label = bevelBox(0.085, 0.024, 0.012, 0.003)
      label.translate(position.x + 0.075, position.y - 0.065, R + 0.059)
      strapParts.push(label)
    }
    emit('strap', mergeParts(strapParts, 'straps'), blanketGroup, 'straps')

    // --- Chrome two-tier wheeled rack ---------------------------------------------------------------
    const rackParts: BufferGeometry[] = []
    const halfW = rackWidth / 2
    const halfD = 0.5
    for (const sx of [-1, 1] as const) {
      for (const sz of [-1, 1] as const) {
        rackParts.push(taperedTube([
          new Vector3(sx * halfW, 0.12, sz * halfD),
          new Vector3(sx * halfW, 1.7, sz * halfD),
        ], 0.026, 10))
        const wheel = new CylinderGeometry(0.075, 0.075, 0.038, 14)
        wheel.rotateX(Math.PI / 2)
        wheel.translate(sx * halfW, 0.075, sz * halfD)
        rackParts.push(wheel)
      }
    }
    for (const y of [0.14, 0.85, 1.64]) {
      for (const z of [-halfD, halfD]) {
        rackParts.push(taperedTube([
          new Vector3(-halfW, y, z),
          new Vector3(halfW, y, z),
        ], 0.024, 10))
      }
    }
    for (const y of [0.23, 1.02]) {
      for (const z of [-0.29, 0.29]) {
        rackParts.push(taperedTube([
          new Vector3(-halfW, y, z),
          new Vector3(halfW, y, z),
        ], 0.022, 10))
      }
    }
    const rackGeometry = mergeParts(rackParts, 'rack')
    generated.push(rackGeometry)
    const rack = new Mesh(rackGeometry, kit.steel)
    rack.name = 'two-tier-rack'
    rack.castShadow = true
    rack.receiveShadow = true
    blanketGroup.add(rack)

    // --- One short lead and connector per warmer ----------------------------------------------------
    const cableParts: BufferGeometry[] = []
    for (let i = 0; i < count; i++) {
      const position = tyrePosition(i)
      const side = i % 2 === 0 ? 1 : -1
      const start = new Vector3(position.x + side * 0.08, position.y + 0.25, R + 0.045)
      cableParts.push(taperedTube([
        start,
        new Vector3(start.x + side * 0.08, start.y + 0.025, start.z + 0.055),
        new Vector3(start.x + side * 0.15, start.y - 0.015, start.z + 0.08),
      ], 0.011, 8))
      const connector = bevelBox(0.05, 0.026, 0.028, 0.004)
      connector.translate(start.x + side * 0.17, start.y - 0.02, start.z + 0.08)
      cableParts.push(connector)
    }
    emit('cable', mergeParts(cableParts, 'cables'), cableGroup, 'cables')
  }
  rebuild()

  return {
    root,
    parts: { tyres: tyresGroup, blanket: blanketGroup, cable: cableGroup },
    materials: materialSlots,
    getConfig: () => ({ ...config }),
    configure(patch) {
      if (patch.count !== undefined) config.count = Math.max(1, Math.round(patch.count))
      if (patch.compound !== undefined) config.compound = patch.compound
      if (patch.coverColor !== undefined) { config.coverColor = patch.coverColor; tyreCover.color.set(patch.coverColor) }
      if (patch.accentColor !== undefined) { config.accentColor = patch.accentColor; tyreAccent.color.set(patch.accentColor) }
      rebuild()
    },
    setMaterial(slot, material) {
      // One mesh per slot, so this is a direct reassignment with no rebuild.
      materialSlots[slot] = material
      for (const mesh of meshesBySlot[slot]) mesh.material = material
    },
    update: () => {},
    dispose() {
      releaseGenerated()
      disposeF1Materials(bundle)
      for (const material of extras) material.dispose()
      root.removeFromParent()
    },
  }
}

export function createPreview({ aspect }: { aspect: number; time?: number }) {
  return createF1Preview(createModel(), { aspect, target: [0, 0.88, 0], distance: 3.65, yaw: -0.62, pitch: 0.22 })
}
