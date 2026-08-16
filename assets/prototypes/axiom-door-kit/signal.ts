import type { MeshPhysicalMaterial } from 'three/webgpu'

import { MaterialLibrary, tuneMaterial } from '../../../src/asset-forge/generator/index.ts'
import { TOKEN, shade, type CargoMaterialBundle } from '../axiom-cargo-kit/index.ts'

/**
 * Lit signal lamps in the tokens the cargo wave never needed.
 *
 * The cargo, storage, and logistics wave lights exactly two colours, amber and
 * cyan, because a crate's only states are "caution" and "has data". The doors
 * brief asks four of its ten modules to carry RED-500 as the *dominant* signal,
 * and a blast door whose danger state is painted rather than lit reads as a
 * white door with a red sticker.
 *
 * These are built here rather than added to `CargoMaterials` on purpose. Adding
 * a member to the shared bundle changes the source hash of all 166 models
 * already in the registry, which is a release-wide event; a door-kit lamp is a
 * door-kit concern. The handle is pushed onto the caller's bundle so the
 * existing dispose path releases it — a lamp that leaks its library handle
 * survives every model that lit it.
 */

const library = new MaterialLibrary()

export type SignalToken = 'RED-500' | 'ORANGE-500' | 'LIME-400' | 'FIELD-500' | 'AMBER-400' | 'CYAN-400'

const TOKEN_VALUE: Record<SignalToken, number> = {
  'RED-500': TOKEN.RED_500,
  'ORANGE-500': TOKEN.ORANGE_500,
  'LIME-400': TOKEN.LIME_400,
  'FIELD-500': TOKEN.FIELD_500,
  'AMBER-400': TOKEN.AMBER_400,
  'CYAN-400': TOKEN.CYAN_400,
}

/**
 * The doors' lamp tier, one step below the cargo wave's.
 *
 * A crate lights a 70 mm lens; a door lights an 850 mm jamb strip. At the cargo
 * wave's emissive 2.2 that strip clips to cream and the module loses the one
 * saturated colour the brief asked it to carry — the state read turns white,
 * which is the absence of a state. The lit *area* is what differs between the
 * waves, so the intensity has to differ with it.
 *
 * Small lenses still take the full tier; pass `emissive` explicitly for those.
 */
export function signalLamp(
  bundle: CargoMaterialBundle,
  token: SignalToken,
  seed = 4_100,
  emissive = 0.72,
): MeshPhysicalMaterial {
  const handle = library.acquire({ recipeId: 'MAT-09', palette: token, condition: 'maintained', seed })
  bundle.handles.push(handle)
  return tuneMaterial(handle, shade(TOKEN_VALUE[token], -0.22), 0.24, 0.03, { emissive })
}
