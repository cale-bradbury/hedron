import React from 'react'
import { s } from './styles'
import { DmxLightingPlugin } from '@/DmxLightingPlugin'
import { placementOf, uvToWorld, worldToUv } from '@/layout'
import { FixtureInstance } from '@/fixtures'

export interface StageViewProps {
  plugin: DmxLightingPlugin
  fixtures: FixtureInstance[]
  selectedId: string | null
  onSelect: (fixtureId: string) => void
  onChange: (fixtureId: string, changes: Partial<FixtureInstance>) => void
}

const VIEW = 320

/** Top-down plan of the rig: live colours per head, click to select, drag to reposition. */
export function StageView({ plugin, fixtures, selectedId, onSelect, onChange }: StageViewProps) {
  const [, tick] = React.useReducer((x) => x + 1, 0)
  const ref = React.useRef<HTMLDivElement>(null)
  const dragging = React.useRef<string | null>(null)

  React.useEffect(() => {
    const timer = setInterval(tick, 120)
    return () => clearInterval(timer)
  }, [])

  const stage = plugin.getStage()

  const moveTo = (fixtureId: string, clientX: number, clientY: number) => {
    const box = ref.current?.getBoundingClientRect()
    if (!box) return
    const u = (clientX - box.left) / box.width
    const v = (clientY - box.top) / box.height
    const [x, z] = uvToWorld(Math.min(1, Math.max(0, u)), Math.min(1, Math.max(0, v)), stage)
    const fixture = fixtures.find((f) => f.id === fixtureId)
    if (!fixture) return
    const current = placementOf(fixture.placement)
    onChange(fixtureId, {
      placement: { ...current, position: [x, current.position[1], z] },
    })
  }

  React.useEffect(() => {
    const onMove = (event: PointerEvent) => {
      if (dragging.current) moveTo(dragging.current, event.clientX, event.clientY)
    }
    const onUp = () => {
      dragging.current = null
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
  })

  return (
    <div>
      <div
        ref={ref}
        style={{
          position: 'relative',
          width: '100%',
          height: VIEW,
          background: '#0c0c0c',
          border: '1px solid #2a2a2a',
          borderRadius: 4,
          overflow: 'hidden',
          touchAction: 'none',
        }}
      >
        {/* A centre cross, so the origin is findable while dragging. */}
        <div style={{ ...crossLine, left: '50%', top: 0, bottom: 0, width: 1 }} />
        <div style={{ ...crossLine, top: '50%', left: 0, right: 0, height: 1 }} />

        {fixtures.map((fixture) => {
          const placement = placementOf(fixture.placement)
          const [u, v] = worldToUv(placement.position[0], placement.position[2], stage)
          const heads = plugin.getFixtureHeadColors(fixture.id)
          const widthPct = Math.max(1.5, (placement.size[0] / stage.width) * 100)
          const selected = selectedId === fixture.id
          const [x, , z] = placement.position

          return (
            <div
              key={fixture.id}
              title={`${fixture.name || fixture.id} — ${x.toFixed(2)}, ${z.toFixed(2)}`}
              onPointerDown={(event) => {
                event.preventDefault()
                dragging.current = fixture.id
                onSelect(fixture.id)
              }}
              style={{
                position: 'absolute',
                left: `${u * 100}%`,
                top: `${v * 100}%`,
                width: `${widthPct}%`,
                height: 12,
                display: 'flex',
                transform: `translate(-50%, -50%) rotate(${placement.rotation[1]}deg)`,
                border: selected ? '2px solid #eee' : '1px solid #555',
                borderRadius: 2,
                overflow: 'hidden',
                cursor: 'grab',
                opacity: fixture.enabled === false ? 0.3 : 1,
              }}
            >
              {/* One segment per head, in the order heads spread along the fixture. */}
              {heads.map(([r, g, b], head) => (
                <div
                  key={head}
                  style={{
                    flex: 1,
                    background: `rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})`,
                  }}
                />
              ))}
            </div>
          )
        })}
      </div>
      <div style={s.hint}>
        {stage.width} × {stage.depth} seen from above, origin at centre. Drag to reposition; stage
        size is a global option.
      </div>
    </div>
  )
}

const crossLine: React.CSSProperties = {
  position: 'absolute',
  background: '#1e1e1e',
}
