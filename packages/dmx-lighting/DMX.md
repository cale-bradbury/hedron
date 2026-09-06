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
      types.ts                ← channel/slot types
      profiles.ts             ← FixtureProfile / FixtureMode / Tap / PatchEntry
      PixelSource.ts          ← named pixel buffers + smoothing + SourceRegistry
      PatchCompiler.ts        ← compiles the patch to flat arrays, executes a frame
      address.ts              ← { universe, channel } addressing + parse/format
      channelSlots.ts         ← resolveSlot(): one ChannelSlot -> one byte (legacy path)
      UniverseSet.ts          ← 512-byte buffers per universe + dirty tracking
      UniverseSender.ts       ← fixed-rate (~44fps) composite-and-flush loop
      core.ts                 ← engine-free exports, for the headless verifier
    scripts/
      verify-patch.mjs        ← asserts universe bytes with no hardware (pnpm verify)
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

Sketches write colours into named pixel sources. The patch — which fixture reads which
pixels and sits at which addresses — is separate config, compiled once into flat arrays.

```
Sketch (renderer)
  └─ hedron.lighting.source("strip", 38).set(i, r, g, b, w, intensity)
       └─ writes SourceRegistry -> PixelSource.target   (no send, no patch lookup)

Send tick (renderer, every 23ms ≈ 44fps — UniverseSender)
  └─ DmxLightingPlugin.composite()
       └─ syncConfigFromStore()      profiles + patch, re-parsed only when changed
       └─ SourceRegistry.smoothAll() per-pixel lerp, linear-rgb or curved-hsb
       └─ compilePatch()             only when the patch or a source shape changed
       └─ executePatch()             one flat loop -> UniverseSet.write()
  └─ UniverseSet.takeDirty()
       └─ protocol === "usb":  window.electron.dmxWriteUniverse(universe, bytes, 0)
            │  ipcRenderer.send (fire and forget, no round trip)
            ▼
       Electron main: ipcMain.on("dmx:writeUniverse")
            └─ dmxService.writeUniverse()
                 └─ universe 0 -> targetUniverse; others held for Art-Net/sACN
       └─ protocol === "artnet" | "sacn": sender.sendUniverse(universe, bytes)  [stubs]

Frame loop (main process, ~33ms — unchanged)
  └─ FTDI BREAK, release, bulk OUT: [0x00] + universe[0..511]
```

Smoothing happens per pixel in the renderer, so the transport is told lerpSpeed 0 and
copies straight through. Only universes whose bytes changed cross the IPC boundary.
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

## The model (packages/dmx-lighting/src/profiles.ts, PixelSource.ts)

Five concepts, each persisted and edited independently:

```typescript
// What sketches write: a named buffer of pixels, 5 floats each (r,g,b,w,intensity), 0–255.
source("strip", 38).set(pixelIndex, r, g, b, w, intensity)

type Address = { universe: number; channel: number }   // channel 1–512

type ChannelSlot =
  | ChannelType                              // read the field, apply brightness
  | { field: ChannelType; scale?: number }   // read + per-slot scale
  | { absolute: number }                     // fixed 0–255, brightness NOT applied
  | null                                     // always 0 (padding)

interface FixtureMode {
  name: string
  header?: ChannelSlot[]   // fixture-level channels before the pixel block
  pixel: ChannelSlot[]     // layout of ONE pixel
  pixelCount: number       // 1 = pot light, 38 = bar
  pixelStride?: number     // defaults to pixel.length
}

interface Tap {
  source: string
  offset?: number   // first source pixel read
  count?: number    // pixels consumed, overriding the mode
}

interface PatchEntry {
  id: string
  name?: string
  profileId: string
  modeName: string
  addresses: Address[]   // fan-out: every address gets the same bytes
  tap: Tap
  enabled?: boolean
}
```

The Tap is what decouples source index from DMX address: eight pots can each read a
different pixel of one strip while keeping their own intensity and strobe channels.

## Value pipeline

```
source pixel -> smoothing (per pixel, linear-rgb or curved-hsb)
             -> tap (offset/count; clamps past the end of the source)
             -> slot resolution (field, scale, absolute, pad)
             -> master brightness (not applied to intensity or absolute slots)
             -> byte -> universe buffer
```

Compilation flattens the whole patch to one entry per output byte, so the per-frame
loop does no lookups, allocation or slot-shape branching. Cost is O(total pixels),
independent of fixture count.

## Persistence and migration

Stored in `paramValues` under `dmx-lighting-profiles`, `dmx-lighting-patch` and
`dmx-lighting-schema-version`. When the version key is absent, any legacy
`dmx-lighting-fixture-<id>-mappings` values are converted to a profile plus one patch
entry each, tapping a source named after the fixture id. `setFixtureColor()` still works
as a shim: it writes pixel 0 of that source and auto-patches from its call-site mappings
the first time a fixture is seen.

## Verifying without hardware

```
pnpm --filter @hedron-gl/dmx-lighting verify
```

Builds the package and runs `scripts/verify-patch.mjs`, which asserts universe bytes for
fan-out, a 38-pixel bar, mid-strip sampling, header/absolute/pad slots, short-source
broadcast, multi-universe routing, conflict detection and dirty tracking.

## Next phase

See `docs/PIXEL_PIPELINE_PLAN.md`. Phases 0 and 1 are done. Phase 2 adds the rest of the
tap transforms — wrapping offset (scroll), reverse and serpentine (flip), and resampling
— followed by encoders for fixed-colour fixtures in Phase 3.
