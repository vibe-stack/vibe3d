export { mergeStaticByMaterial } from './batching.ts'
export type { StaticBatchOptions } from './batching.ts'
export { createSmokeTexture } from './effects.ts'
export type { SmokeTextureOptions } from './effects.ts'
export { createStaticGlbSnapshot, exportStaticGlb } from './glb.ts'
export type { StaticGlbOptions, StaticGlbSnapshot } from './glb.ts'
export { MaterialLibrary, mountMaterialSource, tuneMaterial } from './materials.ts'
export type {
  MaterialHandle,
  MaterialSource,
  MaterialSourceOptions,
  PhysicalMaterialTuning,
} from './materials.ts'
export { mirrorProfile, octagon, offsetProfile, rect, stepEdge } from './profile.ts'
export type { Side } from './profile.ts'
export {
  WEAR_BAND,
  WEAR_FLOOR,
  cylinder,
  downTriangle,
  extrudeProfile,
  filletRing,
  flatPlate,
  groove,
  orientRing,
  prism,
  signedArea,
} from './primitives.ts'
export type {
  CapChamfer,
  Corners,
  PrismOptions,
  ProfileOptions,
  RingPoint,
  Vec2,
  Vec3,
} from './primitives.ts'
export {
  WEAR_ATTRIBUTES,
  bakeOcclusion,
  bakeSurfaceAttributes,
  createWearMaterial,
  wearOutputs,
} from './wear.ts'
export type {
  OcclusionBakeOptions,
  WearMaterialOptions,
  WearOutputs,
  WearProfile,
} from './wear.ts'
