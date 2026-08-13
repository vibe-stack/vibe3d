import type { DataTexture, MeshPhysicalMaterial } from 'three/webgpu'
import { MeshPhysicalMaterial as PhysicalMaterial } from 'three/webgpu'

import {
  MaterialLibrary,
  tuneMaterial,
  type MaterialHandle,
  type WearProfile,
} from '../../../src/asset-forge/generator/index.ts'
import { createChevronTexture, createLabelTexture, createStripeTexture, type LabelOptions, type StripeOptions } from './decals.ts'
import { TOKEN, mixToken, shade } from './palette.ts'

/**
 * The one material set every prop in the cargo, storage, and logistics wave
 * draws from.
 *
 * Fifty props authored with fifty private palettes look like fifty packs. The
 * set below is the pack's actual visual contract: a light coated shell, two
 * derived value siblings for panel breaks, a dark service tier, brushed and
 * oxidised metals for hardware, painted safety colours that do *not* glow, and a
 * small emissive group that only ever appears behind a lens.
 *
 * Painted amber and emissive amber are separate members on purpose. The
 * reference sheets use amber for both a latch handle and a status lamp, and
 * conflating them is the single fastest way to make a crate look like a
 * spaceship - a handle that emits reads as powered, which is a lie about what
 * the part does.
 */
export interface CargoMaterials {
  /** Primary coated-alloy shell. MAT-02. */
  shell: MeshPhysicalMaterial
  /** Clean highlight plane for lids, doors, and civic-facing faces. MAT-02. */
  shellLight: MeshPhysicalMaterial
  /** Derived shadow sibling for returns, undersides, and second-tier panels. */
  shellShade: MeshPhysicalMaterial
  /** Secondary service plane: skirts, frames, corner blocks. MAT-02. */
  graphite: MeshPhysicalMaterial
  /** Lifted graphite for hardware that must separate from the skirt. */
  graphiteEdge: MeshPhysicalMaterial
  /** Deepest service cavity. Vents, recesses, gaskets, shadow gaps. */
  ink: MeshPhysicalMaterial
  /** Brushed alloy hardware: rods, pins, hinges, bracing. MAT-03. */
  steel: MeshPhysicalMaterial
  /** Weathered steel for bands, straps, and industrial substrate. MAT-04. */
  ironOxide: MeshPhysicalMaterial
  /** Safety rubber: bumpers, feet, seals, wheels, hoses. MAT-07. */
  rubber: MeshPhysicalMaterial
  /** Technical fabric: bag and sack bodies, tarps. MAT-10. */
  fabric: MeshPhysicalMaterial
  /** Load webbing: straps, nets, lashings. Near-black by design. MAT-10. */
  webbing: MeshPhysicalMaterial
  /** Salvaged timber for the old-world half of the pack. MAT-16. */
  timber: MeshPhysicalMaterial
  /** Painted caution. Handles, latches, lift points. MAT-17, never emissive. */
  amberPaint: MeshPhysicalMaterial
  /** Painted thermal/fluid identity. MAT-17, never emissive. */
  orangePaint: MeshPhysicalMaterial
  /** Painted critical marking. Used sparingly. MAT-17. */
  redPaint: MeshPhysicalMaterial
  /** Lit caution lamp behind a lens. MAT-09. */
  amber: MeshPhysicalMaterial
  /** Unpowered lamp of the same fixture. */
  amberDim: MeshPhysicalMaterial
  /** Lit data/status read. MAT-09. */
  cyan: MeshPhysicalMaterial
  /** Transparent laminate for gauges and sight glasses. MAT-08. */
  glass: MeshPhysicalMaterial
}

export interface CargoMaterialBundle {
  materials: CargoMaterials
  handles: MaterialHandle[]
  wearProfiles: Map<MeshPhysicalMaterial, WearProfile>
  /** Decal materials and their textures; disposed by {@link disposeDecals}. */
  decals: DecalBundle
}

export interface DecalBundle {
  materials: MeshPhysicalMaterial[]
  textures: DataTexture[]
}

export interface CargoMaterialOptions {
  /**
   * Condition of the whole prop, 0 factory-fresh to 1 depot-veteran. It scales
   * every wear profile together so a pack reads as one fleet at one age rather
   * than as props that each negotiated their own weathering.
   */
  readonly condition?: number
  /** Overrides the shell base token; the derived siblings follow it. */
  readonly shellToken?: number
}

/**
 * A seated decal material. `polygonOffset` keeps the graphic on its plaque
 * without a z-clearance gap wide enough to catch a rim light.
 */
export function createDecalMaterial(map: DataTexture, name: string, roughness = 0.54): MeshPhysicalMaterial {
  return new PhysicalMaterial({
    name,
    color: 0xffffff,
    map,
    roughness,
    metalness: 0.06,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  })
}

/**
 * A colour-system token is a *swatch*, not an albedo.
 *
 * This distinction cost the whole wave its coherence once already. The wave
 * originally fed `TOKEN.SHELL_200` (`#D9E6E9`) straight into `tuneMaterial` as
 * a hull colour. That swatch is a UI value: lightness 0.88 at saturation 0.27
 * of cyan. Measured across the 110 models of the preceding wave, the albedo
 * actually bound to the `shell` slot sits at lightness 0.80 and saturation
 * 0.05 - a near-neutral coated alloy that lets the warm key light do the
 * tinting. Painting hulls in the raw swatch made every prop read both too
 * bright and permanently cold, because a saturated albedo fights the key
 * instead of taking it.
 *
 * So each member below is *derived* from its token to the measured house
 * value. The tokens stay canonical and untouched; this is the translation
 * layer the older models perform by hand.
 */
const HOUSE = {
  /** Coated alloy hull. Median of 58 `shell` slots in the preceding wave. */
  shell: 0xcacfce,
  /** Structural charcoal. Same value as the token, half its blue skew. */
  graphite: 0x232a31,
  /** Deepest cavity. The token is both too light and twice as blue. */
  ink: 0x06090b,
  /** Brushed hardware. The token derivation ran 0.14 lightness too dark. */
  steel: 0x8f999c,
  /** Painted caution. The token is a light swatch; paint is deeper. */
  amber: 0xe88008,
} as const

export function acquireCargoMaterials(seed: number, options: CargoMaterialOptions = {}): CargoMaterialBundle {
  const library = new MaterialLibrary()
  const condition = Math.min(1, Math.max(0, options.condition ?? 0.45))
  const shellBase = options.shellToken ?? HOUSE.shell

  let counter = 0
  const acquire = (recipeId: string, palette: string): MaterialHandle => {
    counter += 1
    return library.acquire({ recipeId, palette, condition: condition > 0.6 ? 'worked' : 'maintained', seed: seed + counter })
  }

  const handles: MaterialHandle[] = []
  const claim = (recipeId: string, palette: string): MaterialHandle => {
    const handle = acquire(recipeId, palette)
    handles.push(handle)
    return handle
  }

  const materials: CargoMaterials = {
    shell: tuneMaterial(claim('MAT-02', 'SHELL-200'), shellBase, 0.47, 0.2, { clearcoat: 0.22, clearcoatRoughness: 0.4 }),
    // The highlight tier only has to read a step above the hull. At the old
    // +0.4 it reached lightness 0.93 - brighter than any surface in the
    // preceding 110 models - and clipped to flat white on every lid.
    shellLight: tuneMaterial(claim('MAT-02', 'SHELL-050'), shade(shellBase, 0.3), 0.42, 0.16, { clearcoat: 0.26, clearcoatRoughness: 0.34 }),
    shellShade: tuneMaterial(claim('MAT-02', 'SHELL-200'), shade(shellBase, -0.28), 0.55, 0.24, { clearcoat: 0.12 }),
    graphite: tuneMaterial(claim('MAT-02', 'GRAPHITE-800'), HOUSE.graphite, 0.5, 0.46, { clearcoat: 0.16 }),
    graphiteEdge: tuneMaterial(claim('MAT-02', 'GRAPHITE-800'), shade(HOUSE.graphite, 0.22), 0.44, 0.52, { clearcoat: 0.18 }),
    ink: tuneMaterial(claim('MAT-02', 'INK-950'), HOUSE.ink, 0.68, 0.3),
    // Metalness 0.93 with no environment map leaves no diffuse term at all, so
    // a rod swings between blown-out and black with orientation and mirrors
    // whatever colour the ambient happens to be. 0.68 is the house value.
    steel: tuneMaterial(claim('MAT-03', 'SLATE-650'), HOUSE.steel, 0.36, 0.68, { clearcoat: 0.14 }),
    // Oxide has to contain some oxide. Derived toward the rust token so the
    // pack owns one warm metal instead of a second cool grey.
    ironOxide: tuneMaterial(claim('MAT-04', 'SLATE-650'), shade(mixToken(TOKEN.SLATE_650, TOKEN.RUST_500, 0.34), -0.2), 0.56, 0.4),
    rubber: tuneMaterial(claim('MAT-07', 'INK-900'), TOKEN.INK_900, 0.74, 0.03),
    fabric: tuneMaterial(claim('MAT-10', 'DUST-300'), shade(TOKEN.DUST_300, -0.34), 0.82, 0.02),
    // Strap, net, and lashing webbing. Every reference sheet draws these
    // near-black; without a member for them the models reached for `fabric`
    // and a cargo net came out the colour of a bandage.
    webbing: tuneMaterial(claim('MAT-10', 'GRAPHITE-800'), shade(HOUSE.graphite, 0.12), 0.86, 0.02),
    // Salvaged timber is the pack's single warm note. The earlier 0.42 rust
    // mix made it pink; weathered timber is a desaturated khaki.
    timber: tuneMaterial(claim('MAT-16', 'DUST-300'), shade(mixToken(TOKEN.DUST_300, TOKEN.RUST_500, 0.16), -0.28), 0.78, 0.02),
    amberPaint: tuneMaterial(claim('MAT-17', 'AMBER-400'), HOUSE.amber, 0.46, 0.18, { clearcoat: 0.2 }),
    orangePaint: tuneMaterial(claim('MAT-17', 'ORANGE-500'), shade(TOKEN.ORANGE_500, -0.2), 0.48, 0.16, { clearcoat: 0.18 }),
    redPaint: tuneMaterial(claim('MAT-17', 'RED-500'), shade(TOKEN.RED_500, -0.24), 0.48, 0.14, { clearcoat: 0.18 }),
    amber: tuneMaterial(claim('MAT-09', 'AMBER-400'), TOKEN.AMBER_400, 0.2, 0.02, { emissive: 2.2 }),
    amberDim: tuneMaterial(claim('MAT-09', 'AMBER-400'), shade(TOKEN.AMBER_400, -0.35), 0.34, 0.06, { emissive: 0.1 }),
    cyan: tuneMaterial(claim('MAT-09', 'CYAN-400'), TOKEN.CYAN_400, 0.18, 0.02, { emissive: 1.7 }),
    glass: tuneMaterial(claim('MAT-08', 'ICE-300'), TOKEN.ICE_300, 0.09, 0.05, { clearcoat: 0.85, clearcoatRoughness: 0.06 }),
  }
  materials.glass.opacity = 0.42
  materials.glass.transparent = true

  // Wear character per surface, scaled by one shared condition dial. Painted
  // safety colours rub through faster than the shell they sit on, because they
  // are a thin top coat on exactly the parts hands and forks reach.
  const scale = 0.45 + condition * 0.95
  const profile = (rub: number, grime: number, scratch: number): WearProfile => ({
    rub: Math.min(1, rub * scale),
    grime: Math.min(1, grime * scale),
    scratch: Math.min(1, scratch * scale),
  })
  const wearProfiles = new Map<MeshPhysicalMaterial, WearProfile>([
    [materials.shell, profile(0.38, 0.44, 0.5)],
    [materials.shellLight, profile(0.3, 0.36, 0.42)],
    [materials.shellShade, profile(0.44, 0.6, 0.5)],
    [materials.graphite, profile(0.4, 0.58, 0.44)],
    [materials.graphiteEdge, profile(0.5, 0.5, 0.52)],
    [materials.steel, profile(0.62, 0.44, 0.78)],
    [materials.ironOxide, profile(0.78, 0.72, 0.7)],
    [materials.timber, profile(0.5, 0.8, 0.34)],
    [materials.fabric, profile(0.22, 0.82, 0.16)],
    [materials.webbing, profile(0.24, 0.8, 0.18)],
    // Safety paint rubs, but the wear shader mixes rubbed-through surface
    // toward a light neutral metal. At 0.7 the accents came back as cream and
    // the pack lost every saturated warm it had. A thin top coat still chips;
    // it does not turn the whole marking into bare alloy.
    [materials.amberPaint, profile(0.34, 0.42, 0.62)],
    [materials.orangePaint, profile(0.32, 0.44, 0.6)],
    [materials.redPaint, profile(0.32, 0.44, 0.6)],
  ])

  return { materials, handles, wearProfiles, decals: { materials: [], textures: [] } }
}

/** Registers a hazard band decal material on the bundle and returns it. */
export function addStripeDecal(bundle: CargoMaterialBundle, options: StripeOptions = {}): MeshPhysicalMaterial {
  const map = createStripeTexture(options)
  const material = createDecalMaterial(map, 'axiom-cargo-kit / hazard band decal')
  bundle.decals.textures.push(map)
  bundle.decals.materials.push(material)
  return material
}

/** Registers a manifest plaque decal material on the bundle and returns it. */
export function addLabelDecal(bundle: CargoMaterialBundle, options: LabelOptions = {}): MeshPhysicalMaterial {
  const map = createLabelTexture(options)
  const material = createDecalMaterial(map, 'axiom-cargo-kit / manifest plaque decal', 0.6)
  bundle.decals.textures.push(map)
  bundle.decals.materials.push(material)
  return material
}

/** Registers an ownership chevron decal material on the bundle and returns it. */
export function addChevronDecal(bundle: CargoMaterialBundle, mark?: number, ground?: number): MeshPhysicalMaterial {
  const map = createChevronTexture(mark, ground)
  const material = createDecalMaterial(map, 'axiom-cargo-kit / ownership chevron decal')
  bundle.decals.textures.push(map)
  bundle.decals.materials.push(material)
  return material
}

export function disposeCargoMaterials(bundle: CargoMaterialBundle): void {
  for (const material of bundle.decals.materials) material.dispose()
  for (const map of bundle.decals.textures) map.dispose()
  for (const handle of bundle.handles) handle.release()
}
