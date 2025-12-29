import { SetterCreator } from '@store/types'
import { createUniqueId } from '@utils/createUniqueId'

export const createAddSnapshot: SetterCreator<'addSnapshot'> =
  (setState) => (name: string, thumbnailPath?: string, snapshotId?: string) => {
    const id = snapshotId || createUniqueId()

    setState((state) => {
      const snapshot = {
        id,
        name,
        timestamp: Date.now(),
        nodeValues: { ...state.nodeValues }, // Deep copy of current node values
        thumbnailPath,
      }

      if (!state.snapshots) {
        state.snapshots = {}
      }

      state.snapshots[id] = snapshot
    })

    return id
  }
