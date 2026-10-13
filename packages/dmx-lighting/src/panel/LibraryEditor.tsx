import React from 'react'
import { Button, Collapsible } from '@hedron-gl/ui-core'
import { EncoderEditor } from './EncoderEditor'
import { downloadJson } from './download'
import { s } from './styles'
import { encoderFields } from '@/encoders'
import { WELL_KNOWN_FIELDS } from '@/fields'
import {
  channelLabel,
  FixtureChannel,
  FixtureMode,
  FixtureShape,
  FixtureType,
  makeId,
  modeHasHeads,
  modeHeadCount,
  repeatHeads,
} from '@/fixtures'
import { isShippedType, normalizeTypes } from '@/library'
import { parseQlcXml, qlcToFixtureType } from '@/qlcImport'

const SHAPES: FixtureShape[] = ['par', 'bar', 'strip', 'matrix', 'mover', 'generic']
const FIELD_LIST_ID = 'dmx-well-known-fields'

export interface LibraryEditorProps {
  library: FixtureType[]
  /** Type ids hung in the rig; those cannot be deleted. */
  inUse: Set<string>
  onChange: (library: FixtureType[]) => void
  /** Lets the rig follow a renamed mode instead of falling back to the first one. */
  onRenameMode: (typeId: string, from: string, to: string) => void
}

/** The kinds of light you own, shared by every project on this machine. */
export function LibraryEditor({ library, inUse, onChange, onRenameMode }: LibraryEditorProps) {
  const [openId, setOpenId] = React.useState<string | null>(null)
  const [message, setMessage] = React.useState<string | null>(null)
  const libraryFileRef = React.useRef<HTMLInputElement>(null)

  const replace = (id: string, next: FixtureType) =>
    onChange(library.map((t) => (t.id === id ? next : t)))

  const addType = () => {
    const type: FixtureType = {
      id: makeId('type'),
      name: `New fixture ${library.length + 1}`,
      shape: 'par',
      modes: [{ name: '3ch', channels: ['red', 'green', 'blue'].map((field) => ({ field })) }],
    }
    onChange([...library, type])
    setOpenId(type.id)
  }

  return (
    <div>
      <datalist id={FIELD_LIST_ID}>
        {WELL_KNOWN_FIELDS.map((field) => (
          <option key={field} value={field} />
        ))}
      </datalist>

      {library.map((type) => {
        const isOpen = openId === type.id
        const used = inUse.has(type.id)
        const title = [type.manufacturer, type.name].filter(Boolean).join(' ')

        return (
          <div key={type.id} style={s.fixtureWrap}>
            <Collapsible
              title={`${title} — ${type.modes.map((m) => m.name).join(', ')}${used ? ' · in use' : ''}`}
              isOpen={isOpen}
              onToggle={() => setOpenId(isOpen ? null : type.id)}
            >
              <TypeEditor
                type={type}
                used={used}
                onChange={(next) => replace(type.id, next)}
                onRenameMode={(from, to) => onRenameMode(type.id, from, to)}
                onDuplicate={() => {
                  const copy = duplicate(type)
                  onChange([...library, copy])
                  setOpenId(copy.id)
                }}
                onDelete={() => onChange(library.filter((t) => t.id !== type.id))}
              />
            </Collapsible>
          </div>
        )
      })}

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 6 }}>
        <Button type="secondary" size="slim" iconName="add" onClick={addType}>
          New Fixture Type
        </Button>
        <Button
          type="neutral"
          size="slim"
          onClick={() => downloadJson(library, 'fixture-library.json')}
        >
          Export Library
        </Button>
        <Button type="neutral" size="slim" onClick={() => libraryFileRef.current?.click()}>
          Import Library
        </Button>
        <input
          ref={libraryFileRef}
          type="file"
          accept=".json,application/json"
          style={{ display: 'none' }}
          onChange={async (e) => {
            const file = e.target.files?.[0]
            if (!file) return
            e.target.value = ''
            let types: FixtureType[] = []
            try {
              types = normalizeTypes(JSON.parse(await file.text()))
            } catch (_) {
              types = []
            }
            if (types.length === 0) {
              setMessage(`No fixture types found in ${file.name}`)
              return
            }
            // Imported types replace ones with the same id, so a library can be synced between machines.
            const ids = new Set(types.map((t) => t.id))
            onChange([...library.filter((t) => !ids.has(t.id)), ...types])
            setMessage(`Imported ${types.length} fixture type(s) from ${file.name}`)
          }}
        />
      </div>
      {message && <div style={s.hint}>{message}</div>}

      <QlcImport
        onImport={(type) => {
          onChange([...library, type])
          setOpenId(type.id)
        }}
      />
      <div style={s.hint}>
        The library is saved on this machine, not in the project, so it is there for every show.
        Projects and rig files carry copies of the types they use.
      </div>
    </div>
  )
}

interface TypeEditorProps {
  type: FixtureType
  used: boolean
  onChange: (type: FixtureType) => void
  onRenameMode: (from: string, to: string) => void
  onDuplicate: () => void
  onDelete: () => void
}

function TypeEditor({
  type,
  used,
  onChange,
  onRenameMode,
  onDuplicate,
  onDelete,
}: TypeEditorProps) {
  const shipped = isShippedType(type.id)

  const updateMode = (modeName: string, changes: Partial<FixtureMode>) =>
    onChange({
      ...type,
      modes: type.modes.map((m) => (m.name === modeName ? { ...m, ...changes } : m)),
    })

  return (
    <div style={s.mappingWrap}>
      <div style={s.grid2}>
        <div>
          <div style={s.fieldLabel}>Name</div>
          <input
            type="text"
            value={type.name}
            onChange={(e) => onChange({ ...type, name: e.target.value })}
            style={s.textInput}
          />
        </div>
        <div>
          <div style={s.fieldLabel}>Manufacturer</div>
          <input
            type="text"
            value={type.manufacturer ?? ''}
            onChange={(e) => onChange({ ...type, manufacturer: e.target.value || undefined })}
            style={s.textInput}
          />
        </div>
      </div>

      <div style={{ ...s.grid2, marginTop: 8 }}>
        <div>
          <div style={s.fieldLabel}>Shape</div>
          <select
            value={type.shape}
            onChange={(e) => onChange({ ...type, shape: e.target.value as FixtureShape })}
            style={s.select}
          >
            {SHAPES.map((shape) => (
              <option key={shape} value={shape}>
                {shape}
              </option>
            ))}
          </select>
        </div>
        <div>
          <div style={s.fieldLabel}>Head name</div>
          <input
            type="text"
            value={type.headName ?? ''}
            placeholder="Head"
            onChange={(e) => onChange({ ...type, headName: e.target.value || undefined })}
            style={s.textInput}
          />
        </div>
      </div>

      <div style={{ marginTop: 8 }}>
        <div style={s.fieldLabel}>Description</div>
        <textarea
          rows={2}
          value={type.description ?? ''}
          placeholder="Notes, DIP switches, quirks…"
          onChange={(e) => onChange({ ...type, description: e.target.value || undefined })}
          style={s.textArea}
        />
      </div>

      {type.modes.map((mode) => (
        <ModeEditor
          key={mode.name}
          type={type}
          mode={mode}
          canRemove={type.modes.length > 1}
          takenNames={type.modes.filter((m) => m !== mode).map((m) => m.name)}
          onChange={(changes) => updateMode(mode.name, changes)}
          onRename={(name) => {
            updateMode(mode.name, { name })
            onRenameMode(mode.name, name)
          }}
          onRemove={() => onChange({ ...type, modes: type.modes.filter((m) => m !== mode) })}
        />
      ))}

      <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
        <Button
          type="secondary"
          size="slim"
          iconName="add"
          onClick={() =>
            onChange({
              ...type,
              modes: [...type.modes, { name: `mode ${type.modes.length + 1}`, channels: [] }],
            })
          }
        >
          Add Mode
        </Button>
        <Button type="neutral" size="slim" iconName="content_copy" onClick={onDuplicate}>
          Duplicate
        </Button>
        {!shipped && !used && (
          <Button type="danger" size="slim" iconName="delete" onClick={onDelete}>
            Delete Type
          </Button>
        )}
      </div>
      {used && (
        <div style={s.hint}>
          Fixtures in the rig use this type, so edits change them all. Duplicate first to fork it.
        </div>
      )}
    </div>
  )
}

interface ModeEditorProps {
  type: FixtureType
  mode: FixtureMode
  canRemove: boolean
  takenNames: string[]
  onChange: (changes: Partial<FixtureMode>) => void
  onRename: (name: string) => void
  onRemove: () => void
}

function ModeEditor({
  type,
  mode,
  canRemove,
  takenNames,
  onChange,
  onRename,
  onRemove,
}: ModeEditorProps) {
  const [showChannels, setShowChannels] = React.useState(mode.channels.length <= 24)
  const [pattern, setPattern] = React.useState('red, green, blue, white')
  const [repeat, setRepeat] = React.useState('4')
  const produced = new Set(encoderFields(mode.encoder))
  const headed = modeHasHeads(mode)

  const setChannel = (index: number, changes: Partial<FixtureChannel>) =>
    onChange({
      channels: mode.channels.map((c, i) => (i === index ? stripEmpty({ ...c, ...changes }) : c)),
    })

  const moveUp = (index: number) => {
    const next = [...mode.channels]
    ;[next[index - 1], next[index]] = [next[index], next[index - 1]]
    onChange({ channels: next })
  }

  return (
    <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid #222' }}>
      <div style={s.grid2}>
        <div>
          <div style={s.fieldLabel}>Mode Name</div>
          <input
            type="text"
            defaultValue={mode.name}
            key={`${type.id}-${mode.name}`}
            onBlur={(e) => {
              const name = e.target.value.trim()
              if (name && name !== mode.name && !takenNames.includes(name)) onRename(name)
              else e.target.value = mode.name
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
            }}
            style={s.textInput}
          />
        </div>
        <div style={{ ...s.hint, alignSelf: 'end', marginBottom: 6 }}>
          {mode.channels.length} channels
          {headed ? `, ${modeHeadCount(mode)} ${(type.headName || 'head').toLowerCase()}s` : ''}
        </div>
      </div>

      <div style={{ marginTop: 8 }}>
        <div style={s.fieldLabel}>Description</div>
        <textarea
          rows={2}
          value={mode.description ?? ''}
          placeholder="e.g. DIP switch #10 ON"
          onChange={(e) => onChange({ description: e.target.value || undefined })}
          style={s.textArea}
        />
      </div>

      <div style={{ marginTop: 8 }}>
        <EncoderEditor mode={mode} onChange={(encoder) => onChange({ encoder })} />
        <div style={s.hint}>
          Mappings drive the channels carrying {[...produced].join(', ')}. Every other channel sends
          its default.
        </div>
      </div>

      <div style={{ marginTop: 8 }}>
        <button style={s.iconButton} onClick={() => setShowChannels((v) => !v)}>
          {showChannels ? 'Hide' : 'Show'} {mode.channels.length} channels
        </button>
      </div>

      {showChannels && (
        <div style={{ marginTop: 6 }}>
          <div style={{ ...channelGrid, ...s.fieldLabel, marginBottom: 0 }}>
            <span>#</span>
            <span>Field</span>
            <span title="0-based head; blank for fixture-wide">Head</span>
            <span>Default</span>
            <span>Bits</span>
            <span />
            <span />
          </div>
          {mode.channels.map((channel, index) => (
            <div key={index} style={{ paddingBottom: 4, borderBottom: '1px solid #1c1c1c' }}>
              <div style={channelGrid}>
                <span style={{ ...s.cellNum, textAlign: 'left' }}>{index + 1}</span>
                <input
                  type="text"
                  list={FIELD_LIST_ID}
                  value={channel.field ?? ''}
                  placeholder="unused"
                  onChange={(e) => setChannel(index, { field: e.target.value.trim() || null })}
                  style={{
                    ...s.textInput,
                    padding: '2px 5px',
                    color: channel.field && produced.has(channel.field) ? '#8fd19e' : undefined,
                  }}
                />
                <input
                  type="number"
                  min={0}
                  value={channel.head ?? ''}
                  placeholder="—"
                  onChange={(e) => {
                    const head = parseInt(e.target.value, 10)
                    setChannel(index, { head: isNaN(head) ? undefined : Math.max(0, head) })
                  }}
                  style={s.numInput}
                />
                <input
                  type="number"
                  min={0}
                  max={255}
                  value={channel.default ?? ''}
                  placeholder="0"
                  onChange={(e) => {
                    const value = parseInt(e.target.value, 10)
                    setChannel(index, {
                      default: isNaN(value) ? undefined : Math.min(255, Math.max(0, value)),
                    })
                  }}
                  style={s.numInput}
                />
                <select
                  value={channel.bits === 16 ? (channel.part ?? 'coarse') : '8'}
                  onChange={(e) =>
                    setChannel(
                      index,
                      e.target.value === '8'
                        ? { bits: undefined, part: undefined }
                        : { bits: 16, part: e.target.value as 'coarse' | 'fine' },
                    )
                  }
                  style={{ ...s.select, padding: '2px 3px' }}
                >
                  <option value="8">8-bit</option>
                  <option value="coarse">16 coarse</option>
                  <option value="fine">16 fine</option>
                </select>
                <button
                  style={s.iconButton}
                  disabled={index === 0}
                  title="Move up"
                  onClick={() => moveUp(index)}
                >
                  ↑
                </button>
                <button
                  style={s.iconButton}
                  title="Remove channel"
                  onClick={() =>
                    onChange({ channels: mode.channels.filter((_, i) => i !== index) })
                  }
                >
                  ✕
                </button>
              </div>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '26px 1fr 1.4fr',
                  gap: 4,
                  marginTop: 3,
                }}
              >
                <span />
                <input
                  type="text"
                  value={channel.label ?? ''}
                  placeholder={channelLabel(
                    type,
                    { ...mode, channels: [{ ...channel, label: undefined }] },
                    0,
                  )}
                  onChange={(e) => setChannel(index, { label: e.target.value || undefined })}
                  style={{ ...s.textInput, padding: '2px 5px', fontFamily: 'inherit' }}
                />
                <input
                  type="text"
                  value={channel.description ?? ''}
                  placeholder="value ranges, notes"
                  onChange={(e) => setChannel(index, { description: e.target.value || undefined })}
                  style={{ ...s.textInput, padding: '2px 5px', fontFamily: 'inherit' }}
                />
              </div>
            </div>
          ))}

          <div style={{ ...s.addSlotRow, marginTop: 8 }}>
            <Button
              type="secondary"
              size="slim"
              iconName="add"
              onClick={() => onChange({ channels: [...mode.channels, { field: null }] })}
            >
              Channel
            </Button>
            <span style={s.dimLabel}>or repeat</span>
            <input
              type="text"
              value={pattern}
              onChange={(e) => setPattern(e.target.value)}
              title="Fields of one head, comma-separated"
              style={{ ...s.textInput, flex: 1, minWidth: 120, padding: '2px 5px' }}
            />
            <span style={s.dimLabel}>×</span>
            <input
              type="number"
              min={1}
              value={repeat}
              onChange={(e) => setRepeat(e.target.value)}
              style={{ ...s.numInput, width: 48 }}
            />
            <Button
              type="secondary"
              size="slim"
              onClick={() => {
                const fields = pattern
                  .split(',')
                  .map((f) => f.trim())
                  .filter(Boolean)
                const count = Math.max(1, parseInt(repeat, 10) || 1)
                if (fields.length === 0) return
                // New heads number on from the last, so a pattern can be appended in parts.
                const first = headed ? modeHeadCount(mode) : 0
                onChange({ channels: [...mode.channels, ...repeatHeads(fields, count, first)] })
                setShowChannels(true)
              }}
            >
              Add heads
            </Button>
          </div>
          <div style={s.hint}>
            Fields in green are written by the encoder; head numbers start at 0 and a blank head
            marks a fixture-wide channel such as a master dimmer, which only sends its default.
          </div>
        </div>
      )}

      {canRemove && (
        <div style={{ marginTop: 8 }}>
          <Button type="danger" size="slim" iconName="delete" onClick={onRemove}>
            Remove Mode
          </Button>
        </div>
      )}
    </div>
  )
}

/** Loads QLC+ .qxf fixture definitions, of which there are thousands published. */
function QlcImport({ onImport }: { onImport: (type: FixtureType) => void }) {
  const [error, setError] = React.useState<string | null>(null)

  return (
    <div style={{ marginTop: 10 }}>
      <input
        type="file"
        accept=".qxf,application/xml,text/xml"
        style={{ fontSize: '0.78em' }}
        onChange={async (e) => {
          const file = e.target.files?.[0]
          if (!file) return
          const definition = parseQlcXml(await file.text())
          e.target.value = ''
          if (!definition) {
            setError(`Could not read ${file.name} as a QLC+ fixture definition`)
            return
          }
          setError(null)
          onImport(qlcToFixtureType(definition))
        }}
      />
      {error ? (
        <div style={s.warning}>{error}</div>
      ) : (
        <div style={s.hint}>Import a QLC+ .qxf definition</div>
      )}
    </div>
  )
}

/** Drops keys left undefined by an edit, so stored types stay tidy. */
function stripEmpty(channel: FixtureChannel): FixtureChannel {
  const out = { ...channel }
  for (const key of Object.keys(out) as Array<keyof FixtureChannel>) {
    if (out[key] === undefined) delete out[key]
  }
  return out
}

function duplicate(type: FixtureType): FixtureType {
  return {
    ...type,
    id: makeId('type'),
    name: `${type.name} copy`,
    modes: type.modes.map((m) => ({ ...m, channels: m.channels.map((c) => ({ ...c })) })),
  }
}

const channelGrid: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '26px minmax(70px, 1fr) 46px 50px 82px 24px 24px',
  alignItems: 'center',
  gap: 4,
  paddingTop: 4,
}
