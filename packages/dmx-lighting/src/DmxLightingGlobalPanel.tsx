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
import { LibraryEditor } from './panel/LibraryEditor'
import { MappingList } from './panel/MappingList'
import { MixList } from './panel/MixList'
import { RigFileControls } from './panel/RigFileControls'
import { RigTable } from './panel/RigTable'
import { SourcePreview } from './panel/SourcePreview'
import { StageView } from './panel/StageView'
import { ChannelMap } from './panel/UniverseHeatmap'
import { fixtureElementId, mappingElementId, revealElement } from './panel/reveal'
import { s } from './panel/styles'
import { makeId, Mapping } from './fixtures'

export interface DmxLightingGlobalPanelProps {
  engine: HedronEngine
}

export const DmxLightingGlobalPanel: React.FC<DmxLightingGlobalPanelProps> = ({ engine }) => {
  const plugin = engine.getPlugin<DmxLightingPlugin>(DmxLightingPlugin.ID)

  const [, forceUpdate] = React.useReducer((x) => x + 1, 0)
  const [showLibrary, setShowLibrary] = React.useState(false)
  const [showChannelMap, setShowChannelMap] = React.useState(true)
  const [showStage, setShowStage] = React.useState(false)
  const [openId, setOpenId] = React.useState<string | null>(null)
  const [openMappingId, setOpenMappingId] = React.useState<string | null>(null)

  // The rig is edited through the plugin rather than the store, so poll for changes a
  // project load or rig import makes.
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

  const fixtures = plugin.getFixtures()
  const library = plugin.getLibrary()
  const sources = plugin.getSources()
  const devices = plugin.getDevices()
  const testMode = plugin.getTestMode()
  const inUse = new Set(fixtures.map((fixture) => fixture.typeId))

  const revealFixture = (fixtureId: string) => {
    setOpenId(fixtureId)
    revealElement(fixtureElementId(fixtureId))
  }

  const revealMapping = (mappingId: string) => {
    setOpenMappingId(mappingId)
    revealElement(mappingElementId(mappingId))
  }

  /** A new mapping already aimed at the fixture, opened so only the source is left to pick. */
  const addMappingFor = (fixtureId: string) => {
    const fixture = fixtures.find((f) => f.id === fixtureId)
    const mapping: Mapping = {
      id: makeId('map'),
      name: fixture?.name ?? `Mapping ${plugin.getMappings().length + 1}`,
      source: sources[0]?.id ?? '',
      kind: 'spread',
      targets: [{ fixtureId }],
    }
    plugin.setMappings([...plugin.getMappings(), mapping])
    revealMapping(mapping.id)
  }

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

        {/* ── Rig ───────────────────────────────────────────────────────── */}
        <h3 style={s.sectionHeader}>Rig</h3>
        <RigTable
          plugin={plugin}
          openId={openId}
          onOpen={setOpenId}
          onOpenMapping={revealMapping}
          onAddMapping={addMappingFor}
          onChange={forceUpdate}
        />

        {/* ── Mappings ──────────────────────────────────────────────────── */}
        <h3 style={s.sectionHeader}>Mappings</h3>
        <MappingList
          plugin={plugin}
          openId={openMappingId}
          onOpen={setOpenMappingId}
          onOpenFixture={revealFixture}
          onChange={forceUpdate}
        />

        {/* ── Channel map ───────────────────────────────────────────────── */}
        <h3 style={s.sectionHeader}>Channel Map</h3>
        <Collapsible
          title={showChannelMap ? 'Hide channel map' : 'Show channel map'}
          isOpen={showChannelMap}
          onToggle={() => setShowChannelMap((v) => !v)}
        >
          {showChannelMap && <ChannelMap plugin={plugin} onOpenFixture={revealFixture} />}
        </Collapsible>

        {/* ── Stage ─────────────────────────────────────────────────────── */}
        <h3 style={s.sectionHeader}>Stage</h3>
        <Collapsible
          title={showStage ? 'Hide stage view' : 'Show stage view'}
          isOpen={showStage}
          onToggle={() => setShowStage((v) => !v)}
        >
          {showStage && (
            <>
              <ControlGrid>
                <NodeContainer nodeId={`${plugin.id}-global-stageWidth`} />
                <NodeContainer nodeId={`${plugin.id}-global-stageDepth`} />
              </ControlGrid>
              <StageView
                plugin={plugin}
                fixtures={fixtures}
                selectedId={openId}
                onSelect={setOpenId}
                onChange={(fixtureId, changes) => {
                  plugin.setFixtures(
                    fixtures.map((f) => (f.id === fixtureId ? { ...f, ...changes } : f)),
                  )
                  forceUpdate()
                }}
              />
            </>
          )}
        </Collapsible>
        <div style={{ marginTop: 8 }}>
          <RigFileControls plugin={plugin} onImported={forceUpdate} />
        </div>

        {/* ── Mixes ─────────────────────────────────────────────────────── */}
        <h3 style={s.sectionHeader}>Mixes</h3>
        <MixList plugin={plugin} onChange={forceUpdate} />

        {/* ── Sources ───────────────────────────────────────────────────── */}
        <h3 style={s.sectionHeader}>Sources</h3>

        {sources.length === 0 && (
          <div style={s.emptyNote}>
            No sources — run a sketch that calls hedron.lighting.source() or setColor().
          </div>
        )}

        {sources.map((source) => (
          <SourcePreview key={source.id} plugin={plugin} sourceId={source.id} />
        ))}

        {/* ── Fixture library ───────────────────────────────────────────── */}
        <h3 style={s.sectionHeader}>Fixture Library</h3>
        <Collapsible
          title={`${library.length} fixture type${library.length === 1 ? '' : 's'}`}
          isOpen={showLibrary}
          onToggle={() => setShowLibrary((v) => !v)}
        >
          {showLibrary && (
            <LibraryEditor
              library={library}
              inUse={inUse}
              onChange={(next) => {
                plugin.setLibrary(next)
                forceUpdate()
              }}
              onRenameMode={(typeId, from, to) => {
                plugin.setFixtures(
                  plugin
                    .getFixtures()
                    .map((f) =>
                      f.typeId === typeId && f.modeName === from ? { ...f, modeName: to } : f,
                    ),
                )
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
        <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
          <Button type="neutral" size="slim" onClick={() => plugin.logDeviceInfo()}>
            Log Device Info
          </Button>
          <Button
            type={testMode === 'white' ? 'primary' : 'neutral'}
            size="slim"
            onClick={() => {
              plugin.setTestMode(testMode === 'white' ? 'off' : 'white')
              forceUpdate()
            }}
          >
            Test: Full White
          </Button>
          <Button
            type={testMode === 'zero' ? 'primary' : 'neutral'}
            size="slim"
            onClick={() => {
              plugin.setTestMode(testMode === 'zero' ? 'off' : 'zero')
              forceUpdate()
            }}
          >
            Test: All Zero
          </Button>
        </div>
        {testMode !== 'off' && (
          <div style={{ ...s.warning, marginTop: 8 }}>
            {testMode === 'zero'
              ? 'Every channel of every universe is held at 0'
              : 'Channels 1–20 of universe 0 are held at full'}{' '}
            — the show is overridden until you click the test again.
          </div>
        )}
      </div>
    </HedronErrorBoundary>
  )
}
