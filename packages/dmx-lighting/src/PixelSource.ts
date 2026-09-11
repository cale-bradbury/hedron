import type { ChannelType, FixtureChannels, LerpMode } from './types'

/** Fields stored per pixel, in buffer order. */
export const PIXEL_FIELDS: readonly ChannelType[] = [
  'red',
  'green',
  'blue',
  'white',
  'intensity',
] as const

export const PIXEL_STRIDE = PIXEL_FIELDS.length

export const FIELD_OFFSET: Record<ChannelType, number> = {
  red: 0,
  green: 1,
  blue: 2,
  white: 3,
  intensity: 4,
}

/**
 * A named buffer of pixel values that sketches write to, holding a target set by the
 * sketch and a smoothed current value the compositor reads. Values are 0–255 floats.
 */
export class PixelSource {
  public readonly id: string
  private cols: number
  private rows: number
  /** Values written by the sketch; the buffer to fill directly for bulk writes. */
  public target: Float32Array
  /** Values after temporal smoothing — what the compositor samples. */
  public current: Float32Array

  constructor(id: string, width: number, height = 1) {
    this.id = id
    this.cols = Math.max(1, Math.floor(width))
    this.rows = Math.max(1, Math.floor(height))
    this.target = new Float32Array(this.pixelCount * PIXEL_STRIDE)
    this.current = new Float32Array(this.pixelCount * PIXEL_STRIDE)
  }

  /** Pixels in the buffer; width × height, and a 1D source is simply height 1. */
  public get pixelCount(): number {
    return this.cols * this.rows
  }

  public get width(): number {
    return this.cols
  }

  public get height(): number {
    return this.rows
  }

  /** Grows or shrinks the buffers, preserving the pixels that still fit. */
  public resize(width: number, height = 1): boolean {
    const cols = Math.max(1, Math.floor(width))
    const rows = Math.max(1, Math.floor(height))
    if (cols === this.cols && rows === this.rows) return false

    const before = this.pixelCount
    const next = cols * rows
    const target = new Float32Array(next * PIXEL_STRIDE)
    const current = new Float32Array(next * PIXEL_STRIDE)
    const keep = Math.min(next, before) * PIXEL_STRIDE
    target.set(this.target.subarray(0, keep))
    current.set(this.current.subarray(0, keep))

    this.target = target
    this.current = current
    this.cols = cols
    this.rows = rows
    return true
  }

  /** Writes one pixel; white defaults to 0 and intensity to full so RGB-only sketches light up. */
  public set(index: number, r: number, g: number, b: number, w = 0, intensity = 255): void {
    if (index < 0 || index >= this.pixelCount) return
    const o = index * PIXEL_STRIDE
    this.target[o] = r
    this.target[o + 1] = g
    this.target[o + 2] = b
    this.target[o + 3] = w
    this.target[o + 4] = intensity
  }

  /** Writes one pixel of a 2D source by column and row. */
  public setXY(
    x: number,
    y: number,
    r: number,
    g: number,
    b: number,
    w = 0,
    intensity = 255,
  ): void {
    if (x < 0 || x >= this.cols || y < 0 || y >= this.rows) return
    this.set(y * this.cols + x, r, g, b, w, intensity)
  }

  /** Writes only the fields present, leaving the rest of the pixel untouched. */
  public setChannels(index: number, channels: FixtureChannels): void {
    if (index < 0 || index >= this.pixelCount) return
    const o = index * PIXEL_STRIDE
    for (let f = 0; f < PIXEL_STRIDE; f++) {
      const value = channels[PIXEL_FIELDS[f]]
      if (value !== undefined) this.target[o + f] = value
    }
  }

  public setAll(r: number, g: number, b: number, w = 0, intensity = 255): void {
    const n = this.pixelCount
    for (let i = 0; i < n; i++) this.set(i, r, g, b, w, intensity)
  }

  /**
   * Copies RGBA bytes straight in, the shape ImageData uses, so a sketch can hand over a
   * canvas readback without unpacking it first. Alpha is ignored.
   */
  public setFromRgba(data: ArrayLike<number>, intensity = 255): void {
    const n = Math.min(this.pixelCount, Math.floor(data.length / 4))
    for (let i = 0; i < n; i++) {
      const src = i * 4
      const dst = i * PIXEL_STRIDE
      this.target[dst] = data[src]
      this.target[dst + 1] = data[src + 1]
      this.target[dst + 2] = data[src + 2]
      this.target[dst + 3] = 0
      this.target[dst + 4] = intensity
    }
  }

  /**
   * Bilinear sample of the smoothed buffer in normalised coordinates, for spatial taps.
   * Positions outside 0-1 clamp to the edge.
   */
  public sampleUv(u: number, v: number, out: Float32Array): void {
    const x = clamp01(u) * (this.cols - 1)
    const y = clamp01(v) * (this.rows - 1)
    const x0 = Math.floor(x)
    const y0 = Math.floor(y)
    const x1 = Math.min(x0 + 1, this.cols - 1)
    const y1 = Math.min(y0 + 1, this.rows - 1)
    const fx = x - x0
    const fy = y - y0

    const a = (y0 * this.cols + x0) * PIXEL_STRIDE
    const b = (y0 * this.cols + x1) * PIXEL_STRIDE
    const c = (y1 * this.cols + x0) * PIXEL_STRIDE
    const d = (y1 * this.cols + x1) * PIXEL_STRIDE

    for (let f = 0; f < PIXEL_STRIDE; f++) {
      const top = this.current[a + f] + (this.current[b + f] - this.current[a + f]) * fx
      const bottom = this.current[c + f] + (this.current[d + f] - this.current[c + f]) * fx
      out[f] = top + (bottom - top) * fy
    }
  }

  /** Moves `current` toward `target`; factor 1 is instant. */
  public smooth(factor: number, mode: LerpMode): void {
    if (factor >= 1) {
      this.current.set(this.target)
      return
    }
    if (mode === 'curved-hsb') this.smoothHsb(factor)
    else this.smoothLinear(factor)
  }

  private smoothLinear(factor: number): void {
    const { current, target } = this
    for (let i = 0; i < current.length; i++) {
      current[i] += (target[i] - current[i]) * factor
    }
  }

  // Hue takes the shortest arc so a red-to-magenta fade doesn't detour through green.
  private smoothHsb(factor: number): void {
    const { current, target } = this
    const n = this.pixelCount
    for (let p = 0; p < n; p++) {
      const o = p * PIXEL_STRIDE
      const from = rgbToHsb(current[o], current[o + 1], current[o + 2])
      const to = rgbToHsb(target[o], target[o + 1], target[o + 2])

      let dh = to[0] - from[0]
      if (dh > 0.5) dh -= 1
      else if (dh < -0.5) dh += 1

      const h = (from[0] + dh * factor + 1) % 1
      const sat = from[1] + (to[1] - from[1]) * factor
      const bri = from[2] + (to[2] - from[2]) * factor
      const rgb = hsbToRgb(h, sat, bri)

      current[o] = rgb[0]
      current[o + 1] = rgb[1]
      current[o + 2] = rgb[2]
      current[o + 3] += (target[o + 3] - current[o + 3]) * factor
      current[o + 4] += (target[o + 4] - current[o + 4]) * factor
    }
  }
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v
}

function rgbToHsb(r: number, g: number, b: number): [number, number, number] {
  const rn = r / 255
  const gn = g / 255
  const bn = b / 255
  const max = Math.max(rn, gn, bn)
  const min = Math.min(rn, gn, bn)
  const d = max - min

  let h = 0
  if (d !== 0) {
    if (max === rn) h = ((gn - bn) / d + 6) % 6
    else if (max === gn) h = (bn - rn) / d + 2
    else h = (rn - gn) / d + 4
    h /= 6
  }
  return [h, max === 0 ? 0 : d / max, max]
}

function hsbToRgb(h: number, s: number, v: number): [number, number, number] {
  const i = Math.floor(h * 6)
  const f = h * 6 - i
  const p = v * (1 - s)
  const q = v * (1 - f * s)
  const t = v * (1 - (1 - f) * s)

  let rgb: [number, number, number]
  switch (i % 6) {
    case 0:
      rgb = [v, t, p]
      break
    case 1:
      rgb = [q, v, p]
      break
    case 2:
      rgb = [p, v, t]
      break
    case 3:
      rgb = [p, q, v]
      break
    case 4:
      rgb = [t, p, v]
      break
    default:
      rgb = [v, p, q]
  }
  return [rgb[0] * 255, rgb[1] * 255, rgb[2] * 255]
}

/** Owns every named source and tracks a revision so the patch recompiles when shapes change. */
export class SourceRegistry {
  private sources = new Map<string, PixelSource>()
  public revision = 0

  public get(id: string): PixelSource | undefined {
    return this.sources.get(id)
  }

  /** Returns the named source, creating it or resizing it when dimensions are given. */
  public ensure(id: string, width?: number, height = 1): PixelSource {
    let source = this.sources.get(id)
    if (!source) {
      source = new PixelSource(id, width ?? 1, height)
      this.sources.set(id, source)
      this.revision++
      return source
    }
    if (width !== undefined && source.resize(width, height)) this.revision++
    return source
  }

  public list(): PixelSource[] {
    return [...this.sources.values()]
  }

  public smoothAll(factor: number, mode: LerpMode): void {
    for (const source of this.sources.values()) source.smooth(factor, mode)
  }
}
