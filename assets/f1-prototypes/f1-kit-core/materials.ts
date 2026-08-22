/**
 * The kit's material set, built from canonical colour tokens.
 *
 * Every prop in the wave acquires this bundle instead of picking its own hexes. Authoring colour per
 * prop is what produced the drift this replaced: seven unrelated accent hues and three greys within two
 * units of each other, none of them a canonical token. A shared bundle gives the garage one answer to
 * "what colour is structural steel here", and the eye reads that consistency long before it reads any
 * individual model.
 *
 * A pit garage is an Industrial / thermal place family, so the signals are limited to `AMBER-400`
 * (service attention), `ORANGE-500` (tools and heat) and `CYAN-400` (data), with `RED-500` reserved for
 * genuine critical equipment — the fire extinguisher, and nothing else.
 */

import { MeshStandardMaterial, type Material } from 'three/webgpu'

import { COMPOUND_TOKEN, TOKEN, shade, type Compound } from './palette.ts'

export interface F1Materials {
  /** Deepest service cavity: tyre rubber, hose, unlit interiors. */
  readonly ink: MeshStandardMaterial
  /** Scrubbed tread rubber — the same compound one value step up from `ink`. */
  readonly tread: MeshStandardMaterial
  /** Dark structural metal: frames, brackets, rim barrels. */
  readonly graphite: MeshStandardMaterial
  /** Mid-value utility plane: stands, posts, low-priority structure. */
  readonly slate: MeshStandardMaterial
  /** Machined bright metal: fasteners, anvils, lock nuts. */
  readonly steel: MeshStandardMaterial
  /** Clean coated shell: panels, cards, painted plate. */
  readonly shell: MeshStandardMaterial
  /** Quilted fabric: warmer blankets, straps. */
  readonly fabric: MeshStandardMaterial
  /** Service attention — hazard-marked equipment. */
  readonly amber: MeshStandardMaterial
  /** Tools and heat — grips, powered hand tools. */
  readonly orange: MeshStandardMaterial
  /** Active data — status lamps. Emissive. */
  readonly cyan: MeshStandardMaterial
  /** Critical danger. Reserved for fire equipment. */
  readonly red: MeshStandardMaterial
  /** Navigation / ownership — gantry banners and signage grounds. */
  readonly cobalt: MeshStandardMaterial
}

export interface F1MaterialBundle {
  readonly materials: F1Materials
  /** Every material the bundle created, for one-call disposal. */
  readonly owned: readonly Material[]
}

export interface F1MaterialOptions {
  /** Overrides merged over the bundle. An override is consumer-owned and never disposed here. */
  readonly overrides?: Partial<Record<keyof F1Materials, MeshStandardMaterial>>
}

/**
 * Build the kit's material set. Anything passed through `overrides` replaces a slot and is excluded from
 * `owned`, so `disposeF1Materials` never frees a material the consumer handed in (rule 16).
 */
export function acquireF1Materials(options: F1MaterialOptions = {}): F1MaterialBundle {
  const owned: Material[] = []
  const make = (
    slot: keyof F1Materials,
    parameters: ConstructorParameters<typeof MeshStandardMaterial>[0],
  ): MeshStandardMaterial => {
    const override = options.overrides?.[slot]
    if (override) return override
    const material = new MeshStandardMaterial({ name: `f1-kit / ${slot}`, ...parameters })
    owned.push(material)
    return material
  }

  const materials: F1Materials = {
    ink: make('ink', { color: shade(TOKEN.INK_950, -0.15), roughness: 0.97, metalness: 0.0 }),
    tread: make('tread', { color: shade(TOKEN.INK_950, 0.08), roughness: 0.72, metalness: 0.0 }),
    graphite: make('graphite', { color: TOKEN.GRAPHITE_800, roughness: 0.5, metalness: 0.6 }),
    slate: make('slate', { color: TOKEN.SLATE_650, roughness: 0.52, metalness: 0.55 }),
    steel: make('steel', { color: shade(TOKEN.SHELL_200, -0.12), roughness: 0.3, metalness: 0.85 }),
    shell: make('shell', { color: TOKEN.SHELL_200, roughness: 0.55, metalness: 0.15 }),
    fabric: make('fabric', { color: shade(TOKEN.GRAPHITE_800, -0.35), roughness: 0.95, metalness: 0.0 }),
    amber: make('amber', { color: TOKEN.AMBER_400, roughness: 0.5, metalness: 0.25 }),
    orange: make('orange', { color: TOKEN.ORANGE_500, roughness: 0.5, metalness: 0.2 }),
    cyan: make('cyan', {
      color: shade(TOKEN.INK_950, -0.4),
      emissive: TOKEN.CYAN_400,
      emissiveIntensity: 0.25,
      toneMapped: false,
    }),
    red: make('red', { color: TOKEN.RED_500, roughness: 0.45, metalness: 0.15 }),
    cobalt: make('cobalt', { color: TOKEN.COBALT_500, roughness: 0.65, metalness: 0.0 }),
  }

  return { materials, owned }
}

/** Frees every material the bundle created. Consumer-supplied overrides are left alone (rule 16). */
export function disposeF1Materials(bundle: F1MaterialBundle): void {
  for (const material of bundle.owned) material.dispose()
}

/**
 * A tyre-compound grading material, coloured from the canonical token for that compound.
 *
 * The caller owns the result — it is a per-prop material, not part of the shared bundle, because a stack
 * of mediums and a loose wet appear in the same scene.
 */
export function createCompoundMaterial(compound: Compound): MeshStandardMaterial {
  return new MeshStandardMaterial({
    name: `f1-kit / compound ${compound}`,
    color: COMPOUND_TOKEN[compound],
    roughness: 0.6,
    metalness: 0.0,
  })
}
