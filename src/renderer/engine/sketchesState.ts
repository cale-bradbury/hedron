import { create } from 'zustand'
import { devtools } from 'zustand/middleware'
import type {} from '@redux-devtools/extension' // required for devtools typing
import { uid } from 'uid'

interface SketchState {
  id: string
  title: string
  moduleId: string
}

type Sketches = { [key: string]: SketchState }

// TODO: How to type this??
export type SketchModule = any

interface SketchConfigParam {
  key: string
  title: string
  defaultValue: number
}

interface SketchConfigParams {
  params: SketchConfigParam[]
}
export interface SketchConfig {
  title: string
  params: SketchConfigParams
}
interface SketchModuleItem {
  moduleId: string
  title: string
  config: SketchConfig
  module: SketchModule
}

export type SketchModules = { [key: string]: SketchModuleItem }

interface AppState {
  isSketchModulesReady: boolean
  sketches: Sketches
  sketchModules: SketchModules
  activeSketchId: string | null
  setActiveSketchId: (id: string) => void
  setIsSketchModulesReady: () => void
  addSketch: (moduleId: string) => string
  deleteSketch: (instanceId: string) => void
  setSketchModules: (newSketchModules: SketchModules) => void
  setSketchModuleItem: (newItem: SketchModuleItem) => void
}

export const useAppStore = create<AppState>()(
  devtools(
    // persist(
    (set) => ({
      isSketchModulesReady: false,
      activeSketchId: 'id_a',
      sketches: {},
      sketchModules: {},
      setActiveSketchId: (id) => set(() => ({ activeSketchId: id })),
      setIsSketchModulesReady: () => set(() => ({ isSketchModulesReady: true })),
      addSketch: (moduleId) => {
        const newId = uid()
        set((state) => {
          const { title } = state.sketchModules[moduleId]
          return {
            sketches: {
              ...state.sketches,
              [newId]: {
                id: newId,
                moduleId,
                title,
              },
            },
          }
        })

        return newId
      },
      deleteSketch: (instanceId) => {
        set((state) => {
          delete state.sketches[instanceId]
          return {
            sketches: { ...state.sketches },
          }
        })
      },
      setSketchModules: (newSketchModules) =>
        set(() => ({
          sketchModules: newSketchModules,
        })),
      setSketchModuleItem: (newItem: SketchModuleItem) =>
        set((state) => ({
          sketchModules: {
            ...state.sketchModules,
            [newItem.moduleId]: newItem,
          },
        })),
    }),
    //   {
    //     name: 'app-storage',
    //   },
    // ),
  ),
)

export const getSketchesState = (): SketchState[] => {
  return Object.values(useAppStore.getState().sketches)
}
