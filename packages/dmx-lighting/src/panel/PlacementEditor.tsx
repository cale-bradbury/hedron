import { s } from './styles'
import { placementOf } from '@/layout'
import { FixtureInstance } from '@/fixtures'

export interface PlacementEditorProps {
  fixture: FixtureInstance
  onChange: (changes: Partial<FixtureInstance>) => void
}

const AXES = ['X', 'Y', 'Z']

/** Position, rotation and size of one fixture, in stage units and degrees. */
export function PlacementEditor({ fixture, onChange }: PlacementEditorProps) {
  const placement = placementOf(fixture.placement)

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
    <div style={{ paddingTop: 4 }}>
      {row('Position (x, y, z)', 'position', 0.1)}
      {row('Rotation (degrees)', 'rotation', 5)}
      {row('Size (length, height, depth)', 'size', 0.1)}
      <div style={s.hint}>
        Heads spread evenly along the length. Spatial mappings sample the source wherever each head
        sits on the stage.
      </div>
    </div>
  )
}
