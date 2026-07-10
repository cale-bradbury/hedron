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
import {
  DmxLightingPlugin,
  FixtureColor,
  FixtureMapping,
  ChannelSlot,
  ChannelType,
} from './DmxLightingPlugin'

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

function parseAddresses(str: string): number[] {
  return str
    .split(',')
    .map((s) => parseInt(s.trim(), 10))
    .filter((n) => !isNaN(n) && n >= 1 && n <= 512)
}

// ─── Panel ────────────────────────────────────────────────────────────────────

export const DmxLightingGlobalPanel: React.FC<DmxLightingGlobalPanelProps> = ({ engine }) => {
  const plugin = engine.getPlugin<DmxLightingPlugin>(DmxLightingPlugin.ID)
  const store = plugin && engine ? engine.getStore() : null

  const [paramValues, setParamValues] = React.useState(store ? store.getState().paramValues : {})
  React.useEffect(() => {
    if (!store) return
    return store.subscribe(
      (state) => state.paramValues,
      (nv) => setParamValues(nv),
    )
  }, [store])

  const [, forceUpdate] = React.useReducer((x) => x + 1, 0)
  const [closedFixtures, setClosedFixtures] = React.useState<Set<string>>(new Set())
  const [addrInputs, setAddrInputs] = React.useState<Record<string, string>>({})
  const [addSlotSelections, setAddSlotSelections] = React.useState<Record<string, AddSlotEntry>>({})

  if (!plugin || !engine || !store) {
    return (
      <div style={{ color: 'red', padding: 16 }}>
        DMX Lighting plugin not initialized correctly.
      </div>
    )
  }

  // ── Mapping helpers ──────────────────────────────────────────────────────

  // Read mappings from the store (source of truth) so the panel reflects persisted
  // config even if the plugin's in-memory state gets out of sync.
  const getMappings = (id: string): FixtureMapping[] => {
    const stored = paramValues[`${plugin.id}-fixture-${id}-mappings`]
    if (stored) {
      try {
        return JSON.parse(stored as string) as FixtureMapping[]
      } catch (_) {
        /* corrupt value, fall through */
      }
    }
    return plugin.getColors()[id]?.mappings ?? []
  }

  const applyMappings = (id: string, mappings: FixtureMapping[]) => {
    plugin.setFixtureMappings(id, mappings)
    forceUpdate()
  }

  const patchMapping = (id: string, mIdx: number, patch: Partial<FixtureMapping>) => {
    const next = getMappings(id).map((m, i) => (i === mIdx ? { ...m, ...patch } : m))
    applyMappings(id, next)
  }

  const getAddrInput = (id: string, mIdx: number): string => {
    const key = `${id}-${mIdx}`
    return key in addrInputs
      ? addrInputs[key]
      : (getMappings(id)[mIdx]?.startAddresses.join(', ') ?? '')
  }

  const getAddSlot = (id: string, mIdx: number): AddSlotEntry =>
    addSlotSelections[`${id}-${mIdx}`] ?? DEFAULT_ADD_SLOT

  const setAddSlot = (id: string, mIdx: number, update: Partial<AddSlotEntry>) => {
    const key = `${id}-${mIdx}`
    setAddSlotSelections((prev) => ({
      ...prev,
      [key]: { ...(prev[key] ?? DEFAULT_ADD_SLOT), ...update },
    }))
  }

  // ── Render ───────────────────────────────────────────────────────────────

  const colors = plugin.getColors() as Record<string, FixtureColor>
  const devices = plugin.getDevices()

  return (
    <HedronErrorBoundary>
      <div>
        <ControlGrid>
          <NodeContainer nodeId={`${plugin.id}-global-protocol`} />
          <NodeContainer nodeId={`${plugin.id}-global-brightness`} />
          <NodeContainer nodeId={`${plugin.id}-global-lerpSpeed`} />
          <NodeContainer nodeId={`${plugin.id}-global-lerpMode`} />
        </ControlGrid>

        {/* ── Fixtures ──────────────────────────────────────────────────── */}
        <h3 style={s.sectionHeader}>Fixtures</h3>

        {Object.keys(colors).length === 0 && (
          <div style={{ color: '#555', fontSize: '0.85em', fontStyle: 'italic' }}>
            No active fixtures — run a sketch that calls setFixtureColor.
          </div>
        )}

        {Object.values(colors).map((color) => {
          const id = color.id
          const isOpen = !closedFixtures.has(id)
          const mappings = getMappings(id)

          return (
            <div key={id} style={s.fixtureWrap}>
              <Collapsible
                title={id}
                isOpen={isOpen}
                onToggle={() =>
                  setClosedFixtures((prev) => {
                    const next = new Set(prev)
                    if (next.has(id)) next.delete(id)
                    else next.add(id)
                    return next
                  })
                }
              >
                {/* Live channel values */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 10 }}>
                  {Object.entries(color.channels).map(([ch, val]) => (
                    <span
                      key={ch}
                      style={{
                        background: CHANNEL_COLORS[ch] ?? '#444',
                        color: '#fff',
                        fontSize: '0.75em',
                        padding: '2px 7px',
                        borderRadius: 3,
                        fontVariantNumeric: 'tabular-nums',
                      }}
                    >
                      {ch}: {Math.round((val as number) || 0)}
                    </span>
                  ))}
                </div>

                {/* Mappings list */}
                {mappings.map((mapping, mIdx) => (
                  <div key={mIdx} style={s.mappingWrap}>
                    {/* Mapping header */}
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        marginBottom: 10,
                      }}
                    >
                      <span
                        style={{
                          fontSize: '0.75em',
                          opacity: 0.5,
                          letterSpacing: '0.08em',
                          textTransform: 'uppercase',
                        }}
                      >
                        Mapping {mIdx + 1}
                      </span>
                      <Button
                        type="danger"
                        size="slim"
                        iconName="delete"
                        onClick={() => {
                          const next = mappings.filter((_, i) => i !== mIdx)
                          setAddrInputs((prev) => {
                            const copy = { ...prev }
                            delete copy[`${id}-${mIdx}`]
                            return copy
                          })
                          setAddSlotSelections((prev) => {
                            const copy = { ...prev }
                            delete copy[`${id}-${mIdx}`]
                            return copy
                          })
                          applyMappings(id, next)
                        }}
                      >
                        Remove
                      </Button>
                    </div>

                    {/* Start addresses */}
                    <div style={{ marginBottom: 10 }}>
                      <div style={s.fieldLabel}>Start Addresses</div>
                      <input
                        type="text"
                        value={getAddrInput(id, mIdx)}
                        placeholder="e.g. 1, 6, 11, 16"
                        onChange={(e) =>
                          setAddrInputs((prev) => ({
                            ...prev,
                            [`${id}-${mIdx}`]: e.target.value,
                          }))
                        }
                        onBlur={() => {
                          const addresses = parseAddresses(getAddrInput(id, mIdx))
                          patchMapping(id, mIdx, { startAddresses: addresses })
                          setAddrInputs((prev) => ({
                            ...prev,
                            [`${id}-${mIdx}`]: addresses.join(', '),
                          }))
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
                        }}
                        style={s.textInput}
                      />
                      <div style={{ fontSize: '0.72em', opacity: 0.4, marginTop: 3 }}>
                        Comma-separated (1–512). Each address receives the same channel bytes.
                      </div>
                    </div>

                    {/* Channel slots */}
                    <div style={{ marginBottom: 8 }}>
                      <div style={s.fieldLabel}>Channel Slots</div>
                      <ReorderableList
                        items={mapping.channels}
                        onMove={(from, to) => {
                          const channels = [...mapping.channels]
                          const [removed] = channels.splice(from, 1)
                          channels.splice(to, 0, removed)
                          patchMapping(id, mIdx, { channels })
                        }}
                        onRemove={(sIdx) => {
                          patchMapping(id, mIdx, {
                            channels: mapping.channels.filter((_, i) => i !== sIdx),
                          })
                        }}
                        renderItem={(slot, sIdx) => (
                          <SlotRow
                            slot={slot}
                            onUpdate={(newSlot) => {
                              const channels = mapping.channels.map((ch, i) =>
                                i === sIdx ? newSlot : ch,
                              )
                              patchMapping(id, mIdx, { channels })
                            }}
                          />
                        )}
                      />
                    </div>

                    {/* Add slot */}
                    <div style={s.addSlotRow}>
                      <select
                        value={getAddSlot(id, mIdx).slotType}
                        onChange={(e) => setAddSlot(id, mIdx, { slotType: e.target.value })}
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

                      {getAddSlot(id, mIdx).slotType === 'absolute' && (
                        <input
                          type="number"
                          min={0}
                          max={255}
                          value={getAddSlot(id, mIdx).absVal}
                          onChange={(e) => setAddSlot(id, mIdx, { absVal: e.target.value })}
                          placeholder="0–255"
                          style={{ ...s.numInput, width: 68 }}
                        />
                      )}

                      {CHANNEL_TYPES.includes(getAddSlot(id, mIdx).slotType as ChannelType) && (
                        <>
                          <span style={{ fontSize: '0.78em', opacity: 0.45 }}>× scale</span>
                          <input
                            type="number"
                            min={0}
                            step={0.01}
                            value={getAddSlot(id, mIdx).scale}
                            onChange={(e) => setAddSlot(id, mIdx, { scale: e.target.value })}
                            placeholder="optional"
                            style={{ ...s.numInput, width: 72 }}
                          />
                        </>
                      )}

                      <Button
                        type="primary"
                        size="slim"
                        iconName="add"
                        onClick={() => {
                          const entry = getAddSlot(id, mIdx)
                          const slot = buildSlotFromEntry(entry)
                          patchMapping(id, mIdx, {
                            channels: [...mapping.channels, slot],
                          })
                        }}
                      >
                        Add slot
                      </Button>
                    </div>
                  </div>
                ))}

                <Button
                  type="secondary"
                  size="slim"
                  iconName="add"
                  onClick={() =>
                    applyMappings(id, [...mappings, { startAddresses: [], channels: [] }])
                  }
                >
                  Add Mapping
                </Button>
              </Collapsible>
            </div>
          )
        })}

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
  row: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  } as React.CSSProperties,

  label: {
    width: 80,
    fontSize: '0.85em',
    flexShrink: 0,
    opacity: 0.8,
  } as React.CSSProperties,

  rangeVal: {
    minWidth: 36,
    textAlign: 'right' as const,
    fontSize: '0.85em',
    fontVariantNumeric: 'tabular-nums',
  } as React.CSSProperties,

  select: {
    flex: 1,
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
}
