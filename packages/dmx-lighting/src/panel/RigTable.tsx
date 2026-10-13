import React from 'react'
import { Button } from '@hedron-gl/ui-core'
import { FixtureEditor } from './FixtureEditor'
import { fixtureElementId } from './reveal'
import { s } from './styles'
import { DMX_UNIVERSE_SIZE } from '@/address'
import { DmxLightingPlugin } from '@/DmxLightingPlugin'
import { findMode, findType, FixtureInstance, makeId, modeHeadCount } from '@/fixtures'
import {
  findNextFreeAddress,
  fixtureSpan,
  formatAddress,
  sharedWith,
  sortFixturesByAddress,
  universeUsage,
} from '@/rigTools'

export interface RigTableProps {
  plugin: DmxLightingPlugin
  onChange: () => void
  /** Controlled from the panel so the stage view and channel map can open a row. */
  openId: string | null
  onOpen: (fixtureId: string | null) => void
  onOpenMapping: (mappingId: string) => void
  onAddMapping: (fixtureId: string) => void
}

/** One row per light hung, sorted by address, expanding to its editor. */
export function RigTable({
  plugin,
  onChange,
  openId,
  onOpen,
  onOpenMapping,
  onAddMapping,
}: RigTableProps) {
  const fixtures = plugin.getFixtures()
  const library = plugin.getLibrary()
  const mappings = plugin.getMappings()
  const identify = plugin.getIdentify()
  const mapped = new Set(mappings.flatMap((m) => m.targets.map((t) => t.fixtureId)))

  const [typeId, setTypeId] = React.useState(library[0]?.id ?? '')
  const [modeName, setModeName] = React.useState('')
  const addType = findType(library, typeId) ?? library[0]
  const addMode = addType ? findMode(addType, modeName) : undefined

  const shared = sharedWith(fixtures, library)
  const usage = universeUsage(fixtures, library)
  const rows = sortFixturesByAddress(fixtures)

  const commit = (next: FixtureInstance[]) => {
    plugin.setFixtures(next)
    onChange()
  }

  const update = (id: string, changes: Partial<FixtureInstance>) =>
    commit(fixtures.map((f) => (f.id === id ? { ...f, ...changes } : f)))

  /** Names like "LP-LED4X 3", counting up from however many of that type are hung. */
  const nextName = (base: string) => {
    const taken = new Set(fixtures.map((f) => f.name))
    for (let n = 1; ; n++) if (!taken.has(`${base} ${n}`)) return `${base} ${n}`
  }

  const addFixture = () => {
    if (!addType || !addMode) return
    const universe = fixtures[fixtures.length - 1]?.address.universe ?? 0
    const draft: FixtureInstance = {
      id: makeId('fixture'),
      name: nextName(addType.name),
      typeId: addType.id,
      modeName: addMode.name,
      address: { universe, channel: 1 },
    }
    // Place it at the first gap that fits, so adding a light is one click.
    const channel = findNextFreeAddress(fixtures, library, universe, addMode.channels.length)
    if (channel !== null) draft.address = { universe, channel }
    commit([...fixtures, draft])
    onOpen(draft.id)
  }

  /** A copy at the first gap after the original, which is where the next unit usually goes. */
  const duplicate = (fixture: FixtureInstance) => {
    const span = fixtureSpan(fixture, library)
    const { universe, channel: from } = fixture.address
    const channel =
      findNextFreeAddress(fixtures, library, universe, span, undefined, from) ??
      findNextFreeAddress(fixtures, library, universe, span)
    const type = findType(library, fixture.typeId)
    const copy: FixtureInstance = {
      ...fixture,
      id: makeId('fixture'),
      name: nextName(type?.name ?? fixture.name),
      address: { universe, channel: channel ?? from },
    }
    commit([...fixtures, copy])
    onOpen(copy.id)
  }

  const toggleIdentify = (fixtureId: string, head?: number) => {
    const same = identify?.fixtureId === fixtureId && identify.head === head
    plugin.setIdentify(same ? null : { fixtureId, head })
    onChange()
  }

  return (
    <div>
      <div style={s.tableToolbar}>
        <span style={{ opacity: 0.55 }}>
          {fixtures.length} fixture{fixtures.length === 1 ? '' : 's'}
          {usage.length > 0 &&
            ` · ${usage.map((u) => `U${u.universe} ${u.used}/${DMX_UNIVERSE_SIZE}`).join(', ')}`}
        </span>
        {identify && (
          <button
            style={s.iconButton}
            onClick={() => {
              plugin.setIdentify(null)
              onChange()
            }}
          >
            stop identify
          </button>
        )}
      </div>

      {fixtures.length === 0 && <div style={s.emptyNote}>No fixtures hung yet.</div>}

      {rows.map((fixture) => {
        const type = findType(library, fixture.typeId)
        const mode = type ? findMode(type, fixture.modeName) : undefined
        const span = mode?.channels.length ?? 0
        const last = fixture.address.channel + span - 1
        const overflows = last > DMX_UNIVERSE_SIZE
        const sharing = shared.get(fixture.id)
        const disabled = fixture.enabled === false
        const isOpen = openId === fixture.id
        const identifying = identify?.fixtureId === fixture.id && identify.head === undefined

        return (
          <div key={fixture.id} id={fixtureElementId(fixture.id)}>
            <div
              style={{
                ...s.rigRow,
                ...(overflows || !mode ? s.tableRowBad : null),
                ...(disabled ? { opacity: 0.45 } : null),
              }}
              onClick={() => onOpen(isOpen ? null : fixture.id)}
            >
              <input
                type="checkbox"
                checked={!disabled}
                title="enabled"
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => update(fixture.id, { enabled: e.target.checked })}
              />
              <span style={s.cellName}>{fixture.name || fixture.id}</span>
              <span style={s.cellProfile}>
                {type ? `${type.name} · ${mode?.name}` : 'missing fixture type'}
              </span>
              <span style={s.cellAddress}>
                {formatAddress(fixture.address)}–{last}
              </span>
              <span style={s.cellNum} title="heads">
                {mode ? modeHeadCount(mode) : 0}
              </span>
              {overflows ? (
                <span style={s.cellFlag}>past 512</span>
              ) : (
                <span
                  style={s.cellNote}
                  title={sharing ? `Shares channels with ${sharing.join(', ')}` : ''}
                >
                  {[
                    sharing ? `shares with ${sharing.join(', ')}` : '',
                    mapped.has(fixture.id) ? '' : 'unmapped',
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
              )}
              <span style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                <button
                  title="Identify: flash this fixture"
                  style={{ ...s.iconButton, ...(identifying ? s.iconButtonActive : null) }}
                  onClick={(e) => {
                    e.stopPropagation()
                    toggleIdentify(fixture.id)
                  }}
                >
                  ◉
                </button>
                <button
                  title="Duplicate at the next free address"
                  style={s.iconButton}
                  onClick={(e) => {
                    e.stopPropagation()
                    duplicate(fixture)
                  }}
                >
                  ⧉
                </button>
              </span>
            </div>

            {isOpen && (
              <div style={s.fixtureWrap}>
                <FixtureEditor
                  fixture={fixture}
                  fixtures={fixtures}
                  library={library}
                  mappings={mappings}
                  identify={identify}
                  onIdentify={(head) => toggleIdentify(fixture.id, head)}
                  onOpenMapping={onOpenMapping}
                  onAddMapping={() => onAddMapping(fixture.id)}
                  onChange={(changes) => update(fixture.id, changes)}
                  onRemove={() => {
                    if (identify?.fixtureId === fixture.id) plugin.setIdentify(null)
                    // Drop it from mappings too, so none keeps a target that no longer exists.
                    plugin.setMappings(
                      mappings.map((m) => ({
                        ...m,
                        targets: m.targets.filter((t) => t.fixtureId !== fixture.id),
                      })),
                    )
                    commit(fixtures.filter((f) => f.id !== fixture.id))
                    onOpen(null)
                  }}
                />
              </div>
            )}
          </div>
        )
      })}

      <div style={{ display: 'flex', gap: 6, marginTop: 8, alignItems: 'center' }}>
        <select
          value={addType?.id ?? ''}
          onChange={(e) => {
            setTypeId(e.target.value)
            setModeName('')
          }}
          style={{ ...s.select, flex: 2 }}
        >
          {library.map((t) => (
            <option key={t.id} value={t.id}>
              {[t.manufacturer, t.name].filter(Boolean).join(' ')}
            </option>
          ))}
        </select>
        <select
          value={addMode?.name ?? ''}
          onChange={(e) => setModeName(e.target.value)}
          style={{ ...s.select, flex: 1 }}
        >
          {addType?.modes.map((m) => (
            <option key={m.name} value={m.name}>
              {m.name}
            </option>
          ))}
        </select>
        <Button type="secondary" size="slim" iconName="add" onClick={addFixture}>
          Add
        </Button>
      </div>
    </div>
  )
}
