import { DMX_UNIVERSE_SIZE } from './address'
import { Encoder, makeEncoder } from './encoders'
import { FieldTable } from './fields'
import {
  channelHead,
  drivenFields,
  findMode,
  findType,
  FixtureInstance,
  FixtureMode,
  FixtureType,
  IdentifyTarget,
  Mapping,
  mappingHeads,
  modeHeadCount,
  TapArrangement,
  TapFilter,
} from './fixtures'
import { DEFAULT_STAGE, pixelWorldPositions, placementOf, StageBounds, worldToUv } from './layout'
import { PIXEL_STRIDE, PixelSource, SourceRegistry } from './PixelSource'
import type { UniverseSet } from './UniverseSet'

const OP_CONST = 0
const OP_FIELD = 1
/** Top and bottom bytes of a 16-bit field, for movers and fine dimmers. */
const OP_FIELD_COARSE = 2
const OP_FIELD_FINE = 3

/**
 * Who gets a channel when several things write it: the highest layer wins outright, and
 * within a layer the highest value wins. Defaults only show where nothing drives a channel.
 */
export const LAYER_DEFAULT = 0
export const LAYER_DRIVEN = 1
export const LAYER_OVERRIDE = 2
export const LAYER_IDENTIFY = 3

const FILTER_NEAREST = 0
const FILTER_LINEAR = 1
const FILTER_AVERAGE = 2

const REDUCE_NONE = -1
const REDUCE_AVERAGE = 0
const REDUCE_BRIGHTEST = 1
const REDUCE_DARKEST = 2

/** One mapping, precompiled: where each of its heads reads from and how it encodes. */
export interface CompiledMapping {
  mappingId: string
  source: PixelSource
  /** Heads driven, which is the number of colours sampled for `spread`. */
  heads: number
  /** First of this mapping's slots in `resolved`; one slot per head. */
  firstSlot: number
  reduce: number
  /** Source position of each head with the arrangement baked in; spread only. */
  basePositions: Float32Array
  /** Source pixels each head covers; the width `average` filtering means over. */
  sampleSpan: number
  /** Source pixels a reduce collapses. */
  span: number
  filter: number
  wrap: boolean
  /** Stage UV of each head, precomputed from placement; null when not spatial. */
  spatialUv: Float32Array | null
  /** Each head's encoder, from the mode of the fixture it sits on. */
  encoders: Encoder[]
  /** Colour sent to each head after gain and brightness, before encoding; for previews. */
  colours: Float32Array
  fixtureIds: string[]
  headIndex: Int32Array
  /** Set before each resolve; seeded from the mapping and overridden by its param nodes. */
  offset: number
  gain: number
}

/**
 * The rig flattened into one entry per output byte, so the per-frame loop does no lookups,
 * allocation or shape branching. Rebuilt only when config or source shapes change.
 */
export interface CompiledRig {
  writeCount: number
  sources: PixelSource[]
  mappings: CompiledMapping[]
  /** Slots that flash for identify, with their encoders; empty when nothing is identified. */
  identifySlots: number[]
  identifyEncoders: Encoder[]
  fields: FieldTable
  /** Floats per resolved slot — the field count. */
  fieldStride: number
  /** Every slot's encoded fields, concatenated; what the write loop reads. */
  resolved: Float32Array
  srcOffset: Int32Array
  fieldOffset: Int32Array
  op: Uint8Array
  constValue: Uint8Array
  layer: Uint8Array
  universe: Int32Array
  channel: Int32Array
  /** Per-write quantisation error carried into the next frame when dithering. */
  residual: Float32Array
  /** Universes the rig writes to. */
  universes: number[]
}

interface PendingWrite {
  op: number
  srcOffset: number
  fieldOffset: number
  constValue: number
  layer: number
  universe: number
  channel: number
}

interface ActiveFixture {
  fixture: FixtureInstance
  type: FixtureType
  mode: FixtureMode
  encode: Encoder
  produced: Set<string>
}

/** Maps a physical head index to the logical one it displays. */
function logicalIndex(
  p: number,
  count: number,
  arrangement: TapArrangement | undefined,
  segmentSize: number | undefined,
): number {
  if (arrangement === 'reverse') return count - 1 - p
  if (arrangement === 'serpentine') {
    const size = Math.max(1, Math.floor(segmentSize || count))
    const segment = Math.floor(p / size)
    const within = p % size
    // Odd segments run backwards, which is how zig-zag wiring and folded bars are built.
    return segment * size + (segment % 2 === 1 ? size - 1 - within : within)
  }
  return p
}

function filterCode(filter: TapFilter | undefined): number {
  if (filter === 'linear') return FILTER_LINEAR
  if (filter === 'average') return FILTER_AVERAGE
  return FILTER_NEAREST
}

function reduceCode(mapping: Mapping): number {
  if (mapping.kind !== 'reduce') return REDUCE_NONE
  if (mapping.reduce === 'brightest') return REDUCE_BRIGHTEST
  if (mapping.reduce === 'darkest') return REDUCE_DARKEST
  return REDUCE_AVERAGE
}

export function compileRig(
  fixtures: FixtureInstance[],
  types: FixtureType[],
  mappings: Mapping[],
  registry: SourceRegistry,
  stage: StageBounds = DEFAULT_STAGE,
  identify: IdentifyTarget | null = null,
): CompiledRig {
  const fields = new FieldTable()
  const active = new Map<string, ActiveFixture>()

  // First pass fixes the field table, so every resolved slot is the same width.
  for (const fixture of fixtures) {
    if (fixture.enabled === false) continue
    const type = findType(types, fixture.typeId)
    const mode = type ? findMode(type, fixture.modeName) : undefined
    if (!type || !mode) continue
    const encode = makeEncoder(mode.encoder, fields)
    for (const channel of mode.channels) if (channel.field) fields.index(channel.field)
    active.set(fixture.id, { fixture, type, mode, encode, produced: drivenFields(mode) })
  }

  const fieldStride = fields.size
  const writes: PendingWrite[] = []
  const sources: PixelSource[] = []
  const sourcesById = new Map<string, PixelSource>()
  const compiledMappings: CompiledMapping[] = []
  let slots = 0

  const sourceFor = (id: string, pixelCount: number): PixelSource => {
    const existing = sourcesById.get(id)
    if (existing) return existing
    // A source the sketch has not created yet is stubbed at the mapping's size so the rig
    // is still valid; the sketch resizes it when it first writes.
    const source = registry.ensure(id, registry.get(id) ? undefined : pixelCount)
    sourcesById.set(id, source)
    sources.push(source)
    return source
  }

  /** Writes for every channel of one head that its encoder produces, reading `slot`. */
  const planHead = (fx: ActiveFixture, head: number, slot: number, layer: number) => {
    const { mode, fixture } = fx
    mode.channels.forEach((channel, i) => {
      if (!channel.field || !fx.produced.has(channel.field)) return
      if (channelHead(mode, channel) !== head) return
      const dmx = fixture.address.channel + i
      if (dmx < 1 || dmx > DMX_UNIVERSE_SIZE) return
      const wide = channel.bits === 16
      writes.push({
        op: wide ? (channel.part === 'fine' ? OP_FIELD_FINE : OP_FIELD_COARSE) : OP_FIELD,
        srcOffset: slot * fieldStride,
        fieldOffset: fields.index(channel.field),
        constValue: 0,
        layer,
        universe: fixture.address.universe,
        channel: dmx,
      })
    })
  }

  for (const mapping of mappings) {
    if (mapping.enabled === false || !mapping.source) continue
    const heads = mappingHeads(mapping, fixtures, types).filter(({ fixture }) =>
      active.has(fixture.id),
    )
    const n = heads.length
    if (n === 0) continue

    const source = sourceFor(mapping.source, n)
    const span = Math.max(1, Math.floor(mapping.span ?? source.pixelCount))
    // `clip` walks the source a step at a time; `stretch` divides the span across the heads.
    const spacing = mapping.fit === 'stretch' ? span / n : (mapping.step ?? 1)

    const basePositions = new Float32Array(n)
    for (let p = 0; p < n; p++) {
      basePositions[p] = logicalIndex(p, n, mapping.arrangement, mapping.segmentSize) * spacing
    }

    // A spatial mapping ignores indices entirely: each head reads wherever it physically sits.
    let spatialUv: Float32Array | null = null
    if (mapping.spatial && mapping.kind !== 'reduce') {
      spatialUv = new Float32Array(n * 2)
      heads.forEach(({ fixture, head }, p) => {
        const fx = active.get(fixture.id)!
        const count = modeHeadCount(fx.mode)
        const world = pixelWorldPositions(placementOf(fixture.placement), count)
        const [u, v] = worldToUv(world[head * 3], world[head * 3 + 2], stage)
        spatialUv![p * 2] = u
        spatialUv![p * 2 + 1] = v
      })
    }

    const firstSlot = slots
    const encoders: Encoder[] = []
    const headIndex = new Int32Array(n)
    heads.forEach(({ fixture, head }, p) => {
      const fx = active.get(fixture.id)!
      encoders.push(fx.encode)
      headIndex[p] = head
      planHead(fx, head, firstSlot + p, LAYER_DRIVEN)
    })
    slots += n

    compiledMappings.push({
      mappingId: mapping.id,
      source,
      heads: n,
      firstSlot,
      reduce: reduceCode(mapping),
      basePositions,
      sampleSpan: Math.abs(spacing),
      span,
      filter: filterCode(mapping.filter),
      wrap: mapping.wrap === true,
      spatialUv,
      encoders,
      colours: new Float32Array(n * PIXEL_STRIDE),
      fixtureIds: heads.map(({ fixture }) => fixture.id),
      headIndex,
      offset: mapping.offset ?? 0,
      gain: mapping.gain ?? 1,
    })
  }

  // Identify flashes every head of the fixture, or the one asked for, over everything else.
  const identifySlots: number[] = []
  const identifyEncoders: Encoder[] = []
  const identified = identify ? active.get(identify.fixtureId) : undefined
  if (identified) {
    const count = modeHeadCount(identified.mode)
    for (let head = 0; head < count; head++) {
      if (identify!.head !== undefined && identify!.head !== head) continue
      identifySlots.push(slots)
      identifyEncoders.push(identified.encode)
      planHead(identified, head, slots, LAYER_IDENTIFY)
      slots++
    }
  }

  // Every channel of every fixture carries its default, which shows wherever nothing drives it.
  for (const { fixture, mode } of active.values()) {
    mode.channels.forEach((channel, i) => {
      const dmx = fixture.address.channel + i
      if (dmx < 1 || dmx > DMX_UNIVERSE_SIZE) return
      writes.push({
        op: OP_CONST,
        srcOffset: 0,
        fieldOffset: 0,
        constValue: Math.min(255, Math.max(0, Math.round(channel.default ?? 0))),
        layer: LAYER_DEFAULT,
        universe: fixture.address.universe,
        channel: dmx,
      })
    })
  }

  const n = writes.length
  const compiled: CompiledRig = {
    writeCount: n,
    sources,
    mappings: compiledMappings,
    identifySlots,
    identifyEncoders,
    fields,
    fieldStride,
    resolved: new Float32Array(slots * fieldStride),
    srcOffset: new Int32Array(n),
    fieldOffset: new Int32Array(n),
    op: new Uint8Array(n),
    constValue: new Uint8Array(n),
    layer: new Uint8Array(n),
    universe: new Int32Array(n),
    channel: new Int32Array(n),
    residual: new Float32Array(n),
    universes: [...new Set(writes.map((w) => w.universe))].sort((a, b) => a - b),
  }

  for (let i = 0; i < n; i++) {
    const w = writes[i]
    compiled.srcOffset[i] = w.srcOffset
    compiled.fieldOffset[i] = w.fieldOffset
    compiled.op[i] = w.op
    compiled.constValue[i] = w.constValue
    compiled.layer[i] = w.layer
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

/** Brightness used to rank pixels for `brightest` and `darkest`: Rec. 709 luma plus white. */
function pixelLevel(src: Float32Array, o: number): number {
  return 0.2126 * src[o] + 0.7152 * src[o + 1] + 0.0722 * src[o + 2] + src[o + 3]
}

/** Scratch for one sampled pixel; resolve is synchronous, so a shared buffer is safe. */
const sampled = new Float32Array(PIXEL_STRIDE)

/** Source pixel index a `spread` head reads, for previews; -1 for spatial heads. */
export function spreadSourceIndex(mapping: CompiledMapping, head: number): number {
  if (mapping.spatialUv) return -1
  const position = Math.floor(mapping.basePositions[head] + mapping.offset)
  return sourceIndexAt(position, mapping.source.pixelCount, mapping.wrap)
}

/** Source pixel indices a mapping is reading this frame, for the range preview. */
export function mappingSourcePixels(mapping: CompiledMapping): number[] {
  const length = mapping.source.pixelCount
  const out = new Set<number>()
  if (mapping.reduce !== REDUCE_NONE) {
    const start = Math.floor(mapping.offset)
    for (let k = 0; k < mapping.span; k++) out.add(sourceIndexAt(start + k, length, mapping.wrap))
  } else if (!mapping.spatialUv) {
    const covered =
      mapping.filter === FILTER_AVERAGE ? Math.max(1, Math.round(mapping.sampleSpan)) : 1
    const extra = mapping.filter === FILTER_LINEAR ? 1 : 0
    for (let p = 0; p < mapping.heads; p++) {
      const start = Math.floor(mapping.basePositions[p] + mapping.offset)
      for (let k = 0; k < covered + extra; k++)
        out.add(sourceIndexAt(start + k, length, mapping.wrap))
    }
  }
  return [...out].sort((a, b) => a - b)
}

function sampleReduce(mapping: CompiledMapping): void {
  const src = mapping.source.current
  const length = mapping.source.pixelCount
  const start = Math.floor(mapping.offset)

  if (mapping.reduce === REDUCE_AVERAGE) {
    for (let f = 0; f < PIXEL_STRIDE; f++) sampled[f] = 0
    for (let k = 0; k < mapping.span; k++) {
      const a = sourceIndexAt(start + k, length, mapping.wrap) * PIXEL_STRIDE
      for (let f = 0; f < PIXEL_STRIDE; f++) sampled[f] += src[a + f]
    }
    for (let f = 0; f < PIXEL_STRIDE; f++) sampled[f] /= mapping.span
    return
  }

  // Brightest and darkest pick a whole pixel, so the colour is one the sketch actually drew.
  let best = sourceIndexAt(start, length, mapping.wrap) * PIXEL_STRIDE
  let bestLevel = pixelLevel(src, best)
  for (let k = 1; k < mapping.span; k++) {
    const a = sourceIndexAt(start + k, length, mapping.wrap) * PIXEL_STRIDE
    const level = pixelLevel(src, a)
    if (mapping.reduce === REDUCE_BRIGHTEST ? level > bestLevel : level < bestLevel) {
      best = a
      bestLevel = level
    }
  }
  for (let f = 0; f < PIXEL_STRIDE; f++) sampled[f] = src[best + f]
}

function sampleSpread(mapping: CompiledMapping, p: number): void {
  const src = mapping.source.current
  const length = mapping.source.pixelCount
  const position = mapping.basePositions[p] + mapping.offset

  if (mapping.spatialUv) {
    // Offset slides the whole rig across the source, which is how a spatial rig pans.
    const slide = mapping.offset / Math.max(1, length)
    mapping.source.sampleUv(mapping.spatialUv[p * 2] + slide, mapping.spatialUv[p * 2 + 1], sampled)
  } else if (mapping.filter === FILTER_LINEAR) {
    const floor = Math.floor(position)
    const frac = position - floor
    const a = sourceIndexAt(floor, length, mapping.wrap) * PIXEL_STRIDE
    const b = sourceIndexAt(floor + 1, length, mapping.wrap) * PIXEL_STRIDE
    for (let f = 0; f < PIXEL_STRIDE; f++) {
      sampled[f] = src[a + f] + (src[b + f] - src[a + f]) * frac
    }
  } else if (mapping.filter === FILTER_AVERAGE) {
    const count = Math.max(1, Math.round(mapping.sampleSpan))
    const start = Math.floor(position)
    for (let f = 0; f < PIXEL_STRIDE; f++) sampled[f] = 0
    for (let k = 0; k < count; k++) {
      const a = sourceIndexAt(start + k, length, mapping.wrap) * PIXEL_STRIDE
      for (let f = 0; f < PIXEL_STRIDE; f++) sampled[f] += src[a + f]
    }
    for (let f = 0; f < PIXEL_STRIDE; f++) sampled[f] /= count
  } else {
    // Floor, not round: a position identifies a point in source space, and the pixel
    // containing it is the one it lands in. Round would bias a stretch off by half.
    const a = sourceIndexAt(Math.floor(position), length, mapping.wrap) * PIXEL_STRIDE
    for (let f = 0; f < PIXEL_STRIDE; f++) sampled[f] = src[a + f]
  }
}

/**
 * Samples every mapping, applies gain and master brightness, and encodes the result into
 * `resolved`. Runs once per frame, before the write loop.
 *
 * Brightness scales the colour rather than the intensity field, which is what keeps an
 * RGBW+intensity fixture from dimming twice. Encoders that drive a dimmer channel derive
 * it from the already-scaled colour, so brightness still reaches those fixtures.
 */
export function resolveRig(compiled: CompiledRig, brightness = 1, timeMs = 0): void {
  const out = compiled.resolved
  const stride = compiled.fieldStride

  for (const mapping of compiled.mappings) {
    const colourScale = mapping.gain * brightness
    if (mapping.reduce !== REDUCE_NONE) sampleReduce(mapping)

    for (let p = 0; p < mapping.heads; p++) {
      if (mapping.reduce === REDUCE_NONE) sampleSpread(mapping, p)
      const o = p * PIXEL_STRIDE
      for (let f = 0; f < PIXEL_STRIDE; f++) {
        // Intensity is left alone; scaling it as well would dim RGBW+intensity fixtures twice.
        mapping.colours[o + f] = f === 4 ? sampled[f] : sampled[f] * colourScale
      }
      mapping.encoders[p](mapping.colours, o, out, (mapping.firstSlot + p) * stride)
    }
  }

  if (compiled.identifySlots.length > 0) {
    // About two flashes a second, ignoring brightness so a blacked-out rig can still be found.
    const level = Math.floor(timeMs / 250) % 2 === 0 ? 255 : 0
    sampled.fill(level)
    compiled.identifySlots.forEach((slot, i) => {
      compiled.identifyEncoders[i](sampled, 0, out, slot * stride)
    })
  }
}

interface FrameScratch {
  value: Float32Array
  layer: Int8Array
  bytes: Uint8Array
}

const scratch = new Map<number, FrameScratch>()

function frameFor(universe: number): FrameScratch {
  let frame = scratch.get(universe)
  if (!frame) {
    frame = {
      value: new Float32Array(DMX_UNIVERSE_SIZE + 1),
      layer: new Int8Array(DMX_UNIVERSE_SIZE + 1),
      bytes: new Uint8Array(DMX_UNIVERSE_SIZE),
    }
    scratch.set(universe, frame)
  }
  return frame
}

function merge(frame: FrameScratch, channel: number, layer: number, value: number): void {
  const current = frame.layer[channel]
  if (layer > current) {
    frame.layer[channel] = layer
    frame.value[channel] = value
  } else if (layer === current && value > frame.value[channel]) {
    frame.value[channel] = value
  }
}

/**
 * Executes a compiled rig into the universe buffers; the whole per-frame hot path. Reads
 * the encoded slots, so `resolveRig` must have run for this frame.
 *
 * Each universe is rebuilt from nothing every frame, so a channel nobody writes any more
 * drops to 0 rather than holding its last value. Overlapping writes merge by layer, then
 * highest value — the usual DMX rule for two sources on one channel.
 *
 * With `dither`, the fraction a channel loses to 8-bit rounding is carried into the next
 * frame, so a value of 100.25 alternates 100/100/100/101 and averages to 100.25 over time.
 * A 16-bit pair already has that resolution, so its coarse byte is never dithered.
 */
export function executeRig(
  compiled: CompiledRig,
  universes: UniverseSet,
  dither = false,
  overrides: ReadonlyArray<{ universe: number; channel: number; value: number }> = [],
): void {
  const ids = new Set([...universes.universeIds(), ...compiled.universes])
  for (const o of overrides) ids.add(o.universe)
  for (const id of ids) {
    const frame = frameFor(id)
    frame.layer.fill(-1)
    frame.value.fill(0)
  }

  const resolved = compiled.resolved

  for (let i = 0; i < compiled.writeCount; i++) {
    const op = compiled.op[i]
    let value: number
    let ditherThis = dither

    if (op === OP_CONST) {
      value = compiled.constValue[i]
      ditherThis = false
    } else {
      const raw = resolved[compiled.srcOffset[i] + compiled.fieldOffset[i]]
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

    merge(frameFor(compiled.universe[i]), compiled.channel[i], compiled.layer[i], value)
  }

  for (const o of overrides) {
    if (o.channel < 1 || o.channel > DMX_UNIVERSE_SIZE) continue
    merge(frameFor(o.universe), o.channel, LAYER_OVERRIDE, o.value)
  }

  for (const id of ids) {
    const frame = frameFor(id)
    for (let channel = 1; channel <= DMX_UNIVERSE_SIZE; channel++) {
      const v = frame.value[channel]
      frame.bytes[channel - 1] = v < 0 ? 0 : v > 255 ? 255 : Math.round(v)
    }
    universes.setFrame(id, frame.bytes)
  }
}
