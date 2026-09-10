/**
 * Output field names are an open registry rather than a closed union, so a new fixture
 * type needs a profile rather than a type change. Well-known names are listed for the UI
 * and to keep indices stable; anything else a profile references is appended on compile.
 */
export type FieldName = string

export const COLOUR_FIELDS = [
  'red',
  'green',
  'blue',
  'white',
  'amber',
  'uv',
  'cyan',
  'magenta',
  'yellow',
] as const

export const WELL_KNOWN_FIELDS: readonly FieldName[] = [
  ...COLOUR_FIELDS,
  'intensity',
  'dimmer',
  'hue',
  'saturation',
  'wheel',
  'strobe',
  'pan',
  'tilt',
  'zoom',
  'focus',
  'gobo',
  'prism',
  'cto',
  'speed',
]

/** Maps field names to their slot in a resolved pixel, growing for unknown names. */
export class FieldTable {
  private indices = new Map<FieldName, number>()

  constructor(seed: readonly FieldName[] = WELL_KNOWN_FIELDS) {
    for (const name of seed) this.index(name)
  }

  public index(name: FieldName): number {
    const existing = this.indices.get(name)
    if (existing !== undefined) return existing
    const next = this.indices.size
    this.indices.set(name, next)
    return next
  }

  public has(name: FieldName): boolean {
    return this.indices.has(name)
  }

  /** Floats per pixel in the resolved buffer. */
  public get size(): number {
    return this.indices.size
  }

  public names(): FieldName[] {
    return [...this.indices.keys()]
  }
}
