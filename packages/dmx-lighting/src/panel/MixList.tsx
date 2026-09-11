import React from 'react'
import { Button, ControlGrid, NodeContainer } from '@hedron-gl/ui-core'
import { s } from './styles'
import { DmxLightingPlugin } from '@/DmxLightingPlugin'
import { MixSource, makeMixId, mixPositionNodeId } from '@/mixer'

const DECK_LETTERS = 'ABCDEFGHIJKLMNOP'

export interface MixListProps {
  plugin: DmxLightingPlugin
  onChange: () => void
}

/** Crossfaded sources set up like DJ decks: fade across, then swap whichever deck is silent. */
export function MixList({ plugin, onChange }: MixListProps) {
  const mixes = plugin.getMixes()
  const sources = plugin.getSources()
  const sourceIds = sources.map((source) => source.id)

  const commit = (next: MixSource[]) => {
    plugin.setMixes(next)
    onChange()
  }

  const addMix = () => {
    const outputs = new Set(mixes.map((mix) => mix.source))
    const decks = sourceIds.filter((id) => !outputs.has(id)).slice(0, 2)
    while (decks.length < 2) decks.push('')
    const first = sources.find((source) => source.id === decks[0])
    commit([
      ...mixes,
      {
        id: makeMixId(),
        source: uniqueName('mix', [...sourceIds, ...outputs]),
        inputs: decks,
        pixelCount: first?.pixelCount ?? 28,
      },
    ])
  }

  return (
    <div>
      {mixes.length === 0 && (
        <div style={s.emptyNote}>No mixes — add one to crossfade between sources.</div>
      )}

      {mixes.map((mix) => (
        <MixEditor
          key={mix.id}
          pluginId={plugin.id}
          mix={mix}
          weights={plugin.getMixWeights(mix.id)}
          sourceIds={sourceIds}
          takenNames={mixes.filter((m) => m.id !== mix.id).map((m) => m.source)}
          onChange={(changes) =>
            commit(mixes.map((m) => (m.id === mix.id ? { ...m, ...changes } : m)))
          }
          onRemove={() => commit(mixes.filter((m) => m.id !== mix.id))}
        />
      ))}

      <div style={{ marginTop: 6 }}>
        <Button type="secondary" size="slim" iconName="add" onClick={addMix}>
          Add Mix
        </Button>
      </div>
    </div>
  )
}

interface MixEditorProps {
  pluginId: string
  mix: MixSource
  weights: number[]
  sourceIds: string[]
  takenNames: string[]
  onChange: (changes: Partial<MixSource>) => void
  onRemove: () => void
}

function MixEditor({
  pluginId,
  mix,
  weights,
  sourceIds,
  takenNames,
  onChange,
  onRemove,
}: MixEditorProps) {
  const [name, setName] = React.useState(mix.source)
  React.useEffect(() => setName(mix.source), [mix.source])

  const commitName = () => {
    const trimmed = name.trim()
    // An output can't share another mix's name or read itself, so those snap back.
    if (!trimmed || takenNames.includes(trimmed) || mix.inputs.includes(trimmed)) {
      setName(mix.source)
      return
    }
    if (trimmed !== mix.source) onChange({ source: trimmed })
  }

  const deckOptions = sourceIds.filter((id) => id !== mix.source)

  const setInput = (index: number, id: string) =>
    onChange({ inputs: mix.inputs.map((current, i) => (i === index ? id : current)) })

  return (
    <div style={s.mappingWrap}>
      <div style={s.grid3}>
        <div>
          <div style={s.fieldLabel}>Output Source</div>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={commitName}
            onKeyDown={(e) => {
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
            }}
            style={s.textInput}
          />
        </div>
        <div>
          <div style={s.fieldLabel}>Pixels</div>
          <input
            type="number"
            min={1}
            max={512}
            value={mix.pixelCount}
            onChange={(e) => {
              const n = parseInt(e.target.value, 10)
              if (!isNaN(n)) onChange({ pixelCount: Math.max(1, Math.min(512, n)) })
            }}
            style={{ ...s.numInput, width: '100%', boxSizing: 'border-box' }}
          />
        </div>
      </div>

      <div style={{ ...s.fieldLabel, marginTop: 10 }}>Decks</div>
      {mix.inputs.map((input, index) => {
        const weight = weights[index] ?? 0
        // Keep a deck's source listed even before any sketch has created it.
        const options = input && !deckOptions.includes(input) ? [input, ...deckOptions] : deckOptions
        return (
          <div key={index} style={s.wheelRow}>
            <span style={{ ...s.chip, background: weight > 0 ? '#2e7a2e' : '#333' }}>
              {DECK_LETTERS[index] ?? index + 1}
            </span>
            <select
              value={input}
              onChange={(e) => setInput(index, e.target.value)}
              style={s.select}
            >
              <option value="">(empty)</option>
              {options.map((id) => (
                <option key={id} value={id}>
                  {id}
                </option>
              ))}
            </select>
            <span style={{ ...s.dimLabel, width: 36, textAlign: 'right' }}>
              {Math.round(weight * 100)}%
            </span>
            {mix.inputs.length > 1 && (
              <Button
                type="neutral"
                size="slim"
                onClick={() => onChange({ inputs: mix.inputs.filter((_, i) => i !== index) })}
              >
                Remove
              </Button>
            )}
          </div>
        )
      })}
      <div style={s.hint}>Green decks are live; a grey deck can be swapped without a visible change.</div>

      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        <Button
          type="neutral"
          size="slim"
          iconName="add"
          onClick={() => onChange({ inputs: [...mix.inputs, ''] })}
        >
          Add Deck
        </Button>
      </div>

      {/* The crossfader is a param node, so it can be mapped to MIDI like any other. */}
      <div style={{ marginTop: 10 }}>
        <ControlGrid>
          <NodeContainer nodeId={mixPositionNodeId(pluginId, mix.id)} />
        </ControlGrid>
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
        <Button type="danger" size="slim" iconName="delete" onClick={onRemove}>
          Remove Mix
        </Button>
      </div>
    </div>
  )
}

function uniqueName(base: string, taken: Iterable<string>): string {
  const names = new Set(taken)
  if (!names.has(base)) return base
  let n = 2
  while (names.has(`${base}-${n}`)) n++
  return `${base}-${n}`
}
