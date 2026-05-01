import { HedronEngine, IPlugin } from '@hedron-gl/engine'
import { globalOptionNodesConfig } from './DmxLightingConfig'

// Extend Window type for Electron bridge
declare global {
  interface Window {
    electron?: {
      dmxSend: (colors: any, opts: any) => Promise<void>
      dmxGetDevices: () => Promise<any[]>
    }
    hedron?: {
      engine: HedronEngine
      lighting: {
        setFixtureColor: (
          id: string,
          channels: FixtureChannels,
          options?: { channelMap?: ChannelType[]; podCount?: number },
        ) => void
      }
    }
  }
}
import { ArtNetSender } from './protocols/ArtNetSender'
import { SacnSender } from './protocols/SacnSender'

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

export interface FixtureColor {
  id: string
  channels: FixtureChannels
  target: string // DMX fixture start address
  channelMap: ChannelType[] // Order of channels from start address
  podCount?: number // Number of fixture pods to control (default: 1)
}

export interface DmxLightingState {
  protocol: DmxProtocol
  brightness: number
  lerpSpeed: number
  lerpMode: LerpMode
  colors: Record<string, FixtureColor>
  devices: Array<{
    name: string
    status?: string
    protocol?: string
    driver?: string
    path?: string
    lastSent?: string
    lastData?: string
  }>
}

export class DmxLightingPlugin implements IPlugin {
  public readonly id = 'dmx-lighting'
  public readonly name = 'DMX Lighting'
  public readonly description = 'Controls DMX lighting fixtures via ArtNet or sACN.'
  public readonly globalOptionNodesConfig = globalOptionNodesConfig
  public readonly optionNodesConfig = []

  private engine: HedronEngine
  private colors: Record<string, FixtureColor> = {}
  private devices: Array<{
    name: string
    status?: string
    protocol?: string
    driver?: string
    path?: string
    lastSent?: string
    lastData?: string
  }> = []
  private artnetSender = new ArtNetSender()
  private sacnSender = new SacnSender()
  private defaultChannelMap: ChannelType[] = ['red', 'green', 'blue', 'white', 'intensity']
  private lastSentColorState: string = ''
  private lastSendTime: number = 0
  private sendThrottleMs: number = 33 // ~30fps max update rate

  constructor(engine: HedronEngine) {
    this.engine = engine
  }

  public setFixtureColor(
    id: string,
    channels: FixtureChannels,
    options?: {
      channelMap?: ChannelType[]
      podCount?: number
    },
  ) {
    if (!this.colors[id]) {
      // Load saved target from store if it exists
      const store = this.engine.getStore()
      const savedTarget = store.getState().nodeValues[`${this.id}-fixture-${id}-target`] || ''

      this.colors[id] = {
        id,
        channels,
        target: savedTarget as string,
        channelMap: options?.channelMap || this.defaultChannelMap,
        podCount: options?.podCount || 1,
      }
    } else {
      this.colors[id].channels = channels
      if (options?.channelMap) {
        this.colors[id].channelMap = options.channelMap
      }
      if (options?.podCount !== undefined) {
        this.colors[id].podCount = options.podCount
      }
    }
    this.sendDMXData()
  }

  public setFixtureTarget(id: string, target: string) {
    if (this.colors[id]) {
      this.colors[id].target = target
      // Save to store for persistence
      const store = this.engine.getStore()
      store.setState((state) => {
        state.nodeValues[`${this.id}-fixture-${id}-target`] = target
        return state
      })
      this.sendDMXData()
    }
  }

  /**
   * Send DMX data to all fixtures using the selected protocol.
   * Throttled to prevent excessive updates.
   */
  sendDMXData() {
    // Throttle: only send at most once per throttle interval
    const now = Date.now()
    if (now - this.lastSendTime < this.sendThrottleMs) {
      return
    }

    // Check if colors have actually changed
    const currentState = JSON.stringify(this.colors)
    if (currentState === this.lastSentColorState) {
      return // No changes, skip send
    }

    // Get global options from store
    const store = this.engine.getStore()
    const storeState = store.getState()
    const nodeValues = storeState.nodeValues
    const protocol = nodeValues[`${this.id}-global-protocol`] || 'artnet'
    const brightness = nodeValues[`${this.id}-global-brightness`] ?? 1
    const lerpSpeed = nodeValues[`${this.id}-global-lerpSpeed`] ?? 0.2
    const lerpMode = nodeValues[`${this.id}-global-lerpMode`] || 'linear-rgb'

    const opts = { brightness, lerpSpeed, lerpMode }
    if (protocol === 'artnet') {
      this.artnetSender.sendDMX(this.colors, opts)
    } else if (protocol === 'sacn') {
      this.sacnSender.sendDMX(this.colors, opts)
    } else if (protocol === 'usb') {
      // Call Electron bridge for USB DMX
      if (window?.electron?.dmxSend) {
        window.electron.dmxSend(this.colors, opts)
      }
    }

    // Update throttle tracking
    this.lastSentColorState = currentState
    this.lastSendTime = now
  }

  /**
   * Fetch DMX device info (stub).
   * Replace with real device discovery if available.
   */
  async fetchDeviceInfo() {
    // Try to fetch devices from Electron bridge
    if (window?.electron?.dmxGetDevices) {
      try {
        this.devices = await window.electron.dmxGetDevices()
      } catch (error) {
        console.error('[DMX] Failed to fetch devices:', error)
        this.devices = [{ name: 'Error fetching devices', status: 'Error' }]
      }
    } else {
      // Fallback for non-Electron environments
      const store = this.engine.getStore()
      const storeState = store.getState()
      const protocol = storeState.nodeValues[`${this.id}-global-protocol`] || 'artnet'
      this.devices = [{ name: 'Stub Device', protocol, status: 'Not implemented' }]
    }
  }

  logDeviceInfo() {
    console.log('DMX Devices:', this.devices)
    console.log('DMX Colors:', this.colors)
  }

  testDMX() {
    // Send a test pattern: full white on channels 1-5
    console.log('[DMX] Sending test pattern...')
    console.log('[DMX] window.electron:', window?.electron)
    console.log('[DMX] window.electron.dmxSend:', window?.electron?.dmxSend)

    if (window?.electron?.dmxSend) {
      const testColor: FixtureColor = {
        id: 'test',
        channels: {
          red: 255,
          green: 255,
          blue: 255,
          white: 255,
          intensity: 255,
        },
        target: '1',
        channelMap: ['red', 'green', 'blue', 'white', 'intensity'],
        podCount: 4,
      }
      const testColors = { test: testColor }
      const testOpts = { brightness: 1, lerpSpeed: 0, lerpMode: 'linear-rgb' }

      console.log('[DMX] Calling window.electron.dmxSend with:', testColors, testOpts)
      window.electron
        .dmxSend(testColors, testOpts)
        .then(() => console.log('[DMX] dmxSend promise resolved'))
        .catch((err) => console.error('[DMX] dmxSend promise rejected:', err))

      console.log('[DMX] Test pattern sent:', testColor)
    } else {
      console.error('[DMX] No electron bridge available')
      console.error('[DMX] window object:', window)
    }
  }
}
