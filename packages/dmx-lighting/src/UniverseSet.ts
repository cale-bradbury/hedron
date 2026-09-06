import { DMX_UNIVERSE_SIZE } from './address'

export interface DirtyUniverse {
  universe: number
  bytes: Uint8Array
}

/**
 * The renderer-side output buffers: one 512-byte universe per universe number,
 * with byte-level dirty tracking so only changed universes cross the IPC boundary.
 */
export class UniverseSet {
  private buffers = new Map<number, Uint8Array>()
  private dirty = new Set<number>()

  /** Returns the buffer for a universe, allocating it (zeroed) on first use. */
  public get(universe: number): Uint8Array {
    let buffer = this.buffers.get(universe)
    if (!buffer) {
      buffer = new Uint8Array(DMX_UNIVERSE_SIZE)
      this.buffers.set(universe, buffer)
      this.dirty.add(universe)
    }
    return buffer
  }

  /** Writes one 1-based channel, marking the universe dirty only if the byte actually changed. */
  public write(universe: number, channel: number, value: number): void {
    if (channel < 1 || channel > DMX_UNIVERSE_SIZE) return
    const buffer = this.get(universe)
    const byte = value < 0 ? 0 : value > 255 ? 255 : Math.round(value)
    if (buffer[channel - 1] === byte) return
    buffer[channel - 1] = byte
    this.dirty.add(universe)
  }

  /** Forces every allocated universe to be re-sent on the next flush. */
  public markAllDirty(): void {
    for (const universe of this.buffers.keys()) this.dirty.add(universe)
  }

  /** Returns copies of the dirty universes and clears the dirty set. */
  public takeDirty(): DirtyUniverse[] {
    if (this.dirty.size === 0) return []
    const out: DirtyUniverse[] = []
    for (const universe of this.dirty) {
      const buffer = this.buffers.get(universe)
      if (buffer) out.push({ universe, bytes: new Uint8Array(buffer) })
    }
    this.dirty.clear()
    return out
  }

  /** Universe numbers currently allocated, ascending. */
  public universeIds(): number[] {
    return [...this.buffers.keys()].sort((a, b) => a - b)
  }

  /** Read-only view for UI, without exposing the live buffer. */
  public snapshot(universe: number): Uint8Array {
    return new Uint8Array(this.get(universe))
  }

  public clear(): void {
    for (const buffer of this.buffers.values()) buffer.fill(0)
    this.markAllDirty()
  }
}
