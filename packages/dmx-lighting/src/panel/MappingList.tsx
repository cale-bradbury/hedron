import { Button } from '@hedron-gl/ui-core'
import { MappingEditor } from './MappingEditor'
import { mappingElementId } from './reveal'
import { s } from './styles'
import { DmxLightingPlugin } from '@/DmxLightingPlugin'
import { findMode, findType, makeId, Mapping, modeHeadCount } from '@/fixtures'

export interface MappingListProps {
  plugin: DmxLightingPlugin
  onChange: () => void
  /** Controlled from the panel so a fixture can open the mapping that drives it. */
  openId: string | null
  onOpen: (mappingId: string | null) => void
  onOpenFixture: (fixtureId: string) => void
}

/** How sketch colours reach fixtures: one row per mapping, expanding to its editor. */
export function MappingList({
  plugin,
  onChange,
  openId,
  onOpen: setOpenId,
  onOpenFixture,
}: MappingListProps) {
  const mappings = plugin.getMappings()
  const fixtures = plugin.getFixtures()
  const library = plugin.getLibrary()
  const sourceIds = plugin.getSources().map((source) => source.id)

  const commit = (next: Mapping[]) => {
    plugin.setMappings(next)
    onChange()
  }

  const update = (id: string, changes: Partial<Mapping>) =>
    commit(mappings.map((m) => (m.id === id ? { ...m, ...changes } : m)))

  const addMapping = () => {
    const draft: Mapping = {
      id: makeId('map'),
      name: `Mapping ${mappings.length + 1}`,
      source: sourceIds[0] ?? '',
      kind: 'spread',
      targets: [],
    }
    commit([...mappings, draft])
    setOpenId(draft.id)
  }

  /** "LP-LED4X 1 (Pod 1, 2) + Wall 1" — which fixtures, and which heads when not all. */
  const targetSummary = (mapping: Mapping): string => {
    if (mapping.targets.length === 0) return 'no targets'
    return mapping.targets
      .map((target) => {
        const fixture = fixtures.find((f) => f.id === target.fixtureId)
        if (!fixture) return 'missing fixture'
        const type = findType(library, fixture.typeId)
        const mode = type ? findMode(type, fixture.modeName) : undefined
        const count = mode ? modeHeadCount(mode) : 1
        if (!target.heads || target.heads.length === count) return fixture.name
        return `${fixture.name} (${target.heads.map((h) => h + 1).join(', ')})`
      })
      .join(' + ')
  }

  const rangeSummary = (mapping: Mapping): string => {
    const offset = mapping.offset ? `+${mapping.offset}` : ''
    const span = mapping.span ? `[${mapping.span}]` : ''
    return `${mapping.source || '(no source)'}${offset}${span}`
  }

  return (
    <div>
      {mappings.length === 0 && (
        <div style={s.emptyNote}>
          No mappings — add one to send a sketch source to fixtures or heads.
        </div>
      )}

      {mappings.map((mapping) => {
        const isOpen = openId === mapping.id
        const disabled = mapping.enabled === false
        return (
          <div key={mapping.id} id={mappingElementId(mapping.id)}>
            <div
              style={{ ...s.mapRow, ...(disabled ? { opacity: 0.45 } : null) }}
              onClick={() => setOpenId(isOpen ? null : mapping.id)}
            >
              <input
                type="checkbox"
                checked={!disabled}
                title="enabled"
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => update(mapping.id, { enabled: e.target.checked })}
              />
              <span style={s.cellName}>{mapping.name || mapping.id}</span>
              <span style={s.cellTap}>{rangeSummary(mapping)}</span>
              <span style={s.cellNote}>
                {mapping.kind === 'reduce' ? (mapping.reduce ?? 'average') : 'spread'}
              </span>
              <span style={s.cellNote} title={targetSummary(mapping)}>
                → {targetSummary(mapping)}
              </span>
            </div>

            {isOpen && (
              <div style={s.fixtureWrap}>
                <MappingEditor
                  plugin={plugin}
                  mapping={mapping}
                  sourceIds={sourceIds}
                  onOpenFixture={onOpenFixture}
                  onChange={(changes) => update(mapping.id, changes)}
                  onRemove={() => {
                    commit(mappings.filter((m) => m.id !== mapping.id))
                    setOpenId(null)
                  }}
                  onDuplicate={() => {
                    const copy = {
                      ...mapping,
                      id: makeId('map'),
                      name: `${mapping.name ?? ''} copy`,
                    }
                    commit([...mappings, copy])
                    setOpenId(copy.id)
                  }}
                />
              </div>
            )}
          </div>
        )
      })}

      <div style={{ marginTop: 8 }}>
        <Button type="secondary" size="slim" iconName="add" onClick={addMapping}>
          Add Mapping
        </Button>
      </div>
    </div>
  )
}
