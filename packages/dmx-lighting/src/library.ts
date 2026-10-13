import type { FixtureChannel, FixtureType } from './fixtures'
import { repeatHeads } from './fixtures'

const SHUTTER_RANGES = '0–9 closed, 10–245 strobe slow → fast, 246–255 open'
const PROGRAM_RANGES =
  '0–20 off, 21–180 programs 1–8 in steps of 20, 181–200 off, 201–225 motor reset, 226–255 off'

/** Colour macro positions on the Stealth Wash Zoom's 5-channel mode, matched by the wheel encoder. */
const STEALTH_COLOURS = [
  { value: 0, color: '#000000', label: 'off' },
  { value: 8, color: '#ff0000', label: 'red' },
  { value: 13, color: '#00ff00', label: 'green' },
  { value: 18, color: '#0000ff', label: 'blue' },
  { value: 23, color: '#ffffff', label: 'white' },
  { value: 28, color: '#ffff00', label: 'red + green' },
  { value: 33, color: '#00ffff', label: 'green + blue' },
  { value: 38, color: '#8080ff', label: 'blue + white' },
  { value: 43, color: '#ff00ff', label: 'red + blue' },
  { value: 48, color: '#80ff80', label: 'green + white' },
  { value: 53, color: '#ff8080', label: 'red + white' },
  { value: 58, color: '#ffffff', label: 'red + green + blue' },
  { value: 63, color: '#ffff80', label: 'red + green + white' },
  { value: 68, color: '#80ffff', label: 'green + blue + white' },
  { value: 73, color: '#ffffff', label: 'red + green + blue + white' },
]

const RGBW = ['red', 'green', 'blue', 'white']

const wallWasherHeads: FixtureChannel[] = repeatHeads(RGBW, 28)

/** Shipped fixture types. User edits to these are kept by id; they cannot be deleted. */
export const DEFAULT_TYPES: FixtureType[] = [
  {
    id: 'yorkville-lp-led4x',
    name: 'LP-LED4X',
    manufacturer: 'Yorkville',
    shape: 'bar',
    headName: 'Pod',
    description: 'Four LED pods on one bar.',
    modes: [
      {
        name: '8ch (Mode 2)',
        description:
          'DIP switch #10 ON. Intensity and a colour macro per pod; macro ranges are not in the manual, so set them with a channel override.',
        encoder: { kind: 'dimmer' },
        channels: repeatHeads(['intensity', 'macro'], 4),
      },
      {
        name: '20ch (Mode 3)',
        description: 'DIP switch #11 ON. Red, green, blue, white and intensity per pod.',
        channels: repeatHeads([...RGBW, 'intensity'], 4),
      },
    ],
  },
  {
    id: 'eliminator-stealth-wash-zoom',
    name: 'Stealth Wash Zoom',
    manufacturer: 'Eliminator Lighting',
    shape: 'mover',
    description: 'Moving-head RGBW wash with zoom.',
    modes: [
      {
        name: '5ch',
        description:
          'Colour comes from a fixed macro list, so the wheel encoder picks the nearest.',
        encoder: { kind: 'wheel', carryIntensity: true, entries: STEALTH_COLOURS },
        channels: [
          { field: 'pan', default: 128 },
          { field: 'tilt', default: 128 },
          {
            field: 'wheel',
            label: 'Colours',
            description:
              '0–5 off, 6–75 fixed colours in steps of 5, 76–127 colour change slow → fast, 128–133 off, 134–255 colour fade slow → fast',
          },
          { field: 'program', label: 'Internal programs', description: PROGRAM_RANGES },
          { field: 'focus', description: 'Narrow → wide' },
        ],
      },
      {
        name: '16ch',
        channels: [
          { field: 'pan', bits: 16, part: 'coarse', default: 128 },
          { field: 'pan', bits: 16, part: 'fine' },
          { field: 'tilt', bits: 16, part: 'coarse', default: 128 },
          { field: 'tilt', bits: 16, part: 'fine' },
          { field: 'red' },
          { field: 'green' },
          { field: 'blue' },
          { field: 'white' },
          { field: 'intensity', label: 'Master dimmer', default: 255 },
          { field: 'strobe', label: 'Shutter / strobe', default: 255, description: SHUTTER_RANGES },
          { field: 'focus', description: 'Narrow → wide' },
          { field: 'cto', label: 'Colour temperature' },
          {
            field: 'macro',
            label: 'Colour effect',
            description:
              '0–10 off, 11–150 fixed colours in steps of 10, 151–255 colour change slow → fast',
          },
          { field: 'fade', label: 'Colour fade', description: '0–10 off, 11–194 slow → fast' },
          { field: 'speed', label: 'Pan / tilt speed', description: 'Fast → slow' },
          { field: 'program', label: 'Internal programs', description: PROGRAM_RANGES },
        ],
      },
    ],
  },
  {
    id: 'fodexazy-zq06018',
    name: 'ZQ06018 LED Wall Washer',
    manufacturer: 'FODEXAZY',
    shape: 'bar',
    headName: 'Cell',
    description: '28 RGBW cells.',
    modes: [
      {
        name: '4ch',
        description: 'The whole bar as one RGBW light.',
        channels: RGBW.map((field) => ({ field })),
      },
      {
        name: '112ch',
        description: 'RGBW per cell.',
        channels: wallWasherHeads,
      },
      {
        name: '114ch',
        description: 'Master dimmer and strobe, then RGBW per cell.',
        channels: [
          { field: 'dimmer', label: 'Master dimmer', default: 255 },
          { field: 'strobe', label: 'Strobe' },
          ...wallWasherHeads,
        ],
      },
    ],
  },
  {
    id: 'generic-rgb',
    name: 'Generic RGB',
    shape: 'par',
    modes: [{ name: '3ch', channels: ['red', 'green', 'blue'].map((field) => ({ field })) }],
  },
  {
    id: 'generic-rgbw',
    name: 'Generic RGBW',
    shape: 'par',
    modes: [{ name: '4ch', channels: RGBW.map((field) => ({ field })) }],
  },
  {
    id: 'generic-rgbwi',
    name: 'Generic RGBW + intensity',
    shape: 'par',
    modes: [{ name: '5ch', channels: [...RGBW, 'intensity'].map((field) => ({ field })) }],
  },
  {
    id: 'generic-dimmer',
    name: 'Generic dimmer',
    shape: 'generic',
    modes: [{ name: '1ch', encoder: { kind: 'dimmer' }, channels: [{ field: 'dimmer' }] }],
  },
]

export function isShippedType(typeId: string): boolean {
  return DEFAULT_TYPES.some((t) => t.id === typeId)
}

/** Keeps the shipped types available without clobbering user edits to them. */
export function mergeShippedTypes(types: FixtureType[]): FixtureType[] {
  const ids = new Set(types.map((t) => t.id))
  return [...types, ...DEFAULT_TYPES.filter((t) => !ids.has(t.id))]
}

/** Drops malformed types from stored JSON rather than letting one break the DMX tick. */
export function normalizeTypes(raw: unknown): FixtureType[] {
  if (!Array.isArray(raw)) return []
  return raw.filter(
    (t): t is FixtureType =>
      t &&
      typeof t.id === 'string' &&
      Array.isArray(t.modes) &&
      t.modes.every((m: unknown) => m && Array.isArray((m as { channels?: unknown }).channels)),
  )
}
