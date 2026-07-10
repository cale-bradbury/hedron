// ArtNetSender.ts
// Stub for ArtNet DMX output
import type { FixtureColor } from '../DmxLightingPlugin'

export class ArtNetSender {
  constructor() {
    // Initialize ArtNet connection here
  }

  sendDMX(
    colors: Record<string, FixtureColor>,
    opts: { brightness: number; lerpSpeed: number; lerpMode: string },
  ) {
    // TODO: Implement ArtNet DMX packet sending
    console.log('[ArtNet] Sending DMX:', colors, opts)
  }
}
