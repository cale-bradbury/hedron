export type DmxProtocol = 'artnet' | 'sacn' | 'usb'
export type LerpMode = 'linear-rgb' | 'curved-hsb'
export type ChannelType = 'red' | 'green' | 'blue' | 'white' | 'intensity'

export interface FixtureChannels {
  red?: number
  green?: number
  blue?: number
  white?: number
  intensity?: number
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
