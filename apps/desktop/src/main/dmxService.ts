// DMX Service for Electron Main Process
// Drives the FTDI FT232R chip directly via the 'usb' npm package (libusb).
// Uses USB control transfers to assert/clear BREAK, then a bulk OUT write for
// the DMX packet — same technique as pyftdi, pure TypeScript/Node.js.
import { findByIds, OutEndpoint as UsbOutEndpoint } from 'usb'
import type { Device as UsbDevice, Interface as UsbInterface } from 'usb'

const LIBUSB_TRANSFER_TYPE_BULK = 2 // usb package constant

// ─── FTDI FT232R constants ────────────────────────────────────────────────────
const FTDI_VID = 0x0403
const FTDI_PID = 0x6001
const FTDI_REQ_OUT = 0x40 // bmRequestType: vendor | device | host→device
const FTDI_SIO_RESET = 0x00
const FTDI_SIO_SET_BAUDRATE = 0x03
const FTDI_SIO_SET_DATA = 0x04 // also controls BREAK

// FT232R @ 250 kbaud: 3 MHz clock, divisor = 12 = 0x000C
// Non-H chips do not encode interface in the baud-rate index
const FTDI_BAUD_250K_VAL = 0x000c
const FTDI_BAUD_250K_IDX = 0x0000

// wIndex for line-property/BREAK commands = interface 0 -> 1-based = 1
const FTDI_IFACE_IDX = 0x0001

// Line property: 8 data bits | no parity (0<<8) | 2 stop bits (2<<11) = 0x1008
const FTDI_LINE_8N2 = 0x1008
// Same but with BREAK bit (bit 14) set = 0x5008
const FTDI_LINE_8N2_BREAK = 0x5008

const DMX_FRAME_MS = 30 // ~33 fps

// ─── Types ────────────────────────────────────────────────────────────────────
type ChannelType = 'red' | 'green' | 'blue' | 'white' | 'intensity'

type ChannelSlot =
  | ChannelType
  | { field: ChannelType; scale?: number }
  | { absolute: number }
  | null

interface FixtureMapping {
  startAddresses: number[]
  channels: ChannelSlot[]
}

interface FixtureChannels {
  red?: number
  green?: number
  blue?: number
  white?: number
  intensity?: number
}

interface DmxColor {
  id: string
  channels: FixtureChannels
  mappings?: FixtureMapping[]
}

interface DmxOptions {
  brightness: number
  lerpSpeed: number
  lerpMode: string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Resolve a single ChannelSlot to a clamped 0–255 integer.
 *
 * - `ChannelType` string — reads the named field, applies brightness (except
 *   'intensity' which the sketch is expected to pre-scale).
 * - `{ field, scale? }` — same as above, then multiplies by per-slot scale.
 * - `{ absolute }` — fixed value, brightness is NOT applied.
 * - `null` / undefined — outputs 0 (padding).
 */
function resolveSlot(
  slot: ChannelSlot | null | undefined,
  channels: FixtureChannels,
  brightness: number,
): number {
  if (slot === null || slot === undefined) return 0

  if (typeof slot === 'string') {
    let value = channels[slot] ?? 0
    if (slot !== 'intensity') value = value * brightness
    return Math.min(255, Math.max(0, Math.round(value)))
  }

  if ('absolute' in slot) {
    return Math.min(255, Math.max(0, Math.round(slot.absolute)))
  }

  // { field, scale? }
  let value = channels[slot.field] ?? 0
  if (slot.field !== 'intensity') value = value * brightness
  if (slot.scale !== undefined) value = value * slot.scale
  return Math.min(255, Math.max(0, Math.round(value)))
}

// ─── Service ──────────────────────────────────────────────────────────────────
class DmxService {
  private device: UsbDevice | null = null
  private iface: UsbInterface | null = null
  private outEp: UsbOutEndpoint | null = null
  private universe = Buffer.alloc(512, 0) // smoothed output — what the hardware sees
  private targetUniverse = Buffer.alloc(512, 0) // desired values set by sendColors()
  private smoothedUniverse = new Float32Array(512) // float accumulator for lerp
  private currentLerpSpeed = 0
  private isReady = false
  private running = false
  private initPromise: Promise<void> | null = null
  private lastSentData: Record<number, number> = {}
  private lastSentTime: Date | null = null

  // ── Public API ───────────────────────────────────────────────────────────

  async initialize(): Promise<void> {
    if (this.isReady) return
    if (this.initPromise) return this.initPromise
    this.initPromise = this._doInitialize()
    return this.initPromise
  }

  async sendColors(colors: Record<string, DmxColor>, opts: DmxOptions): Promise<void> {
    if (!this.isReady) await this.initialize()
    if (!this.isReady) return

    this.currentLerpSpeed = Math.max(0, Math.min(1, opts.lerpSpeed ?? 0))

    Object.values(colors).forEach((color) => {
      if (color.mappings && color.mappings.length > 0) {
        color.mappings.forEach((mapping) => {
          mapping.startAddresses.forEach((startAddress) => {
            if (startAddress < 1 || startAddress > 512) return
            mapping.channels.forEach((slot, index) => {
              const dmxAddress = startAddress + index
              if (dmxAddress > 512) return
              const value = resolveSlot(slot, color.channels, opts.brightness)
              this.targetUniverse[dmxAddress - 1] = value
              this.lastSentData[dmxAddress] = value
            })
          })
        })
      }
    })
    this.lastSentTime = new Date()
  }

  async getDevices(): Promise<object[]> {
    const found = !!findByIds(FTDI_VID, FTDI_PID)
    return [
      {
        name: 'FT232R USB UART (usb/libusb)',
        path: 'ftdi://0x0403:0x6001/1',
        driver: 'usb npm package (libusb, pure JS)',
        status: this.isReady
          ? 'Active'
          : found
            ? 'Device found, not initialised'
            : 'Device not found',
        lastSent: this.lastSentTime
          ? `${this.lastSentTime.toLocaleTimeString()}: ${Object.keys(this.lastSentData).length} channels`
          : undefined,
        lastData: this.lastSentTime ? JSON.stringify(this.lastSentData) : undefined,
      },
    ]
  }

  destroy(): void {
    this.running = false
    if (this.iface) {
      try {
        this.iface.release(true, () => {})
      } catch (_e) {
        // ignore
      }
      this.iface = null
    }
    if (this.device) {
      try {
        this.device.close()
      } catch (_e) {
        // ignore
      }
      this.device = null
    }
    this.outEp = null
    this.isReady = false
    this.initPromise = null
    console.log('[DMX] Service destroyed')
  }

  // ── Private ───────────────────────────────────────────────────────────────

  private async _doInitialize(): Promise<void> {
    try {
      const dev = findByIds(FTDI_VID, FTDI_PID)
      if (!dev) {
        console.error('[DMX] FT232R not found (VID 0x0403 PID 0x6001) — is it plugged in?')
        return
      }

      dev.open()

      // Allow libusb to detach the macOS Apple DriverKit FTDI DEXT.
      // Windows has no kernel-driver-detach concept (the driver is swapped for
      // WinUSB via Zadig instead) and throws LIBUSB_ERROR_NOT_SUPPORTED here.
      if (process.platform !== 'win32') {
        dev.setAutoDetachKernelDriver(true)
      }

      // Reset chip, configure 250 kbaud, 8N2
      await this.ctrlOut(dev, FTDI_SIO_RESET, 0x0000, 0x0000)
      await this.ctrlOut(dev, FTDI_SIO_SET_BAUDRATE, FTDI_BAUD_250K_VAL, FTDI_BAUD_250K_IDX)
      await this.ctrlOut(dev, FTDI_SIO_SET_DATA, FTDI_LINE_8N2, FTDI_IFACE_IDX)

      // Claim interface 0
      const iface = dev.interface(0)
      iface.claim()

      // Find the bulk OUT endpoint
      const outEp = iface.endpoints.find(
        (ep): ep is UsbOutEndpoint =>
          ep.direction === 'out' && ep.transferType === LIBUSB_TRANSFER_TYPE_BULK,
      )
      if (!outEp) {
        console.error('[DMX] No bulk OUT endpoint found on FT232R interface 0')
        iface.release(() => dev.close())
        return
      }

      this.device = dev
      this.iface = iface
      this.outEp = outEp
      this.isReady = true
      this.running = true
      console.log('[DMX] FT232R ready via usb/libusb — pure JS, no Python')

      this.scheduleFrame()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error('[DMX] Init failed:', msg)
      this.isReady = false
    }
  }

  /** Recursive scheduler — ensures at most one frame in-flight at a time. */
  private scheduleFrame(): void {
    if (!this.running) return
    setTimeout(async () => {
      await this.sendFrame()
      this.scheduleFrame()
    }, DMX_FRAME_MS)
  }

  private async sendFrame(): Promise<void> {
    if (!this.device || !this.outEp || !this.isReady) return
    try {
      // Assert BREAK for ~2 ms (DMX spec minimum is 88 µs)
      await this.ctrlOut(this.device, FTDI_SIO_SET_DATA, FTDI_LINE_8N2_BREAK, FTDI_IFACE_IDX)
      await sleep(2)
      // Release BREAK — chip returns to IDLE, fulfilling the MAB requirement
      await this.ctrlOut(this.device, FTDI_SIO_SET_DATA, FTDI_LINE_8N2, FTDI_IFACE_IDX)
      await sleep(1)
      // Apply per-channel lerp toward target values
      const factor = 1 - this.currentLerpSpeed
      if (factor >= 1) {
        // lerpSpeed=0 → instant: copy target directly
        this.targetUniverse.copy(this.universe)
        this.smoothedUniverse.set(this.universe)
      } else {
        for (let i = 0; i < 512; i++) {
          this.smoothedUniverse[i] += (this.targetUniverse[i] - this.smoothedUniverse[i]) * factor
          this.universe[i] = Math.round(this.smoothedUniverse[i])
        }
      }

      // Packet: start code 0x00 + 512 channel bytes
      const packet = Buffer.allocUnsafe(513)
      packet[0] = 0x00
      this.universe.copy(packet, 1)
      await this.outEp.transferAsync(packet)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      console.warn('[DMX] Frame error:', msg)
    }
  }

  private ctrlOut(dev: UsbDevice, bRequest: number, wValue: number, wIndex: number): Promise<void> {
    return new Promise((resolve, reject) => {
      dev.controlTransfer(FTDI_REQ_OUT, bRequest, wValue, wIndex, Buffer.alloc(0), (err) => {
        if (err) reject(err)
        else resolve()
      })
    })
  }
}

export const dmxService = new DmxService()
console.log('[DMX Service] Module loaded (usb/libusb — pure JS)')
