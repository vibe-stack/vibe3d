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
export { applyPolarCapUVs, loftAlongX, loftRoundedBox, ovalTube, roundedRectRing, uvAlongX } from './primitives.ts'
export { revolve, taperedTube } from './sculpt.ts'
export { ResourceBag, clamp01 } from './resourceBag.ts'
export { finishModel, meshesOf } from './finish.ts'
export type { FinishOptions, FinishedModel } from './finish.ts'
export { createLampLensMaterial, createLampMaterial } from './lamps.ts'
export type { F1LampMaterialOptions } from './lamps.ts'
export {
  lampLensTexture,
  paintedShellTexture,
  roofSheetTexture,
  marshalPlateTexture,
  fasciaTexture,
  circuitSignTexture,
  FASCIA_STYLES,
  isFasciaStyle,
  stampLedModuleGrid,
  oranjeSmokeTexture,
} from './textures.ts'
export type { CircuitSignTextureOptions, FasciaStyle, FasciaTextureOptions, LampLensTextureOptions } from './textures.ts'
export {
  GLYPH_3X5,
  GLYPH_COLS,
  GLYPH_ROWS,
  fillGlyphRect,
  glyphAdvance,
  glyphCells,
  writeGlyph3x5,
  writeGlyphWord,
} from './glyphs.ts'
export { DEFAULT_PITCH, DEFAULT_YAW, createF1Preview } from './preview.ts'
export type { F1Preview, F1PreviewModel, F1PreviewOptions } from './preview.ts'
export {
  CIRCUIT_SIGN_KINDS,
  GARAGE_BAY_PITCH,
  WALL_END,
  WALL_FITS,
  isCircuitSignKind,
  isWallFit,
} from './track.ts'
export type { CircuitSignKind, WallEnd, WallFit } from './track.ts'
