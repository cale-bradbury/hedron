import { HedronEngine, IPlugin } from '@hedron-gl/engine'
import { dmxIcon } from '@hedron-gl/ui-core'
import { globalOptionNodesConfig } from './DmxLightingConfig'
import { toAddress } from './address'
import { PixelSource, SourceRegistry } from './PixelSource'
import {
  compilePatch,
  CompiledPatch,
  executePatch,
  findAddressConflicts,
  resolveTaps,
} from './PatchCompiler'
import {
  DEFAULT_PROFILES,
  FixtureProfile,
  makeEntryId,
  PatchEntry,
  tapGainNodeId,
  tapOffsetNodeId,
} from './profiles'
import { UniverseSet } from './UniverseSet'
import { UniverseSender, FrameContext } from './UniverseSender'
import { ArtNetSender } from './protocols/ArtNetSender'
import { SacnSender } from './protocols/SacnSender'
import type { Address } from './address'
import type {
  AddressInput,
  ChannelSlot,
  DmxDeviceInfo,
  DmxProtocol,
  FixtureChannels,
  FixtureMapping,
  FixtureMappingInput,
  LerpMode,
} from './types'

export type { Address } from './address'
export { PixelSource, SourceRegistry } from './PixelSource'
export * from './profiles'
export type {
  ChannelSlot,
  ChannelType,
  DmxDeviceInfo,
  DmxProtocol,
  FixtureChannels,
  FixtureColor,
  FixtureMapping,
  FixtureMappingInput,
  AddressInput,
  LerpMode,
} from './types'

// Extend Window type for Electron bridge
declare global {
  interface Window {
    electron?: {
      dmxWriteUniverse: (universe: number, bytes: Uint8Array, lerpSpeed: number) => void
      dmxGetDevices: () => Promise<DmxDeviceInfo[]>
    }
    hedron?: {
      engine: HedronEngine
      lighting: {
        /** Creates or resizes a named pixel buffer and returns it for direct writes. */
        source: (id: string, pixelCount?: number) => PixelSource
        /** Convenience for a single-pixel source. */
        setColor: (
          id: string,
          r: number,
          g: number,
          b: number,
          w?: number,
          intensity?: number,
        ) => void
        setFixtureColor: (
          id: string,
          channels: FixtureChannels,
          options?: { mappings?: FixtureMappingInput[] },
        ) => void
        setFixtureMappings: (id: string, mappings: FixtureMappingInput[]) => void
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

const SCHEMA_VERSION = '1'

/** Accepts the legacy `startAddresses: number[]` shape persisted before universes existed. */
function normalizeMappings(raw: unknown): FixtureMapping[] {
  if (!Array.isArray(raw)) return []
  return raw.map((mapping) => ({
    startAddresses: Array.isArray(mapping?.startAddresses)
      ? mapping.startAddresses
          .map((value: AddressInput) => toAddress(value))
          .filter((a: Address | null): a is Address => a !== null)
      : [],
    channels: Array.isArray(mapping?.channels) ? (mapping.channels as ChannelSlot[]) : [],
  }))
}

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
  private profiles: FixtureProfile[] = [...DEFAULT_PROFILES]
  private patch: PatchEntry[] = []
  private patchedSources = new Set<string>()
  private devices: DmxDeviceInfo[] = []
  private universes = new UniverseSet()
  private artnetSender = new ArtNetSender()
  private sacnSender = new SacnSender()
  private sender: UniverseSender

  private compiled: CompiledPatch | null = null
  private patchRevision = 0
  private compiledPatchRevision = -1
  private compiledSourceRevision = -1
  private lastProfilesRaw = ''
  private lastPatchRaw = ''

  constructor(engine: HedronEngine) {
    this.engine = engine
    this.sender = new UniverseSender(
      this.universes,
      () => this.composite(),
      this.artnetSender,
      this.sacnSender,
    )
    this.sender.start()
  }

  // ── Store keys ────────────────────────────────────────────────────────────

  private get profilesKey(): string {
    return `${this.id}-profiles`
  }

  private get patchKey(): string {
    return `${this.id}-patch`
  }

  private get versionKey(): string {
    return `${this.id}-schema-version`
  }

  // ── Sketch API ────────────────────────────────────────────────────────────

  /** Creates or resizes a named pixel buffer. Sketches write into `.target`. */
  public source(id: string, pixelCount?: number): PixelSource {
    return this.sources.ensure(id, pixelCount)
  }

  public setColor(id: string, r: number, g: number, b: number, w = 0, intensity = 255): void {
    this.sources.ensure(id, 1).set(0, r, g, b, w, intensity)
  }

  /**
   * Legacy single-colour API. Writes pixel 0 of the source named after the fixture, and
   * auto-patches from the call-site mappings the first time the fixture is seen.
   */
  public setFixtureColor(
    id: string,
    channels: FixtureChannels,
    options?: { mappings?: FixtureMappingInput[] },
  ): void {
    this.sources.ensure(id, 1).setChannels(0, channels)

    if (options?.mappings && !this.patchedSources.has(id)) {
      // A sketch's first frame can beat the first composite tick after a project load, so
      // re-read the stored patch before concluding this fixture has never been patched.
      this.syncConfigFromStore(
        this.engine.getStore().getState().paramValues as Record<string, unknown>,
      )
      if (!this.patchedSources.has(id)) {
        this.applyLegacyMappings(id, normalizeMappings(options.mappings))
      }
    }
  }

  /** Replaces the patch entries generated for a legacy fixture and persists them. */
  public setFixtureMappings(id: string, mappings: FixtureMappingInput[]): void {
    this.applyLegacyMappings(id, normalizeMappings(mappings))
  }

  // ── Patch and profile access for the panel ────────────────────────────────

  public getSources(): PixelSource[] {
    return this.sources.list()
  }

  public getProfiles(): FixtureProfile[] {
    return this.profiles
  }

  public getPatch(): PatchEntry[] {
    return this.patch
  }

  public setProfiles(profiles: FixtureProfile[]): void {
    this.profiles = profiles
    this.persistConfig()
  }

  public setPatch(patch: PatchEntry[]): void {
    this.patch = patch
    this.persistConfig()
  }

  public getAddressConflicts(): Array<{ universe: number; channel: number }> {
    return this.compiled ? findAddressConflicts(this.compiled) : []
  }

  public getUniverseSnapshot(universe: number): Uint8Array {
    return this.universes.snapshot(universe)
  }

  public getUniverseIds(): number[] {
    return this.universes.universeIds()
  }

  // ── Config persistence ────────────────────────────────────────────────────

  private persistConfig(): void {
    const profilesRaw = JSON.stringify(this.profiles)
    const patchRaw = JSON.stringify(this.patch)
    this.lastProfilesRaw = profilesRaw
    this.lastPatchRaw = patchRaw
    this.patchRevision++
    this.refreshPatchedSources()
    this.syncTapNodes()

    this.engine.getStore().setState((state) => {
      state.paramValues[this.profilesKey] = profilesRaw
      state.paramValues[this.patchKey] = patchRaw
      state.paramValues[this.versionKey] = SCHEMA_VERSION
      return state
    })
  }

  private refreshPatchedSources(): void {
    this.patchedSources = new Set(this.patch.map((entry) => entry.tap.source))
  }

  /**
   * Gives every patch entry an offset and gain param node, so both can be driven by LFOs,
   * MIDI and the timeline like any other param. Ids are deterministic, so a reload
   * reattaches whatever was mapped to them.
   */
  private syncTapNodes(): void {
    const wanted = new Set<string>()

    for (const entry of this.patch) {
      const offsetId = tapOffsetNodeId(this.id, entry.id)
      const gainId = tapGainNodeId(this.id, entry.id)
      wanted.add(offsetId)
      wanted.add(gainId)

      this.engine.addNodeOnce(offsetId, null, {
        nodeType: 'param',
        key: `tap-${entry.id}-offset`,
        title: `${entry.name || entry.id} Offset`,
        valueType: 'number',
        defaultValue: entry.tap.offset ?? 0,
        sliderMin: 0,
        sliderMax: 128,
      })
      this.engine.addNodeOnce(gainId, null, {
        nodeType: 'param',
        key: `tap-${entry.id}-gain`,
        title: `${entry.name || entry.id} Gain`,
        valueType: 'number',
        defaultValue: entry.gain ?? 1,
        sliderMin: 0,
        sliderMax: 1,
      })
    }

    // Drop nodes for entries that no longer exist, so removing a fixture does not leave
    // orphaned params behind. Only the params themselves are matched — their sliderMin and
    // sliderMax children share the prefix and are removed with their parent.
    const store = this.engine.getStore()
    const prefix = `${this.id}-tap-`
    const stale = Object.keys(store.getState().nodes).filter(
      (nodeId) =>
        nodeId.startsWith(prefix) &&
        (nodeId.endsWith('-offset') || nodeId.endsWith('-gain')) &&
        !wanted.has(nodeId),
    )
    for (const nodeId of stale) store.getState().deleteNode(nodeId)
  }

  /** Picks up project loads and panel edits by watching the raw stored strings. */
  private syncConfigFromStore(paramValues: Record<string, unknown>): void {
    if (!paramValues[this.versionKey]) {
      this.migrateLegacyConfig(paramValues)
      return
    }

    const profilesRaw = (paramValues[this.profilesKey] as string) ?? ''
    const patchRaw = (paramValues[this.patchKey] as string) ?? ''
    if (profilesRaw === this.lastProfilesRaw && patchRaw === this.lastPatchRaw) return

    this.lastProfilesRaw = profilesRaw
    this.lastPatchRaw = patchRaw

    try {
      const profiles = profilesRaw ? (JSON.parse(profilesRaw) as FixtureProfile[]) : []
      this.profiles = mergeDefaultProfiles(profiles)
    } catch (_) {
      this.profiles = [...DEFAULT_PROFILES]
    }
    try {
      this.patch = patchRaw ? (JSON.parse(patchRaw) as PatchEntry[]) : []
    } catch (_) {
      this.patch = []
    }

    this.patchRevision++
    this.refreshPatchedSources()
    this.syncTapNodes()
  }

  /**
   * Converts pre-Phase-1 `fixture-<id>-mappings` values into profiles and patch entries.
   * Runs once, gated on the schema version, so clearing the patch does not resurrect them.
   */
  private migrateLegacyConfig(paramValues: Record<string, unknown>): void {
    const prefix = `${this.id}-fixture-`
    const suffix = '-mappings'
    const profiles: FixtureProfile[] = []
    const patch: PatchEntry[] = []

    for (const key of Object.keys(paramValues)) {
      if (!key.startsWith(prefix) || !key.endsWith(suffix)) continue
      const fixtureId = key.slice(prefix.length, key.length - suffix.length)

      let mappings: FixtureMapping[] = []
      try {
        mappings = normalizeMappings(JSON.parse(paramValues[key] as string))
      } catch (_) {
        continue
      }

      mappings.forEach((mapping, index) => {
        if (mapping.channels.length === 0) return
        const profileId = `legacy-${fixtureId}-${index}`
        profiles.push({
          id: profileId,
          name: `${fixtureId} (migrated${mappings.length > 1 ? ` ${index + 1}` : ''})`,
          shape: 'generic',
          modes: [{ name: 'default', pixel: mapping.channels, pixelCount: 1 }],
        })
        patch.push({
          id: makeEntryId(),
          name: fixtureId,
          profileId,
          modeName: 'default',
          addresses: mapping.startAddresses,
          tap: { source: fixtureId, count: 1 },
        })
      })
    }

    this.profiles = mergeDefaultProfiles(profiles)
    this.patch = patch
    this.persistConfig()

    if (patch.length > 0) {
      console.log(`[DMX] Migrated ${patch.length} legacy fixture mapping(s) to the patch`)
    }
  }

  /** Rebuilds the generated profile and entries for one legacy fixture id. */
  private applyLegacyMappings(id: string, mappings: FixtureMapping[]): void {
    const generatedPrefix = `legacy-${id}-`
    const profiles = this.profiles.filter((p) => !p.id.startsWith(generatedPrefix))
    const patch = this.patch.filter((e) => !e.profileId.startsWith(generatedPrefix))

    // Keep entry ids stable across a re-patch so the tap's offset and gain nodes survive
    // with whatever is mapped to them.
    const existingIds = new Map(
      this.patch
        .filter((e) => e.profileId.startsWith(generatedPrefix))
        .map((e) => [e.profileId, e.id]),
    )

    mappings.forEach((mapping, index) => {
      if (mapping.channels.length === 0) return
      const profileId = `${generatedPrefix}${index}`
      profiles.push({
        id: profileId,
        name: `${id}${mappings.length > 1 ? ` ${index + 1}` : ''}`,
        shape: 'generic',
        modes: [{ name: 'default', pixel: mapping.channels, pixelCount: 1 }],
      })
      patch.push({
        id: existingIds.get(profileId) ?? makeEntryId(),
        name: id,
        profileId,
        modeName: 'default',
        addresses: mapping.startAddresses,
        tap: { source: id, count: 1 },
      })
    })

    this.profiles = profiles
    this.patch = patch
    this.persistConfig()
  }

  // ── Frame ─────────────────────────────────────────────────────────────────

  /** Smooths every source, then executes the compiled patch into the universe buffers. */
  private composite(): FrameContext {
    const paramValues = this.engine.getStore().getState().paramValues as Record<string, unknown>
    this.syncConfigFromStore(paramValues)

    const protocol = (paramValues[`${this.id}-global-protocol`] as DmxProtocol) || 'artnet'
    const brightness = (paramValues[`${this.id}-global-brightness`] as number) ?? 1
    const lerpSpeed = (paramValues[`${this.id}-global-lerpSpeed`] as number) ?? 0.2
    const lerpMode = (paramValues[`${this.id}-global-lerpMode`] as LerpMode) || 'linear-rgb'
    const dither = (paramValues[`${this.id}-global-dither`] as boolean) ?? true

    // Matches the previous convention where lerpSpeed 0 is instant and 1 never arrives.
    const factor = 1 - Math.max(0, Math.min(1, lerpSpeed))
    this.sources.smoothAll(factor, lerpMode)

    if (
      !this.compiled ||
      this.compiledPatchRevision !== this.patchRevision ||
      this.compiledSourceRevision !== this.sources.revision
    ) {
      this.compiled = compilePatch(this.patch, this.profiles, this.sources)
      this.compiledPatchRevision = this.patchRevision
      this.compiledSourceRevision = this.sources.revision
    }

    // Offset and gain come from param nodes so they can be modulated like any other
    // param; the stored tap values are the fallback and the node's seed.
    for (const tap of this.compiled.taps) {
      const entry = this.patch.find((e) => e.id === tap.entryId)
      const offset = paramValues[tapOffsetNodeId(this.id, tap.entryId)]
      const gain = paramValues[tapGainNodeId(this.id, tap.entryId)]
      tap.offset = typeof offset === 'number' ? offset : (entry?.tap.offset ?? 0)
      tap.gain = typeof gain === 'number' ? gain : (entry?.gain ?? 1)
    }

    resolveTaps(this.compiled, brightness)
    executePatch(this.compiled, this.universes, dither)

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
    console.log('DMX Patch:', this.patch)
    console.log('DMX Universes:', this.universes.universeIds())
    console.log('DMX Writes per frame:', this.compiled?.writeCount ?? 0)
  }

  /** Writes full-on to universe 0 channels 1–20; the send tick picks it up like any other change. */
  testDMX() {
    console.log('[DMX] Sending test pattern to universe 0, channels 1-20')
    for (let channel = 1; channel <= 20; channel++) {
      this.universes.write(0, channel, 255)
    }
  }
}

/** Keeps the shipped profiles available without clobbering user edits to them. */
function mergeDefaultProfiles(profiles: FixtureProfile[]): FixtureProfile[] {
  const byId = new Map(profiles.map((p) => [p.id, p]))
  for (const preset of DEFAULT_PROFILES) {
    if (!byId.has(preset.id)) profiles = [...profiles, preset]
  }
  return profiles
}
