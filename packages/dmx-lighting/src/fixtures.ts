import type { Address } from './address'
import { encoderFields, EncoderSpec } from './encoders'
import type { FieldName } from './fields'
import type { Placement } from './layout'

export type FixtureShape = 'par' | 'bar' | 'strip' | 'matrix' | 'mover' | 'generic'

/** One DMX channel of a fixture mode, in address order. */
export interface FixtureChannel {
  /** What the channel carries, e.g. 'red' or 'pan'; null for a channel nothing drives. */
  field: FieldName | null
  /** 0-based head (pod, cell, pixel) the channel belongs to; absent for fixture-wide channels. */
  head?: number
  /** Value sent whenever no mapping drives the channel. Defaults to 0. */
  default?: number
  /** Half of a 16-bit pair, for movers and fine dimmers. */
  bits?: 16
  part?: 'coarse' | 'fine'
  /** Overrides the generated name, e.g. "Shutter / strobe". */
  label?: string
  /** Free text, typically the value ranges from the manual. */
  description?: string
}

/** One addressing layout of a fixture, as its manual's DMX chart lists it. */
export interface FixtureMode {
  name: string
  description?: string
  channels: FixtureChannel[]
  /** How a colour becomes this mode's fields. Defaults to passthrough. */
  encoder?: EncoderSpec
}

/** A kind of light, independent of how many of them are hung or where. */
export interface FixtureType {
  id: string
  name: string
  manufacturer?: string
  description?: string
  shape: FixtureShape
  /** What the manual calls a head, e.g. "Pod"; used in channel names. */
  headName?: string
  modes: FixtureMode[]
}

/** One physical light in the rig: a type, a mode and where it starts. */
export interface FixtureInstance {
  id: string
  name: string
  typeId: string
  modeName: string
  address: Address
  placement?: Placement
  enabled?: boolean
}

/** Physical head order relative to the order a mapping's targets list them in. */
export type TapArrangement = 'forward' | 'reverse' | 'serpentine'

/** How the source span maps onto the target heads. */
export type TapFit = 'clip' | 'stretch'

/** How a fractional or multi-pixel source position becomes one colour. */
export type TapFilter = 'nearest' | 'linear' | 'average'

/** How a `reduce` mapping collapses its range into one colour. */
export type ReduceMode = 'average' | 'brightest' | 'darkest'

/** A set of heads on one fixture; absent `heads` means all of them. */
export interface MappingTarget {
  fixtureId: string
  heads?: number[]
}

/**
 * Routes sketch colours onto fixture heads. `spread` gives each head its own source pixel,
 * in target order; `reduce` collapses a source range into one colour that every head shows.
 */
export interface Mapping {
  id: string
  name?: string
  enabled?: boolean
  source: string
  kind: 'spread' | 'reduce'
  reduce?: ReduceMode
  /** First source pixel read; may be fractional, and seeds the animatable offset node. */
  offset?: number
  /** Source pixels covered by `reduce` and by `stretch`; defaults to the whole source. */
  span?: number
  /** Source pixels advanced per head under `clip`. Defaults to 1. */
  step?: number
  /** Indices wrap around the source instead of clamping to its ends. */
  wrap?: boolean
  arrangement?: TapArrangement
  /** Heads per segment for `serpentine`; defaults to all of them. */
  segmentSize?: number
  fit?: TapFit
  filter?: TapFilter
  /** Sample a 2D source by each head's stage position instead of by index. */
  spatial?: boolean
  /** Per-mapping trim, seed for the animatable gain node. Defaults to 1. */
  gain?: number
  targets: MappingTarget[]
}

/** A channel held at a value from the channel map, backed by a param node. */
export interface ChannelOverride {
  universe: number
  /** The channel held; for a 16-bit pair, the coarse byte, with the fine byte after it. */
  channel: number
  /** 0–255, or 0–1 for a 16-bit pair, which is split into 65536 steps on output. */
  value: number
  bits?: 16
}

/** The override holding a channel, including the fine half of a 16-bit pair. */
export function overrideAt(
  overrides: ChannelOverride[],
  universe: number,
  channel: number,
): ChannelOverride | undefined {
  return overrides.find(
    (o) =>
      o.universe === universe &&
      (o.channel === channel || (o.bits === 16 && o.channel + 1 === channel)),
  )
}

/** The bytes an override writes: one channel, or a coarse and fine pair. */
export function overrideBytes(
  override: ChannelOverride,
  value: number,
): Array<{ universe: number; channel: number; value: number }> {
  const { universe, channel } = override
  if (override.bits !== 16) return [{ universe, channel, value }]
  const wide = Math.round(Math.min(1, Math.max(0, value)) * 65535)
  return [
    { universe, channel, value: wide >> 8 },
    { universe, channel: channel + 1, value: wide & 255 },
  ]
}

/** A fixture, or one head of it, flashing so it can be found on the rig. */
export interface IdentifyTarget {
  fixtureId: string
  head?: number
}

export function findType(types: FixtureType[], typeId: string): FixtureType | undefined {
  return types.find((t) => t.id === typeId)
}

export function findMode(type: FixtureType, modeName: string): FixtureMode | undefined {
  return type.modes.find((m) => m.name === modeName) ?? type.modes[0]
}

/** True when the mode splits into heads; otherwise the whole fixture is one implicit head. */
export function modeHasHeads(mode: FixtureMode): boolean {
  return mode.channels.some((c) => c.head !== undefined)
}

export function modeHeadCount(mode: FixtureMode): number {
  let max = -1
  for (const channel of mode.channels)
    if (channel.head !== undefined) max = Math.max(max, channel.head)
  return max + 1 || 1
}

/** The head a channel takes colour from, or undefined for a fixture-wide channel on a headed mode. */
export function channelHead(mode: FixtureMode, channel: FixtureChannel): number | undefined {
  return modeHasHeads(mode) ? channel.head : 0
}

/** Fields the mode's encoder writes; channels carrying anything else only ever send defaults. */
export function drivenFields(mode: FixtureMode): Set<string> {
  return new Set(encoderFields(mode.encoder))
}

export function headLabel(type: FixtureType | undefined, head: number): string {
  return `${type?.headName || 'Head'} ${head + 1}`
}

function titleCase(field: string): string {
  return field.charAt(0).toUpperCase() + field.slice(1)
}

/** Human name for a channel: its own label, else head plus field, e.g. "Pod 2 Blue". */
export function channelLabel(
  type: FixtureType | undefined,
  mode: FixtureMode,
  index: number,
): string {
  const channel = mode.channels[index]
  if (!channel) return '—'
  if (channel.label) return channel.label
  const head =
    modeHasHeads(mode) && channel.head !== undefined ? `${headLabel(type, channel.head)} ` : ''
  const field = channel.field ? titleCase(channel.field) : 'Unused'
  const wide = channel.bits === 16 ? (channel.part === 'fine' ? ' fine' : ' coarse') : ''
  return `${head}${field}${wide}`
}

/** Builds `count` heads of the same channel pattern, numbered from `firstHead`. */
export function repeatHeads(
  pattern: Array<FieldName | Omit<FixtureChannel, 'head'>>,
  count: number,
  firstHead = 0,
): FixtureChannel[] {
  const out: FixtureChannel[] = []
  for (let h = 0; h < count; h++) {
    for (const item of pattern) {
      const channel = typeof item === 'string' ? { field: item } : item
      out.push({ ...channel, head: firstHead + h })
    }
  }
  return out
}

/**
 * The heads a mapping drives, in order. Unknown fixtures and out-of-range heads are
 * dropped, so a mapping survives its fixture being removed or switched to a smaller mode.
 */
export function mappingHeads(
  mapping: Mapping,
  fixtures: FixtureInstance[],
  types: FixtureType[],
): Array<{ fixture: FixtureInstance; head: number }> {
  const out: Array<{ fixture: FixtureInstance; head: number }> = []
  const seen = new Set<string>()
  for (const target of mapping.targets) {
    // A fixture is targeted once per mapping; a repeat is ignored rather than doubled.
    if (seen.has(target.fixtureId)) continue
    seen.add(target.fixtureId)
    const fixture = fixtures.find((f) => f.id === target.fixtureId)
    if (!fixture || fixture.enabled === false) continue
    const type = findType(types, fixture.typeId)
    const mode = type ? findMode(type, fixture.modeName) : undefined
    if (!mode) continue
    const count = modeHeadCount(mode)
    const heads = target.heads ?? Array.from({ length: count }, (_, i) => i)
    for (const head of heads) if (head >= 0 && head < count) out.push({ fixture, head })
  }
  return out
}

/** Node ids for the animatable per-mapping values; deterministic so they survive reloads. */
export function mappingOffsetNodeId(pluginId: string, mappingId: string): string {
  return `${pluginId}-map-${mappingId}-offset`
}

export function mappingGainNodeId(pluginId: string, mappingId: string): string {
  return `${pluginId}-map-${mappingId}-gain`
}

/** A 16-bit override gets its own id, so its node is created with the 0–1 range. */
export function overrideNodeId(pluginId: string, override: ChannelOverride): string {
  const kind = override.bits === 16 ? 'overridepair' : 'override'
  return `${pluginId}-${kind}-${override.universe}-${override.channel}`
}

/**
 * The largest useful offset for a mapping: a full turn of the source when wrapping, else
 * as far as it can slide before the pixels it reads would run off the end.
 */
export function mappingOffsetMax(mapping: Mapping, sourceLength: number, heads: number): number {
  if (mapping.wrap || mapping.spatial) return Math.max(1, sourceLength)
  const span = Math.max(1, Math.floor(mapping.span ?? sourceLength))
  const covered =
    mapping.kind === 'reduce' || mapping.fit === 'stretch'
      ? span
      : (Math.max(1, heads) - 1) * (mapping.step ?? 1) + 1
  return Math.max(1, sourceLength - covered)
}

export function makeId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`
}
