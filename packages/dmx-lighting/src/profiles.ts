import type { Address } from './address'
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
}

export interface FixtureProfile {
  id: string
  name: string
  shape: FixtureShape
  modes: FixtureMode[]
}

/** Which pixels of which source drive a patch entry. Phase 2 adds wrap, reverse and resampling. */
export interface Tap {
  source: string
  /** First source pixel to read. */
  offset?: number
  /** Pixels consumed, overriding the mode's pixelCount. */
  count?: number
}

export interface PatchEntry {
  id: string
  name?: string
  profileId: string
  modeName: string
  /** Fan-out: every address receives the same resolved bytes. */
  addresses: Address[]
  tap: Tap
  enabled?: boolean
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
