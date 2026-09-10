import React from 'react'
import {
  HedronErrorBoundary,
  Button,
  Collapsible,
  ReorderableList,
  ControlGrid,
  NodeContainer,
} from '@hedron-gl/ui-core'
import { HedronEngine } from '@hedron-gl/engine'
import { DmxLightingPlugin, ChannelSlot, ChannelType } from './DmxLightingPlugin'
import { formatAddressList, parseAddressList } from './address'
import { PIXEL_STRIDE } from './PixelSource'
import {
  FixtureProfile,
  PatchEntry,
  findMode,
  findProfile,
  makeEntryId,
  modeChannelCount,
} from './profiles'

export interface DmxLightingGlobalPanelProps {
  engine: HedronEngine
}

// ─── Constants ────────────────────────────────────────────────────────────────

const CHANNEL_TYPES: ChannelType[] = ['red', 'green', 'blue', 'white', 'intensity']

const CHANNEL_COLORS: Record<string, string> = {
  red: '#9b2e2e',
  green: '#2e7a2e',
  blue: '#2e2e9b',
  white: '#707070',
  intensity: '#8a6e00',
}

/** Sentinel option that switches the source field to free text. */
const CUSTOM_SOURCE = '\u0000custom'

/** Swatches beyond this are elided; long strips stay readable without a huge DOM. */
const MAX_PREVIEW_SWATCHES = 96

// ─── Helpers ─────────────────────────────────────────────────────────────────

interface AddSlotEntry {
  slotType: string // ChannelType | 'null' | 'absolute'
  absVal: string
  scale: string
}
const DEFAULT_ADD_SLOT: AddSlotEntry = { slotType: 'red', absVal: '0', scale: '' }

function buildSlotFromEntry(entry: AddSlotEntry): ChannelSlot {
  if (entry.slotType === 'null') return null
  if (entry.slotType === 'absolute') {
    return { absolute: Math.min(255, Math.max(0, parseInt(entry.absVal, 10) || 0)) }
  }
  const field = entry.slotType as ChannelType
  const scale = parseFloat(entry.scale)
  if (!isNaN(scale) && entry.scale.trim() !== '') return { field, scale }
  return field
}

function entryPixelCount(entry: PatchEntry, fallback: number): number {
  return Math.max(0, Math.floor(entry.tap.count ?? fallback))
}

/** Every live source, plus the entry’s own so an unresolved name stays visible. */
function sourceOptions(sources: { id: string }[], current: string): string[] {
  const ids = sources.map((source) => source.id)
  return ids.includes(current) ? ids : [current, ...ids]
}

// ─── Panel ────────────────────────────────────────────────────────────────────

export const DmxLightingGlobalPanel: React.FC<DmxLightingGlobalPanelProps> = ({ engine }) => {
  const plugin = engine.getPlugin<DmxLightingPlugin>(DmxLightingPlugin.ID)

  const [, forceUpdate] = React.useReducer((x) => x + 1, 0)
  const [closedEntries, setClosedEntries] = React.useState<Set<string>>(new Set())
  const [addrInputs, setAddrInputs] = React.useState<Record<string, string>>({})
  const [addSlotSelections, setAddSlotSelections] = React.useState<Record<string, AddSlotEntry>>({})
  const [customSources, setCustomSources] = React.useState<Set<string>>(new Set())

  const setCustomSource = (entryId: string, custom: boolean) =>
    setCustomSources((prev) => {
      const next = new Set(prev)
      if (custom) next.add(entryId)
      else next.delete(entryId)
      return next
    })

  // The patch is edited through the plugin rather than the store, so poll for changes
  // the sketch API makes (auto-patching a new fixture, for instance).
  React.useEffect(() => {
    const timer = setInterval(forceUpdate, 500)
    return () => clearInterval(timer)
  }, [])

  if (!plugin || !engine) {
    return (
      <div style={{ color: 'red', padding: 16 }}>
        DMX Lighting plugin not initialized correctly.
      </div>
    )
  }

  const profiles = plugin.getProfiles()
  const patch = plugin.getPatch()
  const sources = plugin.getSources()
  const devices = plugin.getDevices()
  const conflicts = plugin.getAddressConflicts()

  const updateEntry = (id: string, changes: Partial<PatchEntry>) => {
    plugin.setPatch(patch.map((e) => (e.id === id ? { ...e, ...changes } : e)))
    forceUpdate()
  }

  const updateProfile = (profileId: string, next: FixtureProfile) => {
    plugin.setProfiles(profiles.map((p) => (p.id === profileId ? next : p)))
    forceUpdate()
  }

  const getAddSlot = (key: string): AddSlotEntry => addSlotSelections[key] ?? DEFAULT_ADD_SLOT

  const setAddSlot = (key: string, update: Partial<AddSlotEntry>) => {
    setAddSlotSelections((prev) => ({
      ...prev,
      [key]: { ...(prev[key] ?? DEFAULT_ADD_SLOT), ...update },
    }))
  }

  const renderSlotEditor = (
    key: string,
    label: string,
    slots: ChannelSlot[],
    onChange: (slots: ChannelSlot[]) => void,
  ) => (
    <div style={{ marginBottom: 8 }}>
      <div style={s.fieldLabel}>{label}</div>
      <ReorderableList
        items={slots}
        onMove={(from: number, to: number) => {
          const next = [...slots]
          const [removed] = next.splice(from, 1)
          next.splice(to, 0, removed)
          onChange(next)
        }}
        onRemove={(index: number) => onChange(slots.filter((_, i) => i !== index))}
        renderItem={(slot: ChannelSlot, index: number) => (
          <SlotRow
            slot={slot}
            onUpdate={(newSlot) => onChange(slots.map((c, i) => (i === index ? newSlot : c)))}
          />
        )}
      />
      <div style={s.addSlotRow}>
        <select
          value={getAddSlot(key).slotType}
          onChange={(e) => setAddSlot(key, { slotType: e.target.value })}
          style={{ ...s.select, flex: '0 0 auto' }}
        >
          {CHANNEL_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
          <option value="absolute">absolute</option>
          <option value="null">null (pad)</option>
        </select>

        {getAddSlot(key).slotType === 'absolute' && (
          <input
            type="number"
            min={0}
            max={255}
            value={getAddSlot(key).absVal}
            onChange={(e) => setAddSlot(key, { absVal: e.target.value })}
            placeholder="0–255"
            style={{ ...s.numInput, width: 68 }}
          />
        )}

        {CHANNEL_TYPES.includes(getAddSlot(key).slotType as ChannelType) && (
          <>
            <span style={{ fontSize: '0.78em', opacity: 0.45 }}>× scale</span>
            <input
              type="number"
              min={0}
              step={0.01}
              value={getAddSlot(key).scale}
              onChange={(e) => setAddSlot(key, { scale: e.target.value })}
              placeholder="optional"
              style={{ ...s.numInput, width: 72 }}
            />
          </>
        )}

        <Button
          type="primary"
          size="slim"
          iconName="add"
          onClick={() => onChange([...slots, buildSlotFromEntry(getAddSlot(key))])}
        >
          Add slot
        </Button>
      </div>
    </div>
  )

  return (
    <HedronErrorBoundary>
      <div>
        <ControlGrid>
          <NodeContainer nodeId={`${plugin.id}-global-protocol`} />
          <NodeContainer nodeId={`${plugin.id}-global-brightness`} />
          <NodeContainer nodeId={`${plugin.id}-global-lerpSpeed`} />
          <NodeContainer nodeId={`${plugin.id}-global-lerpMode`} />
          <NodeContainer nodeId={`${plugin.id}-global-dither`} />
        </ControlGrid>

        {/* ── Sources ───────────────────────────────────────────────────── */}
        <h3 style={s.sectionHeader}>Sources</h3>

        {sources.length === 0 && (
          <div style={s.emptyNote}>
            No sources — run a sketch that calls hedron.lighting.source() or setFixtureColor().
          </div>
        )}

        {sources.map((source) => (
          <SourcePreview key={source.id} plugin={plugin} sourceId={source.id} />
        ))}

        {/* ── Patch ─────────────────────────────────────────────────────── */}
        <h3 style={s.sectionHeader}>Patch</h3>

        {conflicts.length > 0 && (
          <div style={s.warning}>
            {conflicts.length} address{conflicts.length === 1 ? '' : 'es'} written by more than one
            entry, first at {conflicts[0].universe}:{conflicts[0].channel}
          </div>
        )}

        {patch.length === 0 && <div style={s.emptyNote}>No patch entries yet.</div>}

        {patch.map((entry) => {
          const profile = findProfile(profiles, entry.profileId)
          const mode = profile ? findMode(profile, entry.modeName) : undefined
          const isOpen = !closedEntries.has(entry.id)
          const pixels = entryPixelCount(entry, mode?.pixelCount ?? 1)
          const span = mode ? modeChannelCount(mode, pixels) : 0
          const first = entry.addresses[0]

          return (
            <div key={entry.id} style={s.fixtureWrap}>
              <Collapsible
                title={`${entry.name || entry.id} — ${formatAddressList(entry.addresses) || 'unpatched'}${
                  span ? ` (${span}ch)` : ''
                }`}
                isOpen={isOpen}
                onToggle={() =>
                  setClosedEntries((prev) => {
                    const next = new Set(prev)
                    if (next.has(entry.id)) next.delete(entry.id)
                    else next.add(entry.id)
                    return next
                  })
                }
              >
                <div style={s.mappingWrap}>
                  <div style={s.grid2}>
                    <div>
                      <div style={s.fieldLabel}>Name</div>
                      <input
                        type="text"
                        value={entry.name ?? ''}
                        onChange={(e) => updateEntry(entry.id, { name: e.target.value })}
                        style={s.textInput}
                      />
                    </div>
                    <div>
                      <div style={s.fieldLabel}>Source</div>
                      {customSources.has(entry.id) ? (
                        <input
                          type="text"
                          autoFocus
                          value={entry.tap.source}
                          placeholder="source name"
                          onChange={(e) =>
                            updateEntry(entry.id, { tap: { ...entry.tap, source: e.target.value } })
                          }
                          onBlur={() => setCustomSource(entry.id, false)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
                          }}
                          style={s.textInput}
                        />
                      ) : (
                        <select
                          value={entry.tap.source}
                          onChange={(e) => {
                            if (e.target.value === CUSTOM_SOURCE) {
                              setCustomSource(entry.id, true)
                              return
                            }
                            updateEntry(entry.id, {
                              tap: { ...entry.tap, source: e.target.value },
                            })
                          }}
                          style={s.select}
                        >
                          {/* The entry's own source is listed even if no sketch has created it yet. */}
                          {sourceOptions(sources, entry.tap.source).map((id) => (
                            <option key={id} value={id}>
                              {id || '(none)'}
                            </option>
                          ))}
                          <option value={CUSTOM_SOURCE}>Type a name…</option>
                        </select>
                      )}
                    </div>
                  </div>

                  <div style={{ marginTop: 10 }}>
                    <div style={s.fieldLabel}>Addresses</div>
                    <input
                      type="text"
                      value={
                        addrInputs[entry.id] !== undefined
                          ? addrInputs[entry.id]
                          : formatAddressList(entry.addresses)
                      }
                      placeholder="e.g. 1, 6, 2:14"
                      onChange={(e) =>
                        setAddrInputs((prev) => ({ ...prev, [entry.id]: e.target.value }))
                      }
                      onBlur={() => {
                        const addresses = parseAddressList(
                          addrInputs[entry.id] ?? formatAddressList(entry.addresses),
                        )
                        updateEntry(entry.id, { addresses })
                        setAddrInputs((prev) => {
                          const copy = { ...prev }
                          delete copy[entry.id]
                          return copy
                        })
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
                      }}
                      style={s.textInput}
                    />
                    <div style={s.hint}>
                      Comma-separated (1–512), optionally universe:channel. Each address receives
                      the same bytes.
                      {first && span > 0 && (
                        <>
                          {' '}
                          First instance covers {first.universe}:{first.channel}–
                          {first.channel + span - 1}.
                        </>
                      )}
                    </div>
                  </div>

                  <div style={{ ...s.grid3, marginTop: 10 }}>
                    <div>
                      <div style={s.fieldLabel}>Profile</div>
                      <select
                        value={entry.profileId}
                        onChange={(e) => {
                          const next = findProfile(profiles, e.target.value)
                          updateEntry(entry.id, {
                            profileId: e.target.value,
                            modeName: next?.modes[0]?.name ?? 'default',
                          })
                        }}
                        style={s.select}
                      >
                        {profiles.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <div style={s.fieldLabel}>Pixels</div>
                      <input
                        type="number"
                        min={0}
                        max={512}
                        value={pixels}
                        onChange={(e) =>
                          updateEntry(entry.id, {
                            tap: { ...entry.tap, count: parseInt(e.target.value, 10) || 0 },
                          })
                        }
                        style={{ ...s.numInput, width: '100%', boxSizing: 'border-box' }}
                      />
                    </div>
                    <div>
                      <div style={s.fieldLabel}>Source Offset</div>
                      <input
                        type="number"
                        min={0}
                        value={entry.tap.offset ?? 0}
                        onChange={(e) =>
                          updateEntry(entry.id, {
                            tap: { ...entry.tap, offset: parseInt(e.target.value, 10) || 0 },
                          })
                        }
                        style={{ ...s.numInput, width: '100%', boxSizing: 'border-box' }}
                      />
                    </div>
                  </div>

                  {profile && profile.modes.length > 1 && (
                    <div style={{ marginTop: 10 }}>
                      <div style={s.fieldLabel}>Mode</div>
                      <select
                        value={entry.modeName}
                        onChange={(e) => updateEntry(entry.id, { modeName: e.target.value })}
                        style={s.select}
                      >
                        {profile.modes.map((m) => (
                          <option key={m.name} value={m.name}>
                            {m.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  {profile && mode && (
                    <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid #222' }}>
                      <div style={s.profileNote}>
                        Editing profile <strong>{profile.name}</strong> — shared by every entry
                        using it.
                        <Button
                          type="neutral"
                          size="slim"
                          onClick={() => {
                            const copy: FixtureProfile = {
                              ...profile,
                              id: `${profile.id}-copy-${Math.random().toString(36).slice(2, 6)}`,
                              name: `${profile.name} copy`,
                              modes: profile.modes.map((m) => ({ ...m })),
                            }
                            plugin.setProfiles([...profiles, copy])
                            updateEntry(entry.id, { profileId: copy.id })
                          }}
                        >
                          Duplicate
                        </Button>
                      </div>

                      {renderSlotEditor(
                        `${entry.id}-pixel`,
                        'Pixel Channels (repeated per pixel)',
                        mode.pixel,
                        (slots) =>
                          updateProfile(profile.id, {
                            ...profile,
                            modes: profile.modes.map((m) =>
                              m.name === mode.name ? { ...m, pixel: slots } : m,
                            ),
                          }),
                      )}

                      {renderSlotEditor(
                        `${entry.id}-header`,
                        'Header Channels (once, before the pixels)',
                        mode.header ?? [],
                        (slots) =>
                          updateProfile(profile.id, {
                            ...profile,
                            modes: profile.modes.map((m) =>
                              m.name === mode.name ? { ...m, header: slots } : m,
                            ),
                          }),
                      )}
                    </div>
                  )}

                  <div style={{ marginTop: 10 }}>
                    <Button
                      type="danger"
                      size="slim"
                      iconName="delete"
                      onClick={() => {
                        plugin.setPatch(patch.filter((e) => e.id !== entry.id))
                        forceUpdate()
                      }}
                    >
                      Remove Entry
                    </Button>
                  </div>
                </div>
              </Collapsible>
            </div>
          )
        })}

        <Button
          type="secondary"
          size="slim"
          iconName="add"
          onClick={() => {
            const profile = profiles[0]
            plugin.setPatch([
              ...patch,
              {
                id: makeEntryId(),
                name: `Fixture ${patch.length + 1}`,
                profileId: profile?.id ?? 'par-rgbwi',
                modeName: profile?.modes[0]?.name ?? '5ch RGBWI',
                addresses: [],
                tap: { source: sources[0]?.id ?? '' },
              },
            ])
            forceUpdate()
          }}
        >
          Add Patch Entry
        </Button>

        {/* ── Devices ───────────────────────────────────────────────────── */}
        <h3 style={s.sectionHeader}>DMX Devices</h3>
        <Button
          type="neutral"
          size="slim"
          onClick={() => plugin.fetchDeviceInfo().then(() => forceUpdate())}
        >
          Refresh Devices
        </Button>
        <div style={{ fontSize: '0.85em', marginTop: 8 }}>
          {devices.map((device, idx) => (
            <div
              key={idx}
              style={{ marginBottom: 10, padding: 8, background: '#1a1a1a', borderRadius: 4 }}
            >
              <div>
                <strong>{device.name}</strong>
              </div>
              {device.path && <div style={{ opacity: 0.6 }}>Path: {device.path}</div>}
              {device.driver && <div style={{ opacity: 0.6 }}>Driver: {device.driver}</div>}
              <div>Status: {device.status}</div>
              {device.lastSent && <div style={{ opacity: 0.6 }}>Last Sent: {device.lastSent}</div>}
              {device.lastData && (
                <details>
                  <summary>DMX Data</summary>
                  <pre style={{ fontSize: '0.8em', overflow: 'auto', maxHeight: 160 }}>
                    {device.lastData}
                  </pre>
                </details>
              )}
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          <Button type="neutral" size="slim" onClick={() => plugin.logDeviceInfo()}>
            Log Device Info
          </Button>
          <Button type="neutral" size="slim" onClick={() => plugin.testDMX()}>
            Test DMX (Full White)
          </Button>
        </div>
      </div>
    </HedronErrorBoundary>
  )
}

// ─── SourcePreview ────────────────────────────────────────────────────────────

interface SourcePreviewProps {
  plugin: DmxLightingPlugin
  sourceId: string
}

/** Owns its own refresh so live swatches don't re-render the whole panel. */
function SourcePreview({ plugin, sourceId }: SourcePreviewProps) {
  const [, tick] = React.useReducer((x) => x + 1, 0)

  React.useEffect(() => {
    const timer = setInterval(tick, 100)
    return () => clearInterval(timer)
  }, [])

  const source = plugin.getSources().find((s) => s.id === sourceId)
  if (!source) return null

  const shown = Math.min(source.pixelCount, MAX_PREVIEW_SWATCHES)
  const swatches: React.ReactNode[] = []
  for (let i = 0; i < shown; i++) {
    const o = i * PIXEL_STRIDE
    const r = Math.round(source.current[o])
    const g = Math.round(source.current[o + 1])
    const b = Math.round(source.current[o + 2])
    const w = Math.round(source.current[o + 3])
    swatches.push(
      <div
        key={i}
        title={`${i}: r${r} g${g} b${b} w${w} i${Math.round(source.current[o + 4])}`}
        style={{
          flex: '1 1 6px',
          minWidth: 4,
          height: 18,
          background: `rgb(${Math.min(255, r + w)}, ${Math.min(255, g + w)}, ${Math.min(255, b + w)})`,
        }}
      />,
    )
  }

  return (
    <div style={{ marginBottom: 10 }}>
      <div style={s.sourceHeader}>
        <span>{source.id}</span>
        <span style={{ opacity: 0.5 }}>
          {source.pixelCount}px{shown < source.pixelCount ? ` (first ${shown} shown)` : ''}
        </span>
      </div>
      <div style={{ display: 'flex', gap: 1, background: '#000', padding: 1, borderRadius: 3 }}>
        {swatches}
      </div>
    </div>
  )
}

// ─── SlotRow ──────────────────────────────────────────────────────────────────

interface SlotRowProps {
  slot: ChannelSlot
  onUpdate: (slot: ChannelSlot) => void
}

function SlotRow({ slot, onUpdate }: SlotRowProps) {
  if (slot === null) {
    return <span style={{ fontSize: '0.8em', fontStyle: 'italic', opacity: 0.5 }}>null (pad)</span>
  }

  if (typeof slot === 'string') {
    return (
      <>
        <span style={{ ...s.chip, background: CHANNEL_COLORS[slot] ?? '#444' }}>{slot}</span>
        <span style={s.dimLabel}>× scale</span>
        <input
          key={`str-${slot}`}
          type="number"
          placeholder="none"
          defaultValue=""
          min={0}
          step={0.01}
          onBlur={(e) => {
            const v = parseFloat(e.target.value)
            if (!isNaN(v) && e.target.value.trim() !== '') onUpdate({ field: slot, scale: v })
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
          }}
          style={{ ...s.numInput, width: 56 }}
        />
      </>
    )
  }

  if ('absolute' in slot) {
    return (
      <>
        <span style={{ ...s.chip, background: '#5a5020' }}>absolute</span>
        <input
          key={`abs-${slot.absolute}`}
          type="number"
          defaultValue={slot.absolute}
          min={0}
          max={255}
          onBlur={(e) => {
            const v = parseInt(e.target.value, 10)
            if (!isNaN(v)) onUpdate({ absolute: Math.min(255, Math.max(0, v)) })
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
          }}
          style={{ ...s.numInput, width: 64 }}
        />
      </>
    )
  }

  // { field, scale? }
  return (
    <>
      <span style={{ ...s.chip, background: CHANNEL_COLORS[slot.field] ?? '#444' }}>
        {slot.field}
      </span>
      <span style={s.dimLabel}>× scale</span>
      <input
        key={`field-${slot.field}-${slot.scale}`}
        type="number"
        defaultValue={slot.scale ?? 1}
        min={0}
        step={0.01}
        onBlur={(e) => {
          if (e.target.value.trim() === '') {
            onUpdate(slot.field)
            return
          }
          const v = parseFloat(e.target.value)
          if (!isNaN(v)) onUpdate(v === 1 ? slot.field : { field: slot.field, scale: v })
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
        }}
        style={{ ...s.numInput, width: 56 }}
      />
    </>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = {
  select: {
    width: '100%',
    boxSizing: 'border-box' as const,
    background: 'var(--bgColorDark4, #111)',
    color: 'inherit',
    border: '1px solid #333',
    borderRadius: 3,
    padding: '3px 6px',
    fontSize: '0.85em',
  } as React.CSSProperties,

  textInput: {
    width: '100%',
    boxSizing: 'border-box' as const,
    background: 'var(--bgColorDark4, #111)',
    color: 'inherit',
    border: '1px solid #333',
    borderRadius: 3,
    padding: '5px 8px',
    fontSize: '0.85em',
    fontFamily: 'monospace',
  } as React.CSSProperties,

  numInput: {
    background: 'var(--bgColorDark4, #111)',
    color: 'inherit',
    border: '1px solid #333',
    borderRadius: 3,
    padding: '2px 4px',
    fontSize: '0.82em',
  } as React.CSSProperties,

  sectionHeader: {
    margin: '18px 0 8px',
    fontSize: '0.8em',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.1em',
    opacity: 0.6,
  } as React.CSSProperties,

  sourceHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: '0.75em',
    opacity: 0.75,
    marginBottom: 3,
    fontFamily: 'monospace',
  } as React.CSSProperties,

  fixtureWrap: {
    borderLeft: '2px solid #333',
    paddingLeft: 10,
    marginBottom: 12,
  } as React.CSSProperties,

  mappingWrap: {
    border: '1px solid #2a2a2a',
    borderRadius: 5,
    padding: '10px 10px 8px',
    marginBottom: 8,
    background: 'rgba(0,0,0,0.25)',
  } as React.CSSProperties,

  fieldLabel: {
    fontSize: '0.72em',
    opacity: 0.5,
    letterSpacing: '0.07em',
    textTransform: 'uppercase' as const,
    marginBottom: 5,
  } as React.CSSProperties,

  addSlotRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    paddingTop: 8,
    borderTop: '1px solid #222',
    flexWrap: 'wrap' as const,
  } as React.CSSProperties,

  chip: {
    fontSize: '0.75em',
    padding: '2px 7px',
    borderRadius: 3,
    color: '#fff',
    fontWeight: 600,
    flexShrink: 0,
  } as React.CSSProperties,

  dimLabel: {
    fontSize: '0.78em',
    opacity: 0.4,
    flexShrink: 0,
  } as React.CSSProperties,

  grid2: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: 8,
  } as React.CSSProperties,

  grid3: {
    display: 'grid',
    gridTemplateColumns: '2fr 1fr 1fr',
    gap: 8,
  } as React.CSSProperties,

  hint: {
    fontSize: '0.72em',
    opacity: 0.4,
    marginTop: 3,
  } as React.CSSProperties,

  emptyNote: {
    color: '#555',
    fontSize: '0.85em',
    fontStyle: 'italic',
  } as React.CSSProperties,

  warning: {
    fontSize: '0.78em',
    color: '#d8a13a',
    background: 'rgba(216,161,58,0.08)',
    border: '1px solid rgba(216,161,58,0.3)',
    borderRadius: 4,
    padding: '5px 8px',
    marginBottom: 8,
  } as React.CSSProperties,

  profileNote: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    fontSize: '0.75em',
    opacity: 0.6,
    marginBottom: 8,
  } as React.CSSProperties,
}
