/** DMX addressing primitives shared by the plugin, the panel and the senders. */

export const DMX_UNIVERSE_SIZE = 512

/** A single DMX slot: a universe number plus a 1-based channel within it. */
export interface Address {
  universe: number
  channel: number
}

export function isValidAddress(address: Address): boolean {
  return (
    Number.isInteger(address.universe) &&
    address.universe >= 0 &&
    Number.isInteger(address.channel) &&
    address.channel >= 1 &&
    address.channel <= DMX_UNIVERSE_SIZE
  )
}

/** Coerces the legacy plain-number form (implicitly universe 0) and `"u:ch"` strings. */
export function toAddress(value: Address | number | string): Address | null {
  if (typeof value === 'number') {
    const address = { universe: 0, channel: value }
    return isValidAddress(address) ? address : null
  }

  if (typeof value === 'string') {
    const parts = value.split(':')
    const nums = parts.map((p) => parseInt(p.trim(), 10))
    if (nums.some((n) => isNaN(n))) return null
    const address =
      nums.length > 1 ? { universe: nums[0], channel: nums[1] } : { universe: 0, channel: nums[0] }
    return isValidAddress(address) ? address : null
  }

  if (value && typeof value === 'object') {
    const address = { universe: value.universe ?? 0, channel: value.channel }
    return isValidAddress(address) ? address : null
  }

  return null
}

/** Parses the panel's comma-separated field, where `"1, 6, 2:14"` means ch1, ch6, universe 2 ch14. */
export function parseAddressList(str: string): Address[] {
  return str
    .split(',')
    .map((part) => toAddress(part))
    .filter((a): a is Address => a !== null)
}

/** Inverse of `parseAddressList`; universe 0 is left implicit so existing rigs read unchanged. */
export function formatAddressList(addresses: Address[]): string {
  return addresses
    .map((a) => (a.universe === 0 ? `${a.channel}` : `${a.universe}:${a.channel}`))
    .join(', ')
}
