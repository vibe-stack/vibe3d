// f1-tyre-stack — a blanketed stack of loose tyres (garage dressing): N `f1-wheel-assembly` tyres laid
// flat and stacked, wrapped in a warmer blanket with a power cable running to the floor. Depends on
// `f1-wheel-assembly` for the individual tyres, matching the kit's registry-dependency pattern for props
// composed from other props.
//
// The blanket is the whole reason this prop is not just four wheels: it has to read as fabric wrapped
// around a stack, so it carries a scalloped profile that bulges over each tyre course and pinches at the
// seams between them, a vertical overlap flap where the wrap closes, buckled straps at the seams, and a
// folded hem top and bottom. The bottom course is left uncovered so the tyres it is wrapping still read.

import {
  BufferGeometry,
  CylinderGeometry,
  Group,
  LatheGeometry,
  MathUtils,
  Mesh,
  MeshStandardMaterial,
  Vector2,
  Vector3,
  type Material,
} from 'three/webgpu'

import { createF1Preview } from '../f1-kit-core/preview.ts'
import { TOKEN, shade } from '../f1-kit-core/palette.ts'
import { bevelBox } from '../f1-kit-core/bevel.ts'
import { creased, mergeParts } from '../f1-kit-core/merge.ts'
import { taperedTube } from '../f1-kit-core/sculpt.ts'
import { ResourceBag } from '../f1-kit-core/resourceBag.ts'
import {
  createModel as createWheel,
  type F1Compound,
  type F1WheelAssemblyInstance,
} from '../f1-wheel-assembly/model.ts'

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
  coverColor: 0x121216,
  accentColor: 0xc6ff2a,
}

const TH = 0.345      // stacked pitch — a default tyre is 0.33 m wide, so courses very nearly touch
const R = 0.36        // tyre outer radius, matching a default f1-wheel-assembly (720 mm OD)
const TYRE_HALF = 0.165 // half a default tyre's width: the distance from a course's centre to its face

// Buried tyres do not need the hero tread resolution — the blanket hides most of the crown, and only the
// bottom course and the top sidewall are ever seen. This is the wheel's single LOD knob.
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

/** Place a part at `radius`, height `y` and `azimuth` around +Y, keeping it radial. */
function atAzimuth(
  geometry: BufferGeometry, radius: number, y: number, azimuthDeg: number,
): BufferGeometry {
  geometry.translate(radius, y, 0)
  geometry.rotateY(-MathUtils.degToRad(azimuthDeg)) // rotation about +Y preserves the height
  return geometry
}

export function createModel(options: F1TyreStackOptions = {}): F1TyreStackInstance {
  const config: F1TyreStackConfig = {
    count: Math.max(1, Math.round(options.count ?? defaults.count)),
    compound: options.compound ?? defaults.compound,
    coverColor: options.coverColor ?? defaults.coverColor,
    accentColor: options.accentColor ?? defaults.accentColor,
  }

  // Materials the model creates itself go in the bag. Materials handed in through `options` belong to the
  // caller, never enter the bag, and are never disposed here (rule 16).
  const bag = new ResourceBag()
  const materialSlots: Record<Slot, Material> = {
    // Warmer blankets are dark quilted fabric — a light value here reads as smooth moulded plastic.
    blanket: options.materials?.blanket ??
      bag.mat(new MeshStandardMaterial({ color: shade(TOKEN.GRAPHITE_800, -0.35), roughness: 0.95, metalness: 0.0 })),
    strap: options.materials?.strap ??
      bag.mat(new MeshStandardMaterial({ color: shade(TOKEN.GRAPHITE_800, -0.1), roughness: 0.8, metalness: 0.1 })),
    cable: options.materials?.cable ??
      bag.mat(new MeshStandardMaterial({ color: shade(TOKEN.INK_950, 0.05), roughness: 0.9, metalness: 0.0 })),
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
  const tyreCover = bag.mat(new MeshStandardMaterial({ color: config.coverColor, roughness: 0.4, metalness: 0.2 }))
  const tyreAccent = bag.mat(new MeshStandardMaterial({ color: config.accentColor, roughness: 0.5, metalness: 0.1 }))

  let wheels: F1WheelAssemblyInstance[] = []
  const generated: BufferGeometry[] = []
  const meshesBySlot: Record<Slot, Mesh[]> = { blanket: [], strap: [], cable: [] }

  const releaseGenerated = (): void => {
    for (const wheel of wheels) wheel.dispose()
    wheels = []
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
    for (let i = 0; i < count; i++) {
      const wheel = createWheel({
        compound,
        treadSegments: STACK_TREAD_SEGMENTS,
        materials: { cover: tyreCover, accent: tyreAccent },
      })
      wheel.root.rotation.x = Math.PI / 2 // axle Z -> vertical, so the tyre lies flat
      wheel.root.position.y = R + i * TH
      tyresGroup.add(wheel.root)
      wheels.push(wheel)
    }

    // The blanket covers every course except the bottom one, so the tyres it wraps still read as tyres.
    // The wrap starts at the seam above the exposed bottom tyre and ends past the top tyre's outer face,
    // so each scallop spans exactly one course. Forgetting the tyre's half-width here is what made the
    // blanket cover two courses instead of three and threw the bulges out of register with the tyres.
    const covered = count - 1
    if (covered < 1) return
    const yBase = R + TH * 0.5
    const yTop = R + (count - 1) * TH + TYRE_HALF + 0.02
    const height = yTop - yBase

    // --- Blanket: a scalloped revolve that bulges over each course and pinches at the seams -----------
    // The waist is cinched below the tyre's own radius at each strap, so the straps visibly carry load
    // rather than hovering as hoops over a straight-sided drum.
    const rPinch = R + 0.008
    const rBulge = R + 0.055
    const hem = 0.008
    const profile: Array<readonly [number, number]> = []

    // Bottom hem: a rolled fold that hangs past the seam and flares outward, so the blanket visibly
    // drapes over the exposed tyre's shoulder instead of being sliced off flat against it.
    profile.push([rPinch - 0.020, yBase + 0.06])
    profile.push([rPinch - 0.018, yBase - 0.004])
    for (let i = 0; i <= 4; i++) {
      const a = Math.PI + (Math.PI / 2) * (i / 4)
      profile.push([rPinch + 0.004 + Math.cos(a) * hem * 2, yBase - 0.014 + Math.sin(a) * hem * 2])
    }

    // One scallop per covered course: pinch at the seam, bulge across the tyre's own crown. Each course is
    // broken by quilt seams — a shallow stitched channel every few samples. Without them a swept blanket
    // reads as smooth moulded plastic, because a bulging revolve has no surface break-up of its own.
    const quiltDepth = 0.005
    const quiltWall = 0.004
    for (let c = 0; c < covered; c++) {
      const y0 = yBase + (height * c) / covered
      const y1 = yBase + (height * (c + 1)) / covered
      const samples = 12
      /** A raised cosine: pinched at both seams, fullest across the middle of the course. */
      const skin = (t: number): number => rPinch + (rBulge - rPinch) * Math.sin(Math.PI * t) ** 1.4
      for (let s = 0; s <= samples; s++) {
        const t = s / samples
        const y = y0 + (y1 - y0) * t
        // Quilt seams at thirds of the course, away from the pinched ends where they would not read.
        if (s > 0 && s < samples && s % 3 === 0) {
          profile.push([skin(t), y - quiltWall])
          profile.push([skin(t) - quiltDepth, y - quiltWall * 0.4])
          profile.push([skin(t) - quiltDepth, y + quiltWall * 0.4])
          profile.push([skin(t), y + quiltWall])
        } else {
          profile.push([skin(t), y])
        }
      }
    }

    // Top hem: a rolled fold that turns inward over the top tyre's shoulder. Ending in a bare rim leaves
    // the sleeve's interior wall on show and the whole prop reads as an open bucket.
    for (let i = 0; i <= 4; i++) {
      const a = (Math.PI / 2) * (i / 4)
      profile.push([rPinch - 0.004 + Math.cos(a) * hem * 2, yTop - hem * 2 + Math.sin(a) * hem * 2])
    }
    profile.push([R * 0.86, yTop + 0.004])
    profile.push([R * 0.72, yTop - 0.010])
    profile.push([R * 0.70, yTop - 0.030])

    // Crease the sleeve so the quilt seams stay crisp; a lathe smooths normals along the whole profile
    // and would otherwise round every stitched channel into a soft dent.
    const blanketParts: BufferGeometry[] = [creased(wobble(latheY(profile, 48), 0.014), 35)]

    // Vertical overlap flap where the wrap closes, plus a shorter secondary flap that only spans the top
    // two courses — deliberately not mirrored, so the wrap never reads as a machined cylinder (rule 3).
    // After atAzimuth the flap's local X is radial and its local Z is tangential, so it has to be authored
    // thin-and-wide (10 mm proud, 55 mm across) to lie down on the wrap instead of standing off it as a fin.
    blanketParts.push(atAzimuth(
      bevelBox(0.024, height * 0.96, 0.060, 0.004),
      rBulge - 0.004, yBase + height / 2, 0,
    ))
    blanketParts.push(atAzimuth(
      bevelBox(0.008, height * 0.45, 0.040, 0.003),
      rBulge - 0.002, yTop - height * 0.25, 140,
    ))
    emit('blanket', mergeParts(blanketParts, 'blanket'), blanketGroup, 'sleeve')

    // --- Straps: a band at each course seam, each with one buckle at an unequal azimuth --------------
    const strapParts: BufferGeometry[] = []
    const buckleAt = [25, 155, 290]
    for (let c = 1; c < covered; c++) {
      const y = yBase + (height * c) / covered
      // Cinched over the bulge, not sunk in the valley: a strap tucked below the widest point is hidden
      // by the course above it and reads as a painted ring rather than a band round the outside.
      // Flat webbing sitting in the cinched waist, standing ~0.016 m proud of the fabric it compresses.
      strapParts.push(latheY([
        [rPinch - 0.004, y - 0.030], [rPinch + 0.016, y - 0.024],
        [rPinch + 0.016, y + 0.024], [rPinch - 0.004, y + 0.030],
        [rPinch - 0.004, y - 0.030],
      ], 40))

      const buckle = bevelBox(0.060, 0.050, 0.022, 0.004)
      buckle.rotateY(Math.PI / 2) // face the buckle outward before the azimuth places it
      strapParts.push(atAzimuth(buckle, rPinch + 0.024, y, buckleAt[(c - 1) % buckleAt.length]!))
    }
    if (strapParts.length > 0) emit('strap', mergeParts(strapParts, 'straps'), blanketGroup, 'straps')

    // --- Cable: routed out of a gland in the blanket, not out of thin air -----------------------------
    const cableParts: BufferGeometry[] = []
    const glandY = yBase + height * 0.86
    const gland = new CylinderGeometry(0.018, 0.018, 0.034, 16)
    gland.rotateZ(Math.PI / 2)
    cableParts.push(atAzimuth(gland, rBulge + 0.006, glandY, 205))

    const glandDir = MathUtils.degToRad(205)
    const gx = Math.cos(glandDir)
    const gz = -Math.sin(glandDir)
    // The run stands clear of the stack rather than hugging it, so the cable never grazes a tyre's
    // shoulder on its way down.
    cableParts.push(taperedTube([
      new Vector3(gx * (rBulge + 0.03), glandY, gz * (rBulge + 0.03)),
      new Vector3(gx * (rBulge + 0.18), glandY - 0.22, gz * (rBulge + 0.18)),
      new Vector3(gx * (rBulge + 0.26), 0.14, gz * (rBulge + 0.28)),
      new Vector3(gx * (rBulge + 0.40), 0.030, gz * (rBulge + 0.36)),
    ], 0.016, 10))

    // Strain-relief boot and a floor plug on the end of the run.
    const plug = bevelBox(0.052, 0.042, 0.030, 0.004)
    plug.translate(gx * (rBulge + 0.42), 0.022, gz * (rBulge + 0.38))
    cableParts.push(plug)

    emit('cable', mergeParts(cableParts, 'cable'), cableGroup, 'cable')
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
      bag.dispose()
      root.removeFromParent()
    },
  }
}

export function createPreview({ aspect }: { aspect: number; time?: number }) {
  return createF1Preview(createModel(), { aspect, target: [0, 0.6, 0], distance: 3.08 })
}
