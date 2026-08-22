// f1-tyre — a loose F1 tyre: an 18-inch rim barrel inside a lathe-revolved carcass whose
// crown carries four continuous circumferential grooves and a directional V pattern of bevelled tread
// blocks, ten ordered forged spokes over a visible brake assembly, a slim hub and clean centre lock,
// plus procedural PIRELLI / P ZERO sidewall type. Dressed on BOTH faces (axle along local Z) —
// a carried tyre is seen from both sides, unlike a fitted car tyre.
//
// Proportions are measured off a face-on reference of a current-spec 18" tyre: the rim seat sits at 0.635
// of the tyre's outer radius (a 457 mm rim inside a 720 mm tyre), the spokes span 0.158..0.586 of it,
// the hub socket 0..0.159, and the sidewall wordmarks sit at 0.805.
//
// Every applied feature occupies its own radial band with a real world-unit axial step to its neighbour, or
// interpenetrates its host outright — never a coplanar decal floating a fraction of a millimetre off the
// surface. All marks are geometry: there is no canvas texture here, because the headless preview runner has
// no `document` and would silently render the fallback material instead.

import {
  BoxGeometry,
  BufferGeometry,
  CylinderGeometry,
  Float32BufferAttribute,
  Group,
  LatheGeometry,
  MathUtils,
  Mesh,
  MeshStandardMaterial,
  Vector2,
  type Material,
} from 'three/webgpu'

import {
  COMPOUND_TOKEN,
  acquireF1Materials,
  arcBand,
  bevelBlade,
  createCompoundMaterial,
  createF1Preview,
  creased,
  disposeF1Materials,
  mergeParts,
  type Compound,
} from '../f1-kit-core/index.ts'

type Slot = 'rubber' | 'tread' | 'rim' | 'metal' | 'cover' | 'accent' | 'band'

/**
 * The sidewall grading key, in canonical colour tokens.
 *
 * The sport's key is a colour *ordering* — shell, caution, critical across the slicks, then field and
 * navigation for the wets — and the kit's palette already carries every one of those roles. So this is a
 * mapping onto `COMPOUND_TOKEN` rather than five hand-picked hexes: the key stays readable and the kit
 * stays inside the palette. See `f1-kit-core/palette.ts`.
 */
export const F1_COMPOUND_COLORS = COMPOUND_TOKEN

export type F1Compound = Compound

export interface F1TyreConfig {
  /** Overall tyre radius, metres. Real F1 tyres run ~0.33 m. */
  radius: number
  /** Tyre width, metres. Real F1 fronts run ~0.30 m, rears ~0.40 m. */
  width: number
  /**
   * Which compound the sidewall grading marks. Drives `band` unless `band` is set explicitly. Defaults to
   * `intermediate`, because this tyre is moulded with a grooved/blocked tread rather than a dry slick.
   */
  compound: F1Compound
  /** Sidewall grading colour. Set from `compound`; override only for a non-standard tyre. */
  band: number
  /** Tread blocks around the crown. Doubles as the LOD knob — the tread is most of the triangle budget. */
  treadSegments: number
  /** Dry compounds are slicks; intermediates/wets stay grooved unless this is set. */
  tread: 'slick' | 'grooved'
}

export interface F1TyreOptions extends Partial<F1TyreConfig> {
  materials?: Partial<Record<Slot, Material>>
}

export interface F1TyreInstance {
  readonly root: Group
  readonly parts: { tire: Group; rim: Group; trim: Group }
  readonly materials: Readonly<Record<Slot, Material>>
  getConfig(): Readonly<F1TyreConfig>
  configure(patch: Partial<F1TyreConfig>): void
  setMaterial(slot: Slot, material: Material): void
  update(deltaSeconds: number): void
  dispose(): void
}

const defaults: F1TyreConfig = {
  // 0.36 m radius = the real 720 mm outer diameter of a current front. The original default of 0.33 m
  // was quoting the diameter figure as a radius and shipped the prop 9% undersized.
  radius: 0.36,
  width: 0.33,
  compound: 'intermediate',
  band: F1_COMPOUND_COLORS.intermediate,
  // Few, large blocks. A dense ring of small nubs reads as a fuzzy stipple at 1-3 m and drowns out the
  // circumferential grooves, which are what actually say "wet tyre".
  treadSegments: 18,
  tread: 'grooved',
}

// ---------------------------------------------------------------------------------------------------
// Local geometry helpers. Deliberately private to this file rather than shared through f1-kit-core:
// every `.ts` under f1-kit-core ships to kit consumers as permanent public surface.
// ---------------------------------------------------------------------------------------------------

/**
 * Merge `count` copies of a part into a ring about +Z — the generalisation of the old private `spokeFan`.
 * `make` returns the part authored at the origin, oriented for angle 0 (radial along +X). Returning null
 * skips that slot, so a ring can carry a deliberate gap.
 */
function ringOfMerged(
  count: number,
  radius: number,
  label: string,
  make: (index: number, angle: number) => BufferGeometry | null,
  phase = 0,
): BufferGeometry {
  const parts: BufferGeometry[] = []
  for (let i = 0; i < count; i++) {
    const angle = ((i + phase) / count) * Math.PI * 2
    const part = make(i, angle)
    if (!part) continue
    part.rotateZ(angle)
    part.translate(Math.cos(angle) * radius, Math.sin(angle) * radius, 0)
    parts.push(part)
  }
  return mergeParts(parts, label)
}

/** A solid of revolution about +Z (the axle) from an absolute `[radius, z]` profile. */
function latheZ(profile: ReadonlyArray<readonly [number, number]>, segments: number): BufferGeometry {
  const points = profile.map(([r, z]) => new Vector2(Math.max(1e-4, r), z))
  const geo = new LatheGeometry(points, segments)
  geo.rotateX(Math.PI / 2) // lathe axis Y -> Z, so the tyre rolls about local Z
  return geo
}

type GlyphStroke = readonly [number, number, number, number]

const SIDEWALL_GLYPHS: Readonly<Record<string, readonly GlyphStroke[]>> = {
  ' ': [],
  E: [[0, 1, 0, 0], [0, 1, 0.68, 1], [0, 0.5, 0.56, 0.5], [0, 0, 0.68, 0]],
  I: [[0.34, 1, 0.34, 0], [0.04, 1, 0.64, 1], [0.04, 0, 0.64, 0]],
  L: [[0, 1, 0, 0], [0, 0, 0.68, 0]],
  O: [[0, 0.12, 0, 0.88], [0.68, 0.12, 0.68, 0.88], [0.1, 1, 0.58, 1], [0.1, 0, 0.58, 0]],
  P: [[0, 0, 0, 1], [0, 1, 0.53, 1], [0.6, 0.92, 0.6, 0.58], [0.53, 0.5, 0, 0.5]],
  R: [[0, 0, 0, 1], [0, 1, 0.53, 1], [0.6, 0.92, 0.6, 0.58], [0.53, 0.5, 0, 0.5], [0.31, 0.5, 0.68, 0]],
  Z: [[0, 1, 0.68, 1], [0.68, 1, 0, 0], [0, 0, 0.68, 0]],
}

/** Raised procedural lettering: deterministic, exportable, and independent of fonts or textures. */
function sidewallWord(
  text: string,
  radius: number,
  z: number,
  centreAngle: number,
  height: number,
  face: 1 | -1,
): BufferGeometry {
  const cell = height * 0.82
  const advance = cell * 1.16
  const total = advance * (text.length - 1)
  const strokeWidth = height * 0.13
  const depth = 0.003
  const parts: BufferGeometry[] = []

  const orientation = Math.sin(centreAngle) >= 0 ? -1 : 1
  for (let letterIndex = 0; letterIndex < text.length; letterIndex++) {
    const glyph = SIDEWALL_GLYPHS[text[letterIndex]] ?? []
    const offset = letterIndex * advance - total / 2
    const angle = centreAngle + orientation * offset / radius
    for (const [x0, y0, x1, y1] of glyph) {
      const ax = (x0 - 0.34) * cell
      const ay = (y0 - 0.5) * height
      const bx = (x1 - 0.34) * cell
      const by = (y1 - 0.5) * height
      const dx = bx - ax
      const dy = by - ay
      const stroke = new BoxGeometry(Math.hypot(dx, dy) + strokeWidth * 0.35, strokeWidth, depth)
      stroke.rotateZ(Math.atan2(dy, dx))
      stroke.translate((ax + bx) / 2, (ay + by) / 2, z)
      stroke.rotateZ(angle + orientation * Math.PI / 2)
      stroke.translate(Math.cos(angle) * radius, Math.sin(angle) * radius, 0)
      if (face < 0) stroke.rotateY(Math.PI)
      parts.push(stroke)
    }
  }

  return mergeParts(parts, `sidewall-${text.toLowerCase().replace(' ', '-')}-${face}`)
}

/**
 * The tread band, built as a swept surface whose radius is a function of angle and axial position.
 *
 * Raised tread blocks sitting on top of the carcass scallop the outer silhouette and read as a paddle
 * or agricultural tyre. A real tyre's outer diameter is an unbroken land surface with the pattern cut
 * *into* it, and that cannot be done with primitives and no CSG — so the band is swept directly, and the
 * grooves are simply where the swept radius dips below the land.
 *
 * `land(t)` is the crowned outer surface; the returned surface never exceeds it. Axial fraction `t` runs
 * -1..1 across the crown, then rolls over a shoulder arc at each end to meet the carcass beneath.
 */
function sweptTread(options: {
  land: (t: number) => number
  zCrown: number
  shoulder: number
  segments: number
  grooveAt: readonly number[]
  grooveHalf: number
  grooveDepth: number
  channels: number
  channelDepth: number
  channelSlant: number
}): BufferGeometry {
  const {
    land, zCrown, shoulder, segments, grooveAt, grooveHalf, grooveDepth,
    channels, channelDepth, channelSlant,
  } = options

  // Axial samples. Each groove gets an explicit pair of rows at its rim (uncut) and immediately inside it
  // (full depth), so the wall between them is near-vertical. Sampling only the rib surface and letting the
  // groove interpolate between rib edges turns every channel into a soft V-notch instead of a cut.
  const rows: Array<{ t: number; z: number; drop: number; grooveCut: number; crown: boolean }> = []
  const wall = 0.004 / zCrown // groove wall run, expressed as an axial fraction
  const push = (t: number, grooveCut: number): void => {
    rows.push({ t, z: t * zCrown, drop: 0, grooveCut, crown: true })
  }

  const skirt = (sign: number, reverse: boolean): void => {
    const steps = 5
    for (let i = 0; i <= steps; i++) {
      // A full quarter turn, so the tread stops at a defined corner and the sidewall starts. Stopping
      // the skirt short blends crown into sidewall as one continuous arc, which reads as a ball.
      const a = (Math.PI / 2) * ((reverse ? steps - i : i) / steps)
      rows.push({
        t: sign,
        z: sign * (zCrown + Math.sin(a) * shoulder),
        drop: shoulder - Math.cos(a) * shoulder,
        grooveCut: 0,
        crown: false,
      })
    }
  }

  skirt(-1, true)
  let cursor = -1
  for (const centre of grooveAt) {
    const gStart = centre - grooveHalf
    const gEnd = centre + grooveHalf
    for (let i = 0; i <= 3; i++) push(cursor + (gStart - cursor) * (i / 3), 0)
    push(gStart + wall, grooveDepth) // down the near wall
    push(centre, grooveDepth)        // across the floor
    push(gEnd - wall, grooveDepth)   // up the far wall
    push(gEnd, 0)
    cursor = gEnd
  }
  for (let i = 0; i <= 3; i++) push(cursor + (1 - cursor) * (i / 3), 0)
  skirt(1, false)

  /** How deep the pattern cuts below the land at this angle and axial fraction. */
  const cut = (u: number, row: (typeof rows)[number]): number => {
    if (!row.crown) return 0
    // Lateral channels sweep off the axial direction and mirror across the centreline, giving the V.
    // The centre rib is left continuous, as a real wet tyre's is.
    let lateral = 0
    if (Math.abs(row.t) > 0.28) {
      const phase = (u / segments) * channels + channelSlant * row.t
      if (phase - Math.floor(phase) < 0.34) lateral = channelDepth
    }
    return Math.max(row.grooveCut, lateral)
  }

  const position: number[] = []
  const index: number[] = []
  for (let u = 0; u <= segments; u++) {
    const a = (u / segments) * Math.PI * 2
    const ca = Math.cos(a)
    const sa = Math.sin(a)
    for (const row of rows) {
      const r = land(row.t) - row.drop - cut(u % segments, row)
      position.push(ca * r, sa * r, row.z)
    }
  }
  const stride = rows.length
  for (let u = 0; u < segments; u++) {
    for (let v = 0; v < stride - 1; v++) {
      const a0 = u * stride + v
      const b0 = (u + 1) * stride + v
      index.push(a0, b0, a0 + 1, a0 + 1, b0, b0 + 1)
    }
  }

  const geo = new BufferGeometry()
  geo.setAttribute('position', new Float32BufferAttribute(position, 3))
  geo.setIndex(index)
  geo.computeVertexNormals()
  return geo
}

export function createModel(options: F1TyreOptions = {}): F1TyreInstance {
  const compound = options.compound ?? defaults.compound
  const groovedByDefault = compound === 'intermediate' || compound === 'wet'
  const config: F1TyreConfig = {
    radius: Math.max(0.1, options.radius ?? defaults.radius),
    width: Math.max(0.05, options.width ?? defaults.width),
    compound,
    // An explicit `band` wins; otherwise the grading colour comes from the compound.
    band: options.band ?? F1_COMPOUND_COLORS[compound],
    treadSegments: Math.max(8, Math.round(options.treadSegments ?? defaults.treadSegments)),
    tread: options.tread ?? (options.compound && !groovedByDefault ? 'slick' : defaults.tread),
  }

  const bundle = acquireF1Materials()
  const kit = bundle.materials
  const ownsBand = options.materials?.band === undefined
  const extras: Material[] = []
  const own = (material: Material): Material => {
    extras.push(material)
    return material
  }

  const materialSlots: Record<Slot, Material> = {
    rubber: options.materials?.rubber ?? own(Object.assign(kit.ink.clone(), { roughness: 0.88 })),
    tread: options.materials?.tread ?? own(Object.assign(kit.tread.clone(), { roughness: 0.94 })),
    // Forged F1 rims are anodised satin black, not chrome — the bright metal on the rim is confined
    // to the machined centre nut, which is what gives the hub its single hard highlight.
    rim: options.materials?.rim ?? kit.graphite,
    metal: options.materials?.metal ?? kit.steel,
    // Cover is a darker machined dish than the rim barrel; clone so setMaterial('cover') cannot retarget rim.
    cover: options.materials?.cover ?? own(kit.graphite.clone()),
    accent: options.materials?.accent ?? kit.slate,
    band: options.materials?.band ?? own(createCompoundMaterial(config.compound)),
  }

  // Runtime anchors: created once, never replaced, so consumer attachments survive a rebuild (rules 10, 14).
  const root = new Group()
  root.name = 'f1-tyre'
  const tire = new Group(); tire.name = 'tire'
  const rim = new Group(); rim.name = 'rim'
  const trim = new Group(); trim.name = 'trim'
  root.add(tire, rim, trim)

  // Per-rebuild geometry ownership. Materials live for the model's whole lifetime in `bag`; geometry is
  // regenerated by configure() and so is tracked separately and released at the top of every rebuild.
  const generated: BufferGeometry[] = []
  const meshesBySlot: Record<Slot, Mesh[]> = {
    rubber: [], tread: [], rim: [], metal: [], cover: [], accent: [], band: [],
  }

  const releaseGenerated = (): void => {
    for (const group of [tire, rim, trim]) group.clear()
    for (const geometry of generated) geometry.dispose()
    generated.length = 0
    for (const slot of Object.keys(meshesBySlot) as Slot[]) meshesBySlot[slot].length = 0
  }

  /** One merged geometry per material slot, so there is exactly one mesh per slot and one draw call. */
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
    const { radius: R, width: W, treadSegments } = config
    const hw = W / 2
    // `treadSegments` is the single LOD knob: every revolve on the tyre follows it, so a consumer that
    // buries this tyre in a stack pays a fraction of the hero cost from one option.
    const seg = Math.max(64, treadSegments * 3)

    // --- Radial bands, world units at the default 0.33 m radius --------------------------------------
    const rBead = R * 0.635         // 0.2096 — rim seat, 18-inch rim in a 720 mm tyre
    const shoulder = 0.041          // current tyres have a compact but visibly round shoulder
    const zCrown = hw - shoulder    // 0.124  — half-width of the crowned tread band
    const zBead = hw * 0.727        // 0.120  — the tyre necks in axially at the bead
    // Crown sagitta over the whole band. Nearly flat: the shoulder radius does most of the turning.
    const crownDrop = 0.006
    const grooveDepth = 0.011       // circumferential groove depth, cut into the land
    const channelDepth = 0.007      // lateral V-channel depth, cut into the land

    /** The tyre's unbroken outer land surface at axial fraction t. The pattern is cut down from this. */
    const ribTop = (t: number): number => R - crownDrop * t * t

    // Four continuous circumferential grooves, the dominant wet-tyre read: two either side of a solid
    // centre rib, two far enough out that the shoulder ribs they leave behind scallop the silhouette
    // rather than dying into a smooth ring. Cut into the revolve itself so they are exact and continuous.
    const grooveAt = [-0.78, -0.28, 0.28, 0.78]
    const grooveHalf = 0.019 / 2 / zCrown // a 0.019 m groove expressed in axial fraction

    // --- Carcass: one revolve covering the crown, both shoulders and both sidewalls ------------------
    // A low-profile section, not a torus: the sidewall runs near-straight radially inboard at close to
    // full width, so a flat sidewall annulus is exposed and the shoulder stays a distinct corner.
    const carcass: Array<readonly [number, number]> = [[rBead, -zBead], [rBead + 0.012, -hw * 0.879]]
    carcass.push([R * 0.697, -hw * 0.958], [R * 0.758, -hw * 0.982], [R * 0.858, -hw])
    carcass.push([ribTop(-1) - shoulder, -hw * 0.988])
    for (let i = 0; i <= 8; i++) {                                        // lower shoulder fillet
      const a = -Math.PI / 2 + (Math.PI / 2) * (i / 8)
      carcass.push([ribTop(-1) - shoulder + Math.cos(a) * shoulder, -zCrown + Math.sin(a) * shoulder])
    }
    // Under the crown the carcass runs as a plain core, set below the deepest groove so the swept tread
    // band that covers it is never pierced. The band, not the lathe, carries the pattern.
    const core = R - crownDrop - grooveDepth - 0.004
    if (config.tread === 'slick') {
      carcass.push([ribTop(-1), -zCrown], [ribTop(0), 0], [ribTop(1), zCrown])
    } else {
      carcass.push([core, -zCrown], [core, zCrown])
    }
    for (let i = 0; i <= 8; i++) {                                        // upper shoulder fillet
      const a = (Math.PI / 2) * (i / 8)
      carcass.push([ribTop(1) - shoulder + Math.cos(a) * shoulder, zCrown + Math.sin(a) * shoulder])
    }
    carcass.push([ribTop(1) - shoulder, hw * 0.988])
    carcass.push([R * 0.858, hw], [R * 0.758, hw * 0.982], [R * 0.697, hw * 0.958])
    carcass.push([rBead + 0.012, hw * 0.879], [rBead, zBead], [rBead, -zBead])
    emit('rubber', creased(latheZ(carcass, seg)), tire, 'carcass')

    // Fine mould witness rings and index-cycled scrub traces interrupt the otherwise perfect sidewall.
    const mouldParts: BufferGeometry[] = []
    for (const face of [1, -1] as const) {
      for (const [ringRadius, lift] of [[0.731, 0.0010], [0.913, 0.0007]] as const) {
        const seam = arcBand(R * (ringRadius - 0.003), R * (ringRadius + 0.003), 0, Math.PI * 2, 0.006, lift)
        seam.translate(0, 0, 0.500 * W)
        if (face < 0) seam.rotateY(Math.PI)
        mouldParts.push(seam)
      }
      for (let i = 0; i < 5; i++) {
        const angle = 0.37 + i * 1.19
        const traceRadius = 0.835 + (i % 2) * 0.012
        const trace = arcBand(R * traceRadius, R * (traceRadius + 0.004), angle, angle + 0.16 + i * 0.012, 0.005, 0.0005)
        trace.translate(0, 0, 0.501 * W)
        if (face < 0) trace.rotateY(Math.PI)
        mouldParts.push(trace)
      }
    }
    emit('rubber', mergeParts(mouldParts, 'mould-seams'), trim, 'mould-seams')

    // --- Tread: the pattern swept as grooves cut into an unbroken land surface -----------------------
    // Four continuous circumferential grooves divide the band into five ribs; the four flanking ribs are
    // broken by lateral channels swept off the axial direction and mirrored across the centreline, so
    // the pattern reads as a directional V. The centre rib stays continuous, as a real wet tyre's does.
    if (config.tread !== 'slick') {
      emit('tread', creased(sweptTread({
        land: ribTop,
        zCrown,
        shoulder,
        segments: treadSegments * 6, // six samples per lateral channel keeps the channel walls crisp
        grooveAt,
        grooveHalf,
        grooveDepth,
        channels: treadSegments,
        channelDepth,
        channelSlant: 0.62, // ~35 degrees off axial across a half-width of crown
      }), 30), tire, 'tread')
    }

    // --- Rim barrel: one closed shell, both flanges included, hollow between the two spoke planes ----
    // The spoke plane sits 0.050 m inboard of the flange face, so rim lip and spoke plane read as two
    // separate steps in silhouette rather than one domed dish.
    const zFlange = 0.424 * W  // 0.140 — outboard face of the rim flange
    const zSpoke = 0.273 * W   // 0.090 — the plane the spokes are rooted in
    const rFlange = 0.673 * R  // 0.222 — stands 0.012 proud of the bead, a hard lip that catches light
    const rBarrel = 0.606 * R  // 0.200 — where the spokes meet the barrel wall
    const barrel: Array<readonly [number, number]> = [
      [rBarrel, -zSpoke], [0.642 * R, -0.291 * W], [0.667 * R, -0.339 * W],
      [rFlange, -0.388 * W], [rFlange, -zFlange], [0.645 * R, -zFlange], [rBead, -0.400 * W],
      [rBead, 0.400 * W], [0.645 * R, zFlange], [rFlange, zFlange],
      [rFlange, 0.388 * W], [0.667 * R, 0.339 * W], [0.642 * R, 0.291 * W], [rBarrel, zSpoke],
      [0.594 * R, 0.261 * W], [0.594 * R, -0.261 * W], [rBarrel, -zSpoke],
    ]
    const rimParts: BufferGeometry[] = [latheZ(barrel, seg)]

    // --- Per-face dressing: spoke blades, hub and the centre lock nut --------------------------------
    const metalParts: BufferGeometry[] = []
    const coverParts: BufferGeometry[] = []
    const accentParts: BufferGeometry[] = []
    const bandParts: BufferGeometry[] = []

    for (const face of [1, -1] as const) {
      const mirror = (g: BufferGeometry): BufferGeometry => {
        if (face < 0) g.rotateY(Math.PI)
        return g
      }

      // Ten evenly indexed forged spokes leave orderly negative space and carry a slight directional rake.
      const web = 0.016
      rimParts.push(mirror(ringOfMerged(
        10,
        0,
        `spokes-${face}`,
        () => {
          const spoke = bevelBlade(0.158 * R, 0.586 * R, 0.020, 0.012, web, 0.003)
          spoke.rotateZ(MathUtils.degToRad(5.5))
          spoke.translate(0, 0, zSpoke - web / 2)
          return spoke
        },
        face > 0 ? 0 : 0.25,
      )))

      // Carbon brake rotor and caliper sit behind the spokes and remain visible through their windows.
      coverParts.push(mirror(latheZ([
        [0.232 * R, 0.182 * W], [0.500 * R, 0.182 * W], [0.520 * R, 0.194 * W],
        [0.520 * R, 0.214 * W], [0.232 * R, 0.214 * W], [0.232 * R, 0.182 * W],
      ], seg)))
      const caliper = bevelBlade(0.255 * R, 0.475 * R, 0.054, 0.045, 0.026, 0.006)
      caliper.rotateZ(Math.PI)
      caliper.translate(0, 0, 0.222 * W)
      accentParts.push(mirror(caliper))

      const boltRing = ringOfMerged(10, 0.276 * R, `rotor-bolts-${face}`, () => {
        const bolt = new CylinderGeometry(0.008 * R, 0.008 * R, 0.006, 8)
        bolt.rotateX(Math.PI / 2)
        bolt.translate(0, 0, 0.225 * W)
        return bolt
      }, face > 0 ? 0 : 0.5)
      metalParts.push(mirror(boltRing))

      // Slim recessed hub lets the spokes terminate cleanly around a compact machined drive bowl.
      coverParts.push(mirror(latheZ([
        [0.000, 0.180 * W], [0.112 * R, 0.180 * W], [0.141 * R, 0.205 * W],
        [0.159 * R, zSpoke], [0.159 * R, 0.248 * W], [0.139 * R, 0.218 * W],
        [0.106 * R, 0.166 * W], [0.000, 0.166 * W],
      ], Math.max(20, seg / 2))))

      // Stepped drive ring inside the bowl.
      coverParts.push(mirror(latheZ([
        [0.073 * R, 0.158 * W], [0.073 * R, 0.190 * W], [0.091 * R, 0.202 * W],
        [0.112 * R, 0.202 * W], [0.126 * R, 0.188 * W], [0.126 * R, 0.158 * W],
        [0.073 * R, 0.158 * W],
      ], Math.max(20, seg / 2))))

      // The livery accent instead lives where a real team stripe does: a pinstripe edging the rim lip.
      // Kept deliberately thin — the tyre already carries one saturated colour in the compound grading,
      // and a second broad band of it turns the prop into a toy.
      accentParts.push(mirror(latheZ([
        [0.598 * R, 0.318 * W], [0.607 * R, 0.330 * W], [0.607 * R, 0.348 * W],
        [0.598 * R, 0.352 * W], [0.598 * R, 0.318 * W],
      ], seg)))

      // Compact ten-sided centre lock supplies one clean machined highlight inside the dark drive bowl.
      const nut = new CylinderGeometry(0.073 * R, 0.073 * R, 0.022, 10)
      nut.rotateX(Math.PI / 2)
      nut.translate(0, 0, 0.204 * W * face)
      metalParts.push(nut)

      // Current tyre hierarchy: PIRELLI above the hub and P ZERO below, in the compound colour.
      const zSkin = 0.503 * W
      const spin = face > 0 ? 0 : 0.09
      bandParts.push(sidewallWord('PIRELLI', R * 0.805, zSkin, Math.PI / 2 + spin, 0.031, face))
      bandParts.push(sidewallWord('P ZERO', R * 0.805, zSkin, -Math.PI / 2 + spin, 0.034, face))
    }

    emit('rim', mergeParts(rimParts, 'rim'), rim, 'barrel')
    emit('metal', mergeParts(metalParts, 'nuts'), rim, 'nuts')
    emit('cover', mergeParts(coverParts, 'dish'), rim, 'dish')
    emit('accent', mergeParts(accentParts, 'accent'), trim, 'accent')
    emit('band', mergeParts(bandParts, 'marking'), trim, 'marking')
  }
  rebuild()

  return {
    root,
    parts: { tire, rim, trim },
    materials: materialSlots,
    getConfig: () => ({ ...config }),
    configure(patch) {
      if (patch.radius !== undefined) config.radius = Math.max(0.1, patch.radius)
      if (patch.width !== undefined) config.width = Math.max(0.05, patch.width)
      if (patch.treadSegments !== undefined) config.treadSegments = Math.max(8, Math.round(patch.treadSegments))
      if (patch.tread !== undefined) config.tread = patch.tread
      // A compound change re-grades the sidewall; an explicit band still wins over it.
      if (patch.compound !== undefined) {
        config.compound = patch.compound
        config.band = F1_COMPOUND_COLORS[patch.compound]
        if (patch.tread === undefined) {
          config.tread = patch.compound === 'intermediate' || patch.compound === 'wet' ? 'grooved' : 'slick'
        }
      }
      if (patch.band !== undefined) config.band = patch.band
      if (patch.compound !== undefined || patch.band !== undefined) {
        // Only recolour a material we own — never mutate one the consumer handed us (rule 16).
        if (ownsBand) (materialSlots.band as MeshStandardMaterial).color.set(config.band)
      }
      rebuild()
    },
    setMaterial(slot, material) {
      // One mesh per slot, so this is a direct reassignment: no rebuild, and no stale closure to read from.
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
  const model = createModel({ compound: 'medium', tread: 'slick' })
  model.root.position.y = 0.36
  return createF1Preview(model, {
    aspect,
    target: [0, 0.36, 0],
    distance: 1.42,
    pitch: 0.08,
    yaw: -0.12,
  })
}
