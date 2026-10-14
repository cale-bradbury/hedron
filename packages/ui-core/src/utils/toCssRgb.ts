/** Converts a 0–1 rgb triple to a CSS color */
export const toCssRgb = (rgb: readonly number[]) => {
  const [r, g, b] = rgb.map((v) => Math.round(v * 255))
  return `rgb(${r} ${g} ${b})`
}
