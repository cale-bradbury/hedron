import { SetterCreator } from '../engineStore'

export const createDeleteSketch: SetterCreator<'deleteSketch'> =
  (setState) => (instanceId: string) =>
    setState((state) => {
      state.sketches[instanceId].paramIds.forEach((paramId) => {
        delete state.nodes[paramId]
        delete state.nodeValues[paramId]
      })

      delete state.sketches[instanceId]
    })
