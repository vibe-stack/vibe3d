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
  /** Technical fabric: bags, sacks, nets, straps, tarps. MAT-10. */
  fabric: MeshPhysicalMaterial
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

export function acquireCargoMaterials(seed: number, options: CargoMaterialOptions = {}): CargoMaterialBundle {
  const library = new MaterialLibrary()
  const condition = Math.min(1, Math.max(0, options.condition ?? 0.45))
  const shellBase = options.shellToken ?? TOKEN.SHELL_200

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
    shellLight: tuneMaterial(claim('MAT-02', 'SHELL-050'), shade(shellBase, 0.4), 0.42, 0.16, { clearcoat: 0.26, clearcoatRoughness: 0.34 }),
    shellShade: tuneMaterial(claim('MAT-02', 'SHELL-200'), shade(shellBase, -0.36), 0.55, 0.24, { clearcoat: 0.12 }),
    graphite: tuneMaterial(claim('MAT-02', 'GRAPHITE-800'), TOKEN.GRAPHITE_800, 0.5, 0.46, { clearcoat: 0.16 }),
    graphiteEdge: tuneMaterial(claim('MAT-02', 'GRAPHITE-800'), shade(TOKEN.GRAPHITE_800, 0.22), 0.44, 0.52, { clearcoat: 0.18 }),
    ink: tuneMaterial(claim('MAT-02', 'INK-950'), TOKEN.INK_950, 0.68, 0.3),
    steel: tuneMaterial(claim('MAT-03', 'SLATE-650'), shade(TOKEN.SLATE_650, 0.16), 0.32, 0.93, { clearcoat: 0.14 }),
    ironOxide: tuneMaterial(claim('MAT-04', 'SLATE-650'), shade(TOKEN.SLATE_650, -0.22), 0.56, 0.86),
    rubber: tuneMaterial(claim('MAT-07', 'INK-900'), TOKEN.INK_900, 0.74, 0.03),
    fabric: tuneMaterial(claim('MAT-10', 'DUST-300'), shade(TOKEN.DUST_300, -0.16), 0.82, 0.02),
    // Salvaged timber leans warm against the pack's cool alloys. Derived by
    // pulling the dust token toward the oxide token rather than by picking a
    // brown, so it still traces back to two approved values.
    timber: tuneMaterial(claim('MAT-16', 'DUST-300'), shade(mixToken(TOKEN.DUST_300, TOKEN.RUST_500, 0.42), -0.14), 0.78, 0.02),
    amberPaint: tuneMaterial(claim('MAT-17', 'AMBER-400'), TOKEN.AMBER_400, 0.46, 0.18, { clearcoat: 0.2 }),
    orangePaint: tuneMaterial(claim('MAT-17', 'ORANGE-500'), TOKEN.ORANGE_500, 0.48, 0.16, { clearcoat: 0.18 }),
    redPaint: tuneMaterial(claim('MAT-17', 'RED-500'), TOKEN.RED_500, 0.48, 0.14, { clearcoat: 0.18 }),
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
    [materials.amberPaint, profile(0.72, 0.42, 0.62)],
    [materials.orangePaint, profile(0.7, 0.44, 0.6)],
    [materials.redPaint, profile(0.7, 0.44, 0.6)],
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
