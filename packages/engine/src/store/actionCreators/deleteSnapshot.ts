import { SetterCreator } from '@store/types'

export const createDeleteSnapshot: SetterCreator<'deleteSnapshot'> = (setState) => (snapshotId: string) => {
  setState((state) => {
    if (state.snapshots && state.snapshots[snapshotId]) {
      delete state.snapshots[snapshotId]
    }
  })
}
