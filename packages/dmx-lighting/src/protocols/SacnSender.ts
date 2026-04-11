// SacnSender.ts
// Stub for sACN DMX output

export class SacnSender {
  constructor() {
    // Initialize sACN connection here
  }

  sendDMX(colors: Record<string, { value: [number, number, number]; target: string }>, opts: { brightness: number; lerpSpeed: number; lerpMode: string }) {
    // TODO: Implement sACN DMX packet sending
    console.log('[sACN] Sending DMX:', colors, opts)
  }
}
