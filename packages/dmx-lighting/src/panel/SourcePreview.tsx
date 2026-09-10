import React from 'react'
import { s } from './styles'
import { DmxLightingPlugin } from '@/DmxLightingPlugin'
import { PIXEL_STRIDE } from '@/PixelSource'

/** Swatches beyond this are elided; long strips stay readable without a huge DOM. */
const MAX_PREVIEW_SWATCHES = 96

// ─── SourcePreview ────────────────────────────────────────────────────────────

interface SourcePreviewProps {
  plugin: DmxLightingPlugin
  sourceId: string
}

/** Owns its own refresh so live swatches don't re-render the whole panel. */
export function SourcePreview({ plugin, sourceId }: SourcePreviewProps) {
  const [, tick] = React.useReducer((x) => x + 1, 0)

  React.useEffect(() => {
    const timer = setInterval(tick, 100)
    return () => clearInterval(timer)
  }, [])

  const source = plugin.getSources().find((s) => s.id === sourceId)
  if (!source) return null

  const shown = Math.min(source.pixelCount, MAX_PREVIEW_SWATCHES)
  const swatches: React.ReactNode[] = []
  for (let i = 0; i < shown; i++) {
    const o = i * PIXEL_STRIDE
    const r = Math.round(source.current[o])
    const g = Math.round(source.current[o + 1])
    const b = Math.round(source.current[o + 2])
    const w = Math.round(source.current[o + 3])
    swatches.push(
      <div
        key={i}
        title={`${i}: r${r} g${g} b${b} w${w} i${Math.round(source.current[o + 4])}`}
        style={{
          flex: '1 1 6px',
          minWidth: 4,
          height: 18,
          background: `rgb(${Math.min(255, r + w)}, ${Math.min(255, g + w)}, ${Math.min(255, b + w)})`,
        }}
      />,
    )
  }

  return (
    <div style={{ marginBottom: 10 }}>
      <div style={s.sourceHeader}>
        <span>{source.id}</span>
        <span style={{ opacity: 0.5 }}>
          {source.pixelCount}px{shown < source.pixelCount ? ` (first ${shown} shown)` : ''}
        </span>
      </div>
      <div style={{ display: 'flex', gap: 1, background: '#000', padding: 1, borderRadius: 3 }}>
        {swatches}
      </div>
    </div>
  )
}
