import type { FixtureProfile, PatchEntry } from './profiles'
import type { StageBounds } from './layout'
import { MixSource, normalizeMixes } from './mixer'

export const RIG_FILE_VERSION = 1

/** A portable rig: the profiles, the patch, its mixes and the stage it was measured against. */
export interface RigFile {
  version: number
  stage: StageBounds
  profiles: FixtureProfile[]
  patch: PatchEntry[]
  /** Absent in rigs saved before mixes existed, so importing one leaves current mixes alone. */
  mixes?: MixSource[]
}

export function buildRigFile(
  profiles: FixtureProfile[],
  patch: PatchEntry[],
  stage: StageBounds,
  mixes: MixSource[] = [],
): RigFile {
  return { version: RIG_FILE_VERSION, stage, profiles, patch, mixes }
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
  if (!Array.isArray(rig.profiles) || !Array.isArray(rig.patch)) return null

  return {
    version: typeof rig.version === 'number' ? rig.version : RIG_FILE_VERSION,
    stage:
      rig.stage && typeof rig.stage.width === 'number' && typeof rig.stage.depth === 'number'
        ? rig.stage
        : { width: 10, depth: 10 },
    profiles: rig.profiles,
    patch: rig.patch,
    mixes: Array.isArray(rig.mixes) ? normalizeMixes(rig.mixes) : undefined,
  }
}
