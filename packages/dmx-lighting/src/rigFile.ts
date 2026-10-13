import type { ChannelOverride, FixtureInstance, FixtureType, Mapping } from './fixtures'
import type { StageBounds } from './layout'
import { normalizeTypes } from './library'
import { MixSource, normalizeMixes } from './mixer'

export const RIG_FILE_VERSION = 2

/**
 * A portable rig: the fixtures hung, how sketches map onto them, and the stage they were
 * measured against. Carries the types it uses so it loads on a machine without them.
 */
export interface RigFile {
  version: number
  stage: StageBounds
  types: FixtureType[]
  fixtures: FixtureInstance[]
  mappings: Mapping[]
  mixes: MixSource[]
  overrides: ChannelOverride[]
}

export function buildRigFile(
  library: FixtureType[],
  fixtures: FixtureInstance[],
  mappings: Mapping[],
  stage: StageBounds,
  mixes: MixSource[] = [],
  overrides: ChannelOverride[] = [],
): RigFile {
  const used = new Set(fixtures.map((f) => f.typeId))
  return {
    version: RIG_FILE_VERSION,
    stage,
    types: library.filter((t) => used.has(t.id)),
    fixtures,
    mappings,
    mixes,
    overrides,
  }
}

/** Parses a rig file, returning null rather than throwing on anything unusable. */
export function parseRigFile(json: string): RigFile | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch (_) {
    return null
  }

  if (!parsed || typeof parsed !== 'object') return null
  const rig = parsed as Partial<RigFile>
  if (!Array.isArray(rig.fixtures) || !Array.isArray(rig.mappings)) return null

  return {
    version: typeof rig.version === 'number' ? rig.version : RIG_FILE_VERSION,
    stage:
      rig.stage && typeof rig.stage.width === 'number' && typeof rig.stage.depth === 'number'
        ? rig.stage
        : { width: 10, depth: 10 },
    types: normalizeTypes(rig.types),
    fixtures: rig.fixtures,
    mappings: rig.mappings,
    mixes: normalizeMixes(rig.mixes),
    overrides: normalizeOverrides(rig.overrides),
  }
}

export function normalizeOverrides(raw: unknown): ChannelOverride[] {
  if (!Array.isArray(raw)) return []
  return raw
    .filter((o) => o && Number.isInteger(o.universe) && Number.isInteger(o.channel))
    .map((o) => {
      const wide = o.bits === 16
      return {
        universe: o.universe,
        channel: o.channel,
        value: Math.min(wide ? 1 : 255, Math.max(0, Number(o.value) || 0)),
        ...(wide ? { bits: 16 as const } : {}),
      }
    })
}
