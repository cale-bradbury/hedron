import React from 'react'
import { Button } from '@hedron-gl/ui-core'
import { s } from './styles'
import { DmxLightingPlugin } from '@/DmxLightingPlugin'
import { buildRigFile, parseRigFile } from '@/rigFile'

export interface RigFileControlsProps {
  plugin: DmxLightingPlugin
  onImported: () => void
}

/** Saves and loads the whole rig — profiles, patch and stage — as one JSON file. */
export function RigFileControls({ plugin, onImported }: RigFileControlsProps) {
  const [message, setMessage] = React.useState<string | null>(null)
  const fileRef = React.useRef<HTMLInputElement>(null)

  const exportRig = () => {
    const rig = buildRigFile(plugin.getProfiles(), plugin.getPatch(), plugin.getStage())
    const blob = new Blob([JSON.stringify(rig, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'rig.json'
    link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
      <Button type="neutral" size="slim" onClick={exportRig}>
        Export Rig
      </Button>
      <Button type="neutral" size="slim" onClick={() => fileRef.current?.click()}>
        Import Rig
      </Button>
      <input
        ref={fileRef}
        type="file"
        accept=".json,application/json"
        style={{ display: 'none' }}
        onChange={async (e) => {
          const file = e.target.files?.[0]
          if (!file) return
          const rig = parseRigFile(await file.text())
          e.target.value = ''
          if (!rig) {
            setMessage(`Could not read ${file.name} as a rig file`)
            return
          }
          // Profiles first: the patch references them, and setPatch recompiles.
          plugin.setProfiles(rig.profiles)
          plugin.setPatch(rig.patch)
          setMessage(`Loaded ${rig.patch.length} fixtures from ${file.name}`)
          onImported()
        }}
      />
      {message && <span style={s.hint}>{message}</span>}
    </div>
  )
}
