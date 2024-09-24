import { create, StoreApi } from 'zustand'
import { devtools, subscribeWithSelector } from 'zustand/middleware'
import { immer } from 'zustand/middleware/immer'
import type {} from '@redux-devtools/extension' // required for devtools typing
import { DialogId } from 'src/engine/store/types'

export interface AppState {
  activeSketchId: string | null
  sketchesDir: string | null
  globalDialogId: DialogId | null
  setActiveSketchId: (id: string) => void
  setSketchesDir: (dir: string) => void
  setGlobalDialogId: (id: DialogId | null) => void
}

export type SetState = StoreApi<AppState>['setState']

// Matches immer middleware and devtools
export type CustomSetState = (
  cb: (draft: AppState) => void,
  replace?: boolean,
  name?: string,
) => void

export type SetterCreator<K extends keyof AppState> = (setState: CustomSetState) => AppState[K]

export const useAppStore = create<AppState>()(
  subscribeWithSelector(
    devtools(
      immer((set) => ({
        activeSketchId: null,
        sketchesDir: null,
        globalDialogId: null,
        setActiveSketchId: (id: string) => {
          set((state) => {
            state.activeSketchId = id
          })
        },
        setSketchesDir: (dir: string) => {
          set((state) => {
            state.sketchesDir = dir
          })
        },
        setGlobalDialogId: (id: DialogId | null) => {
          set((state) => {
            state.globalDialogId = id
          })
        },
      })),
    ),
  ),
)
