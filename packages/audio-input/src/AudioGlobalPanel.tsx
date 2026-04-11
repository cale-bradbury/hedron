import React from 'react'
import { HedronEngine } from '@hedron-gl/engine'
import { ControlGrid, NodeContainer, Panel, PanelHeader, PanelBody } from '@hedron-gl/ui-core'
import { AudioInput } from './AudioInput'
import styles from './AudioGlobalPanel.module.css'
import { AudioDebugPanel } from './AudioDebugPanel'
import { FreqPreview } from './FreqPreview'
import { AudioInputSelector } from './AudioInputSelector'

interface AudioGlobalPanelProps {
  engine: HedronEngine
}

export const AudioGlobalPanel: React.FC<AudioGlobalPanelProps> = ({ engine }) => {
  const audioPlugin = engine.plugins[AudioInput.ID] as AudioInput | undefined
  const [, forceUpdate] = React.useReducer((x) => x + 1, 0)

  // Force re-render periodically to update manual mode status
  React.useEffect(() => {
    const interval = setInterval(() => forceUpdate(), 500)
    return () => clearInterval(interval)
  }, [])

  // If plugin is not available, show an error message
  if (!audioPlugin) {
    return <div className={styles.errorPanel}>Audio plugin not available</div>
  }

  // Get global option node IDs
  const globalOptionNodeIds = engine.getPluginGlobalOptionNodeIds(AudioInput.ID)

  // If no global option nodes are found, display a message
  if (globalOptionNodeIds.length === 0) {
    return <div className={styles.errorPanel}>No global audio settings available</div>
  }

  // Check if manual mode is active
  const storeState = engine.getStore().getState()
  const manualModeNodeId = `${AudioInput.ID}-global-manualMode`
  const isManualMode = storeState.nodeValues[manualModeNodeId] as boolean | undefined
  const manualModeSource = audioPlugin.manualModeSource

  return (
    <Panel>
      <PanelHeader>Audio Global Settings</PanelHeader>
      <PanelBody>
        {isManualMode && manualModeSource && (
          <div className={styles.manualModeNotice}>
            <strong>External Control Active</strong>
            <div>Source: {manualModeSource}</div>
          </div>
        )}
        <AudioInputSelector audioPlugin={audioPlugin} />
        <FreqPreview audioPlugin={audioPlugin} />
        <ControlGrid className={styles.controlGrid}>
          {globalOptionNodeIds.map((id: string) => (
            <NodeContainer key={id} nodeId={id} />
          ))}
        </ControlGrid>
        <AudioDebugPanel audioPlugin={audioPlugin} />
      </PanelBody>
    </Panel>
  )
}
