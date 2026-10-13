// Engine- and React-free surface, so the compositor can run in Node for verification.
export {
  PixelSource,
  SourceRegistry,
  PIXEL_FIELDS,
  PIXEL_STRIDE,
  FIELD_OFFSET,
} from './PixelSource'
export {
  compileRig,
  executeRig,
  resolveRig,
  mappingSourcePixels,
  spreadSourceIndex,
  LAYER_DEFAULT,
  LAYER_DRIVEN,
  LAYER_OVERRIDE,
  LAYER_IDENTIFY,
} from './RigCompiler'
export type { CompiledRig, CompiledMapping } from './RigCompiler'
export {
  applyMixes,
  crossfadePair,
  crossfadeWeights,
  makeMixId,
  mixPositionNodeId,
  normalizeMixes,
} from './mixer'
export type { MixSource, CrossfadePair } from './mixer'
export {
  findType,
  findMode,
  modeHasHeads,
  modeHeadCount,
  channelHead,
  channelLabel,
  drivenFields,
  headLabel,
  repeatHeads,
  mappingHeads,
  mappingOffsetNodeId,
  mappingGainNodeId,
  overrideNodeId,
  overrideAt,
  overrideBytes,
  mappingOffsetMax,
  makeId,
} from './fixtures'
export type {
  FixtureChannel,
  FixtureMode,
  FixtureType,
  FixtureShape,
  FixtureInstance,
  Mapping,
  MappingTarget,
  ReduceMode,
  ChannelOverride,
  IdentifyTarget,
  TapArrangement,
  TapFit,
  TapFilter,
} from './fixtures'
export { DEFAULT_TYPES, isShippedType, mergeShippedTypes, normalizeTypes } from './library'
export { makeEncoder, encoderFields, rgbToOklab, parseHexColor, ENCODER_KINDS } from './encoders'
export type { EncoderSpec, Encoder, WheelEntry } from './encoders'
export { FieldTable, WELL_KNOWN_FIELDS, COLOUR_FIELDS } from './fields'
export type { FieldName } from './fields'
export {
  channelKey,
  describeChannels,
  findNextFreeAddress,
  fixtureMode,
  fixtureSpan,
  footprints,
  formatAddress,
  mappingTitle,
  sharedWith,
  sortFixturesByAddress,
  universeUsage,
} from './rigTools'
export type { ChannelInfo, ChannelUse, Footprint } from './rigTools'
export {
  qlcFieldName,
  qlcChannelToFixtureChannel,
  qlcToFixtureType,
  parseQlcXml,
} from './qlcImport'
export type { QlcDefinition, QlcChannel, QlcMode } from './qlcImport'
export {
  pixelWorldPositions,
  worldToUv,
  uvToWorld,
  placementOf,
  DEFAULT_STAGE,
  DEFAULT_PLACEMENT,
} from './layout'
export type { Placement, StageBounds } from './layout'
export { buildRigFile, parseRigFile, normalizeOverrides, RIG_FILE_VERSION } from './rigFile'
export type { RigFile } from './rigFile'
export { UniverseSet } from './UniverseSet'
export { DMX_UNIVERSE_SIZE, toAddress, parseAddressList, formatAddressList } from './address'
export type { Address } from './address'
export type * from './types'
