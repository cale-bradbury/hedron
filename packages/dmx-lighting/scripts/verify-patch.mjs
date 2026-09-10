// Headless check of the DMX compositor: build a patch, write sources, assert universe
// bytes. No hardware, no engine, no test framework — run with `pnpm verify`.
import {
  SourceRegistry,
  UniverseSet,
  compilePatch,
  executePatch,
  resolveTaps,
  findAddressConflicts,
  findNextFreeAddress,
  conflictingEntryIds,
  entryChannelSpan,
  sortPatchByAddress,
  universeUsage,
  qlcFieldName,
  qlcToProfile,
} from '../dist/core.js'

let failures = 0
let checks = 0

function check(name, actual, expected) {
  checks++
  const a = JSON.stringify(actual)
  const e = JSON.stringify(expected)
  if (a === e) return
  failures++
  console.error(`FAIL ${name}\n  expected ${e}\n  actual   ${a}`)
}

/** Reads a 1-based channel range out of a universe buffer. */
function slice(universes, universe, from, count) {
  return [...universes.snapshot(universe).slice(from - 1, from - 1 + count)]
}

function run(profiles, patch, prime, brightness = 1) {
  const registry = new SourceRegistry()
  prime(registry)
  const universes = new UniverseSet()
  const compiled = compilePatch(patch, profiles, registry)
  // Sources start smoothed to nothing, so settle them before executing.
  registry.smoothAll(1, 'linear-rgb')
  resolveTaps(compiled, brightness)
  executePatch(compiled, universes)
  return { universes, compiled, registry }
}

const parProfile = {
  id: 'par',
  name: 'PAR',
  shape: 'par',
  modes: [{ name: 'rgbwi', pixel: ['red', 'green', 'blue', 'white', 'intensity'], pixelCount: 1 }],
}

const barProfile = {
  id: 'bar',
  name: 'Bar',
  shape: 'bar',
  modes: [{ name: 'rgb', pixel: ['red', 'green', 'blue'], pixelCount: 38 }],
}

// ── Fan-out: one colour to four pots, brightness on colour but not intensity ──
{
  const { universes } = run(
    [parProfile],
    [
      {
        id: 'e1',
        profileId: 'par',
        modeName: 'rgbwi',
        addresses: [1, 6, 11, 16].map((channel) => ({ universe: 0, channel })),
        tap: { source: 'house' },
      },
    ],
    (registry) => registry.ensure('house', 1).set(0, 200, 100, 50, 25, 255),
    0.5,
  )

  check('fan-out pod 1', slice(universes, 0, 1, 5), [100, 50, 25, 13, 255])
  check('fan-out pod 4', slice(universes, 0, 16, 5), [100, 50, 25, 13, 255])
  check('fan-out leaves ch21 clear', slice(universes, 0, 21, 1), [0])
}

// ── 38-pixel bar: one entry, 114 channels, pixel p reads source pixel p ───────
{
  const { universes, compiled } = run(
    [barProfile],
    [
      {
        id: 'e1',
        profileId: 'bar',
        modeName: 'rgb',
        addresses: [{ universe: 0, channel: 1 }],
        tap: { source: 'strip' },
      },
    ],
    (registry) => {
      const strip = registry.ensure('strip', 38)
      for (let p = 0; p < 38; p++) strip.set(p, p, p * 2, p * 3, 0, 255)
    },
  )

  check('bar write count', compiled.writeCount, 114)
  check('bar pixel 0', slice(universes, 0, 1, 3), [0, 0, 0])
  check('bar pixel 5', slice(universes, 0, 16, 3), [5, 10, 15])
  check('bar pixel 37', slice(universes, 0, 112, 3), [37, 74, 111])
  check('bar stops at 114', slice(universes, 0, 115, 1), [0])
}

// ── Pots sampling mid-strip: source index decoupled from DMX address ──────────
{
  const { universes } = run(
    [parProfile, barProfile],
    [
      {
        id: 'bar',
        profileId: 'bar',
        modeName: 'rgb',
        addresses: [{ universe: 0, channel: 1 }],
        tap: { source: 'strip' },
      },
      {
        id: 'pot',
        profileId: 'par',
        modeName: 'rgbwi',
        addresses: [{ universe: 0, channel: 200 }],
        tap: { source: 'strip', offset: 12, count: 1 },
      },
    ],
    (registry) => {
      const strip = registry.ensure('strip', 38)
      for (let p = 0; p < 38; p++) strip.set(p, p, 0, 0, 0, 255)
    },
  )

  check('pot reads strip pixel 12', slice(universes, 0, 200, 5), [12, 0, 0, 0, 255])
  check('pot does not disturb the bar', slice(universes, 0, 37, 3), [12, 0, 0])
}

// ── Header, absolute and null padding ────────────────────────────────────────
{
  const { universes } = run(
    [
      {
        id: 'moded',
        name: 'Moded bar',
        shape: 'bar',
        modes: [
          {
            name: 'default',
            header: [{ absolute: 255 }, null],
            pixel: ['red', 'green', 'blue', null],
            pixelCount: 2,
          },
        ],
      },
    ],
    [
      {
        id: 'e1',
        profileId: 'moded',
        modeName: 'default',
        addresses: [{ universe: 0, channel: 10 }],
        tap: { source: 'src' },
      },
    ],
    (registry) => {
      const src = registry.ensure('src', 2)
      src.set(0, 11, 22, 33, 0, 255)
      src.set(1, 44, 55, 66, 0, 255)
    },
  )

  check(
    'header then two padded pixels',
    slice(universes, 0, 10, 10),
    [255, 0, 11, 22, 33, 0, 44, 55, 66, 0],
  )
}

// ── A short source broadcasts to every pixel of a longer fixture ─────────────
{
  const { universes } = run(
    [barProfile],
    [
      {
        id: 'e1',
        profileId: 'bar',
        modeName: 'rgb',
        addresses: [{ universe: 0, channel: 1 }],
        tap: { source: 'single', count: 4 },
      },
    ],
    (registry) => registry.ensure('single', 1).set(0, 9, 8, 7, 0, 255),
  )

  check('broadcast pixel 0', slice(universes, 0, 1, 3), [9, 8, 7])
  check('broadcast pixel 3', slice(universes, 0, 10, 3), [9, 8, 7])
}

// ── Universe routing and conflict detection ──────────────────────────────────
{
  const { universes, compiled } = run(
    [parProfile],
    [
      {
        id: 'a',
        profileId: 'par',
        modeName: 'rgbwi',
        addresses: [{ universe: 2, channel: 14 }],
        tap: { source: 'x' },
      },
      {
        id: 'b',
        profileId: 'par',
        modeName: 'rgbwi',
        addresses: [{ universe: 2, channel: 16 }],
        tap: { source: 'x' },
      },
    ],
    (registry) => registry.ensure('x', 1).set(0, 255, 0, 0, 0, 255),
  )

  check('universe 2 written', slice(universes, 2, 14, 2), [255, 0])
  check('universe 0 untouched', slice(universes, 0, 14, 2), [0, 0])
  check('overlap reported', findAddressConflicts(compiled).length, 3)
  check('universe ids', universes.universeIds(), [0, 2])
}

// ── Dirty tracking: a settled patch sends nothing ────────────────────────────
{
  const registry = new SourceRegistry()
  registry.ensure('s', 1).set(0, 10, 20, 30, 0, 255)
  const universes = new UniverseSet()
  const compiled = compilePatch(
    [
      {
        id: 'e1',
        profileId: 'par',
        modeName: 'rgbwi',
        addresses: [{ universe: 0, channel: 1 }],
        tap: { source: 's' },
      },
    ],
    [parProfile],
    registry,
  )

  registry.smoothAll(1, 'linear-rgb')
  resolveTaps(compiled, 1)
  executePatch(compiled, universes)
  check('first frame is dirty', universes.takeDirty().length, 1)

  resolveTaps(compiled, 1)
  executePatch(compiled, universes)
  check('unchanged frame sends nothing', universes.takeDirty().length, 0)

  registry.ensure('s').set(0, 10, 20, 31, 0, 255)
  registry.smoothAll(1, 'linear-rgb')
  resolveTaps(compiled, 1)
  executePatch(compiled, universes)
  check('changed byte is dirty again', universes.takeDirty().length, 1)
}

// ── Temporal dithering: sub-byte values average out across frames ────────────
{
  const registry = new SourceRegistry()
  // 100.25 after brightness, so a quarter of a step is lost to 8-bit rounding.
  registry.ensure('s', 1).set(0, 200.5, 0, 0, 0, 255)
  const universes = new UniverseSet()
  const compiled = compilePatch(
    [
      {
        id: 'e1',
        profileId: 'par',
        modeName: 'rgbwi',
        addresses: [{ universe: 0, channel: 1 }],
        tap: { source: 's' },
      },
    ],
    [parProfile],
    registry,
  )
  registry.smoothAll(1, 'linear-rgb')

  const frames = []
  for (let f = 0; f < 8; f++) {
    resolveTaps(compiled, 0.5)
    executePatch(compiled, universes, true)
    frames.push(slice(universes, 0, 1, 1)[0])
  }

  const mean = frames.reduce((a, b) => a + b, 0) / frames.length
  check('dither straddles the two nearest codes', [...new Set(frames)].sort(), [100, 101])
  check('dither averages to the true value', mean, 100.25)

  // Without dithering the same value sticks on one code every frame.
  const plain = []
  for (let f = 0; f < 4; f++) {
    resolveTaps(compiled, 0.5)
    executePatch(compiled, universes, false)
    plain.push(slice(universes, 0, 1, 1)[0])
  }
  check('undithered output is constant', [...new Set(plain)], [100])

  // An integer value has no error to carry, so it stays put and keeps the wire quiet.
  registry.ensure('s').set(0, 200, 0, 0, 0, 255)
  registry.smoothAll(1, 'linear-rgb')
  resolveTaps(compiled, 0.5)
  executePatch(compiled, universes, true)
  universes.takeDirty()
  resolveTaps(compiled, 0.5)
  executePatch(compiled, universes, true)
  check('exact values do not flutter', universes.takeDirty().length, 0)
}

// ── Tap transforms ───────────────────────────────────────────────────────────

/** An 8-pixel fixture and an 8-pixel ramp source, for exercising tap options. */
const eightProfile = {
  id: 'eight',
  name: 'Eight',
  shape: 'bar',
  modes: [{ name: 'rgb', pixel: ['red', 'green', 'blue'], pixelCount: 8 }],
}

function runTap(tap, prime = undefined, profile = eightProfile) {
  return run(
    [profile],
    [
      {
        id: 'e1',
        profileId: profile.id,
        modeName: profile.modes[0].name,
        addresses: [{ universe: 0, channel: 1 }],
        tap,
      },
    ],
    prime ??
      ((registry) => {
        const src = registry.ensure('ramp', 8)
        for (let p = 0; p < 8; p++) src.set(p, p * 10, 0, 0, 0, 255)
      }),
  )
}

/** The red channel of each output pixel, which carries the ramp index x10. */
function reds(universes, count = 8) {
  const out = []
  for (let p = 0; p < count; p++) out.push(slice(universes, 0, 1 + p * 3, 1)[0])
  return out
}

// Offset with wrap is what scrolling is: the pattern rotates instead of smearing.
{
  const clamped = runTap({ source: 'ramp', offset: 3 })
  check(
    'offset clamps at the end by default',
    reds(clamped.universes),
    [30, 40, 50, 60, 70, 70, 70, 70],
  )

  const wrapped = runTap({ source: 'ramp', offset: 3, wrap: true })
  check('offset wraps around the source', reds(wrapped.universes), [30, 40, 50, 60, 70, 0, 10, 20])

  const negative = runTap({ source: 'ramp', offset: -2, wrap: true })
  check('negative offset wraps too', reds(negative.universes), [60, 70, 0, 10, 20, 30, 40, 50])
}

// Step samples every Nth source pixel.
{
  const { universes } = runTap({ source: 'ramp', step: 2, wrap: true })
  check('step 2 takes every other pixel', reds(universes), [0, 20, 40, 60, 0, 20, 40, 60])
}

// Arrangement remaps the fixture's physical order, not the source.
{
  const reversed = runTap({ source: 'ramp', arrangement: 'reverse' })
  check(
    'reverse flips the whole fixture',
    reds(reversed.universes),
    [70, 60, 50, 40, 30, 20, 10, 0],
  )

  const serpentine = runTap({ source: 'ramp', arrangement: 'serpentine', segmentSize: 4 })
  check(
    'serpentine flips alternate segments',
    reds(serpentine.universes),
    [0, 10, 20, 30, 70, 60, 50, 40],
  )
}

// Stretch fits a whole source of a different length across the fixture.
{
  const prime = (registry) => {
    const src = registry.ensure('ramp', 4)
    for (let p = 0; p < 4; p++) src.set(p, p * 30, 0, 0, 0, 255)
  }

  const nearest = runTap({ source: 'ramp', fit: 'stretch' }, prime)
  check(
    'stretch repeats each source pixel',
    reds(nearest.universes),
    [0, 0, 30, 30, 60, 60, 90, 90],
  )

  const linear = runTap({ source: 'ramp', fit: 'stretch', filter: 'linear' }, prime)
  check(
    'stretch with linear interpolates between them',
    reds(linear.universes),
    [0, 15, 30, 45, 60, 75, 90, 90],
  )
}

// Linear filtering on a fractional offset is what makes scrolling smooth.
{
  const { universes } = runTap({ source: 'ramp', offset: 0.5, filter: 'linear', wrap: true })
  check('fractional offset lands between pixels', reds(universes), [5, 15, 25, 35, 45, 55, 65, 35])
}

// Average is the "one pot follows a span of the strip" case.
{
  const { universes } = run(
    [parProfile],
    [
      {
        id: 'e1',
        profileId: 'par',
        modeName: 'rgbwi',
        addresses: [{ universe: 0, channel: 1 }],
        tap: { source: 'ramp', count: 1, step: 8, filter: 'average' },
      },
    ],
    (registry) => {
      const src = registry.ensure('ramp', 8)
      for (let p = 0; p < 8; p++) src.set(p, p * 10, 0, 0, 0, 255)
    },
  )

  // Mean of 0,10,20,30,40,50,60,70.
  check('average returns the mean of the span', slice(universes, 0, 1, 1), [35])
}

// Per-entry gain trims colour without touching intensity, same rule as master brightness.
{
  const { universes } = run(
    [parProfile],
    [
      {
        id: 'e1',
        profileId: 'par',
        modeName: 'rgbwi',
        addresses: [{ universe: 0, channel: 1 }],
        tap: { source: 's' },
        gain: 0.5,
      },
    ],
    (registry) => registry.ensure('s', 1).set(0, 200, 100, 80, 40, 255),
  )

  check('gain scales colour but not intensity', slice(universes, 0, 1, 5), [100, 50, 40, 20, 255])
}

// Offset is read off the compiled tap each frame, which is how a param node drives it.
{
  const registry = new SourceRegistry()
  const src = registry.ensure('ramp', 8)
  for (let p = 0; p < 8; p++) src.set(p, p * 10, 0, 0, 0, 255)
  const universes = new UniverseSet()
  const compiled = compilePatch(
    [
      {
        id: 'e1',
        profileId: 'eight',
        modeName: 'rgb',
        addresses: [{ universe: 0, channel: 1 }],
        tap: { source: 'ramp', wrap: true },
      },
    ],
    [eightProfile],
    registry,
  )
  registry.smoothAll(1, 'linear-rgb')

  compiled.taps[0].offset = 2
  resolveTaps(compiled, 1)
  executePatch(compiled, universes)
  check('animated offset scrolls the pattern', reds(universes), [20, 30, 40, 50, 60, 70, 0, 10])

  compiled.taps[0].offset = 5
  resolveTaps(compiled, 1)
  executePatch(compiled, universes)
  check('and again next frame', reds(universes), [50, 60, 70, 0, 10, 20, 30, 40])
}

// ── Encoders ─────────────────────────────────────────────────────────────────

/** One fixture at channel 1 with the given pixel layout and encoder. */
function runEncoder(pixel, encoder, colour, brightness = 1) {
  return run(
    [
      {
        id: 'enc',
        name: 'Encoded',
        shape: 'par',
        modes: [{ name: 'default', pixel, pixelCount: 1, encoder }],
      },
    ],
    [
      {
        id: 'e1',
        profileId: 'enc',
        modeName: 'default',
        addresses: [{ universe: 0, channel: 1 }],
        tap: { source: 's' },
      },
    ],
    (registry) => registry.ensure('s', 1).set(0, ...colour),
    brightness,
  )
}

// rgbw pulls the common grey onto the white emitter.
{
  const { universes } = runEncoder(
    ['red', 'green', 'blue', 'white'],
    { kind: 'rgbw', whiteExtract: 'min' },
    [200, 150, 100, 0, 255],
  )
  check('rgbw extracts the common grey', slice(universes, 0, 1, 4), [100, 50, 0, 100])

  const none = runEncoder(
    ['red', 'green', 'blue', 'white'],
    { kind: 'rgbw', whiteExtract: 'none' },
    [200, 150, 100, 0, 255],
  )
  check(
    'white extraction off leaves colour alone',
    slice(none.universes, 0, 1, 4),
    [200, 150, 100, 0],
  )
}

// rgbwa takes amber out of what is left after white.
{
  const { universes } = runEncoder(
    ['red', 'green', 'blue', 'white', 'amber'],
    { kind: 'rgbwa', whiteExtract: 'min' },
    [255, 170, 0, 0, 255],
  )
  const [r, g, b, w, a] = slice(universes, 0, 1, 5)
  check('rgbwa puts pure amber on the amber emitter', [r, g, b, w], [0, 0, 0, 0])
  check('rgbwa amber level', a, 255)
}

// cmy is subtractive, so full red is no cyan and full magenta and yellow.
{
  const { universes } = runEncoder(
    ['cyan', 'magenta', 'yellow'],
    { kind: 'cmy' },
    [255, 0, 0, 0, 255],
  )
  check('cmy inverts the primaries', slice(universes, 0, 1, 3), [0, 255, 255])
}

// A dimmer fixture has no colour, so brightness has to reach it through luma.
{
  const full = runEncoder(['dimmer'], { kind: 'dimmer' }, [255, 255, 255, 0, 255])
  check('dimmer follows luminance', slice(full.universes, 0, 1, 1), [255])

  const half = runEncoder(['dimmer'], { kind: 'dimmer' }, [255, 255, 255, 0, 255], 0.5)
  check('master brightness reaches the dimmer channel', slice(half.universes, 0, 1, 1), [128])
}

// The wheel picks the nearest palette entry in Oklab, on hue not level.
{
  const wheel = {
    kind: 'wheel',
    carryIntensity: true,
    entries: [
      { value: 0, color: '#ffffff' },
      { value: 10, color: '#ff0000' },
      { value: 40, color: '#00ff00' },
      { value: 60, color: '#0000ff' },
    ],
  }

  const red = runEncoder(['wheel', 'intensity'], wheel, [200, 20, 20, 0, 255])
  check('wheel picks red', slice(red.universes, 0, 1, 1), [10])

  const green = runEncoder(['wheel', 'intensity'], wheel, [20, 200, 20, 0, 255])
  check('wheel picks green', slice(green.universes, 0, 1, 1), [40])

  // A dark blue still selects blue, and the level lands on intensity instead.
  const dim = runEncoder(['wheel', 'intensity'], wheel, [0, 0, 60, 0, 255])
  check('wheel matches hue on a dim colour', slice(dim.universes, 0, 1, 1), [60])
  check('wheel carries level on intensity', slice(dim.universes, 0, 2, 1), [4])
}

// 16-bit pairs give a mover the resolution a single byte cannot.
{
  const { universes } = runEncoder(
    [
      { field: 'red', bits: 16, part: 'coarse' },
      { field: 'red', bits: 16, part: 'fine' },
    ],
    { kind: 'rgb' },
    [128, 0, 0, 0, 255],
  )
  // 128/255 of 65535 is 32896, which is 0x8080.
  check('16-bit splits across coarse and fine', slice(universes, 0, 1, 2), [128, 128])

  const top = runEncoder(
    [
      { field: 'red', bits: 16, part: 'coarse' },
      { field: 'red', bits: 16, part: 'fine' },
    ],
    { kind: 'rgb' },
    [255, 0, 0, 0, 255],
  )
  check('16-bit full scale', slice(top.universes, 0, 1, 2), [255, 255])
}

// Unknown field names are legal; they simply resolve to nothing until something writes them.
{
  const { universes, compiled } = runEncoder(
    ['red', 'pan', 'gobo'],
    { kind: 'rgb' },
    [255, 0, 0, 0, 255],
  )
  check('unknown fields are patchable', slice(universes, 0, 1, 3), [255, 0, 0])
  check('field table covers them', compiled.fields.has('gobo'), true)
}

// ── Patch tools: addressing, conflicts, usage ────────────────────────────────
{
  const libraryProfiles = [parProfile, barProfile]
  const entry = (id, channel, profileId = 'par', extra = {}) => ({
    id,
    name: id,
    profileId,
    modeName: profileId === 'par' ? 'rgbwi' : 'rgb',
    addresses: channel === null ? [] : [{ universe: 0, channel }],
    tap: { source: 's' },
    ...extra,
  })

  check('span comes from the profile', entryChannelSpan(entry('a', 1), libraryProfiles), 5)
  check(
    'pixel count overrides the mode',
    entryChannelSpan(entry('a', 1, 'bar', { tap: { source: 's', count: 4 } }), libraryProfiles),
    12,
  )

  // Three pots at 1, 6 and 20 leave a gap at 11 big enough for a fourth.
  const patch = [entry('a', 1), entry('b', 6), entry('c', 20)]
  check('next free address finds the gap', findNextFreeAddress(patch, libraryProfiles, 0, 5), 11)
  check('a bar needs a bigger gap', findNextFreeAddress(patch, libraryProfiles, 0, 114), 25)
  check('an empty universe starts at 1', findNextFreeAddress(patch, libraryProfiles, 3, 5), 1)
  check(
    'placing an entry ignores where it already sits',
    findNextFreeAddress(patch, libraryProfiles, 0, 5, 'a'),
    1,
  )
  check(
    'nothing fits when the span is too big',
    findNextFreeAddress(patch, libraryProfiles, 0, 513),
    null,
  )

  // Overlapping entries are reported by id so the table can flag both rows.
  const overlapping = [entry('a', 1), entry('b', 3)]
  check(
    'both sides of an overlap are flagged',
    [...conflictingEntryIds(overlapping, libraryProfiles)].sort(),
    ['a', 'b'],
  )
  check('a clean patch flags nothing', conflictingEntryIds(patch, libraryProfiles).size, 0)

  // A disabled entry frees its channels for something else.
  const withDisabled = [entry('a', 1, 'par', { enabled: false }), entry('b', 20)]
  check(
    'disabled entries do not hold addresses',
    findNextFreeAddress(withDisabled, libraryProfiles, 0, 5),
    1,
  )

  check('usage counts channels per universe', universeUsage(patch, libraryProfiles), [
    { universe: 0, used: 15 },
  ])

  const mixed = [entry('c', 20), entry('a', null), entry('b', 6)]
  check(
    'sorting puts unaddressed entries last',
    sortPatchByAddress(mixed).map((e) => e.id),
    ['b', 'c', 'a'],
  )
}

// ── QLC+ import: channel groups map onto our field names ─────────────────────
{
  const field = (name, group, colour, byte = 0) => qlcFieldName({ name, group, colour, byte })

  check('colour channels follow their Colour tag', field('Red', 'Intensity', 'Red'), 'red')
  check('a master dimmer is intensity', field('Dimmer', 'Intensity'), 'intensity')
  check('a colour wheel is the wheel field', field('Colour Wheel', 'Colour'), 'wheel')
  check('pan and tilt pass through', field('Pan', 'Pan'), 'pan')
  check('shutter becomes strobe', field('Shutter', 'Shutter'), 'strobe')
  check('zoom is picked out of Beam by name', field('Zoom', 'Beam'), 'zoom')
  check('anything else keeps its name', field('Frost Amount', 'Maintenance'), 'frost-amount')

  const definition = {
    manufacturer: 'Generic',
    model: 'RGBW Par',
    type: 'Color Changer',
    channels: [
      { name: 'Dimmer', group: 'Intensity', byte: 0 },
      { name: 'Red', group: 'Intensity', colour: 'Red', byte: 0 },
      { name: 'Green', group: 'Intensity', colour: 'Green', byte: 0 },
      { name: 'Blue', group: 'Intensity', colour: 'Blue', byte: 0 },
      { name: 'Pan Fine', group: 'Pan', byte: 1 },
    ],
    modes: [{ name: '5 Channel', channels: ['Dimmer', 'Red', 'Green', 'Blue', 'Pan Fine'] }],
  }

  const profile = qlcToProfile(definition)
  check('imported profile is named after the fixture', profile.name, 'Generic RGBW Par')
  check('imported shape', profile.shape, 'par')
  check('mode channels map in order', profile.modes[0].pixel.slice(0, 4), [
    'intensity',
    'red',
    'green',
    'blue',
  ])
  check('a fine byte becomes a 16-bit part', profile.modes[0].pixel[4], {
    field: 'pan',
    bits: 16,
    part: 'fine',
  })

  // A fixture with a wheel and no RGB gets the wheel encoder, positions left to the user.
  const wheelDefinition = {
    manufacturer: 'Generic',
    model: 'Wheel Par',
    type: 'Color Changer',
    channels: [
      { name: 'Dimmer', group: 'Intensity', byte: 0 },
      { name: 'Colour', group: 'Colour', byte: 0 },
    ],
    modes: [{ name: '2 Channel', channels: ['Dimmer', 'Colour'] }],
  }
  check(
    'a wheel-only fixture gets the wheel encoder',
    qlcToProfile(wheelDefinition).modes[0].encoder?.kind,
    'wheel',
  )
}

console.log(`${checks - failures}/${checks} checks passed`)
if (failures > 0) process.exit(1)
