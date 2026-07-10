# Hedron DMX Lighting — System Overview & Next Phase Prompt

## What this system is

Hedron is a monorepo (pnpm + lerna) visual performance tool built on Electron + React + Three.js. It has a plugin system where packages in `packages/` expose capabilities to live-coded "sketches" in `apps/example-project/`.

The DMX lighting system lets sketches drive physical DMX fixtures in real time.

---

## Repo structure (DMX-relevant)

```
packages/
  dmx-lighting/               ← this package (renderer-side plugin)
    src/
      DmxLightingPlugin.ts    ← main plugin class, setFixtureColor() API
      DmxLightingConfig.ts    ← global option nodes (protocol, brightness, lerpSpeed)
      DmxLightingGlobalPanel.tsx
      protocols/
        ArtNetSender.ts       ← stub
        SacnSender.ts         ← stub

apps/desktop/
  src/main/
    dmxService.ts             ← Electron main process, drives the USB device
    index.ts                  ← IPC handlers: dmx:send, dmx:getDevices
  resources/
    dmx_worker.py             ← legacy Python worker (unused, kept for reference)

apps/example-project/
  sketches/fixture-color/
    index.ts                  ← example sketch calling window.hedron.lighting.setFixtureColor()
```

---

## Data flow (end to end)

```
Sketch (renderer)
  └─ window.hedron.lighting.setFixtureColor(id, channels, { channelMap, podCount })
       └─ DmxLightingPlugin.setFixtureColor()
            └─ stores FixtureColor in this.colors[id]
            └─ calls sendDMXData()  [throttled to ~30fps]
                 └─ if protocol === 'usb':
                      window.electron.dmxSend(this.colors, opts)
                           │  IPC over contextBridge
                           ▼
                      Electron main: ipcMain.handle('dmx:send')
                           └─ dmxService.sendColors(colors, opts)
                                └─ writes into this.universe[0..511]
                                     (frame loop runs separately at ~30fps)

Frame loop (main process, ~33ms)
  └─ FTDI BREAK via USB control transfer  (2ms)
  └─ BREAK release                        (1ms)
  └─ bulk OUT: [0x00] + universe[0..511]  (250kbaud ≈ 22ms)
```

---

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

## Key types (packages/dmx-lighting/src/DmxLightingPlugin.ts)

```typescript
type ChannelType = 'red' | 'green' | 'blue' | 'white' | 'intensity'

interface FixtureChannels {
  red?: number      // 0–255
  green?: number
  blue?: number
  white?: number
  intensity?: number
}

interface FixtureColor {
  id: string
  channels: FixtureChannels       // virtual colour values from the sketch
  target: string                  // DMX start address, e.g. "1" or "universe:1"
  channelMap: ChannelType[]       // output order, e.g. ['red','green','blue','white','intensity']
  podCount?: number               // repeat the same mapping N times consecutively (default 1)
}
```

---

## Current swizzle / address mapping (dmxService.ts — sendColors)

The current implementation is minimal:

```
for each FixtureColor:
  startAddress = parseInt(color.target)       // single start address
  for pod in 0..podCount:
    for (channelType, index) in channelMap:
      dmxAddress = startAddress + pod * channelsPerPod + index
      value = channels[channelType] ?? 0
      if channelType !== 'intensity': value *= brightness
      universe[dmxAddress - 1] = clamp(0, 255, round(value))
```

Limitations today:
- One start address per fixture (no multi-universe scatter)
- No way to override an individual channel with an absolute value
- No way to exclude/reorder channels at send time beyond the static `channelMap` array
- `podCount` repeats are identical — no pod-level overrides

---

## Next phase — advanced channel mapping (your prompt for the fresh chat)

> **Context**: This is the Hedron repo. Read `packages/dmx-lighting/DMX.md` for the full system overview before doing anything else.
>
> **Goal**: Expand the swizzle layer between the virtual `FixtureChannels` partial and the real DMX universe so that:
>
> 1. **Multiple output addresses** — A single fixture can fan out to an arbitrary list of comma seperated DMX start addresses (not just one). All addresses get the same resolved channel bytes.
>
> 2. **Ordered channel selection** — Instead of just `channelMap: ChannelType[]`, each slot in the output can specify:
>    - which field from `FixtureChannels` to read from (`'red' | 'green' | 'blue' | 'white' | 'intensity'`). keep in mind `FixtureChannels` will likely expand in the future as we get access to more devices
>    - OR an **absolute override value** (0–255) that ignores the virtual colour entirely
>    - OR `null` / omitted to send `0` (useful for padding channels a fixture requires)
>
> 3. **Independent control** — The mapping should be expressible per-fixture in the sketch API and also saveable/configurable in the Hedron UI store (like `target` is today).
>
> **Guiding design**:
> Replace `channelMap: ChannelType[]` + `target: string` + `podCount?: number` with a richer structure roughly like:
>
> ```typescript
> type ChannelSlot =
>   | ChannelType                // read from virtual channels, apply brightness
>   | { field: ChannelType; scale?: number }   // read + per-slot scale
>   | { absolute: number }       // fixed 0–255, brightness NOT applied
>   | null                       // always 0
>
> interface FixtureMapping {
>   startAddresses: number[]     // one or more DMX universe addresses
>   channels: ChannelSlot[]      // output channel order from each start address
> }
>
> interface FixtureColor {
>   id: string
>   channels: FixtureChannels    // virtual values from the sketch (unchanged)
>   mappings: FixtureMapping[]   // replaces target + channelMap + podCount
> }
> ```
>
> **Where the work lives**:
> - `packages/dmx-lighting/src/DmxLightingPlugin.ts` — update `FixtureColor`, `setFixtureColor()` signature, update `sendDMXData()` to pass the new structure through the IPC call
> - `apps/desktop/src/main/dmxService.ts` — update `sendColors()` to execute the new mapping logic and write to `this.universe`
> - `apps/example-project/sketches/fixture-color/index.ts` — update the example sketch call to use the new API
> - Keep backward-compat or migration in mind: the store persists `target` values — handle gracefully
>
> Do not touch the USB frame loop, `_doInitialize`, `scheduleFrame`, `sendFrame`, or `ctrlOut` in `dmxService.ts` — those are working and must not change.
