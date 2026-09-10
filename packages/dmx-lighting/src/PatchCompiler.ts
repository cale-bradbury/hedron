import { DMX_UNIVERSE_SIZE } from './address'
import { Encoder, makeEncoder } from './encoders'
import { FieldTable } from './fields'
import { PIXEL_STRIDE, PixelSource, SourceRegistry } from './PixelSource'
import { findMode, findProfile, FixtureProfile, PatchEntry, Tap } from './profiles'
import type { ChannelSlot } from './types'
import type { UniverseSet } from './UniverseSet'

const OP_CONST = 0
const OP_FIELD = 1
/** Top and bottom bytes of a 16-bit field, for movers and fine dimmers. */
const OP_FIELD_COARSE = 2
const OP_FIELD_FINE = 3

const FILTER_NEAREST = 0
const FILTER_LINEAR = 1
const FILTER_AVERAGE = 2

/**
 * One patch entry's tap, precompiled. `basePositions` holds the source position of each
 * output pixel with the arrangement already baked in, so a frame only adds the offset.
 */
export interface CompiledTap {
  entryId: string
  source: PixelSource
  /** First pixel of this entry's slice of `resolved`. */
  outPixel: number
  pixels: number
  basePositions: Float32Array
  /** Source pixels each output pixel covers; the width `average` means over. */
  sampleSpan: number
  filter: number
  wrap: boolean
  /** Turns a sampled colour into this mode's device fields. */
  encode: Encoder
  /** Set before each resolve; seeded from the tap and overridden by the param node. */
  offset: number
  gain: number
}

/**
 * The patch flattened into one entry per output byte, so the per-frame loop does no
 * lookups, allocation or slot-shape branching. Rebuilt only when config changes.
 */
export interface CompiledPatch {
  writeCount: number
  sources: PixelSource[]
  taps: CompiledTap[]
  /** Field name to index within a resolved pixel. */
  fields: FieldTable
  /** Floats per resolved pixel — the field count, not the source stride. */
  fieldStride: number
  /** Every entry's encoded pixels, concatenated; what the write loop reads. */
  resolved: Float32Array
  /** Float index into `resolved` of the pixel's first field. */
  srcOffset: Int32Array
  fieldOffset: Int32Array
  op: Uint8Array
  constValue: Uint8Array
  scale: Float32Array
  universe: Int32Array
  channel: Int32Array
  /** Per-channel quantisation error carried into the next frame when dithering. */
  residual: Float32Array
}

interface PendingWrite {
  op: number
  srcOffset: number
  fieldOffset: number
  constValue: number
  scale: number
  universe: number
  channel: number
}

/** Turns one slot into a pending write, or null when it lands outside the universe. */
function planSlot(
  slot: ChannelSlot | undefined,
  universe: number,
  channel: number,
  srcOffset: number,
  fields: FieldTable,
): PendingWrite | null {
  if (channel < 1 || channel > DMX_UNIVERSE_SIZE) return null

  const base = {
    srcOffset,
    fieldOffset: 0,
    constValue: 0,
    scale: 1,
    universe,
    channel,
  }

  if (slot === null || slot === undefined) return { ...base, op: OP_CONST }

  if (typeof slot === 'string') {
    return { ...base, op: OP_FIELD, fieldOffset: fields.index(slot) }
  }

  if ('absolute' in slot) {
    return { ...base, op: OP_CONST, constValue: Math.min(255, Math.max(0, slot.absolute)) }
  }

  const wide = slot.bits === 16
  return {
    ...base,
    op: wide ? (slot.part === 'fine' ? OP_FIELD_FINE : OP_FIELD_COARSE) : OP_FIELD,
    fieldOffset: fields.index(slot.field),
    scale: slot.scale ?? 1,
  }
}

/** Maps a physical pixel index to the logical one it displays. */
function logicalIndex(p: number, pixels: number, tap: Tap): number {
  if (tap.arrangement === 'reverse') return pixels - 1 - p
  if (tap.arrangement === 'serpentine') {
    const size = Math.max(1, Math.floor(tap.segmentSize || pixels))
    const segment = Math.floor(p / size)
    const within = p % size
    // Odd segments run backwards, which is how zig-zag wiring and folded bars are built.
    return segment * size + (segment % 2 === 1 ? size - 1 - within : within)
  }
  return p
}

function filterCode(filter: Tap['filter']): number {
  if (filter === 'linear') return FILTER_LINEAR
  if (filter === 'average') return FILTER_AVERAGE
  return FILTER_NEAREST
}

function buildTap(
  entry: PatchEntry,
  source: PixelSource,
  pixels: number,
  outPixel: number,
  encode: Encoder,
): CompiledTap {
  const tap = entry.tap
  const step = tap.step ?? 1
  // `clip` walks the source a step at a time; `stretch` divides it across the fixture.
  const spacing = tap.fit === 'stretch' ? source.pixelCount / Math.max(1, pixels) : step

  const basePositions = new Float32Array(pixels)
  for (let p = 0; p < pixels; p++) {
    basePositions[p] = logicalIndex(p, pixels, tap) * spacing
  }

  return {
    entryId: entry.id,
    source,
    outPixel,
    pixels,
    basePositions,
    sampleSpan: Math.abs(spacing),
    filter: filterCode(tap.filter),
    wrap: tap.wrap === true,
    encode,
    offset: tap.offset ?? 0,
    gain: entry.gain ?? 1,
  }
}

export function compilePatch(
  entries: PatchEntry[],
  profiles: FixtureProfile[],
  registry: SourceRegistry,
): CompiledPatch {
  const writes: PendingWrite[] = []
  const sources: PixelSource[] = []
  const taps: CompiledTap[] = []
  const sourcesById = new Map<string, PixelSource>()
  const fields = new FieldTable()
  let resolvedPixels = 0

  const sourceFor = (id: string, pixelCount: number): PixelSource => {
    const existing = sourcesById.get(id)
    if (existing) return existing
    // A source the sketch has not created yet is stubbed at the fixture's size so the
    // patch is still valid; the sketch resizes it when it first writes.
    const source = registry.ensure(id, registry.get(id) ? undefined : pixelCount)
    sourcesById.set(id, source)
    sources.push(source)
    return source
  }

  // Two passes: the first fixes the field table so every resolved pixel is the same
  // width, the second lays out writes against it.
  interface Planned {
    entry: PatchEntry
    mode: ReturnType<typeof findMode>
    pixels: number
    source: PixelSource
    encode: Encoder
  }
  const planned: Planned[] = []

  for (const entry of entries) {
    if (entry.enabled === false) continue

    const profile = findProfile(profiles, entry.profileId)
    if (!profile) continue
    const mode = findMode(profile, entry.modeName)
    if (!mode) continue

    const pixels = Math.max(0, Math.floor(entry.tap.count ?? mode.pixelCount))
    if (pixels === 0) continue

    const source = sourceFor(entry.tap.source, pixels)
    const encode = makeEncoder(mode.encoder, fields)
    for (const slot of mode.pixel) if (typeof slot === 'string') fields.index(slot)
    for (const slot of mode.header ?? []) if (typeof slot === 'string') fields.index(slot)

    planned.push({ entry, mode, pixels, source, encode })
  }

  const fieldStride = fields.size

  for (const { entry, mode, pixels, source, encode } of planned) {
    if (!mode) continue
    const stride = mode.pixelStride ?? mode.pixel.length
    const headerLength = mode.header?.length ?? 0

    const tap = buildTap(entry, source, pixels, resolvedPixels, encode)
    taps.push(tap)
    resolvedPixels += pixels

    for (const address of entry.addresses) {
      mode.header?.forEach((slot, i) => {
        const write = planSlot(
          slot,
          address.universe,
          address.channel + i,
          tap.outPixel * fieldStride,
          fields,
        )
        if (write) writes.push(write)
      })

      for (let p = 0; p < pixels; p++) {
        const srcOffset = (tap.outPixel + p) * fieldStride
        const base = address.channel + headerLength + p * stride

        for (let si = 0; si < mode.pixel.length; si++) {
          const write = planSlot(mode.pixel[si], address.universe, base + si, srcOffset, fields)
          if (write) writes.push(write)
        }
      }
    }
  }

  const n = writes.length
  const compiled: CompiledPatch = {
    writeCount: n,
    sources,
    taps,
    fields,
    fieldStride,
    resolved: new Float32Array(resolvedPixels * fieldStride),
    srcOffset: new Int32Array(n),
    fieldOffset: new Int32Array(n),
    op: new Uint8Array(n),
    constValue: new Uint8Array(n),
    scale: new Float32Array(n),
    universe: new Int32Array(n),
    channel: new Int32Array(n),
    residual: new Float32Array(n),
  }

  for (let i = 0; i < n; i++) {
    const w = writes[i]
    compiled.srcOffset[i] = w.srcOffset
    compiled.fieldOffset[i] = w.fieldOffset
    compiled.op[i] = w.op
    compiled.constValue[i] = w.constValue
    compiled.scale[i] = w.scale
    compiled.universe[i] = w.universe
    compiled.channel[i] = w.channel
  }

  return compiled
}

function wrapIndex(index: number, length: number): number {
  const m = index % length
  return m < 0 ? m + length : m
}

function clampIndex(index: number, length: number): number {
  return index < 0 ? 0 : index > length - 1 ? length - 1 : index
}

function sourceIndexAt(position: number, length: number, wrap: boolean): number {
  return wrap ? wrapIndex(position, length) : clampIndex(position, length)
}

/** Scratch for one sampled pixel; resolve is synchronous, so a shared buffer is safe. */
const sampled = new Float32Array(PIXEL_STRIDE)

/**
 * Samples every tap, applies gain and master brightness, and encodes the result into
 * `resolved`. Runs once per frame, before the write loop.
 *
 * Brightness scales the colour rather than the intensity field, which is what keeps an
 * RGBW+intensity fixture from dimming twice. Encoders that drive a dimmer channel derive
 * it from the already-scaled colour, so brightness still reaches those fixtures.
 */
export function resolveTaps(compiled: CompiledPatch, brightness = 1): void {
  const out = compiled.resolved
  const stride = compiled.fieldStride

  for (const tap of compiled.taps) {
    const src = tap.source.current
    const length = tap.source.pixelCount
    const colourScale = tap.gain * brightness

    for (let p = 0; p < tap.pixels; p++) {
      const position = tap.basePositions[p] + tap.offset

      if (tap.filter === FILTER_LINEAR) {
        const floor = Math.floor(position)
        const frac = position - floor
        const a = sourceIndexAt(floor, length, tap.wrap) * PIXEL_STRIDE
        const b = sourceIndexAt(floor + 1, length, tap.wrap) * PIXEL_STRIDE
        for (let f = 0; f < PIXEL_STRIDE; f++) {
          sampled[f] = src[a + f] + (src[b + f] - src[a + f]) * frac
        }
      } else if (tap.filter === FILTER_AVERAGE) {
        const count = Math.max(1, Math.round(tap.sampleSpan))
        const start = Math.floor(position)
        for (let f = 0; f < PIXEL_STRIDE; f++) sampled[f] = 0
        for (let sIdx = 0; sIdx < count; sIdx++) {
          const a = sourceIndexAt(start + sIdx, length, tap.wrap) * PIXEL_STRIDE
          for (let f = 0; f < PIXEL_STRIDE; f++) sampled[f] += src[a + f]
        }
        for (let f = 0; f < PIXEL_STRIDE; f++) sampled[f] /= count
      } else {
        // Floor, not round: a position identifies a point in source space, and the pixel
        // containing it is the one it lands in. Round would bias a stretch off by half.
        const a = sourceIndexAt(Math.floor(position), length, tap.wrap) * PIXEL_STRIDE
        for (let f = 0; f < PIXEL_STRIDE; f++) sampled[f] = src[a + f]
      }

      if (colourScale !== 1) {
        sampled[0] *= colourScale
        sampled[1] *= colourScale
        sampled[2] *= colourScale
        sampled[3] *= colourScale
      }

      tap.encode(sampled, 0, out, (tap.outPixel + p) * stride)
    }
  }
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

/**
 * Executes a compiled patch into the universe buffers; the whole per-frame hot path.
 * Reads the encoded pixels, so `resolveTaps` must have run for this frame.
 *
 * With `dither`, the fraction a channel loses to 8-bit rounding is carried into the next
 * frame, so a value of 100.25 alternates 100/100/100/101 and averages to 100.25 over time.
 * Trades a 1-LSB flutter at the refresh rate for effective sub-byte resolution. A 16-bit
 * pair already has that resolution, so its coarse byte is never dithered.
 */
export function executePatch(
  compiled: CompiledPatch,
  universes: UniverseSet,
  dither = false,
): void {
  const resolved = compiled.resolved

  for (let i = 0; i < compiled.writeCount; i++) {
    const op = compiled.op[i]
    let value: number
    let ditherThis = dither

    if (op === OP_CONST) {
      value = compiled.constValue[i]
    } else {
      const raw = resolved[compiled.srcOffset[i] + compiled.fieldOffset[i]] * compiled.scale[i]
      if (op === OP_FIELD) {
        value = raw
      } else {
        const wide = Math.max(0, Math.min(65535, Math.round((raw / 255) * 65535)))
        if (op === OP_FIELD_COARSE) {
          value = wide >> 8
          ditherThis = false
        } else {
          value = wide & 255
        }
      }
    }

    if (ditherThis) {
      const wanted = value + compiled.residual[i]
      const rounded = wanted < 0 ? 0 : wanted > 255 ? 255 : Math.round(wanted)
      // Clamped so a saturated channel cannot accumulate an unbounded debt.
      const error = wanted - rounded
      compiled.residual[i] = error < -1 ? -1 : error > 1 ? 1 : error
      value = rounded
    } else if (compiled.residual[i] !== 0) {
      compiled.residual[i] = 0
    }

    universes.write(compiled.universe[i], compiled.channel[i], value)
  }
}
