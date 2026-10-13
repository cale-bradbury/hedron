import React from 'react'
import { Button, ControlGrid, NodeContainer } from '@hedron-gl/ui-core'
import { MappingPreviewStrip } from './MappingPreviewStrip'
import { TargetEditor } from './TargetEditor'
import { s } from './styles'
import { DmxLightingPlugin } from '@/DmxLightingPlugin'
import {
  Mapping,
  mappingGainNodeId,
  mappingOffsetNodeId,
  ReduceMode,
  TapArrangement,
  TapFilter,
  TapFit,
} from '@/fixtures'

/** Sentinel option that switches the source field to free text. */
const CUSTOM_SOURCE = '__type_a_name__'

export interface MappingEditorProps {
  plugin: DmxLightingPlugin
  mapping: Mapping
  sourceIds: string[]
  onChange: (changes: Partial<Mapping>) => void
  onRemove: () => void
  onDuplicate: () => void
  onOpenFixture: (fixtureId: string) => void
}

/** Which source pixels a mapping reads, how they become colours, and which heads show them. */
export function MappingEditor({
  plugin,
  mapping,
  sourceIds,
  onOpenFixture,
  onChange,
  onRemove,
  onDuplicate,
}: MappingEditorProps) {
  const [customSource, setCustomSource] = React.useState(false)
  const reduce = mapping.kind === 'reduce'
  const stretch = mapping.fit === 'stretch'
  const options = sourceIds.includes(mapping.source) ? sourceIds : [mapping.source, ...sourceIds]

  const numberInput = (
    value: number | undefined,
    placeholder: string,
    apply: (value: number | undefined) => void,
    step = 1,
  ) => (
    <input
      type="number"
      min={0}
      step={step}
      value={value ?? ''}
      placeholder={placeholder}
      onChange={(e) => {
        const parsed = parseFloat(e.target.value)
        apply(e.target.value.trim() === '' || isNaN(parsed) ? undefined : parsed)
      }}
      style={{ ...s.numInput, width: '100%', boxSizing: 'border-box' }}
    />
  )

  return (
    <div style={s.mappingWrap}>
      <div style={s.grid2}>
        <div>
          <div style={s.fieldLabel}>Name</div>
          <input
            type="text"
            value={mapping.name ?? ''}
            onChange={(e) => onChange({ name: e.target.value })}
            style={s.textInput}
          />
        </div>
        <div>
          <div style={s.fieldLabel}>Source</div>
          {customSource ? (
            <input
              type="text"
              autoFocus
              value={mapping.source}
              placeholder="source name"
              onChange={(e) => onChange({ source: e.target.value })}
              onBlur={() => setCustomSource(false)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
              }}
              style={s.textInput}
            />
          ) : (
            <select
              value={mapping.source}
              onChange={(e) => {
                if (e.target.value === CUSTOM_SOURCE) setCustomSource(true)
                else onChange({ source: e.target.value })
              }}
              style={s.select}
            >
              {options.map((id) => (
                <option key={id} value={id}>
                  {id || '(none)'}
                </option>
              ))}
              <option value={CUSTOM_SOURCE}>Type a name…</option>
            </select>
          )}
        </div>
      </div>

      <div style={{ ...s.grid3, marginTop: 10 }}>
        <div>
          <div style={s.fieldLabel}>Kind</div>
          <select
            value={mapping.kind}
            onChange={(e) => onChange({ kind: e.target.value as Mapping['kind'] })}
            style={s.select}
          >
            <option value="spread">spread — a pixel per head</option>
            <option value="reduce">reduce — one colour for all</option>
          </select>
        </div>
        {reduce ? (
          <div>
            <div style={s.fieldLabel}>Pick</div>
            <select
              value={mapping.reduce ?? 'average'}
              onChange={(e) => onChange({ reduce: e.target.value as ReduceMode })}
              style={s.select}
            >
              <option value="average">average</option>
              <option value="brightest">brightest pixel</option>
              <option value="darkest">darkest pixel</option>
            </select>
          </div>
        ) : (
          <div>
            <div style={s.fieldLabel}>Step</div>
            {numberInput(mapping.step, '1', (step) => onChange({ step }), 0.1)}
          </div>
        )}
        <div>
          <div style={s.fieldLabel}>Span</div>
          {reduce || stretch ? (
            numberInput(mapping.span, 'all', (span) =>
              onChange({ span: span === undefined ? undefined : Math.max(1, Math.floor(span)) }),
            )
          ) : (
            <div style={{ ...s.hint, marginTop: 6 }}>heads × step</div>
          )}
        </div>
      </div>
      <div style={s.hint}>
        {reduce
          ? 'Collapses the span from the offset into one colour that every target head shows.'
          : 'Each target head reads its own source pixel, in target order, starting at the offset.'}
      </div>

      {!reduce && (
        <>
          <div style={{ ...s.grid3, marginTop: 10 }}>
            <div>
              <div style={s.fieldLabel}>Fit</div>
              <select
                value={mapping.fit ?? 'clip'}
                onChange={(e) => onChange({ fit: e.target.value as TapFit })}
                style={s.select}
              >
                <option value="clip">clip (step through)</option>
                <option value="stretch">stretch (fit span)</option>
              </select>
            </div>
            <div>
              <div style={s.fieldLabel}>Filter</div>
              <select
                value={mapping.filter ?? 'nearest'}
                onChange={(e) => onChange({ filter: e.target.value as TapFilter })}
                style={s.select}
              >
                <option value="nearest">nearest</option>
                <option value="linear">linear</option>
                <option value="average">average</option>
              </select>
            </div>
            <div>
              <div style={s.fieldLabel}>Arrangement</div>
              <select
                value={mapping.arrangement ?? 'forward'}
                onChange={(e) => onChange({ arrangement: e.target.value as TapArrangement })}
                style={s.select}
              >
                <option value="forward">forward</option>
                <option value="reverse">reverse</option>
                <option value="serpentine">serpentine</option>
              </select>
            </div>
          </div>
          {mapping.arrangement === 'serpentine' && (
            <div style={{ marginTop: 6, width: '33%' }}>
              <div style={s.fieldLabel}>Segment Size</div>
              {numberInput(mapping.segmentSize, 'all', (segmentSize) =>
                onChange({
                  segmentSize:
                    segmentSize === undefined ? undefined : Math.max(1, Math.floor(segmentSize)),
                }),
              )}
            </div>
          )}
        </>
      )}

      <div style={{ display: 'flex', gap: 14, marginTop: 8, flexWrap: 'wrap' }}>
        <label style={s.checkboxRow}>
          <input
            type="checkbox"
            checked={mapping.wrap === true}
            onChange={(e) => onChange({ wrap: e.target.checked })}
          />
          <span>wrap around the source</span>
        </label>
        {!reduce && (
          <label style={s.checkboxRow}>
            <input
              type="checkbox"
              checked={mapping.spatial === true}
              onChange={(e) => onChange({ spatial: e.target.checked })}
            />
            <span>sample by stage position</span>
          </label>
        )}
      </div>

      {/* Offset and gain are param nodes, so they can be modulated like any other. */}
      <div style={{ marginTop: 10 }}>
        <ControlGrid>
          <NodeContainer nodeId={mappingOffsetNodeId(plugin.id, mapping.id)} />
          <NodeContainer nodeId={mappingGainNodeId(plugin.id, mapping.id)} />
        </ControlGrid>
      </div>

      <TargetEditor
        targets={mapping.targets}
        fixtures={plugin.getFixtures()}
        library={plugin.getLibrary()}
        onOpenFixture={onOpenFixture}
        onChange={(targets) => onChange({ targets })}
      />

      <MappingPreviewStrip plugin={plugin} mappingId={mapping.id} />

      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
        <Button type="neutral" size="slim" iconName="content_copy" onClick={onDuplicate}>
          Duplicate
        </Button>
        <Button type="danger" size="slim" iconName="delete" onClick={onRemove}>
          Remove Mapping
        </Button>
      </div>
    </div>
  )
}
