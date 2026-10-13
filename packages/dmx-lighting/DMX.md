# Hedron DMX Lighting — System Overview

## What this system is

Hedron is a monorepo (pnpm + lerna) visual performance tool built on Electron + React + Three.js. It has a plugin system where packages in `packages/` expose capabilities to live-coded "sketches" in `apps/example-project/`.

The DMX lighting system lets sketches drive physical DMX fixtures in real time. Sketches only
ever write colours; which lights exist, where they are patched and which colours reach which
of their heads is configuration, edited in the panel.

---

## Repo structure (DMX-relevant)

```
packages/
  dmx-lighting/               ← this package (renderer-side plugin)
    docs/
      PIXEL_PIPELINE_PLAN.md  ← architecture & phased plan for strips/pixel mapping
    src/
      DmxLightingPlugin.ts    ← plugin class, sketch API, compositor, library persistence
      DmxLightingConfig.ts    ← global option nodes (protocol, brightness, lerp, dither)
      DmxLightingGlobalPanel.tsx
      fixtures.ts             ← FixtureType / FixtureMode / FixtureInstance / Mapping
      library.ts              ← shipped fixture types, incl. the real rig's lights
      encoders.ts             ← colour -> device fields, incl. Oklab wheel matching
      fields.ts               ← open field-name registry
      rigTools.ts             ← footprints, sharing, auto-addressing, channel descriptions
      layout.ts               ← placement, head world positions, stage mapping
      rigFile.ts              ← export/import the whole rig as JSON
      qlcImport.ts            ← QLC+ .qxf fixture definitions -> fixture types
      panel/                  ← the global panel, split by concern
        RigTable.tsx          ← one row per light, identify and duplicate
        FixtureEditor.tsx     ← type, mode, address and placement of one light
        MappingList.tsx       ← one row per mapping
        MappingEditor.tsx     ← source range, spread/reduce, transforms, targets
        TargetEditor.tsx      ← ordered fixtures, heads picked by chip
        MappingPreviewStrip.tsx ← the pixels a mapping reads, and what each head gets
        UniverseHeatmap.tsx   ← the channel map: hover tooltip, highlight, overrides
        LibraryEditor.tsx     ← fixture types, modes, channel tables, QLC+ import
        StageView.tsx         ← top-down rig plan, live colours per head, drag to place
        PlacementEditor.tsx   ← position, rotation, size
        RigFileControls.tsx   ← rig export and import
        SourcePreview.tsx     ← live per-pixel swatches
        EncoderEditor.tsx     ← encoder kind, white extraction, wheel positions
        styles.ts             ← shared panel styling
      PixelSource.ts          ← named pixel buffers + smoothing + SourceRegistry
      RigCompiler.ts          ← compiles the rig to flat arrays, resolves mappings, writes
      address.ts              ← { universe, channel } addressing + parse/format
      UniverseSet.ts          ← 512-byte buffers per universe + dirty tracking
      UniverseSender.ts       ← fixed-rate (~44fps) composite-and-flush loop
      core.ts                 ← engine-free exports, for the headless verifier
      protocols/
        ArtNetSender.ts       ← stub, consumes raw universe bytes
        SacnSender.ts         ← stub, consumes raw universe bytes
    scripts/
      verify-rig.mjs          ← asserts universe bytes with no hardware (pnpm verify)

apps/desktop/
  src/main/
    dmxService.ts             ← Electron main process, drives the USB device
    index.ts                  ← IPC: dmx:writeUniverse, dmx:getDevices, dmx:load/saveLibrary
  resources/
    dmx_worker.py             ← legacy Python worker (unused, kept for reference)
```

---

## Data flow (end to end)

```
Sketch (renderer)
  └─ hedron.lighting.source("strip", 38).set(i, r, g, b, w, intensity)
       └─ writes SourceRegistry -> PixelSource.target   (no send, no rig lookup)

Send tick (renderer, every 23ms ≈ 44fps — UniverseSender)
  └─ DmxLightingPlugin.composite()
       └─ syncConfigFromStore()      fixtures + mappings + overrides, re-parsed only when changed
       └─ SourceRegistry.smoothAll() per-pixel lerp, linear-rgb or curved-hsb
       └─ applyMixes()               crossfaded sources
       └─ compileRig()               only when the rig or a source shape changed
       └─ resolveRig()               sample every mapping, encode per head
       └─ executeRig()               one flat loop, merged by layer -> UniverseSet.setFrame()
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

## The model (fixtures.ts)

Three layers, each edited on its own:

```
Fixture library   the kinds of light you own: modes, each an explicit channel table
     |               shared by every project on the machine
     v
Rig               the lights hung for this show: a type, a mode and a start address each
     |               any number of the same type; fixtures may share channels
     v
Mappings          sketch colours -> heads: a source range, spread or reduced,
                     sent to an ordered list of fixtures or individual heads
```

```typescript
interface FixtureChannel {
  field: FieldName | null // 'red', 'pan', 'macro'… or null for an unused channel
  head?: number // 0-based head (pod, cell); absent = fixture-wide
  default?: number // sent whenever nothing drives the channel
  bits?: 16
  part?: 'coarse' | 'fine'
  label?: string // overrides the generated name, e.g. "Shutter / strobe"
  description?: string // value ranges from the manual
}

interface FixtureMode {
  name
  description?
  channels: FixtureChannel[]
  encoder?: EncoderSpec
}
interface FixtureType {
  id
  name
  manufacturer?
  description?
  shape
  headName?
  modes
}

interface FixtureInstance {
  id
  name
  typeId
  modeName
  address: Address
  placement?
  enabled?
}

interface Mapping {
  id
  name?
  enabled?
  source: string
  kind: 'spread' | 'reduce' // a pixel per head, or one colour for all of them
  reduce?: 'average' | 'brightest' | 'darkest'
  offset?: number // first source pixel; animatable param node
  span?: number // pixels a reduce or a stretch covers; default all
  step?
  wrap?
  arrangement?
  segmentSize?
  fit?
  filter?
  spatial?
  gain?: number // animatable param node
  targets: Array<{ fixtureId: string; heads?: number[] }> // in spread order
}
```

A mode is the manual's DMX chart written out channel by channel, so irregular layouts —
a master dimmer before the cells, interleaved per-pod intensity — need no special shape.
A mode whose channels carry no head is one implicit head.

**Which channels a mapping drives.** The mode's encoder declares the fields it writes
(passthrough: red, green, blue, white, intensity). A channel whose field the encoder
writes, on a head a mapping targets, follows the mapping. Every other channel — pan,
shutter, macros, a fixture-wide master dimmer — sends its default, and the channel map
can hold it at another value.

**Sharing channels.** Two fixtures may sit on the same channels, for instance a single RGB
pot piggybacking on the first pod of a bar. Every frame each universe is rebuilt from
nothing in layers: defaults, then mapped values, then overrides, then identify. A higher
layer wins outright; within a layer the highest value wins, which is the usual DMX rule.
So a driven value always beats a default, and two mappings on one channel give the
brighter of the two, which the channel map flags with a yellow border.

### Shipped fixture types (library.ts)

| Type                         | Modes                                                                                                                      |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Yorkville LP-LED4X           | 8ch (DIP #10 ON): intensity + colour macro per pod; 20ch (DIP #11 ON): RGBWI per pod                                       |
| Eliminator Stealth Wash Zoom | 5ch: pan, tilt, colour macro (wheel encoder), programs, focus; 16ch: 16-bit pan/tilt, RGBW, master, shutter (rests open) … |
| FODEXAZY ZQ06018 wall washer | 4ch RGBW; 112ch: 28 RGBW cells; 114ch: master + strobe + 28 cells                                                          |
| Generic                      | RGB, RGBW, RGBW + intensity, 1ch dimmer                                                                                    |

The LP-LED4X's 8-channel colour macro ranges are not in its manual, so that channel is not
driven; hold it with an override.

### Mapping transforms

| Want                                           | Set                                                         |
| ---------------------------------------------- | ----------------------------------------------------------- |
| One colour on one pod                          | **reduce**, target the fixture with only that pod's chip on |
| Average / brightest / darkest of a strip range | **reduce**, **Offset** + **Span**                           |
| Bars in a row as one long strip                | **spread**, targets in physical order                       |
| Scroll the strip                               | animate **Offset** with **Wrap** on                         |
| Smooth sub-pixel scroll                        | the same, plus **Filter: linear**                           |
| Flip the heads                                 | **Arrangement: reverse**                                    |
| Zig-zag wiring                                 | **Arrangement: serpentine** + **Segment Size**              |
| Fit part of a source across the heads          | **Fit: stretch** + **Offset** + **Span**                    |
| Every other pixel                              | **Step: 2**                                                 |

Offset and gain are param nodes (`dmx-lighting-map-<id>-offset` / `-gain`), so an LFO,
MIDI control or timeline track drives them like any other param. The offset slider's max
follows the source: a full turn of it with **Wrap** on, otherwise as far as the mapping can
slide before the pixels it reads run off the end. It is refitted whenever the source or the
mapping changes shape, so a max set by hand holds until then.

A fixture is a target of a mapping at most once; its head chips pick which heads it gives.

## Stage and spatial mapping

Every fixture can carry a `placement`. Heads spread evenly along the fixture's local X
across `size[0]`, then rotate and translate into world space. The stage is a rectangle
centred on the origin, sized by the Stage Width and Stage Depth global options.

A mapping with **sample by stage position** ignores indices: each head reads the 2D source
wherever it physically sits, bilinearly. A sketch can fill one from a canvas:

```ts
hedron.lighting.sourceFromCanvas('stage', canvas, { width: 32, height: 18 })
```

That readback forces a GPU sync, so it lives on the sketch's own update rather than the
DMX tick. The **Stage** panel draws the rig from above with each head in its live colour;
drag a fixture to move it.

## Value pipeline

```
source pixel -> smoothing (per pixel, linear-rgb or curved-hsb)
             -> mapping (spread: arrangement, offset, step, wrap, fit, filter, spatial
                         reduce: average / brightest / darkest over offset + span)
             -> per-mapping gain, then master brightness (colour only)
             -> the head's encoder -> named device fields
             -> channel fields, 16-bit parts, defaults for anything undriven
             -> optional temporal dither
             -> layer merge (default < mapped < override < identify; highest within a layer)
             -> universe buffer
```

Gain and brightness scale the colour before encoding and leave the source intensity alone,
so an RGBW+intensity fixture does not dim twice. Encoders that drive a dimmer channel derive
it from the already-scaled colour, so brightness still reaches a dimmer-only or colour-wheel
fixture through the channel it actually has.

### Temporal dithering

DMX carries 8 bits per channel, and a slow fade shows all 256 steps. The **Temporal Dither**
option (on by default) carries each channel's rounding error into the next frame, so 100.25
goes out as 100, 100, 100, 101 and averages correctly. Exact values carry no error, so a
settled scene still sends nothing. Defaults and 16-bit coarse bytes are never dithered.

### Output rate

The renderer composites every 23ms (~44fps). The main-process frame loop targets 25ms, but
a frame costs ~25ms of wire time on its own (2ms BREAK + 1ms MAB + 22.6ms for 513 bytes at
250kbaud, 8N2), so the loop is paced by the wire at roughly 38–40fps.

## Encoders

| Kind          | Produces                         | Notes                                          |
| ------------- | -------------------------------- | ---------------------------------------------- |
| `passthrough` | r, g, b, w, intensity            | the default                                    |
| `rgb`         | r, g, b                          |                                                |
| `rgbw`        | + white, intensity               | `whiteExtract`: none / min / max-preserve      |
| `rgbwa`       | + amber                          | amber pulled from what is left after white     |
| `cmy`         | cyan, magenta, yellow, intensity | subtractive                                    |
| `dimmer`      | dimmer, intensity                | Rec. 709 luma                                  |
| `hsi`         | hue, saturation, intensity       |                                                |
| `wheel`       | wheel, intensity                 | nearest palette entry in Oklab, matched on hue |

## The panel

**Rig** lists every light hung, sorted by address: type and mode, channel range, head count,
and who it shares channels with. ◉ identifies a fixture — it flashes white over everything,
ignoring brightness — and the editor's head chips identify a single pod or cell. ⧉
duplicates a fixture at the next free address after it. **Add** places a new light at the
first gap that fits. A fixture's editor lists the mappings driving it and any heads left
unmapped; each mapping chip jumps to that mapping, and **Add a mapping** creates one already
aimed at the fixture. Placement sits in a collapsed section. Removing a fixture removes it
from every mapping's targets.

**Mappings** route sources to heads. The editor shows the source with the pixels being read
picked out, and a swatch per head of what it receives. Each target's name jumps back to the
fixture in the rig.

**Channel Map** draws every channel of every live universe, coloured by value: green where a
fixture sits, grey where nothing is patched. A purple inner glow marks a channel an override
holds, and a yellow border one that several mappings land on. Hovering a channel draws the
perimeter of every fixture on it — each in its own colour, so shared channels stay legible —
and a tooltip above the cursor gives the channel and value, then per fixture its name and
what the channel does (`Stage L - Pod 1 Blue`) over what drives it (`← strip avg`).
Clicking it opens the detail: the manual's notes for the channel, a jump to the fixture, and
**Hold at value**, which creates a param node (`dmx-lighting-override-<u>-<ch>`) that wins
over any mapping and can be put on MIDI or an LFO.

Ticking **16-bit** holds the channel and the one after it as a coarse and fine pair driven
by a single 0–1 param, split into 65536 steps on output
(`dmx-lighting-overridepair-<u>-<ch>`), for pan and tilt. It is
ticked already when the channel is the coarse half of a fixture's 16-bit pair, and clicking
a fine half offers to hold the pair from its coarse channel instead.

**Fixture Library** edits types: name, manufacturer, head name and description, then per
mode a description, the encoder and the channel table (field, head, default, 16-bit part,
label, notes). **Add heads** appends a repeated pattern such as `red, green, blue, white × 28`.
Shipped types cannot be deleted, nor any type the rig uses.

## Persistence

- **Library**: saved as `dmx-fixture-library.json` in the app's user-data folder, via the
  `dmx:loadLibrary` / `dmx:saveLibrary` IPC (localStorage without Electron). Only user types
  and edited shipped types are stored, so fixes to shipped types still arrive.
- **Project**: `paramValues` holds `dmx-lighting-fixtures`, `-mappings`, `-mixes`,
  `-overrides`, `-types` (copies of the types the rig uses, added to the library of a
  machine that lacks them) and `-schema-version` = `2`. Projects from before version 2 load
  with an empty rig; their mixes are kept.
- **Rig file**: Export Rig and Import Rig carry fixtures, mappings, mixes, overrides, stage
  size and the types used.

The sketch API is `source()`, `sourceFromCanvas()` and `setColor()`. `setFixtureColor()` is
gone: sketches no longer create or patch fixtures.

## Verifying without hardware

```
pnpm --filter @hedron-gl/dmx-lighting verify
```

Builds the package and runs `scripts/verify-rig.mjs`, which asserts universe bytes for the
shipped fixtures, per-head targeting, reduce, shared channels and highest-wins merging,
defaults, overrides, identify, spread transforms, encoders, QLC+ heads, spatial mappings,
rig files, mixes and dithering.

## Next phase

See `docs/PIXEL_PIPELINE_PLAN.md`. Phase 6 is multi-output transport — real Art-Net and sACN
senders, an outputs table routing universes to devices, and support for more than one dongle.
