import React from 'react'
import {
  HedronErrorBoundary,
  Button,
  Collapsible,
  ControlGrid,
  NodeContainer,
} from '@hedron-gl/ui-core'
import { HedronEngine } from '@hedron-gl/engine'
import { DmxLightingPlugin } from './DmxLightingPlugin'
import { PatchTable } from './panel/PatchTable'
import { ProfileLibrary } from './panel/ProfileLibrary'
import { SourcePreview } from './panel/SourcePreview'
import { UniverseHeatmap } from './panel/UniverseHeatmap'
import { s } from './panel/styles'

export interface DmxLightingGlobalPanelProps {
  engine: HedronEngine
}

export const DmxLightingGlobalPanel: React.FC<DmxLightingGlobalPanelProps> = ({ engine }) => {
  const plugin = engine.getPlugin<DmxLightingPlugin>(DmxLightingPlugin.ID)

  const [, forceUpdate] = React.useReducer((x) => x + 1, 0)
  const [showLibrary, setShowLibrary] = React.useState(false)
  const [showHeatmap, setShowHeatmap] = React.useState(false)

  // The patch is edited through the plugin rather than the store, so poll for changes
  // the sketch API makes (auto-patching a new fixture, for instance).
  React.useEffect(() => {
    const timer = setInterval(forceUpdate, 500)
    return () => clearInterval(timer)
  }, [])

  if (!plugin || !engine) {
    return (
      <div style={{ color: 'red', padding: 16 }}>
        DMX Lighting plugin not initialized correctly.
      </div>
    )
  }

  const profiles = plugin.getProfiles()
  const patch = plugin.getPatch()
  const sources = plugin.getSources()
  const devices = plugin.getDevices()
  const universeIds = plugin.getUniverseIds()
  const inUse = new Set(patch.map((entry) => entry.profileId))

  return (
    <HedronErrorBoundary>
      <div>
        <ControlGrid>
          <NodeContainer nodeId={`${plugin.id}-global-protocol`} />
          <NodeContainer nodeId={`${plugin.id}-global-brightness`} />
          <NodeContainer nodeId={`${plugin.id}-global-lerpSpeed`} />
          <NodeContainer nodeId={`${plugin.id}-global-lerpMode`} />
          <NodeContainer nodeId={`${plugin.id}-global-dither`} />
        </ControlGrid>

        {/* ── Patch ─────────────────────────────────────────────────────── */}
        <h3 style={s.sectionHeader}>Patch</h3>
        <PatchTable
          pluginId={plugin.id}
          patch={patch}
          profiles={profiles}
          sourceIds={sources.map((source) => source.id)}
          onChange={(next) => {
            plugin.setPatch(next)
            forceUpdate()
          }}
        />

        {/* ── Sources ───────────────────────────────────────────────────── */}
        <h3 style={s.sectionHeader}>Sources</h3>

        {sources.length === 0 && (
          <div style={s.emptyNote}>
            No sources — run a sketch that calls hedron.lighting.source() or setFixtureColor().
          </div>
        )}

        {sources.map((source) => (
          <SourcePreview key={source.id} plugin={plugin} sourceId={source.id} />
        ))}

        {/* ── Universes ─────────────────────────────────────────────────── */}
        <h3 style={s.sectionHeader}>Universes</h3>
        <Collapsible
          title={showHeatmap ? 'Hide channel map' : 'Show channel map'}
          isOpen={showHeatmap}
          onToggle={() => setShowHeatmap((v) => !v)}
        >
          {showHeatmap &&
            (universeIds.length === 0 ? (
              <div style={s.emptyNote}>Nothing patched yet.</div>
            ) : (
              universeIds.map((universe) => (
                <UniverseHeatmap key={universe} plugin={plugin} universe={universe} />
              ))
            ))}
        </Collapsible>

        {/* ── Fixture library ───────────────────────────────────────────── */}
        <h3 style={s.sectionHeader}>Fixture Library</h3>
        <Collapsible
          title={`${profiles.length} profile${profiles.length === 1 ? '' : 's'}`}
          isOpen={showLibrary}
          onToggle={() => setShowLibrary((v) => !v)}
        >
          {showLibrary && (
            <ProfileLibrary
              profiles={profiles}
              inUse={inUse}
              onChange={(next) => {
                plugin.setProfiles(next)
                forceUpdate()
              }}
            />
          )}
        </Collapsible>

        {/* ── Devices ───────────────────────────────────────────────────── */}
        <h3 style={s.sectionHeader}>DMX Devices</h3>
        <Button
          type="neutral"
          size="slim"
          onClick={() => plugin.fetchDeviceInfo().then(() => forceUpdate())}
        >
          Refresh Devices
        </Button>
        <div style={{ fontSize: '0.85em', marginTop: 8 }}>
          {devices.map((device, idx) => (
            <div
              key={idx}
              style={{ marginBottom: 10, padding: 8, background: '#1a1a1a', borderRadius: 4 }}
            >
              <div>
                <strong>{device.name}</strong>
              </div>
              {device.path && <div style={{ opacity: 0.6 }}>Path: {device.path}</div>}
              {device.driver && <div style={{ opacity: 0.6 }}>Driver: {device.driver}</div>}
              <div>Status: {device.status}</div>
              {device.timing && (
                <div style={{ opacity: 0.6, fontFamily: 'monospace', fontSize: '0.9em' }}>
                  {device.timing}
                </div>
              )}
              {device.lastSent && <div style={{ opacity: 0.6 }}>Last Sent: {device.lastSent}</div>}
              {device.lastData && (
                <details>
                  <summary>DMX Data</summary>
                  <pre style={{ fontSize: '0.8em', overflow: 'auto', maxHeight: 160 }}>
                    {device.lastData}
                  </pre>
                </details>
              )}
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          <Button type="neutral" size="slim" onClick={() => plugin.logDeviceInfo()}>
            Log Device Info
          </Button>
          <Button type="neutral" size="slim" onClick={() => plugin.testDMX()}>
            Test DMX (Full White)
          </Button>
        </div>
      </div>
    </HedronErrorBoundary>
  )
}
