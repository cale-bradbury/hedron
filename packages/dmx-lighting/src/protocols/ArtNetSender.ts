// ArtNetSender.ts
// Stub for ArtNet DMX output — consumes raw universe bytes, no fixture knowledge.

export class ArtNetSender {
  constructor() {
    // Initialize ArtNet connection here
  }

  /** Sends one 512-byte universe. */
  sendUniverse(universe: number, bytes: Uint8Array) {
    // TODO: Implement ArtNet packet sending
    console.log('[ArtNet] Universe', universe, bytes.length, 'bytes')
  }
}
