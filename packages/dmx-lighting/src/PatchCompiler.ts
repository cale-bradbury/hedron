import { DMX_UNIVERSE_SIZE } from './address'
import { FIELD_OFFSET, PIXEL_STRIDE, PixelSource, SourceRegistry } from './PixelSource'
import { findMode, findProfile, FixtureProfile, PatchEntry } from './profiles'
import type { ChannelSlot } from './types'
import type { UniverseSet } from './UniverseSet'

const OP_CONST = 0
const OP_FIELD = 1

/**
 * The patch flattened into one entry per output byte, so the per-frame loop does no
 * lookups, allocation or slot-shape branching. Rebuilt only when config changes.
 */
export interface CompiledPatch {
  writeCount: number
  sources: PixelSource[]
  /** Index into `sources` for OP_FIELD writes. */
  sourceIdx: Int32Array
  /** Float index of the source pixel's first field. */
  srcOffset: Int32Array
  fieldOffset: Uint8Array
  op: Uint8Array
  constValue: Uint8Array
  scale: Float32Array
  /** 1 when global brightness applies; intensity and absolute slots opt out. */
  useBrightness: Uint8Array
  universe: Int32Array
  channel: Int32Array
}

interface PendingWrite {
  op: number
  sourceIdx: number
  srcOffset: number
  fieldOffset: number
  constValue: number
  scale: number
  useBrightness: number
  universe: number
  channel: number
}

/** Turns one slot into a pending write, or null when it lands outside the universe. */
function planSlot(
  slot: ChannelSlot | undefined,
  universe: number,
  channel: number,
  sourceIdx: number,
  srcOffset: number,
): PendingWrite | null {
  if (channel < 1 || channel > DMX_UNIVERSE_SIZE) return null

  const base = {
    sourceIdx,
    srcOffset,
    fieldOffset: 0,
    constValue: 0,
    scale: 1,
    useBrightness: 0,
    universe,
    channel,
  }

  if (slot === null || slot === undefined) return { ...base, op: OP_CONST }

  if (typeof slot === 'string') {
    return {
      ...base,
      op: OP_FIELD,
      fieldOffset: FIELD_OFFSET[slot],
      useBrightness: slot === 'intensity' ? 0 : 1,
    }
  }

  if ('absolute' in slot) {
    return { ...base, op: OP_CONST, constValue: Math.min(255, Math.max(0, slot.absolute)) }
  }

  return {
    ...base,
    op: OP_FIELD,
    fieldOffset: FIELD_OFFSET[slot.field],
    scale: slot.scale ?? 1,
    useBrightness: slot.field === 'intensity' ? 0 : 1,
  }
}

export function compilePatch(
  entries: PatchEntry[],
  profiles: FixtureProfile[],
  registry: SourceRegistry,
): CompiledPatch {
  const writes: PendingWrite[] = []
  const sources: PixelSource[] = []
  const sourceIndexById = new Map<string, number>()

  const sourceIndex = (id: string, pixelCount: number): number => {
    const existing = sourceIndexById.get(id)
    if (existing !== undefined) return existing
    // A source the sketch has not created yet is stubbed at the fixture's size so the
    // patch is still valid; the sketch resizes it when it first writes.
    const source = registry.ensure(id, registry.get(id) ? undefined : pixelCount)
    const index = sources.push(source) - 1
    sourceIndexById.set(id, index)
    return index
  }

  for (const entry of entries) {
    if (entry.enabled === false) continue

    const profile = findProfile(profiles, entry.profileId)
    if (!profile) continue
    const mode = findMode(profile, entry.modeName)
    if (!mode) continue

    const pixels = Math.max(0, Math.floor(entry.tap.count ?? mode.pixelCount))
    const stride = mode.pixelStride ?? mode.pixel.length
    const headerLength = mode.header?.length ?? 0
    const offset = Math.max(0, Math.floor(entry.tap.offset ?? 0))

    const srcIdx = sourceIndex(entry.tap.source, pixels)
    const source = sources[srcIdx]
    const lastPixel = source.pixelCount - 1

    for (const address of entry.addresses) {
      mode.header?.forEach((slot, i) => {
        const write = planSlot(slot, address.universe, address.channel + i, srcIdx, 0)
        if (write) writes.push(write)
      })

      for (let p = 0; p < pixels; p++) {
        // Phase 1 clamps past the end of the source, so a 1-pixel source broadcasts to
        // every pixel of a fixture. Wrapping arrives with the full tap transforms.
        const srcPixel = Math.min(offset + p, lastPixel)
        const srcOffset = srcPixel * PIXEL_STRIDE
        const base = address.channel + headerLength + p * stride

        for (let si = 0; si < mode.pixel.length; si++) {
          const write = planSlot(mode.pixel[si], address.universe, base + si, srcIdx, srcOffset)
          if (write) writes.push(write)
        }
      }
    }
  }

  const n = writes.length
  const compiled: CompiledPatch = {
    writeCount: n,
    sources,
    sourceIdx: new Int32Array(n),
    srcOffset: new Int32Array(n),
    fieldOffset: new Uint8Array(n),
    op: new Uint8Array(n),
    constValue: new Uint8Array(n),
    scale: new Float32Array(n),
    useBrightness: new Uint8Array(n),
    universe: new Int32Array(n),
    channel: new Int32Array(n),
  }

  for (let i = 0; i < n; i++) {
    const w = writes[i]
    compiled.sourceIdx[i] = w.sourceIdx
    compiled.srcOffset[i] = w.srcOffset
    compiled.fieldOffset[i] = w.fieldOffset
    compiled.op[i] = w.op
    compiled.constValue[i] = w.constValue
    compiled.scale[i] = w.scale
    compiled.useBrightness[i] = w.useBrightness
    compiled.universe[i] = w.universe
    compiled.channel[i] = w.channel
  }

  return compiled
}

/** Addresses written by more than one patch entry, for conflict reporting in the UI. */
export function findAddressConflicts(compiled: CompiledPatch): Array<{
  universe: number
  channel: number
}> {
  const seen = new Set<number>()
  const clashes = new Map<number, { universe: number; channel: number }>()
  for (let i = 0; i < compiled.writeCount; i++) {
    const key = compiled.universe[i] * (DMX_UNIVERSE_SIZE + 1) + compiled.channel[i]
    if (seen.has(key)) {
      clashes.set(key, { universe: compiled.universe[i], channel: compiled.channel[i] })
    }
    seen.add(key)
  }
  return [...clashes.values()]
}

/** Executes a compiled patch into the universe buffers; the whole per-frame hot path. */
export function executePatch(
  compiled: CompiledPatch,
  universes: UniverseSet,
  brightness: number,
): void {
  for (let i = 0; i < compiled.writeCount; i++) {
    let value: number
    if (compiled.op[i] === OP_FIELD) {
      const data = compiled.sources[compiled.sourceIdx[i]].current
      value = data[compiled.srcOffset[i] + compiled.fieldOffset[i]] * compiled.scale[i]
      if (compiled.useBrightness[i]) value *= brightness
    } else {
      value = compiled.constValue[i]
    }
    universes.write(compiled.universe[i], compiled.channel[i], value)
  }
}
