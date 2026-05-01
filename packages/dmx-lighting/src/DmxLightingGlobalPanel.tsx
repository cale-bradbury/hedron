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

  const colors = plugin['colors']
  const devices = plugin['devices']

  // Force update only when needed (on user interaction)
  const [, forceUpdate] = React.useReducer((x) => x + 1, 0)

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
            <option value="usb">USB DMX</option>
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
              <div>
                <b>{color.id}</b>
                {' - '}
                Channels: {color.channelMap.join(', ')}
                {color.podCount && color.podCount > 1 && ` (${color.podCount} pods)`}
              </div>
              <div style={{ fontSize: '0.9em', marginLeft: 16 }}>
                {Object.entries(color.channels).map(([channel, value]) => (
                  <span key={channel} style={{ marginRight: 8 }}>
                    {channel}: {Math.round(value || 0)}
                  </span>
                ))}
              </div>
              <input
                type="text"
                value={color.target}
                placeholder="DMX Start Address (e.g., 1)"
                onChange={(e) => {
                  plugin.setFixtureTarget(color.id, e.target.value)
                  forceUpdate()
                }}
                style={{ marginLeft: 16, marginTop: 4 }}
              />
            </li>
          ))}
        </ul>
        <h3>DMX Devices</h3>
        <button onClick={() => plugin.fetchDeviceInfo().then(() => forceUpdate())}>
          Refresh Devices
        </button>
        <div style={{ fontSize: '0.9em', marginTop: 8 }}>
          {devices.map((device, idx) => (
            <div key={idx} style={{ marginBottom: 12, padding: 8, background: '#222' }}>
              <div>
                <strong>{device.name}</strong>
              </div>
              <div>Path: {device.path}</div>
              <div>Driver: {device.driver}</div>
              <div>Status: {device.status}</div>
              {device.lastSent && <div>Last Sent: {device.lastSent}</div>}
              {device.lastData && (
                <details>
                  <summary>DMX Data</summary>
                  <pre style={{ fontSize: '0.8em', overflow: 'auto', maxHeight: 200 }}>
                    {device.lastData}
                  </pre>
                </details>
              )}
            </div>
          ))}
        </div>
        <button onClick={() => plugin.logDeviceInfo()}>Log Device Info</button>
        <button onClick={() => plugin.testDMX()} style={{ marginLeft: 8 }}>
          Test DMX (Full White)
        </button>
      </div>
    </HedronErrorBoundary>
  )
}
