import React from 'react'
import { Button } from '@hedron-gl/ui-core'
import { PatchEntryEditor } from './PatchEntryEditor'
import { s } from './styles'
import { DMX_UNIVERSE_SIZE, formatAddressList } from '@/address'
import { FixtureProfile, PatchEntry, findMode, findProfile, makeEntryId } from '@/profiles'
import {
  conflictingEntryIds,
  entryChannelSpan,
  findNextFreeAddress,
  sortPatchByAddress,
  universeUsage,
} from '@/patchTools'

export interface PatchTableProps {
  pluginId: string
  patch: PatchEntry[]
  profiles: FixtureProfile[]
  sourceIds: string[]
  onChange: (patch: PatchEntry[]) => void
  /** Controlled from the panel so selecting on the stage opens the matching row. */
  openId: string | null
  onOpen: (entryId: string | null) => void
}

/** One row per patched fixture, sorted by address, expanding to the full editor. */
export function PatchTable({
  pluginId,
  patch,
  profiles,
  sourceIds,
  onChange,
  openId,
  onOpen,
}: PatchTableProps) {
  const setOpenId = onOpen
  const [sortByAddress, setSortByAddress] = React.useState(true)

  const conflicts = conflictingEntryIds(patch, profiles)
  const usage = universeUsage(patch, profiles)
  const rows = sortByAddress ? sortPatchByAddress(patch) : patch

  const updateEntry = (id: string, changes: Partial<PatchEntry>) =>
    onChange(patch.map((e) => (e.id === id ? { ...e, ...changes } : e)))

  const addEntry = () => {
    const profile = profiles[0]
    const mode = profile?.modes[0]
    const draft: PatchEntry = {
      id: makeEntryId(),
      name: `Fixture ${patch.length + 1}`,
      profileId: profile?.id ?? 'par-rgbwi',
      modeName: mode?.name ?? '5ch RGBWI',
      addresses: [],
      tap: { source: sourceIds[0] ?? '' },
    }
    // Place it at the first gap that fits, so adding a fixture is one click.
    const span = entryChannelSpan(draft, profiles)
    const channel = findNextFreeAddress(patch, profiles, 0, span)
    if (channel !== null) draft.addresses = [{ universe: 0, channel }]
    onChange([...patch, draft])
    setOpenId(draft.id)
  }

  return (
    <div>
      <div style={s.tableToolbar}>
        <span style={{ opacity: 0.55 }}>
          {patch.length} fixture{patch.length === 1 ? '' : 's'}
          {usage.length > 0 &&
            ` · ${usage.map((u) => `U${u.universe} ${u.used}/${DMX_UNIVERSE_SIZE}`).join(', ')}`}
        </span>
        <label style={s.checkboxRow}>
          <input
            type="checkbox"
            checked={sortByAddress}
            onChange={(e) => setSortByAddress(e.target.checked)}
          />
          <span>sort by address</span>
        </label>
      </div>

      {patch.length === 0 && <div style={s.emptyNote}>No patch entries yet.</div>}

      {rows.map((entry) => {
        const profile = findProfile(profiles, entry.profileId)
        const mode = profile ? findMode(profile, entry.modeName) : undefined
        const pixels = Math.max(0, Math.floor(entry.tap.count ?? mode?.pixelCount ?? 1))
        const span = entryChannelSpan(entry, profiles)
        const first = entry.addresses[0]
        const overflows = first !== undefined && first.channel + span - 1 > DMX_UNIVERSE_SIZE
        const clash = conflicts.has(entry.id)
        const disabled = entry.enabled === false
        const isOpen = openId === entry.id

        return (
          <div key={entry.id}>
            <div
              style={{
                ...s.tableRow,
                ...(clash || overflows ? s.tableRowBad : null),
                ...(disabled ? { opacity: 0.45 } : null),
              }}
              onClick={() => setOpenId(isOpen ? null : entry.id)}
            >
              <input
                type="checkbox"
                checked={!disabled}
                title="enabled"
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => updateEntry(entry.id, { enabled: e.target.checked })}
              />
              <span style={s.cellName}>{entry.name || entry.id}</span>
              <span style={s.cellAddress}>{formatAddressList(entry.addresses) || '—'}</span>
              <span style={s.cellNum}>{span}ch</span>
              <span style={s.cellNum}>{pixels}px</span>
              <span style={s.cellProfile}>{profile?.name ?? 'missing profile'}</span>
              <span style={s.cellTap}>{tapSummary(entry)}</span>
              <span style={s.cellFlag}>{overflows ? 'overflows' : clash ? 'overlap' : ''}</span>
            </div>

            {isOpen && (
              <div style={s.fixtureWrap}>
                <PatchEntryEditor
                  pluginId={pluginId}
                  entry={entry}
                  patch={patch}
                  profiles={profiles}
                  sourceIds={sourceIds}
                  onChange={(changes) => updateEntry(entry.id, changes)}
                  onRemove={() => {
                    onChange(patch.filter((e) => e.id !== entry.id))
                    setOpenId(null)
                  }}
                />
              </div>
            )}
          </div>
        )
      })}

      <Button type="secondary" size="slim" iconName="add" onClick={addEntry}>
        Add Fixture
      </Button>
    </div>
  )
}

/** Short description of where an entry reads from, for the collapsed row. */
function tapSummary(entry: PatchEntry): string {
  const parts = [entry.tap.source || '(no source)']
  if (entry.tap.offset) parts.push(`+${entry.tap.offset}`)
  if (entry.tap.step !== undefined && entry.tap.step !== 1) parts.push(`×${entry.tap.step}`)
  if (entry.tap.wrap) parts.push('wrap')
  if (entry.tap.fit === 'stretch') parts.push('stretch')
  if (entry.tap.filter && entry.tap.filter !== 'nearest') parts.push(entry.tap.filter)
  if (entry.tap.arrangement && entry.tap.arrangement !== 'forward')
    parts.push(entry.tap.arrangement)
  return parts.join(' ')
}
