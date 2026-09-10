# DMX Pixel Pipeline — Architecture & Implementation Plan

Status: phases 0-2 implemented; 3 onward proposed. Supersedes the "Next phase" section of `../DMX.md`.

## Why

The current model (`FixtureColor` = one flat colour + `FixtureMapping[]`) was built for a
handful of pot lights. It breaks down on an LED bar (38 RGB segments, 114 channels) for
structural reasons, not throughput reasons:

- Patch topology and per-frame values are the same object, so unchanging address data is
  structured-cloned across IPC every frame.
- `sendDMXData()` runs `JSON.stringify()` over the whole colour map for change detection on
  every `setFixtureColor()` call — 38 segments means 38 stringifies of a growing object per
  frame. Quadratic.
- A "fixture" holds exactly one colour, so 38 segments means 38 fixtures, 38 store keys and
  38 rows of list UI.
- `curved-hsb` lerping happens in the main process on DMX bytes *after* swizzle, which is
  not interpolation in HSB.

## The model

Five concepts, each independently addressable and persistable.

```
  Source            named buffer of linear-float colours; sketches write here
     |                  1D array, or 2D texture region
     |  Tap          which pixels of which source drive this instance
     |                  offset (wrapping), reverse, serpentine, step, span resample,
     v                  or spatial sample by stage position
  Instance colours  N linear colours for this fixture instance
     |
     |  Stage       per-instance gain / curve / colour temp, then global master
     v
  Encoder           linear colour -> named channel fields
     |                  rgb, rgbw (+white extraction), cmy, dimmer, hsi,
     v                  fixed palette / colour wheel, 16-bit pairs
  Profile           channel layout of the physical device
     |                  header slots + pixel slots * pixelCount, stride, modes
     v
  Patch             profile instance placed at { universe, address }[], plus its Tap,
     |                  physical placement, and per-instance overrides
     v
  Universe buffers  Map<number, Uint8Array(512)> in the renderer
     |
     v
  Transport         USB / Art-Net / sACN in main; consumes raw universe bytes only
```

### Why this split covers the current wins

- **Comma-separated fan-out is preserved and clarified.** A patch entry keeps
  `addresses: { universe, channel }[]`; the resolved bytes are cloned to each. That is the
  "one colour to 4 pots" case, and it stays a one-line edit. It is patch data, not profile
  data, which is the distinction the current `startAddresses` blurs.
- **Swizzling survives intact.** `ChannelSlot` (field / `{field, scale}` / `{absolute}` /
  `null`) becomes the profile's pixel and header layout. Nothing is lost; it gains a repeat
  count and a stride.
- **Scroll / flip / sample live in the Tap**, decoupled from DMX addressing. Scrolling a
  strip is an animated `tap.offset` with `wrap: true` — no address arithmetic. Eight pots
  sampling mid-strip are eight patch entries with `tap.offset = 12, count = 1`; each pot's
  own intensity/strobe channels come from its profile, so there is no channel collision by
  construction. That is impossible today because source index and DMX address are the same
  number.
- **Fixed-colour-mode fixtures** are an Encoder, not a special case. A colour wheel is
  `{ kind: 'wheel', entries: [{ value: 12, color: '#ff0000' }, ...] }` matched in Oklab.
- **Physical layout** is a first-class field on the patch entry, which is what drives both
  the preview render and spatial pixel-mapping.

### Types (target shape)

```ts
type Address = { universe: number; channel: number }   // channel 1-512

type ChannelSlot =
  | FieldName                                   // 'red' | 'pan' | ... open registry
  | { field: FieldName; scale?: number; bits?: 8 | 16; part?: 'coarse' | 'fine' }
  | { absolute: number }
  | null

interface FixtureMode {
  name: string                    // '3ch RGB', '6ch RGBWAU'
  header?: ChannelSlot[]          // fixture-level channels before the pixel block
  pixel: ChannelSlot[]            // layout of ONE pixel
  pixelCount: number              // 1 = pot light, 38 = bar, 300 = tape
  pixelStride?: number            // defaults to pixel.length
  encoder: EncoderSpec            // how a colour becomes those fields
}

interface FixtureProfile {
  id: string
  manufacturer?: string
  model?: string
  shape: 'par' | 'bar' | 'strip' | 'matrix' | 'mover' | 'generic'
  modes: FixtureMode[]
}

interface Tap {
  source: string
  offset?: number                 // start pixel in the source
  count?: number                  // pixels consumed; defaults to mode.pixelCount
  step?: number                   // source stride between consumed pixels
  wrap?: boolean                  // offset/step wrap around source length
  arrangement?: 'forward' | 'reverse' | 'serpentine'
  segmentSize?: number            // for serpentine / per-segment reverse
  fit?: 'clip' | 'stretch' | 'tile'
  filter?: 'nearest' | 'linear' | 'average'
  spatial?: { space: 'world' | 'uv' }   // sample a 2D source by placement instead of index
}

interface PatchEntry {
  id: string
  profileId: string
  modeName: string
  addresses: Address[]            // fan-out; same bytes written to each
  tap: Tap
  gain?: number
  curve?: 'linear' | 'srgb' | 'gamma'
  gammaValue?: number
  placement?: {
    position: [number, number, number]
    rotation: [number, number, number]
    size: [number, number, number]
    pixelPitch?: number
  }
  enabled?: boolean
}
```

### Sketch API

```ts
const bar = hedron.lighting.source('bar', 38)      // Float32Array RGBA, reused each frame
bar.set(i, r, g, b)                                 // or write bar.buffer directly
hedron.lighting.sourceFromTexture('stage', renderTarget, { width: 64, height: 32 })
hedron.lighting.setColor('house', r, g, b)          // 1-pixel source; today's simple case
```

Sketches never see addresses, profiles or channels. One call per source per frame, and
buffers are allocated once and reused.

### Performance approach

Config changes compile the whole patch into a flat instruction plan — preallocated typed
arrays of source pixel indices and destination byte offsets, with encoder closures resolved
once per slot group. The per-frame loop then executes the plan with no allocation, no
branching on slot shape, and no string lookups. Cost is O(total pixels), independent of
fixture count, and 10k pixels stays comfortable.

Per-frame IPC becomes one transferable `Uint8Array(512)` per dirty universe. At 8 universes
and 44 Hz that is ~176 KB/s, versus today's JSON of the entire fixture graph per fixture per
frame.

### Value pipeline order (fixed, documented, no special cases)

```
source colour (linear float)
  -> tap resample
  -> per-instance gain
  -> temporal lerp (in colour space, per pixel, in the renderer)
  -> global master brightness
  -> curve / gamma
  -> encoder -> field values
  -> slot scale / absolute overrides
  -> quantise to byte -> universe buffer
```

Two corrections to current behaviour are folded in: lerping moves ahead of byte conversion,
and `intensity` stops being exempt from master brightness by special case (fixtures needing
it unscaled express that with a slot `scale` or an `absolute`).

---

## Phases

Each phase leaves the system working and shippable.

### Phase 0 — Transport and buffers  ✅ done

No user-visible change; unblocks everything after it.

1. Renderer owns `Map<number, Uint8Array(512)>`. All output paths write here.
2. Replace `JSON.stringify` change detection with per-universe dirty flags.
3. Replace push-per-`setFixtureColor` with a fixed-rate sender (~44 Hz) that ships dirty
   universes. DMX prefers constant framing, and this decouples render fps from wire fps.
4. IPC becomes `dmx:writeUniverse(id, bytes)` with a transferable buffer.
   `dmxService.sendColors()` is replaced by `writeUniverse()`; the FTDI frame loop,
   `_doInitialize`, `scheduleFrame`, `sendFrame` and `ctrlOut` are not touched.
5. Move the real lerp out of `dmxService` (byte-domain smoothing stays only as a safety
   net; per-pixel colour-space lerp arrives in Phase 1).
6. `Address` becomes `{ universe, channel }` everywhere, including persisted config.
   Universe 0 is what the USB dongle sends; the rest are inert until Phase 6.
7. Existing `FixtureMapping[]` is translated internally into universe writes so current
   sketches and stored config keep working unchanged.

**Done when:** the existing pot-light sketch behaves identically, with no JSON on the hot
path and no object graph crossing IPC.

### Phase 1 — Core model, compositor, migration  ✅ done

1. Add the `Source` registry, `FixtureProfile`, `FixtureMode`, `PatchEntry`, and a minimal
   `Tap` (offset / count / forward only).
2. Build the patch compiler and the per-frame compositor described above.
3. Per-pixel temporal lerp in linear colour space, replacing the byte-domain lerp.
4. Sketch API: `source()`, `setColor()`.
5. Migration: each persisted `FixtureMapping` becomes a single-pixel profile plus one patch
   entry per `startAddress` on universe 0, tapping an implicit source named after the
   fixture id. `setFixtureColor(id, channels)` keeps working as a shim writing that source.
   Migration runs once and rewrites the store.

**Done when:** the LED bar runs as one patch entry with `pixel: ['red','green','blue'],
pixelCount: 38` driven by a 38-pixel source, and every existing fixture still works.

### Phase 2 — Taps and transforms  ✅ done

1. `offset` with `wrap`, plus `step` and `count`.
2. `arrangement`: `reverse` and `serpentine` with `segmentSize`, covering per-segment flip
   and zig-zag matrix wiring.
3. `fit` / `filter`: `stretch` + `linear` to resample a source onto a different pixel count,
   `average` for a pot that follows the mean of a span.
4. Bind `offset` and `gain` to param nodes so scroll is automatable from the existing
   modulation system without sketch code.
5. Multi-source: several patch entries tap one source at different offsets — the
   eight-pots-off-one-strip case.

**Done when:** the bar can scroll, flip, and flip per segment; and eight pots can each pull
a distinct pixel or span from the strip source while keeping their own intensity and strobe
channels.

### Phase 3 — Encoders and fixture modes

1. Encoder registry: `rgb`, `rgbw` (white extraction `none` / `min` / `max-preserve` with a
   configurable white point), `rgbwa` / `rgbwauv` via a generalised primaries fit, `cmy`,
   `dimmer` (luminance), `hsi`.
2. `wheel` encoder: palette entries `{ value, color, label }`, nearest match in Oklab, with
   optional intensity carry so brightness still works on a fixed-colour fixture.
3. 16-bit slots (`bits: 16` with `part: 'coarse' | 'fine'`) for movers and fine dimmers.
4. `FieldName` becomes an open string with a registry of well-known names (`red`, `green`,
   `blue`, `white`, `amber`, `uv`, `intensity`, `strobe`, `pan`, `tilt`, `zoom`, `gobo`,
   `cto`) rather than a closed union, so new devices need no type change.
5. Modes on a profile, selectable in the UI, each with its own layout and encoder.

**Done when:** a fixed-colour-wheel fixture and a 16-bit mover can both be patched with no
code change to the plugin.

### Phase 4 — Patch UI and fixture library

1. Fixture library: JSON profiles, shipped defaults plus a user library in the store, seeded
   with the real rig. Create, duplicate and edit in the panel.
2. Patch table replacing the per-fixture mapping list: profile, mode, universe, address,
   pixel count, tap summary, enable toggle, sortable by address.
3. Auto-addressing: assign next free address, with overlap and overflow detection surfaced
   inline.
4. Universe heatmap — 512 cells, live values, hover for the owning fixture. Doubles as the
   primary debugging tool.
5. Per-fixture live swatch strip, so a 38-pixel bar is one row rather than 38.
6. Optional: import QLC+ `.qxf` fixture definitions (simple XML, thousands available). GDTF
   is a larger job and can wait.

**Done when:** patching a new physical light is done entirely in the UI, with conflicts
caught before they reach the wire.

### Phase 5 — Layout and spatial pixel mapping

1. `placement` on patch entries: position, rotation, size, pixel pitch.
2. Stage preview panel: top-down and elevation views, live colours, drag to position, click
   to select and jump to the patch row.
3. Texture sources: `sourceFromTexture()` reading a render target or offscreen canvas.
4. Spatial taps: a fixture samples a 2D source at each pixel's stage position instead of by
   index. This is the payoff — any existing sketch becomes a light show with no DMX-specific
   code in it, and adding a fixture to the rig is a placement rather than a patch edit.
5. Export and import a rig file (profiles + patch + layout) so a venue setup is portable.

**Done when:** dragging a fixture on the stage view changes what colour it shows, live.

### Phase 6 — Multi-output transport

1. Real Art-Net sender (currently a stub): universe to node/subnet mapping, unicast and
   broadcast.
2. Real sACN sender: multicast per universe, priority, source name.
3. Outputs table: which universes route to which device, multiple simultaneous outputs, and
   multiple USB dongles addressed by serial.
4. Per-output frame rate and idle-refresh policy.

**Done when:** universes beyond 0 actually leave the machine.

## Cross-cutting

- **Tests.** A headless harness that builds a patch, writes sources, runs the compositor and
  asserts universe bytes, with no hardware. Written alongside Phase 1 and extended each
  phase; this layer is too fiddly to verify by eye on real lights.
- **Blackout and master.** Global blackout and master fader as global option nodes, applied
  at the documented pipeline position.
- **Store schema versioning.** A `version` field on persisted DMX config with a migration
  chain, so future model changes never require hand-editing saved projects.
