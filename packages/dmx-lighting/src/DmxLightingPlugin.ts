import { HedronEngine, IPlugin } from '@hedron-gl/engine'
import { dmxIcon } from '@hedron-gl/ui-core'
import { globalOptionNodesConfig } from './DmxLightingConfig'
import { DMX_UNIVERSE_SIZE } from './address'
import { PixelSource, PIXEL_STRIDE, SourceRegistry } from './PixelSource'
import { DEFAULT_STAGE, StageBounds } from './layout'
import {
  compileRig,
  CompiledMapping,
  CompiledRig,
  executeRig,
  mappingSourcePixels,
  resolveRig,
} from './RigCompiler'
import {
  ChannelOverride,
  FixtureInstance,
  FixtureType,
  IdentifyTarget,
  Mapping,
  mappingGainNodeId,
  mappingOffsetMax,
  mappingOffsetNodeId,
  modeHeadCount,
  overrideAt,
  overrideBytes,
  overrideNodeId,
} from './fixtures'
import { DEFAULT_TYPES, mergeShippedTypes, normalizeTypes } from './library'
import { ChannelInfo, describeChannels, fixtureMode } from './rigTools'
import { normalizeOverrides, RigFile } from './rigFile'
import { applyMixes, crossfadeWeights, MixSource, mixPositionNodeId, normalizeMixes } from './mixer'
import { UniverseSet } from './UniverseSet'
import { UniverseSender, FrameContext } from './UniverseSender'
import { ArtNetSender } from './protocols/ArtNetSender'
import { SacnSender } from './protocols/SacnSender'
import type { DmxDeviceInfo, DmxProtocol, LerpMode } from './types'

// Extend Window type for Electron bridge
declare global {
  interface Window {
    electron?: {
      dmxWriteUniverse: (universe: number, bytes: Uint8Array, lerpSpeed: number) => void
      dmxGetDevices: () => Promise<DmxDeviceInfo[]>
      /** The fixture library, shared by every project; null when none has been saved. */
      dmxLoadLibrary?: () => Promise<string | null>
      dmxSaveLibrary?: (json: string) => Promise<void>
    }
    hedron?: {
      engine: HedronEngine
      lighting: {
        /** Creates or resizes a named pixel buffer and returns it for direct writes. */
        source: (id: string, width?: number, height?: number) => PixelSource
        /** Samples a canvas into a 2D source for spatial mappings. */
        sourceFromCanvas: (
          id: string,
          canvas: HTMLCanvasElement,
          options?: { width?: number; height?: number },
        ) => PixelSource
        /** Convenience for a single-pixel source. */
        setColor: (
          id: string,
          r: number,
          g: number,
          b: number,
          w?: number,
          intensity?: number,
        ) => void
      }
    }
  }
}

export interface DmxLightingState {
  protocol: DmxProtocol
  brightness: number
  lerpSpeed: number
  lerpMode: LerpMode
  devices: DmxDeviceInfo[]
}

/** Version 2 split fixtures from mappings; anything older is discarded rather than migrated. */
const SCHEMA_VERSION = '2'

/** Fallback home for the library when there is no Electron bridge, such as in a browser build. */
const LIBRARY_STORAGE_KEY = 'hedron-dmx-fixture-library'

/** Output override for checking the rig: full white on channels 1–20, or every channel at 0. */
export type DmxTestMode = 'off' | 'white' | 'zero'

/** What a mapping is reading and sending right now, for its range preview. */
export interface MappingPreview {
  source: PixelSource
  /** Source pixel indices read this frame. */
  used: number[]
  heads: Array<{ fixtureId: string; head: number; colour: [number, number, number] }>
}

type ConfigKey = 'fixtures' | 'mappings' | 'mixes' | 'overrides' | 'types'
const CONFIG_KEYS: ConfigKey[] = ['fixtures', 'mappings', 'mixes', 'overrides', 'types']

export class DmxLightingPlugin implements IPlugin {
  public static ID = 'dmx-lighting'
  public readonly id = DmxLightingPlugin.ID
  public readonly name = 'DMX Lighting'
  public readonly iconName = dmxIcon
  public readonly description = 'Controls DMX lighting fixtures via ArtNet or sACN.'
  public readonly globalOptionNodesConfig = globalOptionNodesConfig
  public readonly optionNodesConfig = []

  private engine: HedronEngine
  private sources = new SourceRegistry()
  private library: FixtureType[] = [...DEFAULT_TYPES]
  private fixtures: FixtureInstance[] = []
  private mappings: Mapping[] = []
  private mixes: MixSource[] = []
  private overrides: ChannelOverride[] = []
  /** Transient, never persisted — like the test modes, it is a tool for the rig in front of you. */
  private identify: IdentifyTarget | null = null
  private devices: DmxDeviceInfo[] = []
  private universes = new UniverseSet()
  private artnetSender = new ArtNetSender()
  private sacnSender = new SacnSender()
  private sender: UniverseSender

  private compiled: CompiledRig | null = null
  private compiledMappings = new Map<string, Mapping>()
  private configRevision = 0
  private compiledConfigRevision = -1
  private compiledSourceRevision = -1
  /** The offset slider max last fitted to each mapping's source. */
  private fittedOffsetMax = new Map<string, number>()
  private channelInfo: { revision: number; map: Map<number, ChannelInfo> } | null = null
  private stage: StageBounds = { ...DEFAULT_STAGE }
  private scratchCanvas: HTMLCanvasElement | null = null
  /** Transient, never persisted — reloading a project into a blackout would look like a fault. */
  private testMode: DmxTestMode = 'off'
  private lastRaw: Record<ConfigKey, string> = {
    fixtures: '',
    mappings: '',
    mixes: '',
    overrides: '',
    types: '',
  }
  private librarySaveTimer: ReturnType<typeof setTimeout> | null = null

  constructor(engine: HedronEngine) {
    this.engine = engine
    // Universe 0 always exists, so the channel map can set values before anything is hung.
    this.universes.get(0)
    this.sender = new UniverseSender(
      this.universes,
      () => this.composite(),
      this.artnetSender,
      this.sacnSender,
    )
    this.sender.start()
    void this.loadLibrary()
  }

  private keyFor(key: ConfigKey | 'schema-version'): string {
    return `${this.id}-${key}`
  }

  // ── Sketch API ────────────────────────────────────────────────────────────

  /**
   * Creates or resizes a named pixel buffer. Sketches write into `.target`, or use
   * `.set()`. Pass a height to make it a 2D source that spatial mappings can sample.
   */
  public source(id: string, width?: number, height = 1): PixelSource {
    return this.sources.ensure(id, width, height)
  }

  /**
   * Samples any canvas into a 2D source, downscaled to width × height. Call it from a
   * sketch so the readback cost sits on the render loop rather than the DMX tick — it
   * forces a GPU sync, so keep the size small and do not call it more than once a frame.
   */
  public sourceFromCanvas(
    id: string,
    canvas: HTMLCanvasElement,
    options: { width?: number; height?: number } = {},
  ): PixelSource {
    const width = Math.max(1, Math.floor(options.width ?? 32))
    const height = Math.max(1, Math.floor(options.height ?? 18))
    const source = this.sources.ensure(id, width, height)

    if (!this.scratchCanvas) this.scratchCanvas = document.createElement('canvas')
    const scratch = this.scratchCanvas
    if (scratch.width !== width || scratch.height !== height) {
      scratch.width = width
      scratch.height = height
    }

    const context = scratch.getContext('2d', { willReadFrequently: true })
    if (!context) return source
    try {
      context.drawImage(canvas, 0, 0, width, height)
      source.setFromRgba(context.getImageData(0, 0, width, height).data)
    } catch (error) {
      console.warn('[DMX] Could not sample canvas:', error)
    }
    return source
  }

  public setColor(id: string, r: number, g: number, b: number, w = 0, intensity = 255): void {
    this.sources.ensure(id, 1).set(0, r, g, b, w, intensity)
  }

  // ── Rig access for the panel ──────────────────────────────────────────────

  public getSources(): PixelSource[] {
    return this.sources.list()
  }

  public getStage(): StageBounds {
    return this.stage
  }

  public getLibrary(): FixtureType[] {
    return this.library
  }

  public setLibrary(library: FixtureType[]): void {
    this.library = library
    this.saveLibrary()
    this.persistConfig()
  }

  public getFixtures(): FixtureInstance[] {
    return this.fixtures
  }

  public setFixtures(fixtures: FixtureInstance[]): void {
    this.fixtures = fixtures
    this.persistConfig()
  }

  public getMappings(): Mapping[] {
    return this.mappings
  }

  public setMappings(mappings: Mapping[]): void {
    this.mappings = mappings
    this.persistConfig()
  }

  public getMixes(): MixSource[] {
    return this.mixes
  }

  public setMixes(mixes: MixSource[]): void {
    this.mixes = mixes
    this.persistConfig()
  }

  /** Each deck's current share of a mix, so the panel can show which one is safe to swap. */
  public getMixWeights(mixId: string): number[] {
    const mix = this.mixes.find((m) => m.id === mixId)
    if (!mix) return []
    const paramValues = this.engine.getStore().getState().paramValues
    const position = paramValues[mixPositionNodeId(this.id, mix.id)]
    return crossfadeWeights(typeof position === 'number' ? position : 0, mix.inputs.length)
  }

  public getOverrides(): ChannelOverride[] {
    return this.overrides
  }

  public getOverrideAt(universe: number, channel: number): ChannelOverride | undefined {
    return overrideAt(this.overrides, universe, channel)
  }

  /** An override's live value from its param node, which is what an LFO or MIDI moves. */
  public getOverrideLevel(override: ChannelOverride): number {
    const value = this.engine.getStore().getState().paramValues[overrideNodeId(this.id, override)]
    return typeof value === 'number' ? value : override.value
  }

  /**
   * Holds a channel at a value through a param node; with `bits: 16` the next channel is
   * held too, as the fine byte of one 0–1 value. Replaces any override it overlaps.
   */
  public setOverride(universe: number, channel: number, value: number, bits?: 16): void {
    const covered = bits === 16 ? [channel, channel + 1] : [channel]
    const rest = this.overrides.filter((o) => !covered.some((c) => overrideAt([o], universe, c)))
    const clamped =
      bits === 16 ? Math.min(1, Math.max(0, value)) : Math.min(255, Math.max(0, Math.round(value)))
    const override: ChannelOverride = {
      universe,
      channel,
      value: clamped,
      ...(bits === 16 ? { bits } : {}),
    }
    this.overrides = [...rest, override]
    this.persistConfig()
    // Writing the node as well means typing a value takes effect even once the node exists.
    const nodeId = overrideNodeId(this.id, override)
    this.engine.getStore().setState((state) => {
      state.paramValues[nodeId] = clamped
      return state
    })
  }

  /** Releases whatever override holds a channel, both bytes of a 16-bit pair included. */
  public releaseOverride(universe: number, channel: number): void {
    const held = overrideAt(this.overrides, universe, channel)
    if (!held) return
    this.overrides = this.overrides.filter((o) => o !== held)
    this.persistConfig()
  }

  public getIdentify(): IdentifyTarget | null {
    return this.identify
  }

  /** Flashes a fixture, or one of its heads, over everything else until cleared. */
  public setIdentify(target: IdentifyTarget | null): void {
    this.identify = target
    this.configRevision++
  }

  /** Which fixtures sit on each channel and what drives them, cached until the rig changes. */
  public getChannelInfo(): Map<number, ChannelInfo> {
    if (this.channelInfo?.revision !== this.configRevision) {
      this.channelInfo = {
        revision: this.configRevision,
        map: describeChannels(this.fixtures, this.library, this.mappings),
      }
    }
    return this.channelInfo.map
  }

  /** The colour each head of a fixture is being sent, highest value winning where mappings overlap. */
  public getFixtureHeadColors(fixtureId: string): Array<[number, number, number]> {
    const fixture = this.fixtures.find((f) => f.id === fixtureId)
    const resolved = fixture ? fixtureMode(fixture, this.library) : null
    if (!resolved) return []
    const out: Array<[number, number, number]> = Array.from(
      { length: modeHeadCount(resolved.mode) },
      () => [0, 0, 0],
    )

    for (const mapping of this.compiled?.mappings ?? []) {
      for (let p = 0; p < mapping.heads; p++) {
        if (mapping.fixtureIds[p] !== fixtureId) continue
        const colour = out[mapping.headIndex[p]]
        if (!colour) continue
        const [r, g, b] = displayColour(mapping, p)
        colour[0] = Math.max(colour[0], r)
        colour[1] = Math.max(colour[1], g)
        colour[2] = Math.max(colour[2], b)
      }
    }
    return out
  }

  public getMappingPreview(mappingId: string): MappingPreview | null {
    const mapping = this.compiled?.mappings.find((m) => m.mappingId === mappingId)
    if (!mapping) return null
    return {
      source: mapping.source,
      used: mappingSourcePixels(mapping),
      heads: mapping.fixtureIds.map((fixtureId, p) => ({
        fixtureId,
        head: mapping.headIndex[p],
        colour: displayColour(mapping, p),
      })),
    }
  }

  public getUniverseSnapshot(universe: number): Uint8Array {
    return this.universes.snapshot(universe)
  }

  public getUniverseIds(): number[] {
    return this.universes.universeIds()
  }

  /** Replaces the rig with a rig file's, adding any fixture types the library is missing. */
  public importRig(rig: RigFile): void {
    this.addMissingTypes(rig.types)
    this.fixtures = rig.fixtures
    this.mappings = rig.mappings
    this.mixes = rig.mixes
    this.overrides = rig.overrides
    this.persistConfig()
    this.engine.getStore().setState((state) => {
      state.paramValues[`${this.id}-global-stageWidth`] = rig.stage.width
      state.paramValues[`${this.id}-global-stageDepth`] = rig.stage.depth
      return state
    })
  }

  // ── Fixture library ───────────────────────────────────────────────────────

  /**
   * The library lives outside the project, so a light defined for one show is there for
   * the next. Shipped types are only stored once edited, so fixes to them still arrive.
   */
  private async loadLibrary(): Promise<void> {
    let raw: string | null = null
    try {
      raw = (await window.electron?.dmxLoadLibrary?.()) ?? null
    } catch (error) {
      console.warn('[DMX] Could not load the fixture library:', error)
    }
    if (raw === null) {
      try {
        raw = localStorage.getItem(LIBRARY_STORAGE_KEY)
      } catch (_) {
        raw = null
      }
    }
    if (!raw) return

    let saved: FixtureType[] = []
    try {
      saved = normalizeTypes(JSON.parse(raw))
    } catch (_) {
      console.warn('[DMX] The saved fixture library is not valid JSON; using the shipped types')
      return
    }

    // Anything a project brought in before the library finished loading is kept.
    const ids = new Set(saved.map((t) => t.id))
    const pending = this.library.filter((t) => !ids.has(t.id) && !DEFAULT_TYPES.includes(t))
    this.library = mergeShippedTypes([...saved, ...pending])
    this.configRevision++
    if (pending.length > 0) this.saveLibrary()
  }

  private saveLibrary(): void {
    if (this.librarySaveTimer) clearTimeout(this.librarySaveTimer)
    // Debounced, since the library editor saves on every keystroke.
    this.librarySaveTimer = setTimeout(() => {
      this.librarySaveTimer = null
      const shipped = new Map(DEFAULT_TYPES.map((t) => [t.id, JSON.stringify(t)]))
      const changed = this.library.filter((t) => shipped.get(t.id) !== JSON.stringify(t))
      const json = JSON.stringify(changed, null, 2)
      if (window.electron?.dmxSaveLibrary) {
        window.electron
          .dmxSaveLibrary(json)
          .catch((error) => console.warn('[DMX] Could not save the fixture library:', error))
        return
      }
      try {
        localStorage.setItem(LIBRARY_STORAGE_KEY, json)
      } catch (error) {
        console.warn('[DMX] Could not save the fixture library:', error)
      }
    }, 400)
  }

  /** Adds types a project or rig file carries that this machine's library lacks. */
  private addMissingTypes(types: FixtureType[]): void {
    const ids = new Set(this.library.map((t) => t.id))
    const missing = types.filter((t) => !ids.has(t.id))
    if (missing.length === 0) return
    this.library = [...this.library, ...missing]
    this.saveLibrary()
    console.log(`[DMX] Added ${missing.length} fixture type(s) from the project to the library`)
  }

  // ── Config persistence ────────────────────────────────────────────────────

  private persistConfig(): void {
    const used = new Set(this.fixtures.map((f) => f.typeId))
    const raw: Record<ConfigKey, string> = {
      fixtures: JSON.stringify(this.fixtures),
      mappings: JSON.stringify(this.mappings),
      mixes: JSON.stringify(this.mixes),
      overrides: JSON.stringify(this.overrides),
      // The types the rig uses travel with the project, for opening it on another machine.
      types: JSON.stringify(this.library.filter((t) => used.has(t.id))),
    }
    this.lastRaw = raw
    this.configRevision++
    this.syncNodes()

    this.engine.getStore().setState((state) => {
      for (const key of CONFIG_KEYS) state.paramValues[this.keyFor(key)] = raw[key]
      state.paramValues[this.keyFor('schema-version')] = SCHEMA_VERSION
      return state
    })
  }

  private syncNodes(): void {
    this.syncMappingNodes()
    this.syncMixNodes()
    this.syncOverrideNodes()
  }

  /** Removes param nodes under `prefix` that match `pattern` but are not wanted any more. */
  private removeStaleNodes(pattern: RegExp, wanted: Set<string>): void {
    const store = this.engine.getStore()
    // Only the params themselves match; their sliderMin and sliderMax children go with them.
    const stale = Object.keys(store.getState().nodes).filter(
      (nodeId) => pattern.test(nodeId) && !wanted.has(nodeId),
    )
    for (const nodeId of stale) store.getState().deleteNode(nodeId)
  }

  /**
   * Gives every mapping an offset and gain param node, so both can be driven by LFOs, MIDI
   * and the timeline like any other param. Ids are deterministic, so a reload reattaches
   * whatever was mapped to them.
   */
  private syncMappingNodes(): void {
    const wanted = new Set<string>()

    for (const mapping of this.mappings) {
      const offsetId = mappingOffsetNodeId(this.id, mapping.id)
      const gainId = mappingGainNodeId(this.id, mapping.id)
      wanted.add(offsetId)
      wanted.add(gainId)
      const title = mapping.name || mapping.source || mapping.id

      this.engine.addNodeOnce(offsetId, null, {
        nodeType: 'param',
        key: `map-${mapping.id}-offset`,
        title: `${title} Offset`,
        valueType: 'number',
        defaultValue: mapping.offset ?? 0,
        sliderMin: 0,
        sliderMax: 128,
      })
      this.engine.addNodeOnce(gainId, null, {
        nodeType: 'param',
        key: `map-${mapping.id}-gain`,
        title: `${title} Gain`,
        valueType: 'number',
        defaultValue: mapping.gain ?? 1,
        sliderMin: 0,
        sliderMax: 1,
      })
    }

    this.removeStaleNodes(new RegExp(`^${this.id}-map-.*-(offset|gain)$`), wanted)
  }

  /**
   * Sizes each offset slider to the range its source can supply. Only a change in that
   * range is written, so a max set by hand holds until the source or mapping changes shape.
   */
  private fitOffsetSliders(paramValues: Record<string, unknown>): void {
    const updates: Array<[string, number]> = []
    for (const compiled of this.compiled?.mappings ?? []) {
      const mapping = this.compiledMappings.get(compiled.mappingId)
      if (!mapping) continue
      const max = mappingOffsetMax(mapping, compiled.source.pixelCount, compiled.heads)
      if (this.fittedOffsetMax.get(compiled.mappingId) === max) continue
      this.fittedOffsetMax.set(compiled.mappingId, max)
      const key = `${mappingOffsetNodeId(this.id, compiled.mappingId)}-sliderMax`
      if (paramValues[key] !== max) updates.push([key, max])
    }
    if (updates.length === 0) return
    this.engine.getStore().setState((state) => {
      for (const [key, max] of updates) state.paramValues[key] = max
      return state
    })
  }

  /** One crossfader node per mix, keyed on the mix id so MIDI mappings survive renames and reloads. */
  private syncMixNodes(): void {
    const wanted = new Set<string>()

    for (const mix of this.mixes) {
      const nodeId = mixPositionNodeId(this.id, mix.id)
      wanted.add(nodeId)
      this.engine.addNodeOnce(nodeId, null, {
        nodeType: 'param',
        key: `mix-${mix.id}-position`,
        title: `${mix.source} Crossfade`,
        valueType: 'number',
        defaultValue: 0,
        sliderMin: 0,
        sliderMax: 1,
      })
    }

    this.removeStaleNodes(new RegExp(`^${this.id}-mix-.*-position$`), wanted)

    // Outputs of removed or renamed mixes go back to being ordinary smoothed sources.
    const outputs = new Set(this.mixes.map((mix) => mix.source))
    for (const source of this.sources.list()) source.derived = outputs.has(source.id)
  }

  /** A param node per held channel, so a value can be set and forgotten or put on a controller. */
  private syncOverrideNodes(): void {
    const wanted = new Set<string>()

    for (const o of this.overrides) {
      const nodeId = overrideNodeId(this.id, o)
      const wide = o.bits === 16
      wanted.add(nodeId)
      this.engine.addNodeOnce(nodeId, null, {
        nodeType: 'param',
        key: `${wide ? 'overridepair' : 'override'}-${o.universe}-${o.channel}`,
        title: wide
          ? `Channels ${o.universe}:${o.channel}–${o.channel + 1} (16-bit)`
          : `Channel ${o.universe}:${o.channel}`,
        valueType: 'number',
        defaultValue: o.value,
        sliderMin: 0,
        sliderMax: wide ? 1 : 255,
      })
    }

    // `override16` is the earlier 0–65535 pair node, cleared out now that pairs are 0–1.
    this.removeStaleNodes(new RegExp(`^${this.id}-override(16|pair)?-\\d+-\\d+$`), wanted)
  }

  /** Picks up project loads and panel edits by watching the raw stored strings. */
  private syncConfigFromStore(paramValues: Record<string, unknown>): void {
    if (paramValues[this.keyFor('schema-version')] !== SCHEMA_VERSION) {
      this.discardOldConfig(paramValues)
      return
    }

    const raw = {} as Record<ConfigKey, string>
    for (const key of CONFIG_KEYS) raw[key] = (paramValues[this.keyFor(key)] as string) ?? ''
    if (CONFIG_KEYS.every((key) => raw[key] === this.lastRaw[key])) return
    this.lastRaw = raw

    const parse = <T>(text: string, normalize: (value: unknown) => T, fallback: T): T => {
      try {
        return text ? normalize(JSON.parse(text)) : fallback
      } catch (_) {
        return fallback
      }
    }

    this.addMissingTypes(parse(raw.types, normalizeTypes, []))
    this.fixtures = parse(raw.fixtures, (v) => (Array.isArray(v) ? v : []), [])
    this.mappings = parse(raw.mappings, (v) => (Array.isArray(v) ? v : []), [])
    this.mixes = parse(raw.mixes, normalizeMixes, [])
    this.overrides = parse(raw.overrides, normalizeOverrides, [])

    this.configRevision++
    this.syncNodes()
  }

  /**
   * Projects from before fixtures and mappings were split start with an empty rig. Their
   * mixes are kept, since that format did not change.
   */
  private discardOldConfig(paramValues: Record<string, unknown>): void {
    const mixesRaw = paramValues[this.keyFor('mixes')]
    this.fixtures = []
    this.mappings = []
    this.overrides = []
    try {
      this.mixes = typeof mixesRaw === 'string' ? normalizeMixes(JSON.parse(mixesRaw)) : []
    } catch (_) {
      this.mixes = []
    }

    const legacy = Object.keys(paramValues).filter(
      (key) =>
        key === `${this.id}-profiles` ||
        key === `${this.id}-patch` ||
        (key.startsWith(`${this.id}-fixture-`) && key.endsWith('-mappings')),
    )
    if (legacy.length > 0) {
      console.log('[DMX] Discarded a rig saved by an older version; start the patch fresh')
      this.engine.getStore().setState((state) => {
        for (const key of legacy) delete state.paramValues[key]
        return state
      })
    }
    this.removeStaleNodes(new RegExp(`^${this.id}-tap-.*-(offset|gain)$`), new Set())
    this.persistConfig()
  }

  // ── Frame ─────────────────────────────────────────────────────────────────

  /** Smooths every source, then executes the compiled rig into the universe buffers. */
  private composite(): FrameContext {
    const paramValues = this.engine.getStore().getState().paramValues as Record<string, unknown>
    this.syncConfigFromStore(paramValues)

    const protocol = (paramValues[`${this.id}-global-protocol`] as DmxProtocol) || 'artnet'
    const brightness = (paramValues[`${this.id}-global-brightness`] as number) ?? 1
    const lerpSpeed = (paramValues[`${this.id}-global-lerpSpeed`] as number) ?? 0.2
    const lerpMode = (paramValues[`${this.id}-global-lerpMode`] as LerpMode) || 'linear-rgb'
    const dither = (paramValues[`${this.id}-global-dither`] as boolean) ?? true

    const stageWidth =
      (paramValues[`${this.id}-global-stageWidth`] as number) ?? DEFAULT_STAGE.width
    const stageDepth =
      (paramValues[`${this.id}-global-stageDepth`] as number) ?? DEFAULT_STAGE.depth
    if (stageWidth !== this.stage.width || stageDepth !== this.stage.depth) {
      this.stage = { width: stageWidth, depth: stageDepth }
      this.configRevision++
    }

    // Matches the previous convention where lerpSpeed 0 is instant and 1 never arrives.
    const factor = 1 - Math.max(0, Math.min(1, lerpSpeed))
    this.sources.smoothAll(factor, lerpMode)

    // Mixes read their decks' smoothed values, so they run after smoothing and before the rig.
    applyMixes(
      this.mixes,
      (mix) => {
        const position = paramValues[mixPositionNodeId(this.id, mix.id)]
        return typeof position === 'number' ? position : 0
      },
      this.sources,
    )

    if (
      !this.compiled ||
      this.compiledConfigRevision !== this.configRevision ||
      this.compiledSourceRevision !== this.sources.revision
    ) {
      this.compiled = compileRig(
        this.fixtures,
        this.library,
        this.mappings,
        this.sources,
        this.stage,
        this.identify,
      )
      this.compiledMappings = new Map(this.mappings.map((m) => [m.id, m]))
      this.compiledConfigRevision = this.configRevision
      this.compiledSourceRevision = this.sources.revision
      this.fitOffsetSliders(paramValues)
    }

    // Offset and gain come from param nodes so they can be modulated like any other
    // param; the stored mapping values are the fallback and the node's seed.
    for (const compiled of this.compiled.mappings) {
      const mapping = this.compiledMappings.get(compiled.mappingId)
      const offset = paramValues[mappingOffsetNodeId(this.id, compiled.mappingId)]
      const gain = paramValues[mappingGainNodeId(this.id, compiled.mappingId)]
      compiled.offset = typeof offset === 'number' ? offset : (mapping?.offset ?? 0)
      compiled.gain = typeof gain === 'number' ? gain : (mapping?.gain ?? 1)
    }

    resolveRig(this.compiled, brightness, performance.now())

    const overrides = this.overrides.flatMap((o) => {
      const value = paramValues[overrideNodeId(this.id, o)]
      return overrideBytes(o, typeof value === 'number' ? value : o.value)
    })

    // All-zero replaces the show outright; full white overlays its channels on top of it.
    if (this.testMode !== 'zero') executeRig(this.compiled, this.universes, dither, overrides)
    this.applyTestPattern()

    // Smoothing already happened per pixel, so the transport copies straight through.
    return { protocol, lerpSpeed: 0 }
  }

  // ── Devices ───────────────────────────────────────────────────────────────

  async fetchDeviceInfo() {
    if (window?.electron?.dmxGetDevices) {
      try {
        this.devices = await window.electron.dmxGetDevices()
      } catch (error) {
        console.error('[DMX] Failed to fetch devices:', error)
        this.devices = [{ name: 'Error fetching devices', status: 'Error' }]
      }
    } else {
      const paramValues = this.engine.getStore().getState().paramValues
      const protocol = (paramValues[`${this.id}-global-protocol`] as string) || 'artnet'
      this.devices = [{ name: 'Stub Device', protocol, status: 'Not implemented' }]
    }
  }

  public getDevices(): DmxDeviceInfo[] {
    return this.devices
  }

  public destroy() {
    this.sender.stop()
  }

  logDeviceInfo() {
    console.log('DMX Devices:', this.devices)
    console.log(
      'DMX Sources:',
      this.sources.list().map((s) => `${s.id} (${s.pixelCount}px)`),
    )
    console.log('DMX Fixtures:', this.fixtures)
    console.log('DMX Mappings:', this.mappings)
    console.log('DMX Universes:', this.universes.universeIds())
    console.log('DMX Writes per frame:', this.compiled?.writeCount ?? 0)
  }

  public getTestMode(): DmxTestMode {
    return this.testMode
  }

  /**
   * Latches a test pattern until switched off. A one-shot write would be overwritten by the
   * next composite tick on every patched channel, so the pattern is re-applied each frame.
   */
  public setTestMode(mode: DmxTestMode): void {
    if (mode === this.testMode) return
    const leaving = this.testMode
    this.testMode = mode
    console.log(`[DMX] Test mode: ${mode}`)
    // Drop whatever the test wrote; the next tick rewrites every channel before sending.
    if (leaving !== 'off') this.universes.clear()
  }

  private applyTestPattern(): void {
    if (this.testMode === 'zero') {
      for (const universe of this.universes.universeIds()) {
        this.universes.fill(universe, 1, DMX_UNIVERSE_SIZE, 0)
      }
    } else if (this.testMode === 'white') {
      this.universes.fill(0, 1, 20, 255)
    }
  }
}

/** A head's colour as a screen swatch: white folded into RGB, before encoding. */
function displayColour(mapping: CompiledMapping, p: number): [number, number, number] {
  const o = p * PIXEL_STRIDE
  const w = mapping.colours[o + 3]
  return [
    Math.min(255, mapping.colours[o] + w),
    Math.min(255, mapping.colours[o + 1] + w),
    Math.min(255, mapping.colours[o + 2] + w),
  ]
}
