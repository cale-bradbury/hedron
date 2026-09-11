import type { Address } from './address'
import type { EncoderSpec } from './encoders'
import type { Placement } from './layout'
import type { ChannelSlot } from './types'

export type FixtureShape = 'par' | 'bar' | 'strip' | 'matrix' | 'mover' | 'generic'

/** One addressing layout of a fixture: optional fixture-level channels, then a repeated pixel block. */
export interface FixtureMode {
  name: string
  /** Channels before the pixel block, e.g. a mode or master dimmer channel. */
  header?: ChannelSlot[]
  /** Channel layout of a single pixel. */
  pixel: ChannelSlot[]
  /** Default pixel count; a patch entry's `tap.count` overrides it. */
  pixelCount: number
  /** Channels between pixel starts; defaults to `pixel.length`. */
  pixelStride?: number
  /** How a colour becomes this mode's fields. Defaults to passthrough. */
  encoder?: EncoderSpec
}

export interface FixtureProfile {
  id: string
  name: string
  shape: FixtureShape
  modes: FixtureMode[]
}

/** Physical pixel order of a fixture relative to its logical order. */
export type TapArrangement = 'forward' | 'reverse' | 'serpentine'

/** How the source span maps onto the fixture's pixel count. */
export type TapFit = 'clip' | 'stretch'

/** How a fractional or multi-pixel source position becomes one colour. */
export type TapFilter = 'nearest' | 'linear' | 'average'

/** Which pixels of which source drive a patch entry, and in what order. */
export interface Tap {
  source: string
  /**
   * First source pixel to read. May be fractional, and is the seed for this entry's
   * animatable offset param node — scrolling is this value moving with `wrap` on.
   */
  offset?: number
  /** Pixels consumed, overriding the mode's pixelCount. */
  count?: number
  /** Source pixels advanced per output pixel under `clip`. Defaults to 1. */
  step?: number
  /** Indices wrap around the source instead of clamping to its ends. */
  wrap?: boolean
  arrangement?: TapArrangement
  /** Pixels per segment for `serpentine`; defaults to the whole fixture. */
  segmentSize?: number
  /** `clip` walks the source one step per pixel; `stretch` fits the whole source. */
  fit?: TapFit
  filter?: TapFilter
  /** Sample the source by stage position instead of by index; needs a 2D source. */
  spatial?: boolean
}

export interface PatchEntry {
  id: string
  name?: string
  profileId: string
  modeName: string
  /** Fan-out: every address receives the same resolved bytes. */
  addresses: Address[]
  tap: Tap
  /** Per-fixture trim, seed for this entry's animatable gain param node. Defaults to 1. */
  gain?: number
  /** Where the fixture sits on the stage; drives the stage view and spatial taps. */
  placement?: Placement
  enabled?: boolean
}

/** Node ids for the animatable per-entry values; deterministic so they survive reloads. */
export function tapOffsetNodeId(pluginId: string, entryId: string): string {
  return `${pluginId}-tap-${entryId}-offset`
}

export function tapGainNodeId(pluginId: string, entryId: string): string {
  return `${pluginId}-tap-${entryId}-gain`
}

export const DEFAULT_PROFILES: FixtureProfile[] = [
  {
    id: 'par-rgbwi',
    name: 'PAR / Pot (RGBW + Intensity)',
    shape: 'par',
    modes: [
      {
        name: '5ch RGBWI',
        pixel: ['red', 'green', 'blue', 'white', 'intensity'],
        pixelCount: 1,
      },
    ],
  },
  {
    id: 'par-rgb',
    name: 'PAR / Pot (RGB)',
    shape: 'par',
    modes: [{ name: '3ch RGB', pixel: ['red', 'green', 'blue'], pixelCount: 1 }],
  },
  {
    id: 'bar-rgb',
    name: 'LED Bar (RGB pixels)',
    shape: 'bar',
    modes: [{ name: 'RGB per pixel', pixel: ['red', 'green', 'blue'], pixelCount: 38 }],
  },
  {
    id: 'bar-rgbw',
    name: 'LED Bar (RGBW pixels)',
    shape: 'bar',
    modes: [{ name: 'RGBW per pixel', pixel: ['red', 'green', 'blue', 'white'], pixelCount: 24 }],
  },
  {
    id: 'par-rgbw-mix',
    name: 'PAR (RGBW, white mixed from colour)',
    shape: 'par',
    modes: [
      {
        name: '5ch RGBWI',
        pixel: ['red', 'green', 'blue', 'white', 'intensity'],
        pixelCount: 1,
        encoder: { kind: 'rgbw', whiteExtract: 'min' },
      },
    ],
  },
  {
    id: 'dimmer-1ch',
    name: 'Dimmer (single channel)',
    shape: 'generic',
    modes: [{ name: '1ch', pixel: ['dimmer'], pixelCount: 1, encoder: { kind: 'dimmer' } }],
  },
  {
    id: 'wheel-par',
    name: 'Colour wheel PAR',
    shape: 'par',
    modes: [
      {
        name: 'wheel + dimmer',
        pixel: ['wheel', 'intensity'],
        pixelCount: 1,
        encoder: {
          kind: 'wheel',
          carryIntensity: true,
          entries: [
            { value: 0, color: '#ffffff', label: 'open' },
            { value: 10, color: '#ff0000', label: 'red' },
            { value: 20, color: '#ff8000', label: 'amber' },
            { value: 30, color: '#ffff00', label: 'yellow' },
            { value: 40, color: '#00ff00', label: 'green' },
            { value: 50, color: '#00ffff', label: 'cyan' },
            { value: 60, color: '#0000ff', label: 'blue' },
            { value: 70, color: '#ff00ff', label: 'magenta' },
          ],
        },
      },
    ],
  },
]

export function findProfile(
  profiles: FixtureProfile[],
  profileId: string,
): FixtureProfile | undefined {
  return profiles.find((p) => p.id === profileId)
}

export function findMode(profile: FixtureProfile, modeName: string): FixtureMode | undefined {
  return profile.modes.find((m) => m.name === modeName) ?? profile.modes[0]
}

/** Channels one instance of this mode occupies, given the pixel count actually used. */
export function modeChannelCount(mode: FixtureMode, pixels: number): number {
  const stride = mode.pixelStride ?? mode.pixel.length
  return (mode.header?.length ?? 0) + Math.max(0, pixels) * stride
}

export function makeEntryId(): string {
  return `patch-${Math.random().toString(36).slice(2, 9)}`
}
