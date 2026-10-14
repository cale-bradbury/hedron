import type { EngineState, ParamNode } from '@hedron-gl/engine'

/** A node's input ids, including those on its input proxy (e.g. a color's blend) */
export const getNodeInputIds = (state: Pick<EngineState, 'nodes'>, nodeId: string): string[] => {
  const node = state.nodes[nodeId]
  const proxyId = (node as ParamNode | undefined)?.inputProxyId
  return [
    ...(node?.childGroups.inputNodeIds ?? []),
    ...((proxyId && state.nodes[proxyId]?.childGroups.inputNodeIds) || []),
  ]
}
