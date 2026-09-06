// Headless check of the DMX compositor: build a patch, write sources, assert universe
// bytes. No hardware, no engine, no test framework — run with `pnpm verify`.
import {
  SourceRegistry,
  UniverseSet,
  compilePatch,
  executePatch,
  findAddressConflicts,
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
  executePatch(compiled, universes, brightness)
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
  executePatch(compiled, universes, 1)
  check('first frame is dirty', universes.takeDirty().length, 1)

  executePatch(compiled, universes, 1)
  check('unchanged frame sends nothing', universes.takeDirty().length, 0)

  registry.ensure('s').set(0, 10, 20, 31, 0, 255)
  registry.smoothAll(1, 'linear-rgb')
  executePatch(compiled, universes, 1)
  check('changed byte is dirty again', universes.takeDirty().length, 1)
}

console.log(`${checks - failures}/${checks} checks passed`)
if (failures > 0) process.exit(1)
