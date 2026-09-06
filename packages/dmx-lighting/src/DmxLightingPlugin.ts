import { HedronEngine, IPlugin } from '@hedron-gl/engine'
import { dmxIcon } from '@hedron-gl/ui-core'
import { globalOptionNodesConfig } from './DmxLightingConfig'
import { toAddress } from './address'
import { resolveSlot } from './channelSlots'
import { UniverseSet } from './UniverseSet'
import { UniverseSender, FrameContext } from './UniverseSender'
import { ArtNetSender } from './protocols/ArtNetSender'
import { SacnSender } from './protocols/SacnSender'
import type { Address } from './address'
import type {
  AddressInput,
  ChannelSlot,
  DmxDeviceInfo,
  DmxProtocol,
  FixtureChannels,
  FixtureColor,
  FixtureMapping,
  FixtureMappingInput,
  LerpMode,
} from './types'

export type { Address } from './address'
export type {
  ChannelSlot,
  ChannelType,
  DmxDeviceInfo,
  DmxProtocol,
  FixtureChannels,
  FixtureColor,
  FixtureMapping,
  FixtureMappingInput,
  AddressInput,
  LerpMode,
} from './types'

// Extend Window type for Electron bridge
declare global {
  interface Window {
    electron?: {
      dmxWriteUniverse: (universe: number, bytes: Uint8Array, lerpSpeed: number) => void
      dmxGetDevices: () => Promise<DmxDeviceInfo[]>
    }
    hedron?: {
      engine: HedronEngine
      lighting: {
        setFixtureColor: (
          id: string,
          channels: FixtureChannels,
          options?: {
            mappings?: FixtureMappingInput[]
          },
        ) => void
        setFixtureMappings: (id: string, mappings: FixtureMapping[]) => void
      }
    }
  }
}

export interface DmxLightingState {
  protocol: DmxProtocol
  brightness: number
  lerpSpeed: number
  lerpMode: LerpMode
  colors: Record<string, FixtureColor>
  devices: DmxDeviceInfo[]
}

/** Accepts the legacy `startAddresses: number[]` shape persisted before universes existed. */
function normalizeMappings(raw: unknown): FixtureMapping[] {
  if (!Array.isArray(raw)) return []
  return raw.map((mapping) => ({
    startAddresses: Array.isArray(mapping?.startAddresses)
      ? mapping.startAddresses
          .map((value: AddressInput) => toAddress(value))
          .filter((a: Address | null): a is Address => a !== null)
      : [],
    channels: Array.isArray(mapping?.channels) ? (mapping.channels as ChannelSlot[]) : [],
  }))
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
  private devices: DmxDeviceInfo[] = []
  private universes = new UniverseSet()
  private artnetSender = new ArtNetSender()
  private sacnSender = new SacnSender()
  private sender: UniverseSender

  constructor(engine: HedronEngine) {
    this.engine = engine
    this.sender = new UniverseSender(
      this.universes,
      () => this.composite(),
      this.artnetSender,
      this.sacnSender,
    )
    // The fixed-rate loop composites and ships every tick, so global option changes reach
    // the hardware even when the sketch is paused — no store subscription needed.
    this.sender.start()
  }

  public setFixtureColor(
    id: string,
    channels: FixtureChannels,
    options?: {
      mappings?: FixtureMappingInput[]
    },
  ) {
    if (this.colors[id]) {
      // Mappings are intentionally NOT updated from call-site options after initial
      // creation — use setFixtureMappings() to reconfigure. This prevents sketch
      // code that passes hardcoded options from clobbering user-configured mappings.
      this.colors[id].channels = channels
      return
    }

    const store = this.engine.getStore()
    const storeKey = `${this.id}-fixture-${id}-mappings`
    const savedRaw = store.getState().paramValues[storeKey]

    let mappings: FixtureMapping[] | undefined
    if (savedRaw) {
      try {
        mappings = normalizeMappings(JSON.parse(savedRaw as string))
      } catch (_) {
        /* corrupt store value — ignore and fall through */
      }
    }
    if (!mappings && options?.mappings) {
      mappings = normalizeMappings(options.mappings)
    }

    const resolvedMappings = mappings ?? []
    this.colors[id] = { id, channels, mappings: resolvedMappings }

    // Write back so the panel reads from a single source of truth, and so legacy
    // numeric addresses are persisted in the current { universe, channel } form.
    if (resolvedMappings.length > 0) {
      const normalizedRaw = JSON.stringify(resolvedMappings)
      if (normalizedRaw !== savedRaw) {
        store.setState((state) => {
          state.paramValues[storeKey] = normalizedRaw
          return state
        })
      }
    }
  }

  /**
   * Persist and apply a new mapping for a fixture.
   * Saves to the store so the configuration survives app restarts.
   */
  public setFixtureMappings(id: string, mappings: FixtureMapping[]) {
    if (!this.colors[id]) return
    this.colors[id].mappings = mappings
    const store = this.engine.getStore()
    store.setState((state) => {
      state.paramValues[`${this.id}-fixture-${id}-mappings`] = JSON.stringify(mappings)
      return state
    })
  }

  /** Resolves every fixture into the universe buffers; called once per send tick. */
  private composite(): FrameContext {
    const paramValues = this.engine.getStore().getState().paramValues
    const protocol = (paramValues[`${this.id}-global-protocol`] as DmxProtocol) || 'artnet'
    const brightness = (paramValues[`${this.id}-global-brightness`] as number) ?? 1
    const lerpSpeed = (paramValues[`${this.id}-global-lerpSpeed`] as number) ?? 0.2

    for (const color of Object.values(this.colors)) {
      for (const mapping of color.mappings) {
        for (const address of mapping.startAddresses) {
          mapping.channels.forEach((slot, index) => {
            this.universes.write(
              address.universe,
              address.channel + index,
              resolveSlot(slot, color.channels, brightness),
            )
          })
        }
      }
    }

    return { protocol, lerpSpeed }
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
      const paramValues = this.engine.getStore().getState().paramValues
      const protocol = (paramValues[`${this.id}-global-protocol`] as string) || 'artnet'
      this.devices = [{ name: 'Stub Device', protocol, status: 'Not implemented' }]
    }
  }

  /** Public read access for the panel UI. */
  public getColors(): Record<string, FixtureColor> {
    return this.colors
  }

  /** Public read access for the panel UI. */
  public getDevices(): DmxDeviceInfo[] {
    return this.devices
  }

  /** Live universe bytes for the panel UI. */
  public getUniverseSnapshot(universe: number): Uint8Array {
    return this.universes.snapshot(universe)
  }

  public getUniverseIds(): number[] {
    return this.universes.universeIds()
  }

  public destroy() {
    this.sender.stop()
  }

  logDeviceInfo() {
    console.log('DMX Devices:', this.devices)
    console.log('DMX Colors:', this.colors)
    console.log('DMX Universes:', this.universes.universeIds())
  }

  /** Writes full-on to universe 0 channels 1–20; the send tick picks it up like any other change. */
  testDMX() {
    console.log('[DMX] Sending test pattern to universe 0, channels 1-20')
    for (let channel = 1; channel <= 20; channel++) {
      this.universes.write(0, channel, 255)
    }
  }
}
