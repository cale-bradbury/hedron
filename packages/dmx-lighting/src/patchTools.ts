import { Address, DMX_UNIVERSE_SIZE } from './address'
import { findMode, findProfile, FixtureProfile, modeChannelCount, PatchEntry } from './profiles'

/** One contiguous run of channels a patch entry occupies at one of its addresses. */
export interface Footprint {
  entryId: string
  name: string
  universe: number
  /** 1-based, inclusive. */
  from: number
  to: number
  /** True when the run would run past the end of its universe. */
  overflows: boolean
}

const key = (universe: number, channel: number) => universe * (DMX_UNIVERSE_SIZE + 1) + channel

/** Channels one instance of this entry occupies, given its profile, mode and pixel count. */
export function entryChannelSpan(entry: PatchEntry, profiles: FixtureProfile[]): number {
  const profile = findProfile(profiles, entry.profileId)
  if (!profile) return 0
  const mode = findMode(profile, entry.modeName)
  if (!mode) return 0
  const pixels = Math.max(0, Math.floor(entry.tap.count ?? mode.pixelCount))
  return modeChannelCount(mode, pixels)
}

/** Every run of channels the patch occupies, one per entry per address. */
export function footprints(
  patch: PatchEntry[],
  profiles: FixtureProfile[],
  options: { includeDisabled?: boolean } = {},
): Footprint[] {
  const out: Footprint[] = []
  for (const entry of patch) {
    if (entry.enabled === false && !options.includeDisabled) continue
    const span = entryChannelSpan(entry, profiles)
    if (span === 0) continue
    for (const address of entry.addresses) {
      out.push({
        entryId: entry.id,
        name: entry.name || entry.id,
        universe: address.universe,
        from: address.channel,
        to: address.channel + span - 1,
        overflows: address.channel + span - 1 > DMX_UNIVERSE_SIZE,
      })
    }
  }
  return out
}

/** Which entries claim each channel, for heatmap hover and per-entry conflict flags. */
export function channelOwners(
  patch: PatchEntry[],
  profiles: FixtureProfile[],
): Map<number, Footprint[]> {
  const owners = new Map<number, Footprint[]>()
  for (const print of footprints(patch, profiles)) {
    const last = Math.min(print.to, DMX_UNIVERSE_SIZE)
    for (let channel = print.from; channel <= last; channel++) {
      const k = key(print.universe, channel)
      const list = owners.get(k)
      if (list) list.push(print)
      else owners.set(k, [print])
    }
  }
  return owners
}

/** Entry ids that overlap another entry, so the table can flag the rows themselves. */
export function conflictingEntryIds(patch: PatchEntry[], profiles: FixtureProfile[]): Set<string> {
  const clashing = new Set<string>()
  for (const list of channelOwners(patch, profiles).values()) {
    if (list.length < 2) continue
    for (const print of list) clashing.add(print.entryId)
  }
  return clashing
}

/**
 * First channel in `universe` with `span` free channels after it, ignoring the entry being
 * placed so re-addressing it does not collide with where it already sits.
 */
export function findNextFreeAddress(
  patch: PatchEntry[],
  profiles: FixtureProfile[],
  universe: number,
  span: number,
  excludeEntryId?: string,
): number | null {
  if (span <= 0 || span > DMX_UNIVERSE_SIZE) return null

  const taken = new Uint8Array(DMX_UNIVERSE_SIZE + 1)
  for (const print of footprints(patch, profiles)) {
    if (print.universe !== universe || print.entryId === excludeEntryId) continue
    const last = Math.min(print.to, DMX_UNIVERSE_SIZE)
    for (let channel = print.from; channel <= last; channel++) taken[channel] = 1
  }

  let run = 0
  for (let channel = 1; channel <= DMX_UNIVERSE_SIZE; channel++) {
    run = taken[channel] ? 0 : run + 1
    if (run === span) return channel - span + 1
  }
  return null
}

/** Channels used and free per universe, for the patch summary line. */
export function universeUsage(
  patch: PatchEntry[],
  profiles: FixtureProfile[],
): Array<{ universe: number; used: number }> {
  const used = new Map<number, Set<number>>()
  for (const print of footprints(patch, profiles)) {
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

/** Sorts a copy of the patch by universe then channel, unaddressed entries last. */
export function sortPatchByAddress(patch: PatchEntry[]): PatchEntry[] {
  const rank = (entry: PatchEntry): [number, number] => {
    const first = entry.addresses[0]
    return first ? [first.universe, first.channel] : [Infinity, Infinity]
  }
  return [...patch].sort((a, b) => {
    const [au, ac] = rank(a)
    const [bu, bc] = rank(b)
    return au === bu ? ac - bc : au - bu
  })
}

export function formatAddress(address: Address): string {
  return address.universe === 0 ? `${address.channel}` : `${address.universe}:${address.channel}`
}
