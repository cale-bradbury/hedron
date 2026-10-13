import React from 'react'
import { Button, ControlGrid, NodeContainer } from '@hedron-gl/ui-core'
import { s } from './styles'
import { DMX_UNIVERSE_SIZE } from '@/address'
import { DmxLightingPlugin } from '@/DmxLightingPlugin'
import { ChannelOverride, overrideBytes, overrideNodeId } from '@/fixtures'
import { ChannelInfo, ChannelUse, channelKey, formatAddress } from '@/rigTools'

const COLUMNS = 32
const ROWS = DMX_UNIVERSE_SIZE / COLUMNS
const CELL_HEIGHT = 11
const WARN = '#e8c400'
const HELD_GLOW = 'inset 0 0 3px 1px rgba(190, 120, 255, 1)'
/** Outline colours for the fixtures on a hovered channel, so overlapping ones stay distinct. */
const OUTLINES = ['#ffffff', '#5fd3ff', '#ffb35f', '#ff6fa8']

interface ChannelRef {
  universe: number
  channel: number
}

export interface ChannelMapProps {
  plugin: DmxLightingPlugin
  onOpenFixture: (fixtureId: string) => void
}

/**
 * Every channel of every live universe, coloured by value. Hover names what sits on a
 * channel and outlines every fixture sharing it; click to hold a channel at a value.
 */
export function ChannelMap({ plugin, onOpenFixture }: ChannelMapProps) {
  const [, tick] = React.useReducer((x) => x + 1, 0)
  const [hover, setHover] = React.useState<ChannelRef | null>(null)
  const [selected, setSelected] = React.useState<ChannelRef | null>(null)

  React.useEffect(() => {
    const timer = setInterval(tick, 120)
    return () => clearInterval(timer)
  }, [])

  const info = plugin.getChannelInfo()
  const overrides = plugin.getOverrides()
  // Both bytes of a 16-bit pair show as held.
  const held = new Set(
    overrides.flatMap((o) => overrideBytes(o, 0).map((b) => channelKey(b.universe, b.channel))),
  )
  const universeIds = [
    ...new Set([
      ...plugin.getUniverseIds(),
      ...plugin.getFixtures().map((f) => f.address.universe),
      ...overrides.map((o) => o.universe),
    ]),
  ].sort((a, b) => a - b)

  const hoveredFixtures = hover
    ? (info.get(channelKey(hover.universe, hover.channel))?.uses.map((u) => u.fixtureId) ?? [])
    : []

  return (
    <div>
      <div style={{ ...s.hint, display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 6 }}>
        <Legend colour="rgb(60, 200, 120)" label="patched" />
        <Legend colour="rgb(90, 90, 90)" shadow={HELD_GLOW} label="held by override" />
        <Legend colour="#333" shadow={`inset 0 0 0 1px ${WARN}`} label="several mappings" />
        <Legend colour="rgb(150, 150, 150)" label="unpatched" />
      </div>

      {universeIds.map((universe) => (
        <UniverseGrid
          key={universe}
          universe={universe}
          bytes={plugin.getUniverseSnapshot(universe)}
          info={info}
          held={held}
          hover={hover}
          selected={selected}
          hoveredFixtures={hoveredFixtures}
          onHover={setHover}
          onSelect={(ref) =>
            setSelected(
              selected && selected.universe === ref.universe && selected.channel === ref.channel
                ? null
                : ref,
            )
          }
        />
      ))}

      {selected && (
        <ChannelDetail
          key={`${selected.universe}:${selected.channel}`}
          plugin={plugin}
          channel={selected}
          value={plugin.getUniverseSnapshot(selected.universe)[selected.channel - 1]}
          info={info.get(channelKey(selected.universe, selected.channel))}
          held={plugin.getOverrideAt(selected.universe, selected.channel)}
          onOpenFixture={onOpenFixture}
          onSelect={setSelected}
          onClose={() => setSelected(null)}
          onChange={tick}
        />
      )}
    </div>
  )
}

function Legend({ colour, shadow, label }: { colour: string; shadow?: string; label: string }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
      <span
        style={{
          width: 10,
          height: 8,
          background: colour,
          boxShadow: shadow,
          display: 'inline-block',
        }}
      />
      {label}
    </span>
  )
}

/**
 * The outline of a set of channels as SVG path data, in cell units. Only edges with no
 * neighbour in the set are drawn, so a run that wraps a row becomes two shapes and a long
 * one becomes a single stepped outline.
 */
function perimeterPath(channels: Set<number>): string {
  const has = (column: number, row: number) =>
    column >= 0 &&
    column < COLUMNS &&
    row >= 0 &&
    row < ROWS &&
    channels.has(row * COLUMNS + column + 1)

  let d = ''
  for (const channel of channels) {
    const c = (channel - 1) % COLUMNS
    const r = Math.floor((channel - 1) / COLUMNS)
    if (!has(c, r - 1)) d += `M${c} ${r}h1`
    if (!has(c, r + 1)) d += `M${c} ${r + 1}h1`
    if (!has(c - 1, r)) d += `M${c} ${r}v1`
    if (!has(c + 1, r)) d += `M${c + 1} ${r}v1`
  }
  return d
}

interface UniverseGridProps {
  universe: number
  bytes: Uint8Array
  info: Map<number, ChannelInfo>
  held: Set<number>
  hover: ChannelRef | null
  selected: ChannelRef | null
  hoveredFixtures: string[]
  onHover: (ref: ChannelRef | null) => void
  onSelect: (ref: ChannelRef) => void
}

function UniverseGrid({
  universe,
  bytes,
  info,
  held,
  hover,
  selected,
  hoveredFixtures,
  onHover,
  onSelect,
}: UniverseGridProps) {
  const cells: React.ReactNode[] = []
  const outlined = new Map(hoveredFixtures.map((id) => [id, new Set<number>()]))
  let active = 0

  for (let channel = 1; channel <= DMX_UNIVERSE_SIZE; channel++) {
    const value = bytes[channel - 1]
    if (value > 0) active++
    const key = channelKey(universe, channel)
    const claimed = info.get(key)
    const level = value / 255

    for (const use of claimed?.uses ?? []) outlined.get(use.fixtureId)?.add(channel)

    // Unpatched channels stay grey so a stray value is obvious against the rig.
    const background = claimed
      ? `rgb(${30 + level * 30}, ${40 + level * 160}, ${50 + level * 70})`
      : `rgb(${60 + level * 90}, ${60 + level * 90}, ${60 + level * 90})`
    const shadows = [
      held.has(key) ? HELD_GLOW : '',
      claimed && claimed.drivers > 1 ? `inset 0 0 0 1px ${WARN}` : '',
    ].filter(Boolean)
    const isSelected = selected?.universe === universe && selected.channel === channel

    cells.push(
      <div
        key={channel}
        onMouseEnter={() => onHover({ universe, channel })}
        onClick={() => onSelect({ universe, channel })}
        style={{
          background,
          cursor: 'pointer',
          boxShadow: shadows.length > 0 ? shadows.join(', ') : undefined,
          outline: isSelected ? '2px solid #fff' : undefined,
          outlineOffset: -1,
        }}
      />,
    )
  }

  const hovering = hover?.universe === universe ? hover.channel : null

  return (
    <div style={{ marginBottom: 10 }}>
      <div style={s.sourceHeader}>
        <span>universe {universe}</span>
        <span style={{ opacity: 0.5 }}>{active} channels above zero</span>
      </div>
      <div style={{ position: 'relative' }} onMouseLeave={() => onHover(null)}>
        <div style={heatmapGrid}>{cells}</div>

        {/* Lines sit on the gap centres: 2px of padding less half a gap, a cell plus gap per unit. */}
        {hovering !== null && (
          <svg
            viewBox={`0 0 ${COLUMNS} ${ROWS}`}
            preserveAspectRatio="none"
            style={{
              position: 'absolute',
              left: 1.5,
              top: 1.5,
              width: 'calc(100% - 3px)',
              height: ROWS * (CELL_HEIGHT + 1),
              pointerEvents: 'none',
              overflow: 'visible',
            }}
          >
            {[...outlined.entries()].map(([fixtureId, channels], i) => (
              <path
                key={fixtureId}
                d={perimeterPath(channels)}
                fill="none"
                stroke={OUTLINES[i % OUTLINES.length]}
                strokeWidth={1.5}
                strokeLinecap="square"
                vectorEffect="non-scaling-stroke"
              />
            ))}
          </svg>
        )}

        {hovering !== null && (
          <ChannelTooltip
            universe={universe}
            channel={hovering}
            value={bytes[hovering - 1]}
            info={info.get(channelKey(universe, hovering))}
            held={held.has(channelKey(universe, hovering))}
          />
        )}
      </div>
    </div>
  )
}

/** What drives a channel for one fixture: the mappings, or the default it rests at. */
function drivenSummary(use: ChannelUse): string {
  return use.drivenBy.length > 0
    ? `← ${use.drivenBy.join(', ')}`
    : `not mapped, sends ${use.defaultValue}`
}

interface ChannelTooltipProps {
  universe: number
  channel: number
  value: number
  info: ChannelInfo | undefined
  held: boolean
}

/**
 * Sits above the hovered row so the cursor never covers it, dropping below only in the top
 * rows where above would be clipped, with room left for the pointer.
 */
function ChannelTooltip({ universe, channel, value, info, held }: ChannelTooltipProps) {
  const column = (channel - 1) % COLUMNS
  const row = Math.floor((channel - 1) / COLUMNS)
  const rowTop = 2 + row * (CELL_HEIGHT + 1)
  const above = row >= 4

  return (
    <div
      style={{
        position: 'absolute',
        ...(above
          ? { bottom: `calc(100% - ${rowTop - 6}px)` }
          : { top: rowTop + CELL_HEIGHT + 20 }),
        ...(column >= COLUMNS / 2
          ? { right: `${((COLUMNS - column - 1) / COLUMNS) * 100}%` }
          : { left: `${(column / COLUMNS) * 100}%` }),
        zIndex: 10,
        pointerEvents: 'none',
        maxWidth: 280,
        minWidth: 140,
        background: '#141414',
        border: '1px solid #3a3a3a',
        borderRadius: 4,
        padding: '6px 8px',
        fontSize: '0.74em',
        lineHeight: 1.4,
        boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
      }}
    >
      <div style={{ fontFamily: 'monospace', color: '#fff' }}>
        {formatAddress({ universe, channel })} = {value}
      </div>

      {!info && <div style={{ color: '#888' }}>unpatched</div>}

      {info?.uses.map((use) => (
        <div key={`${use.fixtureId}-${use.index}`} style={{ marginTop: 4 }}>
          <div style={{ color: '#fff' }}>
            {use.fixtureName} - {use.label}
          </div>
          <div style={{ color: '#888' }}>{drivenSummary(use)}</div>
        </div>
      ))}

      {info && info.drivers > 1 && (
        <div style={{ color: WARN, marginTop: 4 }}>
          {info.drivers} mappings land here; highest wins
        </div>
      )}
      {held && <div style={{ color: 'rgb(190, 150, 255)', marginTop: 4 }}>held by override</div>}
    </div>
  )
}

interface ChannelDetailProps {
  plugin: DmxLightingPlugin
  channel: ChannelRef
  value: number
  info: ChannelInfo | undefined
  held: ChannelOverride | undefined
  onOpenFixture: (fixtureId: string) => void
  onSelect: (ref: ChannelRef) => void
  onClose: () => void
  onChange: () => void
}

/** Everything about the clicked channel, and the override that holds it. */
function ChannelDetail({
  plugin,
  channel,
  value,
  info,
  held,
  onOpenFixture,
  onSelect,
  onClose,
  onChange,
}: ChannelDetailProps) {
  const { universe, channel: ch } = channel
  const nextValue = plugin.getUniverseSnapshot(universe)[ch] ?? 0
  // A fixture's own 16-bit channel suggests holding it as a pair.
  const [wide, setWide] = React.useState(info?.uses.some((u) => u.part === 'coarse') ?? false)
  // A pair is held as 0–1, so an LFO or fader spans it without knowing about bytes.
  const pairLevel = () => String(Math.round(((value * 256 + nextValue) / 65535) * 10000) / 10000)
  const [draft, setDraft] = React.useState(wide ? pairLevel() : String(value))
  const fineOf = info?.uses.some((u) => u.part === 'fine') && ch > 1 ? ch - 1 : undefined

  return (
    <div style={{ ...s.mappingWrap, marginTop: 4 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <strong style={{ fontFamily: 'monospace', fontSize: '0.85em' }}>
          Channel {universe}:{ch} — {value}
        </strong>
        <button style={s.iconButton} onClick={onClose}>
          ✕
        </button>
      </div>

      {!info && <div style={{ ...s.hint, marginTop: 6 }}>No fixture sits on this channel.</div>}

      {info?.uses.map((use) => (
        <div
          key={`${use.fixtureId}-${use.index}`}
          style={{ marginTop: 8, fontSize: '0.8em', borderTop: '1px solid #222', paddingTop: 6 }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 6 }}>
            <span>
              <strong>{use.fixtureName}</strong>
              <span style={{ opacity: 0.5 }}>
                {' '}
                {use.typeName} {use.modeName} @{formatAddress(use.start)}
              </span>
            </span>
            <button style={s.iconButton} onClick={() => onOpenFixture(use.fixtureId)}>
              open
            </button>
          </div>
          <div style={{ opacity: 0.8 }}>
            ch {use.index}: {use.label} · {drivenSummary(use)}
          </div>
          {use.description && <div style={{ opacity: 0.5 }}>{use.description}</div>}
        </div>
      ))}

      {info && info.drivers > 1 && (
        <div style={{ ...s.warning, marginTop: 8 }}>
          {info.drivers} mapping writes land on this channel; the highest value wins each frame.
        </div>
      )}

      <div style={{ marginTop: 10, paddingTop: 8, borderTop: '1px solid #222' }}>
        <div style={s.fieldLabel}>Override</div>
        {held ? (
          <>
            {held.bits === 16 && (
              <div style={{ ...s.hint, marginBottom: 4 }}>
                16-bit pair {universe}:{held.channel}–{held.channel + 1}, 0–1 across 65536 steps
                {held.channel !== ch ? '; this is its fine byte' : ''}.
              </div>
            )}
            <ControlGrid>
              <NodeContainer nodeId={overrideNodeId(plugin.id, held)} />
            </ControlGrid>
            {held.bits === 16 && <PairReadout level={plugin.getOverrideLevel(held)} held={held} />}
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 6 }}>
              <Button
                type="neutral"
                size="slim"
                onClick={() => {
                  plugin.releaseOverride(universe, ch)
                  onChange()
                }}
              >
                Release
              </Button>
              <span style={s.hint}>
                The value wins over any mapping, and is a param node, so it can be put on MIDI or an
                LFO.
              </span>
            </div>
          </>
        ) : (
          <>
            {fineOf !== undefined && (
              <div style={{ ...s.hint, marginBottom: 6 }}>
                This is the fine byte of a 16-bit pair.{' '}
                <button
                  style={s.iconButton}
                  onClick={() => onSelect({ universe, channel: fineOf })}
                >
                  hold the pair from ch {fineOf}
                </button>
              </div>
            )}
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
              <input
                type="number"
                min={0}
                max={wide ? 1 : 255}
                step={wide ? 0.001 : 1}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                style={{ ...s.numInput, width: 72 }}
              />
              <Button
                type="secondary"
                size="slim"
                onClick={() => {
                  plugin.setOverride(universe, ch, parseFloat(draft) || 0, wide ? 16 : undefined)
                  onChange()
                }}
              >
                Hold at value
              </Button>
              {ch < DMX_UNIVERSE_SIZE && (
                <label style={s.checkboxRow}>
                  <input
                    type="checkbox"
                    checked={wide}
                    onChange={(e) => {
                      setWide(e.target.checked)
                      setDraft(e.target.checked ? pairLevel() : String(value))
                    }}
                  />
                  <span>16-bit, with ch {ch + 1} as the fine byte</span>
                </label>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

/**
 * The live pair value at full precision with the bytes it becomes, since the slider's own
 * readout rounds to two decimals and hides the fine byte's movement.
 */
function PairReadout({ level, held }: { level: number; held: ChannelOverride }) {
  const [coarse, fine] = overrideBytes(held, level)
  // An LFO whose min, max or amplitude reach past 0–1 flat-lines here, which looks like a wall.
  const clipped = level < 0 || level > 1
  return (
    <div style={{ ...s.hint, fontFamily: 'monospace', marginTop: 4 }}>
      {level.toFixed(6)} → {coarse.value} / {fine.value} ({coarse.value * 256 + fine.value} of
      65535)
      {clipped && (
        <div style={{ color: WARN, opacity: 1 }}>
          clipped to {level < 0 ? 0 : 1}: whatever drives this param goes past 0–1
        </div>
      )}
    </div>
  )
}

const heatmapGrid: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: `repeat(${COLUMNS}, 1fr)`,
  gap: 1,
  gridAutoRows: CELL_HEIGHT,
  background: '#000',
  padding: 2,
  borderRadius: 3,
}
