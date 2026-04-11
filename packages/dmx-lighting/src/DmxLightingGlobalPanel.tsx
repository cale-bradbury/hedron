import React from 'react'
import { HedronErrorBoundary } from '@hedron-gl/ui-core'
import { HedronEngine } from '@hedron-gl/engine'
import { DmxLightingPlugin } from './DmxLightingPlugin'

export interface DmxLightingGlobalPanelProps {
  engine: HedronEngine
  plugin: DmxLightingPlugin
}

export const DmxLightingGlobalPanel: React.FC<DmxLightingGlobalPanelProps> = ({
  engine,
  plugin,
}) => {
  // Defensive: if plugin or engine is missing, show fallback
  if (!plugin || !engine) {
    return (
      <div style={{ color: 'red', padding: 16 }}>
        DMX Lighting plugin not initialized correctly (engine missing).
      </div>
    )
  }

  const store = engine.getStore()
  const [nodeValues, setNodeValues] = React.useState(store.getState().nodeValues)
  React.useEffect(() => {
    const unsub = store.subscribe(
      (state) => state.nodeValues,
      (newNodeValues) => setNodeValues(newNodeValues),
    )
    return unsub
  }, [store])

  const protocol = nodeValues[`${plugin.id}-global-protocol`] || 'artnet'
  const brightness = nodeValues[`${plugin.id}-global-brightness`] ?? 1
  const lerpSpeed = nodeValues[`${plugin.id}-global-lerpSpeed`] ?? 0.2
  const lerpMode = nodeValues[`${plugin.id}-global-lerpMode`] || 'linear-rgb'

  const [_, forceUpdate] = React.useReducer((x) => x + 1, 0)
  React.useEffect(() => {
    const interval = setInterval(forceUpdate, 500)
    return () => clearInterval(interval)
  }, [])
  const colors = plugin['colors']
  const devices = plugin['devices']

  return (
    <HedronErrorBoundary>
      <div>
        <h2>DMX Lighting</h2>
        <div>
          <label>Protocol: </label>
          <select
            value={protocol}
            onChange={(e) =>
              store.setState((state) => {
                state.nodeValues[`${plugin.id}-global-protocol`] = e.target.value
                return state
              })
            }
          >
            <option value="artnet">ArtNet</option>
            <option value="sacn">sACN</option>
          </select>
        </div>
        <div>
          <label>Brightness: </label>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={brightness}
            onChange={(e) =>
              store.setState((state) => {
                state.nodeValues[`${plugin.id}-global-brightness`] = Number(e.target.value)
                return state
              })
            }
          />
          {brightness}
        </div>
        <div>
          <label>Lerp Speed: </label>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={lerpSpeed}
            onChange={(e) =>
              store.setState((state) => {
                state.nodeValues[`${plugin.id}-global-lerpSpeed`] = Number(e.target.value)
                return state
              })
            }
          />
          {lerpSpeed}
        </div>
        <div>
          <label>Lerp Mode: </label>
          <select
            value={lerpMode}
            onChange={(e) =>
              store.setState((state) => {
                state.nodeValues[`${plugin.id}-global-lerpMode`] = e.target.value
                return state
              })
            }
          >
            <option value="linear-rgb">Linear RGB</option>
            <option value="curved-hsb">Curved HSB</option>
          </select>
        </div>
        <h3>Fixture Colors</h3>
        <ul>
          {Object.values(colors).map((color) => (
            <li key={color.id}>
              <b>{color.id}</b>: [
              {color.value.map((v, i) => (
                <span key={i}>
                  {v}
                  {i < 2 ? ', ' : ''}
                </span>
              ))}
              ]
              <input
                type="text"
                value={color.target}
                placeholder="DMX Address"
                onChange={(e) => {
                  color.target = e.target.value
                  forceUpdate()
                }}
              />
            </li>
          ))}
        </ul>
        <h3>DMX Devices</h3>
        <pre>{JSON.stringify(devices, null, 2)}</pre>
        <button onClick={() => plugin.logDeviceInfo()}>Log Device Info</button>
      </div>
    </HedronErrorBoundary>
  )
}
