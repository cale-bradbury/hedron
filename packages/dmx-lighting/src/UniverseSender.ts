import { ArtNetSender } from './protocols/ArtNetSender'
import { SacnSender } from './protocols/SacnSender'
import type { DmxProtocol } from './types'
import type { UniverseSet } from './UniverseSet'

/** ~44 Hz, comfortably above the DMX512 refresh floor and independent of render fps. */
export const SEND_INTERVAL_MS = 23

export interface FrameContext {
  protocol: DmxProtocol
  lerpSpeed: number
}

/**
 * Drives output at a fixed rate: composite the frame, then ship only the universes
 * whose bytes changed. Replaces the old per-setFixtureColor push and its JSON throttle.
 */
export class UniverseSender {
  private timer: ReturnType<typeof setInterval> | null = null
  private lastProtocol: DmxProtocol | null = null
  private lastLerpSpeed: number | null = null

  constructor(
    private universes: UniverseSet,
    private prepareFrame: () => FrameContext,
    private artnet: ArtNetSender,
    private sacn: SacnSender,
  ) {}

  public start(): void {
    if (this.timer) return
    this.timer = setInterval(() => this.tick(), SEND_INTERVAL_MS)
  }

  public stop(): void {
    if (!this.timer) return
    clearInterval(this.timer)
    this.timer = null
  }

  private tick(): void {
    const context = this.prepareFrame()

    // A protocol or lerp change alters how existing bytes are transmitted, not the bytes
    // themselves, so force a resend rather than waiting for the next value change.
    if (context.protocol !== this.lastProtocol || context.lerpSpeed !== this.lastLerpSpeed) {
      this.universes.markAllDirty()
      this.lastProtocol = context.protocol
      this.lastLerpSpeed = context.lerpSpeed
    }

    const dirty = this.universes.takeDirty()
    if (dirty.length === 0) return

    for (const { universe, bytes } of dirty) {
      if (context.protocol === 'usb') {
        window?.electron?.dmxWriteUniverse?.(universe, bytes, context.lerpSpeed)
      } else if (context.protocol === 'artnet') {
        this.artnet.sendUniverse(universe, bytes)
      } else if (context.protocol === 'sacn') {
        this.sacn.sendUniverse(universe, bytes)
      }
    }
  }
}
