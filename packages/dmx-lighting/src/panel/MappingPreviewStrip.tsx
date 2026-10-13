import React from 'react'
import { s } from './styles'
import { DmxLightingPlugin } from '@/DmxLightingPlugin'
import { findType, headLabel } from '@/fixtures'
import { PIXEL_STRIDE } from '@/PixelSource'

/** Source swatches beyond this are elided; long strips stay readable without a huge DOM. */
const MAX_SWATCHES = 96

export interface MappingPreviewStripProps {
  plugin: DmxLightingPlugin
  mappingId: string
}

const rgb = (r: number, g: number, b: number) =>
  `rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})`

/** The source with the pixels this mapping reads picked out, then the colour each head receives. */
export function MappingPreviewStrip({ plugin, mappingId }: MappingPreviewStripProps) {
  const [, tick] = React.useReducer((x) => x + 1, 0)

  React.useEffect(() => {
    const timer = setInterval(tick, 100)
    return () => clearInterval(timer)
  }, [])

  const preview = plugin.getMappingPreview(mappingId)
  if (!preview) {
    return (
      <div style={{ ...s.emptyNote, marginTop: 10 }}>
        Nothing to preview — give the mapping a source and at least one target head.
      </div>
    )
  }

  const { source, used, heads } = preview
  const usedSet = new Set(used)
  const shown = Math.min(source.pixelCount, MAX_SWATCHES)
  const fixtures = plugin.getFixtures()
  const library = plugin.getLibrary()

  const sourceSwatches: React.ReactNode[] = []
  for (let i = 0; i < shown; i++) {
    const o = i * PIXEL_STRIDE
    const w = source.current[o + 3]
    const read = usedSet.has(i)
    sourceSwatches.push(
      <div
        key={i}
        title={`${source.id}[${i}]${read ? ' — read by this mapping' : ''}`}
        style={{
          flex: '1 1 6px',
          minWidth: 3,
          height: 16,
          background: rgb(
            Math.min(255, source.current[o] + w),
            Math.min(255, source.current[o + 1] + w),
            Math.min(255, source.current[o + 2] + w),
          ),
          opacity: read ? 1 : 0.25,
          borderBottom: read ? '2px solid #eee' : '2px solid transparent',
        }}
      />,
    )
  }

  const range =
    used.length === 0
      ? 'by stage position'
      : used.length === 1
        ? `pixel ${used[0]}`
        : `${used.length} pixels, ${used[0]}–${used[used.length - 1]}`

  return (
    <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid #222' }}>
      <div style={s.sourceHeader}>
        <span>
          {source.id} · {source.pixelCount}px
        </span>
        <span style={{ opacity: 0.6 }}>reads {range}</span>
      </div>
      <div style={{ display: 'flex', gap: 1, background: '#000', padding: 1, borderRadius: 3 }}>
        {sourceSwatches}
      </div>

      <div style={{ ...s.sourceHeader, marginTop: 6 }}>
        <span>
          → {heads.length} head{heads.length === 1 ? '' : 's'}
        </span>
        <span style={{ opacity: 0.6 }}>after gain and brightness</span>
      </div>
      <div style={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
        {heads.map(({ fixtureId, head, colour }, i) => {
          const fixture = fixtures.find((f) => f.id === fixtureId)
          const type = fixture ? findType(library, fixture.typeId) : undefined
          return (
            <div
              key={i}
              title={`${fixture?.name ?? fixtureId} · ${headLabel(type, head)}`}
              style={{
                width: 14,
                height: 14,
                borderRadius: 2,
                border: '1px solid #333',
                background: rgb(...colour),
              }}
            />
          )
        })}
      </div>
    </div>
  )
}
