import { s } from './styles'
import { placementOf } from '@/layout'
import { PatchEntry } from '@/profiles'

export interface PlacementEditorProps {
  entry: PatchEntry
  onChange: (changes: Partial<PatchEntry>) => void
}

const AXES = ['X', 'Y', 'Z']

/** Position, rotation and size of one fixture, in stage units and degrees. */
export function PlacementEditor({ entry, onChange }: PlacementEditorProps) {
  const placement = placementOf(entry.placement)

  const setTriple = (field: 'position' | 'rotation' | 'size', index: number, value: number) => {
    const next: [number, number, number] = [...placement[field]]
    next[index] = value
    onChange({ placement: { ...placement, [field]: next } })
  }

  const row = (label: string, field: 'position' | 'rotation' | 'size', step: number) => (
    <div style={{ marginBottom: 6 }}>
      <div style={s.fieldLabel}>{label}</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
        {AXES.map((axis, index) => (
          <input
            key={axis}
            type="number"
            step={step}
            value={placement[field][index]}
            title={axis}
            onChange={(e) => setTriple(field, index, parseFloat(e.target.value) || 0)}
            style={{ ...s.numInput, width: '100%', boxSizing: 'border-box' }}
          />
        ))}
      </div>
    </div>
  )

  return (
    <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid #222' }}>
      <div style={s.fieldLabel}>Placement</div>
      {row('Position (x, y, z)', 'position', 0.1)}
      {row('Rotation (degrees)', 'rotation', 5)}
      {row('Size (length, height, depth)', 'size', 0.1)}

      <label style={s.checkboxRow}>
        <input
          type="checkbox"
          checked={entry.tap.spatial === true}
          onChange={(e) => onChange({ tap: { ...entry.tap, spatial: e.target.checked } })}
        />
        <span>sample the source by stage position</span>
      </label>
      <div style={s.hint}>
        With this on the tap ignores indices: each pixel reads wherever it physically sits on the
        stage. The source needs a height greater than 1 for that to mean anything.
      </div>
    </div>
  )
}
