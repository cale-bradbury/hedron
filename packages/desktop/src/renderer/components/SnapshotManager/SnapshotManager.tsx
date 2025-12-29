import { useState } from 'react'
import { useEngineStore } from '@hedron/ui-core'
import type { Snapshot } from '@hedron/engine'
import { createUniqueId } from '@hedron/engine'
import c from './SnapshotManager.module.css'
import { engine } from '@renderer/engine'
import { appStore } from '@renderer/appStore'
import { deleteThumbnail, saveThumbnail } from '@renderer/ipc/mainThreadTalk'

export const SnapshotManager = (): JSX.Element => {
  const [snapshotName, setSnapshotName] = useState('')
  const [tweenDuration, setTweenDuration] = useState('0')
  const snapshots = useEngineStore((state) => state.snapshots || {})
  const currentSavePath = appStore.getState().currentSavePath
  const addSnapshot = useEngineStore((state) => state.addSnapshot)
  const deleteSnapshot = useEngineStore((state) => state.deleteSnapshot)
  const restoreSnapshot = useEngineStore((state) => state.restoreSnapshot)

  const handleCaptureSnapshot = async () => {
    const name = snapshotName.trim() || `Snapshot ${Object.keys(snapshots).length + 1}`

    // Capture the canvas as a data URL
    const dataUrl = engine.captureFrame()
    if (!dataUrl) {
      alert('Failed to capture frame')
      return
    }

    // Generate the snapshot ID first
    const snapshotId = createUniqueId()

    // Save thumbnail file with the correct ID
    const thumbnailPath = await saveThumbnail(currentSavePath, snapshotId, dataUrl)

    // Add snapshot to store with the pre-generated ID
    addSnapshot(name, thumbnailPath || undefined, snapshotId)

    setSnapshotName('')
  }

  const handleDeleteSnapshot = async (snapshotId: string) => {
    const snapshot = snapshots[snapshotId]
    if (snapshot?.thumbnailPath) {
      await deleteThumbnail(currentSavePath, snapshot.thumbnailPath)
    }
    deleteSnapshot(snapshotId)
  }

  const handleRestoreSnapshot = (snapshotId: string) => {
    const duration = parseFloat(tweenDuration) || 0
    restoreSnapshot(snapshotId, duration)
  }

  const getThumbnailUrl = (thumbnailPath?: string) => {
    if (!thumbnailPath || !currentSavePath) return null

    const projectDir = currentSavePath.substring(0, currentSavePath.lastIndexOf('/'))
    const fullPath = `${projectDir}/${thumbnailPath}`

    return `hedron-file://${fullPath}`
  }

  const snapshotList = (Object.values(snapshots) as Snapshot[]).sort(
    (a, b) => b.timestamp - a.timestamp,
  )

  return (
    <div className={c.container}>
      <div className={c.header}>
        <h3 className={c.title}>Snapshots</h3>
        <div className={c.captureSection}>
          <input
            type="text"
            value={snapshotName}
            onChange={(e) => setSnapshotName(e.target.value)}
            placeholder="Snapshot name"
            className={c.nameInput}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                handleCaptureSnapshot()
              }
            }}
          />
          <button onClick={handleCaptureSnapshot} className={c.captureButton}>
            Capture
          </button>
          <div className={c.tweenSection}>
            <label className={c.tweenLabel}>Tween (s):</label>
            <input
              type="number"
              value={tweenDuration}
              onChange={(e) => setTweenDuration(e.target.value)}
              className={c.tweenInput}
              min="0"
              step="0.1"
              placeholder="0"
            />
          </div>
        </div>
      </div>

      <div className={c.grid}>
        {snapshotList.map((snapshot) => {
          const thumbnailUrl = getThumbnailUrl(snapshot.thumbnailPath)
          return (
            <div key={snapshot.id} className={c.snapshotCard}>
              <div
                className={c.thumbnail}
                onClick={() => handleRestoreSnapshot(snapshot.id)}
                style={{
                  backgroundImage: thumbnailUrl ? `url("${thumbnailUrl}")` : undefined,
                  backgroundColor: thumbnailUrl ? undefined : '#333',
                }}
              >
                {!thumbnailUrl && <div className={c.noThumbnail}>No Preview</div>}
              </div>
              <div className={c.info}>
                <div className={c.name}>{snapshot.name}</div>
                <div className={c.timestamp}>{new Date(snapshot.timestamp).toLocaleString()}</div>
              </div>
              <button
                onClick={() => handleDeleteSnapshot(snapshot.id)}
                className={c.deleteButton}
                aria-label="Delete snapshot"
              >
                ×
              </button>
            </div>
          )
        })}
      </div>

      {snapshotList.length === 0 && (
        <div className={c.empty}>
          No snapshots yet. Capture one to save the current parameter state.
        </div>
      )}
    </div>
  )
}
