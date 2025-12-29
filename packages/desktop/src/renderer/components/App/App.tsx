// import { Audio } from '../Audio'
import { useState } from 'react'
import { AppStoreProvider, EngineStoreProvider } from '@hedron/ui-core'
import c from './App.module.css'
import { GlobalClock } from '@components/GlobalClock/GlobalClock'
import { GlobalDialogs } from '@components/GlobalDialogs/GlobalDialogs'
import { PerformanceStats } from '@components/PerformanceStats/PerformanceStats'
import { VideoControls } from '@components/VideoControls/VideoControls'
import { Viewer } from '@components/Viewer'
import { WorkArea } from '@components/WorkArea/WorkArea'
import { SnapshotManager } from '@components/SnapshotManager'
import { appStore } from '@renderer/appStore'
import { engineStore } from '@renderer/engine'

export const App = (): JSX.Element => {
  const [showSnapshots, setShowSnapshots] = useState(false)

  return (
    <AppStoreProvider value={appStore}>
      <EngineStoreProvider value={engineStore}>
        <div className={c.wrapper}>
          <div className={c.left}>
            <div className={c.leftTop}>
              <Viewer />
              <div className={c.widgetStrip}>
                <PerformanceStats />
                <div className={c.widgetItem}>
                  <GlobalClock />
                </div>
                <div className={c.widgetItem}>
                  <VideoControls />
                </div>
                {/* <Audio /> */}
              </div>
            </div>
            <div className={c.snapshotSection}>
              <button className={c.snapshotToggle} onClick={() => setShowSnapshots(!showSnapshots)}>
                {showSnapshots ? '▼' : '▲'} Snapshots
              </button>
              {showSnapshots && (
                <div className={c.snapshotContent}>
                  <SnapshotManager />
                </div>
              )}
            </div>
          </div>
          <div className={c.right}>
            <WorkArea />
          </div>
          <GlobalDialogs />
        </div>
      </EngineStoreProvider>
    </AppStoreProvider>
  )
}
