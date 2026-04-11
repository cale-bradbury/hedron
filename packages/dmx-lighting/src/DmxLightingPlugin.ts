import { HedronEngine, IPlugin, EngineStore } from '@hedron-gl/engine'
import { globalOptionNodesConfig } from './DmxLightingConfig'
import { ArtNetSender } from './protocols/ArtNetSender'
import { SacnSender } from './protocols/SacnSender'

export type DmxProtocol = 'artnet' | 'sacn'
export type LerpMode = 'linear-rgb' | 'curved-hsb'

export interface FixtureColor {
  id: string
  value: [number, number, number]
  target: string // DMX fixture address or label
}

export interface DmxLightingState {
  protocol: DmxProtocol
  brightness: number
  lerpSpeed: number
  lerpMode: LerpMode
  colors: Record<string, FixtureColor>
  devices: any[]
}

export class DmxLightingPlugin implements IPlugin {
  public readonly id = 'dmx-lighting'
  public readonly name = 'DMX Lighting'
  public readonly description = 'Controls DMX lighting fixtures via ArtNet or sACN.'
  public readonly globalOptionNodesConfig = globalOptionNodesConfig
  public readonly optionNodesConfig = []

  private engine: HedronEngine
  private colors: Record<string, FixtureColor> = {}
  private devices: any[] = []
  private artnetSender = new ArtNetSender()
  private sacnSender = new SacnSender()

  constructor(engine: HedronEngine) {
    this.engine = engine
  }

  public setFixtureColor(id: string, rgb: [number, number, number]) {
    if (!this.colors[id]) {
      this.colors[id] = {
        id,
        value: rgb,
        target: '',
      }
    } else {
      this.colors[id].value = rgb
    }
    this.sendDMXData()
  }

  /**
   * Send DMX data to all fixtures using the selected protocol.
   * This is a stub; real implementation should use ArtNet/sACN libraries.
   */
  sendDMXData() {
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
    }
  }

  /**
   * Fetch DMX device info (stub).
   * Replace with real device discovery if available.
   */
  fetchDeviceInfo() {
    // TODO: implement DMX device info fetch using ArtNet/sACN libraries
    const store = this.engine.getStore()
    const storeState = store.getState()
    const protocol = storeState.nodeValues[`${this.id}-global-protocol`] || 'artnet'
    this.devices = [{ name: 'Stub Device', protocol, status: 'Not implemented' }]
  }

  logDeviceInfo() {
    console.log('DMX Devices:', this.devices)
  }
}
