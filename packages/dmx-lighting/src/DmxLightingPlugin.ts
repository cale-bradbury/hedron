import { HedronEngine, IPlugin } from '@hedron-gl/engine'
import { dmxIcon } from '@hedron-gl/ui-core'
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
          options?: {
            mappings?: FixtureMapping[]
          },
        ) => void
        setFixtureMappings: (id: string, mappings: FixtureMapping[]) => void
      }
    }
  }
}
import { ArtNetSender } from './protocols/ArtNetSender'
import { SacnSender } from './protocols/SacnSender'

export type DmxProtocol = 'artnet' | 'sacn' | 'usb'
export type LerpMode = 'linear-rgb' | 'curved-hsb'
export type ChannelType = 'red' | 'green' | 'blue' | 'white' | 'intensity'

/**
 * A single channel slot in a FixtureMapping.
 * - `ChannelType` string: read from virtual channels, apply global brightness (except 'intensity')
 * - `{ field, scale? }`: read field, apply brightness, then multiply by per-slot scale
 * - `{ absolute }`: fixed 0–255 value, brightness NOT applied
 * - `null`: always outputs 0 (padding channel)
 */
export type ChannelSlot =
  | ChannelType
  | { field: ChannelType; scale?: number }
  | { absolute: number }
  | null

/** Maps one or more DMX start addresses to an ordered list of channel slots. */
export interface FixtureMapping {
  /** One or more DMX universe addresses (1–512). Each gets the same resolved bytes. */
  startAddresses: number[]
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
  public static ID = 'dmx-lighting'
  public readonly id = DmxLightingPlugin.ID
  public readonly name = 'DMX Lighting'
  public readonly iconName = dmxIcon
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
  private lastSentColorState: string = ''
  private lastSendTime: number = 0
  private sendThrottleMs: number = 33 // ~30fps max update rate

  constructor(engine: HedronEngine) {
    this.engine = engine
    // Re-send to hardware whenever the user changes a global option node,
    // even when the sketch is paused (no per-frame setFixtureColor calls).
    const store = engine.getStore()
    const globalOptKeys = globalOptionNodesConfig.map((n) => `${this.id}-global-${n.key}`)
    store.subscribe(
      (state) => globalOptKeys.map((k) => state.paramValues[k]).join('\0'),
      () => this.notifyGlobalOptsChanged(),
    )
  }

  public setFixtureColor(
    id: string,
    channels: FixtureChannels,
    options?: {
      mappings?: FixtureMapping[]
    },
  ) {
    if (!this.colors[id]) {
      const store = this.engine.getStore()
      const paramValues = store.getState().paramValues

      // Try persisted mappings first
      let mappings: FixtureMapping[] | undefined
      const savedMappingsRaw = paramValues[`${this.id}-fixture-${id}-mappings`]
      if (savedMappingsRaw) {
        try {
          mappings = JSON.parse(savedMappingsRaw as string) as FixtureMapping[]
        } catch (_) {
          /* corrupt store value — ignore and fall through */
        }
      }

      // Use explicitly provided mappings from call-site options
      if (!mappings && options?.mappings) {
        mappings = options.mappings
      }

      const resolvedMappings = mappings ?? []
      this.colors[id] = { id, channels, mappings: resolvedMappings }

      // Write initial mappings to store so the panel always reads from a single
      // source of truth and doesn't need to fall back to in-memory state.
      if (resolvedMappings.length > 0) {
        const storeForWrite = this.engine.getStore()
        storeForWrite.setState((state) => {
          if (!state.paramValues[`${this.id}-fixture-${id}-mappings`]) {
            state.paramValues[`${this.id}-fixture-${id}-mappings`] =
              JSON.stringify(resolvedMappings)
          }
          return state
        })
      }
    } else {
      this.colors[id].channels = channels
      // Mappings are intentionally NOT updated from call-site options after initial
      // creation — use setFixtureMappings() to reconfigure. This prevents sketch
      // code that passes hardcoded options from clobbering user-configured mappings.
    }
    this.sendDMXData()
  }

  /**
   * Persist and apply a new mapping for a fixture.
   * Saves to the store so the configuration survives app restarts.
   */
  public setFixtureMappings(id: string, mappings: FixtureMapping[]) {
    if (this.colors[id]) {
      this.colors[id].mappings = mappings
      const store = this.engine.getStore()
      store.setState((state) => {
        state.paramValues[`${this.id}-fixture-${id}-mappings`] = JSON.stringify(mappings)
        return state
      })
      this.sendDMXData()
    }
  }

  /**
   * Called from the panel when a global option (brightness, lerp, protocol)
   * changes. Resets the change-detection state and bypasses the throttle so
   * the new value is applied to the hardware immediately.
   */
  public notifyGlobalOptsChanged() {
    this.lastSentColorState = ''
    this.lastSendTime = 0
    this.sendDMXData()
  }

  sendDMXData() {
    // Throttle: only send at most once per throttle interval
    const now = Date.now()
    if (now - this.lastSendTime < this.sendThrottleMs) {
      return
    }

    // Get global options from store — read BEFORE change detection so that
    // a brightness/lerp change is always included in the state hash.
    const store = this.engine.getStore()
    const paramValues = store.getState().paramValues
    const protocol = (paramValues[`${this.id}-global-protocol`] as string) || 'artnet'
    const brightness = (paramValues[`${this.id}-global-brightness`] as number) ?? 1
    const lerpSpeed = (paramValues[`${this.id}-global-lerpSpeed`] as number) ?? 0.2
    const lerpMode = (paramValues[`${this.id}-global-lerpMode`] as string) || 'linear-rgb'

    // Include opts in the hash so that a static scene still re-sends when
    // the user moves a global slider.
    const currentState = JSON.stringify({
      colors: this.colors,
      brightness,
      lerpSpeed,
      lerpMode,
      protocol,
    })
    if (currentState === this.lastSentColorState) {
      return
    }

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
      const protocol = (storeState.paramValues[`${this.id}-global-protocol`] as string) || 'artnet'
      this.devices = [{ name: 'Stub Device', protocol, status: 'Not implemented' }]
    }
  }

  /** Public read access for the panel UI. */
  public getColors(): Record<string, FixtureColor> {
    return this.colors
  }

  /** Public read access for the panel UI. */
  public getDevices(): Array<{
    name: string
    status?: string
    protocol?: string
    driver?: string
    path?: string
    lastSent?: string
    lastData?: string
  }> {
    return this.devices
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
        mappings: [
          {
            startAddresses: [1, 6, 11, 16], // 4 pods of 5 channels each
            channels: ['red', 'green', 'blue', 'white', 'intensity'],
          },
        ],
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
