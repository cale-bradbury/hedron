export type RGB = [number, number, number]

export type ColorBlendSpace = 'srgb' | 'linear' | 'hsl' | 'hsv' | 'oklab' | 'oklch'
export type ColorBlendCurve = 'linear' | 'easeIn' | 'easeOut' | 'easeInOut' | 'step'
export type ColorBlendHue = 'shorter' | 'longer' | 'increasing' | 'decreasing'
export type ColorBlendRange = 'clamp' | 'repeat' | 'mirror'

export interface ColorBlendOptions {
  space: ColorBlendSpace
  curve: ColorBlendCurve
  hue: ColorBlendHue
  range: ColorBlendRange
}

export const defaultColorBlendOptions: ColorBlendOptions = {
  space: 'oklab',
  curve: 'linear',
  hue: 'shorter',
  range: 'clamp',
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v))
const lerp = (a: number, b: number, t: number) => a + (b - a) * t

/** Maps any blend amount into 0–1 using the range mode */
export const applyBlendRange = (t: number, range: ColorBlendRange) => {
  if (range === 'clamp') return clamp01(t)

  if (range === 'repeat') {
    const frac = t - Math.floor(t)
    // Whole numbers above 0 land on B rather than wrapping back to A
    return frac === 0 && t > 0 ? 1 : frac
  }

  const m = ((t % 2) + 2) % 2
  return m > 1 ? 2 - m : m
}

export const applyBlendCurve = (t: number, curve: ColorBlendCurve) => {
  switch (curve) {
    case 'easeIn':
      return t * t
    case 'easeOut':
      return 1 - (1 - t) * (1 - t)
    case 'easeInOut':
      return t * t * (3 - 2 * t)
    case 'step':
      return t < 0.5 ? 0 : 1
    default:
      return t
  }
}

const toLinear = (c: number) => {
  const a = Math.abs(c)
  return Math.sign(c) * (a <= 0.04045 ? a / 12.92 : ((a + 0.055) / 1.055) ** 2.4)
}

const fromLinear = (c: number) => {
  const a = Math.abs(c)
  return Math.sign(c) * (a <= 0.0031308 ? a * 12.92 : 1.055 * a ** (1 / 2.4) - 0.055)
}

// OKLab conversions from https://bottosson.github.io/posts/oklab/
const linearToOklab = ([r, g, b]: RGB): RGB => {
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)

  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ]
}

const oklabToLinear = ([L, a, b]: RGB): RGB => {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3

  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ]
}

// Hue spaces put hue first, in degrees, or NaN for a grey with no hue
const rgbToHsv = ([r, g, b]: RGB): RGB => {
  const max = Math.max(r, g, b)
  const d = max - Math.min(r, g, b)
  return [rgbHue(r, g, b, max, d), max === 0 ? 0 : d / max, max]
}

const rgbToHsl = ([r, g, b]: RGB): RGB => {
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const d = max - min
  const l = (max + min) / 2
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1))
  return [rgbHue(r, g, b, max, d), s, l]
}

const rgbHue = (r: number, g: number, b: number, max: number, d: number) => {
  if (d < 1e-6) return NaN
  const h =
    max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4
  return h * 60
}

const hsvToRgb = ([h, s, v]: RGB): RGB => {
  const f = (n: number) => {
    const k = (n + h / 60) % 6
    return v - v * s * Math.max(0, Math.min(k, 4 - k, 1))
  }
  return [f(5), f(3), f(1)]
}

const hslToRgb = ([h, s, l]: RGB): RGB => {
  const a = s * Math.min(l, 1 - l)
  const f = (n: number) => {
    const k = (n + h / 30) % 12
    return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))
  }
  return [f(0), f(8), f(4)]
}

const oklabToOklch = ([L, a, b]: RGB): RGB => {
  const c = Math.hypot(a, b)
  return [c < 1e-4 ? NaN : (Math.atan2(b, a) * 180) / Math.PI, c, L]
}

const oklchToOklab = ([h, c, L]: RGB): RGB => {
  const rad = (h * Math.PI) / 180
  return [L, c * Math.cos(rad), c * Math.sin(rad)]
}

const encode: Record<ColorBlendSpace, (rgb: RGB) => RGB> = {
  srgb: (rgb) => rgb,
  linear: (rgb) => rgb.map(toLinear) as RGB,
  hsl: rgbToHsl,
  hsv: rgbToHsv,
  oklab: (rgb) => linearToOklab(rgb.map(toLinear) as RGB),
  oklch: (rgb) => oklabToOklch(linearToOklab(rgb.map(toLinear) as RGB)),
}

const decode: Record<ColorBlendSpace, (c: RGB) => RGB> = {
  srgb: (c) => c,
  linear: (c) => c.map(fromLinear) as RGB,
  hsl: hslToRgb,
  hsv: hsvToRgb,
  oklab: (c) => oklabToLinear(c).map(fromLinear) as RGB,
  oklch: (c) => oklabToLinear(oklchToOklab(c)).map(fromLinear) as RGB,
}

const isHueSpace = (space: ColorBlendSpace) =>
  space === 'hsl' || space === 'hsv' || space === 'oklch'

const lerpHue = (h1: number, h2: number, t: number, mode: ColorBlendHue) => {
  // A grey borrows the other hue so the blend doesn't swing through red
  if (isNaN(h1) && isNaN(h2)) return 0
  if (isNaN(h1)) return h2
  if (isNaN(h2)) return h1

  let d = h2 - h1

  if (mode === 'shorter') {
    if (d > 180) d -= 360
    else if (d < -180) d += 360
  } else if (mode === 'longer') {
    if (d > 0 && d < 180) d -= 360
    else if (d > -180 && d <= 0) d += 360
  } else if (mode === 'increasing') {
    if (d < 0) d += 360
  } else if (d > 0) {
    d -= 360
  }

  return (((h1 + d * t) % 360) + 360) % 360
}

/** Blends two sRGB colors (0–1 components) by `t`, after applying the range mode and curve. */
export const blendColors = (
  a: RGB,
  b: RGB,
  t: number,
  options: ColorBlendOptions = defaultColorBlendOptions,
): RGB => {
  const amount = applyBlendCurve(applyBlendRange(t, options.range), options.curve)

  if (amount <= 0) return [...a]
  if (amount >= 1) return [...b]

  const { space } = options
  const ca = encode[space](a)
  const cb = encode[space](b)

  const mixed: RGB = isHueSpace(space)
    ? [
        lerpHue(ca[0], cb[0], amount, options.hue),
        lerp(ca[1], cb[1], amount),
        lerp(ca[2], cb[2], amount),
      ]
    : [lerp(ca[0], cb[0], amount), lerp(ca[1], cb[1], amount), lerp(ca[2], cb[2], amount)]

  return decode[space](mixed).map(clamp01) as RGB
}
