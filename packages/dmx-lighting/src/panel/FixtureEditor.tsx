import React from 'react'
import { Button, Collapsible } from '@hedron-gl/ui-core'
import { PlacementEditor } from './PlacementEditor'
import { s } from './styles'
import { DMX_UNIVERSE_SIZE } from '@/address'
import {
  findMode,
  findType,
  FixtureInstance,
  FixtureType,
  headLabel,
  IdentifyTarget,
  Mapping,
  modeHasHeads,
  modeHeadCount,
} from '@/fixtures'
import { findNextFreeAddress, mappingTitle } from '@/rigTools'

export interface FixtureEditorProps {
  fixture: FixtureInstance
  fixtures: FixtureInstance[]
  library: FixtureType[]
  mappings: Mapping[]
  identify: IdentifyTarget | null
  onIdentify: (head?: number) => void
  onOpenMapping: (mappingId: string) => void
  onAddMapping: () => void
  onChange: (changes: Partial<FixtureInstance>) => void
  onRemove: () => void
}

/** Where one light sits and which of its modes it is set to. */
export function FixtureEditor({
  fixture,
  fixtures,
  library,
  mappings,
  identify,
  onIdentify,
  onOpenMapping,
  onAddMapping,
  onChange,
  onRemove,
}: FixtureEditorProps) {
  const type = findType(library, fixture.typeId)
  const mode = type ? findMode(type, fixture.modeName) : undefined
  const span = mode?.channels.length ?? 0
  const { universe, channel } = fixture.address
  const [showPlacement, setShowPlacement] = React.useState(false)

  const headCount = mode ? modeHeadCount(mode) : 0
  const headed = mode ? modeHasHeads(mode) : false
  const allHeads = Array.from({ length: headCount }, (_, i) => i)
  // Every mapping targeting this fixture, with the heads it drives here.
  const driving = mappings.flatMap((m) =>
    m.targets
      .filter((t) => t.fixtureId === fixture.id)
      .map((t) => ({ mapping: m, heads: t.heads ?? allHeads })),
  )
  const covered = new Set(
    driving.filter((d) => d.mapping.enabled !== false).flatMap((d) => d.heads),
  )
  const uncovered = allHeads.filter((h) => !covered.has(h))

  const autoAddress = () => {
    const next = findNextFreeAddress(fixtures, library, universe, span, fixture.id)
    if (next !== null) onChange({ address: { universe, channel: next } })
  }

  return (
    <div style={s.mappingWrap}>
      <div style={s.grid2}>
        <div>
          <div style={s.fieldLabel}>Name</div>
          <input
            type="text"
            value={fixture.name}
            onChange={(e) => onChange({ name: e.target.value })}
            style={s.textInput}
          />
        </div>
        <div>
          <div style={s.fieldLabel}>Address (universe, channel)</div>
          <div style={{ display: 'flex', gap: 6 }}>
            <input
              type="number"
              min={0}
              value={universe}
              title="universe"
              onChange={(e) =>
                onChange({
                  address: { universe: Math.max(0, parseInt(e.target.value, 10) || 0), channel },
                })
              }
              style={{ ...s.numInput, width: 44 }}
            />
            <input
              type="number"
              min={1}
              max={DMX_UNIVERSE_SIZE}
              value={channel}
              title="start channel"
              onChange={(e) =>
                onChange({
                  address: {
                    universe,
                    channel: Math.min(
                      DMX_UNIVERSE_SIZE,
                      Math.max(1, parseInt(e.target.value, 10) || 1),
                    ),
                  },
                })
              }
              style={{ ...s.numInput, flex: 1, minWidth: 0 }}
            />
            <Button type="neutral" size="slim" onClick={autoAddress}>
              Auto
            </Button>
          </div>
        </div>
      </div>
      <div style={s.hint}>
        Occupies {universe}:{channel}–{channel + span - 1}. Other fixtures may share these channels;
        where two mappings drive the same one, the highest value wins.
      </div>

      <div style={{ ...s.grid2, marginTop: 10 }}>
        <div>
          <div style={s.fieldLabel}>Fixture Type</div>
          <select
            value={fixture.typeId}
            onChange={(e) => {
              const next = findType(library, e.target.value)
              onChange({ typeId: e.target.value, modeName: next?.modes[0]?.name ?? '' })
            }}
            style={s.select}
          >
            {!type && <option value={fixture.typeId}>missing: {fixture.typeId}</option>}
            {library.map((t) => (
              <option key={t.id} value={t.id}>
                {[t.manufacturer, t.name].filter(Boolean).join(' ')}
              </option>
            ))}
          </select>
        </div>
        <div>
          <div style={s.fieldLabel}>Mode</div>
          <select
            value={mode?.name ?? ''}
            onChange={(e) => onChange({ modeName: e.target.value })}
            style={s.select}
          >
            {type?.modes.map((m) => (
              <option key={m.name} value={m.name}>
                {m.name} ({m.channels.length}ch)
              </option>
            ))}
          </select>
        </div>
      </div>
      {(type?.description || mode?.description) && (
        <div style={{ ...s.hint, opacity: 0.6 }}>
          {[type?.description, mode?.description].filter(Boolean).join(' ')}
        </div>
      )}

      {mode && modeHasHeads(mode) && (
        <div style={{ marginTop: 10 }}>
          <div style={s.fieldLabel}>Identify a head</div>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {Array.from({ length: modeHeadCount(mode) }, (_, head) => {
              const on = identify?.fixtureId === fixture.id && identify.head === head
              return (
                <button
                  key={head}
                  style={{ ...s.headChip, ...(on ? s.iconButtonActive : null) }}
                  onClick={() => onIdentify(head)}
                >
                  {headLabel(type, head)}
                </button>
              )
            })}
          </div>
        </div>
      )}

      <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid #222' }}>
        <div style={s.fieldLabel}>Mappings</div>
        {driving.length === 0 && (
          <div style={{ ...s.hint, marginTop: 0, marginBottom: 6 }}>
            Nothing drives this fixture yet.
          </div>
        )}
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
          {driving.map(({ mapping, heads }, i) => (
            <button
              key={`${mapping.id}-${i}`}
              title="Open this mapping"
              style={{
                ...s.headChip,
                ...s.headChipOn,
                ...(mapping.enabled === false ? { opacity: 0.45 } : null),
              }}
              onClick={() => onOpenMapping(mapping.id)}
            >
              {mappingTitle(mapping)}
              {headed && heads.length !== headCount
                ? ` (${heads.map((h) => headLabel(type, h)).join(', ')})`
                : ''}{' '}
              →
            </button>
          ))}
          <button style={s.headChip} onClick={onAddMapping}>
            + {driving.length === 0 ? 'Add a mapping' : 'New mapping'}
          </button>
        </div>
        {driving.length > 0 && headed && uncovered.length > 0 && (
          <div style={s.hint}>Unmapped: {uncovered.map((h) => headLabel(type, h)).join(', ')}</div>
        )}
      </div>

      <div style={{ marginTop: 12, paddingTop: 4, borderTop: '1px solid #222' }}>
        <Collapsible
          title="Placement"
          isOpen={showPlacement}
          onToggle={() => setShowPlacement((v) => !v)}
        >
          {showPlacement && <PlacementEditor fixture={fixture} onChange={onChange} />}
        </Collapsible>
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
        <Button type="danger" size="slim" iconName="delete" onClick={onRemove}>
          Remove Fixture
        </Button>
      </div>
    </div>
  )
}
