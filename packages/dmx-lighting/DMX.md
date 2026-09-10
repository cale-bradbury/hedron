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
      DmxLightingConfig.ts    ← global option nodes (protocol, brightness, lerp, dither)
      DmxLightingGlobalPanel.tsx
      types.ts                ← channel/slot types
      profiles.ts             ← FixtureProfile / FixtureMode / Tap / PatchEntry
      encoders.ts             ← colour -> device fields, incl. Oklab wheel matching
      fields.ts               ← open field-name registry
      PixelSource.ts          ← named pixel buffers + smoothing + SourceRegistry
      PatchCompiler.ts        ← compiles the patch to flat arrays, resolves taps, writes
      address.ts              ← { universe, channel } addressing + parse/format
      channelSlots.ts         ← resolveSlot(): one ChannelSlot -> one byte (legacy path)
      UniverseSet.ts          ← 512-byte buffers per universe + dirty tracking
      UniverseSender.ts       ← fixed-rate (~44fps) composite-and-flush loop
      core.ts                 ← engine-free exports, for the headless verifier
      protocols/
        ArtNetSender.ts       ← stub, consumes raw universe bytes
        SacnSender.ts         ← stub, consumes raw universe bytes
    scripts/
      verify-patch.mjs        ← asserts universe bytes with no hardware (pnpm verify)

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

Frame loop (main process, paced by the wire at ~38-40fps)
  └─ FTDI BREAK, release, bulk OUT: [0x00] + universe[0..511]
```

Smoothing happens per pixel in the renderer, so the transport is told lerpSpeed 0 and
copies straight through. Only universes whose bytes changed cross the IPC boundary.

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

## The model (packages/dmx-lighting/src/profiles.ts, PixelSource.ts)

Five concepts, each persisted and edited independently:

```typescript
// What sketches write: a named buffer of pixels, 5 floats each (r,g,b,w,intensity), 0–255.
source("strip", 38).set(pixelIndex, r, g, b, w, intensity)

type Address = { universe: number; channel: number }   // channel 1–512

type ChannelSlot =
  | FieldName                                // any field name, open registry
  | { field: FieldName; scale?: number;      // read + per-slot scale
      bits?: 8 | 16; part?: 'coarse' | 'fine' }   // half of a 16-bit pair
  | { absolute: number }                     // fixed 0–255
  | null                                     // always 0 (padding)

interface FixtureMode {
  name: string
  header?: ChannelSlot[]   // fixture-level channels before the pixel block
  pixel: ChannelSlot[]     // layout of ONE pixel
  pixelCount: number       // 1 = pot light, 38 = bar
  pixelStride?: number     // defaults to pixel.length
  encoder?: EncoderSpec    // colour -> fields; defaults to passthrough
}

interface Tap {
  source: string
  offset?: number        // first source pixel; fractional allowed, animatable
  count?: number         // pixels consumed, overriding the mode
  step?: number          // source pixels per output pixel under clip
  wrap?: boolean         // indices wrap instead of clamping
  arrangement?: 'forward' | 'reverse' | 'serpentine'
  segmentSize?: number   // pixels per serpentine segment
  fit?: 'clip' | 'stretch'
  filter?: 'nearest' | 'linear' | 'average'
}

interface PatchEntry {
  id: string
  name?: string
  profileId: string
  modeName: string
  addresses: Address[]   // fan-out: every address gets the same bytes
  tap: Tap
  gain?: number          // per-fixture trim, animatable
  enabled?: boolean
}
```

The Tap is what decouples source index from DMX address: eight pots can each read a
different pixel of one strip while keeping their own intensity and strobe channels.

### Tap transforms

| Want | Set |
| --- | --- |
| Scroll the strip | animate **Offset** with **Wrap** on |
| Smooth sub-pixel scroll | the same, plus **Filter: linear** |
| Flip the bar | **Arrangement: reverse** |
| Flip alternate segments | **Arrangement: serpentine** + **Segment Size** |
| Zig-zag matrix wiring | the same; segment size is the row length |
| Fit a 16px source to a 38px bar | **Fit: stretch** (+ linear to interpolate) |
| One pot follows a span | **Pixels: 1**, **Step: N**, **Filter: average** |
| Every other pixel | **Step: 2** |

Offset and gain are param nodes (`dmx-lighting-tap-<entryId>-offset` / `-gain`), so an
LFO, MIDI control or timeline track drives them like any other param — scrolling needs
no sketch code. The values stored on the tap seed those nodes and are the fallback when
a node is missing, which is how the headless verifier drives them.

A position identifies a point in source space, and `nearest` floors it to the pixel
containing it. Positions past the ends wrap or clamp per `wrap`, so a one-pixel source
still broadcasts to a whole fixture.

## Value pipeline

```
source pixel -> smoothing (per pixel, linear-rgb or curved-hsb)
             -> tap (arrangement, offset, step, wrap, fit, filter)
             -> per-entry gain, then master brightness (colour only)
             -> encoder -> named device fields
             -> slot resolution (field, scale, absolute, pad, 16-bit part)
             -> optional temporal dither -> byte -> universe buffer
```

Gain and brightness scale the colour before encoding and deliberately leave the source
intensity alone, so an RGBW+intensity fixture does not dim twice. Encoders that drive a
dimmer channel derive it from the already-scaled colour, so brightness still reaches a
dimmer-only or colour-wheel fixture — through the channel that fixture actually has.

Each frame runs `resolveTaps()` then `executePatch()`. Resolve samples every tap into
one shared buffer of instance pixels; execute is the flat write loop reading that
buffer. Compilation flattens the whole patch to one entry per output byte and bakes
the arrangement into each tap, so a frame only adds the current offset. Cost is
O(total pixels), independent of fixture count.

### Temporal dithering

DMX carries 8 bits per channel, and a slow fade shows all 256 steps — worst at the
bottom of the range, where one code is a large relative change in light. The
**Temporal Dither** option (on by default) carries each channel’s rounding error into
the next frame, so 100.25 goes out as 100, 100, 100, 101 and averages correctly. It
buys sub-byte resolution in exchange for a 1-LSB flutter at the refresh rate.

Exact integer values carry no error, so a settled scene still sends nothing. Turn the
option off for fixtures that do their own smoothing or visibly flicker.

This is a workaround for 8-bit channels, not a substitute for a fixture’s 16-bit mode;
16-bit slots arrive with the encoders in phase 3.

### Output rate

The renderer composites every 23ms (~44fps). The main-process frame loop targets 25ms,
but a frame costs ~25ms of wire time on its own (2ms BREAK + 1ms MAB + 22.6ms for 513
bytes at 250kbaud, 8N2), so the loop is paced by the wire at roughly 38–40fps, near the
DMX512 ceiling. `scheduleFrame` subtracts the time the frame took rather than adding a
full delay after it — doing the latter cost about half the achievable rate and showed
up as stepping on moving gradients.

## Encoders

A mode may declare how a colour becomes its fields. `passthrough` is the default and
writes red/green/blue/white/intensity unchanged, so every profile written before
encoders behaves exactly as it did.

| Kind | Produces | Notes |
| --- | --- | --- |
| `passthrough` | r, g, b, w, intensity | the pre-encoder behaviour |
| `rgb` | r, g, b | |
| `rgbw` | + white | `whiteExtract`: none / min / max-preserve, configurable white point |
| `rgbwa` | + amber | amber pulled from what is left after white |
| `cmy` | cyan, magenta, yellow | subtractive |
| `dimmer` | dimmer, intensity | Rec. 709 luma |
| `hsi` | hue, saturation, intensity | |
| `wheel` | wheel, intensity | nearest palette entry in Oklab |

The wheel matches on hue rather than level — the colour is normalised before comparing —
so a dimmed blue still selects blue and the level lands on the intensity channel instead
of dragging the match toward black. White extraction for `rgbwa` is a practical
heuristic, not a spectral fit; it pulls the common grey onto white, then pulls amber out
of the remainder the same way.

## 16-bit channels

A slot may take half of a 16-bit pair:

```typescript
pixel: [{ field: 'pan', bits: 16, part: 'coarse' }, { field: 'pan', bits: 16, part: 'fine' }]
```

The field is scaled to 0-65535 and split. The coarse byte is never dithered, since the
fine byte already carries that resolution and dithering the two independently would
fight.

## Field names

`FieldName` is an open string. `WELL_KNOWN_FIELDS` seeds the table and the slot dropdown
(red, green, blue, white, amber, uv, cyan, magenta, yellow, intensity, dimmer, hue,
saturation, wheel, strobe, pan, tilt, zoom, focus, gobo, prism, cto, speed), but a
profile may name anything and the compiler appends it. Fields no encoder writes resolve
to 0 until something drives them, so a pan channel today needs an `{ absolute }` slot.

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
fan-out, a 38-pixel bar, mid-strip sampling, tap transforms, encoders, 16-bit pairs,
header/absolute/pad slots, short-source broadcast, multi-universe routing, conflict
detection, dithering and dirty tracking.

## Next phase

See `docs/PIXEL_PIPELINE_PLAN.md`. Phases 0 to 3 are done. Phase 4 is the patch UI and
fixture library — a profile library, a sortable patch table, auto-addressing, overlap
detection and a universe heatmap.
