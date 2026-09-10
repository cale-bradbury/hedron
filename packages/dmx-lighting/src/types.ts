import type { Address } from './address'
import type { FieldName } from './fields'

export type DmxProtocol = 'artnet' | 'sacn' | 'usb'
export type LerpMode = 'linear-rgb' | 'curved-hsb'
export type ChannelType = 'red' | 'green' | 'blue' | 'white' | 'intensity'

/**
 * A single channel slot in a FixtureMapping.
 * - a field name: read that field of the encoded pixel, e.g. 'red' or 'pan'
 * - `{ field, scale? }`: read field, apply brightness, then multiply by per-slot scale
 * - `{ absolute }`: fixed 0–255 value, brightness NOT applied
 * - `null`: always outputs 0 (padding channel)
 */
export type ChannelSlot =
  | FieldName
  | { field: FieldName; scale?: number; bits?: 8 | 16; part?: 'coarse' | 'fine' }
  | { absolute: number }
  | null

/** What a sketch may pass as an address: a full Address, a bare channel, or "universe:channel". */
export type AddressInput = Address | number | string

/** The loose mapping shape accepted from sketch call sites, normalised on the way in. */
export interface FixtureMappingInput {
  startAddresses: AddressInput[]
  channels: ChannelSlot[]
}

/** Maps one or more DMX start addresses to an ordered list of channel slots. */
export interface FixtureMapping {
  /** One or more start addresses. Each receives the same resolved bytes. */
  startAddresses: Address[]
  /** Output channel order starting from each startAddress. */
  channels: ChannelSlot[]
}

export interface FixtureChannels {
  red?: number
  green?: number
  blue?: number
  white?: number
  intensity?: number
}

export interface FixtureColor {
  id: string
  channels: FixtureChannels
  mappings: FixtureMapping[]
}

export interface DmxDeviceInfo {
  name: string
  status?: string
  protocol?: string
  driver?: string
  path?: string
  timing?: string
  lastSent?: string
  lastData?: string
}
