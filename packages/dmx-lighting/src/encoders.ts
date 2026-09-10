import { FieldTable } from './fields'
import { PIXEL_STRIDE } from './PixelSource'

/** One selectable colour on a fixed-colour fixture, as a DMX value and the colour it makes. */
export interface WheelEntry {
  value: number
  color: string
  label?: string
}

/**
 * How a resolved colour becomes device fields. `passthrough` is the default and writes
 * red/green/blue/white/intensity unchanged, which is what every profile did before encoders.
 */
export type EncoderSpec =
  | { kind: 'passthrough' }
  | { kind: 'rgb' }
  | {
      kind: 'rgbw'
      /** How much of the colour is moved onto the white emitter. */
      whiteExtract?: 'none' | 'min' | 'max-preserve'
      /** The colour the white emitter actually makes, 0-255. Defaults to neutral. */
      whitePoint?: [number, number, number]
    }
  | { kind: 'rgbwa'; whiteExtract?: 'none' | 'min' | 'max-preserve' }
  | { kind: 'cmy' }
  | { kind: 'dimmer' }
  | { kind: 'hsi' }
  | { kind: 'wheel'; entries: WheelEntry[]; carryIntensity?: boolean }

export const ENCODER_KINDS: ReadonlyArray<EncoderSpec['kind']> = [
  'passthrough',
  'rgb',
  'rgbw',
  'rgbwa',
  'cmy',
  'dimmer',
  'hsi',
  'wheel',
]

/** Writes one resolved pixel's fields. `src` is r,g,b,w,intensity at `srcOffset`. */
export type Encoder = (
  src: Float32Array,
  srcOffset: number,
  out: Float32Array,
  outOffset: number,
) => void

const clamp255 = (v: number) => (v < 0 ? 0 : v > 255 ? 255 : v)

/** Rec. 709 luma, the standard weighting for "how bright does this look". */
function luminance(r: number, g: number, b: number): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/**
 * Splits a colour into a white component and what is left of the primaries.
 * `min` pulls the common grey out; `max-preserve` does the same but keeps total output,
 * which is brighter but less saturated on fixtures whose white emitter is strong.
 */
function extractWhite(
  r: number,
  g: number,
  b: number,
  mode: 'none' | 'min' | 'max-preserve' | undefined,
  whitePoint: [number, number, number],
): [number, number, number, number] {
  if (!mode || mode === 'none') return [r, g, b, 0]

  const [wr, wg, wb] = whitePoint
  // How much white can be removed before a primary would go negative.
  const limit = Math.min(
    wr > 0 ? (r / wr) * 255 : Infinity,
    wg > 0 ? (g / wg) * 255 : Infinity,
    wb > 0 ? (b / wb) * 255 : Infinity,
  )
  const white = clamp255(limit === Infinity ? 0 : limit)

  const outR = r - (white * wr) / 255
  const outG = g - (white * wg) / 255
  const outB = b - (white * wb) / 255

  if (mode === 'max-preserve') return [clamp255(outR), clamp255(outG), clamp255(outB), white]
  return [clamp255(outR), clamp255(outG), clamp255(outB), white]
}

// ─── Oklab, for perceptual matching against a colour wheel ────────────────────

function srgbToLinear(c: number): number {
  const n = c / 255
  return n <= 0.04045 ? n / 12.92 : Math.pow((n + 0.055) / 1.055, 2.4)
}

/** sRGB 0-255 to Oklab, where euclidean distance approximates perceived difference. */
export function rgbToOklab(r: number, g: number, b: number): [number, number, number] {
  const lr = srgbToLinear(r)
  const lg = srgbToLinear(g)
  const lb = srgbToLinear(b)

  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb)
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb)
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb)

  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ]
}

export function parseHexColor(hex: string): [number, number, number] {
  const clean = hex.replace('#', '').trim()
  const full =
    clean.length === 3
      ? clean
          .split('')
          .map((c) => c + c)
          .join('')
      : clean
  const n = parseInt(full, 16)
  if (isNaN(n) || full.length !== 6) return [0, 0, 0]
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

function rgbToHsi(r: number, g: number, b: number): [number, number, number] {
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const d = max - min

  let h = 0
  if (d !== 0) {
    if (max === r) h = ((g - b) / d + 6) % 6
    else if (max === g) h = (b - r) / d + 2
    else h = (r - g) / d + 4
    h /= 6
  }
  return [h * 255, max === 0 ? 0 : (d / max) * 255, max]
}

// ─── Factory ──────────────────────────────────────────────────────────────────

const NEUTRAL_WHITE: [number, number, number] = [255, 255, 255]
/** Amber as most RGBWA fixtures render it, used to decide how much to pull out. */
const AMBER: [number, number, number] = [255, 170, 0]

export function makeEncoder(spec: EncoderSpec | undefined, fields: FieldTable): Encoder {
  const f = (name: string) => fields.index(name)

  if (!spec || spec.kind === 'passthrough') {
    const [red, green, blue, white, intensity] = [
      f('red'),
      f('green'),
      f('blue'),
      f('white'),
      f('intensity'),
    ]
    return (src, o, out, p) => {
      out[p + red] = src[o]
      out[p + green] = src[o + 1]
      out[p + blue] = src[o + 2]
      out[p + white] = src[o + 3]
      out[p + intensity] = src[o + 4]
    }
  }

  if (spec.kind === 'rgb') {
    const [red, green, blue] = [f('red'), f('green'), f('blue')]
    return (src, o, out, p) => {
      out[p + red] = src[o]
      out[p + green] = src[o + 1]
      out[p + blue] = src[o + 2]
    }
  }

  if (spec.kind === 'rgbw') {
    const [red, green, blue, white, intensity] = [
      f('red'),
      f('green'),
      f('blue'),
      f('white'),
      f('intensity'),
    ]
    const point = spec.whitePoint ?? NEUTRAL_WHITE
    const mode = spec.whiteExtract ?? 'min'
    return (src, o, out, p) => {
      const [r, g, b, w] = extractWhite(src[o], src[o + 1], src[o + 2], mode, point)
      out[p + red] = r
      out[p + green] = g
      out[p + blue] = b
      // A source that already carries white adds to whatever extraction produced.
      out[p + white] = clamp255(w + src[o + 3])
      out[p + intensity] = src[o + 4]
    }
  }

  if (spec.kind === 'rgbwa') {
    const [red, green, blue, white, amber, intensity] = [
      f('red'),
      f('green'),
      f('blue'),
      f('white'),
      f('amber'),
      f('intensity'),
    ]
    const mode = spec.whiteExtract ?? 'min'
    return (src, o, out, p) => {
      const [r0, g0, b0, w] = extractWhite(src[o], src[o + 1], src[o + 2], mode, NEUTRAL_WHITE)
      // Pull amber out of what is left, the same way white was pulled out of the whole.
      const [r1, g1, b1, a] = extractWhite(r0, g0, b0, 'min', AMBER)
      out[p + red] = r1
      out[p + green] = g1
      out[p + blue] = b1
      out[p + amber] = a
      out[p + white] = clamp255(w + src[o + 3])
      out[p + intensity] = src[o + 4]
    }
  }

  if (spec.kind === 'cmy') {
    const [cyan, magenta, yellow, intensity] = [
      f('cyan'),
      f('magenta'),
      f('yellow'),
      f('intensity'),
    ]
    return (src, o, out, p) => {
      out[p + cyan] = 255 - src[o]
      out[p + magenta] = 255 - src[o + 1]
      out[p + yellow] = 255 - src[o + 2]
      out[p + intensity] = src[o + 4]
    }
  }

  if (spec.kind === 'dimmer') {
    const [dimmer, intensity] = [f('dimmer'), f('intensity')]
    return (src, o, out, p) => {
      // Master brightness has already scaled the colour, so luma carries it here.
      const level = clamp255(luminance(src[o], src[o + 1], src[o + 2]) + src[o + 3])
      out[p + dimmer] = level
      out[p + intensity] = level
    }
  }

  if (spec.kind === 'hsi') {
    const [hue, saturation, intensity] = [f('hue'), f('saturation'), f('intensity')]
    return (src, o, out, p) => {
      const [h, s, i] = rgbToHsi(src[o], src[o + 1], src[o + 2])
      out[p + hue] = h
      out[p + saturation] = s
      out[p + intensity] = i
    }
  }

  // Colour wheel: pick the palette entry that looks closest, and optionally let the
  // intensity channel carry the brightness the wheel itself cannot express.
  const wheel = f('wheel')
  const intensity = f('intensity')
  const entries = spec.entries ?? []
  const lab = entries.map((entry) => {
    const [r, g, b] = parseHexColor(entry.color)
    return { value: entry.value, lab: rgbToOklab(r, g, b), luma: luminance(r, g, b) }
  })
  const carry = spec.carryIntensity !== false

  return (src, o, out, p) => {
    if (lab.length === 0) {
      out[p + wheel] = 0
      out[p + intensity] = src[o + 4]
      return
    }

    const r = src[o]
    const g = src[o + 1]
    const b = src[o + 2]
    const level = luminance(r, g, b)

    // Normalise before matching so a dimmed colour still picks its own hue rather than black.
    const scale = level > 0 ? 255 / Math.max(r, g, b) : 1
    const target = rgbToOklab(clamp255(r * scale), clamp255(g * scale), clamp255(b * scale))

    let bestValue = lab[0].value
    let bestDistance = Infinity
    for (const candidate of lab) {
      const dl = candidate.lab[0] - target[0]
      const da = candidate.lab[1] - target[1]
      const db = candidate.lab[2] - target[2]
      const distance = dl * dl + da * da + db * db
      if (distance < bestDistance) {
        bestDistance = distance
        bestValue = candidate.value
      }
    }

    out[p + wheel] = bestValue
    out[p + intensity] = carry ? clamp255(level) : src[o + 4]
  }
}

/** Fields an encoder writes, so the panel can suggest the right slots for a mode. */
export function encoderFields(spec: EncoderSpec | undefined): string[] {
  switch (spec?.kind) {
    case 'rgb':
      return ['red', 'green', 'blue']
    case 'rgbw':
      return ['red', 'green', 'blue', 'white', 'intensity']
    case 'rgbwa':
      return ['red', 'green', 'blue', 'white', 'amber', 'intensity']
    case 'cmy':
      return ['cyan', 'magenta', 'yellow', 'intensity']
    case 'dimmer':
      return ['dimmer', 'intensity']
    case 'hsi':
      return ['hue', 'saturation', 'intensity']
    case 'wheel':
      return ['wheel', 'intensity']
    default:
      return ['red', 'green', 'blue', 'white', 'intensity']
  }
}

export { PIXEL_STRIDE }
