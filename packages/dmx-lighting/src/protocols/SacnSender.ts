// SacnSender.ts
// Stub for sACN DMX output — consumes raw universe bytes, no fixture knowledge.

export class SacnSender {
  constructor() {
    // Initialize sACN connection here
  }

  /** Sends one 512-byte universe. */
  sendUniverse(universe: number, bytes: Uint8Array) {
    // TODO: Implement sACN packet sending
    console.log('[sACN] Universe', universe, bytes.length, 'bytes')
  }
}
