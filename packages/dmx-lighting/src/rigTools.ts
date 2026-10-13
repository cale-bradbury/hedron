import { Address, DMX_UNIVERSE_SIZE } from './address'
import {
  channelHead,
  channelLabel,
  drivenFields,
  findMode,
  findType,
  FixtureInstance,
  FixtureMode,
  FixtureType,
  Mapping,
  mappingHeads,
} from './fixtures'

/** The run of channels one fixture occupies. */
export interface Footprint {
  fixtureId: string
  name: string
  universe: number
  /** 1-based, inclusive. */
  from: number
  to: number
  /** True when the run would run past the end of its universe. */
  overflows: boolean
}

/** One fixture's claim on a channel, and what the channel does for it. */
export interface ChannelUse {
  fixtureId: string
  fixtureName: string
  typeName: string
  modeName: string
  start: Address
  /** 1-based channel number within the fixture, as the manual counts it. */
  index: number
  label: string
  description?: string
  defaultValue: number
  /** Which half of a 16-bit pair the channel is, if it is one. */
  part?: 'coarse' | 'fine'
  /** Names of the mappings driving this channel; empty when it only sends its default. */
  drivenBy: string[]
}

export interface ChannelInfo {
  uses: ChannelUse[]
  /** Mapping writes landing on the channel; more than one means highest value wins. */
  drivers: number
}

export const channelKey = (universe: number, channel: number) =>
  universe * (DMX_UNIVERSE_SIZE + 1) + channel

export function fixtureMode(
  fixture: FixtureInstance,
  types: FixtureType[],
): { type: FixtureType; mode: FixtureMode } | null {
  const type = findType(types, fixture.typeId)
  const mode = type ? findMode(type, fixture.modeName) : undefined
  return type && mode ? { type, mode } : null
}

export function fixtureSpan(fixture: FixtureInstance, types: FixtureType[]): number {
  return fixtureMode(fixture, types)?.mode.channels.length ?? 0
}

export function mappingTitle(mapping: Mapping): string {
  return mapping.name || mapping.source || '(no source)'
}

/** Every run of channels the rig occupies. */
export function footprints(
  fixtures: FixtureInstance[],
  types: FixtureType[],
  options: { includeDisabled?: boolean } = {},
): Footprint[] {
  const out: Footprint[] = []
  for (const fixture of fixtures) {
    if (fixture.enabled === false && !options.includeDisabled) continue
    const span = fixtureSpan(fixture, types)
    if (span === 0) continue
    const to = fixture.address.channel + span - 1
    out.push({
      fixtureId: fixture.id,
      name: fixture.name || fixture.id,
      universe: fixture.address.universe,
      from: fixture.address.channel,
      to,
      overflows: to > DMX_UNIVERSE_SIZE,
    })
  }
  return out
}

/** Names of the other fixtures each fixture shares channels with; sharing is allowed, just noted. */
export function sharedWith(
  fixtures: FixtureInstance[],
  types: FixtureType[],
): Map<string, string[]> {
  const prints = footprints(fixtures, types)
  const out = new Map<string, string[]>()
  for (const a of prints) {
    for (const b of prints) {
      if (a === b || a.universe !== b.universe || a.to < b.from || b.to < a.from) continue
      const list = out.get(a.fixtureId) ?? []
      list.push(b.name)
      out.set(a.fixtureId, list)
    }
  }
  return out
}

/**
 * First channel at or after `from` with `span` free channels, ignoring the fixture being
 * placed so re-addressing it does not collide with where it already sits.
 */
export function findNextFreeAddress(
  fixtures: FixtureInstance[],
  types: FixtureType[],
  universe: number,
  span: number,
  excludeId?: string,
  from = 1,
): number | null {
  if (span <= 0 || span > DMX_UNIVERSE_SIZE) return null

  const taken = new Uint8Array(DMX_UNIVERSE_SIZE + 1)
  for (const print of footprints(fixtures, types)) {
    if (print.universe !== universe || print.fixtureId === excludeId) continue
    const last = Math.min(print.to, DMX_UNIVERSE_SIZE)
    for (let channel = print.from; channel <= last; channel++) taken[channel] = 1
  }

  let run = 0
  for (let channel = Math.max(1, from); channel <= DMX_UNIVERSE_SIZE; channel++) {
    run = taken[channel] ? 0 : run + 1
    if (run === span) return channel - span + 1
  }
  return null
}

/** Channels used per universe, for the rig summary line. */
export function universeUsage(
  fixtures: FixtureInstance[],
  types: FixtureType[],
): Array<{ universe: number; used: number }> {
  const used = new Map<number, Set<number>>()
  for (const print of footprints(fixtures, types)) {
    let set = used.get(print.universe)
    if (!set) {
      set = new Set()
      used.set(print.universe, set)
    }
    const last = Math.min(print.to, DMX_UNIVERSE_SIZE)
    for (let channel = print.from; channel <= last; channel++) set.add(channel)
  }
  return [...used.entries()]
    .map(([universe, set]) => ({ universe, used: set.size }))
    .sort((a, b) => a.universe - b.universe)
}

/** Sorts a copy of the rig by universe then channel. */
export function sortFixturesByAddress(fixtures: FixtureInstance[]): FixtureInstance[] {
  return [...fixtures].sort((a, b) =>
    a.address.universe === b.address.universe
      ? a.address.channel - b.address.channel
      : a.address.universe - b.address.universe,
  )
}

/**
 * Everything known about each occupied channel: which fixtures sit on it, what it does for
 * each, and which mappings drive it. Uses the same rules as the compiler, so the channel
 * map tells the truth about what the write loop does.
 */
export function describeChannels(
  fixtures: FixtureInstance[],
  types: FixtureType[],
  mappings: Mapping[],
): Map<number, ChannelInfo> {
  // Mapping names per fixture head, so each channel can look up who drives it.
  const drivers = new Map<string, string[]>()
  for (const mapping of mappings) {
    if (mapping.enabled === false || !mapping.source) continue
    for (const { fixture, head } of mappingHeads(mapping, fixtures, types)) {
      const k = `${fixture.id}#${head}`
      const list = drivers.get(k) ?? []
      list.push(mappingTitle(mapping))
      drivers.set(k, list)
    }
  }

  const out = new Map<number, ChannelInfo>()
  for (const fixture of fixtures) {
    if (fixture.enabled === false) continue
    const resolved = fixtureMode(fixture, types)
    if (!resolved) continue
    const { type, mode } = resolved
    const produced = drivenFields(mode)

    mode.channels.forEach((channel, i) => {
      const dmx = fixture.address.channel + i
      if (dmx > DMX_UNIVERSE_SIZE) return
      const head = channelHead(mode, channel)
      const driven =
        channel.field && produced.has(channel.field) && head !== undefined
          ? (drivers.get(`${fixture.id}#${head}`) ?? [])
          : []

      const k = channelKey(fixture.address.universe, dmx)
      const info = out.get(k) ?? { uses: [], drivers: 0 }
      info.uses.push({
        fixtureId: fixture.id,
        fixtureName: fixture.name || fixture.id,
        typeName: [type.manufacturer, type.name].filter(Boolean).join(' '),
        modeName: mode.name,
        start: fixture.address,
        index: i + 1,
        label: channelLabel(type, mode, i),
        description: channel.description,
        defaultValue: channel.default ?? 0,
        ...(channel.bits === 16 ? { part: channel.part ?? 'coarse' } : {}),
        drivenBy: driven,
      })
      info.drivers += driven.length
      out.set(k, info)
    })
  }
  return out
}

export function formatAddress(address: Address): string {
  return address.universe === 0 ? `${address.channel}` : `${address.universe}:${address.channel}`
}
