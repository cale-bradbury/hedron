import { InputNode } from '@hedron-gl/engine'
import { getNodeInputIds, useEngineStore } from '@hedron-gl/ui-core'
import { useShallow } from 'zustand/react/shallow'

export const useInputsWithNode = (parentId: string): InputNode[] => {
  return useEngineStore(
    useShallow((state) => {
      const inputs = getNodeInputIds(state, parentId)
        .map((id) => state.nodes[id])
        .filter((node): node is InputNode => !!node)
      return inputs
    }),
  )
}
