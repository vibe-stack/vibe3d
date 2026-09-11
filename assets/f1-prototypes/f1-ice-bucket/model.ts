// f1-ice-bucket — podium / parc fermé stainless magnum presentation bucket.
//
// The vessel is authored as three lathes sharing exact boundary points: a polished outer shell, a
// rolled rim bead, and a dark liner that descends the inside wall to a thick inner floor. Splitting
// there is what buys the cavity read — one lathe can only carry one material, and a bucket whose
// inside is the same value as its outside is a cone.
//
// Handles are drop rings on riveted ears, hung on the Z axis and in the plane of the wall so the pair
// stays inside the rim bead's envelope: the kit's 300 mm rim datum is the prop's declared width, and a
// handle is not allowed to redefine it.

import {
  BufferAttribute,
  BufferGeometry,
  Group,
  LatheGeometry,
  Mesh,
  MeshStandardMaterial,
  TorusGeometry,
  Vector2,
  type Material,
} from 'three/webgpu'

import {
  AXIS_Z,
  ICE_BUCKET,
  TOKEN,
  acquireF1Materials,
  bevelBox,
  bolt,
  createF1Preview,
  creased,
  disposeF1Materials,
  mergeParts,
  shade,
  tubeSection,
  wrapStrap,
} from '../f1-kit-core/index.ts'

type Slot = 'bucket' | 'rim' | 'interior' | 'ice' | 'handle'

export interface F1IceBucketConfig {
  height: number
}

export interface F1IceBucketOptions extends Partial<F1IceBucketConfig> {
  materials?: Partial<Record<Slot, Material>>
}

export interface F1IceBucketInstance {
  readonly root: Group
  readonly parts: { bucket: Group; handles: Group; ice: Group }
  readonly materials: Readonly<Record<Slot, Material>>
  getConfig(): Readonly<F1IceBucketConfig>
  configure(patch: Partial<F1IceBucketConfig>): void
  setMaterial(slot: Slot, material: Material): void
  update(deltaSeconds: number): void
  dispose(): void
}

const defaults: F1IceBucketConfig = { height: ICE_BUCKET.height }

type Point = readonly [number, number]

/**
 * What a vertical mirror sees standing in a room: floor bounce low, a dark band where it looks out at
 * nothing, and sky high up. Baked as vertex colour because the capture rig carries no environment map,
 * and without it a stainless lathe renders as one flat sweep — measured at 105-110 sRGB top to bottom
 * before this existed.
 *
 * The dip is broad and soft on purpose. Two iterations were spent proving the opposite: a hard-edged
 * horizon, and then a narrow hard-edged band, both read as a painted stripe rather than a reflection.
 * What sells the surface is several transitions of differing width, which needs the densified profile
 * below to resolve at all.
 */
const STEEL_RAMP: readonly Point[] = [
  [0.45, 0.000],
  [0.65, 0.050],
  [2.60, 0.090],
  [2.00, 0.170],
  [1.15, 0.280],
  [0.60, 0.430],
  [0.55, 0.540],
  [0.95, 0.620],
  [1.75, 0.730],
  [2.40, 0.850],
  [3.30, 0.910],
]

/** A solid of revolution from an explicit `[radius, y]` polyline — re-entrant profiles included. */
function lathe(points: readonly Point[], segments: number): BufferGeometry {
  return new LatheGeometry(points.map(([r, y]) => new Vector2(Math.max(1e-4, r), y)), segments)
}

/**
 * Subdivide a profile so no ring is further than `maxGap` from its neighbour.
 *
 * Baked shading can only resolve what the profile samples. The shell's straight flare needs three rings
 * to describe its shape and twenty to describe its reflection, and the subdivision is linear, so the
 * silhouette this returns is the one that went in.
 */
function densify(points: readonly Point[], maxGap: number): Point[] {
  const out: Point[] = [points[0]!]
  for (let i = 1; i < points.length; i++) {
    const [r0, y0] = points[i - 1]!
    const [r1, y1] = points[i]!
    const steps = Math.max(1, Math.ceil(Math.abs(y1 - y0) / maxGap))
    for (let s = 1; s <= steps; s++) {
      const t = s / steps
      out.push([r0 + (r1 - r0) * t, y0 + (y1 - y0) * t])
    }
  }
  return out
}

/** Linear lookup over a `[value, at]` table. Reads a profile radius or a ramp factor equally well. */
function valueAt(points: readonly Point[], at: number): number {
  for (let i = 1; i < points.length; i++) {
    const [v0, a0] = points[i - 1]!
    const [v1, a1] = points[i]!
    if (at <= a1 && a1 > a0) {
      const t = Math.min(1, Math.max(0, (at - a0) / (a1 - a0)))
      return v0 + (v1 - v0) * t
    }
  }
  return points[points.length - 1]![0]
}

/** Bake the ramp into vertex colour. Must run after creasing, which rewrites the attributes. */
function tintByHeight(geometry: BufferGeometry, height: number): BufferGeometry {
  const position = geometry.getAttribute('position')
  const colors = new Float32Array(position.count * 3)
  for (let i = 0; i < position.count; i++) {
    const f = valueAt(STEEL_RAMP, position.getY(i) / height)
    colors[i * 3] = f
    colors[i * 3 + 1] = f
    colors[i * 3 + 2] = f
  }
  geometry.setAttribute('color', new BufferAttribute(colors, 3))
  return geometry
}

/** Deterministic scatter — a rebuilt bucket must fill with the same ice it had before. */
function rng(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function createModel(options: F1IceBucketOptions = {}): F1IceBucketInstance {
  const config: F1IceBucketConfig = {
    height: Math.max(0.2, options.height ?? defaults.height),
  }
  const bundle = acquireF1Materials()

  // The capture rig is three directional lights and a hemisphere with no environment map, so a metalness
  // near 1 has almost nothing to reflect and renders black, while a near-white albedo at any metalness
  // renders as matte plastic. Stainless only appears here if the shell sits low on the SHELL-200 ramp
  // and lets the baked reflection above do the work.
  const steel = new MeshStandardMaterial({
    name: 'f1-kit / bucket stainless',
    color: shade(TOKEN.SHELL_200, -0.4),
    roughness: 0.18,
    metalness: 0.66,
    vertexColors: true,
  })
  const polished = new MeshStandardMaterial({
    name: 'f1-kit / polished stainless',
    color: shade(TOKEN.SHELL_200, -0.16),
    roughness: 0.13,
    metalness: 0.6,
  })
  const liner = new MeshStandardMaterial({
    name: 'f1-kit / bucket liner',
    color: shade(TOKEN.SLATE_650, -0.5),
    roughness: 0.32,
    metalness: 0.72,
  })
  const ice = new MeshStandardMaterial({
    name: 'f1-kit / bucket ice',
    color: shade(TOKEN.ICE_300, -0.14),
    roughness: 0.07,
    metalness: 0.02,
    emissive: shade(TOKEN.ICE_300, -0.28),
    emissiveIntensity: 0.3,
    flatShading: true,
  })
  const extras: Material[] = [steel, polished, liner, ice]

  const materialSlots: Record<Slot, Material> = {
    bucket: options.materials?.bucket ?? steel,
    rim: options.materials?.rim ?? polished,
    interior: options.materials?.interior ?? liner,
    ice: options.materials?.ice ?? ice,
    handle: options.materials?.handle ?? polished,
  }

  const root = new Group(); root.name = 'f1-ice-bucket'
  const bucket = new Group(); bucket.name = 'bucket'
  const handles = new Group(); handles.name = 'handles'
  const iceGroup = new Group(); iceGroup.name = 'ice'
  root.add(bucket, handles, iceGroup)

  const generated: BufferGeometry[] = []
  const meshesBySlot: Record<Slot, Mesh[]> = {
    bucket: [], rim: [], interior: [], ice: [], handle: [],
  }
  const releaseGenerated = (): void => {
    bucket.clear(); handles.clear(); iceGroup.clear()
    for (const geometry of generated) geometry.dispose()
    generated.length = 0
    for (const slot of Object.keys(meshesBySlot) as Slot[]) meshesBySlot[slot].length = 0
  }
  const emit = (slot: Slot, geometry: BufferGeometry, group: Group, name: string): void => {
    generated.push(geometry)
    const mesh = new Mesh(geometry, materialSlots[slot])
    mesh.name = name
    mesh.userData.topologyRole = name === 'shell' || name === 'liner' ? 'hull' : 'detail'
    mesh.castShadow = true
    mesh.receiveShadow = true
    meshesBySlot[slot].push(mesh)
    group.add(mesh)
  }

  const rebuild = (): void => {
    releaseGenerated()
    const h = config.height
    const k = h / ICE_BUCKET.height
    const rimR = ICE_BUCKET.rimR * k
    const lip = ICE_BUCKET.lip * k

    // Outer shell: a short straight pedestal, then one unbroken flare to the rim datum. The foot's
    // interest is the rolled base bead below, not a wobble in the profile.
    const shell: Point[] = [
      [0.000, 0.000],
      [0.618 * rimR, 0.000],
      [0.660 * rimR, 0.012 * h],
      [0.668 * rimR, 0.044 * h],
      [0.690 * rimR, 0.062 * h],
      [0.705 * rimR, 0.086 * h],
      [0.733 * rimR, 0.112 * h],
      [0.762 * rimR, 0.180 * h],
      [0.812 * rimR, 0.360 * h],
      [0.876 * rimR, 0.600 * h],
      [0.940 * rimR, 0.800 * h],
      [0.980 * rimR, 0.890 * h],
      [1.000 * rimR, 0.925 * h],
    ]
    const shellGeo = creased(lathe(densify(shell, 0.022 * h), 64), 52)
    emit('bucket', tintByHeight(shellGeo, h), bucket, 'shell')

    // Rolled bead: out, over, and tucked back under. The tuck is what catches the key light.
    const bead: Point[] = [
      [1.000 * rimR, 0.925 * h],
      [rimR + 0.72 * lip, 0.950 * h],
      [rimR + 0.95 * lip, 0.972 * h],
      [rimR + 0.55 * lip, 0.992 * h],
      [rimR - 0.30 * lip, 1.000 * h],
      [rimR - 1.00 * lip, 0.988 * h],
      [rimR - 1.25 * lip, 0.972 * h],
    ]
    emit('rim', lathe(bead, 64), bucket, 'rim-bead')

    // Liner: descends from the bead's tuck to a thick inner floor, ~7 mm of wall the whole way.
    const linerProfile: Point[] = [
      [rimR - 1.25 * lip, 0.972 * h],
      [rimR - 1.15 * lip, 0.940 * h],
      [0.892 * rimR, 0.800 * h],
      [0.828 * rimR, 0.600 * h],
      [0.764 * rimR, 0.360 * h],
      [0.714 * rimR, 0.180 * h],
      [0.680 * rimR, 0.124 * h],
      [0.640 * rimR, 0.104 * h],
      [0.560 * rimR, 0.096 * h],
      [0.000, 0.092 * h],
    ]
    emit('interior', creased(lathe(linerProfile, 64), 52), bucket, 'liner')

    // Rolled base bead, in the rim's material and the rim's language: the foot is where the prop meets
    // the podium step, so it gets the second bright horizontal the eye needs to read the flare.
    const footY = 0.052 * h
    const foot = wrapStrap(valueAt(shell, footY), [0, footY, 0], 0.024 * k, 0.0065 * k, 64)
    emit('rim', foot, bucket, 'base-bead')

    // Reeding. A presentation bucket is banded for grip and for rigidity, and three shallow machined
    // rings put real specular breaks across the body's one large empty sweep. The baked ramp above can
    // only ever paint a gradient; a raised ring makes a highlight the light rig can actually move, which
    // is the read the ramp spent three iterations failing to fake. Kept tight and 2.6 mm proud so the
    // group reads as machined reeding rather than as hoops on a barrel.
    const reeds = [0.418, 0.462, 0.506].map((t, i) => {
      const y = t * h
      // Rule 3: the centre reed is the wider one, so the group is not three identical marks.
      return wrapStrap(valueAt(shell, y), [0, y, 0], (i === 1 ? 0.0085 : 0.0062) * k, 0.0026 * k, 64)
    })
    emit('rim', mergeParts(reeds, 'f1-ice-bucket: reeding'), bucket, 'reeding')

    // Drop-ring handles. The pin is radial, so the ring can only swing in the plane of the wall — which
    // is both how a bucket ring actually hangs and what keeps the pair inside the rim bead's envelope.
    const earY = 0.755 * h
    const wallR = valueAt(shell, earY)
    const earFace = wallR + 0.011 * k
    const earD = 0.030 * k
    const pinY = earY - 0.020 * k
    const pinZ = wallR + 0.013 * k
    const ringR = 0.038 * k
    const ringTube = 0.0058 * k
    const pinR = 0.0055 * k
    for (const side of [1, -1] as const) {
      const parts: BufferGeometry[] = []
      const ear = bevelBox(0.040 * k, 0.062 * k, earD, 0.005 * k)
      ear.translate(0, earY, earFace - earD / 2)
      parts.push(ear)
      for (const dy of [0.019, -0.019] as const) {
        parts.push(bolt([0, earY + dy * k, earFace], 0.005 * k, 0.005 * k, AXIS_Z))
      }
      parts.push(tubeSection(pinR, 0.019 * k, [0, pinY, pinZ - 0.0005 * k], AXIS_Z, 12))
      // The ring hangs until the pin meets its inner top; nothing here is centred on the ear.
      const ring = new TorusGeometry(ringR, ringTube, 8, 32)
      ring.translate(0, pinY - (ringR - ringTube - pinR), pinZ)
      parts.push(ring)
      const geometry = mergeParts(parts, 'f1-ice-bucket: handle')
      // Rule 3: the two sides are cast the same and hung by hand, so they do not match exactly.
      geometry.rotateY(side > 0 ? 0.03 : Math.PI - 0.04)
      emit('handle', geometry, handles, `handle-${side > 0 ? 'front' : 'back'}`)
    }

    // Ice: a faceted packed bed domed just under the rim, then loose cubes and smaller shards mounded
    // over it so the fill breaks the silhouette. The bed's edge stops short of the liner, leaving a dark
    // ring of inner wall visible between steel and ice.
    const iceR = 0.855 * rimR
    const iceTop = 0.975 * h
    const iceDrop = 0.15 * h
    const surfaceY = (r: number): number => iceTop - Math.pow(r / iceR, 2) * iceDrop
    const bedPoints: Point[] = [
      [0.000, 0.140 * h],
      [0.620 * rimR, 0.170 * h],
      [0.720 * rimR, 0.340 * h],
      [0.800 * rimR, 0.620 * h],
      [iceR, surfaceY(iceR)],
    ]
    for (let i = 1; i <= 8; i++) {
      const r = iceR * (1 - i / 8)
      bedPoints.push([r, surfaceY(r)])
    }
    const iceParts: BufferGeometry[] = [lathe(bedPoints, 26)]
    const iceRandom = rng(0x0cebe5)
    const chunk = (small: boolean): void => {
      const a = iceRandom() * Math.PI * 2
      const r = Math.sqrt(iceRandom()) * iceR * 0.99
      const s = small ? (0.008 + iceRandom() * 0.008) * k : (0.017 + iceRandom() * 0.015) * k
      const piece = bevelBox(s, s * (small ? 0.6 : 0.82), s * 0.92, s * 0.14)
      piece.rotateX((iceRandom() - 0.5) * 1.5)
      piece.rotateY(iceRandom() * Math.PI * 2)
      piece.rotateZ((iceRandom() - 0.5) * 1.5)
      piece.translate(
        Math.cos(a) * r,
        surfaceY(r) + s * (0.1 + iceRandom() * 0.45),
        Math.sin(a) * r,
      )
      iceParts.push(piece)
    }
    for (let i = 0; i < 44; i++) chunk(false)
    for (let i = 0; i < 38; i++) chunk(true)
    emit('ice', mergeParts(iceParts, 'f1-ice-bucket: ice'), iceGroup, 'ice-fill')
  }

  rebuild()
  return {
    root,
    parts: { bucket, handles, ice: iceGroup },
    materials: materialSlots,
    getConfig: () => ({ ...config }),
    configure(patch) {
      if (patch.height !== undefined) config.height = Math.max(0.2, patch.height)
      rebuild()
    },
    setMaterial(slot, material) {
      materialSlots[slot] = material
      for (const mesh of meshesBySlot[slot]) mesh.material = material
    },
    update: () => {},
    dispose() {
      releaseGenerated()
      for (const material of extras) material.dispose()
      extras.length = 0
      disposeF1Materials(bundle)
      root.removeFromParent()
    },
  }
}

export function createPreview({ aspect }: { aspect: number; time?: number }) {
  return createF1Preview(createModel(), {
    aspect, target: [0, 0.19, 0], distance: 1.18, fov: 28, yaw: -1.0, pitch: 0.36,
  })
}
