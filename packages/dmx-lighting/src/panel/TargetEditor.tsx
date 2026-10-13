import React from 'react'
import { s } from './styles'
import {
  findMode,
  findType,
  FixtureInstance,
  FixtureType,
  headLabel,
  MappingTarget,
  modeHasHeads,
  modeHeadCount,
} from '@/fixtures'
import { formatAddress, sortFixturesByAddress } from '@/rigTools'

export interface TargetEditorProps {
  targets: MappingTarget[]
  fixtures: FixtureInstance[]
  library: FixtureType[]
  onChange: (targets: MappingTarget[]) => void
  onOpenFixture: (fixtureId: string) => void
}

/** The ordered list of fixtures a mapping drives, with the heads of each picked by chip. */
export function TargetEditor({
  targets,
  fixtures,
  library,
  onChange,
  onOpenFixture,
}: TargetEditorProps) {
  const [adding, setAdding] = React.useState('')

  const replace = (index: number, target: MappingTarget) =>
    onChange(targets.map((t, i) => (i === index ? target : t)))

  const move = (index: number, by: number) => {
    const next = [...targets]
    const [item] = next.splice(index, 1)
    next.splice(index + by, 0, item)
    onChange(next)
  }

  // A fixture appears once per mapping; its head chips choose which heads it gives.
  const targeted = new Set(targets.map((t) => t.fixtureId))
  const available = sortFixturesByAddress(fixtures).filter((f) => !targeted.has(f.id))

  return (
    <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid #222' }}>
      <div style={s.fieldLabel}>Targets, in spread order</div>

      {targets.length === 0 && <div style={s.emptyNote}>No targets yet.</div>}

      {targets.map((target, index) => {
        const fixture = fixtures.find((f) => f.id === target.fixtureId)
        const type = fixture ? findType(library, fixture.typeId) : undefined
        const mode = type && fixture ? findMode(type, fixture.modeName) : undefined
        const count = mode ? modeHeadCount(mode) : 0
        const selected = new Set(target.heads ?? Array.from({ length: count }, (_, i) => i))

        const toggleHead = (head: number) => {
          const next = new Set(selected)
          if (next.has(head)) next.delete(head)
          else next.add(head)
          const heads = [...next].sort((a, b) => a - b)
          // All heads selected is stored as "all", so a mode switch keeps covering the fixture.
          replace(index, {
            fixtureId: target.fixtureId,
            ...(heads.length === count ? {} : { heads }),
          })
        }

        return (
          <div key={`${target.fixtureId}-${index}`} style={{ marginBottom: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.8em' }}>
              <span style={{ fontWeight: 600, flex: 1, minWidth: 0 }}>
                {fixture ? (
                  <button
                    title="Open this fixture in the rig"
                    style={{ ...s.iconButton, fontWeight: 600 }}
                    onClick={() => onOpenFixture(fixture.id)}
                  >
                    {fixture.name} →
                  </button>
                ) : (
                  `missing fixture ${target.fixtureId}`
                )}
                {fixture && (
                  <span style={{ opacity: 0.45, fontWeight: 400 }}>
                    {' '}
                    @{formatAddress(fixture.address)} · {type?.name} {mode?.name}
                  </span>
                )}
              </span>
              <button
                style={s.iconButton}
                disabled={index === 0}
                title="Move earlier"
                onClick={() => move(index, -1)}
              >
                ↑
              </button>
              <button
                style={s.iconButton}
                disabled={index === targets.length - 1}
                title="Move later"
                onClick={() => move(index, 1)}
              >
                ↓
              </button>
              <button
                style={s.iconButton}
                title="Remove target"
                onClick={() => onChange(targets.filter((_, i) => i !== index))}
              >
                ✕
              </button>
            </div>

            {mode && modeHasHeads(mode) && (
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 4 }}>
                {Array.from({ length: count }, (_, head) => (
                  <button
                    key={head}
                    style={{ ...s.headChip, ...(selected.has(head) ? s.headChipOn : null) }}
                    onClick={() => toggleHead(head)}
                  >
                    {headLabel(type, head)}
                  </button>
                ))}
                <button
                  style={s.headChip}
                  onClick={() =>
                    replace(index, {
                      fixtureId: target.fixtureId,
                      ...(selected.size === count ? { heads: [] } : {}),
                    })
                  }
                >
                  {selected.size === count ? 'none' : 'all'}
                </button>
              </div>
            )}
            {mode && selected.size === 0 && (
              <div style={s.warning}>No heads selected, so this target receives nothing.</div>
            )}
          </div>
        )
      })}

      {available.length > 0 ? (
        <select
          value={adding}
          onChange={(e) => {
            const fixtureId = e.target.value
            setAdding('')
            if (fixtureId && !targeted.has(fixtureId)) onChange([...targets, { fixtureId }])
          }}
          style={s.select}
        >
          <option value="">Add a fixture…</option>
          {available.map((fixture) => (
            <option key={fixture.id} value={fixture.id}>
              {fixture.name} @{formatAddress(fixture.address)}
            </option>
          ))}
        </select>
      ) : (
        <div style={s.hint}>Every fixture in the rig is already a target.</div>
      )}
    </div>
  )
}
