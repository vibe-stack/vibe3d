export { COMPOUND_TOKEN, TOKEN, shade } from './palette.ts'
export type { Compound, Token } from './palette.ts'
export {
  acquireF1Materials,
  createCompoundMaterial,
  disposeF1Materials,
} from './materials.ts'
export type { F1MaterialBundle, F1MaterialOptions, F1Materials } from './materials.ts'
export {
  AXIS_X,
  AXIS_Y,
  AXIS_Z,
  FACE_CLEARANCE,
  LAYER_CLEARANCE,
  bolt,
  boltRun,
  castor,
  facetRadius,
  groundPad,
  hexagon,
  layer,
  member,
  socket,
  tubeSection,
  wrapStrap,
} from './parts.ts'
export type { Vec3 } from './parts.ts'
export { arcBand, bevelBlade, bevelBox, bevelDisc, bevelPrism, bevelRing } from './bevel.ts'
export { creased, mergeParts } from './merge.ts'
export { loftAlongX, loftRoundedBox, ovalTube, roundedRectRing, uvAlongX } from './primitives.ts'
export { revolve, taperedTube } from './sculpt.ts'
export { ResourceBag, clamp01 } from './resourceBag.ts'
export { finishModel, meshesOf } from './finish.ts'
export type { FinishOptions, FinishedModel } from './finish.ts'
export { DEFAULT_PITCH, DEFAULT_YAW, createF1Preview } from './preview.ts'
export type { F1Preview, F1PreviewModel, F1PreviewOptions } from './preview.ts'
