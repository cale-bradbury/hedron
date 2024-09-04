import { uid } from 'uid'
import { useAppStore } from '../useAppStore'
import { Nodes } from '../types'

export const addSketch = (moduleId: string) => {
  const newId = uid()
  useAppStore.setState((state) => {
    const { title, config } = state.sketchModules[moduleId]
    const nodes: Nodes = {}
    const paramIds = []

    for (const paramConfig of config.params) {
      const valueType = paramConfig.valueType ?? 'number'
      const { key, title, defaultValue } = paramConfig
      const id = uid()

      paramIds.push(id)

      const base = {
        id,
        key,
        title,
        type: 'param' as const,
      }

      if (typeof defaultValue === 'number' && valueType === 'number') {
        nodes[id] = {
          ...base,
          valueType,
          value: defaultValue,
        }
      } else if (typeof defaultValue === 'boolean' && valueType === 'boolean') {
        nodes[id] = {
          ...base,
          valueType,
          value: defaultValue,
        }
      } else {
        throw new Error(
          `valueType of param ${paramConfig.key} does not match defaultValue for sketch ${moduleId}`,
        )
      }
    }

    return {
      sketches: {
        ...state.sketches,
        [newId]: {
          id: newId,
          moduleId,
          title,
          paramIds,
        },
      },
      nodes: {
        ...state.nodes,
        ...nodes,
      },
    }
  })

  return newId
}
