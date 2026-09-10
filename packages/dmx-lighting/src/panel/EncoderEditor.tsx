import { Button } from '@hedron-gl/ui-core'
import { s } from './styles'
import { ENCODER_KINDS, EncoderSpec, WheelEntry } from '@/encoders'
import type { FixtureMode } from '@/profiles'

// ─── EncoderEditor ────────────────────────────────────────────────────────────

interface EncoderEditorProps {
  mode: FixtureMode
  onChange: (encoder: EncoderSpec | undefined) => void
}

/** Picks how a colour becomes this mode's fields, plus the options that kind needs. */
export function EncoderEditor({ mode, onChange }: EncoderEditorProps) {
  const encoder = mode.encoder
  const kind = encoder?.kind ?? 'passthrough'
  const entries: WheelEntry[] = encoder?.kind === 'wheel' ? encoder.entries : []

  const setWheelEntries = (next: WheelEntry[]) => {
    if (encoder?.kind !== 'wheel') return
    onChange({ ...encoder, entries: next })
  }

  return (
    <div style={{ marginBottom: 10 }}>
      <div style={s.fieldLabel}>Encoder</div>
      <select
        value={kind}
        onChange={(e) => {
          const next = e.target.value as EncoderSpec['kind']
          if (next === 'passthrough') onChange(undefined)
          else if (next === 'wheel') onChange({ kind: 'wheel', entries: [], carryIntensity: true })
          else if (next === 'rgbw' || next === 'rgbwa')
            onChange({ kind: next, whiteExtract: 'min' })
          else onChange({ kind: next })
        }}
        style={s.select}
      >
        {ENCODER_KINDS.map((k) => (
          <option key={k} value={k}>
            {k}
          </option>
        ))}
      </select>

      {(encoder?.kind === 'rgbw' || encoder?.kind === 'rgbwa') && (
        <div style={{ marginTop: 6 }}>
          <div style={s.fieldLabel}>White Extraction</div>
          <select
            value={encoder.whiteExtract ?? 'min'}
            onChange={(e) =>
              onChange({
                ...encoder,
                whiteExtract: e.target.value as 'none' | 'min' | 'max-preserve',
              })
            }
            style={s.select}
          >
            <option value="none">none (source white only)</option>
            <option value="min">min (pull common grey out)</option>
            <option value="max-preserve">max-preserve</option>
          </select>
        </div>
      )}

      {encoder?.kind === 'wheel' && (
        <div style={{ marginTop: 6 }}>
          <label style={s.checkboxRow}>
            <input
              type="checkbox"
              checked={encoder.carryIntensity !== false}
              onChange={(e) => onChange({ ...encoder, carryIntensity: e.target.checked })}
            />
            <span>brightness on the intensity channel</span>
          </label>

          <div style={{ ...s.fieldLabel, marginTop: 6 }}>Wheel Positions</div>
          {entries.map((wheelEntry, index) => (
            <div key={index} style={s.wheelRow}>
              <input
                type="number"
                min={0}
                max={255}
                value={wheelEntry.value}
                onChange={(e) =>
                  setWheelEntries(
                    entries.map((w, i) =>
                      i === index ? { ...w, value: parseInt(e.target.value, 10) || 0 } : w,
                    ),
                  )
                }
                style={{ ...s.numInput, width: 62 }}
              />
              <input
                type="color"
                value={wheelEntry.color}
                onChange={(e) =>
                  setWheelEntries(
                    entries.map((w, i) => (i === index ? { ...w, color: e.target.value } : w)),
                  )
                }
                style={{ width: 38, height: 22, padding: 0, border: '1px solid #333' }}
              />
              <input
                type="text"
                value={wheelEntry.label ?? ''}
                placeholder="label"
                onChange={(e) =>
                  setWheelEntries(
                    entries.map((w, i) => (i === index ? { ...w, label: e.target.value } : w)),
                  )
                }
                style={{ ...s.textInput, flex: 1 }}
              />
              <Button
                type="danger"
                size="slim"
                iconName="delete"
                onClick={() => setWheelEntries(entries.filter((_, i) => i !== index))}
              >
                {''}
              </Button>
            </div>
          ))}
          <Button
            type="secondary"
            size="slim"
            iconName="add"
            onClick={() => setWheelEntries([...entries, { value: 0, color: '#ffffff' }])}
          >
            Add Position
          </Button>
          <div style={s.hint}>
            The closest position in Oklab wins, matched on hue rather than level so a dimmed colour
            still picks its own.
          </div>
        </div>
      )}
    </div>
  )
}
