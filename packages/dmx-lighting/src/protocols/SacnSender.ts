// SacnSender.ts
// Stub for sACN DMX output
import type { FixtureColor } from '../DmxLightingPlugin'

export class SacnSender {
  constructor() {
    // Initialize sACN connection here
  }

  sendDMX(colors: Record<string, FixtureColor>, opts: { brightness: number; lerpSpeed: number; lerpMode: string }) {
    // TODO: Implement sACN DMX packet sending
    console.log('[sACN] Sending DMX:', colors, opts)
  }
}
