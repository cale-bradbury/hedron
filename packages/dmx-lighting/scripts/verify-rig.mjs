// Headless check of the DMX compositor: build a rig, write sources, assert universe bytes.
// No hardware, no engine, no test framework — run with `pnpm verify`.
import {
  SourceRegistry,
  UniverseSet,
  compileRig,
  executeRig,
  resolveRig,
  mappingSourcePixels,
  describeChannels,
  channelKey,
  findNextFreeAddress,
  fixtureSpan,
  sharedWith,
  sortFixturesByAddress,
  universeUsage,
  repeatHeads,
  modeHeadCount,
  channelLabel,
  DEFAULT_TYPES,
  qlcToFixtureType,
  pixelWorldPositions,
  worldToUv,
  uvToWorld,
  parseRigFile,
  buildRigFile,
  PIXEL_STRIDE,
  applyMixes,
  crossfadeWeights,
  normalizeMixes,
  normalizeOverrides,
  overrideAt,
  overrideBytes,
  mappingOffsetMax,
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

const shipped = (id) => DEFAULT_TYPES.find((t) => t.id === id)
const LP4X = 'yorkville-lp-led4x'
const STEALTH = 'eliminator-stealth-wash-zoom'
const WASHER = 'fodexazy-zq06018'

/** A one-mode type from a channel list, for building small cases. */
const type = (id, channels, encoder) => ({
  id,
  name: id,
  shape: 'par',
  modes: [
    {
      name: 'm',
      channels: channels.map((c) => (typeof c === 'string' ? { field: c } : c)),
      encoder,
    },
  ],
})

const fixture = (id, typeId, channel, extra = {}) => ({
  id,
  name: id,
  typeId,
  modeName: 'm',
  address: { universe: 0, channel },
  ...extra,
})

const mapping = (id, source, targets, extra = {}) => ({
  id,
  name: id,
  source,
  kind: 'spread',
  targets: targets.map((t) => (typeof t === 'string' ? { fixtureId: t } : t)),
  ...extra,
})

const rgbwi = type('rgbwi', ['red', 'green', 'blue', 'white', 'intensity'])
const rgb = type('rgb', ['red', 'green', 'blue'])
const library = [...DEFAULT_TYPES, rgbwi, rgb]

function run(fixtures, mappings, prime, options = {}) {
  const registry = new SourceRegistry()
  prime(registry)
  const universes = new UniverseSet()
  const compiled = compileRig(
    fixtures,
    options.types ?? library,
    mappings,
    registry,
    options.stage,
    options.identify ?? null,
  )
  // Sources start smoothed to nothing, so settle them before executing.
  registry.smoothAll(1, 'linear-rgb')
  resolveRig(compiled, options.brightness ?? 1, options.time ?? 0)
  executeRig(compiled, universes, false, options.overrides ?? [])
  return { universes, compiled, registry }
}

const ramp =
  (id, count, step = 10) =>
  (registry) => {
    const src = registry.ensure(id, count)
    for (let p = 0; p < count; p++) src.set(p, p * step, 0, 0, 0, 255)
  }

// ── The shipped library holds the rig's real fixtures ────────────────────────
{
  const counts = (id) => shipped(id).modes.map((m) => m.channels.length)
  check('LP-LED4X has 8 and 20 channel modes', counts(LP4X), [8, 20])
  check('Stealth Wash Zoom has 5 and 16 channel modes', counts(STEALTH), [5, 16])
  check('wall washer has 4, 112 and 114 channel modes', counts(WASHER), [4, 112, 114])
  check('LP-LED4X has four pods', modeHeadCount(shipped(LP4X).modes[1]), 4)
  check('wall washer 112ch has 28 cells', modeHeadCount(shipped(WASHER).modes[1]), 28)
  check('a headless mode is one implicit head', modeHeadCount(shipped(STEALTH).modes[1]), 1)
  check(
    'mode descriptions carry the DIP switch',
    shipped(LP4X).modes.map((m) => /#1[01] ON/.test(m.description)),
    [true, true],
  )
  check(
    'channels are named by head',
    channelLabel(shipped(LP4X), shipped(LP4X).modes[1], 7),
    'Pod 2 Blue',
  )
  check(
    'a labelled channel keeps its label',
    channelLabel(shipped(STEALTH), shipped(STEALTH).modes[1], 9),
    'Shutter / strobe',
  )
}

// ── One mapping across two pots; brightness on colour but not intensity ──────
{
  const { universes } = run(
    [fixture('a', 'rgbwi', 1), fixture('b', 'rgbwi', 6)],
    [mapping('m', 'house', ['a', 'b'])],
    (registry) => registry.ensure('house', 1).set(0, 200, 100, 50, 25, 255),
    { brightness: 0.5 },
  )
  check('pot a', slice(universes, 0, 1, 5), [100, 50, 25, 13, 255])
  check('pot b reads the same single pixel', slice(universes, 0, 6, 5), [100, 50, 25, 13, 255])
  check('ch11 is left clear', slice(universes, 0, 11, 1), [0])
}

// ── LP-LED4X 20ch: four pods, each its own pixel ─────────────────────────────
{
  const { universes } = run(
    [fixture('bar', LP4X, 60, { modeName: '20ch (Mode 3)' })],
    [mapping('m', 'pods', ['bar'])],
    ramp('pods', 4, 10),
  )
  check('pod 1 is RGBWI from ch60', slice(universes, 0, 60, 5), [0, 0, 0, 0, 255])
  check('pod 2 starts at ch65', slice(universes, 0, 65, 5), [10, 0, 0, 0, 255])
  check('pod 4 starts at ch75', slice(universes, 0, 75, 5), [30, 0, 0, 0, 255])
  check('nothing past the fixture', slice(universes, 0, 80, 1), [0])
}

// ── One pod driven by the average of a range; the others send defaults ───────
{
  const { universes } = run(
    [fixture('bar', LP4X, 1, { modeName: '20ch (Mode 3)' })],
    [mapping('m', 'strip', [{ fixtureId: 'bar', heads: [1] }], { kind: 'reduce', span: 4 })],
    ramp('strip', 8),
  )
  check('pod 2 shows the average of pixels 0–3', slice(universes, 0, 6, 5), [15, 0, 0, 0, 255])
  check('pod 1 is untouched', slice(universes, 0, 1, 5), [0, 0, 0, 0, 0])

  const offset = run(
    [fixture('bar', LP4X, 1, { modeName: '20ch (Mode 3)' })],
    [mapping('m', 'strip', ['bar'], { kind: 'reduce', span: 2, offset: 6 })],
    ramp('strip', 8),
  )
  check('reduce starts at the offset', slice(offset.universes, 0, 1, 1), [65])
  check('and every pod shows it', slice(offset.universes, 0, 16, 1), [65])
}

// ── Brightest and darkest pick a whole pixel by luma ─────────────────────────
{
  const prime = (registry) => {
    const src = registry.ensure('mixed', 4)
    src.set(0, 10, 10, 10)
    src.set(1, 200, 0, 0)
    src.set(2, 0, 0, 50)
    src.set(3, 0, 100, 0)
  }
  const pick = (reduce) =>
    slice(
      run(
        [fixture('p', 'rgb', 1)],
        [mapping('m', 'mixed', ['p'], { kind: 'reduce', reduce })],
        prime,
      ).universes,
      0,
      1,
      3,
    )
  check('brightest is the green pixel', pick('brightest'), [0, 100, 0])
  check('darkest is the dim blue pixel', pick('darkest'), [0, 0, 50])
  check('average blends all four', pick('average'), [53, 28, 15])
}

// ── Overlapping fixtures: a pot piggybacking on the first pod ────────────────
{
  const fixtures = [
    fixture('bar', LP4X, 60, { modeName: '20ch (Mode 3)' }),
    fixture('pot', 'rgb', 60),
  ]
  const prime = (a, b) => (registry) => {
    registry.ensure('a', 1).set(0, ...a)
    registry.ensure('b', 1).set(0, ...b)
  }
  const both = [mapping('A', 'a', [{ fixtureId: 'bar', heads: [0] }]), mapping('B', 'b', ['pot'])]

  const potHigher = run(fixtures, both, prime([100, 0, 0], [200, 50, 0]))
  check(
    'highest value wins on a shared channel',
    slice(potHigher.universes, 0, 60, 3),
    [200, 50, 0],
  )
  check('the bar keeps its own channels', slice(potHigher.universes, 0, 63, 2), [0, 255])

  const barHigher = run(fixtures, both, prime([250, 0, 0], [30, 0, 0]))
  check('either side can win', slice(barHigher.universes, 0, 60, 1), [250])

  const onlyBar = run(fixtures, [both[0]], prime([100, 0, 0], [0, 0, 0]))
  check('an unmapped sharer only sends its default', slice(onlyBar.universes, 0, 60, 1), [100])

  const info = describeChannels(fixtures, library, both)
  const shared = info.get(channelKey(0, 60))
  check(
    'both fixtures are named on the shared channel',
    shared.uses.map((u) => u.fixtureName),
    ['bar', 'pot'],
  )
  check('both mappings count as drivers', shared.drivers, 2)
  check(
    'what the channel does for each',
    shared.uses.map((u) => u.label),
    ['Pod 1 Red', 'Red'],
  )
  check('a channel only one fixture uses', info.get(channelKey(0, 63)).uses.length, 1)
  check('which mapping drives it', info.get(channelKey(0, 61)).uses[1].drivenBy, ['B'])
  check(
    'one driver is not a warning',
    describeChannels(fixtures, library, [both[0]]).get(channelKey(0, 60)).drivers,
    1,
  )
  check('unpatched channels are absent', info.has(channelKey(0, 100)), false)
}

// ── A driven value beats any default, even a higher one ──────────────────────
{
  const hot = type('hot', [{ field: 'dimmer', default: 255 }])
  const { universes } = run(
    [fixture('bar', LP4X, 1, { modeName: '20ch (Mode 3)' }), fixture('hot', 'hot', 1)],
    [mapping('m', 's', [{ fixtureId: 'bar', heads: [0] }])],
    (registry) => registry.ensure('s', 1).set(0, 10, 0, 0),
    { types: [...library, hot] },
  )
  check('driven beats default', slice(universes, 0, 1, 1), [10])
}

// ── Defaults hold the channels nothing drives ────────────────────────────────
{
  const idle = run([fixture('mover', STEALTH, 100, { modeName: '16ch' })], [], () => {})
  check('pan and tilt rest centred', slice(idle.universes, 0, 100, 4), [128, 0, 128, 0])
  check('master dimmer and shutter rest open', slice(idle.universes, 0, 108, 2), [255, 255])

  const lit = run(
    [fixture('mover', STEALTH, 100, { modeName: '16ch' })],
    [mapping('m', 's', ['mover'])],
    (registry) => registry.ensure('s', 1).set(0, 10, 20, 30, 40, 255),
  )
  check(
    'the mover takes RGBW from the mapping',
    slice(lit.universes, 0, 104, 5),
    [10, 20, 30, 40, 255],
  )
  check('and keeps its pan default', slice(lit.universes, 0, 100, 1), [128])

  const washer = run(
    [fixture('wash', WASHER, 1, { modeName: '114ch' })],
    [mapping('m', 'cells', ['wash'])],
    ramp('cells', 28, 1),
  )
  check('the washer master dimmer rests at full', slice(washer.universes, 0, 1, 2), [255, 0])
  check('cell 2 follows pixel 1', slice(washer.universes, 0, 7, 4), [1, 0, 0, 0])
  check('cell 28 follows pixel 27', slice(washer.universes, 0, 111, 4), [27, 0, 0, 0])
}

// ── The Stealth's 5ch colour macro goes through the wheel encoder ────────────
{
  const macro = (colour) =>
    run(
      [fixture('mover', STEALTH, 1, { modeName: '5ch' })],
      [mapping('m', 's', ['mover'])],
      (registry) => registry.ensure('s', 1).set(0, ...colour),
    ).universes
  check('red picks the red macro', slice(macro([220, 10, 10]), 0, 1, 3), [128, 128, 8])
  check('cyan picks green + blue', slice(macro([0, 200, 200]), 0, 3, 1), [33])
  check('black picks off', slice(macro([0, 0, 0]), 0, 3, 1), [0])
}

// ── LP-LED4X 8ch: intensity per pod from luma, macro left to an override ─────
{
  const fixtures = [fixture('bar', LP4X, 1, { modeName: '8ch (Mode 2)' })]
  const mappings = [mapping('m', 's', ['bar'])]
  const { universes } = run(fixtures, mappings, (registry) =>
    registry.ensure('s', 1).set(0, 255, 255, 255),
  )
  check('each pod intensity follows the colour', slice(universes, 0, 1, 4), [255, 0, 255, 0])

  const info = describeChannels(fixtures, library, mappings)
  check('intensity is driven', info.get(channelKey(0, 1)).uses[0].drivenBy, ['m'])
  check('the macro is not', info.get(channelKey(0, 2)).uses[0].drivenBy, [])
  check('the macro is named per pod', info.get(channelKey(0, 4)).uses[0].label, 'Pod 2 Macro')
}

// ── Overrides win over mappings and work on unpatched channels ───────────────
{
  const { universes } = run(
    [fixture('pot', 'rgb', 1)],
    [mapping('m', 's', ['pot'])],
    (registry) => registry.ensure('s', 1).set(0, 200, 200, 200),
    {
      overrides: [
        { universe: 0, channel: 2, value: 33 },
        { universe: 0, channel: 400, value: 77 },
        { universe: 3, channel: 1, value: 9 },
      ],
    },
  )
  check('an override beats a mapping', slice(universes, 0, 1, 3), [200, 33, 200])
  check('an override sets an unpatched channel', slice(universes, 0, 400, 1), [77])
  check('an override brings its universe into being', slice(universes, 3, 1, 1), [9])
}

// ── A 16-bit override holds a coarse and fine pair from one value ────────────
{
  const pair = { universe: 0, channel: 100, value: 0x1234 / 65535, bits: 16 }
  check(
    '16-bit splits into coarse and fine',
    overrideBytes(pair, pair.value).map((b) => [b.channel, b.value]),
    [
      [100, 0x12],
      [101, 0x34],
    ],
  )
  check('the fine channel belongs to the pair', overrideAt([pair], 0, 101), pair)
  check('the channel after it does not', overrideAt([pair], 0, 102), undefined)

  const { universes } = run([fixture('mover', STEALTH, 100, { modeName: '16ch' })], [], () => {}, {
    overrides: overrideBytes(pair, 1),
  })
  check('a held pan pair beats its defaults', slice(universes, 0, 100, 3), [255, 255, 128])

  check(
    'stored overrides keep their width and range',
    normalizeOverrides([
      { universe: 0, channel: 1, value: 2, bits: 16 },
      { universe: 0, channel: 3, value: 300 },
    ]),
    [
      { universe: 0, channel: 1, value: 1, bits: 16 },
      { universe: 0, channel: 3, value: 255 },
    ],
  )

  const info = describeChannels([fixture('mover', STEALTH, 1, { modeName: '16ch' })], library, [])
  check(
    'channels know their half of a pair',
    [1, 2, 5].map((c) => info.get(channelKey(0, c)).uses[0].part),
    ['coarse', 'fine', undefined],
  )
}

// ── Offset sliders fit the source ────────────────────────────────────────────
{
  const max = (extra, length, heads) =>
    mappingOffsetMax({ kind: 'spread', targets: [], ...extra }, length, heads)
  check('wrapping allows a full turn', max({ wrap: true }, 28, 4), 28)
  check('a pixel per head slides until the last head hits the end', max({}, 28, 4), 24)
  check('stepping covers more of the source', max({ step: 2 }, 8, 4), 1)
  check('a reduce slides its span', max({ kind: 'reduce', span: 4 }, 8, 1), 4)
  check('a whole-source stretch still gets a usable slider', max({ fit: 'stretch' }, 8, 4), 1)
}

// ── A fixture is targeted once per mapping ───────────────────────────────────
{
  const { universes, compiled } = run(
    [fixture('a', 'rgb', 1)],
    [mapping('m', 'ramp', ['a', 'a'])],
    ramp('ramp', 2, 10),
  )
  check('a repeated target is ignored', compiled.mappings[0].heads, 1)
  check('so the fixture reads only the first pixel', slice(universes, 0, 1, 1), [0])
}

// ── Identify flashes over everything, a whole fixture or one head ────────────
{
  const fixtures = [
    fixture('pot', 'rgbwi', 1),
    fixture('bar', LP4X, 10, { modeName: '20ch (Mode 3)' }),
  ]
  const mappings = [mapping('m', 's', ['pot'])]
  const prime = (registry) => registry.ensure('s', 1).set(0, 100, 0, 0)

  const on = run(fixtures, mappings, prime, { identify: { fixtureId: 'pot' }, time: 0 })
  check(
    'identify drives the fixture to white',
    slice(on.universes, 0, 1, 5),
    [255, 255, 255, 255, 255],
  )

  const off = run(fixtures, mappings, prime, { identify: { fixtureId: 'pot' }, time: 250 })
  check('and blacks it out between flashes', slice(off.universes, 0, 1, 5), [0, 0, 0, 0, 0])

  const head = run(fixtures, mappings, prime, { identify: { fixtureId: 'bar', head: 2 } })
  check('one head can be identified', slice(head.universes, 0, 20, 5), [255, 255, 255, 255, 255])
  check('leaving the others alone', slice(head.universes, 0, 10, 5), [0, 0, 0, 0, 0])
  check('and other fixtures alone', slice(head.universes, 0, 1, 1), [100])
}

// ── Universes are rebuilt each frame, so a removed fixture goes dark ─────────
{
  const registry = new SourceRegistry()
  registry.ensure('s', 1).set(0, 90, 90, 90)
  registry.smoothAll(1, 'linear-rgb')
  const universes = new UniverseSet()

  const before = compileRig(
    [fixture('pot', 'rgb', 1)],
    library,
    [mapping('m', 's', ['pot'])],
    registry,
  )
  resolveRig(before)
  executeRig(before, universes)
  check('lit while patched', slice(universes, 0, 1, 1), [90])
  universes.takeDirty()

  resolveRig(before)
  executeRig(before, universes)
  check('an unchanged frame sends nothing', universes.takeDirty().length, 0)

  const after = compileRig([], library, [], registry)
  resolveRig(after)
  executeRig(after, universes)
  check('dark once removed', slice(universes, 0, 1, 1), [0])
}

// ── Temporal dithering: sub-byte values average out across frames ────────────
{
  const registry = new SourceRegistry()
  // 100.25 after brightness, so a quarter of a step is lost to 8-bit rounding.
  registry.ensure('s', 1).set(0, 200.5, 0, 0, 0, 255)
  const universes = new UniverseSet()
  const compiled = compileRig(
    [fixture('pot', 'rgbwi', 1)],
    library,
    [mapping('m', 's', ['pot'])],
    registry,
  )
  registry.smoothAll(1, 'linear-rgb')

  const frames = []
  for (let f = 0; f < 8; f++) {
    resolveRig(compiled, 0.5)
    executeRig(compiled, universes, true)
    frames.push(slice(universes, 0, 1, 1)[0])
  }
  const mean = frames.reduce((a, b) => a + b, 0) / frames.length
  check('dither straddles the two nearest codes', [...new Set(frames)].sort(), [100, 101])
  check('dither averages to the true value', mean, 100.25)

  const plain = []
  for (let f = 0; f < 4; f++) {
    resolveRig(compiled, 0.5)
    executeRig(compiled, universes, false)
    plain.push(slice(universes, 0, 1, 1)[0])
  }
  check('undithered output is constant', [...new Set(plain)], [100])

  registry.ensure('s').set(0, 200, 0, 0, 0, 255)
  registry.smoothAll(1, 'linear-rgb')
  resolveRig(compiled, 0.5)
  executeRig(compiled, universes, true)
  universes.takeDirty()
  resolveRig(compiled, 0.5)
  executeRig(compiled, universes, true)
  check('exact values do not flutter', universes.takeDirty().length, 0)
}

// ── Spread transforms ────────────────────────────────────────────────────────

/** Eight RGB heads and an 8-pixel ramp, for exercising the spread options. */
const eight = type('eight', repeatHeads(['red', 'green', 'blue'], 8))

function runSpread(extra, prime = ramp('ramp', 8)) {
  return run([fixture('e', 'eight', 1)], [mapping('m', 'ramp', ['e'], extra)], prime, {
    types: [...library, eight],
  })
}

function reds(universes, count = 8) {
  const out = []
  for (let p = 0; p < count; p++) out.push(slice(universes, 0, 1 + p * 3, 1)[0])
  return out
}

{
  check(
    'offset clamps at the end by default',
    reds(runSpread({ offset: 3 }).universes),
    [30, 40, 50, 60, 70, 70, 70, 70],
  )
  check(
    'offset wraps around the source',
    reds(runSpread({ offset: 3, wrap: true }).universes),
    [30, 40, 50, 60, 70, 0, 10, 20],
  )
  check(
    'negative offset wraps too',
    reds(runSpread({ offset: -2, wrap: true }).universes),
    [60, 70, 0, 10, 20, 30, 40, 50],
  )
  check(
    'step 2 takes every other pixel',
    reds(runSpread({ step: 2, wrap: true }).universes),
    [0, 20, 40, 60, 0, 20, 40, 60],
  )
  check(
    'reverse flips the heads',
    reds(runSpread({ arrangement: 'reverse' }).universes),
    [70, 60, 50, 40, 30, 20, 10, 0],
  )
  check(
    'serpentine flips alternate segments',
    reds(runSpread({ arrangement: 'serpentine', segmentSize: 4 }).universes),
    [0, 10, 20, 30, 70, 60, 50, 40],
  )

  const four = ramp('ramp', 4, 30)
  check(
    'stretch repeats each source pixel',
    reds(runSpread({ fit: 'stretch' }, four).universes),
    [0, 0, 30, 30, 60, 60, 90, 90],
  )
  check(
    'stretch with linear interpolates',
    reds(runSpread({ fit: 'stretch', filter: 'linear' }, four).universes),
    [0, 15, 30, 45, 60, 75, 90, 90],
  )
  check(
    'stretch fits only the span from the offset',
    reds(runSpread({ fit: 'stretch', offset: 4, span: 4 }).universes),
    [40, 40, 50, 50, 60, 60, 70, 70],
  )
  check(
    'fractional offset lands between pixels',
    reds(runSpread({ offset: 0.5, filter: 'linear', wrap: true }).universes),
    [5, 15, 25, 35, 45, 55, 65, 35],
  )

  const avg = run(
    [fixture('p', 'rgbwi', 1)],
    [mapping('m', 'ramp', ['p'], { step: 8, filter: 'average' })],
    ramp('ramp', 8),
  )
  check('average filtering means over the step', slice(avg.universes, 0, 1, 1), [35])

  const gain = run(
    [fixture('p', 'rgbwi', 1)],
    [mapping('m', 's', ['p'], { gain: 0.5 })],
    (registry) => registry.ensure('s', 1).set(0, 200, 100, 80, 40, 255),
  )
  check(
    'gain scales colour but not intensity',
    slice(gain.universes, 0, 1, 5),
    [100, 50, 40, 20, 255],
  )
}

// Targets spread in the order they are listed, across fixtures and within one.
{
  const twoPots = run(
    [fixture('a', 'rgb', 1), fixture('b', 'rgb', 4)],
    [mapping('m', 'ramp', ['b', 'a'])],
    ramp('ramp', 2, 10),
  )
  check('the first target takes pixel 0', slice(twoPots.universes, 0, 4, 1), [0])
  check('the second takes pixel 1', slice(twoPots.universes, 0, 1, 1), [10])

  const heads = run(
    [fixture('bar', LP4X, 1, { modeName: '20ch (Mode 3)' })],
    [mapping('m', 'ramp', [{ fixtureId: 'bar', heads: [2, 0] }])],
    ramp('ramp', 2, 10),
  )
  check(
    'heads listed out of order',
    [1, 6, 11].map((c) => slice(heads.universes, 0, c, 1)[0]),
    [10, 0, 0],
  )

  const missing = run(
    [fixture('a', 'rgb', 1)],
    [mapping('m', 'ramp', ['gone', 'a'])],
    ramp('ramp', 2, 10),
  )
  check('a missing target is skipped, not counted', slice(missing.universes, 0, 1, 1), [0])
}

// Offset is read off the compiled mapping each frame, which is how a param node drives it.
{
  const registry = new SourceRegistry()
  ramp('ramp', 8)(registry)
  const universes = new UniverseSet()
  const compiled = compileRig(
    [fixture('e', 'eight', 1)],
    [eight],
    [mapping('m', 'ramp', ['e'], { wrap: true })],
    registry,
  )
  registry.smoothAll(1, 'linear-rgb')

  compiled.mappings[0].offset = 2
  resolveRig(compiled)
  executeRig(compiled, universes)
  check('animated offset scrolls the pattern', reds(universes), [20, 30, 40, 50, 60, 70, 0, 10])

  compiled.mappings[0].offset = 5
  resolveRig(compiled)
  executeRig(compiled, universes)
  check('and again next frame', reds(universes), [50, 60, 70, 0, 10, 20, 30, 40])
}

// The range preview reports the pixels a mapping actually reads.
{
  const reduce = runSpread({ kind: 'reduce', offset: 2, span: 3 })
  check('reduce reads its span', mappingSourcePixels(reduce.compiled.mappings[0]), [2, 3, 4])
  const stepped = run(
    [fixture('bar', LP4X, 1, { modeName: '20ch (Mode 3)' })],
    [mapping('m', 'ramp', ['bar'], { step: 2 })],
    ramp('ramp', 8),
  )
  check(
    'spread reads one pixel per head',
    mappingSourcePixels(stepped.compiled.mappings[0]),
    [0, 2, 4, 6],
  )
}

// ── Encoders ─────────────────────────────────────────────────────────────────

function runEncoder(channels, encoder, colour, brightness = 1) {
  const t = type('enc', channels, encoder)
  return run(
    [fixture('p', 'enc', 1)],
    [mapping('m', 's', ['p'])],
    (registry) => registry.ensure('s', 1).set(0, ...colour),
    {
      types: [t],
      brightness,
    },
  )
}

{
  const rgbw = runEncoder(
    ['red', 'green', 'blue', 'white'],
    { kind: 'rgbw', whiteExtract: 'min' },
    [200, 150, 100, 0, 255],
  )
  check('rgbw extracts the common grey', slice(rgbw.universes, 0, 1, 4), [100, 50, 0, 100])

  const cmy = runEncoder(['cyan', 'magenta', 'yellow'], { kind: 'cmy' }, [255, 0, 0, 0, 255])
  check('cmy inverts the primaries', slice(cmy.universes, 0, 1, 3), [0, 255, 255])

  const half = runEncoder(['dimmer'], { kind: 'dimmer' }, [255, 255, 255, 0, 255], 0.5)
  check('master brightness reaches the dimmer channel', slice(half.universes, 0, 1, 1), [128])

  const wide = [
    { field: 'red', bits: 16, part: 'coarse' },
    { field: 'red', bits: 16, part: 'fine' },
  ]
  check(
    '16-bit splits across coarse and fine',
    slice(runEncoder(wide, { kind: 'rgb' }, [128, 0, 0, 0, 255]).universes, 0, 1, 2),
    [128, 128],
  )

  const unknown = runEncoder(
    ['red', 'pan', { field: 'gobo', default: 7 }],
    { kind: 'rgb' },
    [255, 0, 0, 0, 255],
  )
  check(
    'fields no encoder writes send their default',
    slice(unknown.universes, 0, 1, 3),
    [255, 0, 7],
  )
  check('field table covers them', unknown.compiled.fields.has('gobo'), true)
}

// ── Rig tools: addressing, sharing, usage ────────────────────────────────────
{
  const fixtures = [fixture('a', 'rgbwi', 1), fixture('b', 'rgbwi', 10)]
  check('span comes from the mode', fixtureSpan(fixtures[0], library), 5)
  check('next free skips a gap too small', findNextFreeAddress(fixtures, library, 0, 5), 15)
  check('a small span fits the gap', findNextFreeAddress(fixtures, library, 0, 4), 6)
  check('searching from a channel', findNextFreeAddress(fixtures, library, 0, 2, undefined, 12), 15)
  check(
    'the fixture being moved does not block itself',
    findNextFreeAddress(fixtures, library, 0, 5, 'a'),
    1,
  )
  check('nothing fits past the end', findNextFreeAddress(fixtures, library, 0, 513), null)

  const withPot = [...fixtures, fixture('c', 'rgb', 3)]
  check(
    'sharing is reported both ways',
    [sharedWith(withPot, library).get('a'), sharedWith(withPot, library).get('c')],
    [['c'], ['a']],
  )
  check('usage counts shared channels once', universeUsage(withPot, library), [
    { universe: 0, used: 10 },
  ])
  check(
    'sorting by address',
    sortFixturesByAddress(withPot).map((f) => f.id),
    ['a', 'c', 'b'],
  )
}

// ── QLC+ import: heads, 16-bit pairs and master dimmers ──────────────────────
{
  const type = qlcToFixtureType({
    manufacturer: 'Acme',
    model: 'Bar 2',
    type: 'LED Bar (Pixels)',
    channels: [
      { name: 'Dimmer', group: 'Intensity', byte: 0 },
      { name: 'Red 1', group: 'Intensity', colour: 'Red', byte: 0 },
      { name: 'Green 1', group: 'Intensity', colour: 'Green', byte: 0 },
      { name: 'Red 2', group: 'Intensity', colour: 'Red', byte: 0 },
      { name: 'Green 2', group: 'Intensity', colour: 'Green', byte: 0 },
      { name: 'Pan', group: 'Pan', byte: 0 },
      { name: 'Pan fine', group: 'Pan', byte: 1 },
    ],
    modes: [
      {
        name: '7ch',
        channels: ['Dimmer', 'Red 1', 'Green 1', 'Red 2', 'Green 2', 'Pan', 'Pan fine'],
        heads: [
          [1, 2],
          [3, 4],
        ],
      },
    ],
  })
  check(
    'channels carry field, head, default and part',
    type.modes[0].channels.map((c) => [c.field, c.head ?? null, c.default ?? null, c.part ?? null]),
    [
      ['intensity', null, 255, null],
      ['red', 0, null, null],
      ['green', 0, null, null],
      ['red', 1, null, null],
      ['green', 1, null, null],
      ['pan', null, null, 'coarse'],
      ['pan', null, null, 'fine'],
    ],
  )
  check('manufacturer and shape come across', [type.manufacturer, type.shape], ['Acme', 'bar'])
}

// ── Layout: where a fixture's heads sit on the stage ─────────────────────────
{
  const round = (values) => [...values].map((v) => Math.round(v * 1000) / 1000)
  const bar = { position: [0, 0, 0], rotation: [0, 0, 0], size: [4, 0.1, 0.1] }
  check(
    'heads spread along local X',
    round(pixelWorldPositions(bar, 4)),
    [-1.5, 0, 0, -0.5, 0, 0, 0.5, 0, 0, 1.5, 0, 0],
  )
  check('a single head sits on the centre', round(pixelWorldPositions(bar, 1)), [0, 0, 0])
  const turned = { position: [0, 0, 0], rotation: [0, 90, 0], size: [4, 0.1, 0.1] }
  check(
    'yaw swings the bar onto the Z axis',
    round(pixelWorldPositions(turned, 2)).slice(0, 3),
    [0, 0, 1],
  )
  const stage = { width: 10, depth: 10 }
  check('the origin is the middle of the stage', worldToUv(0, 0, stage), [0.5, 0.5])
  check('and round trips back', uvToWorld(0, 0, stage), [-5, -5])
}

// ── Spatial mappings: heads read where they physically are ───────────────────
{
  const prime = (registry) => {
    const src = registry.ensure('stage', 2, 1)
    src.set(0, 255, 0, 0, 0, 255)
    src.set(1, 0, 0, 255, 0, 255)
  }
  const pair = type('pair', repeatHeads(['red', 'green', 'blue'], 2))
  const types = [pair]
  const at = (position, size, spatial) =>
    run(
      [fixture('e', 'pair', 1, { placement: { position, rotation: [0, 0, 0], size } })],
      [mapping('m', 'stage', ['e'], { spatial })],
      prime,
      { types },
    ).universes

  const spread = at([0, 0, 0], [10, 0.1, 0.1], true)
  check('left head reads the red half', slice(spread, 0, 1, 3), [191, 0, 64])
  check('right head reads the blue half', slice(spread, 0, 4, 3), [64, 0, 191])
  check(
    'moving the fixture changes what it reads',
    slice(at([5, 0, 0], [0.2, 0.1, 0.1], true), 0, 1, 3),
    [1, 0, 254],
  )
  check(
    'placement is ignored without the flag',
    slice(at([5, 0, 0], [0.2, 0.1, 0.1], false), 0, 1, 6),
    [255, 0, 0, 0, 0, 255],
  )
}

// ── Rig files round trip ─────────────────────────────────────────────────────
{
  const fixtures = [
    fixture('pot', 'rgbwi', 9, {
      placement: { position: [1, 2, 3], rotation: [0, 45, 0], size: [1, 1, 1] },
    }),
  ]
  const mappings = [mapping('m', 's', ['pot'])]
  const mix = { id: 'x', source: 'out', inputs: ['a', 'b'], pixelCount: 4 }
  const rig = buildRigFile(
    library,
    fixtures,
    mappings,
    { width: 12, depth: 8 },
    [mix],
    [{ universe: 0, channel: 3, value: 40 }],
  )
  const parsed = parseRigFile(JSON.stringify(rig))
  check('rig survives a round trip', parsed.fixtures[0].placement.rotation, [0, 45, 0])
  check(
    'rig carries only the types it uses',
    parsed.types.map((t) => t.id),
    ['rgbwi'],
  )
  check(
    'rig keeps mappings, mixes and overrides',
    [parsed.mappings.length, parsed.mixes, parsed.overrides],
    [1, [mix], [{ universe: 0, channel: 3, value: 40 }]],
  )
  check('rig keeps the stage', parsed.stage, { width: 12, depth: 8 })
  check('junk is rejected rather than thrown', parseRigFile('not json'), null)
  check('an old patch-based rig is rejected', parseRigFile('{"profiles":[],"patch":[]}'), null)
}

// ── Mixes crossfade between sources ──────────────────────────────────────────
{
  check('two decks split evenly at the midpoint', crossfadeWeights(0.5, 2), [0.5, 0.5])
  check('three decks: 0.75 sits between B and C', crossfadeWeights(0.75, 3), [0, 0.5, 0.5])
  check('out-of-range positions clamp', crossfadeWeights(4, 2), [0, 1])

  const registry = new SourceRegistry()
  const a = registry.ensure('a', 2)
  a.set(0, 200, 0, 0)
  a.set(1, 100, 0, 0)
  const b = registry.ensure('b', 4)
  for (let i = 0; i < 4; i++) b.set(i, 0, 0, 40 * (i + 1))
  registry.smoothAll(1, 'linear-rgb')

  const mix = { id: 'm1', source: 'out', inputs: ['a', 'b'], pixelCount: 4 }
  const read = (field) => (i) => Math.round(registry.get('out').current[i * PIXEL_STRIDE + field])
  const red = read(0)
  const blue = read(2)

  applyMixes([mix], () => 0, registry)
  check('deck A is stretched to the mix width', [0, 1, 2, 3].map(red), [200, 167, 133, 100])
  applyMixes([mix], () => 1, registry)
  check('position 1 plays deck B', [0, 1, 2, 3].map(blue), [40, 80, 120, 160])
  applyMixes([mix], () => 0.5, registry)
  check('halfway blends both decks', [red(0), blue(0)], [100, 20])
  applyMixes([{ ...mix, inputs: ['out', 'b'] }], () => 0, registry)
  check('a mix cannot read its own output', red(0), 0)
  check(
    'stored mixes are sanitised',
    normalizeMixes([{ id: 'x', source: 'o', inputs: ['a', 3], pixelCount: '12' }, { nope: true }]),
    [{ id: 'x', source: 'o', inputs: ['a', ''], pixelCount: 12 }],
  )
}

// ── Universe buffers ─────────────────────────────────────────────────────────
{
  const universes = new UniverseSet()
  universes.write(0, 5, 200)
  universes.takeDirty()
  universes.fill(0, 1, 512, 0)
  check(
    'fill zeroes every channel',
    universes.snapshot(0).every((v) => v === 0),
    true,
  )
  check('fill marks the universe dirty', universes.takeDirty().length, 1)
  universes.fill(0, 1, 20, 255)
  check('a partial fill stops at its end', slice(universes, 0, 20, 2), [255, 0])
  universes.takeDirty()

  universes.setFrame(0, universes.snapshot(0))
  check('an identical frame sends nothing', universes.takeDirty().length, 0)
}

console.log(`${checks - failures}/${checks} checks passed`)
if (failures > 0) process.exit(1)
