import React from 'react'
import { Button, ControlGrid, NodeContainer } from '@hedron-gl/ui-core'
import { s } from './styles'
import { formatAddressList, parseAddressList } from '@/address'
import {
  FixtureProfile,
  PatchEntry,
  TapArrangement,
  TapFilter,
  TapFit,
  findMode,
  findProfile,
  tapGainNodeId,
  tapOffsetNodeId,
} from '@/profiles'
import { entryChannelSpan, findNextFreeAddress } from '@/patchTools'

/** Sentinel option that switches the source field to free text. */
const CUSTOM_SOURCE = '__type_a_name__'

export interface PatchEntryEditorProps {
  pluginId: string
  entry: PatchEntry
  patch: PatchEntry[]
  profiles: FixtureProfile[]
  sourceIds: string[]
  onChange: (changes: Partial<PatchEntry>) => void
  onRemove: () => void
}

/** Everything about one patched fixture: where it lives and what it reads. */
export function PatchEntryEditor({
  pluginId,
  entry,
  patch,
  profiles,
  sourceIds,
  onChange,
  onRemove,
}: PatchEntryEditorProps) {
  const [addrInput, setAddrInput] = React.useState<string | null>(null)
  const [customSource, setCustomSource] = React.useState(false)

  const profile = findProfile(profiles, entry.profileId)
  const mode = profile ? findMode(profile, entry.modeName) : undefined
  const pixels = Math.max(0, Math.floor(entry.tap.count ?? mode?.pixelCount ?? 1))
  const span = entryChannelSpan(entry, profiles)
  const first = entry.addresses[0]

  const options = sourceIds.includes(entry.tap.source)
    ? sourceIds
    : [entry.tap.source, ...sourceIds]

  const autoAddress = () => {
    const universe = first?.universe ?? 0
    const channel = findNextFreeAddress(patch, profiles, universe, span, entry.id)
    if (channel === null) return
    onChange({ addresses: [{ universe, channel }] })
    setAddrInput(null)
  }

  return (
    <div style={s.mappingWrap}>
      <div style={s.grid2}>
        <div>
          <div style={s.fieldLabel}>Name</div>
          <input
            type="text"
            value={entry.name ?? ''}
            onChange={(e) => onChange({ name: e.target.value })}
            style={s.textInput}
          />
        </div>
        <div>
          <div style={s.fieldLabel}>Source</div>
          {customSource ? (
            <input
              type="text"
              autoFocus
              value={entry.tap.source}
              placeholder="source name"
              onChange={(e) => onChange({ tap: { ...entry.tap, source: e.target.value } })}
              onBlur={() => setCustomSource(false)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
              }}
              style={s.textInput}
            />
          ) : (
            <select
              value={entry.tap.source}
              onChange={(e) => {
                if (e.target.value === CUSTOM_SOURCE) setCustomSource(true)
                else onChange({ tap: { ...entry.tap, source: e.target.value } })
              }}
              style={s.select}
            >
              {options.map((id) => (
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
        <div style={{ display: 'flex', gap: 6 }}>
          <input
            type="text"
            value={addrInput ?? formatAddressList(entry.addresses)}
            placeholder="e.g. 1, 6, 2:14"
            onChange={(e) => setAddrInput(e.target.value)}
            onBlur={() => {
              const addresses = parseAddressList(addrInput ?? formatAddressList(entry.addresses))
              onChange({ addresses })
              setAddrInput(null)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
            }}
            style={s.textInput}
          />
          <Button type="neutral" size="slim" onClick={autoAddress}>
            Auto
          </Button>
        </div>
        <div style={s.hint}>
          Comma-separated (1–512), optionally universe:channel. Each address receives the same
          bytes.
          {first && span > 0 && (
            <>
              {' '}
              First instance covers {first.universe}:{first.channel}–{first.channel + span - 1}.
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
              onChange({
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
              onChange({ tap: { ...entry.tap, count: parseInt(e.target.value, 10) || 0 } })
            }
            style={{ ...s.numInput, width: '100%', boxSizing: 'border-box' }}
          />
        </div>
        <div>
          <div style={s.fieldLabel}>Step</div>
          <input
            type="number"
            min={0}
            step={0.1}
            value={entry.tap.step ?? 1}
            onChange={(e) =>
              onChange({ tap: { ...entry.tap, step: parseFloat(e.target.value) || 0 } })
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
            onChange={(e) => onChange({ modeName: e.target.value })}
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

      <div style={{ ...s.grid3, marginTop: 10 }}>
        <div>
          <div style={s.fieldLabel}>Fit</div>
          <select
            value={entry.tap.fit ?? 'clip'}
            onChange={(e) => onChange({ tap: { ...entry.tap, fit: e.target.value as TapFit } })}
            style={s.select}
          >
            <option value="clip">clip (step through)</option>
            <option value="stretch">stretch (fit source)</option>
          </select>
        </div>
        <div>
          <div style={s.fieldLabel}>Filter</div>
          <select
            value={entry.tap.filter ?? 'nearest'}
            onChange={(e) =>
              onChange({ tap: { ...entry.tap, filter: e.target.value as TapFilter } })
            }
            style={s.select}
          >
            <option value="nearest">nearest</option>
            <option value="linear">linear</option>
            <option value="average">average</option>
          </select>
        </div>
        <div>
          <div style={s.fieldLabel}>Wrap</div>
          <label style={s.checkboxRow}>
            <input
              type="checkbox"
              checked={entry.tap.wrap === true}
              onChange={(e) => onChange({ tap: { ...entry.tap, wrap: e.target.checked } })}
            />
            <span>wrap around</span>
          </label>
        </div>
      </div>

      <div style={{ ...s.grid2, marginTop: 10 }}>
        <div>
          <div style={s.fieldLabel}>Arrangement</div>
          <select
            value={entry.tap.arrangement ?? 'forward'}
            onChange={(e) =>
              onChange({ tap: { ...entry.tap, arrangement: e.target.value as TapArrangement } })
            }
            style={s.select}
          >
            <option value="forward">forward</option>
            <option value="reverse">reverse</option>
            <option value="serpentine">serpentine</option>
          </select>
        </div>
        {entry.tap.arrangement === 'serpentine' && (
          <div>
            <div style={s.fieldLabel}>Segment Size</div>
            <input
              type="number"
              min={1}
              value={entry.tap.segmentSize ?? pixels}
              onChange={(e) =>
                onChange({
                  tap: {
                    ...entry.tap,
                    segmentSize: Math.max(1, parseInt(e.target.value, 10) || 1),
                  },
                })
              }
              style={{ ...s.numInput, width: '100%', boxSizing: 'border-box' }}
            />
          </div>
        )}
      </div>

      {/* Offset and gain are param nodes, so they can be modulated like any other. */}
      <div style={{ marginTop: 10 }}>
        <ControlGrid>
          <NodeContainer nodeId={tapOffsetNodeId(pluginId, entry.id)} />
          <NodeContainer nodeId={tapGainNodeId(pluginId, entry.id)} />
        </ControlGrid>
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
        <Button type="danger" size="slim" iconName="delete" onClick={onRemove}>
          Remove Entry
        </Button>
      </div>
    </div>
  )
}
