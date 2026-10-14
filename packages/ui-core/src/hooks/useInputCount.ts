import { useEngineStore } from './engineHooks'
import { getNodeInputIds } from '@utils/getNodeInputIds'

export const useInputCount = (nodeId: string): number =>
  useEngineStore((state) => getNodeInputIds(state, nodeId).length)
