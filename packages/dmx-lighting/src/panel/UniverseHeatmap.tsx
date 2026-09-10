import React from 'react'
import { s } from './styles'
import { DMX_UNIVERSE_SIZE } from '@/address'
import { DmxLightingPlugin } from '@/DmxLightingPlugin'
import { channelOwners } from '@/patchTools'

export interface UniverseHeatmapProps {
  plugin: DmxLightingPlugin
  universe: number
}

/** Live value of every channel in a universe, with the owning fixture on hover. */
export function UniverseHeatmap({ plugin, universe }: UniverseHeatmapProps) {
  const [, tick] = React.useReducer((x) => x + 1, 0)

  React.useEffect(() => {
    const timer = setInterval(tick, 120)
    return () => clearInterval(timer)
  }, [])

  const bytes = plugin.getUniverseSnapshot(universe)
  const owners = channelOwners(plugin.getPatch(), plugin.getProfiles())

  const cells: React.ReactNode[] = []
  let active = 0

  for (let channel = 1; channel <= DMX_UNIVERSE_SIZE; channel++) {
    const value = bytes[channel - 1]
    if (value > 0) active++
    const claimed = owners.get(universe * (DMX_UNIVERSE_SIZE + 1) + channel)
    const clash = claimed !== undefined && claimed.length > 1

    // Unpatched channels stay grey so a stray value is obvious against the patch.
    const level = value / 255
    const background = clash
      ? `rgb(${140 + level * 115}, ${40 + level * 40}, 40)`
      : claimed
        ? `rgb(${30 + level * 60}, ${40 + level * 215}, ${50 + level * 90})`
        : `rgb(${60 + level * 195}, ${60 + level * 195}, ${60 + level * 195})`

    cells.push(
      <div
        key={channel}
        title={`${universe}:${channel} = ${value}${
          claimed ? ` — ${claimed.map((p) => p.name).join(', ')}` : ' — unpatched'
        }`}
        style={{ background }}
      />,
    )
  }

  return (
    <div style={{ marginBottom: 10 }}>
      <div style={s.sourceHeader}>
        <span>universe {universe}</span>
        <span style={{ opacity: 0.5 }}>{active} channels above zero</span>
      </div>
      <div style={heatmapGrid}>{cells}</div>
    </div>
  )
}

const heatmapGrid: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(32, 1fr)',
  gap: 1,
  gridAutoRows: 7,
  background: '#000',
  padding: 2,
  borderRadius: 3,
}
