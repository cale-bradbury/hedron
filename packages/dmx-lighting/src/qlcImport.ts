import type { FixtureProfile, FixtureShape } from './profiles'
import type { ChannelSlot } from './types'

/** A channel as QLC+ describes it in a .qxf fixture definition. */
export interface QlcChannel {
  name: string
  group: string
  colour?: string
  /** 0 is the coarse byte, 1 the fine byte of a 16-bit pair. */
  byte: number
}

export interface QlcMode {
  name: string
  /** Channel names in address order. */
  channels: string[]
}

export interface QlcDefinition {
  manufacturer: string
  model: string
  type: string
  channels: QlcChannel[]
  modes: QlcMode[]
}

const COLOUR_FIELD: Record<string, string> = {
  red: 'red',
  green: 'green',
  blue: 'blue',
  white: 'white',
  amber: 'amber',
  uv: 'uv',
  cyan: 'cyan',
  magenta: 'magenta',
  yellow: 'yellow',
  lime: 'green',
  indigo: 'uv',
}

/** Falls back to the channel name so an unrecognised channel is still addressable. */
function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'unknown'
  )
}

/** Maps one QLC+ channel onto a field name in our registry. */
export function qlcFieldName(channel: QlcChannel): string {
  const colour = channel.colour?.toLowerCase()
  if (colour && COLOUR_FIELD[colour]) return COLOUR_FIELD[colour]

  const name = channel.name.toLowerCase()
  switch (channel.group) {
    case 'Intensity':
      if (/dimmer|master|intensity|brightness/.test(name)) return 'intensity'
      return COLOUR_FIELD[name] ?? 'intensity'
    case 'Colour':
      return 'wheel'
    case 'Pan':
      return 'pan'
    case 'Tilt':
      return 'tilt'
    case 'Shutter':
      return 'strobe'
    case 'Gobo':
      return 'gobo'
    case 'Prism':
      return 'prism'
    case 'Speed':
      return 'speed'
    case 'Beam':
      if (/zoom/.test(name)) return 'zoom'
      if (/focus/.test(name)) return 'focus'
      return slugify(channel.name)
    default:
      if (/zoom/.test(name)) return 'zoom'
      if (/focus/.test(name)) return 'focus'
      if (/strobe|shutter/.test(name)) return 'strobe'
      return slugify(channel.name)
  }
}

export function qlcChannelToSlot(channel: QlcChannel): ChannelSlot {
  const field = qlcFieldName(channel)
  if (channel.byte === 1) return { field, bits: 16, part: 'fine' }
  return field
}

function shapeFor(type: string): FixtureShape {
  const t = type.toLowerCase()
  if (t.includes('moving')) return 'mover'
  if (t.includes('bar') || t.includes('strip')) return 'bar'
  if (t.includes('matrix')) return 'matrix'
  if (t.includes('dimmer')) return 'generic'
  if (t.includes('color') || t.includes('colour') || t.includes('par')) return 'par'
  return 'generic'
}

/**
 * Turns a QLC+ definition into a profile. Every mode becomes one pixel of however many
 * channels it lists, which is right for the conventional fixtures QLC+ describes; pixel
 * bars are better patched by setting a pixel count on the entry afterwards.
 */
export function qlcToProfile(definition: QlcDefinition): FixtureProfile {
  const byName = new Map(definition.channels.map((c) => [c.name, c]))

  const modes = definition.modes
    .filter((mode) => mode.channels.length > 0)
    .map((mode) => {
      const pixel: ChannelSlot[] = mode.channels.map((name) => {
        const channel = byName.get(name)
        return channel ? qlcChannelToSlot(channel) : null
      })

      // A fixture with a colour wheel and no RGB emitters wants the wheel encoder; its
      // positions are in the QLC capabilities, which are left for the user to fill in.
      const fields = pixel.map((slot) =>
        typeof slot === 'string' ? slot : slot && 'field' in slot ? slot.field : '',
      )
      const hasRgb = fields.includes('red') && fields.includes('green')
      const wheelOnly = !hasRgb && fields.includes('wheel')

      return {
        name: mode.name,
        pixel,
        pixelCount: 1,
        ...(wheelOnly
          ? { encoder: { kind: 'wheel' as const, entries: [], carryIntensity: true } }
          : {}),
      }
    })

  const label = [definition.manufacturer, definition.model].filter(Boolean).join(' ')
  return {
    id: `qlc-${slugify(label)}-${Math.random().toString(36).slice(2, 6)}`,
    name: label || 'Imported fixture',
    shape: shapeFor(definition.type),
    modes: modes.length > 0 ? modes : [{ name: 'default', pixel: [], pixelCount: 1 }],
  }
}

/** Reads a .qxf document. Browser only — the pure mapping above is what carries the logic. */
export function parseQlcXml(xml: string): QlcDefinition | null {
  if (typeof DOMParser === 'undefined') return null
  const doc = new DOMParser().parseFromString(xml, 'text/xml')
  if (doc.querySelector('parsererror')) return null

  const text = (parent: Element | Document, tag: string) =>
    parent.querySelector(tag)?.textContent?.trim() ?? ''

  const channels: QlcChannel[] = [...doc.querySelectorAll('FixtureDefinition > Channel')].map(
    (node) => ({
      name: node.getAttribute('Name') ?? '',
      group: node.querySelector('Group')?.textContent?.trim() ?? '',
      colour: node.querySelector('Colour')?.textContent?.trim() || undefined,
      byte: parseInt(node.querySelector('Group')?.getAttribute('Byte') ?? '0', 10) || 0,
    }),
  )

  const modes: QlcMode[] = [...doc.querySelectorAll('FixtureDefinition > Mode')].map((node) => ({
    name: node.getAttribute('Name') ?? 'default',
    channels: [...node.querySelectorAll('Channel')]
      .sort(
        (a, b) =>
          parseInt(a.getAttribute('Number') ?? '0', 10) -
          parseInt(b.getAttribute('Number') ?? '0', 10),
      )
      .map((c) => c.textContent?.trim() ?? ''),
  }))

  if (channels.length === 0) return null

  return {
    manufacturer: text(doc, 'Manufacturer'),
    model: text(doc, 'Model'),
    type: text(doc, 'Type'),
    channels,
    modes,
  }
}
