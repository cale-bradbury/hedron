// Engine- and React-free surface, so the compositor can run in Node for verification.
export {
  PixelSource,
  SourceRegistry,
  PIXEL_FIELDS,
  PIXEL_STRIDE,
  FIELD_OFFSET,
} from './PixelSource'
export { compilePatch, executePatch, resolveTaps, findAddressConflicts } from './PatchCompiler'
export type { CompiledPatch, CompiledTap } from './PatchCompiler'
export {
  DEFAULT_PROFILES,
  findProfile,
  findMode,
  modeChannelCount,
  makeEntryId,
  tapOffsetNodeId,
  tapGainNodeId,
} from './profiles'
export type {
  FixtureProfile,
  FixtureMode,
  FixtureShape,
  PatchEntry,
  Tap,
  TapArrangement,
  TapFit,
  TapFilter,
} from './profiles'
export { UniverseSet } from './UniverseSet'
export { DMX_UNIVERSE_SIZE, toAddress, parseAddressList, formatAddressList } from './address'
export type { Address } from './address'
export type * from './types'
