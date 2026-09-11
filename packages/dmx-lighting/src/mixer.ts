import { PIXEL_STRIDE, PixelSource, SourceRegistry } from './PixelSource'

/** A crossfaded source: patch entries tap `source` while the crossfader sweeps the inputs. */
export interface MixSource {
  /** Stable id; the crossfader node is keyed on it so renaming the output keeps MIDI mappings. */
  id: string
  /** Output source name, tapped by patch entries like any other source. */
  source: string
  /** Inputs in crossfader order; an empty string is an empty deck that reads as black. */
  inputs: string[]
  /** Output width; inputs of other sizes are stretched to fit. */
  pixelCount: number
}

export function mixPositionNodeId(pluginId: string, mixId: string): string {
  return `${pluginId}-mix-${mixId}-position`
}

export function makeMixId(): string {
  return `mix-${Math.random().toString(36).slice(2, 9)}`
}

/** Drops malformed mixes from stored JSON rather than letting one break the DMX tick. */
export function normalizeMixes(raw: unknown): MixSource[] {
  if (!Array.isArray(raw)) return []
  return raw
    .filter((mix) => mix && typeof mix.id === 'string' && typeof mix.source === 'string')
    .map((mix) => ({
      id: mix.id,
      source: mix.source,
      inputs: Array.isArray(mix.inputs)
        ? mix.inputs.map((input: unknown) => (typeof input === 'string' ? input : ''))
        : [],
      pixelCount: Math.max(1, Math.floor(Number(mix.pixelCount) || 1)),
    }))
}

/** The two inputs a crossfader position sits between, and how far it is toward the second. */
export interface CrossfadePair {
  from: number
  to: number
  t: number
}

/** Position 0–1 sweeps evenly across the inputs, so with two it is a plain A/B fader. */
export function crossfadePair(position: number, inputCount: number): CrossfadePair {
  if (inputCount <= 1) return { from: 0, to: 0, t: 0 }
  const clamped = Number.isFinite(position) ? Math.min(1, Math.max(0, position)) : 0
  const scaled = clamped * (inputCount - 1)
  const from = Math.min(Math.floor(scaled), inputCount - 2)
  return { from, to: from + 1, t: scaled - from }
}

/** Each input's share of the output, so the panel can show which deck is safe to swap. */
export function crossfadeWeights(position: number, inputCount: number): number[] {
  const weights: number[] = new Array(inputCount).fill(0)
  if (inputCount === 0) return weights
  const { from, to, t } = crossfadePair(position, inputCount)
  weights[from] += 1 - t
  weights[to] += t
  return weights
}

const sampleA = new Float32Array(PIXEL_STRIDE)
const sampleB = new Float32Array(PIXEL_STRIDE)

/** Stretches an input's smoothed buffer onto `outCount` pixels; a missing input reads as black. */
function sampleStretched(
  source: PixelSource | undefined,
  pixel: number,
  outCount: number,
  out: Float32Array,
): void {
  if (!source) {
    out.fill(0)
    return
  }

  const length = source.pixelCount
  const data = source.current

  // Same size copies straight across, and a single pixel broadcasts to the whole output.
  if (length === outCount || length === 1) {
    const o = Math.min(pixel, length - 1) * PIXEL_STRIDE
    for (let f = 0; f < PIXEL_STRIDE; f++) out[f] = data[o + f]
    return
  }

  const position = outCount === 1 ? 0 : (pixel * (length - 1)) / (outCount - 1)
  const floor = Math.floor(position)
  const a = floor * PIXEL_STRIDE
  const b = Math.min(floor + 1, length - 1) * PIXEL_STRIDE
  const frac = position - floor
  for (let f = 0; f < PIXEL_STRIDE; f++) out[f] = data[a + f] + (data[b + f] - data[a + f]) * frac
}

/**
 * Writes every mix into its output source from its inputs' smoothed buffers. Run it after
 * smoothing; outputs are marked derived so they are not smoothed a second time.
 */
export function applyMixes(
  mixes: MixSource[],
  positionOf: (mix: MixSource) => number,
  registry: SourceRegistry,
): void {
  for (const mix of mixes) {
    if (!mix.source) continue
    const count = Math.max(1, Math.floor(mix.pixelCount || 1))
    const output = registry.ensure(mix.source, count)
    output.derived = true

    // A mix reading its own output would feed back, so that deck is treated as empty.
    const inputAt = (index: number): PixelSource | undefined => {
      const id = mix.inputs[index]
      return id && id !== mix.source ? registry.get(id) : undefined
    }

    const { from, to, t } = crossfadePair(positionOf(mix), mix.inputs.length)
    const a = inputAt(from)
    const b = inputAt(to)

    for (let p = 0; p < count; p++) {
      sampleStretched(a, p, count, sampleA)
      sampleStretched(b, p, count, sampleB)
      const o = p * PIXEL_STRIDE
      for (let f = 0; f < PIXEL_STRIDE; f++) {
        const value = sampleA[f] + (sampleB[f] - sampleA[f]) * t
        output.current[o + f] = value
        output.target[o + f] = value
      }
    }
  }
}
