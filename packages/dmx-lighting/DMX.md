# Hedron DMX Lighting — System Overview & Next Phase Prompt

## What this system is

Hedron is a monorepo (pnpm + lerna) visual performance tool built on Electron + React + Three.js. It has a plugin system where packages in `packages/` expose capabilities to live-coded "sketches" in `apps/example-project/`.

The DMX lighting system lets sketches drive physical DMX fixtures in real time.

---

## Repo structure (DMX-relevant)

```
packages/
  dmx-lighting/               ← this package (renderer-side plugin)
    docs/
      PIXEL_PIPELINE_PLAN.md  ← architecture & phased plan for strips/pixel mapping
    src/
      DmxLightingPlugin.ts    ← plugin class, setFixtureColor() API, compositor
      DmxLightingConfig.ts    ← global option nodes (protocol, brightness, lerpSpeed)
      DmxLightingGlobalPanel.tsx
      types.ts                ← fixture/channel/mapping types
      address.ts              ← { universe, channel } addressing + parse/format
      channelSlots.ts         ← resolveSlot(): one ChannelSlot -> one byte
      UniverseSet.ts          ← 512-byte buffers per universe + dirty tracking
      UniverseSender.ts       ← fixed-rate (~44fps) composite-and-flush loop
      protocols/
        ArtNetSender.ts       ← stub, consumes raw universe bytes
        SacnSender.ts         ← stub, consumes raw universe bytes

apps/desktop/
  src/main/
    dmxService.ts             ← Electron main process, drives the USB device
    index.ts                  ← IPC handlers: dmx:writeUniverse, dmx:getDevices
  resources/
    dmx_worker.py             ← legacy Python worker (unused, kept for reference)

apps/example-project/
  sketches/fixture-color/
    index.ts                  ← example sketch calling window.hedron.lighting.setFixtureColor()
```

---

## Data flow (end to end)

The renderer composites fixtures into universe buffers; the main process only transports
bytes. See `docs/PIXEL_PIPELINE_PLAN.md` for where this is heading.

```
Sketch (renderer)
  └─ window.hedron.lighting.setFixtureColor(id, channels, { mappings })
       └─ DmxLightingPlugin.setFixtureColor()
            └─ stores FixtureColor in this.colors[id]   (no send, no JSON)

Send tick (renderer, every 23ms ≈ 44fps — UniverseSender)
  └─ DmxLightingPlugin.composite()
       └─ resolveSlot() per channel slot -> UniverseSet.write(universe, channel, byte)
            └─ byte-level dirty tracking per universe
  └─ UniverseSet.takeDirty()
       └─ protocol === "usb":  window.electron.dmxWriteUniverse(universe, bytes, lerpSpeed)
            │  ipcRenderer.send (fire and forget, no round trip)
            ▼
       Electron main: ipcMain.on("dmx:writeUniverse")
            └─ dmxService.writeUniverse()
                 └─ universe 0 -> this.targetUniverse
                    universe n -> this.otherUniverses (held for Art-Net/sACN)
       └─ protocol === "artnet" | "sacn": sender.sendUniverse(universe, bytes)  [stubs]

Frame loop (main process, ~33ms — unchanged)
  └─ FTDI BREAK via USB control transfer  (2ms)
  └─ BREAK release                        (1ms)
  └─ lerp universe toward targetUniverse
  └─ bulk OUT: [0x00] + universe[0..511]  (250kbaud ≈ 22ms)
```

Only universes whose bytes actually changed cross the IPC boundary, so a static scene
sends nothing while the main-process frame loop keeps refreshing the wire.
## USB hardware layer

- **Device**: Enttec Open DMX USB (or any FTDI FT232R-based "dumb" open DMX dongle)
- **Chip**: FTDI FT232R, VID `0x0403` PID `0x6001`
- **Why pure libusb**: macOS Apple DriverKit FTDI DEXT (`com.apple.DriverKit-AppleUSBFTDI.dext`) blocks the POSIX BREAK signal (`TIOCSBRK`) via the VCP serial layer. The `usb` npm package (which bundles libusb) detaches the DEXT via `setAutoDetachKernelDriver(true)` and sends DMX BREAK via FTDI vendor control transfers directly.
- **Protocol**: 250 kbaud, 8N2, DMX512 framing — BREAK (≥88µs, we use 2ms) + MAB + start code 0x00 + 512 bytes
- **Key USB control transfer values** (FT232R):
  - `bmRequestType = 0x40` (vendor, device, host→device)
  - `SIO_RESET (0x00)`: wValue=0, wIndex=0
  - `SIO_SET_BAUDRATE (0x03)`: wValue=0x000C (250kbaud divisor), wIndex=0
  - `SIO_SET_DATA (0x04)`: wValue=0x1008 (8N2 no break), wValue=0x5008 (8N2 BREAK asserted), wIndex=1

---

## Key types (packages/dmx-lighting/src/types.ts)

```typescript
type ChannelType = 'red' | 'green' | 'blue' | 'white' | 'intensity'

interface Address {
  universe: number      // 0 is the USB dongle; others await Art-Net/sACN output
  channel: number       // 1–512
}

type ChannelSlot =
  | ChannelType                              // read virtual channel, apply brightness
  | { field: ChannelType; scale?: number }   // read + per-slot scale
  | { absolute: number }                     // fixed 0–255, brightness NOT applied
  | null                                     // always 0 (padding)

interface FixtureMapping {
  startAddresses: Address[]   // each receives the same resolved bytes
  channels: ChannelSlot[]     // output channel order from each start address
}

interface FixtureColor {
  id: string
  channels: FixtureChannels   // virtual colour values from the sketch
  mappings: FixtureMapping[]
}
```

Sketches may pass addresses loosely — `1`, `"1"`, `"2:14"` or `{ universe, channel }` —
and `toAddress()` normalises them. Config persisted before universes existed (plain
numbers) is migrated to universe 0 on load and rewritten to the store.
## Current mapping behaviour (renderer — DmxLightingPlugin.composite)

```
for each FixtureColor:
  for each mapping:
    for each address in mapping.startAddresses:
      for (slot, index) in mapping.channels:
        universes.write(address.universe, address.channel + index,
                        resolveSlot(slot, channels, brightness))
```

Limitations today — all addressed by the phased plan in `docs/PIXEL_PIPELINE_PLAN.md`:

- One colour per fixture, so an LED bar needs one fixture per segment
- No source/target decoupling, so no scroll, flip or sampling
- No encoders, so fixed-colour-wheel fixtures cannot be driven
- No physical layout, so no preview and no spatial pixel mapping

## Next phase

See `docs/PIXEL_PIPELINE_PLAN.md`. Phase 0 (universe buffers, fixed-rate sender,
`{ universe, channel }` addressing) is done; Phase 1 introduces sources, fixture
profiles and the patch compiler.
