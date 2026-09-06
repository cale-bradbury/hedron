import type { ChannelSlot, FixtureChannels } from './types'

/**
 * Resolves a single ChannelSlot to a clamped 0–255 integer.
 * Brightness applies to virtual fields but never to `intensity` or `{ absolute }`.
 */
export function resolveSlot(
  slot: ChannelSlot | undefined,
  channels: FixtureChannels,
  brightness: number,
): number {
  if (slot === null || slot === undefined) return 0

  if (typeof slot === 'string') {
    const value = slot === 'intensity' ? (channels[slot] ?? 0) : (channels[slot] ?? 0) * brightness
    return clampByte(value)
  }

  if ('absolute' in slot) return clampByte(slot.absolute)

  let value = channels[slot.field] ?? 0
  if (slot.field !== 'intensity') value = value * brightness
  if (slot.scale !== undefined) value = value * slot.scale
  return clampByte(value)
}

function clampByte(value: number): number {
  return Math.min(255, Math.max(0, Math.round(value)))
}
